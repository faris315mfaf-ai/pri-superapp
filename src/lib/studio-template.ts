// ============================================================
// STUDIO TEMPLATE (16 Okt 2026) — gerbang rilis bertahap. Uji coba khusus akun
// Faris (#4 master, #176 anggota), sama dengan Karakter Saya. Dipakai gateway
// /api/autoedit (server) dan tombol Studio di Edit Otomatis (klien).
// ============================================================

const AKUN_UJI_STUDIO = new Set(["4", "176"]);

export function bolehStudioTemplate(u: { id?: string | number | null } | null | undefined): boolean {
  return u?.id != null && AKUN_UJI_STUDIO.has(String(u.id));
}
