// ============================================================
// PRI SuperApp — Akun sosmed wajib yang dipantau QC
// ============================================================
import type { AkunWajib } from "@/types";

export const akunWajib: AkunWajib[] = [
  {
    id: "aw-01",
    akun_wajib: "dpp.pri",
    nama_tampilan: "DPP Partai Rakyat Indonesia",
    platform: "instagram",
    avatar_url: "",
    aktif: true,
  },
  {
    id: "aw-02",
    akun_wajib: "muhammad.nazaruddin_",
    nama_tampilan: "Muhammad Nazaruddin",
    platform: "instagram",
    avatar_url: "",
    aktif: true,
  },
  {
    id: "aw-03",
    akun_wajib: "tvrakyat.official",
    nama_tampilan: "TV Rakyat Official",
    platform: "instagram",
    avatar_url: "",
    aktif: true,
  },
];

/**
 * Daftar platform untuk chip filter di UI.
 * UI bertanggung jawab menandai platform selain "instagram"
 * sebagai "Segera hadir".
 */
export const platformTersedia: string[] = [
  "instagram",
  "tiktok",
  "twitter",
  "facebook",
  "threads",
  "youtube",
];
