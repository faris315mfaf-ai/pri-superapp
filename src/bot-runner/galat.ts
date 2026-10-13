// ============================================================
// RUMAH BOT (runner) — galat & pemetaan kode HTTP mesin → KodeGagal (13 Okt 2026).
// MURNI: tanpa jaringan. Hanya `import type` dari protokol (dihapus esbuild),
// jadi bundel runner tidak membawa apa pun dari src/lib.
// ============================================================

import type { KodeGagal } from "../lib/bot-protokol";

/** Galat dari API mesin Auto Edit (jawaban non-2xx, bentuk {"detail": ...}). */
export class GalatMesin extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`mesin ${status}: ${detail}`);
    this.name = "GalatMesin";
  }
}

/** Galat jaringan/soket ke mesin (status 0): soket tak ada, waktu habis, jawaban rusak. */
export function galatSambungMesin(pesan: string): GalatMesin {
  return new GalatMesin(0, pesan);
}

/** Galat dari aplikasi (jawaban non-2xx atau jaringan putus). status 0 = tak tersambung. */
export class GalatApp extends Error {
  constructor(
    public readonly status: number,
    pesan: string,
  ) {
    super(`aplikasi ${status}: ${pesan}`);
    this.name = "GalatApp";
  }
}

/**
 * Memetakan kode HTTP + pesan mesin ke KodeGagal protokol.
 *  - 409 "Buat dan tetapkan template dulu." / "Bahan template ... hilang" -> template_belum_ada
 *  - 409 "Stok video hampir penuh"                                         -> stok_penuh
 *  - 413 kuota penyimpanan                                                 -> kuota_penuh
 *  - 429 antrean akun/server penuh                                         -> antrean_penuh
 *  - 400 link ditolak                                                      -> sumber_ditolak
 * Selain itu "lainnya".
 */
export function kodeGagalDariHttp(status: number, detail: string): KodeGagal {
  const d = String(detail ?? "");
  if (status === 409) {
    if (/stok/i.test(d) && /penuh/i.test(d)) return "stok_penuh";
    if (/template/i.test(d)) return "template_belum_ada";
    return "lainnya";
  }
  if (status === 413) return "kuota_penuh";
  if (status === 429) return "antrean_penuh";
  if (status === 400) return "sumber_ditolak";
  return "lainnya";
}

/** Pesan galat yang aman dilaporkan (dipotong; tanpa jejak tumpukan). */
export function pesanGalat(e: unknown, maks = 300): string {
  const teks = e instanceof Error ? e.message : String(e);
  return teks.replace(/\s+/g, " ").trim().slice(0, maks);
}
