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

    // Mesin melempar 409 bila tak ada akun tertaut — itu normal (belum
    // ditautkan), cukup dicatat, bukan alasan menggagalkan apa pun.
    await jalankanAnalisisAyrshare({ olehUserId: null });
  } catch (e) {
    console.error("[sinkron-konten] berkala gagal:", e);
  }
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
