// ============================================================
// Nama peristiwa yang dipakai bersama antar bagian aplikasi.
//
// Kenapa lewat peristiwa, bukan prop: pengirimnya berada jauh di dalam
// pohon komponen (panel di dalam beranda), sedangkan yang bisa berpindah
// tab hanyalah halaman utama. Mengoper satu fungsi menembus setiap
// lapisan di antaranya membuat banyak komponen ikut tahu urusan yang
// bukan urusannya.
//
// Dikumpulkan di satu berkas supaya nama peristiwanya tidak pernah
// ditulis dua kali dengan ejaan berbeda — kesalahan seperti itu tidak
// menimbulkan galat apa pun, hanya tombol yang diam saat ditekan.
// ============================================================

/** Minta halaman utama berpindah ke tab Chat. */
export const PERISTIWA_BUKA_CHAT = "pri:buka-chat";
