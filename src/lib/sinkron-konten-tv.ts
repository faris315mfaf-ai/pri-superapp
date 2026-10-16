// ============================================================
// Sinkronisasi konten TV Rakyat OFFICIAL (KHUSUS SISI SERVER).
//
// 16 Okt 2026: Ayrshare dihapus. Sumbernya kini profil upload-post
// Official (lib/official-up) — daftar media per platform. upload-post TIDAK
// punya API komentar, jadi PEMERIKSAAN KOMENTAR OTOMATIS (komentar → rekap
// "wajib komen" → koin komentar) DIMATIKAN. Yang tetap berjalan: postingan
// Official periode ini masuk `postingan` (daftar wajib komen) dan
// `feed_konten` (kanal konten). Data komentar/rekap lama tetap terbaca.
//
// Tiga pemicu:
// 1. BERKALA — sinkronKontenTvTerjadwal(): menumpang after() di /api/sesi.
//    Diklaim ATOMIK maksimal sekali per jendela (bawaan 30 menit).
// 2. CRON — sinkronKontenTvPaksa(): /api/cron/sinkron-komen (satu putaran
//    per panggilan, dijaga lease atomik).
// 3. SAAT UNGGAH — daftarkanVideoUnggahan(): dipanggil setelah unggah /
//    jadwal tayang Official berhasil; mendaftarkan video SEKETIKA.
// ============================================================
import { supabase } from "@/lib/supabase";
import { profilOfficialUp } from "@/lib/official-up";
import { akunTertautUp, postinganTerbaruUp, uploadPostSiap } from "@/lib/upload-post";
import { idPostinganKanonik, periodeHariIni } from "@/lib/periode-postingan";
import { akhirPeriodeMsDari, awalPeriodeMsDari } from "@/lib/periode-qc";

const KUNCI_KLAIM = "sinkron_konten_bucket";
const KUNCI_INTERVAL = "sinkron_konten_interval_menit";
const INTERVAL_BAWAAN = 30;
const INTERVAL_MIN = 10;
/** Postingan terbaru yang dibaca per platform sebelum disaring ke periode. */
const AMBIL_PER_PLATFORM = 25;
const PLATFORM_OFFICIAL = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"];

/** Pesan bersama untuk layar/cron: komentar tidak lagi diperiksa otomatis. */
export const PESAN_KOMENTAR_DIMATIKAN =
  "Pemeriksaan komentar otomatis dimatikan: upload-post tidak menyediakan data komentar. Data komentar lama tetap bisa dibaca.";

type Db = ReturnType<typeof supabase>;

/** Handle tanpa "@" dan huruf kecil — seragam dengan akun_wajib. */
function bersihkanHandle(u: string): string {
  return u.trim().replace(/^@+/, "").toLowerCase();
}

async function bacaIntervalMenit(db: Db): Promise<number> {
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

async function bacaIntervalMenitCache(db: Db): Promise<number> {
  if (intervalCache && Date.now() - intervalCache.pada < 5 * 60_000) {
    return intervalCache.nilai;
  }
  const nilai = await bacaIntervalMenit(db);
  intervalCache = { nilai, pada: Date.now() };
  return nilai;
}

/**
 * Akun Official per platform (nama APLIKASI → handle). Sumber utama: akun
 * yang tertaut di profil upload-post Official; cadangan bila upload-post
 * tak terbaca: akun_wajib berlabel "tv rakyat".
 */
async function akunOfficial(db: Db, profil: string): Promise<Map<string, string>> {
  const hasil = new Map<string, string>();
  if (profil && uploadPostSiap()) {
    try {
      for (const [pf, un] of Object.entries(await akunTertautUp(profil))) {
        const h = bersihkanHandle(un);
        if (PLATFORM_OFFICIAL.includes(pf) && h) hasil.set(pf, h);
      }
    } catch (e) {
      console.error("[sinkron-konten] akun tertaut Official:", e instanceof Error ? e.message : e);
    }
  }
  if (hasil.size === 0) {
    const { data } = await db
      .from("akun_wajib")
      .select("platform, username")
      .eq("aktif", true)
      .ilike("nama_akun", "%tv rakyat%")
      .order("id");
    for (const b of data ?? []) {
      const pf = String(b.platform ?? "").toLowerCase();
      if (pf && !hasil.has(pf)) hasil.set(pf, bersihkanHandle(String(b.username ?? "")));
    }
  }
  return hasil;
}

export type HasilSinkronKonten = {
  periode: string;
  profil: string;
  akun_tercakup: string[];
  postingan: number;
  peringatan: string[];
};

/**
 * Satu putaran sinkron konten Official: postingan periode ini (19:00→18:59
 * WIB) per platform → `postingan` + `feed_konten`. Tanpa komentar.
 * Melempar 409 bila Official belum ditautkan (pemanggil otomatis menangkapnya).
 */
async function sinkronKontenOfficial(): Promise<HasilSinkronKonten> {
  const db = supabase();
  const profil = await profilOfficialUp();
  if (!profil) {
    throw Object.assign(new Error("Akun TV Rakyat Official belum ditautkan ke upload-post."), { status: 409 });
  }
  const periode = periodeHariIni();
  const batasMs = awalPeriodeMsDari(periode);
  const batasAkhirMs = akhirPeriodeMsDari(periode);

  const [akun, { data: akunWajib }] = await Promise.all([
    akunOfficial(db, profil),
    db.from("akun_wajib").select("username, platform, nama_akun").eq("aktif", true),
  ]);
  if (akun.size === 0) {
    throw Object.assign(new Error("Profil upload-post Official belum punya akun sosmed tertaut."), { status: 409 });
  }

  // DAFTAR-OTOMATIS akun resmi ke akun_wajib (sama seperti sebelumnya): akun
  // yang tertaut di profil Official langsung masuk daftar wajib, kecuali X
  // (akunnya pernah kena banned). Usernamenya dari penautan asli.
  const label = new Map<string, string>();
  for (const a of akunWajib ?? []) {
    label.set(`${a.platform}|${String(a.username).toLowerCase()}`, String(a.nama_akun ?? a.username));
  }
  const barisBaru = [...akun.entries()]
    .filter(([pf, un]) => pf !== "twitter" && !label.has(`${pf}|${un}`))
    .map(([pf, un]) => ({ username: un, platform: pf, nama_akun: "tv rakyat", aktif: true }));
  if (barisBaru.length > 0) {
    const { error } = await db
      .from("akun_wajib")
      .upsert(barisBaru, { onConflict: "platform,username", ignoreDuplicates: true });
    if (error) console.error("[sinkron-konten] daftar-otomatis akun:", error.message);
    else for (const b of barisBaru) label.set(`${b.platform}|${b.username}`, b.nama_akun);
  }

  const peringatan: string[] = [];
  const tercakup: string[] = [];
  let total = 0;
  const kini = new Date().toISOString();
  for (const [pf, un] of akun) {
    const nama = label.get(`${pf}|${un}`);
    if (!nama) continue; // bukan akun wajib → jangan buat baris yatim
    tercakup.push(`${un} (${pf})`);
    let daftar: Awaited<ReturnType<typeof postinganTerbaruUp>>;
    try {
      daftar = await postinganTerbaruUp(profil, pf, AMBIL_PER_PLATFORM);
    } catch (e) {
      peringatan.push(`${un} (${pf}): daftar postingan tak terbaca — ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const periodeIni = daftar.filter((p) => {
      if (!p.permalink || !p.waktu) return false;
      const t = new Date(p.waktu).getTime();
      return t >= batasMs && t < batasAkhirMs;
    });
    if (daftar.length >= AMBIL_PER_PLATFORM && periodeIni.length === daftar.length) {
      peringatan.push(`${un} (${pf}): lebih dari ${AMBIL_PER_PLATFORM} postingan hari ini — sebagian mungkin terlewat.`);
    }
    if (periodeIni.length === 0) continue;

    // Satu id kanonik per postingan (PostgREST menolak kunci dobel sepayload).
    const unik = new Map<string, (typeof periodeIni)[number]>();
    for (const p of periodeIni) unik.set(idPostinganKanonik(pf, p.id, p.permalink), p);
    total += unik.size;

    // Angka suka/komentar SENGAJA tidak ditulis: daftar media upload-post
    // tidak membawanya, dan menulis nol akan menimpa angka lama.
    await db.from("postingan").upsert(
      [...unik.entries()].map(([id, p]) => ({
        id_postingan: id,
        akun_wajib: un,
        platform: pf,
        url_postingan: p.permalink,
        periode,
        waktu_posting: p.waktu,
        caption_asli: p.caption,
        thumbnail_url: p.thumbnail,
        updated_at: kini,
        hilang_sejak: null,
      })),
      { onConflict: "id_postingan" },
    );
    try {
      await db.from("feed_konten").upsert(
        [...unik.entries()].map(([id, p]) => ({
          id_postingan: id,
          platform: pf,
          akun_username: un,
          akun_nama: nama,
          url_postingan: p.permalink,
          caption: p.caption,
          thumbnail_url: p.thumbnail,
          waktu_posting: p.waktu,
          diperbarui_pada: kini,
        })),
        { onConflict: "platform,id_postingan" },
      );
    } catch (e) {
      console.error("[sinkron-konten] feed_konten gagal:", e);
    }
  }

  return { periode, profil, akun_tercakup: tercakup, postingan: total, peringatan };
}

/**
 * Sinkron BERKALA. Maksimal sekali per jendela: hanya request yang
 * berhasil mengubah nilai klaim ke "bucket" jendela sekarang yang jalan,
 * jadi dua pembukaan aplikasi berbarengan tak menjalankan dobel.
 * TIDAK melempar — gagalnya tak boleh mengganggu pembukaan aplikasi.
 */
export async function sinkronKontenTvTerjadwal(): Promise<void> {
  try {
    if (!uploadPostSiap()) return;
    // Hubungan pendek per-instance: /api/sesi dipanggil sangat sering;
    // instance yang sudah tahu jendela ini beres langsung pulang.
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
    bucketSelesaiInstance = bucket;
    if (!klaim || klaim.length === 0) return; // jendela ini sudah dikerjakan

    // Pekerja cron sedang memegang lease → jalur ini mengalah.
    if (await leaseAktif(db)) {
      await lepasKlaim(db, KUNCI_KLAIM, bucket);
      bucketSelesaiInstance = "";
      return;
    }
    try {
      await sinkronKontenOfficial();
    } catch (e) {
      // 409 = Official belum ditautkan: normal, bukan alasan mengulang.
      if ((e as { status?: number })?.status === 409) return;
      // GAGAL → lepaskan klaim supaya permintaan berikutnya di jendela yang
      // sama boleh mencoba lagi.
      await lepasKlaim(db, KUNCI_KLAIM, bucket);
      bucketSelesaiInstance = "";
      throw e;
    }
  } catch (e) {
    console.error("[sinkron-konten] berkala gagal:", e);
  }
}

/** Lepaskan klaim jendela HANYA bila nilainya masih milik kita. */
async function lepasKlaim(db: Db, kunci: string, bucket: string) {
  await db
    .from("pengaturan_sistem")
    .update({ nilai: "" })
    .eq("kunci", kunci)
    .eq("nilai", bucket)
    .then(() => undefined, () => undefined);
}

/**
 * Daftarkan video yang BARU diunggah lewat aplikasi ke feed_konten +
 * `postingan` SEKETIKA. Dipakai jalur unggah (/api/tv/unggah) dan jadwal
 * tayang Official agar video langsung muncul di kanal konten & jadi target
 * wajib-komen tanpa menunggu sinkron berkala.
 *
 * Hanya mendaftarkan platform yang akun Official-nya terdaftar sebagai
 * akun wajib (kalau tidak, baris postingan tak akan tergabung di tampilan
 * QC). TIDAK melempar.
 */
export async function daftarkanVideoUnggahan(opsi: {
  posting: { platform: string; id: string; postUrl: string }[];
  caption: string;
  thumbnailUrl: string;
}): Promise<void> {
  try {
    if (opsi.posting.length === 0) return;
    const db = supabase();

    const profil = await profilOfficialUp().catch(() => "");
    const [{ data: akunWajib }, usernamePerPlatform] = await Promise.all([
      db.from("akun_wajib").select("username, platform, nama_akun").eq("aktif", true),
      akunOfficial(db, profil),
    ]);

    // (platform, username) yang sah sebagai akun wajib + label tampilannya.
    const wajib = new Map<string, string>(); // "platform|username" → nama tampilan
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
/** Umur lease pekerja (ms) — sedikit di atas maxDuration route cron. */
const UMUR_LEASE_MS = 320_000;

/** true bila ada pekerja lain yang masih memegang lease. */
export async function leaseAktif(db: Db): Promise<boolean> {
  const { data } = await db.from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI_LEASE).maybeSingle();
  const nilai = String(data?.nilai ?? "");
  return Boolean(nilai) && nilai > new Date().toISOString();
}

/** Ambil lease secara atomik; null bila sedang dipegang pekerja lain. */
async function ambilLease(db: Db): Promise<string | null> {
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

async function lepasLease(db: Db, lease: string) {
  await db
    .from("pengaturan_sistem")
    .update({ nilai: "" })
    .eq("kunci", KUNCI_LEASE)
    .eq("nilai", lease)
    .then(() => undefined, () => undefined);
}

export type HasilPaksa = {
  jalan: boolean;
  alasan?: string;
  putaran?: number;
  sisa?: number;
  selesai?: boolean;
  /** Komentar tidak diperiksa otomatis lagi (upload-post tanpa API komentar). */
  komentar_dimatikan?: boolean;
  ringkas?: Record<string, unknown>;
};

/**
 * Sinkron untuk cron (/api/cron/sinkron-komen): SATU putaran sinkron konten
 * Official per panggilan (tak ada lagi antrean komentar yang perlu dirantai).
 * Lease atomik menjamin hanya satu pekerja pada satu waktu. Jejak ke
 * pengaturan_sistem `sinkron_komen_cron_terakhir` & `sinkron_komen_cron_status`.
 * `_anggaranTotalMs` dipertahankan demi kecocokan pemanggil lama.
 */
export async function sinkronKontenTvPaksa(pemicu: string, _anggaranTotalMs = 250_000): Promise<HasilPaksa> {
  void _anggaranTotalMs;
  const db = supabase();
  const mulai = Date.now();
  if (!uploadPostSiap()) {
    return { jalan: false, alasan: "upload-post belum diatur di server.", komentar_dimatikan: true };
  }
  const lease = await ambilLease(db);
  if (!lease) {
    return { jalan: false, alasan: "Pekerja lain sedang menyinkronkan (lease aktif).", komentar_dimatikan: true };
  }

  let hasil: HasilSinkronKonten | null = null;
  let galat = "";
  try {
    hasil = await sinkronKontenOfficial();
  } catch (e) {
    galat = e instanceof Error ? e.message : String(e);
    console.error("[sinkron-konten] cron gagal:", galat);
  } finally {
    await lepasLease(db, lease);
  }

  const kini = new Date().toISOString();
  if (!hasil) {
    await db.from("pengaturan_sistem").upsert(
      [
        { kunci: "sinkron_komen_cron_terakhir", nilai: kini },
        { kunci: "sinkron_komen_cron_status", nilai: `gagal ${pemicu} ${galat}`.slice(0, 500) },
      ],
      { onConflict: "kunci" },
    );
    return { jalan: false, alasan: galat || "Sinkron tidak berhasil.", putaran: 1, komentar_dimatikan: true };
  }
  const ringkas = {
    periode: hasil.periode,
    postingan: hasil.postingan,
    akun: hasil.akun_tercakup.length,
    komentar: "dimatikan",
    detik: Math.round((Date.now() - mulai) / 1000),
    peringatan: hasil.peringatan.length,
  };
  await db.from("pengaturan_sistem").upsert(
    [
      { kunci: "sinkron_komen_cron_terakhir", nilai: kini },
      { kunci: "sinkron_komen_cron_status", nilai: `ok ${pemicu} ${JSON.stringify(ringkas)}`.slice(0, 500) },
    ],
    { onConflict: "kunci" },
  );
  return { jalan: true, putaran: 1, sisa: 0, selesai: true, komentar_dimatikan: true, ringkas };
}
