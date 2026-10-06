// ============================================================
// Wilayah administrasi Indonesia (7 Okt 2026) — 38 provinsi & 514
// kabupaten/kota, dari data Kepmendagri (cahyadsn/wilayah, MIT).
// Dipakai pendaftaran Sayap Partai (pilihan provinsi → kota) di klien
// dan validasinya di server.
// ============================================================

import data from "@/data/wilayah-indonesia.json";

export type Provinsi = { nama: string; kota: string[] };

export const WILAYAH: readonly Provinsi[] = data as Provinsi[];

export function provinsiSah(nama: string): boolean {
  return WILAYAH.some((p) => p.nama === nama);
}

/** Kota/kabupaten sah bila ada di provinsi yang dipilih. */
export function kotaSah(provinsi: string, kota: string): boolean {
  return WILAYAH.find((p) => p.nama === provinsi)?.kota.includes(kota) ?? false;
}
