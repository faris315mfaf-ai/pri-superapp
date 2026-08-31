// ============================================================
// Aturan KPI video (31 Agu 2026) — KHUSUS SISI SERVER.
//
// Target harian = 5 video x 6 platform = 30 link, KETAT PER PLATFORM:
// tercapai hanya bila SETIAP platform aktif berisi minimal 5 link
// (tak bisa diakali 30 link Instagram semua).
//
// Platform yang akunnya dilaporkan BANNED (tabel tvr_banned, dengan
// bukti screenshot) otomatis DIKECUALIKAN: target turun 5 per platform
// banned, seketika saat dilaporkan — tanpa menunggu persetujuan. HR
// bisa mencabut laporan yang janggal (buktinya terlihat).
//
// app_user.kpi_video kini bermakna TARGET PER PLATFORM (bawaan 5) —
// bukan lagi target total. Saat aturan ini dipasang TIDAK ADA satu pun
// akun dengan kpi_video terisi (diverifikasi ke DB), jadi tak ada
// perilaku lama yang berubah diam-diam. kpi_video = 0 berarti akun itu
// dibebaskan dari KPI sepenuhnya.
// ============================================================
import { supabase } from "@/lib/supabase";

/** Enam platform KPI, urutan tampil. */
export const PLATFORM_KPI = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
  "twitter",
] as const;

/** Target bawaan per platform per hari. */
export const KPI_PER_PLATFORM = 5;

export type RincianPlatform = {
  platform: string;
  jumlah: number;
  target: number;
  banned: boolean;
};

export type HasilKpi = {
  /** Total link yang dilaporkan (semua platform, termasuk banned). */
  jumlah: number;
  /** Target total = target/platform x jumlah platform aktif. */
  target_total: number;
  /** Tercapai KETAT: tiap platform aktif >= target per platform. */
  tercapai: boolean;
  per_platform: RincianPlatform[];
};

/**
 * Platform yang sedang BANNED per user (laporan aktif, belum dicabut).
 * Tanpa argumen = seluruh pengguna (untuk rekap massal).
 */
export async function bannedAktifPerUser(
  userIds?: number[],
): Promise<Map<number, Set<string>>> {
  let q = supabase()
    .from("tvr_banned")
    .select("user_id, platform")
    .is("dicabut_pada", null);
  if (userIds && userIds.length > 0) q = q.in("user_id", userIds);
  const { data } = await q;
  const peta = new Map<number, Set<string>>();
  for (const b of data ?? []) {
    const id = Number(b.user_id);
    const set = peta.get(id) ?? new Set<string>();
    set.add(String(b.platform));
    peta.set(id, set);
  }
  return peta;
}

/**
 * Hitung capaian KPI satu orang dari jumlah link per platform.
 * targetPerPlatform = app_user.kpi_video ?? 5; 0 = bebas KPI (tercapai).
 */
export function hitungKpi(
  jumlahPerPlatform: Map<string, number>,
  banned: Set<string>,
  targetPerPlatform: number = KPI_PER_PLATFORM,
): HasilKpi {
  const per: RincianPlatform[] = PLATFORM_KPI.map((p) => ({
    platform: p,
    jumlah: jumlahPerPlatform.get(p) ?? 0,
    target: banned.has(p) ? 0 : targetPerPlatform,
    banned: banned.has(p),
  }));
  const aktif = per.filter((r) => !r.banned);
  const jumlah = per.reduce((a, r) => a + r.jumlah, 0);
  return {
    jumlah,
    target_total: aktif.reduce((a, r) => a + r.target, 0),
    // Semua platform aktif harus memenuhi targetnya. Target 0 (kpi_video
    // = 0, dibebaskan penuh) otomatis tercapai.
    tercapai: aktif.every((r) => r.jumlah >= r.target),
    per_platform: per,
  };
}

/** Target per platform seorang user (kolom kpi_video; null = bawaan 5). */
export function targetPerPlatformDari(kpiVideo: unknown): number {
  const n = Number(kpiVideo);
  return kpiVideo != null && Number.isFinite(n) ? n : KPI_PER_PLATFORM;
}
