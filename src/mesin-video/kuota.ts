// Batas pemakaian disk per akun (cermin kuota.py): folder template milik
// akun + folder hasil render-nya. Video sumber sementara tidak dihitung.
import fs from "node:fs";
import path from "node:path";
import { jobsDir, templatesDir } from "./jalur";
import { bacaStatus, daftarJob, jobPath } from "./job";

const angka = (nama: string, bawaan: number) => {
  const n = Number.parseFloat(process.env[nama] ?? "");
  return Number.isFinite(n) ? n : bawaan;
};
// 1 GB per akun (permintaan 4 Okt 2026). Template + hasil render + unggahan
// manual dihitung; cukup untuk puluhan video pendek sekaligus.
export const KUOTA_AKUN_MB = Math.trunc(angka("KUOTA_AKUN_MB", 1024));
const CACHE_DETIK = angka("KUOTA_CACHE_DETIK", 20);
const cache = new Map<string, { byte: number; sampai: number }>();

export class KuotaHabis extends Error {}

/**
 * Batas khusus per pemilik dari env berbentuk "pri-900000001=5120,pri-7=3072"
 * (5 Okt 2026: akun tim TV Rakyat Official 5 GB, anggota tetap KUOTA_AKUN_MB).
 */
export function petaKhusus(nama: string): Map<string, number> {
  const peta = new Map<string, number>();
  for (const bagian of String(process.env[nama] ?? "").split(",")) {
    const [kunci, nilai] = bagian.split("=").map((x) => x.trim());
    const n = Number(nilai);
    if (kunci && Number.isFinite(n) && n > 0) peta.set(kunci.toLowerCase(), Math.trunc(n));
  }
  return peta;
}

const KUOTA_KHUSUS_MB = petaKhusus("KUOTA_KHUSUS_MB");

export function batasByte(pemilik: string): number {
  const khusus = KUOTA_KHUSUS_MB.get(String(pemilik ?? "").trim().toLowerCase());
  return (khusus ?? KUOTA_AKUN_MB) * 1_048_576;
}

function ukuranFolder(folder: string): number {
  let total = 0;
  let isi: fs.Dirent[];
  try {
    isi = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const d of isi) {
    const p = path.join(folder, d.name);
    try {
      if (d.isDirectory()) total += ukuranFolder(p);
      else if (d.isFile()) total += fs.statSync(p).size;
    } catch {
      // berkas hilang di tengah hitungan
    }
  }
  return total;
}

function pemilikTemplateDiFolder(folder: string): string {
  try {
    const isi = JSON.parse(fs.readFileSync(path.join(folder, "template.json"), "utf8"));
    return String(isi?.owner ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

/** Berapa byte yang sedang dipakai akun ini (template + hasil render). */
export async function pemakaianByte(pemilik: string, paksa = false): Promise<number> {
  const p = String(pemilik ?? "").trim().toLowerCase();
  const tersimpan = cache.get(p);
  if (tersimpan && !paksa && tersimpan.sampai > Date.now() / 1000) return tersimpan.byte;
  let total = 0;
  for (const d of fs.readdirSync(templatesDir(), { withFileTypes: true })) {
    const folder = path.join(templatesDir(), d.name);
    if (d.isDirectory() && pemilikTemplateDiFolder(folder) === p) total += ukuranFolder(folder);
  }
  try {
    for (const job of await daftarJob(500, p)) {
      const folder = jobPath(String(job.job_id ?? ""));
      if (fs.existsSync(folder)) total += ukuranFolder(folder);
    }
  } catch {
    console.warn(`Pemakaian job ${p} tidak terbaca`);
  }
  cache.set(p, { byte: total, sampai: Date.now() / 1000 + CACHE_DETIK });
  return total;
}

/** Lempar KuotaHabis kalau menambah `tambahan` byte akan melewati jatah. */
export async function pastikanMuat(pemilik: string, tambahan = 0): Promise<void> {
  const batas = batasByte(pemilik);
  const dipakai = await pemakaianByte(pemilik);
  if (dipakai + Math.max(0, tambahan) < batas || (tambahan > 0 && dipakai + tambahan <= batas)) return;
  throw new KuotaHabis(
    `Jatah penyimpanan akun sudah terpakai ${(dipakai / 1_048_576).toFixed(0)} MB dari ` +
      `${(batas / 1_048_576).toFixed(0)} MB. Hapus beberapa template atau hasil render dulu.`,
  );
}

/**
 * Pemakaian penyimpanan SEMUA pemilik (template + job/stok), byte — untuk
 * kartu server di Beranda master (5 Okt 2026). Folder job tanpa catatan
 * (sudah tersapu dari Redis) dihitung sebagai "?".
 */
export async function pemakaianPerPemilik(): Promise<Map<string, number>> {
  const hasil = new Map<string, number>();
  const tambah = (k: string, n: number) => hasil.set(k || "?", (hasil.get(k || "?") ?? 0) + n);
  for (const d of fs.readdirSync(templatesDir(), { withFileTypes: true })) {
    const folder = path.join(templatesDir(), d.name);
    if (d.isDirectory()) tambah(pemilikTemplateDiFolder(folder), ukuranFolder(folder));
  }
  for (const d of fs.readdirSync(jobsDir(), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    let pemilik = "";
    try {
      pemilik = String((await bacaStatus(d.name)).owner ?? "").trim().toLowerCase();
    } catch {
      pemilik = "";
    }
    tambah(pemilik, ukuranFolder(path.join(jobsDir(), d.name)));
  }
  return hasil;
}

export function lupakan(pemilik: string): void {
  cache.delete(String(pemilik ?? "").trim().toLowerCase());
}
