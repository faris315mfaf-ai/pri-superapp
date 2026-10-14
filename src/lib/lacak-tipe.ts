// ============================================================
// PENCARI VIDEO ASLI (Lacak Sumber, 15 Okt 2026) — tipe bersama aplikasi, runner bot, dan layanan
// Python di VPS mesin (vps/lacak, bentuk JSON-nya SAMA dengan lacak/model.py).
//
// Jalur: peramban -> /api/autoedit/lacak/* (gerbang aplikasi) -> mesin TS /api/lacak/* -> autoedit-lacak:7100.
// Runner bot memanggil mesin langsung lewat soket (header x-autoedit-bot: 1).
// ============================================================

export type StatusLacak = "antre" | "berjalan" | "selesai" | "gagal";

export type ZonaLacak = "yakin" | "perlu_acc" | "bukan";

export type KomponenSkor = {
  gambar: number;
  suara: number;
  wm: number;
  waktu: number;
  durasi: number;
  akun: number;
};

export type TahapLacak = {
  kunci: "ambil" | "frame" | "teks" | "ucapan" | "cari" | "cocok";
  nama: string;
  status: "tunggu" | "jalan" | "selesai" | "lewati" | "gagal";
  /** Detik yang dihabiskan (null selama belum selesai). */
  detik: number | null;
  catatan: string;
};

export type VideoInfo = {
  url: string;
  judul: string;
  akun: string;
  platform: string;
  /** ISO 8601; "" bila tidak diketahui. */
  diunggah: string;
  durasi: number;
  lebar: number;
  tinggi: number;
  gambar: string;
};

export type Kandidat = VideoInfo & {
  skor: number;
  komponen: KomponenSkor;
  /** Bobot yang benar-benar dipakai (suara bisa dialihkan ke gambar bila musik diganti). */
  bobot: KomponenSkor;
  zona: ZonaLacak;
  label: string;
  /** Kecocokan per frame kunci saduran: 2 = cocok, 1 = sebagian, 0 = tidak. */
  strip: number[];
  /** Rentang di video kandidat yang dipakai saduran (detik); null = tidak bisa dipastikan. */
  bagian: { mulai: number; akhir: number } | null;
  /** Selisih waktu suara (detik); null = tidak bisa dibandingkan. */
  offset_suara: number | null;
  ditemukan_lewat: "koleksi" | "akun" | "youtube" | "web" | "lens";
};

export type PetunjukLacak = {
  watermark: { handle: string; frame: number; total: number; yakin: number }[];
  kata_kunci: string[];
  transkrip: string;
  frame_kunci: number[];
};

export type HasilLacak = {
  id: string;
  status: StatusLacak;
  pesan: string;
  sumber: "pengguna" | "bot" | "master";
  diminta_oleh: string;
  dibuat: string;
  selesai: string | null;
  tahap: TahapLacak[];
  saduran: VideoInfo | null;
  petunjuk: PetunjukLacak | null;
  kandidat: Kandidat[];
  /** Indeks kandidat yang dipilih otomatis (zona yakin, paling awal); null = tidak ada. */
  terpilih: number | null;
  zona: ZonaLacak | null;
  /** "SUMBER: @AKUN" siap pakai; "" bila tidak ditemukan. */
  kredit: string;
  keputusan: { aksi: AksiKeputusan; kandidat: number | null; oleh: string; pada: string } | null;
};

export type AksiKeputusan = "pakai_asli" | "pakai_kredit" | "bukan" | "tanpa_sumber";

export type RingkasLacak = Pick<HasilLacak, "id" | "status" | "sumber" | "diminta_oleh" | "dibuat" | "zona" | "kredit"> & {
  judul: string;
  skor: number | null;
  ditemukan_lewat: Kandidat["ditemukan_lewat"] | null;
};

export type JenisAkunKoleksi = "media_resmi" | "kreator" | "instansi";

export type AkunKoleksi = {
  id: number;
  handle: string;
  platform: string;
  url: string;
  jenis: JenisAkunKoleksi;
  aktif: boolean;
  video: number;
  jadi_sumber: number;
  terakhir_panen: string | null;
  galat_panen: string;
};

export type PengaturanLacak = {
  /** 0..1 */
  ambang_yakin: number;
  ambang_acc: number;
  lacak_bot: boolean;
  tombol_pengguna: boolean;
  cari_lens: boolean;
  simpan_ke_koleksi: boolean;
};

export type StatistikLacak = {
  akun: number;
  video: number;
  vektor: number;
  ditemukan_30h: number;
  total_30h: number;
  disetujui_30h: number;
  diputus_30h: number;
  lens_bulan_ini: number;
  lens_kuota: number;
};

/** Batas panjang URL yang diterima (sama dengan mesin). */
export const MAKS_URL_LACAK = 2000;

export const BOBOT_BAWAAN: KomponenSkor = { gambar: 0.4, suara: 0.25, wm: 0.15, waktu: 0.1, durasi: 0.05, akun: 0.05 };
