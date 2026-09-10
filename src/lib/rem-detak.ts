// ============================================================
// REM DETAK (10 Sep 2026) — seberapa sering perangkat boleh berdetak.
//
// Detak adalah permintaan paling sering di aplikasi ini (tiap 10 detik,
// tiap perangkat yang terbuka). Karena itu SERVER yang menentukan
// iramanya, bukan klien: saat database melambat atau MODE HEMAT menyala,
// jedanya dilebarkan dan seluruh perangkat ikut mengerem pada detak
// berikutnya — tanpa menunggu cron pemantau (10 menit) atau rilis baru.
//
// Fungsi ini MURNI supaya bisa diuji tanpa server: masukannya keadaan,
// keluarannya jeda dalam detik.
//
// Ambang lambatnya sengaja disamakan dengan pemantau server
// (lib/pantau-server AMBANG.db_ms = 4000) supaya keduanya tidak
// berbeda pendapat tentang arti "database lambat".
// ============================================================

export const JEDA_NORMAL = 10;
export const JEDA_HEMAT = 30;
export const JEDA_LAMBAT = 30;
export const JEDA_SANGAT_LAMBAT = 60;

/** Database dianggap lambat mulai angka ini (ms) — sama dengan pemantau. */
export const AMBANG_LAMBAT_MS = 1500;
export const AMBANG_SANGAT_LAMBAT_MS = 4000;

/**
 * Jeda detak (detik) untuk keadaan server saat ini.
 * `dbMs` = lama kueri tanda terakhir; 0 berarti belum pernah diukur.
 */
export function jedaDetak(hemat: boolean, dbMs: number): number {
  const ms = Number.isFinite(dbMs) && dbMs > 0 ? dbMs : 0;
  if (ms >= AMBANG_SANGAT_LAMBAT_MS) return JEDA_SANGAT_LAMBAT;
  if (ms >= AMBANG_LAMBAT_MS) return JEDA_LAMBAT;
  if (hemat) return JEDA_HEMAT;
  return JEDA_NORMAL;
}

/**
 * Rata-rata bergerak sederhana: satu pengukuran yang kebetulan melonjak
 * (mis. instansi baru yang masih dingin) tidak boleh langsung mengerem
 * semua orang, tapi kelambatan yang bertahan harus cepat terbaca.
 */
export function ratakan(sebelumnya: number, baru: number, bobotBaru = 0.5): number {
  if (!Number.isFinite(baru) || baru <= 0) return sebelumnya;
  if (!Number.isFinite(sebelumnya) || sebelumnya <= 0) return baru;
  return Math.round(sebelumnya * (1 - bobotBaru) + baru * bobotBaru);
}
