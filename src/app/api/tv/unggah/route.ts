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
import { bacaGalat, layakDiulang } from "@/lib/galat-unggah";
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
import { simpanSampul } from "@/lib/sampul";
import { daftarkanVideoUnggahan } from "@/lib/sinkron-konten-tv";
import { after } from "next/server";
import { catatAudit } from "@/lib/audit";
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

// Anggaran waktu TOTAL satu request (dtk) — sengaja di bawah maxDuration
// (300) supaya kode penyimpan hasil masih sempat jalan sebelum fungsi mati.
const ANGGARAN_TOTAL_MS = 285_000;
/** Batas tunggu satu percobaan ke Ayrshare (sama dgn bawaan unggahVideo). */
const TIMEOUT_PERCOBAAN_MS = 230_000;
/** Sisa anggaran yang dicadangkan untuk menyimpan hasil setelah Ayrshare menjawab. */
const CADANGAN_SIMPAN_MS = 15_000;
/**
 * Umur kunci proses `sedang_unggah_pada` sebelum dianggap basi: maxDuration
 * (300 dtk) + margin. Harus > waktu hidup terlama satu request.
 */
const KUNCI_BASI_MS = 6 * 60_000;
/** Mengulang hanya bila setelah jeda masih tersisa waktu segini. */
const SISA_MIN_ULANG_MS = 60_000;

/**
 * Unggah ke Ayrshare dengan SATU kali ulang untuk kegagalan sementara
 * (jaringan / 5xx) — HANYA bila anggaran waktu request masih cukup.
 * Dulu tiap percobaan boleh 230 dtk + jeda, total ±462 dtk > maxDuration
 * 300: fungsi mati di tengah ulangan sebelum status sempat disimpan.
 * Kini timeout tiap percobaan = min(230 dtk, sisa anggaran − cadangan).
 *
 * Ulangan aman dari dobel-posting karena opsi memakai idempotencyKey yang
 * sama. Yang TIDAK diulang: galat 4xx (permintaan salah — hasil pasti
 * sama) dan TIMEOUT (Ayrshare mungkin sudah membuat postingan; kita tak
 * punya id-nya untuk ditanyakan lewat statusPostingan, jadi mengulang
 * buta bisa menggandakan). Setelah timeout penuh sisa anggaran memang
 * tinggal ±55 dtk, jadi aturan sisa-minimal pun sudah menahannya.
 */
async function unggahDenganUlang(
  opsi: Parameters<typeof unggahVideo>[0],
  batasAkhir: number,
  maksUlang = 1,
): Promise<{ idAyrshare: string; hasil: HasilUnggahPlatform[] }> {
  let galatTerakhir: unknown;
  for (let coba = 0; coba <= maksUlang; coba++) {
    const timeoutMs = Math.min(
      TIMEOUT_PERCOBAAN_MS,
      batasAkhir - Date.now() - CADANGAN_SIMPAN_MS,
    );
    if (timeoutMs < 10_000) {
      // Anggaran habis sebelum sempat mencoba (langkah awal terlalu lama).
      throw galatTerakhir ?? new Error("Waktu permintaan habis sebelum video sempat diunggah. Coba lagi.");
    }
    try {
      return await unggahVideo({ ...opsi, timeoutMs });
    } catch (e) {
      galatTerakhir = e;
      const status = (e as { status?: number })?.status;
      // 4xx = permintaan salah → berhenti, lempar apa adanya.
      if (typeof status === "number" && status >= 400 && status < 500) throw e;
      // Timeout = nasib postingan tak diketahui → jangan diulang buta.
      if ((e as { timeout?: boolean })?.timeout) throw e;
      // Ulang hanya bila jatah ada DAN sisa waktu setelah jeda masih lega.
      if (coba >= maksUlang) break;
      if (batasAkhir - Date.now() - 2500 < SISA_MIN_ULANG_MS) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw galatTerakhir;
}

export async function POST(request: Request) {
  return bungkus(async () => {
    // Patokan anggaran waktu total request (lihat unggahDenganUlang).
    const mulai = Date.now();
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
      /** Sampul video base64 (jpg/png) — dipasang ke YT/IG/TikTok/FB. */
      sampulDataUrl?: string;
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

    // Susun caption bentuk objek: "default" dipakai platform yang
    // tidak punya caption khusus. Validasi murah ini SENGAJA di atas
    // perebutan kunci: dilempar setelah kunci direbut, kunci bocor dan
    // video terblokir sampai kunci basi.
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

    // ---- PAGAR ANTI-DOBEL LAPIS 2: kunci proses (fitur 1.20/9) ----
    // Dua permintaan bersamaan (klik ganda, dua admin) memperebutkan
    // satu kunci; yang kalah ditolak. Kunci basi (proses sebelumnya mati
    // di tengah jalan) boleh direbut. Umur basi = maxDuration (300 dtk) +
    // margin = 6 menit: satu unggahan bisa memakan 230 dtk, jadi batas
    // lama 2 menit membolehkan request kedua merebut kunci SAAT yang
    // pertama masih berjalan lalu memposting dobel.
    const batasBasi = new Date(Date.now() - KUNCI_BASI_MS).toISOString();
    // Stempel percobaan ini. Dipakai DUA kali: sebagai kunci proses, dan
    // sebagai pembeda kunci anti-dobel di bawah — lihat alasannya di sana.
    const stempelCoba = new Date().toISOString();
    const { data: kunciDapat } = await db
      .from("video_antrian")
      .update({ sedang_unggah_pada: stempelCoba })
      .eq("kode", kode)
      .or(`sedang_unggah_pada.is.null,sedang_unggah_pada.lt.${batasBasi}`)
      .select("kode");
    if (!kunciDapat || kunciDapat.length === 0) {
      throw Object.assign(
        new Error("Video ini sedang diunggah proses lain. Tunggu sebentar lalu periksa hasilnya."),
        { status: 409 },
      );
    }

    let idAyrshare: string;
    let hasil: HasilUnggahPlatform[];
    // KUNCI ANTI-DOBEL — perbaikan 15 Sep 2026.
    //
    // Dulu kuncinya `pri-<kode>-<platform>` saja: SAMA PERSIS setiap kali
    // tombol "Ulangi" ditekan untuk kumpulan platform yang sama. Ayrshare
    // mengenalinya sebagai permintaan kembar, jadi percobaan ULANG KEDUA
    // dan seterusnya tidak pernah benar-benar dikirim — tombolnya tampak
    // bekerja tapi tidak terjadi apa-apa. Itu bug yang terlihat di
    // produksi: video yang sama gagal berhari-hari di platform yang sama.
    //
    // Sekarang kuncinya memuat STEMPEL PERCOBAAN. Tiap percobaan baru =
    // permintaan baru yang sungguh dikirim; sementara perlindungan dari
    // dobel-posting tetap utuh lewat tiga lapis yang lain:
    //   1. platform yang SUDAH tayang dibuang dari daftar kirim (di atas),
    //   2. kunci proses (basi 6 menit > maxDuration) menahan klik ganda /
    //      dua admin bersamaan — karena kini cukup lama, request kedua tak
    //      mungkin berjalan selagi yang pertama hidup, jadi kunci Ayrshare
    //      yang berbeda per request tidak membuka celah dobel bersamaan,
    //   3. `unggahDenganUlang` mengulang sekali dengan kunci yang SAMA,
    //      sehingga gangguan jaringan di tengah tidak melahirkan dua post.
    // Stempel TETAP dipertahankan: tanpanya "Ulangi" yang sah setelah
    // gagal akan dikira kembar oleh Ayrshare dan tak pernah terkirim.
    const kunciDobel = `pri-${kode}-${siapKirim.slice().sort().join("_")}-${stempelCoba}`;
    try {
      // Sampul kustom (fitur 31 Agu 2026): dipasang ke YT/IG/TikTok/FB;
      // Threads & X tidak mendukung sampul. Tanpa sampul = perilaku lama.
      const sampulUrl = await simpanSampul(kode, body.sampulDataUrl);

      // Ulangi SEKALI bila gagal karena hal sementara (jaringan/5xx) dan
      // anggaran waktu masih lega; kunci sama jadi tak membuat post ganda.
      // Galat permintaan (4xx) dan timeout tidak diulang.
      ({ idAyrshare, hasil } = await unggahDenganUlang(
        {
          videoUrl,
          caption,
          platforms: siapKirim,
          judulYoutube: video.judul_overlay || video.judul || "TV Rakyat",
          thumbnailUrl: sampulUrl ?? undefined,
          // Kunci memuat daftar platform supaya percobaan ULANG untuk
          // subset yang gagal tetap dianggap permintaan baru.
          idempotencyKey: kunciDobel,
        },
        mulai + ANGGARAN_TOTAL_MS,
      ));
    } catch (e) {
      // Setelah TIMEOUT nasib postingan tak diketahui (mungkin masih
      // diproses/sudah tayang di Ayrshare): kunci sengaja DIBIARKAN sampai
      // basi supaya "Ulangi" langsung tidak memposting dobel. Galat lain
      // = pasti tak ada post → kunci dilepas agar bisa dicoba lagi.
      if (!(e as { timeout?: boolean })?.timeout) {
        await db
          .from("video_antrian")
          .update({ sedang_unggah_pada: null })
          .eq("kode", kode);
      }
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
    // samping apa pun. Dulu penyimpanan ini paling akhir, setelah banyak
    // await (chat, tugas_link, kabar): bila salah satunya melempar atau
    // fungsi mati, video sudah tayang tapi status/ayrshare_hasil tak
    // tersimpan dan kunci proses tak terlepas.
    let eSimpan: { message: string } | null = null;
    try {
      const { error } = await db.from("video_antrian").update(perubahan).eq("kode", kode);
      eSimpan = error;
    } catch (e) {
      eSimpan = { message: e instanceof Error ? e.message : String(e) };
    }
    if (eSimpan) {
      // Videonya SUDAH tayang; yang gagal cuma pencatatannya. Katakan
      // apa adanya alih-alih melaporkan unggahan gagal.
      console.error("[tv/unggah] simpan hasil:", eSimpan.message);
      // Upaya terakhir melepas kunci proses supaya tak menggantung.
      try {
        await db.from("video_antrian").update({ sedang_unggah_pada: null }).eq("kode", kode);
      } catch {
        // kunci akan basi sendiri
      }
    }

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
          berhasil: berhasil.map((h) => ({ platform: h.platform, url: h.postUrl ?? null })),
          gagal: hasil.filter((h) => h.status === "error").map((h) => h.platform),
        },
      },
    );
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
