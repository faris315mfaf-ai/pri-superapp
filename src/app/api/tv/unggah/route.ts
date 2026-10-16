// POST /api/tv/unggah — unggah video TV Rakyat ke sosmed akun TV Rakyat
// Official lewat profil upload-post Official (lib/official-up).
// Body: { kode, platforms: ["instagram", ...] }
// Balasan: { sukses, id_unggah, hasil: HasilUnggahPlatform[], berhasil,
//            total, link, catatan_simpan }
//
// Ini menggantikan "unggah" versi lama yang sebenarnya hanya animasi
// di layar: penghitung yang naik lalu berkata sukses, tanpa satu pun
// video benar-benar terkirim. Sekarang videonya betul-betul diposting,
// dan hasil per platform disimpan apa adanya (video_antrian.unggah_hasil)
// — termasuk yang ditolak.
//
// 16 Okt 2026: Ayrshare dihapus (akun ditangguhkan). Caption khusus tiap
// platform dikirim lewat `captionPer` upload-post dalam SATU permintaan;
// judul video menjadi judul YouTube/Facebook.
import { supabase } from "@/lib/supabase";
import { bacaGalat, layakDiulang } from "@/lib/galat-unggah";
import { pesanBagikanVideo } from "@/lib/format";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { ambilKunciUnggah, unggahVideoUp } from "@/lib/upload-post";
import { pastikanOfficialUp } from "@/lib/official-up";
import { bacaHasilUnggah, tayangAtauDiproses, type HasilUnggahPlatform } from "@/lib/unggah-hasil";
import { entriHasilUp, hasilPerPlatformUp } from "@/lib/jadwal-tayang";
import { adalahPimred } from "@/lib/jabatan";
import { bolehUploadVideo } from "@/lib/tv-tim";
import { kirimKabar } from "@/lib/notifikasi";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { retensiJamTv } from "@/lib/pengaturan-tv";
import { daftarkanVideoUnggahan } from "@/lib/sinkron-konten-tv";
import { after } from "next/server";
import { catatAudit } from "@/lib/audit";
import { akhiriAktivitas, mulaiAktivitas } from "@/lib/dunia";
import { siarkanTv } from "@/lib/tv-langsung";

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
// Unggah sinkron ke upload-post bisa memakan BEBERAPA MENIT (server mereka
// mengunduh video kita lalu mengunggahnya ke tiap platform; Reels IG +
// YouTube paling lambat). unggahVideoUp menunggu paling lama 180 dtk;
// 300 dtk memberi ruang menyimpan status ("SUDAH DIPROSES") setelahnya,
// supaya video yang tayang tidak tercatat "SIAP DITINJAU".
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
 * Umur kunci proses `sedang_unggah_pada` sebelum dianggap basi: maxDuration
 * (300 dtk) + margin. Harus > waktu hidup terlama satu request.
 */
const KUNCI_BASI_MS = 6 * 60_000;
/**
 * Galat AMBIGU (timeout / jaringan / 5xx): video mungkin sudah terkirim.
 * Kunci memori ditahan selama ini supaya "Ulangi" langsung tidak dobel.
 */
const TAHAN_AMBIGU_DETIK = 3 * 60;

const PESAN_SEDANG_UNGGAH = "Video ini sedang diunggah proses lain. Tunggu sebentar lalu periksa hasilnya.";

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

    // Profil upload-post Official + platform yang tertaut & sehat. Melempar
    // 503 (upload-post belum diatur) / 409 (Official belum ditautkan) dengan
    // pesan yang mengarahkan ke kartu "Tautkan ke upload-post".
    const official = await pastikanOfficialUp();

    // Ruang Bot (master): selama diposting ke akun Official, karakternya memasukkan surat ke kotak post.
    const tokenAkt = await mulaiAktivitas(pengguna.id, {
      jenis: "unggah_official",
      ringkasan: "Mengunggah ke akun TV Rakyat Official",
      detail: { akun: "TV Rakyat Official", platforms: diminta },
    });
    after(() => akhiriAktivitas(pengguna.id, tokenAkt));

    const db = supabase();
    const { data: video, error: eBaca } = await db
      .from("video_antrian")
      .select(
        "kode, judul, judul_overlay, caption_asli, caption_platform, hasil_render_url, status, platform_terunggah, persetujuan, tugas_id, diupload_oleh_id, unggah_hasil, thumbnail_url",
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
    // Platform yang SUDAH tayang (atau masih diproses) untuk video ini
    // dibuang dari daftar kirim, apa pun yang diminta klien. Dengan begitu
    // tombol Ulangi aman: hanya platform yang gagal yang dikirim ulang, dan
    // video tidak mungkin terposting dua kali di platform yang sama.
    const hasilLama = bacaHasilUnggah(video.unggah_hasil);
    const sudahTayang = new Set([
      ...((video.platform_terunggah ?? []) as string[]).map((p) => p.toLowerCase()),
      ...hasilLama
        .filter((h) => tayangAtauDiproses(h.status, h.id, h.postUrl))
        .map((h) => h.platform.toLowerCase()),
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

    // Platform yang belum ditautkan (atau izinnya kedaluwarsa) di profil
    // upload-post Official pasti ditolak. Lebih baik dicegat di sini dengan
    // pesan yang jelas daripada membakar panggilan API untuk kepastian gagal.
    const aktifSet = new Set(official.platform);
    const perluUlangSet = new Set(official.perluUlang);
    const belumTertaut = dimintaBersih.filter((p) => !aktifSet.has(p));
    const siapKirim = dimintaBersih.filter((p) => aktifSet.has(p));

    if (siapKirim.length === 0) {
      throw Object.assign(
        new Error(
          `Akun ${belumTertaut.join(", ")} TV Rakyat Official belum tertaut (atau perlu login ulang) di upload-post. Buka TV Rakyat → kartu "Tautkan ke upload-post" lalu tautkan akunnya.`,
        ),
        { status: 409 },
      );
    }

    // Caption per platform: caption khusus bila disunting admin, selain itu
    // caption utama. Dikirim lewat captionPer supaya TikTok/IG/Threads/X
    // memakai caption apa adanya (tanpa judul di depannya), sedangkan
    // YouTube/Facebook memakai judul video sebagai judul dan caption sebagai
    // deskripsi. Validasi murah ini SENGAJA di atas perebutan kunci:
    // dilempar setelah kunci direbut, kunci bocor dan video terblokir.
    const captionUtama = (video.caption_asli ?? "").trim();
    const khusus = (video.caption_platform ?? {}) as Record<string, string>;
    const captionPer: Record<string, string> = {};
    for (const p of siapKirim) {
      const teks = (khusus?.[p] ?? "").trim() || captionUtama;
      if (teks) captionPer[p] = teks.slice(0, BATAS_CAPTION[p] ?? 2200);
    }
    if (Object.keys(captionPer).length === 0) {
      throw Object.assign(new Error("Caption masih kosong."), { status: 400 });
    }
    const judulVideo = (video.judul_overlay || video.judul || "TV Rakyat").trim();

    // ---- PAGAR ANTI-DOBEL LAPIS 2: kunci proses (fitur 1.20/9) ----
    // (a) Kunci memori + Redis upload-post (ambilKunciUnggah) — pola yang
    //     sama dengan unggahan anggota; menahan klik ganda di proses ini.
    // (b) Kunci baris `sedang_unggah_pada` — menahan dua admin / dua proses.
    //     Kunci basi (proses sebelumnya mati di tengah jalan) boleh direbut;
    //     umur basi 6 menit > maxDuration, jadi request kedua tak mungkin
    //     berjalan selagi yang pertama hidup.
    const kunciProses = await ambilKunciUnggah(`tv-official:${kode}`, KUNCI_BASI_MS / 1000);
    if (!kunciProses) throw Object.assign(new Error(PESAN_SEDANG_UNGGAH), { status: 409 });

    const batasBasi = new Date(Date.now() - KUNCI_BASI_MS).toISOString();
    // Stempel percobaan ini: kunci baris DAN pembeda Idempotency-Key.
    const stempelCoba = new Date().toISOString();
    const { data: kunciDapat } = await db
      .from("video_antrian")
      .update({ sedang_unggah_pada: stempelCoba })
      .eq("kode", kode)
      .or(`sedang_unggah_pada.is.null,sedang_unggah_pada.lt.${batasBasi}`)
      .select("kode");
    if (!kunciDapat || kunciDapat.length === 0) {
      await kunciProses.lepas();
      throw Object.assign(new Error(PESAN_SEDANG_UNGGAH), { status: 409 });
    }

    // Idempotency-Key memuat STEMPEL PERCOBAAN (perbaikan 15 Sep 2026):
    // kunci yang sama persis tiap "Ulangi" membuat penyedia menganggap
    // percobaan ulang yang sah sebagai kiriman kembar dan tak pernah
    // mengirimnya. Perlindungan dobel tetap utuh lewat lapis 1 & 2 di atas;
    // POST ke upload-post TIDAK pernah diulang otomatis.
    const kunciDobel = `pri-${kode}-${siapKirim.slice().sort().join("_")}-${stempelCoba}`;
    let idUnggah: string;
    let hasil: HasilUnggahPlatform[];
    try {
      const balasan = await unggahVideoUp({
        profil: official.profil,
        videoUrl,
        judul: judulVideo,
        caption: captionUtama,
        platforms: siapKirim,
        captionPer,
        kunciIdempotensi: kunciDobel,
      });
      idUnggah = balasan.request_id ?? "";
      const peta = hasilPerPlatformUp(balasan.mentah);
      const pesanTolak = String(
        (balasan.mentah as { message?: string; error?: string }).message ??
          (balasan.mentah as { error?: string }).error ??
          "",
      ).slice(0, 300);
      hasil = siapKirim.map((p) => {
        const r = peta.get(p);
        // Ditolak utuh tanpa rincian per platform.
        if (!r && !balasan.sukses) {
          return { platform: p, status: "error", id: "", postUrl: "", pesan: pesanTolak || "Ditolak upload-post." };
        }
        return entriHasilUp(p, r, "Diterima upload-post, sedang diproses.");
      });
    } catch (e) {
      // Galat AMBIGU (timeout 504 / jaringan 502 / 5xx / tanpa status):
      // video mungkin sudah terkirim — kunci baris DIBIARKAN sampai basi
      // dan kunci memori ditahan, supaya "Ulangi" langsung tidak memposting
      // dobel. Penolakan jelas (4xx) = pasti tak ada post → kunci dilepas.
      const st = Number((e as { status?: number })?.status);
      const ambigu = !Number.isFinite(st) || st >= 500;
      if (!ambigu) {
        await db
          .from("video_antrian")
          .update({ sedang_unggah_pada: null })
          .eq("kode", kode);
      }
      await kunciProses.lepas(ambigu ? TAHAN_AMBIGU_DETIK : 0);
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
        pesan: perluUlangSet.has(p)
          ? "Izin akun ini kedaluwarsa di upload-post — tautkan ulang lewat kartu \"Tautkan ke upload-post\"."
          : "Akun belum ditautkan ke profil upload-post TV Rakyat Official.",
      });
    }

    const berhasil = hasil.filter((h) => tayangAtauDiproses(h.status, h.id, h.postUrl));
    const tautanUtama =
      berhasil.find((h) => h.platform === "instagram" && h.postUrl)?.postUrl ??
      berhasil.find((h) => h.postUrl)?.postUrl ??
      "";

    // Simpan hasilnya — DIGABUNG dengan hasil lama, bukan menimpa:
    // pada percobaan ulang, entri sukses sebelumnya harus tetap ada
    // (fitur 1.20/9). Entri platform yang dikirim ulang digantikan
    // hasil terbarunya.
    const platformBaru = new Set(hasil.map((h) => h.platform.toLowerCase()));
    const hasilGabung = [
      ...hasilLama.filter((h) => !platformBaru.has(h.platform.toLowerCase())),
      ...hasil,
    ];
    const perubahan: Record<string, unknown> = {
      unggah_hasil: hasilGabung,
      diunggah_pada: new Date().toISOString(),
      // Riwayat (sql/65): yang terakhir memposting; percobaan baru membuka
      // lagi penanda "sudah ditangani manual".
      diposting_oleh: pengguna.nama,
      diposting_oleh_id: Number(pengguna.id),
      gagal_ditangani_pada: null,
      gagal_ditangani_oleh: null,
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

    // SIMPAN SEKARANG, tepat setelah hasil unggah didapat — sebelum efek
    // samping apa pun. Bila salah satu efek samping melempar atau fungsi
    // mati, status/unggah_hasil sudah tersimpan dan kunci proses terlepas.
    let eSimpan: { message: string } | null = null;
    try {
      const { error } = await db.from("video_antrian").update(perubahan).eq("kode", kode);
      eSimpan = error;
    } catch (e) {
      eSimpan = { message: e instanceof Error ? e.message : String(e) };
    }
    if (eSimpan) {
      // Videonya SUDAH terkirim; yang gagal cuma pencatatannya. Katakan
      // apa adanya alih-alih melaporkan unggahan gagal.
      console.error("[tv/unggah] simpan hasil:", eSimpan.message);
      // Upaya terakhir melepas kunci proses supaya tak menggantung.
      try {
        await db.from("video_antrian").update({ sedang_unggah_pada: null }).eq("kode", kode);
      } catch {
        // kunci akan basi sendiri
      }
    }
    // Hasil tak tersimpan = lapis 1 buta terhadap unggahan ini: tahan kunci
    // memori supaya "Ulangi" langsung tidak memposting dobel.
    await kunciProses.lepas(eSimpan ? TAHAN_AMBIGU_DETIK : 0);

    // ---- Efek samping sekunder: di latar (after), tiap langkah dibungkus
    // try/catch sendiri — kegagalan satu langkah tak menggagalkan respons
    // maupun langkah lain. Urutan logika bisnis dipertahankan.
    const judulTampil = video.judul_overlay || video.judul || kode;
    const gagalDaftar = hasil.filter((h) => h.status === "error");
    after(async () => {
      if (berhasil.length > 0) {
        // 0. Siaran ke ruang chat grup TV Rakyat (spek 1.18/1.3).
        // (siarkanKeRuangChat sudah menelan galatnya sendiri.)
        await siarkanKeRuangChat(
          Number(pengguna.id),
          judulTampil,
          berhasil.map((h) => ({ platform: h.platform, url: h.postUrl })),
        );

        // 1. Kewajiban gugur: tugas link yang tertaut jadi SELESAI.
        if (video.tugas_id) {
          try {
            await db
              .from("tugas_link")
              .update({
                status: "selesai",
                video_kode: kode,
                selesai_pada: new Date().toISOString(),
              })
              .eq("id", Number(video.tugas_id));
          } catch (e) {
            console.error("[tv/unggah] tugas_link:", e);
          }
          if (video.diupload_oleh_id) {
            try {
              await kirimKabar({
                judul: "Tugas video Anda selesai \u2705",
                isi: `"${judulTampil}" sudah tayang di sosmed TV Rakyat. Kewajiban tugas link Anda gugur.`,
                kategori: "sukses",
                jenis_peristiwa: "tugas_link",
                untukUserIds: [Number(video.diupload_oleh_id)],
              });
            } catch (e) {
              console.error("[tv/unggah] kabar tugas:", e);
            }
          }
        }

        // 2. (DIHAPUS 12 Sep 2026) Siaran "Video baru di TV Rakyat!" ke
        //    seluruh anggota. Video tetap masuk kanal Konten & kewajiban
        //    komen di bawah — hanya notifikasinya yang tidak lagi dikirim.

        // 3. Daftarkan SEKETIKA ke kanal konten + wajib-komen (feed_konten
        // + postingan), tanpa menunggu sinkron berkala. Komentar diperiksa
        // pada sinkron berkala.
        try {
          await daftarkanVideoUnggahan({
            posting: berhasil
              .filter((h) => h.postUrl)
              .map((h) => ({ platform: h.platform, id: h.id, postUrl: h.postUrl })),
            caption: video.caption_asli ?? "",
            thumbnailUrl: video.thumbnail_url ?? "",
          });
        } catch (e) {
          console.error("[tv/unggah] daftarkan video:", e);
        }
      }

      // ---- Pemberitahuan kegagalan per platform (fitur 1.20/9) ----
      // Wajib terlihat DI MANA video gagal: notifikasi menyebut platform
      // dan alasannya, plus arahan ke tombol Ulangi di Riwayat Video.
      if (gagalDaftar.length > 0) {
        try {
          // Notifikasi memakai keterangan Bahasa Indonesia, bukan kalimat
          // mentah platform yang dipotong di tengah — yang dibaca orang di
          // notifikasi HP tidak boleh berupa penggalan kalimat Inggris.
          const rincian = gagalDaftar
            .map((h) => `${h.platform} (${bacaGalat(h.platform, h.pesan ?? "").ringkas})`)
            .join(", ");
          const semuaPutusan = layakDiulang(gagalDaftar.map((h) => ({ platform: h.platform, pesan: h.pesan ?? "" })));
          const ajakan = semuaPutusan.bolehUlang
            ? "Buka TV Rakyat → Riwayat Video → tombol Ulangi untuk mencoba lagi."
            : semuaPutusan.alasan;
          const penerima = Array.from(
            new Set(
              [Number(pengguna.id), Number(video.diupload_oleh_id ?? 0)].filter(Boolean),
            ),
          );
          await kirimKabar({
            judul: `⚠ Video gagal tayang di ${gagalDaftar.length} platform`,
            isi: `"${judulTampil}" gagal di: ${rincian}. ${ajakan}`,
            kategori: "peringatan",
            jenis_peristiwa: "tv_gagal",
            untukUserIds: penerima,
          });
        } catch (e) {
          console.error("[tv/unggah] kabar gagal:", e);
        }
      }
    });

    siarkanTv("posting");
    catatAudit(
      pengguna.id,
      "unggah_official",
      `Mengunggah "${video.judul_overlay || video.judul || kode}" ke akun Official (${berhasil.length}/${hasil.length} sosmed)`,
      {
        request,
        detail: {
          kode,
          judul: video.judul_overlay || video.judul || "",
          akun: "TV Rakyat Official",
          platforms: diminta,
          berhasil: berhasil.map((h) => ({ platform: h.platform, url: h.postUrl ?? null })),
          gagal: hasil.filter((h) => h.status === "error").map((h) => h.platform),
          id_unggah: idUnggah || null,
        },
      },
    );
    return {
      sukses: berhasil.length > 0,
      id_unggah: idUnggah,
      hasil,
      berhasil: berhasil.length,
      total: hasil.length,
      link: tautanUtama,
      catatan_simpan: eSimpan ? "Video tayang, tetapi status di aplikasi gagal diperbarui." : null,
    };
  });
}
