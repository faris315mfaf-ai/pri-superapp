// ============================================================
// PRI SuperApp — Pengamanan kata sandi (KHUSUS SISI SERVER)
//
// Kata sandi TIDAK PERNAH disimpan apa adanya di database.
// Yang disimpan adalah hasil "scrypt" — fungsi satu arah: mudah
// dihitung dari sandi, mustahil dibalik jadi sandi lagi. Jadi
// walau isi database bocor, sandi aslinya tetap tidak terbaca.
//
// Memakai modul bawaan Node (node:crypto), tanpa paket tambahan.
// ============================================================
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  sandi: string,
  garam: Buffer,
  panjang: number,
) => Promise<Buffer>;

const PANJANG_GARAM = 16;
const PANJANG_KUNCI = 64;

/**
 * Ubah kata sandi jadi hash untuk disimpan.
 * Format: "scrypt$<garam hex>$<hash hex>" — garam acak per pengguna
 * supaya dua orang bersandi sama tetap menghasilkan hash berbeda.
 */
export async function buatHashSandi(sandi: string): Promise<string> {
  const garam = randomBytes(PANJANG_GARAM);
  const kunci = await scryptAsync(sandi, garam, PANJANG_KUNCI);
  return `scrypt$${garam.toString("hex")}$${kunci.toString("hex")}`;
}

/**
 * Cocokkan kata sandi yang diketik dengan hash tersimpan.
 * Perbandingannya memakai timingSafeEqual agar lama waktu proses
 * tidak membocorkan seberapa banyak karakter yang sudah benar.
 */
export async function cocokkanSandi(
  sandi: string,
  hashTersimpan: string,
): Promise<boolean> {
  const bagian = hashTersimpan.split("$");
  if (bagian.length !== 3 || bagian[0] !== "scrypt") return false;

  const garam = Buffer.from(bagian[1], "hex");
  const asli = Buffer.from(bagian[2], "hex");
  if (garam.length !== PANJANG_GARAM || asli.length !== PANJANG_KUNCI) return false;

  const dicoba = await scryptAsync(sandi, garam, PANJANG_KUNCI);
  return timingSafeEqual(asli, dicoba);
}
