// ============================================================
// PRI SuperApp — Data pengguna aplikasi (demo)
// Password DISIMPAN di data mentah (tipe internal UserInternal)
// tetapi TIDAK PERNAH dikirim lewat respons API.
// ============================================================
import type { User } from "@/types";

/** Tipe internal: pengguna lengkap dengan password (hanya untuk pencocokan login) */
export type UserInternal = User & {
  password: string;
};

export const users: UserInternal[] = [
  {
    id: "u-super",
    nama: "Riswandani Isa",
    email: "super@pri.id",
    password: "demo123",
    role: "super_admin",
    avatar_url: "",
    jabatan: "Ketua Umum / Super Admin",
  },
  {
    id: "u-hr",
    nama: "Sari Wulandari",
    email: "hr@pri.id",
    password: "demo123",
    role: "admin_hr",
    avatar_url: "",
    jabatan: "Admin HR & QC Konten",
  },
  {
    id: "u-tv",
    nama: "Doni Pratama",
    email: "tv@pri.id",
    password: "demo123",
    role: "admin_tv",
    avatar_url: "",
    jabatan: "Admin TV Rakyat",
  },
];

/** Ubah pengguna mentah menjadi User publik (tanpa password) */
export function keUserPublik(u: UserInternal): User {
  return {
    id: u.id,
    nama: u.nama,
    email: u.email,
    role: u.role,
    avatar_url: u.avatar_url,
    jabatan: u.jabatan,
  };
}
