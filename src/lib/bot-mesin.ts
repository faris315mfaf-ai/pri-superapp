// ============================================================
// BOT REDAKSI — mesin keputusan (13 Okt 2026).
//
// MURNI: tanpa DB/jaringan. Diberi keadaan sebuah bot, memutuskan APA yang
// harus dilakukan sekarang. Semua pagar keselamatan (jeda, jam aktif, kuota,
// gagal beruntun, tugas ganda) hidup DI SINI dan diuji; bukan di UI.
//
// Alur Pekerjaan 2 (tanpa posting):
//   (tanpa tugas) → kuota & kandidat → buat_video → [mesin: unduh+render] → siap_ditinjau
// Mesin Auto Edit tidak punya langkah unduh terpisah: unduh sumber terjadi di
// DALAM job render (status downloading), jadi di sini "unduh+render" satu tahap
// bernama `edit`. Tahap `posting` dst. baru berlaku di Pekerjaan 3.
// ============================================================

export type TahapTugas =
  | "cari"
  | "pilih"
  | "unduh"
  | "edit"
  | "siap_ditinjau"
  | "menunggu_acc"
  | "disetujui"
  | "posting"
  | "selesai"
  | "gagal";

/** Tahap yang masih "hidup" (tugas aktif): belum berakhir dan belum menunggu manusia. */
export const TAHAP_AKTIF_OTOMATIS: readonly TahapTugas[] = ["cari", "pilih", "unduh", "edit"];

export const KEBIJAKAN = {
  /** Berhenti otomatis setelah sekian gagal berturut-turut. */
  MAKS_GAGAL_BERUNTUN: 3,
  /** Percobaan per langkah sebelum tugas ditandai gagal. */
  MAKS_PERCOBAAN: 3,
  /** Klaim kandidat yang tak maju dilepas setelah sekian menit. */
  KLAIM_BASI_MENIT: 30,
  /** Job render yang tak selesai dalam sekian menit dianggap macet. */
  JOB_MACET_MENIT: 45,
} as const;

export type KeadaanBot = {
  aktif: boolean;
  jeda: boolean;
  kuotaHarian: number;
  /** "HH:MM" WIB. */
  jamMulai: string;
  jamSelesai: string;
  gagalBeruntun: number;
  /** Tugas yang DIBUAT hari ini (WIB) — kuota dihitung dari sini, bukan hanya yang selesai. */
  dibuatHariIni: number;
};

export type KeadaanGlobal = {
  jedaGlobal: boolean;
  /** Menit sejak tengah malam WIB. */
  menitWib: number;
};

export type TugasAktif = {
  id: number;
  tahap: TahapTugas;
  /** Epoch ms; tugas dikunci proses lain sampai waktu ini. */
  dikunciSampaiMs: number | null;
  percobaan: number;
  /** Epoch ms perubahan terakhir. */
  diubahPadaMs: number;
};

export type AlasanDiam =
  | "nonaktif"
  | "jeda_global"
  | "jeda_bot"
  | "gagal_beruntun"
  | "di_luar_jam"
  | "kuota_habis"
  | "terkunci"
  | "menunggu_manusia";

export type Putusan =
  | { aksi: "diam"; alasan: AlasanDiam }
  | { aksi: "mulai_tugas" }
  | { aksi: "lanjut"; tugasId: number; tahap: TahapTugas }
  | { aksi: "gagalkan"; tugasId: number; alasan: "percobaan_habis" | "macet" };

/** "HH:MM" → menit sejak tengah malam; -1 bila tidak sah. */
export function menitDariJam(jam: string): number {
  const m = /^([0-2]\d):([0-5]\d)$/.exec(jam);
  if (!m) return -1;
  const j = Number(m[1]);
  return j > 23 ? -1 : j * 60 + Number(m[2]);
}

/**
 * Di dalam jam aktif? Mendukung rentang yang melewati tengah malam
 * (mis. 22:00–02:00). Jam rusak atau mulai = selesai → TIDAK aktif (gagal tertutup).
 */
export function dalamJamAktif(jamMulai: string, jamSelesai: string, menitWib: number): boolean {
  const a = menitDariJam(jamMulai);
  const b = menitDariJam(jamSelesai);
  if (a < 0 || b < 0 || a === b) return false;
  if (a < b) return menitWib >= a && menitWib < b;
  return menitWib >= a || menitWib < b;
}

/** Tahap berikut untuk Pekerjaan 2: berhenti di siap_ditinjau (posting belum ada). */
export function tahapSetelah(tahap: TahapTugas): TahapTugas | null {
  switch (tahap) {
    case "cari":
      return "pilih";
    case "pilih":
      return "unduh";
    case "unduh":
      return "edit";
    case "edit":
      return "siap_ditinjau";
    default:
      return null;
  }
}

/**
 * Putusan untuk SATU bot saat ini. Urutan pemeriksaan adalah kebijakan:
 *  1. Pagar absolut: nonaktif, jeda global, jeda bot, gagal beruntun.
 *  2. Tugas aktif: dikunci → diam; macet/percobaan habis → gagalkan; selain itu lanjut.
 *     (Tugas yang sedang dikerjakan boleh DILANJUTKAN di luar jam aktif — memantau render
 *     tidak membuat apa pun tayang — tetapi tugas BARU tidak.)
 *  3. Tanpa tugas: di luar jam aktif → diam; kuota habis → diam; selain itu mulai tugas.
 */
export function putuskan(bot: KeadaanBot, global: KeadaanGlobal, tugas: TugasAktif | null, sekarangMs: number): Putusan {
  if (!bot.aktif) return { aksi: "diam", alasan: "nonaktif" };
  if (global.jedaGlobal) return { aksi: "diam", alasan: "jeda_global" };
  if (bot.jeda) return { aksi: "diam", alasan: "jeda_bot" };
  if (bot.gagalBeruntun >= KEBIJAKAN.MAKS_GAGAL_BERUNTUN) return { aksi: "diam", alasan: "gagal_beruntun" };

  if (tugas) {
    if (tugas.tahap === "siap_ditinjau" || tugas.tahap === "menunggu_acc") return { aksi: "diam", alasan: "menunggu_manusia" };
    if (!TAHAP_AKTIF_OTOMATIS.includes(tugas.tahap)) return { aksi: "diam", alasan: "menunggu_manusia" };
    if (tugas.dikunciSampaiMs !== null && tugas.dikunciSampaiMs > sekarangMs) return { aksi: "diam", alasan: "terkunci" };
    if (tugas.percobaan >= KEBIJAKAN.MAKS_PERCOBAAN) return { aksi: "gagalkan", tugasId: tugas.id, alasan: "percobaan_habis" };
    if (sekarangMs - tugas.diubahPadaMs > KEBIJAKAN.JOB_MACET_MENIT * 60_000) return { aksi: "gagalkan", tugasId: tugas.id, alasan: "macet" };
    return { aksi: "lanjut", tugasId: tugas.id, tahap: tugas.tahap };
  }

  if (!dalamJamAktif(bot.jamMulai, bot.jamSelesai, global.menitWib)) return { aksi: "diam", alasan: "di_luar_jam" };
  if (bot.dibuatHariIni >= bot.kuotaHarian) return { aksi: "diam", alasan: "kuota_habis" };
  return { aksi: "mulai_tugas" };
}

/** Klaim kandidat basi? (tidak maju dalam KLAIM_BASI_MENIT) */
export function klaimBasi(diklaimPadaMs: number | null, sekarangMs: number): boolean {
  if (diklaimPadaMs === null) return false;
  return sekarangMs - diklaimPadaMs > KEBIJAKAN.KLAIM_BASI_MENIT * 60_000;
}
