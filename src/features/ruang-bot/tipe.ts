// ============================================================
// RUANG BOT — tipe bersama (Oktober 2026).
//
// Layar ini untuk master. Selama bot belum tersambung ke server, seluruh
// isinya adalah DATA CONTOH (lihat data-contoh.ts); bentuk tipe di sini
// sengaja dibuat sama dengan yang nanti dikirim /api/bot/status.
// ============================================================

import type { GayaRambutDb, RupaBotDb } from "@/lib/bot-tipe";

export type ModeBot = "acc" | "otomatis";

/** Tahap kerja bot; urutannya = alur tugas (Pencarian → Edit → Posting → Istirahat). */
export type TahapBot = "cari" | "edit" | "posting" | "istirahat";

export type GayaRambut = GayaRambutDb;

/** Rupa karakter pixel-art (kepala, badan, lengan, tangan, mata). */
export type RupaBot = RupaBotDb;

/** Data tambahan bot dari server (hanya ada pada mode data nyata). */
export type DataNyataBot = {
  /** bot_redaksi.id (angka) — dipakai untuk memanggil /api/bot/kendali. */
  id: number;
  /** app_user.id akun bot = id pengguna di mesin Auto Edit. */
  userId: number;
  username: string;
  jeda: boolean;
  aktif: boolean;
  jamMulai: string;
  jamSelesai: string;
  gagalBeruntun: number;
  akunTertaut: number;
};

export type BotContoh = {
  id: string;
  nama: string;
  peran: string;
  persona: string;
  warna: string;
  handle: string;
  platform: string;
  mode: ModeBot;
  rupa: RupaBot;
  /** Hanya contoh: kemajuan 6 hari sebelum hari ini. */
  riwayat6Hari: number[];
  jadwalHariIni: string[];
  rataTayangan: string;
  /** Terisi bila bot berasal dari server (mode nyata); kosong = data contoh. */
  nyata?: DataNyataBot;
  /** Kuota harian milik bot ini (mode nyata); kosong = pakai kuota bersama. */
  kuotaHarian?: number;
};

/** Keadaan hidup satu bot di ruangan (dilaporkan komponen Ruang ke layar lain). */
export type StatusHidup = {
  tahap: TahapBot | null;
  keadaan: "bekerja" | "berjalan" | "menunggu";
  teks: string;
  judul: string;
};

export type KesehatanTanda = "ok" | "warn" | "bad";

export type ItemAcc = {
  id: number;
  judul: string;
  hook: [string, string];
  kategori: "NEWS" | "HIBURAN" | "SHOWBIZ";
  akunSumber: string;
  platformSumber: string;
  botId: string;
  platformTujuan: string;
  durasiDetik: number;
  waktuTayang: string;
  gradasi: [string, string];
  caption: string;
  tanda: { jenis: KesehatanTanda; teks: string }[];
};

export type KeputusanAcc = {
  judul: string;
  botNama: string;
  label: string;
  jenis: KesehatanTanda;
};

export type SumberContoh = {
  /** bot_sumber.id (hanya mode nyata); negatif = baris sementara yang belum dikonfirmasi server. */
  id?: number;
  akun: string;
  platform: string;
  kategori: "NEWS" | "HIBURAN" | "SHOWBIZ";
  botId: string;
  kandidat24Jam: number;
  terakhirAmbil: string;
  aktif: boolean;
};

/** Hasil satu aksi sumber/blokir ke server (pesan dipakai form untuk galat satu baris). */
export type HasilAksiSumber = { ok: true } | { ok: false; pesan: string };

/**
 * Kendali sumber & blokir ke server (mode nyata). Semua aksi memakai pembaruan
 * optimis di hook; mengembalikan hasil supaya form tahu kapan boleh dikosongkan.
 */
export type KendaliSumberNyata = {
  tambah: (a: { botId: number; platform: string; handle: string; kategori: SumberContoh["kategori"] }) => Promise<HasilAksiSumber>;
  aktif: (id: number, nilai: boolean) => Promise<HasilAksiSumber>;
  hapus: (id: number) => Promise<HasilAksiSumber>;
  tambahBlokir: (kata: string) => Promise<HasilAksiSumber>;
  hapusBlokir: (kata: string) => Promise<HasilAksiSumber>;
};

export type HasilHariIni = {
  judul: string;
  botId: string;
  platform: string;
  status: "tayang" | "menunggu-acc";
  waktu: string;
  gradasi: [string, string];
};

export type LogItem = {
  waktu: string;
  botId: string;
  tahap: TahapBot;
  teks: string;
};

export type TampilanBot = "ruang" | "detail" | "acc" | "sumber" | "chat";
