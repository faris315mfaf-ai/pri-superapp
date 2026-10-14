// ============================================================
// KARAKTER PENGGUNA — kolam 288 rupa pixel-art (14 Okt 2026). Murni.
//
// Tiap pengguna online mendapat satu rupa dari server (`karakter`, 0..287, unik di antara yang
// online; lihat lib/dunia-murni.tetapkanKarakter). Di sini nomor itu diterjemahkan menjadi
// RupaBot: 24 warna kaus x 12 "wajah" (kulit, rambut, gaya, celana, aksesori). Dua nomor berbeda
// selalu berbeda rupa (pasangan kaus + wajah-nya tidak pernah sama).
// ============================================================

import { UKURAN_KOLAM_KARAKTER } from "@/lib/dunia-murni";
import { gelapkan } from "./sprite-bot";
import type { RupaBot } from "./tipe";

/** 24 warna kaus yang tersebar rata di lingkaran warna + beberapa netral. */
export const WARNA_KAUS: readonly string[] = [
  "#e5484d", "#f76b15", "#f5a524", "#e5c100", "#a3c93a", "#4cae6b",
  "#2fa88a", "#1fa7b0", "#3b9be0", "#4a6fe0", "#6f5ce0", "#9a5de0",
  "#c552d6", "#e5559b", "#d96b5b", "#8a6a4a", "#5f7a8a", "#3d4a63",
  "#2c2f3a", "#8d95a3", "#e8e0d0", "#7bc4a4", "#c9a15c", "#b04a6a",
];

type Wajah = Pick<RupaBot, "kulit" | "rambut" | "gayaRambut" | "celana"> & Partial<Pick<RupaBot, "kacamata" | "berhud" | "warnaTopi">>;

/** 12 "wajah": kombinasi kulit, rambut, gaya, celana, dan aksesori yang berbeda satu sama lain. */
export const WAJAH: readonly Wajah[] = [
  { kulit: "#f0c29a", rambut: "#3b2418", gayaRambut: "pendek", celana: "#3a4a78" },
  { kulit: "#e8b48a", rambut: "#1d1a24", gayaRambut: "panjang", celana: "#2f3358" },
  { kulit: "#d9a07a", rambut: "#5a3a1a", gayaRambut: "topi", warnaTopi: "#2d6a4f", celana: "#4a3a2a" },
  { kulit: "#c68a60", rambut: "#1a1210", gayaRambut: "pendek", kacamata: true, celana: "#2b3a4a" },
  { kulit: "#a8714a", rambut: "#0f0c0a", gayaRambut: "panjang", celana: "#4a2f3a" },
  { kulit: "#8a5a3a", rambut: "#2a1a10", gayaRambut: "topi", warnaTopi: "#a33a3a", celana: "#2f4a3a" },
  { kulit: "#f3d2b0", rambut: "#8a5a2a", gayaRambut: "pendek", celana: "#3a3a52" },
  { kulit: "#e8b48a", rambut: "#c2a15a", gayaRambut: "panjang", kacamata: true, celana: "#3a4a78" },
  { kulit: "#d9a07a", rambut: "#2a1a2e", gayaRambut: "pendek", berhud: true, celana: "#2f3358" },
  { kulit: "#c68a60", rambut: "#6a2a1a", gayaRambut: "panjang", berhud: true, celana: "#4a3a2a" },
  { kulit: "#f0c29a", rambut: "#1d1a24", gayaRambut: "topi", warnaTopi: "#3a4a78", kacamata: true, celana: "#3a3a3a" },
  { kulit: "#a8714a", rambut: "#3b2418", gayaRambut: "pendek", berhud: true, celana: "#2b3a4a" },
];

export const JUMLAH_KARAKTER = WARNA_KAUS.length * WAJAH.length;

/** Rupa untuk satu nomor karakter. Nomor di luar kolam dibungkus (modulo) supaya tidak pernah gagal. */
export function rupaKarakter(nomor: number): RupaBot {
  const n = ((Math.trunc(nomor) % JUMLAH_KARAKTER) + JUMLAH_KARAKTER) % JUMLAH_KARAKTER;
  const kaus = WARNA_KAUS[n % WARNA_KAUS.length];
  const w = WAJAH[Math.floor(n / WARNA_KAUS.length)];
  return { kaus, bayangan: gelapkan(kaus, 0.8), ...w };
}

/** Warna lencana/aksen karakter (untuk tag nama). */
export function warnaKarakter(nomor: number): string {
  return rupaKarakter(nomor).kaus;
}

// Kolam server dan klien harus sama besar; salah satunya berubah = nomor karakter bergeser diam-diam.
if (JUMLAH_KARAKTER !== UKURAN_KOLAM_KARAKTER) {
  throw new Error(`Kolam karakter tidak sinkron: klien ${JUMLAH_KARAKTER} vs server ${UKURAN_KOLAM_KARAKTER}`);
}
