// ============================================================
// PRI SuperApp — Definisi Tipe Data
// Penamaan field mengikuti skema database produksi (Supabase).
// JANGAN di-camelCase-kan atau diterjemahkan ke Inggris.
// ============================================================

/** Peran pengguna aplikasi */
export type Role = "super_admin" | "admin_hr" | "admin_tv";

/** Akun login pengguna aplikasi */
export type User = {
  id: string;
  nama: string;
  email: string;
  role: Role;
  avatar_url: string;
  jabatan: string;
};

// Akun sosmed yang wajib dikomentari
export type AkunWajib = {
  id: string;
  akun_wajib: string; // contoh: "dpp.pri"
  nama_tampilan: string;
  platform: string; // "instagram" | "tiktok" | "twitter" | "facebook" | "threads" | "youtube"
  avatar_url: string;
  aktif: boolean;
};

// Orang / anggota partai
export type Kader = {
  id: string;
  nama_kader: string;
  wilayah: string; // contoh: "DPC Jakarta Selatan"
  jabatan: string;
  nomor_wa: string; // format: "628xxxxxxxxxx"
  ig_username: string;
  aktif: boolean;
};

// Postingan yang dipantau
export type Postingan = {
  id_postingan: string;
  akun_wajib: string;
  platform: string;
  caption_asli: string;
  thumbnail_url: string;
  link_postingan: string;
  waktu_posting: string; // ISO 8601
  jumlah_like: number;
  jumlah_komentar: number;
  periode: string; // format: "2026-08-23 17:00-15:59"
};

// Komentar yang tertangkap
export type Komentar = {
  id_komentar: string;
  id_postingan: string;
  ig_username: string;
  nama_kader: string | null; // null kalau bukan kader terdaftar
  isi_komentar: string;
  waktu_komentar: string; // ISO 8601
};

// Rekap kepatuhan per orang per postingan
export type Rekap = {
  id_unik: string; // format: periode|||nama_kader|||platform|||akun_wajib|||id_postingan
  periode: string;
  nama_kader: string;
  platform: string;
  akun_wajib: string;
  id_postingan: string;
  sudah_komentar: boolean;
  jumlah_komentar: number;
};

// Antrian & riwayat video TV Rakyat
export type VideoAntrian = {
  id: string;
  judul: string;
  link: string; // link video di platform sumber
  jenis: string; // "TIKTOK" | "INSTAGRAM"
  video_asli: string; // link doksli
  caption_asli: string;
  judul_overlay: string;
  highlight: string;
  status: string; // "MENUNGGU DOKSLI" | "SEDANG DIPROSES" | "SUDAH DIPROSES" | "GAGAL"
  link_instagram: string;
  thumbnail_url: string;
  jam_tanggal: string; // ISO 8601
  platform_terunggah: string[];
};

// Berita terbaru dari Nusantara TV
export type Berita = {
  id: string;
  judul: string;
  sumber: string;
  waktu_relatif: string; // contoh: "2 jam lalu"
  platform_asal: string; // "tiktok" | "instagram"
  link_video: string;
  thumbnail_url: string;
  ringkasan: string;
};

// Notifikasi dalam aplikasi
export type NotifikasiItem = {
  id: string;
  judul: string;
  isi: string;
  kategori: "QC" | "VIDEO" | "SISTEM";
  waktu_relatif: string; // "5 menit lalu"
  kelompok: "HARI_INI" | "KEMARIN" | "LEBIH_LAMA";
  dibaca: boolean;
  target: "qc" | "tv" | "dashboard" | "notifikasi" | null;
};

// Aktivitas terbaru di dashboard
export type Aktivitas = {
  id: string;
  jenis: "QC" | "VIDEO" | "ROSTER" | "SISTEM";
  teks: string;
  waktu_relatif: string;
};

// KPI dashboard
export type KpiItem = {
  id: string;
  label: string;
  nilai: string;
  delta: number; // positif = naik
  satuan_delta: "%" | "";
  arah: "naik" | "turun";
};

// Hasil generate video (respons proses video)
export type HasilProsesVideo = {
  judul_overlay: string;
  highlight: string;
  caption_asli: string;
  sumber: string;
  jenis: "TIKTOK" | "INSTAGRAM";
};

/** Periode aktif sistem QC */
export const PERIODE_AKTIF = "2026-08-23 17:00-15:59";

/** Tanggal jangkar data dummy (aplikasi demo mengacu tanggal ini) */
export const APP_TODAY_ISO = "2026-08-23T15:30:00+07:00";
