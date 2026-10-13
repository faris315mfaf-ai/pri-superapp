// ============================================================
// RUMAH BOT (runner) — tanda tangan permintaan ke aplikasi (13 Okt 2026).
// SALINAN SENGAJA dari src/lib/bot-hmac.ts (bagian penanda tangan saja):
// bundel runner tidak boleh mengimpor src/lib. tests/bot-runner/uji-hmac.mts
// memastikan hasilnya IDENTIK dengan yang diverifikasi server.
// ============================================================

import { createHmac, randomBytes } from "node:crypto";

export const HEADER_BOT_WAKTU = "x-bot-waktu";
export const HEADER_BOT_NONCE = "x-bot-nonce";
export const HEADER_BOT_TANDA = "x-bot-tanda";

/** HMAC-SHA256 heksadesimal atas `${waktuDetik}.${nonce}.${badan}`. */
export function hitungTandaBot(rahasia: string, waktuDetik: number, nonce: string, badan: string): string {
  return createHmac("sha256", rahasia).update(`${waktuDetik}.${nonce}.${badan}`).digest("hex");
}

/** Nonce acak 32 karakter heksadesimal (server menerima 16..64 [A-Za-z0-9_-]). */
export function buatNonce(): string {
  return randomBytes(16).toString("hex");
}

/** Header lengkap untuk satu permintaan bertanda tangan. */
export function headerTertanda(
  rahasia: string,
  badan: string,
  sekarangDetik: number = Math.floor(Date.now() / 1000),
  nonce: string = buatNonce(),
): Record<string, string> {
  return {
    [HEADER_BOT_WAKTU]: String(sekarangDetik),
    [HEADER_BOT_NONCE]: nonce,
    [HEADER_BOT_TANDA]: hitungTandaBot(rahasia, sekarangDetik, nonce, badan),
  };
}
