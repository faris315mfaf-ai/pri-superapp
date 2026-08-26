// ============================================================
// Katalog fitur yang bisa dinyalakan/dimatikan super admin per peran.
//
// Dipakai server (validasi) DAN klien (menyembunyikan tombol), jadi
// file ini tidak boleh mengimpor apa pun yang khusus server.
//
// ATURAN POKOK: tidak ada baris di tabel fitur_izin = fitur NYALA.
// Matriks hanya menyimpan pengecualian, sehingga fitur baru langsung
// tersedia dan tidak ada yang mendadak hilang karena lupa diisi.
// ============================================================

export type KunciFitur =
  // Tim
  | "tim.tambah"
  // Absensi
  | "absensi.lihat"
  | "absensi.riwayat"
  | "absensi.approval"
  // Laporan kerja
  | "kerja.harian"
  | "kerja.besar"
  // TV Rakyat Saya (milik anggota)
  | "tvrku"
  // TV Rakyat official
  | "tv.pindai"
  | "tv.proses"
  | "tv.approval"
  | "tv.upload"
  // QC konten
  | "qc.analisis"
  // Isi beranda
  | "database.detail"
  | "beranda.pengumuman"
  | "beranda.kpi_kerja"
  | "beranda.kpi_komentar"
  | "beranda.kpi_video"
  | "beranda.absensi";

export type DefinisiFitur = {
  kunci: KunciFitur;
  label: string;
  keterangan: string;
  kelompok: string;
};

export const KATALOG_FITUR: DefinisiFitur[] = [
  {
    kunci: "tim.tambah",
    label: "Tambah anggota ke tim",
    keterangan: "Mengajukan anggota baru ke timnya (tetap perlu ACC super admin/HR).",
    kelompok: "Tim",
  },
  {
    kunci: "absensi.lihat",
    label: "Absen masuk & pulang",
    keterangan: "Membuka layar Absensi dan melakukan absen.",
    kelompok: "Absensi",
  },
  {
    kunci: "absensi.riwayat",
    label: "Riwayat absensi",
    keterangan: "Membaca riwayat absen 7 hari terakhir.",
    kelompok: "Absensi",
  },
  {
    kunci: "absensi.approval",
    label: "Setujui izin/sakit",
    keterangan: "Memutuskan pengajuan izin atau sakit bawahannya.",
    kelompok: "Absensi",
  },
  {
    kunci: "kerja.harian",
    label: "Rencana kerja harian",
    keterangan: "Mengisi dan melaporkan rencana kerja harian.",
    kelompok: "Laporan Kerja",
  },
  {
    kunci: "kerja.besar",
    label: "Rencana besar",
    keterangan: "Mengelola proyek lintas hari beserta tenggatnya.",
    kelompok: "Laporan Kerja",
  },
  {
    kunci: "tvrku",
    label: "TV Rakyat Saya",
    keterangan: "Akun TV Rakyat pribadi, laporan video, dan KPI-nya.",
    kelompok: "TV Rakyat Saya",
  },
  {
    kunci: "tv.pindai",
    label: "Pindai video terbaru",
    keterangan: "Menjalankan pemindaian berita/video terbaru dari sumber.",
    kelompok: "TV Rakyat Official",
  },
  {
    kunci: "tv.proses",
    label: "Edit video otomatis lewat link",
    keterangan: "Mengirim link untuk diproses jadi video bertema TV Rakyat.",
    kelompok: "TV Rakyat Official",
  },
  {
    kunci: "tv.approval",
    label: "Approval video",
    keterangan: "Menyetujui atau menolak video sebelum tayang.",
    kelompok: "TV Rakyat Official",
  },
  {
    kunci: "tv.upload",
    label: "Upload video ke sosmed",
    keterangan: "Mengunggah video yang sudah disetujui ke media sosial.",
    kelompok: "TV Rakyat Official",
  },
  {
    kunci: "qc.analisis",
    label: "Mulai analisis QC",
    keterangan: "Menjalankan pemeriksaan kepatuhan komentar.",
    kelompok: "QC Konten",
  },
  {
    kunci: "database.detail",
    label: "Database anggota",
    keterangan:
      "Melihat detail aktivitas per pengguna: kewajiban komentar, KPI kerja, absensi, dan laporan video.",
    kelompok: "Database",
  },
  {
    kunci: "beranda.pengumuman",
    label: "Pengumuman",
    keterangan: "Kartu pengumuman terbaru dari atasan.",
    kelompok: "Isi Beranda",
  },
  {
    kunci: "beranda.kpi_kerja",
    label: "KPI kerja hari ini",
    keterangan: "Ringkasan rencana kerja yang sudah diselesaikan.",
    kelompok: "Isi Beranda",
  },
  {
    kunci: "beranda.kpi_komentar",
    label: "KPI wajib komentar",
    keterangan: "Kemajuan kewajiban komentar di konten akun resmi.",
    kelompok: "Isi Beranda",
  },
  {
    kunci: "beranda.kpi_video",
    label: "KPI laporan video",
    keterangan: "Kemajuan target 5 video per hari.",
    kelompok: "Isi Beranda",
  },
  {
    kunci: "beranda.absensi",
    label: "Status kehadiran",
    keterangan: "Kartu absen masuk/pulang hari ini di beranda.",
    kelompok: "Isi Beranda",
  },
];

/** Peran yang izinnya bisa diatur (master sengaja tidak dibatasi). */
export const PERAN_DIATUR = [
  { id: "super_admin", label: "Super Admin" },
  { id: "admin_hr", label: "Admin HR" },
  { id: "admin_tv", label: "Admin TV" },
  { id: "ketua", label: "Ketua" },
  { id: "anggota", label: "Anggota" },
] as const;

export type PetaIzin = Partial<Record<KunciFitur, boolean>>;

/**
 * Apakah fitur ini boleh dipakai?
 *
 * `izin` hanya memuat PENGECUALIAN — kunci yang tidak ada berarti
 * nyala. Master selalu diizinkan: dialah yang memegang panel
 * pengaturannya, dan mengunci dirinya sendiri hanya akan membuat
 * sistem tidak bisa dipulihkan dari dalam.
 */
export function bolehFitur(
  izin: PetaIzin | null | undefined,
  kunci: KunciFitur,
  peran?: string,
): boolean {
  if (peran === "master") return true;
  return izin?.[kunci] !== false;
}
