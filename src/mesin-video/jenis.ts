// Bentuk data mesin Auto Edit — sama persis dengan template.json dan status
// job yang ditulis versi Python, supaya keduanya membaca berkas yang sama.

export type Kotak = { x: number; y: number; w: number; h: number };

/** Posisi: angka piksel atau rumus ffmpeg seperti "main_h-h" / "(W-w)/2". */
export type Posisi = number | string | null | undefined;

export type Overlay = {
  label?: string;
  /** Relatif ke folder template, mis. "assets/kotak.png". Kosong = tidak dipakai. */
  file?: string | null;
  x?: Posisi;
  y?: Posisi;
  w?: number | null;
  h?: number | null;
  /** "lebar:tinggi:x:y" (POLA_CROP). */
  crop?: string | null;
  start?: number | null;
  end?: number | null;
  loop?: boolean;
  kunci_hijau?: boolean;
};

export type LapisanTeks = {
  name?: string;
  /** "berita" | "kategori" | lainnya = teks biasa. */
  style?: string;
  /** Isi diambil dari field template ini (mis. "kategori") bila tak diisi. */
  source?: string;
  default?: string;
  align?: string;
  size?: number;
  min_size?: number;
  max_lines?: number;
  max_width?: number;
  x?: number | null;
  y?: number | null;
  width?: number;
  line_height?: number;
  line_spacing?: number;
  color?: string;
  kicker_color?: string;
  stroke?: number;
  stroke_color?: string;
  /** Kotak tulisan (gaya berita/kategori) atau true = latar kotak (teks biasa). */
  box?: Kotak | boolean | null;
  box_color?: string;
  box_padding?: number;
  start?: number | null;
  end?: number | null;
};

export type Template = {
  id: string;
  name: string;
  owner: string;
  width: number;
  height: number;
  fps: number;
  intro?: string | null;
  outro?: string | null;
  max_duration?: number | null;
  overlays: Overlay[];
  texts: LapisanTeks[];
  text_box?: Kotak | null;
  badge_box?: Kotak | null;
  kategori?: string;
  teks_warna?: string;
  aset_dari?: string;
  /** Field tambahan (siap, kunci_hijau, diperbarui, ...) tetap dipertahankan. */
  [lain: string]: unknown;
};

export type StatusJob = "queued" | "downloading" | "rendering" | "done" | "error" | "dibatalkan";

export type Job = {
  job_id: string;
  status: StatusJob;
  progress: number;
  created: number;
  updated: number;
  logs: string[];
  message?: string;
  url?: string;
  sumber_url?: string;
  template_id?: string;
  owner?: string;
  texts?: Record<string, string>;
  output?: string | null;
  error?: string | null;
  task_id?: string;
  mulai_proses?: number;
  mulai_render?: number;
  durasi?: number;
  size?: number;
  [lain: string]: unknown;
};

/** Kesalahan yang layak ditampilkan apa adanya ke pengguna (VideoError Python). */
export class GalatVideo extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = "GalatVideo";
  }
}

/** Render dihentikan atas permintaan pengguna (Dibatalkan Python). */
export class Dibatalkan extends GalatVideo {
  constructor(pesan = "Pembuatan video dihentikan.") {
    super(pesan);
    this.name = "Dibatalkan";
  }
}
