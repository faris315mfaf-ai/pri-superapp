// Versi aplikasi — SATU sumber kebenaran.
//
// Sebelumnya angka versi ditulis langsung di layar "Tentang Aplikasi",
// sehingga cepat basi: aplikasi sudah v1.4 sementara layarnya masih
// menulis v1.0.0. Nilai di bawah dibaca dari package.json saat build,
// jadi tidak bisa lagi berbeda dari versi sebenarnya.
//
// Menaikkan versi cukup di package.json — layar ikut sendiri.
export const VERSI_APLIKASI: string =
  process.env.NEXT_PUBLIC_VERSI_APLIKASI || "0.0.0";

/** "1.4.0" → "v1.4.0" untuk ditampilkan */
export const VERSI_TAMPIL = `v${VERSI_APLIKASI}`;
