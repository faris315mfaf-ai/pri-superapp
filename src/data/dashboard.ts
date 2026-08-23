// ============================================================
// PRI SuperApp — Data dashboard (KPI, tren, aktivitas)
// 23 Agustus 2026 = hari Minggu → 7 hari terakhir = Sen..Min
// ============================================================
import type { Aktivitas, KpiItem } from "@/types";
import { akunWajib } from "./akunWajib";
import { persenKepatuhanAkun } from "./rekap";

export const kpiDashboard: KpiItem[] = [
  {
    id: "kpi-1",
    label: "Tingkat Kepatuhan Hari Ini",
    nilai: "78%",
    delta: 5,
    satuan_delta: "%",
    arah: "naik",
  },
  {
    id: "kpi-2",
    label: "Postingan Dipantau",
    nilai: "12",
    delta: 3,
    satuan_delta: "",
    arah: "naik",
  },
  {
    id: "kpi-3",
    label: "Kader Belum Komentar",
    nilai: "27",
    delta: 8,
    satuan_delta: "",
    arah: "turun",
  },
  {
    id: "kpi-4",
    label: "Video Diproses Hari Ini",
    nilai: "5",
    delta: 2,
    satuan_delta: "",
    arah: "naik",
  },
];

/**
 * Tren kepatuhan 7 hari terakhir, berakhir "Hari Ini" (Minggu
 * 23 Agustus 2026) dengan nilai 78.
 */
export const trenKepatuhan: { hari: string; nilai: number }[] = [
  { hari: "Sen", nilai: 62 },
  { hari: "Sel", nilai: 71 },
  { hari: "Rab", nilai: 68 },
  { hari: "Kam", nilai: 75 },
  { hari: "Jum", nilai: 80 },
  { hari: "Sab", nilai: 73 },
  { hari: "Min", nilai: 78 },
];

/** Kepatuhan per akun wajib (82 / 76 / 71 — sesuai konteks angka) */
export const kepatuhanAkun: { akun_wajib: string; persen: number }[] =
  akunWajib.map((a) => ({
    akun_wajib: a.akun_wajib,
    persen: persenKepatuhanAkun[a.akun_wajib] ?? 0,
  }));

export const aktivitasTerbaru: Aktivitas[] = [
  {
    id: "act-1",
    jenis: "QC",
    teks: "Analisis QC selesai — 12 postingan diperiksa",
    waktu_relatif: "5 menit lalu",
  },
  {
    id: "act-2",
    jenis: "VIDEO",
    teks: "Video 'Banjir Bekasi' berhasil diposting ke Instagram",
    waktu_relatif: "1 jam lalu",
  },
  {
    id: "act-3",
    jenis: "ROSTER",
    teks: "3 kader baru ditambahkan ke roster",
    waktu_relatif: "2 jam lalu",
  },
  {
    id: "act-4",
    jenis: "SISTEM",
    teks: "Laporan kepatuhan mingguan diekspor ke PDF",
    waktu_relatif: "4 jam lalu",
  },
  {
    id: "act-5",
    jenis: "QC",
    teks: "Peringatan WhatsApp dikirim ke 5 kader belum patuh",
    waktu_relatif: "6 jam lalu",
  },
  {
    id: "act-6",
    jenis: "VIDEO",
    teks: "Video 'Harga Cabai Melonjak' diunggah ke TikTok",
    waktu_relatif: "8 jam lalu",
  },
];
