// ============================================================
// DESAIN APPLE (6 Okt 2026) — uji coba tampilan khusus akun Faris.
//
// Akun di daftar ini mendapat tema ala Apple (material kaca, tipografi
// sistem, warna & bayangan macOS — globals.css `html[data-desain="apple"]`)
// serta pilihan navigasi Sidebar ↔ Dock macOS di layar lebar. Akun lain
// tidak berubah sama sekali.
// ============================================================

/** #4 farismfaf (Master Shifu) dan #176 faris (M. Faris ahlul). */
const AKUN_DESAIN_APPLE = new Set(["4", "176"]);

export function bolehDesainApple(u: { id?: string | number | null } | null | undefined): boolean {
  return u?.id != null && AKUN_DESAIN_APPLE.has(String(u.id));
}

export type ModeNav = "sidebar" | "dock";
