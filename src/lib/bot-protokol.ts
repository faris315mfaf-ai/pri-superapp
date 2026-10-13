// ============================================================
// BOT REDAKSI — protokol "Rumah Bot" (runner di VPS mesin) ↔ aplikasi
// (13 Okt 2026). Hanya TIPE + konstanta; dipakai server DAN runner.
//
// Pembagian tugas:
//  - APLIKASI memegang semua kunci layanan luar dan seluruh keadaan (tabel bot_*).
//    Ia memutuskan apa yang dikerjakan bot (lib/bot-mesin.ts) dan menjawab dengan
//    sebuah PERINTAH.
//  - RUNNER memegang satu rahasia (BOT_RUNNER_SECRET). Ia melakukan bagian yang
//    menyangkut MESIN (daftar akun sumber lewat yt-dlp, hook, job render, memantau
//    stok) lalu MELAPOR.
//
// Semua badan permintaan ditandatangani HMAC (lib/bot-hmac). Satu bot = satu
// pekerjaan aktif pada satu waktu, jadi tidak ada ambiguitas job.
// ============================================================

import type { TahapBotDb } from "@/lib/bot-tipe";

// ---- Runner → aplikasi ----

export type KandidatMasuk = {
  /** URL video lengkap (bukan URL pendek); dinormalkan jadi kunci_kanonik di server. */
  url: string;
  judul: string;
  caption: string;
  durasi_detik: number | null;
  tayangan: number | null;
  /** ISO 8601 atau null. */
  waktu_terbit: string | null;
};

export type KodeGagal =
  | "template_belum_ada"
  | "kuota_penuh"
  | "antrean_penuh"
  | "stok_penuh"
  | "sumber_ditolak"
  | "job_error"
  | "hilang"
  | "lainnya";

export type LaporanRunner =
  | { jenis: "kandidat"; sumber_id: number; kandidat: KandidatMasuk[]; galat?: string }
  | { jenis: "job_dibuat"; tugas_id: number; id_job_mesin: string; hook: string }
  | { jenis: "job_selesai"; tugas_id: number; id_stok_mesin: string; durasi_detik: number | null; ukuran_byte: number | null }
  | { jenis: "job_gagal"; tugas_id: number; kode: KodeGagal; pesan: string }
  | { jenis: "log"; tahap: TahapBotDb; teks: string }
  /** Hasil perintah `periksa_sidik` (3F-B): sidik visual (hash bingkai) video kandidat, atau galat. */
  | { jenis: "sidik"; kandidat_id: number; status: "ok" | "tak_informatif" | "gagal"; sidik: string[] | null; galat?: string };

export type PermintaanRunner =
  | { aksi: "denyut"; versi?: string }
  | { aksi: "ambil_kerja"; bot_id: number }
  | { aksi: "lapor"; bot_id: number; laporan: LaporanRunner };

// ---- Aplikasi → runner ----

export type SumberPanen = { id: number; platform: string; handle: string };

export type PerintahRunner =
  | { perintah: "diam"; alasan: string }
  /** Daftar video terbaru tiap sumber (yt-dlp --flat-playlist), lalu lapor `kandidat` per sumber. */
  | { perintah: "panen"; sumber: SumberPanen[] }
  /** Buat hook dari `naskah` (POST /api/tvr/hook), lalu job (POST /api/tvr/jobs); lapor `job_dibuat`. */
  | {
      perintah: "buat_video";
      tugas_id: number;
      url: string;
      naskah: string;
      kategori: string;
      sumber_label: string;
      /** app_user.id bot = id pengguna di mesin (header x-autoedit-pengguna). */
      id_pengguna_mesin: number;
      /**
       * Hook yang SUDAH ditulis otak bot sendiri (API key milik bot, lib/bot-otak). Ada =
       * runner melewati POST /api/tvr/hook; tidak ada = runner minta hook ke mesin seperti biasa.
       */
      hook?: string;
    }
  /**
   * Hitung SIDIK VISUAL video kandidat (unduh pratinjau ringan + ffmpeg, 3F-B) lalu lapor `sidik`.
   * Dikeluarkan sebelum kandidat diklaim; tidak membuat tugas.
   */
  | { perintah: "periksa_sidik"; kandidat_id: number; url: string }
  /** Pantau job sampai selesai/gagal; lapor `job_selesai` atau `job_gagal`. */
  | { perintah: "pantau_job"; tugas_id: number; id_job_mesin: string | null; hook: string | null; id_pengguna_mesin: number };

export type JawabanDenyut = {
  sukses: true;
  jeda_global: boolean;
  /** Menit sejak tengah malam WIB menurut server (runner tidak perlu tahu zona waktu). */
  menit_wib: number;
  bots: { bot_id: number; user_id: number; aktif: boolean; jeda: boolean; mode: "acc" | "otomatis" }[];
};

export type JawabanAmbilKerja = { sukses: true; perintah: PerintahRunner };
export type JawabanLapor = { sukses: true };

/** Batas yang dipakai kedua sisi. */
export const BATAS_PROTOKOL = {
  /** Kandidat per laporan. */
  MAKS_KANDIDAT_PER_LAPORAN: 40,
  /** Sumber per perintah panen. */
  MAKS_SUMBER_PER_PANEN: 10,
  /** Panjang naskah (mesin menerima 1..5000). */
  MAKS_NASKAH: 4000,
} as const;
