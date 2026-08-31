// ============================================================
// Jendela periode QC (31 Agu 2026) — SATU sumber kebenaran.
//
// PERMINTAAN USER: hari QC bukan lagi kalender 00:00-23:59, melainkan
// 17:00 WIB s.d. 16:59 WIB HARI BERIKUTNYA ("jam 00.00-nya QC = 17.00").
// Postingan yang terbit dalam jendela itu masuk periode tanggal MULAI.
// Lewat jendela = beku (tidak discrape/diperiksa lagi — jadi riwayat).
//
// Label periode: "YYYY-MM-DD 17:00-16:59" (tanggal = hari jendela mulai).
// Data LAMA berlabel "YYYY-MM-DD 00:00-23:59" tetap terbaca sebagai
// riwayat — parser di sini memahami KEDUA format.
// ============================================================

/** Jam mulai hari QC (WIB). */
export const JAM_MULAI_QC = 17;

const MS_JAM = 3600_000;
const MS_HARI = 24 * MS_JAM;

/** "YYYY-MM-DD" WIB dari epoch ms. */
function tanggalWibDari(ms: number): string {
  return new Date(ms + 7 * MS_JAM).toISOString().slice(0, 10);
}

/** Label periode format BARU untuk tanggal-mulai tertentu. */
export function periodeDariTanggal(tanggal: string): string {
  return `${tanggal} 17:00-16:59`;
}

/**
 * Periode QC SAAT INI. Sebelum 17:00 WIB, jendela yang berjalan adalah
 * milik KEMARIN (mulai kemarin 17:00); sejak 17:00, milik hari ini.
 */
export function periodeSaatIni(): string {
  const kini = Date.now();
  const jamWib = Number(
    new Date(kini + 7 * MS_JAM).toISOString().slice(11, 13),
  );
  const tanggalMulai =
    jamWib >= JAM_MULAI_QC ? tanggalWibDari(kini) : tanggalWibDari(kini - MS_HARI);
  return periodeDariTanggal(tanggalMulai);
}

/**
 * Awal jendela sebuah periode (epoch ms). Memahami dua format:
 * - "YYYY-MM-DD 17:00-16:59" → mulai 17:00 WIB tanggal itu (BARU)
 * - "YYYY-MM-DD 00:00-23:59" → mulai 00:00 WIB tanggal itu (LAMA)
 */
export function awalPeriodeMsDari(periode: string): number {
  const tanggal = periode.slice(0, 10);
  const jam = periode.includes("17:00-") ? "17:00:00" : "00:00:00";
  return new Date(`${tanggal}T${jam}+07:00`).getTime();
}

/** Akhir jendela (eksklusif) = awal + 24 jam. */
export function akhirPeriodeMsDari(periode: string): number {
  return awalPeriodeMsDari(periode) + MS_HARI;
}

/** true bila periode itu MASIH berjalan (jendelanya belum lewat). */
export function periodeMasihBerjalan(periode: string): boolean {
  return Date.now() < akhirPeriodeMsDari(periode);
}

/**
 * Dua kandidat label untuk satu tanggal-mulai (format baru + lama) —
 * dipakai kueri riwayat/agregasi supaya data sebelum & sesudah
 * pergantian aturan sama-sama terbaca.
 */
export function labelPeriodeUntukTanggal(tanggal: string): string[] {
  return [`${tanggal} 17:00-16:59`, `${tanggal} 00:00-23:59`];
}

/** Tanggal mulai berlakunya jendela 17:00-16:59. */
export const TANGGAL_ATURAN_BARU = "2026-08-31";

/**
 * Label periode untuk TANGGAL yang dipilih di pemilih riwayat: tanggal
 * sebelum aturan baru memakai label lama (00:00-23:59) supaya data
 * historisnya tetap ketemu; sejak cutover memakai label baru.
 */
export function periodeUntukTanggalPilih(tanggal: string): string {
  return tanggal >= TANGGAL_ATURAN_BARU
    ? `${tanggal} 17:00-16:59`
    : `${tanggal} 00:00-23:59`;
}
