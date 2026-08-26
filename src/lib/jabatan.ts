// ============================================================
// Jabatan struktur partai — SATU sumber kebenaran.
//
// Dipakai server (validasi /api/pengguna) DAN klien (pemilih di
// Kelola Pengguna), jadi file ini tidak boleh mengimpor apa pun
// yang khusus server.
//
// Dua bagian per orang:
// - `jabatan`        : nilai BAKU dari daftar di bawah (untuk kuota).
// - `bidang_jabatan` : teks bebas pelengkap, mis. "Bidang IT dan
//   Infrastruktur" — sehingga tampil "Wakil Direktur Eksekutif
//   Bidang IT dan Infrastruktur".
// ============================================================

// Tujuh posisi resmi struktur pusat (spesifikasi Agustus 2026).
// Anggota biasa = jabatan kosong (bawaan), strukturnya lewat Divisi.
export const JABATAN_PARTAI = [
  "Ketua Umum",
  "Sekretaris Jenderal",
  "Wakil Sekretaris Jenderal",
  "Kepala Sekretariat",
  "Ketua HRD",
  "Pimpinan Redaksi TV Rakyat",
] as const;

/**
 * Kuota pemegang per jabatan. Tidak terdaftar = tanpa batas.
 * "Hanya 1" artinya menetapkan orang kedua DITOLAK sampai pemegang
 * lama dilepas dulu — bukan diam-diam menggantikan.
 */
export const KUOTA_JABATAN: Record<string, number> = {
  "Ketua Umum": 1,
  "Sekretaris Jenderal": 1,
  "Wakil Sekretaris Jenderal": 1,
  "Kepala Sekretariat": 1,
  "Ketua HRD": 1,
  // Khusus Pimred boleh DUA orang — modul TV butuh cadangan approver.
  "Pimpinan Redaksi TV Rakyat": 2,
};

/** "Wakil Direktur Eksekutif" + "Bidang IT" → "Wakil Direktur Eksekutif Bidang IT" */
export function jabatanLengkap(jabatan?: string | null, bidang?: string | null): string {
  const j = (jabatan ?? "").trim();
  const b = (bidang ?? "").trim();
  if (!j) return "";
  return b ? `${j} ${b}` : j;
}

/**
 * Pimpinan Redaksi TV Rakyat — pemegang hak penuh modul TV:
 * menyetujui/menolak video sebelum diunggah ke sosmed. Master ikut
 * dianggap pimred supaya sistem tidak pernah terkunci tanpa approver.
 */
export function adalahPimred(user: { role?: string; jabatan?: string | null }): boolean {
  if (user.role === "master") return true;
  return (user.jabatan ?? "").trim().startsWith("Pimpinan Redaksi");
}

/**
 * Boleh membentuk tim & memberi tugas: role KETUA yang memegang
 * jabatan struktur. Master ikut supaya sistem bisa diuji/diselamatkan.
 * Super admin & HR TIDAK membentuk tim — tugas mereka meng-ACC.
 */
export function bolehBentukTim(user: { role?: string; jabatan?: string | null }): boolean {
  if (user.role === "master") return true;
  return user.role === "ketua" && Boolean((user.jabatan ?? "").trim());
}

export type CakupanPengumuman = "semua" | "jabatan" | "tim";

/**
 * Cakupan pengumuman yang boleh dipakai seseorang, berjenjang:
 * - Ketua Umum (dan master): ke SEMUA, per divisi/jabatan, atau tim.
 * - Sekjen / Direktur Eksekutif / para Wakil: per divisi + tim —
 *   lebih luas dari pemimpin tim, tapi tidak menyapa seluruh partai.
 * - Pemegang jabatan lain (Manager Tim, Ketua Zona, dst.) dan ketua
 *   ber-tim: hanya ke anggota timnya sendiri.
 */
export function cakupanPengumuman(user: {
  role?: string;
  jabatan?: string | null;
}): CakupanPengumuman[] {
  const j = (user.jabatan ?? "").trim();
  if (user.role === "master" || j === "Ketua Umum") return ["semua", "jabatan", "tim"];
  if (
    j === "Sekretaris Jenderal" ||
    j === "Wakil Sekretaris Jenderal" ||
    j === "Kepala Sekretariat" ||
    j === "Ketua HRD"
  ) {
    return ["jabatan", "tim"];
  }
  if (j || user.role === "ketua") return ["tim"];
  return [];
}
