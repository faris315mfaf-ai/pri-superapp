// ============================================================
// Jendela periode QC — SATU sumber kebenaran.
//
// SEJARAH ATURAN (semua WIB):
//   - s.d. 30 Agu 2026 : kalender 00:00–23:59      label "YYYY-MM-DD 00:00-23:59"
//   - 31 Agu – 2 Sep    : 17:00 → 16:59 esoknya    label "YYYY-MM-DD 17:00-16:59"
//   - sejak 3 Sep 2026  : 19:00 → 18:59 esoknya    label "YYYY-MM-DD 19:00-18:59"
//     (permintaan user: "reset postingan setiap hari jam 19.00"; komentar
//      yang dihitung hanya yang ditulis 19:00 kemarin s.d. 18:59 hari ini).
//
// Postingan yang terbit dalam jendela masuk periode tanggal MULAI. Lewat
// jendela = beku (tidak discrape/diperiksa lagi — jadi riwayat). Parser di
// sini memahami KETIGA format supaya riwayat lama tetap terbaca.
// ============================================================

/** Jam mulai hari QC (WIB). */
export const JAM_MULAI_QC = 19;
/** Sufiks label periode aturan sekarang. */
const SUFIKS_KINI = "19:00-18:59";

const MS_JAM = 3600_000;
const MS_HARI = 24 * MS_JAM;

/** "YYYY-MM-DD" WIB dari epoch ms. */
function tanggalWibDari(ms: number): string {
  return new Date(ms + 7 * MS_JAM).toISOString().slice(0, 10);
}

/** Label periode aturan SEKARANG untuk tanggal-mulai tertentu. */
export function periodeDariTanggal(tanggal: string): string {
  return `${tanggal} ${SUFIKS_KINI}`;
}

/**
 * Periode QC SAAT INI. Sebelum 19:00 WIB, jendela yang berjalan adalah
 * milik KEMARIN (mulai kemarin 19:00); sejak 19:00, milik hari ini.
 */
export function periodeSaatIni(): string {
  const kini = Date.now();
  const jamWib = Number(new Date(kini + 7 * MS_JAM).toISOString().slice(11, 13));
  const tanggalMulai =
    jamWib >= JAM_MULAI_QC ? tanggalWibDari(kini) : tanggalWibDari(kini - MS_HARI);
  return periodeDariTanggal(tanggalMulai);
}

/** Jam mulai (WIB) yang tersirat dari label periode. */
function jamMulaiDariLabel(periode: string): string {
  if (periode.includes("19:00-")) return "19:00:00";
  if (periode.includes("17:00-")) return "17:00:00";
  return "00:00:00";
}

/**
 * Awal jendela sebuah periode (epoch ms). Memahami tiga format:
 * "YYYY-MM-DD 19:00-18:59" (kini), "YYYY-MM-DD 17:00-16:59" (31 Agu–2 Sep),
 * "YYYY-MM-DD 00:00-23:59" (lama).
 */
export function awalPeriodeMsDari(periode: string): number {
  const tanggal = periode.slice(0, 10);
  return new Date(`${tanggal}T${jamMulaiDariLabel(periode)}+07:00`).getTime();
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
 * Semua kandidat label untuk satu tanggal-mulai (tiga era aturan) —
 * dipakai kueri riwayat/agregasi supaya data sebelum & sesudah
 * pergantian aturan sama-sama terbaca.
 */
export function labelPeriodeUntukTanggal(tanggal: string): string[] {
  return [`${tanggal} ${SUFIKS_KINI}`, `${tanggal} 17:00-16:59`, `${tanggal} 00:00-23:59`];
}

/** Tanggal mulai berlakunya jendela 17:00-16:59 (era ke-2). */
export const TANGGAL_ATURAN_BARU = "2026-08-31";
/** Tanggal mulai berlakunya jendela 19:00-18:59 (era sekarang). */
export const TANGGAL_ATURAN_19 = "2026-09-03";

/**
 * Label periode untuk TANGGAL yang dipilih di pemilih riwayat, mengikuti
 * era aturan tanggal itu supaya data historisnya tetap ketemu.
 */
export function periodeUntukTanggalPilih(tanggal: string): string {
  if (tanggal >= TANGGAL_ATURAN_19) return `${tanggal} ${SUFIKS_KINI}`;
  if (tanggal >= TANGGAL_ATURAN_BARU) return `${tanggal} 17:00-16:59`;
  return `${tanggal} 00:00-23:59`;
}
