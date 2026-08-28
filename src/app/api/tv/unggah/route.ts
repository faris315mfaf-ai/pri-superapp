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
import { ambilAkunTertaut, unggahVideo, ayrshareSiap } from "@/lib/ayrshare";
import { adalahPimred } from "@/lib/jabatan";
import { bolehUploadVideo } from "@/lib/tv-tim";
import { kirimKabar } from "@/lib/notifikasi";
import { pastikanFiturAktif } from "@/lib/fitur-server";

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
// puluhan detik. Bawaan Vercel (10 detik) akan memutusnya di tengah
// jalan — video telanjur terkirim tapi aplikasi melaporkan gagal.
export const maxDuration = 60;

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
        "kode, judul, judul_overlay, caption_asli, caption_platform, hasil_render_url, status, platform_terunggah, persetujuan, tugas_id, diupload_oleh_id",
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

    // Platform yang belum ditautkan di Ayrshare pasti ditolak. Lebih
    // baik dicegat di sini dengan pesan yang jelas daripada membakar
    // panggilan API untuk kepastian gagal.
    const { platformAktif } = await ambilAkunTertaut();
    const aktifSet = new Set(platformAktif.map((p) => p.toLowerCase()));
    const belumTertaut = diminta.filter((p) => !aktifSet.has(p));
    const siapKirim = diminta.filter((p) => aktifSet.has(p));

    if (siapKirim.length === 0) {
      throw Object.assign(
        new Error(
          `Belum ada akun yang tertaut untuk ${belumTertaut.join(", ")}. Tautkan dulu di dasbor Ayrshare.`,
        ),
        { status: 400 },
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

    const { idAyrshare, hasil } = await unggahVideo({
      videoUrl,
      caption,
      platforms: siapKirim,
      judulYoutube: video.judul_overlay || video.judul || "TV Rakyat",
      // Kunci anti-dobel: menekan Unggah dua kali untuk video yang sama
      // tidak akan memposting dua kali di sisi Ayrshare.
      idempotencyKey: `pri-${kode}`,
    });

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

    const berhasil = hasil.filter((h) => h.status !== "error" && h.id);
    const tautanUtama =
      berhasil.find((h) => h.platform === "instagram")?.postUrl ??
      berhasil.find((h) => h.postUrl)?.postUrl ??
      "";

    // Simpan hasilnya. Status hanya naik ke "SUDAH DIPROSES" bila ADA
    // yang benar-benar tayang — kalau semuanya ditolak, videonya masih
    // menunggu tindakan, bukan selesai.
    const perubahan: Record<string, unknown> = {
      ayrshare_hasil: hasil,
      diunggah_pada: new Date().toISOString(),
    };
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
