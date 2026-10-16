// ============================================================
// ANGKA NASIONAL TV RAKYAT — TOTAL & KENAIKANNYA (12 Sep 2026)
//
// Dashboard yang sudah ada menampilkan TOTAL: berapa pengikut, berapa
// tayangan, sampai hari ini. Yang diminta sekarang berbeda: berapa
// KENAIKANNYA hari ini, kemarin, sepekan, sebulan.
//
// Kenaikan tidak bisa dihitung dari angka sekarang saja. Sumber datanya
// (upload-post, untuk Official maupun akun anggota) hanya memberi
// "berapa sekarang" dan tidak menyimpan sejarah sama sekali. Jadi
// sejarahnya dicatat sendiri, sekali sehari, ke tvr_metrik_harian
// (sql/46) — dan kenaikan = angka sekarang dikurangi rekaman pembanding.
//
// Total nasional SENGAJA dibaca dari simpanan yang sudah dipelihara:
// cache Official `up_official_insight` (lihat insightOfficialUp di bawah,
// diisi /api/tv/insight & dashboard) dan insight_cache tiap profil
// anggota. Fungsi ini dipanggil penjadwal setiap hari dan oleh panel yang
// bisa dibuka kapan saja — menarik ke enam sosial media di dua tempat itu
// akan menghabiskan kuota tanpa memberi angka yang lebih benar.
//
// 16 Okt 2026: Ayrshare dihapus — Official kini memakai profil
// upload-post (lib/official-up). Cache lama `ayrshare_insight_*` tidak
// dibaca lagi.
// ============================================================
import { supabase } from "@/lib/supabase";
import { PESAN_OFFICIAL_BELUM_TERTAUT, profilOfficialUp } from "@/lib/official-up";
import { analitikProfilUp, PETA_PLATFORM_UP, statusAkunUp, uploadPostSiap } from "@/lib/upload-post";
import {
  INDIKATOR_TVR,
  jumlahkanMetrikTvr,
  kumpulkanAnggotaTvr,
  metrikDariUp,
  metrikTvrKosong,
  PLATFORM_TVR,
  type IndikatorTvr,
  type MetrikTvr,
} from "@/lib/tvr-peringkat";

// ------------------------------------------------------------
// Insight akun TV Rakyat OFFICIAL (upload-post) — cache bersama
// ------------------------------------------------------------

/** Kunci cache bersama di pengaturan_sistem (semua awalan `up_official_`). */
export const KUNCI_INSIGHT_OFFICIAL = "up_official_insight";
/** Umur cache sebelum upload-post dihubungi lagi (sama dengan insight anggota). */
export const TTL_INSIGHT_OFFICIAL_MS = 15 * 60_000;

export type CacheInsightOfficial = {
  /** Profil upload-post saat angka ditarik (berganti profil = cache basi). */
  profil: string;
  /** Balasan /analytics upload-post apa adanya, per kunci platform upload-post. */
  analitik: Record<string, unknown>;
  /** Akun tertaut per platform (nama APLIKASI) → handle. */
  akun: Record<string, string>;
  /** ISO — kapan angka ditarik dari upload-post. */
  diambil: string;
};

export type HasilInsightOfficial = {
  /** false = upload-post belum diatur / Official belum ditautkan. */
  siap: boolean;
  pesan?: string;
  profil: string;
  cache: CacheInsightOfficial | null;
  dariCache: boolean;
  /** true = penarikan baru gagal, yang disajikan angka lama. */
  kedaluwarsa?: boolean;
};

/** Baca cache Official apa adanya (tanpa menghubungi upload-post). */
export async function bacaCacheInsightOfficial(): Promise<CacheInsightOfficial | null> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", KUNCI_INSIGHT_OFFICIAL)
      .maybeSingle();
    if (!data?.nilai) return null;
    const isi = JSON.parse(String(data.nilai)) as Partial<CacheInsightOfficial>;
    if (!isi || typeof isi !== "object" || !isi.analitik || typeof isi.analitik !== "object") return null;
    return {
      profil: String(isi.profil ?? ""),
      analitik: isi.analitik as Record<string, unknown>,
      akun: (isi.akun && typeof isi.akun === "object" ? isi.akun : {}) as Record<string, string>,
      diambil: String(isi.diambil ?? ""),
    };
  } catch {
    // Cache rusak diperlakukan seperti cache kosong.
    return null;
  }
}

function cacheSegar(c: CacheInsightOfficial | null, profil: string): boolean {
  if (!c || c.profil !== profil) return false;
  const t = new Date(c.diambil).getTime();
  return Number.isFinite(t) && Date.now() - t < TTL_INSIGHT_OFFICIAL_MS;
}

/**
 * Satu penarikan per instance pada satu waktu: panel yang meminta enam
 * platform sekaligus memicu enam permintaan paralel — tanpa ini keenamnya
 * menembak upload-post sendiri-sendiri untuk angka yang sama persis.
 */
let tarikanBerjalan: Promise<CacheInsightOfficial> | null = null;

async function tarikInsightOfficial(profil: string, timeoutMs: number): Promise<CacheInsightOfficial> {
  if (tarikanBerjalan) return tarikanBerjalan;
  tarikanBerjalan = (async () => {
    const [analitik, status] = await Promise.all([
      analitikProfilUp(profil, undefined, timeoutMs),
      statusAkunUp(profil).catch(() => ({ akun: {} as Record<string, string>, perluUlang: [] as string[] })),
    ]);
    const isi: CacheInsightOfficial = {
      profil,
      analitik: analitik ?? {},
      akun: status.akun,
      diambil: new Date().toISOString(),
    };
    try {
      await supabase()
        .from("pengaturan_sistem")
        .upsert(
          { kunci: KUNCI_INSIGHT_OFFICIAL, nilai: JSON.stringify(isi), diubah_pada: isi.diambil },
          { onConflict: "kunci" },
        );
    } catch (e) {
      // Cache gagal disimpan bukan alasan menggagalkan permintaan.
      console.error("[insight-official] simpan cache:", e);
    }
    return isi;
  })();
  try {
    return await tarikanBerjalan;
  } finally {
    tarikanBerjalan = null;
  }
}

/**
 * Insight Official dari cache bersama; upload-post hanya dihubungi bila
 * cache lewat 15 menit, profilnya berganti, atau `paksa`. Gagal menarik
 * tetapi ada cache → angka lama disajikan dengan tanda `kedaluwarsa`.
 * Official belum ditautkan → `siap:false` + pesan ramah (bukan galat).
 */
export async function insightOfficialUp(
  opsi: { paksa?: boolean; timeoutMs?: number } = {},
): Promise<HasilInsightOfficial> {
  if (!uploadPostSiap()) {
    return { siap: false, pesan: "upload-post belum diatur di server.", profil: "", cache: null, dariCache: false };
  }
  const profil = await profilOfficialUp();
  if (!profil) {
    return { siap: false, pesan: PESAN_OFFICIAL_BELUM_TERTAUT, profil: "", cache: null, dariCache: false };
  }
  const cache = await bacaCacheInsightOfficial();
  if (!opsi.paksa && cacheSegar(cache, profil)) {
    return { siap: true, profil, cache, dariCache: true };
  }
  try {
    const baru = await tarikInsightOfficial(profil, opsi.timeoutMs ?? 45_000);
    return { siap: true, profil, cache: baru, dariCache: false };
  } catch (e) {
    if (cache && cache.profil === profil) {
      return {
        siap: true,
        profil,
        cache,
        dariCache: true,
        kedaluwarsa: true,
        pesan: e instanceof Error ? e.message : "upload-post tidak bisa dihubungi.",
      };
    }
    throw e;
  }
}

/** Blok analitik mentah satu platform (nama APLIKASI) dari cache Official. */
export function blokOfficial(cache: CacheInsightOfficial | null, platform: string): Record<string, unknown> | null {
  if (!cache) return null;
  const blok = cache.analitik[PETA_PLATFORM_UP[platform] ?? platform] ?? cache.analitik[platform];
  if (!blok || typeof blok !== "object" || Array.isArray(blok)) return null;
  const o = blok as Record<string, unknown>;
  return o.success === false ? null : o;
}

/** Metrik enam indikator Official satu platform (null = belum ada angka). */
export function metrikOfficial(cache: CacheInsightOfficial | null, platform: string): MetrikTvr | null {
  return metrikDariUp(blokOfficial(cache, platform));
}

export type TotalNasional = {
  total: MetrikTvr;
  profil_terbaca: number;
  profil_total: number;
  /** Total per anggota (gabungan semua platform) — untuk rekaman per orang. */
  per_anggota: { user_id: string; total: MetrikTvr }[];
};

/** Satu bagian per rentang waktu yang bisa dipilih di panel. */
export const RENTANG_KENAIKAN = [
  { kunci: "hari_ini", label: "Hari ini", hari: 0 },
  { kunci: "kemarin", label: "Kemarin", hari: 1 },
  { kunci: "minggu", label: "1 minggu", hari: 7 },
  { kunci: "bulan", label: "1 bulan", hari: 30 },
  { kunci: "semua", label: "Semua", hari: -1 },
] as const;

export type KunciRentang = (typeof RENTANG_KENAIKAN)[number]["kunci"];

const KUNCI_RENTANG_SAH = new Set<string>(RENTANG_KENAIKAN.map((r) => r.kunci));

export function rentangSah(v: unknown): KunciRentang {
  const s = String(v ?? "").trim();
  return (KUNCI_RENTANG_SAH.has(s) ? s : "hari_ini") as KunciRentang;
}

/** Tanggal WIB (YYYY-MM-DD). Sejarah harian harus mengikuti hari kerja
 *  di sini, bukan pergantian hari di UTC yang jatuh pukul 07.00 pagi. */
export function tanggalWib(geserHari = 0): string {
  const wib = new Date(Date.now() + 7 * 60 * 60_000 - geserHari * 24 * 60 * 60_000);
  return wib.toISOString().slice(0, 10);
}

/**
 * Total nasional SEKARANG: Official (6 platform) + seluruh akun anggota.
 *
 * `profil_terbaca` sengaja ikut dikembalikan. Tanpa itu, rekaman yang
 * diambil saat sebagian akun belum terbaca akan terlihat seperti
 * "jumlah pengikut turun" — padahal yang berkurang cuma cakupannya.
 */
export async function hitungTotalNasional(): Promise<TotalNasional> {
  const anggota = await kumpulkanAnggotaTvr();

  // Official dibaca dari cache saja (tanpa menghubungi upload-post).
  const cacheOfficial = await bacaCacheInsightOfficial();
  let total = metrikTvrKosong();
  for (const p of PLATFORM_TVR) {
    total = jumlahkanMetrikTvr(total, metrikOfficial(cacheOfficial, p));
  }

  let terbaca = 0;
  const perAnggota: { user_id: string; total: MetrikTvr }[] = [];
  for (const a of anggota) {
    let adaIsi = false;
    let milik = metrikTvrKosong();
    for (const p of PLATFORM_TVR) {
      const m = a.platform[p];
      if (m) {
        total = jumlahkanMetrikTvr(total, m);
        milik = jumlahkanMetrikTvr(milik, m);
        adaIsi = true;
      }
    }
    if (adaIsi) {
      terbaca += 1;
      perAnggota.push({ user_id: String(a.user_id), total: milik });
    }
  }

  return { total, profil_terbaca: terbaca, profil_total: anggota.length, per_anggota: perAnggota };
}

/** Simpan/perbarui rekaman hari ini. Dipanggil penjadwal. */
export async function rekamMetrikHarian(): Promise<{
  tanggal_wib: string;
  total: MetrikTvr;
  profil_terbaca: number;
  profil_total: number;
  anggota_terekam: number;
}> {
  const kini = await hitungTotalNasional();
  const tanggal = tanggalWib();
  const baris = {
    tanggal_wib: tanggal,
    total: kini.total as unknown as Record<string, number | null>,
    profil_terbaca: kini.profil_terbaca,
    profil_total: kini.profil_total,
    diambil_pada: new Date().toISOString(),
  };
  const { error } = await supabase()
    .from("tvr_metrik_harian")
    .upsert(baris, { onConflict: "tanggal_wib" });
  if (error) throw new Error(`Gagal menyimpan rekaman harian: ${error.message}`);

  // Rekaman PER ANGGOTA (sql/48) — dasar leaderboard Top Mingguan
  // (kenaikan pengikut). Dipotong per 500 baris supaya satu permintaan
  // tidak membengkak; satu potongan gagal tidak menggagalkan rekaman
  // nasional yang sudah tersimpan di atas.
  const perOrang = kini.per_anggota.map((a) => ({
    tanggal_wib: tanggal,
    user_id: Number(a.user_id),
    pengikut: a.total.pengikut ?? 0,
    tayangan: a.total.tayangan ?? 0,
    jangkauan: a.total.jangkauan ?? 0,
    suka: a.total.suka ?? 0,
    komentar: a.total.komentar ?? 0,
    bagikan: a.total.bagikan ?? 0,
    diambil_pada: baris.diambil_pada,
  }));
  for (let i = 0; i < perOrang.length; i += 500) {
    const { error: e2 } = await supabase()
      .from("tvr_metrik_anggota_harian")
      .upsert(perOrang.slice(i, i + 500), { onConflict: "tanggal_wib,user_id" });
    if (e2) console.error("[rekam-metrik] per anggota:", e2.message);
  }
  // per_anggota sengaja TIDAK ikut dikembalikan: ratusan baris yang tidak
  // dibutuhkan pemanggil, hanya membengkakkan jawaban cron.
  return {
    tanggal_wib: tanggal,
    total: kini.total,
    profil_terbaca: kini.profil_terbaca,
    profil_total: kini.profil_total,
    anggota_terekam: perOrang.length,
  };
}

type BarisRekaman = {
  tanggal_wib: string;
  total: Record<string, number | null> | null;
  profil_terbaca: number | null;
};

function keMetrik(v: Record<string, number | null> | null | undefined): MetrikTvr {
  const hasil = metrikTvrKosong();
  if (!v) return hasil;
  for (const k of INDIKATOR_TVR) {
    const n = v[k];
    hasil[k] = typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  return hasil;
}

/**
 * Rekaman pada atau SEBELUM tanggal tertentu — yang paling dekat.
 *
 * Dicari "pada atau sebelum", bukan persis, supaya satu hari yang
 * terlewat (server mati, penjadwal tidak jalan) tidak membuat seluruh
 * rentang kehilangan pembandingnya.
 */
async function rekamanSampai(tanggal: string): Promise<BarisRekaman | null> {
  const { data } = await supabase()
    .from("tvr_metrik_harian")
    .select("tanggal_wib, total, profil_terbaca")
    .lte("tanggal_wib", tanggal)
    .order("tanggal_wib", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BarisRekaman | null) ?? null;
}

export type HasilKenaikan = {
  rentang: KunciRentang;
  label: string;
  /** Angka kenaikan per indikator; null = belum bisa dihitung. */
  kenaikan: Record<IndikatorTvr, number | null>;
  /** Angka total saat ini (dipakai rentang "semua"). */
  sekarang: MetrikTvr;
  /** Tanggal rekaman pembanding, kosong bila belum ada. */
  dibanding_tanggal: string;
  /** Kalimat apa adanya soal ketersediaan sejarah. */
  catatan: string;
};

/**
 * Kenaikan pada satu rentang.
 *
 * "semua" = angka totalnya sendiri: tidak ada yang namanya kenaikan
 * sejak awal waktu, karena sebelum akunnya ada tidak ada angka apa pun.
 */
export async function hitungKenaikan(rentang: KunciRentang): Promise<HasilKenaikan> {
  const def = RENTANG_KENAIKAN.find((r) => r.kunci === rentang) ?? RENTANG_KENAIKAN[0];
  const kini = await hitungTotalNasional();

  if (rentang === "semua") {
    return {
      rentang,
      label: def.label,
      kenaikan: { ...kini.total },
      sekarang: kini.total,
      dibanding_tanggal: "",
      catatan: "Angka total seluruh akun, bukan kenaikan.",
    };
  }

  // "Kemarin" dibaca sebagai kenaikan SEPANJANG hari kemarin: selisih
  // dua rekaman, bukan selisih terhadap angka sekarang — kalau tidak,
  // angka kemarin ikut berubah sepanjang hari ini berjalan.
  if (rentang === "kemarin") {
    const [akhir, awal] = await Promise.all([
      rekamanSampai(tanggalWib(0)),
      rekamanSampai(tanggalWib(1)),
    ]);
    const cukup = Boolean(akhir && awal && akhir.tanggal_wib !== awal.tanggal_wib);
    return {
      rentang,
      label: def.label,
      kenaikan: cukup ? selisih(keMetrik(akhir!.total), keMetrik(awal!.total)) : kosong(),
      sekarang: kini.total,
      dibanding_tanggal: cukup ? awal!.tanggal_wib : "",
      catatan: cukup
        ? `Selisih rekaman ${awal!.tanggal_wib} → ${akhir!.tanggal_wib}.`
        : "Belum ada dua rekaman harian untuk dibandingkan.",
    };
  }

  const dasar = await rekamanSampai(tanggalWib(def.hari === 0 ? 1 : def.hari));
  if (!dasar) {
    return {
      rentang,
      label: def.label,
      kenaikan: kosong(),
      sekarang: kini.total,
      dibanding_tanggal: "",
      catatan:
        "Belum ada rekaman pembanding. Angka kenaikan mulai muncul setelah rekaman harian berjalan.",
    };
  }

  return {
    rentang,
    label: def.label,
    kenaikan: selisih(kini.total, keMetrik(dasar.total)),
    sekarang: kini.total,
    dibanding_tanggal: dasar.tanggal_wib,
    catatan: `Dibandingkan dengan rekaman ${dasar.tanggal_wib}.`,
  };
}

function kosong(): Record<IndikatorTvr, number | null> {
  return metrikTvrKosong();
}

/**
 * a − b per indikator.
 *
 * Hasil negatif DIBIARKAN NEGATIF, tidak dipaksa nol: pengikut memang
 * bisa berkurang, dan menyembunyikannya membuat panel ini berbohong.
 */
export function selisih(a: MetrikTvr, b: MetrikTvr): Record<IndikatorTvr, number | null> {
  const hasil = metrikTvrKosong();
  for (const k of INDIKATOR_TVR) {
    const x = a[k];
    const y = b[k];
    hasil[k] = typeof x === "number" && typeof y === "number" ? x - y : null;
  }
  return hasil;
}
