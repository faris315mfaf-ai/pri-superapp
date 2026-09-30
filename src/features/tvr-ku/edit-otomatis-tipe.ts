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
  teks_warna: "white" | "black";
  diperbarui?: number | null;
};

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
  texts?: { hook?: string; sumber?: string } | null;
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
