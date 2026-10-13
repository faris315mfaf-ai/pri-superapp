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
  /** Punya API key (otak). Tanpa key, bot "tidur" di kamar tidur Ruang Bot. */
  punya_otak: boolean;
  /** Tugas yang sedang dikerjakan (tahap kerja saja); menentukan meja tempat bot duduk di Ruang. */
  tugas_aktif: TugasAktifBot | null;
};

/** Tugas berjalan milik satu bot: tahap mentah bot_tugas + judul. */
export type TugasAktifBot = { tahap: string; judul: string };

/** Satu usulan koordinator yang sudah disetujui master (papan penugasan & animasi pengantaran Nara). */
export type DiputusKoordinator = { id: number; bot_id: number; judul: string; diputus_pada: string };

/** Ringkasan koordinator (Nara) untuk dunia Ruang Bot. */
export type KoordinatorRingkas = {
  nama: string;
  peran: string;
  punya_otak: boolean;
  usulan_terbuka: number;
  /** Disetujui dalam 24 jam terakhir, terbaru dulu (maks 12). */
  diputus: DiputusKoordinator[];
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

/** Satu akun sumber milik bot (bot_sumber) + hitungan kandidat 24 jam terakhir. */
export type SumberBotDb = {
  id: number;
  bot_id: number;
  /** Bentuk kanonik: "Instagram" | "TikTok" | "YouTube" (lihat lib/bot-sumber). */
  platform: string;
  /** Bentuk simpan kanonik (IG/TikTok tanpa "@"; YouTube "@nama" atau ID kanal "UC…"). */
  handle: string;
  kategori: "NEWS" | "HIBURAN" | "SHOWBIZ";
  aktif: boolean;
  /** ISO; null = belum pernah dipanen. */
  terakhir_ambil: string | null;
  /** Jumlah bot_kandidat sumber ini yang dibuat dalam 24 jam terakhir. */
  kandidat_24_jam: number;
};

export type StatusBot = {
  /** false bila migrasi sql/67 belum dijalankan. */
  tabel_ada: boolean;
  jeda_global: boolean;
  runner: RunnerStatus;
  bots: BotRingkas[];
  log: LogBotDb[];
  /** Daftar sumber (bot_sumber). Kosong/absen = belum ada atau server lama. */
  sumber?: SumberBotDb[];
  /** Kata/akun terblokir (bot_blokir), urutan tambah. */
  blokir?: string[];
  /** Koordinator (Nara); null/absen = migrasi sql/74 belum jalan atau server lama. */
  koordinator?: KoordinatorRingkas | null;
  /** ISO pesan room Chat terbaru; dipakai Ruang untuk "rapat" otomatis. null = belum ada pesan. */
  chat_terakhir?: string | null;
};

export type AksiKendaliBot =
  | { aksi: "jeda_global"; nilai: boolean }
  | { aksi: "jeda_bot"; bot_id: number; nilai: boolean }
  | { aksi: "mode"; bot_id: number; nilai: ModeBotDb }
  | { aksi: "kuota"; bot_id: number; nilai: number };

/** Aksi POST /api/bot/sumber (master saja). Nilai platform/handle divalidasi ulang di server. */
export type AksiSumberBot =
  | { aksi: "tambah"; bot_id: number; platform: string; handle: string; kategori: "NEWS" | "HIBURAN" | "SHOWBIZ" }
  | { aksi: "aktif"; id: number; nilai: boolean }
  | { aksi: "hapus"; id: number }
  | { aksi: "blokir_tambah"; kata: string }
  | { aksi: "blokir_hapus"; kata: string };

/** Batas kuota harian per bot yang diterima server. */
export const KUOTA_BOT_MIN = 1;
export const KUOTA_BOT_MAKS = 6;

// ---- "Tugas Bot" di TVR Saya akun bot (2F, 13 Okt 2026) ----

export type StatusKandidatBot = "bebas" | "diklaim_saya" | "diklaim_lain" | "bentrok";

export type TugasBotRingkas = {
  id: number;
  /** TahapTugas (lib/bot-mesin): cari|pilih|unduh|edit|siap_ditinjau|menunggu_acc|disetujui|posting|selesai|gagal. */
  tahap: string;
  judul: string;
  kategori: string;
  galat: string;
  dibuat_pada: string;
  selesai_pada: string | null;
  /** Tugas ini berasal dari permintaan Video Wajib Pimred. */
  dari_video_wajib: boolean;
};

export type PermintaanWajibRingkas = {
  id: number;
  judul: string;
  keterangan: string;
  kategori: string;
  /** "YYYY-MM-DD" atau null. */
  batas_waktu: string | null;
  /** terbuka = belum diambil bot mana pun; diambil_saya = sudah diambil bot ini. */
  status: "terbuka" | "diambil_saya";
};

export type KandidatBotRingkas = {
  id: number;
  url: string;
  judul: string;
  platform: string;
  durasi_detik: number | null;
  tayangan: number | null;
  waktu_terbit: string | null;
  status: StatusKandidatBot;
  dibuat_pada: string;
};

/** GET /api/bot/tugas-saya — hanya untuk sesi akun Divisi BOT. */
export type TugasBotSaya = {
  tabel_ada: boolean;
  /** null bila akun ini belum punya baris bot_redaksi. */
  bot: BotRingkas | null;
  runner: RunnerStatus;
  jeda_global: boolean;
  /** Boleh memulai tugas BARU sekarang (jeda, jam aktif, kuota, tugas aktif)? */
  bisa_mulai: boolean;
  /** Kode alasan bila bisa_mulai=false (AlasanDiam lib/bot-mesin), selain itu null. */
  alasan_tutup: string | null;
  tugas: TugasBotRingkas[];
  permintaan_wajib: PermintaanWajibRingkas[];
  kandidat: KandidatBotRingkas[];
  sumber: SumberBotDb[];
};

/** POST /api/bot/tugas-saya. */
export type AksiTugasBot =
  /** Tandai semua sumber aktif bot ini agar dipanen pada siklus berikutnya. */
  | { aksi: "cari_sekarang" }
  /** Ambil satu permintaan Video Wajib untuk bot ini SEKARANG (tetap lewat semua pagar). */
  | { aksi: "ambil_permintaan"; id: number };
