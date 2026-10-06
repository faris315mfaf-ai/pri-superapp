// ============================================================
// Jenis peristiwa Audit (6 Okt 2026) — dipakai bersama server (lib/audit)
// dan layar Audit. Satu tempat supaya nama jenis tidak pernah ditulis dua
// kali dengan ejaan berbeda (salah eja = peristiwa tak berlabel, diam-diam).
// ============================================================

export const JENIS_AUDIT = {
  login: { label: "Masuk aplikasi", kelompok: "akses" },
  daftar: { label: "Mendaftar akun", kelompok: "akses" },
  kendali: { label: "Dikendalikan admin", kelompok: "akses" },
  edit_otomatis: { label: "Edit Otomatis", kelompok: "video" },
  auto_edit: { label: "Auto Edit (master)", kelompok: "video" },
  kompres: { label: "Kompres Video", kelompok: "video" },
  blur_watermark: { label: "Blur Watermark", kelompok: "video" },
  hapus_latar: { label: "Hapus Latar", kelompok: "video" },
  template: { label: "Ubah template", kelompok: "video" },
  stok_tambah: { label: "Tambah ke Stok", kelompok: "video" },
  stok_hapus: { label: "Hapus dari Stok", kelompok: "video" },
  unggah_sosmed: { label: "Unggah ke sosmed", kelompok: "unggah" },
  unggah_official: { label: "Unggah TV Rakyat Official", kelompok: "unggah" },
  siaran: { label: "Siaran Serentak", kelompok: "unggah" },
  stok_tim: { label: "Kirim Stok Tim ke Official", kelompok: "unggah" },
  tv_riwayat: { label: "Tandai posting manual Official", kelompok: "unggah" },
  tv_official_up: { label: "Tautkan akun Official (upload-post)", kelompok: "unggah" },
} as const;

export type JenisAudit = keyof typeof JENIS_AUDIT;
export type KelompokAudit = (typeof JENIS_AUDIT)[JenisAudit]["kelompok"];

export const LABEL_KELOMPOK_AUDIT: Record<KelompokAudit, string> = {
  akses: "Login",
  video: "Alat video",
  unggah: "Unggahan",
};

export function labelJenisAudit(jenis: string): string {
  return (JENIS_AUDIT as Record<string, { label: string }>)[jenis]?.label ?? jenis;
}

export function kelompokJenisAudit(jenis: string): KelompokAudit | null {
  return (JENIS_AUDIT as Record<string, { kelompok: KelompokAudit }>)[jenis]?.kelompok ?? null;
}

/** Nama layar (kunci tab/sub-layar) yang terbaca manusia. */
export const LABEL_LAYAR_AUDIT: Record<string, string> = {
  beranda: "Beranda",
  konten: "Konten",
  qc: "HR Center",
  acara: "Acara",
  tv: "TV Rakyat Official",
  tvnas: "TV Rakyat Nasional",
  tvrku: "TVR Saya",
  dashboard: "Dashboard",
  asisten: "Asisten AI",
  chat: "Chat",
  notifikasi: "Notifikasi",
  profil: "Profil",
  audit: "Audit",
  // Sub-layar (page.tsx)
  absensi: "Absensi",
  "absensi-hari-ini": "Absensi Hari Ini",
  "atur-menu": "Atur Menu",
  "dashboard-kepatuhan": "Dashboard Kepatuhan",
  "dashboard-kpi": "KPI Video Anggota",
  "dashboard-tv": "Dashboard TV",
  database: "Database Anggota",
  "kelola-dashboard": "Kelola Dashboard",
  "kelola-laporan-kpi": "Kelola Laporan KPI",
  "kelola-pengguna": "Kelola Pengguna",
  "laporan-kerja": "Laporan Kerja",
  "leaderboard-komen": "Leaderboard Komen",
  ludo: "Ludo",
  "panel-master": "Panel Master",
  "pengaturan-fitur": "Pengaturan Fitur",
  pengumuman: "Kirim Pengumuman",
  "pengumuman-daftar": "Pengumuman",
  "persetujuan-kpi": "Persetujuan KPI",
  pet: "Pet Robot",
  "qc-akun": "QC Akun",
  "qc-postingan": "QC Postingan",
  "setel-kpi": "Setel KPI",
  "tabel-anggota": "Tabel Anggota",
  "tv-nasional": "TV Rakyat Nasional",
  lain: "Lainnya",
};

export function labelLayarAudit(kunci: string): string {
  return LABEL_LAYAR_AUDIT[kunci] ?? kunci;
}
