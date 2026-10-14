// ============================================================
// KELOLA BOT — akun & profil bot (14 Okt 2026). Fungsi MURNI + tipe bersama.
//
// Menggantikan skrip scripts/buat-akun-bot.mjs: master membuat bot baru dari aplikasi
// (Profil -> Kelola Bot). Bot = satu akun superapp di Divisi BOT (tidak bisa login) + satu
// baris bot_redaksi (profil perilaku). Validasi & pemilihan username ada di sini supaya
// server dan layar memakai aturan yang sama dan bisa diuji tanpa DB.
// ============================================================

import { PERAN_MAKS, PERSONA_MAKS } from "@/lib/bot-otak-murni";
import { PLATFORM_SUMBER, normalkanPlatform } from "@/lib/bot-sumber";
import type { GayaRambutDb, ModeBotDb, RupaBotDb } from "@/lib/bot-tipe";

/** Paling banyak bot yang boleh dibuat dari layar (pagar sumber daya mesin). */
export const MAKS_BOT = 12;
export const NAMA_BOT_MAKS = 40;
export const HANDLE_BOT_MAKS = 64;
export const KUOTA_AWAL_BOT = 1;

export { PERAN_MAKS, PERSONA_MAKS, PLATFORM_SUMBER };

/** Aksi POST /api/bot/akun (master saja). */
export type AksiAkunBot =
  | { aksi: "buat"; nama: string; peran: string; persona: string; warna: string; handle: string; platform: string; rupa_indeks: number }
  | { aksi: "ubah"; bot_id: number; nama: string; peran: string; persona: string; warna: string; handle: string; platform: string; rupa_indeks?: number };

export type HasilBuatAkunBot = { id: number; user_id: number; username: string };

// ---------- rupa ----------

type Wajah = { kulit: string; rambut: string; gayaRambut: GayaRambutDb; celana: string; kacamata?: boolean; berhud?: boolean; warnaTopi?: string };

/** 10 rupa dasar; warna kaus mengikuti warna bot yang dipilih. */
export const WAJAH_BOT: readonly Wajah[] = [
  { kulit: "#e8b48a", rambut: "#3b2418", gayaRambut: "topi", warnaTopi: "#2d6a4f", celana: "#3a4a78", berhud: true },
  { kulit: "#d9a07a", rambut: "#2a1a2e", gayaRambut: "panjang", celana: "#2f3358" },
  { kulit: "#f0c29a", rambut: "#5a3a1a", gayaRambut: "pendek", celana: "#4a3a2a", kacamata: true },
  { kulit: "#c68a60", rambut: "#1a1210", gayaRambut: "pendek", celana: "#2b3a4a" },
  { kulit: "#a8714a", rambut: "#0f0c0a", gayaRambut: "panjang", celana: "#4a2f3a", kacamata: true },
  { kulit: "#8a5a3a", rambut: "#2a1a10", gayaRambut: "topi", warnaTopi: "#a33a3a", celana: "#2f4a3a" },
  { kulit: "#f3d2b0", rambut: "#8a5a2a", gayaRambut: "pendek", celana: "#3a3a52", berhud: true },
  { kulit: "#e8b48a", rambut: "#c2a15a", gayaRambut: "panjang", celana: "#3a4a78" },
  { kulit: "#d9a07a", rambut: "#6a2a1a", gayaRambut: "panjang", kacamata: true, celana: "#4a3a2a" },
  { kulit: "#c68a60", rambut: "#3b2418", gayaRambut: "topi", warnaTopi: "#3a4a78", celana: "#3a3a3a" },
];

/** Warna pilihan untuk bot (semuanya terbaca di atas latar gelap dan terang). */
export const WARNA_BOT_PILIHAN: readonly string[] = ["#f08a3c", "#a56bd1", "#4cae6b", "#3b9be0", "#e5484d", "#e5c100", "#2fa88a", "#e5559b"];

const POLA_WARNA = /^#[0-9a-fA-F]{6}$/;

function gelapkan(warna: string, faktor: number): string {
  const n = parseInt(warna.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * faktor);
  const g = Math.round(((n >> 8) & 255) * faktor);
  const b = Math.round((n & 255) * faktor);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Rupa bot dari nomor wajah + warna. Nomor di luar daftar dibungkus (tidak pernah gagal). */
export function rupaBot(indeks: number, warna: string): RupaBotDb {
  const n = ((Math.trunc(indeks) % WAJAH_BOT.length) + WAJAH_BOT.length) % WAJAH_BOT.length;
  const kaus = POLA_WARNA.test(warna) ? warna : "#5b8def";
  const w = WAJAH_BOT[n];
  return {
    kaus,
    bayangan: gelapkan(kaus, 0.8),
    celana: w.celana,
    kulit: w.kulit,
    rambut: w.rambut,
    gayaRambut: w.gayaRambut,
    ...(w.warnaTopi ? { warnaTopi: w.warnaTopi } : {}),
    ...(w.kacamata ? { kacamata: true } : {}),
    ...(w.berhud ? { berhud: true } : {}),
  };
}

// ---------- validasi ----------

const bersihBaris = (x: unknown, maks: number): string | null =>
  typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maks + 1) : null;

export type ProfilBotSah = { nama: string; peran: string; persona: string; warna: string; handle: string; platform: string };

/**
 * Saring masukan profil bot dari master. Mengembalikan nilai bersih atau satu pesan galat yang bisa
 * langsung ditampilkan. Persona boleh berbaris-baris (dirapikan oleh normalkanKepribadian di server).
 */
export function normalkanProfilBot(m: Record<string, unknown>): { ok: true; nilai: ProfilBotSah } | { ok: false; pesan: string } {
  const nama = bersihBaris(m.nama, NAMA_BOT_MAKS);
  if (!nama) return { ok: false, pesan: "Nama bot wajib diisi." };
  if (nama.length > NAMA_BOT_MAKS) return { ok: false, pesan: `Nama bot maksimal ${NAMA_BOT_MAKS} karakter.` };
  const peran = bersihBaris(m.peran, PERAN_MAKS);
  if (!peran) return { ok: false, pesan: "Peran bot wajib diisi (mis. Redaktur Pencari)." };
  if (peran.length > PERAN_MAKS) return { ok: false, pesan: `Peran maksimal ${PERAN_MAKS} karakter.` };
  const persona = typeof m.persona === "string" ? m.persona.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim() : null;
  if (persona === null) return { ok: false, pesan: "Watak bot wajib diisi (boleh singkat)." };
  if (persona.length > PERSONA_MAKS) return { ok: false, pesan: `Watak maksimal ${PERSONA_MAKS} karakter.` };
  const warna = typeof m.warna === "string" ? m.warna.trim() : "";
  if (!POLA_WARNA.test(warna)) return { ok: false, pesan: "Warna tidak sah (format #rrggbb)." };
  const handleMentah = bersihBaris(m.handle, HANDLE_BOT_MAKS) ?? "";
  if (handleMentah.length > HANDLE_BOT_MAKS) return { ok: false, pesan: `Nama akun maksimal ${HANDLE_BOT_MAKS} karakter.` };
  if (handleMentah && !/^@?[\w.\-]{2,64}$/.test(handleMentah)) return { ok: false, pesan: "Nama akun sosmed hanya huruf, angka, titik, garis bawah, dan strip." };
  const platform = normalkanPlatform(m.platform);
  if (!platform) return { ok: false, pesan: `Platform utama harus salah satu dari ${PLATFORM_SUMBER.join(", ")}.` };
  return { ok: true, nilai: { nama, peran, persona, warna: warna.toLowerCase(), handle: handleMentah, platform } };
}

// ---------- username ----------

/** Username bot berikutnya: bot1, bot2, ... yang pertama belum dipakai (tak peka huruf besar-kecil). */
export function usernameBerikut(sudahAda: readonly string[]): string {
  const dipakai = new Set(sudahAda.map((u) => u.trim().toLowerCase()));
  for (let n = 1; n <= 999; n++) {
    const u = `bot${n}`;
    if (!dipakai.has(u)) return u;
  }
  throw new Error("Nomor username bot habis.");
}

/** Email internal akun bot (tidak pernah dikirimi surat; hanya memenuhi kolom wajib/unik). */
export const emailAkunBot = (username: string): string => `${username}@pri.local`;

export const PESAN_AKUN_BOT_TIDAK_BISA_LOGIN =
  "Akun ini milik bot: tidak bisa login. Anda mengendalikannya dari TVR Saya → Kendali Akun BOT, atau dari layar ini.";
