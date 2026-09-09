// ============================================================
// Peran tersembunyi & pengurus pusat (10 Sep 2026) — aman server & klien.
//
// Dua akun sistem TIDAK boleh muncul di layar mana pun (roster,
// leaderboard, database anggota, penerima pengumuman, tim, dst.):
//   - master     : pemilik sistem (tersembunyi sejak awal).
//   - superadmin : akun operasional pusat — Dashboard penuh (absensi, KPI
//                  anggota, kepatuhan komen, TV Rakyat, database anggota,
//                  TV Rakyat Nasional) + Konten penuh; TANPA modul TV
//                  Rakyat Official, chat, robot, dan perintah suara.
//
// Dulu tiap query menulis `.neq("role", "master")` sendiri-sendiri (16
// tempat). Sekarang satu konstanta, supaya peran tersembunyi berikutnya
// cukup ditambahkan di sini.
// ============================================================

export const PERAN_TERSEMBUNYI = ["master", "superadmin"] as const;

/** Nilai untuk `.not("role", "in", PERAN_TERSEMBUNYI_IN)` di supabase-js. */
export const PERAN_TERSEMBUNYI_IN = `(${PERAN_TERSEMBUNYI.join(",")})`;

export function peranTersembunyi(role?: string | null): boolean {
  return (PERAN_TERSEMBUNYI as readonly string[]).includes(role ?? "");
}

export function adalahSuperadmin(u: { role?: string | null } | null | undefined): boolean {
  return u?.role === "superadmin";
}

/**
 * master / super_admin (Ketua Umum) / superadmin — pemegang data lintas
 * anggota (dashboard penuh, kelola laporan KPI, rekap semua anggota).
 */
export function adalahPengurusPusat(u: { role?: string | null } | null | undefined): boolean {
  const r = u?.role ?? "";
  return r === "master" || r === "super_admin" || r === "superadmin";
}
