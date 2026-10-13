// ============================================================
// BOT REDAKSI — tanda tangan permintaan runner → aplikasi (13 Okt 2026).
//
// "Rumah Bot" di VPS mesin hanya memegang SATU rahasia (BOT_RUNNER_SECRET).
// Tiap permintaan ke /api/bot/internal ditandatangani HMAC-SHA256 atas
// `${waktu}.${nonce}.${badan}`; server menolak tanda salah, permintaan di
// luar jendela waktu, dan nonce yang dipakai ulang (pemutaran ulang).
// Fungsi di sini MURNI (tanpa jaringan/DB) agar mudah diuji.
// ============================================================

import { createHmac, timingSafeEqual } from "node:crypto";

export const HEADER_BOT_WAKTU = "x-bot-waktu";
export const HEADER_BOT_NONCE = "x-bot-nonce";
export const HEADER_BOT_TANDA = "x-bot-tanda";

/** Selisih waktu yang diterima antara jam runner dan jam server. */
export const JENDELA_BOT_DETIK = 300;
/** Nonce: 16–64 karakter heksadesimal/alfanumerik. */
const POLA_NONCE = /^[A-Za-z0-9_-]{16,64}$/;

export function hitungTandaBot(rahasia: string, waktuDetik: number, nonce: string, badan: string): string {
  return createHmac("sha256", rahasia).update(`${waktuDetik}.${nonce}.${badan}`).digest("hex");
}

export type HasilVerifikasiBot = { sah: true } | { sah: false; alasan: string };

export function verifikasiTandaBot(opsi: {
  rahasia: string | undefined;
  waktu: string | null;
  nonce: string | null;
  tanda: string | null;
  badan: string;
  sekarangDetik: number;
}): HasilVerifikasiBot {
  const { rahasia, waktu, nonce, tanda, badan, sekarangDetik } = opsi;
  // Gagal tertutup: tanpa rahasia terkonfigurasi, semua permintaan ditolak.
  if (!rahasia || rahasia.length < 16) return { sah: false, alasan: "belum_dikonfigurasi" };
  if (!waktu || !nonce || !tanda) return { sah: false, alasan: "header_kurang" };
  if (!/^\d{9,12}$/.test(waktu)) return { sah: false, alasan: "waktu_tak_sah" };
  if (!POLA_NONCE.test(nonce)) return { sah: false, alasan: "nonce_tak_sah" };
  if (!/^[0-9a-f]{64}$/.test(tanda)) return { sah: false, alasan: "tanda_tak_sah" };
  const w = Number(waktu);
  if (Math.abs(sekarangDetik - w) > JENDELA_BOT_DETIK) return { sah: false, alasan: "kedaluwarsa" };
  const seharusnya = Buffer.from(hitungTandaBot(rahasia, w, nonce, badan), "hex");
  const diterima = Buffer.from(tanda, "hex");
  if (seharusnya.length !== diterima.length || !timingSafeEqual(seharusnya, diterima)) {
    return { sah: false, alasan: "tanda_salah" };
  }
  return { sah: true };
}
