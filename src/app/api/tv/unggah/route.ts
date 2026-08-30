// POST /api/tv/unggah — unggah video TV Rakyat ke sosmed lewat Ayrshare
// Body: { kode, platforms: ["instagram", ...] }
//
// Ini menggantikan "unggah" versi lama yang sebenarnya hanya animasi
// di layar: penghitung yang naik lalu berkata sukses, tanpa satu pun
// video benar-benar terkirim. Sekarang videonya betul-betul diposting,
// dan hasil per platform disimpan apa adanya — termasuk yang ditolak.
//
// Caption memakai bentuk objek Ayrshare ({default, instagram, ...})
// sehingga caption khusus tiap platform yang disunting admin terpakai
// dalam SATU permintaan, bukan mengunggah videonya berkali-kali.
import { supabase } from "@/lib/supabase";
import { pesanBagikanVideo } from "@/lib/format";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehProsesVideo } from "@/types";
import {
  ambilAkunTertaut,
  unggahVideo,
  ayrshareSiap,
  type HasilUnggahPlatform,
} from "@/lib/ayrshare";
import { adalahPimred } from "@/lib/jabatan";
import { bolehUploadVideo } from "@/lib/tv-tim";
import { kirimKabar } from "@/lib/notifikasi";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { retensiJamTv } from "@/lib/pengaturan-tv";
import { tayangAtauDiproses } from "@/lib/ayrshare-status";
import { daftarkanVideoUnggahan } from "@/lib/sinkron-konten-tv";
import { after } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Siarkan video yang baru tayang ke RUANG CHAT grup Divisi TV Rakyat
 * (spek 1.18/1.3) — format pesan sama dgn tombol Bagikan (semua
 * platform + "Belum diupload"), atas nama TV Rakyat Official.
 *
 * - Dilewati bila toggle tvr_auto_broadcast dimatikan Pimred.
 * - TIDAK melempar: kegagalan siaran tidak boleh menggagalkan unggah
 *   yang sudah sukses. Tidak ada loop: menulis chat_pesan_grup tidak
 *   memicu apa pun (tidak ada trigger di tabel itu).
 */
async function siarkanKeRuangChat(
  pengirimId: number,
  judul: string,
  tautan: { platform: string; url: string }[],
): Promise<void> {
  try {
    const db = supabase();
    const { data: setelan } = await db
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", "tvr_auto_broadcast")
      .maybeSingle();
    if (setelan?.nilai === "false") return; // dimatikan Pimred

    await db.from("chat_pesan_grup").insert({
      divisi: "Divisi TV Rakyat",
      pengirim_id: pengirimId,
      isi: pesanBagikanVideo(judul, tautan),
    });
  } catch (e) {
    console.error("[tv/unggah] siaran ruang chat:", e);
  }
}
// Mengunggah video ke Instagram/YouTube lewat Ayrshare bisa memakan
// BEBERAPA MENIT (Ayrshare mengunduh video kita lalu mengunggahnya ke
// tiap platform; Reels IG + YouTube paling lambat). Bila fungsi Vercel
// mati sebelum Ayrshare menjawab, video TELANJUR tayang tapi status di
// aplikasi berhenti di "SIAP DITINJAU" — persis bug yang dilaporkan.
//
// Dulu nilainya 60 dtk padahal batas tunggu Ayrshare 120 dtk: begitu
// posting lewat 60 dtk, Vercel membunuh fungsi SEBELUM kode penyimpan
// status ("SUDAH DIPROSES") sempat jalan, DAN sebelum catch pelepas
// kunci jalan — jadi videonya tayang tapi aplikasi bilang gagal/ditinjau.
// Kini 300 dtk (batas paket) > 230 dtk batas tunggu Ayrshare, jadi
// unggahan lambat pun selesai lalu statusnya benar-benar tersimpan.
export const maxDuration = 300;

const PLATFORM_DIKENAL = new Set([
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "twitter",
  "threads",
]);

/** Batas caption resmi tiap platform — sama dengan yang dijaga layar pratinjau */
const BATAS_CAPTION: Record<string, number> = {
  instagram: 2200,
  tiktok: 2200,
  youtube: 5000,
  facebook: 63206,
  twitter: 25000,
  threads: 500,
};

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/**
 * Unggah ke Ayrshare dengan SATU kali ulang untuk kegagalan sementara
 * (timeout / jaringan / 5xx). Ulangan aman dari dobel-posting karena
 * opsi memakai idempotencyKey yang sama — Ayrshare mengenali permintaan
 * kembar dan tidak memposting dua kali. Galat 4xx (permintaan salah,
 * mis. caption ditolak) TIDAK diulang: mengulang hanya membuang waktu
 * dan hasilnya pasti sama.
 */
async function unggahDenganUlang(
  opsi: Parameters<typeof unggahVideo>[0],
  maksUlang = 1,
): Promise<{ idAyrshare: string; hasil: HasilUnggahPlatform[] }> {
  let galatTerakhir: unknown;
  for (let coba = 0; coba <= maksUlang; coba++) {
    try {
      return await unggahVideo(opsi);
    } catch (e) {
      galatTerakhir = e;
      const status = (e as { status?: number })?.status;
      // 4xx = permintaan salah → berhenti, lempar apa adanya.
      if (typeof status === "number" && status >= 400 && status < 500) throw e;
      // Masih ada jatah ulang → beri jeda singkat lalu coba lagi.
      if (coba < maksUlang) await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw galatTerakhir;
}

export async function POST(request: Request) {
  return bungkus(async () => {
    // Memposting atas nama akun partai adalah tindakan publik yang
    // tidak bisa ditarik kembali — dijaga di server, bukan sekadar
    // dengan menyembunyikan tombolnya.
    const pengguna = await userDariToken(tokenDari(request));
    if (!pengguna) throw Object.assign(new Error("Sesi tidak berlaku. Masuk lagi."), { status: 401 });
    if (!(await bolehUploadVideo(pengguna))) {
      throw Object.assign(
        new Error("Anda belum ditunjuk Pimpinan Redaksi untuk mengunggah video."),
        { status: 403 },
      );
    }
    await pastikanFiturAktif(
      pengguna,
      "tv.upload",
      "Unggah video ke sosmed sedang dimatikan untuk peran Anda.",
    );
    if (!ayrshareSiap()) {
      throw Object.assign(
        new Error("Ayrshare belum tersambung. Isi AYRSHARE_API_KEY di pengaturan lingkungan."),
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      kode?: string;
      platforms?: string[];
    };
    const kode = (body.kode ?? "").trim();
    if (!kode) throw Object.assign(new Error("Video tidak disebutkan."), { status: 400 });

    const diminta = (body.platforms ?? [])
      .map((p) => String(p ?? "").toLowerCase())
      .filter((p) => PLATFORM_DIKENAL.has(p));
    if (diminta.length === 0) {
      throw Object.assign(new Error("Pilih minimal satu platform tujuan."), { status: 400 });
    }

    const db = supabase();
    const { data: video, error: eBaca } = await db
      .from("video_antrian")
      .select(
        "kode, judul, judul_overlay, caption_asli, caption_platform, hasil_render_url, status, platform_terunggah, persetujuan, tugas_id, diupload_oleh_id, ayrshare_hasil, thumbnail_url",
      )
      .eq("kode", kode)
      .maybeSingle();

    if (eBaca) {
      console.error("[tv/unggah] baca video:", eBaca.message);
      throw new Error("Gagal membaca data video.");
    }
    if (!video) throw Object.assign(new Error("Video tidak ditemukan."), { status: 404 });

    // Hirarki TV Rakyat: hanya video yang SUDAH disetujui Pimpinan
    // Redaksi yang boleh tayang. Pimred sendiri (dan master) boleh
    // langsung — unggahannya sekaligus dianggap persetujuan.
    const pimred = adalahPimred(pengguna);
    if (!pimred && video.persetujuan !== "disetujui") {
      throw Object.assign(
        new Error(
          video.persetujuan === "ditolak"
            ? "Video ini DITOLAK Pimpinan Redaksi dan tidak boleh diunggah."
            : "Video ini belum disetujui Pimpinan Redaksi. Minta persetujuan dulu sebelum mengunggah.",
        ),
        { status: 403 },
      );
    }

    const videoUrl = (video.hasil_render_url ?? "").trim();
    if (!videoUrl) {
      throw Object.assign(
        new Error("Video belum selesai diproses, jadi belum ada berkas yang bisa diunggah."),
        { status: 400 },
      );
    }

    // ---- PAGAR ANTI-DOBEL LAPIS 1 (fitur 1.20/9) ----
    // Platform yang SUDAH tayang untuk video ini dibuang dari daftar
    // kirim, apa pun yang diminta klien. Dengan begitu tombol Ulangi
    // aman: hanya platform yang gagal yang dikirim ulang, dan video
    // tidak mungkin terposting dua kali di platform yang sama.
    const hasilLama = (Array.isArray(video.ayrshare_hasil) ? video.ayrshare_hasil : []) as {
      platform?: string;
      status?: string;
      id?: string;
      postUrl?: string;
    }[];
    const sudahTayang = new Set([
      ...((video.platform_terunggah ?? []) as string[]).map((p) => p.toLowerCase()),
      ...hasilLama
        .filter((h) => tayangAtauDiproses(h.status, h.id, h.postUrl))
        .map((h) => String(h.platform ?? "").toLowerCase()),
    ]);
    const dobel = diminta.filter((p) => sudahTayang.has(p));
    const dimintaBersih = diminta.filter((p) => !sudahTayang.has(p));
    if (dimintaBersih.length === 0) {
      throw Object.assign(
        new Error(
          `Video ini SUDAH tayang di ${dobel.join(", ")} — tidak akan diunggah dua kali.`,
        ),
        { status: 409 },
      );
    }

    // Platform yang belum ditautkan di Ayrshare pasti ditolak. Lebih
    // baik dicegat di sini dengan pesan yang jelas daripada membakar
    // panggilan API untuk kepastian gagal.
    const { platformAktif } = await ambilAkunTertaut();
    const aktifSet = new Set(platformAktif.map((p) => p.toLowerCase()));
    const belumTertaut = dimintaBersih.filter((p) => !aktifSet.has(p));
    const siapKirim = dimintaBersih.filter((p) => aktifSet.has(p));

    if (siapKirim.length === 0) {
      throw Object.assign(
        new Error(
          `Belum ada akun yang tertaut untuk ${belumTertaut.join(", ")}. Tautkan dulu di dasbor Ayrshare.`,
        ),
        { status: 400 },
      );
    }

    // ---- PAGAR ANTI-DOBEL LAPIS 2: kunci proses (fitur 1.20/9) ----
    // Dua permintaan bersamaan (klik ganda, dua admin) memperebutkan
    // satu kunci; yang kalah ditolak. Kunci basi (>2 menit — proses
    // sebelumnya mati di tengah jalan) boleh direbut.
    const batasBasi = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: kunciDapat } = await db
      .from("video_antrian")
      .update({ sedang_unggah_pada: new Date().toISOString() })
      .eq("kode", kode)
      .or(`sedang_unggah_pada.is.null,sedang_unggah_pada.lt.${batasBasi}`)
      .select("kode");
    if (!kunciDapat || kunciDapat.length === 0) {
      throw Object.assign(
        new Error("Video ini sedang diunggah proses lain. Tunggu sebentar lalu periksa hasilnya."),
        { status: 409 },
      );
    }

    // Susun caption bentuk objek: "default" dipakai platform yang
    // tidak punya caption khusus.
    const captionUtama = (video.caption_asli ?? "").trim();
    const khusus = (video.caption_platform ?? {}) as Record<string, string>;
    const caption: Record<string, string> = { default: captionUtama };
    for (const p of siapKirim) {
      const teks = (khusus?.[p] ?? "").trim();
      if (teks) caption[p] = teks.slice(0, BATAS_CAPTION[p] ?? 2200);
    }
    if (!captionUtama && Object.keys(caption).length === 1) {
      throw Object.assign(new Error("Caption masih kosong."), { status: 400 });
    }

    let idAyrshare: string;
    let hasil: HasilUnggahPlatform[];
    // Kunci anti-dobel dipakai BAIK untuk percobaan pertama maupun ulang:
    // sama persis, sehingga Ayrshare tidak memposting dua kali walau kita
    // memanggilnya lagi setelah gangguan sementara.
    const kunciDobel = `pri-${kode}-${siapKirim.slice().sort().join("_")}`;
    try {
      // Ulangi SEKALI bila gagal karena hal sementara (jaringan/timeout/
      // 5xx). Karena idempotencyKey sama, ulangan ini AMAN — tidak akan
      // membuat postingan ganda. Galat permintaan (4xx: caption salah,
      // dsb.) tidak diulang karena mengulang tak akan menolong.
      ({ idAyrshare, hasil } = await unggahDenganUlang({
        videoUrl,
        caption,
        platforms: siapKirim,
        judulYoutube: video.judul_overlay || video.judul || "TV Rakyat",
        // Kunci memuat daftar platform supaya percobaan ULANG untuk
        // subset yang gagal tetap dianggap permintaan baru.
        idempotencyKey: kunciDobel,
      }));
    } catch (e) {
      // Kunci proses dilepas supaya percobaan berikutnya tidak harus
      // menunggu kunci basi 2 menit.
      await db
        .from("video_antrian")
        .update({ sedang_unggah_pada: null })
        .eq("kode", kode);
      throw e;
    }

    // Gabungkan platform yang belum tertaut sebagai kegagalan yang jujur,
    // supaya admin melihat semua yang dipilihnya.
    for (const p of belumTertaut) {
      hasil.push({
        platform: p,
        status: "error",
        id: "",
        postUrl: "",
        pesan: "Akun belum ditautkan di Ayrshare.",
      });
    }

    const berhasil = hasil.filter((h) => tayangAtauDiproses(h.status, h.id, h.postUrl));
    const tautanUtama =
      berhasil.find((h) => h.platform === "instagram")?.postUrl ??
      berhasil.find((h) => h.postUrl)?.postUrl ??
      "";

    // Simpan hasilnya — DIGABUNG dengan hasil lama, bukan menimpa:
    // pada percobaan ulang, entri sukses sebelumnya harus tetap ada
    // (fitur 1.20/9). Entri platform yang dikirim ulang digantikan
    // hasil terbarunya.
    const platformBaru = new Set(hasil.map((h) => h.platform.toLowerCase()));
    const hasilGabung = [
      ...hasilLama.filter(
        (h) => !platformBaru.has(String(h.platform ?? "").toLowerCase()),
      ),
      ...hasil,
    ];
    const perubahan: Record<string, unknown> = {
      ayrshare_hasil: hasilGabung,
      diunggah_pada: new Date().toISOString(),
      // Kunci proses dilepas bersama penyimpanan hasil (fitur 1.20/9).
      sedang_unggah_pada: null,
    };
    if (berhasil.length > 0) {
      // Umur tayang di aplikasi (fitur 1.20/8, diatur Pimred 1-24 jam):
      // lewat ini embed hilang dari Konten/Beranda dan berkas video
      // dibersihkan penjaga tanpa-cron. Postingan sosmed tidak disentuh.
      perubahan.hapus_media_pada = new Date(
        Date.now() + (await retensiJamTv()) * 3600_000,
      ).toISOString();
    }
    if (berhasil.length > 0) {
      const sebelumnya = (video.platform_terunggah ?? []) as string[];
      perubahan.platform_terunggah = Array.from(
        new Set([...sebelumnya, ...berhasil.map((h) => h.platform)]),
      );
      perubahan.status = "SUDAH DIPROSES";
      if (tautanUtama) perubahan.link_instagram = tautanUtama;
      // Pimred yang mengunggah langsung = persetujuan tersirat, dicatat
      // atas namanya supaya jejaknya tetap ada.
      if (pimred && video.persetujuan !== "disetujui") {
        perubahan.persetujuan = "disetujui";
        perubahan.persetujuan_oleh = pengguna.nama;
        perubahan.persetujuan_pada = new Date().toISOString();
      }
    }

    // ---- Pasca-posting (hanya bila ADA yang benar-benar tayang) ----
    if (berhasil.length > 0) {
      const judulTampil = video.judul_overlay || video.judul || kode;

      // 0. Siaran ke ruang chat grup TV Rakyat (spek 1.18/1.3).
      await siarkanKeRuangChat(
        Number(pengguna.id),
        judulTampil,
        berhasil.map((h) => ({ platform: h.platform, url: h.postUrl })),
      );

      // 1. Kewajiban gugur: tugas link yang tertaut jadi SELESAI.
      if (video.tugas_id) {
        await db
          .from("tugas_link")
          .update({
            status: "selesai",
            video_kode: kode,
            selesai_pada: new Date().toISOString(),
          })
          .eq("id", Number(video.tugas_id));
        if (video.diupload_oleh_id) {
          await kirimKabar({
            judul: "Tugas video Anda selesai \u2705",
            isi: `"${judulTampil}" sudah tayang di sosmed TV Rakyat. Kewajiban tugas link Anda gugur.`,
            kategori: "sukses",
            jenis_peristiwa: "tugas_link",
            untukUserIds: [Number(video.diupload_oleh_id)],
          });
        }
      }

      // 2. Siaran ke SEMUA anggota: ada video baru + tugas komen & share.
      await kirimKabar({
        judul: "\ud83c\udfac Video baru di TV Rakyat!",
        isi: `"${judulTampil}" baru tayang. Tugas Anda: beri komentar dan bagikan ke grup WhatsApp \u2014 buka Beranda untuk tombolnya.`,
        kategori: "info",
        jenis_peristiwa: "tv_publik",
      });

      // 3. Daftarkan SEKETIKA ke kanal konten + wajib-komen (feed_konten +
      // postingan), tanpa menunggu sinkron berkala. Di latar (after) agar
      // tak menunda respons. Komentar diperiksa pada sinkron berkala.
      after(() =>
        daftarkanVideoUnggahan({
          posting: berhasil
            .filter((h) => h.postUrl)
            .map((h) => ({ platform: h.platform, id: h.id, postUrl: h.postUrl })),
          caption: video.caption_asli ?? "",
          thumbnailUrl: video.thumbnail_url ?? "",
        }),
      );
    }

    // ---- Pemberitahuan kegagalan per platform (fitur 1.20/9) ----
    // Wajib terlihat DI MANA video gagal: notifikasi menyebut platform
    // dan alasannya, plus arahan ke tombol Ulangi di Riwayat Video.
    const gagalDaftar = hasil.filter((h) => h.status === "error");
    if (gagalDaftar.length > 0) {
      const rincian = gagalDaftar
        .map((h) => `${h.platform}${h.pesan ? ` (${h.pesan.slice(0, 80)})` : ""}`)
        .join(", ");
      const penerima = Array.from(
        new Set(
          [Number(pengguna.id), Number(video.diupload_oleh_id ?? 0)].filter(Boolean),
        ),
      );
      await kirimKabar({
        judul: `⚠ Video gagal tayang di ${gagalDaftar.length} platform`,
        isi: `"${video.judul_overlay || video.judul || kode}" gagal di: ${rincian}. Buka TV Rakyat → Riwayat Video → tombol Ulangi untuk mencoba lagi.`,
        kategori: "peringatan",
        jenis_peristiwa: "tv_gagal",
        untukUserIds: penerima,
      });
    }

    const { error: eSimpan } = await db
      .from("video_antrian")
      .update(perubahan)
      .eq("kode", kode);
    if (eSimpan) {
      // Videonya SUDAH tayang; yang gagal cuma pencatatannya. Katakan
      // apa adanya alih-alih melaporkan unggahan gagal.
      console.error("[tv/unggah] simpan hasil:", eSimpan.message);
    }

    return {
      sukses: berhasil.length > 0,
      id_ayrshare: idAyrshare,
      hasil,
      berhasil: berhasil.length,
      total: hasil.length,
      link: tautanUtama,
      catatan_simpan: eSimpan ? "Video tayang, tetapi status di aplikasi gagal diperbarui." : null,
    };
  });
}
