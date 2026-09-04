// ============================================================
// Akses fitur Pet Robot (5 Sep 2026) — aman dipakai server & klien.
//
// Aturan user: fitur pet DIMATIKAN untuk semua yang memiliki JABATAN.
// Master (pemilik sistem) tetap boleh, karena ia yang mengelola toko dan
// menguji fitur. Fungsi ini dipakai di page.tsx (sembunyikan robot
// melayang & menu), profil, dan penjaga /api/pet* (tolak 403).
// ============================================================

export function bolehPet(u: { role?: string | null; jabatan?: string | null } | null | undefined): boolean {
  if (!u) return false;
  if (u.role === "master") return true;
  return (u.jabatan ?? "").trim() === "";
}

export const PESAN_PET_DIMATIKAN = "Fitur Pet Robot tidak tersedia untuk pemegang jabatan.";
