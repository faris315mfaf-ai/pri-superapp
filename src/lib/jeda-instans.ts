// ============================================================
// Pembatas "paling sering sekali per jeda" per proses (28 Sep 2026).
//
// Banyak GET menumpangkan pekerjaan bersih-bersih lewat after() (hapus
// foto absensi usang, hapus komentar kedaluwarsa, pengingat acara, klaim
// siaran ulang tahun …). Tanpa pembatas, pekerjaan itu — 1-3 kueri —
// ikut dijalankan pada SETIAP pembukaan layar oleh setiap pengguna,
// padahal hasilnya baru berubah dalam hitungan menit/jam. Pola ini sama
// borosnya dengan N+1: jumlah kueri tumbuh mengikuti jumlah pengguna.
//
// Klaim atomik lintas proses (pengaturan_sistem) tetap dipakai di tempat
// yang membutuhkannya; berkas ini hanya memotong kueri berulang dari
// proses yang sama.
// ============================================================

const terakhir = new Map<string, number>();

/**
 * true bila pekerjaan `kunci` boleh jalan sekarang (lalu dicatat);
 * false bila sudah jalan kurang dari `jedaMs` yang lalu di proses ini.
 */
export function bolehSekarang(kunci: string, jedaMs: number, kini: number = Date.now()): boolean {
  const lalu = terakhir.get(kunci);
  if (lalu !== undefined && kini - lalu < jedaMs) return false;
  terakhir.set(kunci, kini);
  return true;
}

/** Khusus uji. */
export function kosongkanJedaInstans() {
  terakhir.clear();
}
