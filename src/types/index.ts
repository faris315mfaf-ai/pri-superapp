// ============================================================
// PRI SuperApp — Definisi Tipe Data
// Penamaan field mengikuti skema database produksi (Supabase).
// JANGAN di-camelCase-kan atau diterjemahkan ke Inggris.
// ============================================================

/**
 * Peran pengguna aplikasi.
 *
 * `master` sengaja TIDAK pernah ditampilkan di panel kelola pengguna
 * maupun di mana pun — ia hanya diketahui pemiliknya. Karena itu setiap
 * daftar pengguna wajib menyaringnya, bukan sekadar menyembunyikan
 * tombolnya di layar.
 */
// "ketua": pemimpin tim lapangan — boleh membentuk tim (dengan ACC
// super admin/HR). "super_admin"/"admin_hr"/"admin_tv" tetap ada untuk
// akun lama, tapi DISEMBUNYIKAN dari pemilih peran di panel.
export type Role =
  | "master"
  | "super_admin"
  | "admin_hr"
  | "admin_tv"
  | "ketua"
  | "anggota";

/** Peran yang boleh dipilih super admin saat menyetujui pendaftar */
export const PERAN_DAPAT_DIPILIH = [
  "super_admin",
  "admin_hr",
  "admin_tv",
  "anggota",
] as const;

/**
 * Boleh menjalankan otomatisasi video TV Rakyat (proses video by link).
 * Super admin sengaja TIDAK termasuk: pekerjaan produksi video adalah
 * tanggung jawab tim TV Rakyat, dan setiap video tercatat atas nama
 * penggeneratenya.
 */
export function bolehProsesVideo(role: Role): boolean {
  return role === "master" || role === "admin_tv";
}

/** Akun login pengguna aplikasi */
export type User = {
  id: string;
  nama: string;
  email: string;
  role: Role;
  avatar_url: string;
  jabatan: string;
  /** Struktur divisi (lihat src/lib/struktur.ts) — opsional karena
   *  baris lama/embed ringkas tidak selalu membawanya. */
  divisi?: string;
  sub_divisi?: string;
  posisi_divisi?: "kepala" | "anggota";
  nama_panggilan?: string;
  /** "YYYY-MM-DD" — dasar fitur ulang tahun */
  tanggal_lahir?: string | null;
  /** false = belum verifikasi WA; aplikasi menagih tiap 3 jam */
  wa_terverifikasi?: boolean;
  nomor_wa?: string | null;
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
  periode: string; // format: "2026-08-23 00:00-23:59" (jendela HARIAN WIB)
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
  /** Link video hasil render Creatomate; kosong bila belum selesai diproses */
  hasil_render_url?: string;
  /** Nama pengguna yang menjalankan pemrosesan — untuk pertanggungjawaban */
  digenerate_oleh?: string | null;
  /** Caption khusus per platform tujuan; kosong = pakai caption_asli */
  caption_platform?: Record<string, string> | null;
  /** Persetujuan Pimpinan Redaksi: menunggu | disetujui | ditolak */
  persetujuan?: string;
  persetujuan_oleh?: string | null;
  /** 'workflow' = hasil proses otomatis; 'manual' = unggahan anggota */
  sumber_upload?: string;
  diupload_oleh?: string | null;
};

// Berita terbaru dari Nusantara TV (hasil scraping Apify via n8n)
export type Berita = {
  id: string;
  judul: string;
  sumber: string;
  waktu_relatif: string; // contoh: "2 jam lalu"
  platform_asal: string; // "tiktok" | "instagram"
  link_video: string;
  thumbnail_url: string;
  ringkasan: string;
  /** Username akun sumber, mis. "official.ntv" — dipakai teks SUMBER di overlay */
  sumber_akun?: string;
  /** "TIKTOK" | "INSTAGRAM" */
  jenis?: string;
  /** true bila video ini sudah pernah direplikasi */
  dipakai?: boolean;
  /** Umur video dalam menit, dihitung di database */
  selisih_menit?: number;
};

// Notifikasi dalam aplikasi
export type NotifikasiItem = {
  id: string;
  judul: string;
  isi: string;
  // String bebas dari server — layar wajib punya cadangan untuk
  // kategori yang belum dikenalnya (jangan ulangi crash 25 Agu 2026).
  kategori: string;
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
  /** Kode antrian di Supabase — dipakai menyimpan suntingan & memantau */
  kode?: string;
  /** Link video hasil render Creatomate (kosong bila belum selesai) */
  hasil_render_url?: string;
  /** Gambar sampul hasil render, dipakai sebagai poster pemutar */
  thumbnail_url?: string;
  /** Caption khusus per platform tujuan; kosong = pakai caption_asli */
  caption_platform?: Record<string, string> | null;
  /** Persetujuan Pimpinan Redaksi: menunggu | disetujui | ditolak */
  persetujuan?: string;
  persetujuan_oleh?: string | null;
  /** 'workflow' = hasil proses otomatis; 'manual' = unggahan anggota */
  sumber_upload?: string;
  diupload_oleh?: string | null;
};

/**
 * Kemajuan proses video apa adanya dari n8n.
 * `tahap` 1–5 dan `persen` ditulis oleh workflow n8n lewat fungsi
 * tv_maju_tahap() di Supabase, jadi angkanya bukan tebakan aplikasi.
 */
export type KemajuanVideo = {
  id: string;
  judul: string;
  jenis: string;
  link: string;
  video_asli: string;
  caption_asli: string;
  judul_overlay: string;
  highlight: string;
  status: string;
  tahap: number;
  tahap_nama: string;
  persen: number;
  hasil_render_url: string;
  pesan_error: string;
  sumber_akun: string;
  thumbnail_url: string;
};

/**
 * Nama tahap pipeline TV Rakyat, URUT sesuai workflow n8n
 * "TV Rakyat - Proses Video". Harus sama persis dengan yang ditulis
 * fungsi tv_maju_tahap() di Supabase (sql/07) — kalau salah satu diubah,
 * yang lain ikut diubah.
 */
export const TAHAP_VIDEO: { nama: string; sampai: number }[] = [
  { nama: "Mengambil video sumber", sampai: 15 },
  { nama: "Membuat judul & caption dengan AI", sampai: 30 },
  { nama: "Mengunggah ke penyimpanan sementara", sampai: 50 },
  { nama: "Merender overlay judul & highlight", sampai: 85 },
  { nama: "Finalisasi video", sampai: 100 },
];

/** Periode aktif sistem QC */
export const PERIODE_AKTIF = "2026-08-23 00:00-23:59";

/** Tanggal jangkar data dummy (aplikasi demo mengacu tanggal ini) */
export const APP_TODAY_ISO = "2026-08-23T15:30:00+07:00";

/**
 * Tipe komponen IKON (lucide-react) yang dipakai di seluruh aplikasi.
 *
 * KENAPA TIDAK KomponenIkon: sejak @react-three/fiber dipasang
 * (untuk maskot 3D), pustaka itu memperluas namespace JSX global
 * sehingga props KomponenIkon tidak lagi bisa dipecahkan dan
 * seluruh pemakaian `<Ikon className=… />` ditolak dengan galat
 * "not assignable to type 'never'". Menyebutkan propsnya secara
 * eksplisit menghilangkan ketergantungan itu — dan sekaligus membuat
 * salah ketik nama prop ikon ketahuan lebih awal.
 */
export type KomponenIkon = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
}>;
