
import { modulDibuka } from "@/lib/peran";
import { punyaDivisi } from "@/lib/struktur";// ============================================================
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

type UserRingkas =
  | { role?: string | null; divisi?: string | null; modul_izin?: unknown; struktur_lain?: unknown }
  | null
  | undefined;

/**
 * Apakah user berada di Divisi HR. Sejak struktur ganda (11 Sep 2026)
 * pertanyaannya dijawab dari SEMUA strukturnya: orang yang struktur
 * utamanya Zona tetapi juga anggota Divisi HR tetap orang HR.
 */
export function diDivisiHR(u: UserRingkas): boolean {
  if (!u) return false;
  return punyaDivisi(u, DIVISI_HR);
}

/**
 * "Orang HR" = anggota Divisi HR. (10 Sep 2026: peran lama `admin_hr`
 * tidak lagi dihitung — permintaan user "HR Center hanya untuk Divisi HR";
 * tidak ada akun ber-peran admin_hr yang tersisa di database.)
 */
export function adalahHR(u: UserRingkas): boolean {
  if (!u) return false;
  // Modul HR Center yang dibuka master per akun (10 Sep 2026) = orang HR.
  if (modulDibuka(u, "qc") === true) return true;
  return diDivisiHR(u);
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
