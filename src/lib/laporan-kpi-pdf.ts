// ============================================================
// Penyusun data LAPORAN KPI VIDEO SUPERAPPS (tabel PDF, 6 Sep 2026).
// Dipisah dari route supaya bisa diuji tanpa jsPDF dan karena berkas
// route Next hanya boleh mengekspor handler HTTP.
// ============================================================

export const URUTAN_PLATFORM = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter", "bilibili"];
export const LABEL_PLATFORM: Record<string, string> = { instagram: "INSTAGRAM", tiktok: "TIKTOK", youtube: "YOUTUBE", facebook: "FACEBOOK", threads: "THREADS", twitter: "X", bilibili: "BILIBILI", website: "WEBSITE" };

export function urutPlatform(a: string, b: string): number {
  return ((URUTAN_PLATFORM.indexOf(a) + 100) % 100) - ((URUTAN_PLATFORM.indexOf(b) + 100) % 100);
}

export type BarisLaporanKpi = { user_id: number; platform: string; url_video: string; dibuat_pada?: string };
export type BarisKpiPdf = {
  no: number;
  user_id: number;
  nama: string;
  divisi: string;
  akun: { platform: string; username: string }[];
  jumlah: number;
  per_platform: { platform: string; link: string[] }[];
};

/** Kelompokkan laporan → per orang → per platform (link unik), urut jumlah terbanyak. */
export function susunBarisKpi(
  laporan: BarisLaporanKpi[],
  orangPer: Map<number, { nama: string; divisi: string }>,
  akunPer: Map<number, { platform: string; username: string }[]>,
): BarisKpiPdf[] {
  const perOrang = new Map<number, Map<string, Set<string>>>();
  for (const b of laporan) {
    const u = Number(b.user_id);
    const pf = String(b.platform ?? "").toLowerCase();
    const link = String(b.url_video ?? "").trim();
    if (!link) continue;
    if (!perOrang.has(u)) perOrang.set(u, new Map());
    const m = perOrang.get(u)!;
    if (!m.has(pf)) m.set(pf, new Set());
    m.get(pf)!.add(link);
  }
  return [...perOrang.entries()]
    .map(([uid, m]) => {
      const info = orangPer.get(uid) ?? { nama: `#${uid}`, divisi: "" };
      const per = [...m.entries()].sort((a, b) => urutPlatform(a[0], b[0])).map(([platform, set]) => ({ platform, link: [...set] }));
      return {
        no: 0,
        user_id: uid,
        nama: info.nama,
        divisi: info.divisi,
        akun: (akunPer.get(uid) ?? []).slice().sort((a, b) => urutPlatform(a.platform, b.platform)),
        jumlah: per.reduce((n, p) => n + p.link.length, 0),
        per_platform: per,
      };
    })
    .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama))
    .map((b, i) => ({ ...b, no: i + 1 }));
}

/** Kolom "Rekap Link": PLATFORM (n) lalu daftar bernomor — format template laporan upload. */
export function teksRekapKpi(b: BarisKpiPdf): string {
  return b.per_platform.map((p) => [`${LABEL_PLATFORM[p.platform] ?? p.platform.toUpperCase()} (${p.link.length})`, ...p.link.map((u, i) => `${i + 1}) ${u}`)].join("\n")).join("\n");
}

/** Kolom "Akun TV Rakyat Pribadi": satu baris per platform. */
export function teksAkunKpi(b: BarisKpiPdf): string {
  if (b.akun.length === 0) return "-";
  return b.akun.map((a) => `${LABEL_PLATFORM[a.platform] ?? a.platform.toUpperCase()}: @${a.username.replace(/^@/, "")}`).join("\n");
}
