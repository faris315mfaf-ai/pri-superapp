// Enkripsi API key per bot (13 Okt 2026) — KHUSUS SISI SERVER.
//
// AES-256-GCM. Kunci induk = SHA-256 dari env BOT_KUNCI_INDUK (wajib >= 32
// karakter; buat dengan `openssl rand -base64 32`). Tiap nilai punya IV acak
// 12 byte, dan AAD = "bot:<id>" sehingga sandi satu bot TIDAK bisa dipindah ke
// baris bot lain (dekripsi gagal). Format: v1.<iv>.<tag>.<sandi> (base64url).
//
// Gagal-tertutup: tanpa kunci induk, enkripsi menolak (tidak pernah menyimpan
// polos) dan dekripsi mengembalikan null. Kunci polos tidak pernah masuk log.
import crypto from "node:crypto";

const VERSI = "v1";
const PANJANG_INDUK_MIN = 32;

export class KunciIndukHilang extends Error {
  constructor() {
    super("BOT_KUNCI_INDUK belum diatur di server (minimal 32 karakter).");
  }
}

function turunkanKunci(induk: string | undefined): Buffer {
  const nilai = (induk ?? "").trim();
  if (nilai.length < PANJANG_INDUK_MIN) throw new KunciIndukHilang();
  return crypto.createHash("sha256").update(nilai, "utf8").digest();
}

export function kunciIndukSiap(induk: string | undefined = process.env.BOT_KUNCI_INDUK): boolean {
  return (induk ?? "").trim().length >= PANJANG_INDUK_MIN;
}

const aad = (botId: number) => Buffer.from(`bot:${botId}`, "utf8");
const b64 = (b: Buffer) => b.toString("base64url");

export function enkripsiKunci(polos: string, botId: number, induk: string | undefined = process.env.BOT_KUNCI_INDUK): string {
  const kunci = turunkanKunci(induk);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", kunci, iv);
  cipher.setAAD(aad(botId));
  const sandi = Buffer.concat([cipher.update(polos, "utf8"), cipher.final()]);
  return [VERSI, b64(iv), b64(cipher.getAuthTag()), b64(sandi)].join(".");
}

/** Kunci polos, atau null bila format salah / bukan milik bot ini / kunci induk berganti / data rusak. */
export function dekripsiKunci(blob: string, botId: number, induk: string | undefined = process.env.BOT_KUNCI_INDUK): string | null {
  try {
    const bagian = String(blob ?? "").split(".");
    if (bagian.length !== 4 || bagian[0] !== VERSI) return null;
    const kunci = turunkanKunci(induk);
    const iv = Buffer.from(bagian[1], "base64url");
    const tag = Buffer.from(bagian[2], "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", kunci, iv);
    decipher.setAAD(aad(botId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(bagian[3], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
