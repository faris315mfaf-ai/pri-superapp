// Bentuk data Edit Otomatis TVR Saya (30 Sep 2026) — cermin jawaban
// layanan Python autoedit/tvr_api.py, dipakai seksi & editor templatenya.

export type SlotTvr = "kotak" | "boom" | "bingkai" | "penutup";

export const URUTAN_SLOT: SlotTvr[] = ["kotak", "boom", "bingkai", "penutup"];

export const INFO_SLOT: Record<SlotTvr, { judul: string; wajib: boolean; keterangan: string }> = {
  kotak: { judul: "Kotak monas", wajib: true, keterangan: "Wajib PNG. Panel bawah tempat tulisan berita (tampil 3 detik pertama)." },
  boom: { judul: "Boom like share", wajib: false, keterangan: "Opsional. PNG, GIF, atau video (MOV/WEBM transparan, atau MP4 latar hijau)." },
  bingkai: { judul: "Bingkai teratas", wajib: true, keterangan: "Wajib PNG. Lapisan paling atas, tampil sepanjang video." },
  penutup: { judul: "Video penutup", wajib: false, keterangan: "Opsional. MP4/MOV/WEBM, disambung di akhir video." },
};

export type InfoSlotTvr = {
  ada: boolean;
  draf: boolean;
  jenis: "" | "gambar" | "gif" | "video";
  alpha?: boolean;
  kunci_hijau?: boolean;
};

export type KotakTeks = { x: number; y: number; w: number; h: number };

export type KeadaanTemplateTvr = {
  ada: boolean;
  siap: boolean;
  slot: Record<SlotTvr, InfoSlotTvr>;
  text_box: KotakTeks | null;
  /** Kotak badge kategori; null = tebakan otomatis (badge_box_default). */
  badge_box: KotakTeks | null;
  badge_box_default: KotakTeks | null;
  kategori: string;
  rata: RataTeks;
  teks_warna: "white" | "black";
  diperbarui?: number | null;
};

export type RataTeks = "justify" | "left" | "center" | "right";

/** Pilihan perataan tulisan berita — sama dengan editor template GODAM. */
export const PILIHAN_RATA: { nilai: RataTeks; judul: string }[] = [
  { nilai: "justify", judul: "Rata kiri-kanan" },
  { nilai: "left", judul: "Rata kiri" },
  { nilai: "center", judul: "Rata tengah" },
  { nilai: "right", judul: "Rata kanan" },
];

export type StatusJobTvr = "queued" | "downloading" | "rendering" | "done" | "error" | "dibatalkan";

export type JobTvr = {
  job_id: string;
  status: StatusJobTvr;
  progress: number;
  message?: string | null;
  error?: string | null;
  durasi?: number | null;
  size?: number | null;
  created?: number | null;
  sumber_url?: string | null;
  texts?: { hook?: string; sumber?: string; kategori?: string } | null;
};

export type AntreanTvr = {
  posisi: number;
  di_depan: number;
  sedang_dikerjakan: boolean;
  perkiraan_detik: number;
};

export type BatasTvr = {
  maks_aset_mb: number;
  maks_gif_mb: number;
  maks_sumber_mb: number;
  maks_animasi_detik: number;
  maks_durasi_detik: number;
  maks_hook: number;
  maks_sumber_teks: number;
  maks_kategori: number;
  jenis_slot: Record<SlotTvr, string[]>;
  jenis_sumber: string[];
  umur_simpan_jam: number;
};

export type RingkasTvr = {
  template: KeadaanTemplateTvr;
  job: JobTvr | null;
  antrean: AntreanTvr | null;
  batas: BatasTvr;
};

export const STATUS_AKTIF: StatusJobTvr[] = ["queued", "downloading", "rendering"];

/**
 * Tebakan letak badge kategori bila belum digambar: menempel di atas kotak
 * tulisan, rata kiri. Rumusnya SAMA dengan kotak_kategori_bawaan di mesin
 * (autoedit/video_edit.py), supaya garis putus-putus di pratinjau tepat.
 */
export function tebakanBadge(kotak: KotakTeks | null): KotakTeks | null {
  if (!kotak) return null;
  const h = Math.max(36, Math.min(80, Math.trunc(kotak.h * 0.26)));
  const w = Math.max(120, Math.trunc(kotak.w * 0.41));
  return { x: kotak.x + 6, y: Math.max(0, kotak.y - h), w, h };
}

/** Akhiran berkas (".png") dalam huruf kecil; "" bila tidak ada. */
export function akhiranBerkas(nama: string): string {
  const i = nama.lastIndexOf(".");
  return i >= 0 ? nama.slice(i).toLowerCase() : "";
}

/** "±3 menit" / "±40 detik" untuk perkiraan waktu tunggu. */
export function perkiraanWaktu(detik: number): string {
  const d = Math.max(0, Math.round(detik));
  if (d < 60) return `±${Math.max(5, Math.round(d / 5) * 5)} detik`;
  return `±${Math.round(d / 60)} menit`;
}
