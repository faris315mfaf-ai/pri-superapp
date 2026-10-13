// ============================================================
// RUANG BOT — tipe bersama (Oktober 2026).
//
// Layar ini untuk master. Selama bot belum tersambung ke server, seluruh
// isinya adalah DATA CONTOH (lihat data-contoh.ts); bentuk tipe di sini
// sengaja dibuat sama dengan yang nanti dikirim /api/bot/status.
// ============================================================

export type ModeBot = "acc" | "otomatis";

/** Tahap kerja bot; urutannya = alur tugas (Pencarian → Edit → Posting → Istirahat). */
export type TahapBot = "cari" | "edit" | "posting" | "istirahat";

export type GayaRambut = "pendek" | "panjang" | "topi";

/** Rupa karakter pixel-art (kepala, badan, lengan, tangan, mata). */
export type RupaBot = {
  kaus: string;
  bayangan: string;
  celana: string;
  kulit: string;
  rambut: string;
  gayaRambut: GayaRambut;
  warnaTopi?: string;
  kacamata?: boolean;
  berhud?: boolean;
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
  akun: string;
  platform: string;
  kategori: "NEWS" | "HIBURAN" | "SHOWBIZ";
  botId: string;
  kandidat24Jam: number;
  terakhirAmbil: string;
  aktif: boolean;
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

export type TampilanBot = "ruang" | "detail" | "acc" | "sumber";
