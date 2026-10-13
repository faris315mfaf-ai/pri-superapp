// ============================================================
// BOT REDAKSI — tipe bersama server & klien (13 Okt 2026).
// Bentuk jawaban GET /api/bot/status dan aksi POST /api/bot/kendali.
// Hanya TIPE: aman diimpor dari klien maupun server.
// ============================================================

export type ModeBotDb = "acc" | "otomatis";
export type TahapBotDb = "cari" | "edit" | "posting" | "istirahat";
export type GayaRambutDb = "pendek" | "panjang" | "topi";

/** Rupa karakter pixel-art (disimpan di bot_redaksi.rupa). */
export type RupaBotDb = {
  kaus: string;
  bayangan: string;
  celana: string;
  kulit: string;
  rambut: string;
  gayaRambut: GayaRambutDb;
  warnaTopi?: string;
  kacamata?: boolean;
  berhud?: boolean;
};

export type BotRingkas = {
  /** bot_redaksi.id */
  id: number;
  /** app_user.id akun bot (sekaligus id pengguna di mesin Auto Edit). */
  user_id: number;
  username: string;
  nama: string;
  peran: string;
  persona: string;
  warna: string;
  handle: string;
  platform: string;
  mode: ModeBotDb;
  rupa: RupaBotDb;
  kuota_harian: number;
  /** "HH:MM" WIB. */
  jam_mulai: string;
  jam_selesai: string;
  aktif: boolean;
  jeda: boolean;
  gagal_beruntun: number;
  /** Tugas selesai hari ini (WIB). */
  post_hari_ini: number;
  /** Jumlah akun sosmed tertaut di TVR Saya bot. */
  akun_tertaut: number;
};

export type LogBotDb = {
  id: number;
  bot_id: number;
  tahap: TahapBotDb;
  teks: string;
  dibuat_pada: string;
};

export type RunnerStatus = {
  /** true bila ada detak dalam 3 menit terakhir. */
  online: boolean;
  terakhir_denyut: string | null;
  versi: string | null;
};

export type StatusBot = {
  /** false bila migrasi sql/67 belum dijalankan. */
  tabel_ada: boolean;
  jeda_global: boolean;
  runner: RunnerStatus;
  bots: BotRingkas[];
  log: LogBotDb[];
};

export type AksiKendaliBot =
  | { aksi: "jeda_global"; nilai: boolean }
  | { aksi: "jeda_bot"; bot_id: number; nilai: boolean }
  | { aksi: "mode"; bot_id: number; nilai: ModeBotDb }
  | { aksi: "kuota"; bot_id: number; nilai: number };

/** Batas kuota harian per bot yang diterima server. */
export const KUOTA_BOT_MIN = 1;
export const KUOTA_BOT_MAKS = 6;
