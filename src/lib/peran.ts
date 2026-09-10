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

// ------------------------------------------------------------
// MODUL PER AKUN (10 Sep 2026): master membuka/menutup modul saat membuat
// akun di Panel Master. Disimpan di app_user.modul_izin (jsonb):
//   { dashboard: true, qc: false, ... }   true = dibuka, false = ditutup,
//   tidak ada / null = mengikuti peran & jabatan seperti biasa.
// Dipakai page.tsx (tab), dashboard-akses, hr, tv-tim, asisten (server).
// ------------------------------------------------------------
export const MODUL_AKUN = [
  { kunci: "dashboard", label: "Dashboard", keterangan: "Absensi, KPI anggota, kepatuhan komen, TV Rakyat, database, TV Nasional" },
  { kunci: "qc", label: "HR Center", keterangan: "Kelola pengguna, ACC KPI, kirim pengumuman" },
  { kunci: "tv", label: "TV Rakyat Official", keterangan: "Produksi & unggah video resmi" },
  { kunci: "tvrku", label: "TVR Saya", keterangan: "Akun sosmed pribadi & laporan video" },
  { kunci: "chat", label: "Chat", keterangan: "Percakapan antar anggota" },
  { kunci: "asisten", label: "Asisten AI", keterangan: "Chatbot & perintah suara" },
  { kunci: "acara", label: "Acara", keterangan: "Tanggal penting partai" },
] as const;

export type KunciModul = (typeof MODUL_AKUN)[number]["kunci"];
export type ModulIzin = Partial<Record<KunciModul, boolean>>;

const KUNCI_MODUL_SAH = new Set<string>(MODUL_AKUN.map((m) => m.kunci));

/** true = dibuka master, false = ditutup master, undefined = ikut peran. */
export function modulDibuka(
  u: { modul_izin?: unknown } | null | undefined,
  kunci: KunciModul,
): boolean | undefined {
  const izin = u?.modul_izin;
  if (!izin || typeof izin !== "object" || Array.isArray(izin)) return undefined;
  const v = (izin as Record<string, unknown>)[kunci];
  return typeof v === "boolean" ? v : undefined;
}

/** Saring masukan mentah jadi peta modul yang sah; null bila kosong. */
export function bersihkanModulIzin(mentah: unknown): ModulIzin | null {
  if (!mentah || typeof mentah !== "object" || Array.isArray(mentah)) return null;
  const hasil: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(mentah as Record<string, unknown>)) {
    if (KUNCI_MODUL_SAH.has(k) && typeof v === "boolean") hasil[k] = v;
  }
  return Object.keys(hasil).length > 0 ? (hasil as ModulIzin) : null;
}
