// ============================================================
// Sinkronisasi konten TV Rakyat dari Ayrshare (KHUSUS SISI SERVER).
//
// Dua pemicu OTOMATIS (tanpa cron), memakai mesin lib/analisis-ayrshare:
//
// 1. BERKALA — sinkronKontenTvTerjadwal(): menumpang after() di /api/sesi
//    (dibuka tiap orang membuka aplikasi). Diklaim ATOMIK maksimal sekali
//    per jendela (bawaan 30 menit, kunci pengaturan_sistem). Menarik
//    postingan terbaru semua akun resmi → isi feed_konten + daftar
//    `postingan` (wajib komen) + cek komentar (rekap). Menangkap juga
//    postingan yang diposting langsung di luar aplikasi.
//
// 2. SAAT UNGGAH — daftarkanVideoUnggahan(): dipanggil setelah /api/tv/unggah
//    berhasil. Mendaftarkan video yang BARU diposting ke feed + `postingan`
//    SEKETIKA (tanpa menunggu jendela berkala, tanpa cek komentar — memang
//    belum ada komentar). Komentarnya diperiksa pada sinkron berkala.
// ============================================================
import { supabase } from "@/lib/supabase";
import { ambilAkunTertaut, ayrshareSiap } from "@/lib/ayrshare";
import {
  idPostinganKanonik,
  jalankanAnalisisAyrshare,
  periodeHariIni,
} from "@/lib/analisis-ayrshare";

const KUNCI_KLAIM = "sinkron_konten_bucket";
const KUNCI_INTERVAL = "sinkron_konten_interval_menit";
const INTERVAL_BAWAAN = 30;
const INTERVAL_MIN = 10;

async function bacaIntervalMenit(db: ReturnType<typeof supabase>): Promise<number> {
  const { data } = await db
    .from("pengaturan_sistem")
    .select("nilai")
    .eq("kunci", KUNCI_INTERVAL)
    .maybeSingle();
  const n = Number(data?.nilai ?? INTERVAL_BAWAAN);
  return Number.isFinite(n) && n >= INTERVAL_MIN ? Math.floor(n) : INTERVAL_BAWAAN;
}

// Cache nilai interval 5 menit + bucket yang SUDAH beres menurut
// instance ini (1 Sep 2026 — pemangkasan beban Supabase).
let intervalCache: { nilai: number; pada: number } | null = null;
let bucketSelesaiInstance = "";

async function bacaIntervalMenitCache(db: ReturnType<typeof supabase>): Promise<number> {
  if (intervalCache && Date.now() - intervalCache.pada < 5 * 60_000) {
    return intervalCache.nilai;
  }
  const nilai = await bacaIntervalMenit(db);
  intervalCache = { nilai, pada: Date.now() };
  return nilai;
}

/**
 * Sinkron BERKALA. Maksimal sekali per jendela: hanya request yang
 * berhasil mengubah nilai klaim ke "bucket" jendela sekarang yang jalan,
 * jadi dua pembukaan aplikasi berbarengan tak menjalankan dobel.
 * TIDAK melempar — gagalnya tak boleh mengganggu pembukaan aplikasi.
 */
export async function sinkronKontenTvTerjadwal(): Promise<void> {
  try {
    if (!ayrshareSiap()) return;
    // Hubungan pendek per-instance (1 Sep 2026 — pemangkasan beban
    // Supabase): /api/sesi dipanggil sangat sering; tanpa ini TIAP
    // panggilan = 1 baca interval + 1 tulis klaim ke pengaturan_sistem.
    // Instance yang sudah tahu jendela ini beres langsung pulang.
    const db = supabase();
    const intervalMenit = await bacaIntervalMenitCache(db);
    const bucket = String(Math.floor(Date.now() / (intervalMenit * 60_000)));
    if (bucket === bucketSelesaiInstance) return;

    // Pastikan baris klaim ada (tanpa menimpa nilainya), lalu klaim atomik.
    await db
      .from("pengaturan_sistem")
      .upsert({ kunci: KUNCI_KLAIM, nilai: "" }, { onConflict: "kunci", ignoreDuplicates: true });
    const { data: klaim } = await db
      .from("pengaturan_sistem")
      .update({ nilai: bucket })
      .eq("kunci", KUNCI_KLAIM)
      .neq("nilai", bucket)
      .select("kunci");
    // Klaim gagal ATAU menang — dua-duanya berarti jendela ini beres
    // bagi instance ini; jangan sentuh database lagi sampai jendela baru.
    bucketSelesaiInstance = bucket;
    if (!klaim || klaim.length === 0) return; // jendela ini sudah dikerjakan

    // Bila pekerja cron sedang memegang lease, jalur ini mengalah
    // (dua pembaca Ayrshare bersamaan hanya memicu rate-limit).
    if (await leaseAktif(db)) {
      await lepasKlaim(db, KUNCI_KLAIM, bucket);
      bucketSelesaiInstance = "";
      return;
    }
    // Mesin melempar 409 bila tak ada akun tertaut — itu normal (belum
    // ditautkan), cukup dicatat, bukan alasan menggagalkan apa pun.
    try {
      await jalankanAnalisisAyrshare({ olehUserId: null });
    } catch (e) {
      // GAGAL → LEPASKAN klaim jendela ini (3 Sep 2026) supaya permintaan
      // berikutnya di jendela yang sama boleh mencoba lagi; tanpa ini satu
      // kegagalan sesaat memadamkan sinkron sampai 30 menit berikutnya.
      await lepasKlaim(db, KUNCI_KLAIM, bucket);
      bucketSelesaiInstance = "";
      throw e;
    }
  } catch (e) {
    console.error("[sinkron-konten] berkala gagal:", e);
  }
}

/** Lepaskan klaim jendela HANYA bila nilainya masih milik kita. */
async function lepasKlaim(db: ReturnType<typeof supabase>, kunci: string, bucket: string) {
  await db
    .from("pengaturan_sistem")
    .update({ nilai: "" })
    .eq("kunci", kunci)
    .eq("nilai", bucket)
    .then(() => undefined, () => undefined);
}

/**
 * Daftarkan video yang BARU diunggah lewat aplikasi ke feed_konten +
 * `postingan` SEKETIKA. Dipakai jalur unggah (/api/tv/unggah) agar video
 * langsung muncul di kanal konten & jadi target wajib-komen tanpa
 * menunggu sinkron berkala. TIDAK memeriksa komentar (belum ada).
 *
 * Hanya mendaftarkan platform yang akun tertaut-nya benar-benar terdaftar
 * sebagai akun wajib (kalau tidak, baris postingan tak akan tergabung di
 * tampilan QC). TIDAK melempar.
 */
export async function daftarkanVideoUnggahan(opsi: {
  posting: { platform: string; id: string; postUrl: string }[];
  caption: string;
  thumbnailUrl: string;
}): Promise<void> {
  try {
    if (opsi.posting.length === 0) return;
    const db = supabase();

    const [{ data: akunWajib }, tertaut] = await Promise.all([
      db.from("akun_wajib").select("username, platform, nama_akun").eq("aktif", true),
      ambilAkunTertaut().catch(() => ({ akun: [] as { platform: string; username: string }[] })),
    ]);

    // platform → username akun resmi yang tertaut di profil Ayrshare.
    const usernamePerPlatform = new Map<string, string>();
    for (const a of tertaut.akun) {
      usernamePerPlatform.set(a.platform, a.username.toLowerCase().replace(/^@/, ""));
    }
    // (platform, username) yang sah sebagai akun wajib + label tampilannya.
    const wajib = new Map<string, string>(); // "platform|username" → nama_tampilan
    for (const a of akunWajib ?? []) {
      wajib.set(
        `${a.platform}|${String(a.username).toLowerCase()}`,
        // Kolom label di DB bernama `nama_akun` (BUKAN nama_tampilan).
        (a.nama_akun as string) ?? (a.username as string),
      );
    }

    const periode = periodeHariIni();
    const sekarang = new Date().toISOString();

    const barisPost: Record<string, unknown>[] = [];
    const barisFeed: Record<string, unknown>[] = [];
    for (const p of opsi.posting) {
      const username = usernamePerPlatform.get(p.platform);
      if (!username) continue; // platform tak tertaut → tak bisa dipetakan
      const namaTampilan = wajib.get(`${p.platform}|${username}`);
      if (!namaTampilan) continue; // bukan akun wajib → jangan buat baris yatim
      const idKanonik = idPostinganKanonik(p.platform, p.id, p.postUrl);
      barisPost.push({
        id_postingan: idKanonik,
        akun_wajib: username,
        platform: p.platform,
        url_postingan: p.postUrl,
        periode,
        waktu_posting: sekarang,
        caption_asli: opsi.caption,
        thumbnail_url: opsi.thumbnailUrl,
        updated_at: sekarang,
        // komentar_status SENGAJA tak diisi → baris baru dapat default
        // 'menunggu', dan komentarnya diperiksa sinkron berkala berikutnya.
      });
      barisFeed.push({
        id_postingan: idKanonik,
        platform: p.platform,
        akun_username: username,
        akun_nama: namaTampilan,
        url_postingan: p.postUrl,
        caption: opsi.caption,
        thumbnail_url: opsi.thumbnailUrl,
        jumlah_like: 0,
        jumlah_komentar: 0,
        waktu_posting: sekarang,
        diperbarui_pada: sekarang,
      });
    }

    if (barisPost.length > 0) {
      await db.from("postingan").upsert(barisPost, { onConflict: "id_postingan" });
    }
    if (barisFeed.length > 0) {
      await db.from("feed_konten").upsert(barisFeed, { onConflict: "platform,id_postingan" });
    }
  } catch (e) {
    console.error("[sinkron-konten] daftar unggahan gagal:", e);
  }
}

const KUNCI_LEASE = "sinkron_lease";
const KUNCI_MENIT = "sinkron_komen_menit";
/** Umur lease pekerja (ms) — sedikit di atas maxDuration route cron. */
const UMUR_LEASE_MS = 320_000;
/** Postingan yang diperiksa < ini dilewati pada mode realtime (ms). */
const SEGAR_REALTIME_MS = 3 * 60_000;

/** true bila ada pekerja lain yang masih memegang lease. */
export async function leaseAktif(db: ReturnType<typeof supabase>): Promise<boolean> {
  const { data } = await db.from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI_LEASE).maybeSingle();
  const nilai = String(data?.nilai ?? "");
  return Boolean(nilai) && nilai > new Date().toISOString();
}

/** Ambil lease secara atomik; null bila sedang dipegang pekerja lain. */
async function ambilLease(db: ReturnType<typeof supabase>): Promise<string | null> {
  const kini = new Date().toISOString();
  const sampai = new Date(Date.now() + UMUR_LEASE_MS).toISOString();
  await db
    .from("pengaturan_sistem")
    .upsert({ kunci: KUNCI_LEASE, nilai: "" }, { onConflict: "kunci", ignoreDuplicates: true });
  // Menang hanya bila lease kosong ATAU sudah kedaluwarsa (ISO dibanding leksikal).
  const { data } = await db
    .from("pengaturan_sistem")
    .update({ nilai: sampai })
    .eq("kunci", KUNCI_LEASE)
    .lt("nilai", kini)
    .select("kunci");
  return data && data.length > 0 ? sampai : null;
}

async function lepasLease(db: ReturnType<typeof supabase>, lease: string) {
  await db
    .from("pengaturan_sistem")
    .update({ nilai: "" })
    .eq("kunci", KUNCI_LEASE)
    .eq("nilai", lease)
    .then(() => undefined, () => undefined);
}

/** Jeda minimal antar putaran penuh (menit), bisa diubah tanpa deploy. */
async function bacaMenitRealtime(db: ReturnType<typeof supabase>): Promise<number> {
  const { data } = await db.from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI_MENIT).maybeSingle();
  const n = Number(data?.nilai ?? 5);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 5;
}

export type HasilPaksa = {
  jalan: boolean;
  alasan?: string;
  putaran?: number;
  sisa?: number;
  selesai?: boolean;
  ringkas?: Record<string, unknown>;
};

/**
 * Sinkron REALTIME untuk Vercel Cron (3 Sep 2026): dipanggil tiap 5 menit,
 * lalu MENGULANG penarikan di dalam satu panggilan sampai semua postingan
 * periode selesai diperiksa atau anggaran waktu habis (`anggaranTotalMs`).
 * Bila masih ada sisa saat anggaran habis, pemanggil (route) menyambung ke
 * panggilan berikutnya ("rantai"). Satu lease atomik menjamin hanya SATU
 * pekerja Ayrshare pada satu waktu. Jejak ke pengaturan_sistem
 * `sinkron_komen_cron_terakhir` & `sinkron_komen_cron_status`.
 */
export async function sinkronKontenTvPaksa(
  pemicu: string,
  anggaranTotalMs = 250_000,
): Promise<HasilPaksa> {
  const db = supabase();
  const mulai = Date.now();
  if (!ayrshareSiap()) return { jalan: false, alasan: "Ayrshare belum tersambung." };
  const lease = await ambilLease(db);
  if (!lease) return { jalan: false, alasan: "Pekerja lain sedang menarik komentar (lease aktif)." };

  let putaran = 0;
  let terakhir: Awaited<ReturnType<typeof jalankanAnalisisAyrshare>> | null = null;
  let galatTerakhir = "";
  try {
    // Ulangi sampai tuntas atau anggaran habis. Tiap putaran hanya menyentuh
    // postingan yang BELUM diperiksa dalam 3 menit terakhir, jadi putaran
    // lanjutan langsung ke sisa yang belum sempat, bukan mengulang dari awal.
    while (Date.now() - mulai < anggaranTotalMs) {
      const sisaWaktu = anggaranTotalMs - (Date.now() - mulai);
      if (sisaWaktu < 15_000) break;
      putaran += 1;
      try {
        terakhir = await jalankanAnalisisAyrshare({
          olehUserId: null,
          anggaranMs: Math.min(sisaWaktu - 10_000, 120_000),
          segarMs: SEGAR_REALTIME_MS,
        });
        galatTerakhir = "";
        if (terakhir.selesai || terakhir.sisa === 0) break;
      } catch (e) {
        galatTerakhir = e instanceof Error ? e.message : String(e);
        console.error(`[sinkron-konten] realtime putaran ${putaran} gagal:`, galatTerakhir);
        // Gagal sesaat → jeda 5 dtk lalu coba lagi selama anggaran masih ada.
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } finally {
    await lepasLease(db, lease);
  }

  const kini = new Date().toISOString();
  if (!terakhir) {
    await db.from("pengaturan_sistem").upsert(
      [
        { kunci: "sinkron_komen_cron_terakhir", nilai: kini },
        { kunci: "sinkron_komen_cron_status", nilai: `gagal ${pemicu} ${galatTerakhir}`.slice(0, 500) },
      ],
      { onConflict: "kunci" },
    );
    return { jalan: false, alasan: galatTerakhir || "Tidak ada putaran yang berhasil.", putaran };
  }
  const ringkas = {
    periode: terakhir.periode,
    postingan: terakhir.postingan,
    komentar: terakhir.komentar,
    comply: terakhir.comply,
    gagal_cek: terakhir.gagal_cek,
    sisa: terakhir.sisa,
    selesai: terakhir.selesai,
    putaran,
    detik: Math.round((Date.now() - mulai) / 1000),
    peringatan: terakhir.peringatan.length,
  };
  await db.from("pengaturan_sistem").upsert(
    [
      { kunci: "sinkron_komen_cron_terakhir", nilai: kini },
      { kunci: "sinkron_komen_cron_status", nilai: `ok ${pemicu} ${JSON.stringify(ringkas)}`.slice(0, 500) },
    ],
    { onConflict: "kunci" },
  );
  return { jalan: true, putaran, sisa: terakhir.sisa, selesai: terakhir.selesai, ringkas };
}

/** Menit jeda realtime (untuk route cron yang ingin mengecek tanpa menjalankan). */
export async function menitRealtime(): Promise<number> {
  return bacaMenitRealtime(supabase());
}
