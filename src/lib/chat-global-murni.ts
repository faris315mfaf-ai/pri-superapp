// ============================================================
// CHAT GLOBAL RUANG BOT (14 Okt 2026) — aturan MURNI + tipe bersama.
// Satu room untuk semua anggota yang login. Teks saja, maks 500 karakter, kata kasar disamarkan,
// batas kirim per orang, master bisa menghapus & membisukan. Tanpa DB/React supaya teruji.
// ============================================================

export const MAKS_KARAKTER_CHAT = 500;
/** Batas kirim: sekian pesan per jendela detik per orang. */
export const BATAS_KIRIM = 5;
export const JENDELA_KIRIM_DETIK = 30;
/** Riwayat yang ditampilkan & disimpan. */
export const SIMPAN_HARI = 7;
/** Jumlah pesan yang dikirim saat layar dibuka. */
export const MAKS_PESAN_AWAL = 80;
/** Rentang lama bisu yang boleh dipilih master (menit). */
export const BISU_MIN_MENIT = 5;
export const BISU_MAKS_MENIT = 24 * 60;

export const TOPIK_CHAT_GLOBAL = "ruang-chat";
export const EVENT_CHAT_GLOBAL = "berubah";

export type PesanGlobal = {
  id: number;
  user_id: number;
  nama: string;
  /** Nomor rupa karakter (sama dengan karakternya di aula). */
  karakter: number;
  master: boolean;
  teks: string;
  dibuat_pada: string;
};

export type StatusChatGlobal = {
  tabel_ada: boolean;
  pesan: PesanGlobal[];
  /** ISO sampai kapan akun ini dibisukan; null = boleh kirim. */
  bisu_sampai: string | null;
  saya_master: boolean;
};

export type AksiChatGlobal =
  | { aksi: "kirim"; teks: string }
  | { aksi: "hapus"; id: number }
  | { aksi: "bisukan"; user_id: number; menit: number }
  | { aksi: "buka_bisu"; user_id: number };

/**
 * Kata kasar yang disamarkan (huruf pertama tetap, sisanya "*"). Dicocokkan sebagai kata utuh, tak peka huruf
 * besar-kecil, termasuk variasi pengulangan huruf ("anjiiing"). Daftar sengaja pendek dan jelas; bukan pengganti
 * moderasi master.
 */
const KATA_KASAR = [
  "anjing", "anjir", "bangsat", "bajingan", "brengsek", "keparat", "kampret", "kontol", "memek", "ngentot", "entot",
  "goblok", "goblog", "tolol", "idiot", "jancok", "jancuk", "asu", "babi", "pepek", "pantek", "lonte", "perek", "sundal",
];

function polaKata(kata: string): RegExp {
  // "anjing" → a+n+j+i+n+g+ : pengulangan huruf ikut tertangkap.
  const inti = [...kata].map((h) => `${h}+`).join("");
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${inti})(?=$|[^\\p{L}\\p{N}])`, "giu");
}
const POLA_KASAR = KATA_KASAR.map(polaKata);

/** Samarkan kata kasar: "anjing" → "a*****". */
export function saringKataKasar(teks: string): string {
  let hasil = teks;
  for (const pola of POLA_KASAR) {
    hasil = hasil.replace(pola, (_, awal: string, kata: string) => `${awal}${kata[0]}${"*".repeat(Math.max(1, kata.length - 1))}`);
  }
  return hasil;
}

/** Rapikan pesan masuk: buang karakter kontrol, rapatkan spasi, batasi baris kosong, saring kata kasar. */
export function normalkanPesan(mentah: unknown): { ok: true; teks: string } | { ok: false; pesan: string } {
  if (typeof mentah !== "string") return { ok: false, pesan: "Pesan kosong." };
  const bersih = mentah
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!bersih) return { ok: false, pesan: "Pesan kosong." };
  if (bersih.length > MAKS_KARAKTER_CHAT) return { ok: false, pesan: `Pesan maksimal ${MAKS_KARAKTER_CHAT} karakter.` };
  return { ok: true, teks: saringKataKasar(bersih) };
}

/** Lama bisu (menit) yang sah, atau null. */
export function menitBisuSah(x: unknown): number | null {
  const n = Number(x);
  if (!Number.isInteger(n) || n < BISU_MIN_MENIT || n > BISU_MAKS_MENIT) return null;
  return n;
}

/** Masih dibisukan pada `sekarangMs`? */
export function masihBisu(sampaiIso: string | null | undefined, sekarangMs: number): boolean {
  if (!sampaiIso) return false;
  const t = Date.parse(sampaiIso);
  return Number.isFinite(t) && t > sekarangMs;
}

/** Batas bawah riwayat (ISO) untuk `sekarangMs`. */
export function awalRiwayatIso(sekarangMs: number): string {
  return new Date(sekarangMs - SIMPAN_HARI * 24 * 3600_000).toISOString();
}
