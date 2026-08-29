// ============================================================
// Helper peran HR (fitur 1.22.x/1).
//
// DUA konsep berbeda digabung menjadi "orang HR":
//   - PERAN aplikasi `admin_hr` (Admin HR), ATAU
//   - DIVISI `"Divisi HR"` (siapa pun di divisi itu — anggota/ketua).
//
// "Orang HR" mendapat: modul HR Center + Kelola Pengguna, kirim
// pengumuman ke divisi/semua, dan akses modul Dashboard.
//
// Menetapkan/mengubah DIVISI/JABATAN/PERAN seseorang lebih ketat:
// hanya Divisi HR + Super Admin + Master (lihat bolehUbahSDM) — ini
// DITAMBAHKAN ke aturan lama tiap aksi, bukan menggantinya.
// ============================================================

export const DIVISI_HR = "Divisi HR";

type UserRingkas = { role?: string | null; divisi?: string | null } | null | undefined;

/** Apakah user berada di Divisi HR (perbandingan string, pola rumah). */
export function diDivisiHR(u: UserRingkas): boolean {
  return (u?.divisi ?? "").trim() === DIVISI_HR;
}

/** "Orang HR" = peran admin_hr ATAU anggota Divisi HR. */
export function adalahHR(u: UserRingkas): boolean {
  if (!u) return false;
  return u.role === "admin_hr" || diDivisiHR(u);
}

/**
 * Boleh menetapkan/mengubah divisi/jabatan/peran seseorang:
 * Divisi HR + Super Admin + Master. (Untuk aksi yang aturan lamanya
 * lebih longgar seperti ubah_divisi, gabungkan dengan aturan itu.)
 */
export function bolehUbahSDM(u: UserRingkas): boolean {
  if (!u) return false;
  return u.role === "master" || u.role === "super_admin" || diDivisiHR(u);
}
