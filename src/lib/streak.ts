// ============================================================
// Streak harian (KHUSUS SISI SERVER) — spek 1.14 bagian 4.1.
//
// Dua sistem terpisah:
// 1. CHAT STREAK (ala TikTok, per pasangan chat): naik bila KEDUA
//    pihak saling kirim >=1 pesan sejak kenaikan terakhir, maksimal
//    1 kenaikan per 24 jam. Putus bila >48 jam tanpa kenaikan
//    (artinya satu "hari" terlewat penuh).
// 2. TASK STREAK (ala Duolingo, per akun): tugas harian = absensi
//    masuk. Naik 1 per hari WIB berturut-turut.
//
// RESTORE (spek): satu kesempatan pemulihan otomatis. Saat streak
// putus karena terlewat SATU hari dan jatah restore ada, melakukan
// tugas lagi memulihkan streak seperti tidak pernah putus — jatahnya
// terpakai. Jatah pulih lagi tiap streak menembus tier baru.
//
// Semua evaluasi "putus" dilakukan MALAS (saat tulis/baca berikutnya),
// tanpa cron — konsisten dengan pola retensi absensi di repo ini.
// ============================================================
import { supabase } from "@/lib/supabase";

/** Ambang tier (hari): api kecil merah → besar merah → biru → hijau. */
export const TIER_STREAK = [1, 3, 10, 30, 90] as const;

const JAM = 60 * 60 * 1000;

/** Indeks tier tertinggi yang sudah dicapai (0 = belum ada). */
export function tierDari(hari: number): number {
  let t = 0;
  for (let i = 0; i < TIER_STREAK.length; i++) {
    if (hari >= TIER_STREAK[i]) t = i + 1;
  }
  return t;
}

/** Tanggal WIB "YYYY-MM-DD" dari sebuah waktu. */
function tanggalWib(kapan: Date): string {
  return new Date(kapan.getTime() + 7 * JAM).toISOString().slice(0, 10);
}

/** Selisih hari kalender antara dua tanggal "YYYY-MM-DD". */
function selisihHari(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / (24 * JAM));
}

type BarisChatStreak = {
  kontak_id: number;
  hari: number;
  terakhir_naik: string | null;
  a_pada: string | null;
  b_pada: string | null;
  restore_tersedia: boolean;
  tier_terakhir: number;
};

/**
 * Catat satu pesan untuk streak chat. Dipanggil dari aksi "kirim".
 * `dariKecil` = pengirimnya user_kecil pada pasangan kontak itu.
 *
 * Gagal di sini TIDAK boleh menggagalkan pengiriman pesan — pemanggil
 * membungkusnya try/catch; streak hanyalah hiasan di atas chat.
 */
export async function catatPesanStreak(kontakId: number, dariKecil: boolean): Promise<void> {
  const db = supabase();
  const kini = new Date();
  const kiniIso = kini.toISOString();

  const { data } = await db
    .from("chat_streak")
    .select("kontak_id, hari, terakhir_naik, a_pada, b_pada, restore_tersedia, tier_terakhir")
    .eq("kontak_id", kontakId)
    .maybeSingle();

  const baris: BarisChatStreak = (data as BarisChatStreak | null) ?? {
    kontak_id: kontakId,
    hari: 0,
    terakhir_naik: null,
    a_pada: null,
    b_pada: null,
    restore_tersedia: false,
    tier_terakhir: 0,
  };

  // 1. Evaluasi putus: >48 jam sejak kenaikan terakhir = satu hari
  //    terlewat penuh. Jatah restore memulihkannya diam-diam (spek:
  //    "dipulihkan seperti tidak pernah putus"); tanpa jatah, mulai 0.
  if (baris.terakhir_naik) {
    const sejakNaik = kini.getTime() - Date.parse(baris.terakhir_naik);
    if (sejakNaik > 48 * JAM) {
      if (baris.restore_tersedia && sejakNaik <= 96 * JAM) {
        baris.restore_tersedia = false;
        baris.terakhir_naik = kiniIso; // jendela baru dimulai sekarang
      } else {
        baris.hari = 0;
        baris.terakhir_naik = null;
        baris.tier_terakhir = 0;
        baris.restore_tersedia = false;
      }
      // Percakapan lama kedaluwarsa — dua-duanya harus kirim lagi.
      baris.a_pada = null;
      baris.b_pada = null;
    }
  }

  // 2. Catat pesan sisi pengirim.
  if (dariKecil) baris.a_pada = kiniIso;
  else baris.b_pada = kiniIso;

  // 3. Kenaikan: KEDUA pihak sudah kirim pesan BARU setelah kenaikan
  //    terakhir (timestamp harus > terakhir_naik — pesan yang memicu
  //    kenaikan kemarin tidak terhitung lagi), dan minimal 24 jam
  //    berlalu sejak kenaikan itu (streak = per hari, bukan per pesan).
  //    Kenaikan pertama (hari 0→1) tanpa syarat jeda.
  const duaPihak = Boolean(baris.a_pada && baris.b_pada);
  const acuan = baris.terakhir_naik ? Date.parse(baris.terakhir_naik) : 0;
  const duaPihakSejakNaik =
    duaPihak &&
    Date.parse(baris.a_pada as string) > acuan &&
    Date.parse(baris.b_pada as string) > acuan;
  const bolehNaik =
    duaPihakSejakNaik &&
    (baris.terakhir_naik === null || kini.getTime() - acuan >= 24 * JAM);

  if (bolehNaik) {
    baris.hari += 1;
    baris.terakhir_naik = kiniIso;
    // Tembus tier baru → jatah restore pulih (ASUMSI spek yang disetujui).
    const tier = tierDari(baris.hari);
    if (tier > baris.tier_terakhir) {
      baris.tier_terakhir = tier;
      baris.restore_tersedia = true;
    }
  }

  await db.from("chat_streak").upsert(baris, { onConflict: "kontak_id" });
}

/**
 * Baca streak beberapa kontak sekaligus (untuk daftar chat).
 * Streak yang sudah putus (tanpa jatah restore) dilaporkan 0 —
 * evaluasinya malas, barisnya baru dibereskan saat pesan berikutnya.
 */
export async function bacaStreakChat(kontakIds: number[]): Promise<Map<number, number>> {
  const hasil = new Map<number, number>();
  if (kontakIds.length === 0) return hasil;
  try {
    const { data } = await supabase()
      .from("chat_streak")
      .select("kontak_id, hari, terakhir_naik, restore_tersedia")
      .in("kontak_id", kontakIds);
    const kini = Date.now();
    for (const b of data ?? []) {
      const sejak = b.terakhir_naik ? kini - Date.parse(b.terakhir_naik) : Infinity;
      const putusTotal = sejak > 48 * JAM && !(b.restore_tersedia && sejak <= 96 * JAM);
      hasil.set(Number(b.kontak_id), putusTotal ? 0 : Number(b.hari));
    }
  } catch {
    // Gagal baca streak tidak boleh merusak daftar chat.
  }
  return hasil;
}

/**
 * Catat tugas harian (absen masuk) untuk task streak. Dipanggil dari
 * /api/absensi setelah absen masuk tersimpan. Idempoten per hari WIB.
 */
export async function catatTugasStreak(userId: number): Promise<void> {
  const db = supabase();
  const hariIni = tanggalWib(new Date());

  const { data } = await db
    .from("task_streak")
    .select("user_id, hari, terakhir_tanggal, restore_tersedia, tier_terakhir")
    .eq("user_id", userId)
    .maybeSingle();

  let hari = Number(data?.hari ?? 0);
  let restore = Boolean(data?.restore_tersedia ?? false);
  let tierTerakhir = Number(data?.tier_terakhir ?? 0);
  const terakhir = (data?.terakhir_tanggal as string | null) ?? null;

  if (terakhir === hariIni) return; // sudah tercatat hari ini

  if (terakhir === null) {
    hari = 1;
  } else {
    const jeda = selisihHari(terakhir, hariIni);
    if (jeda === 1) {
      hari += 1; // hari berturut-turut
    } else if (jeda === 2 && restore) {
      // Terlewat TEPAT satu hari + jatah restore ada → pulih seperti
      // tidak pernah putus (spek), jatahnya terpakai.
      hari += 1;
      restore = false;
    } else {
      hari = 1; // putus — mulai lagi
      tierTerakhir = 0;
      restore = false;
    }
  }

  const tier = tierDari(hari);
  if (tier > tierTerakhir) {
    tierTerakhir = tier;
    restore = true; // tembus tier baru → jatah restore pulih
  }

  await db.from("task_streak").upsert(
    {
      user_id: userId,
      hari,
      terakhir_tanggal: hariIni,
      restore_tersedia: restore,
      tier_terakhir: tierTerakhir,
    },
    { onConflict: "user_id" },
  );
}

/**
 * Baca task streak seseorang untuk Beranda/Profil. Streak yang putus
 * total (terlewat >1 hari, atau 1 hari tanpa jatah restore) tampil 0.
 */
export async function bacaTugasStreak(
  userId: number,
): Promise<{ hari: number; restore_tersedia: boolean }> {
  try {
    const { data } = await supabase()
      .from("task_streak")
      .select("hari, terakhir_tanggal, restore_tersedia")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data?.terakhir_tanggal) return { hari: 0, restore_tersedia: false };
    const jeda = selisihHari(String(data.terakhir_tanggal), tanggalWib(new Date()));
    const hidup = jeda <= 1 || (jeda === 2 && Boolean(data.restore_tersedia));
    return {
      hari: hidup ? Number(data.hari) : 0,
      restore_tersedia: Boolean(data.restore_tersedia),
    };
  } catch {
    return { hari: 0, restore_tersedia: false };
  }
}
