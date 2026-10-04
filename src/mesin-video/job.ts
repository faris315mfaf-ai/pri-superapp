// Status job render di Redis — cermin video_tasks.py. Kunci & bentuk JSON
// SAMA PERSIS dengan versi Python (videojob:<id>, videojob:urut,
// videojob:aktif, videojob:batal:<id>, videojob:rata_detik), supaya selama
// peralihan kedua mesin membaca antrean dan riwayat yang sama.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Redis from "ioredis";
import { UMUR_SIMPAN_JAM } from "./konfig";
import { jobsDir } from "./jalur";
import { GalatVideo, type Job, type StatusJob } from "./jenis";

export const KUNCI_JOB = "videojob:";
export const KUNCI_URUT = "videojob:urut";
export const KUNCI_AKTIF = "videojob:aktif";
export const KUNCI_BATAL = "videojob:batal:";
export const KUNCI_RATA = "videojob:rata_detik";
export const BATAL_UMUR_DETIK = 3 * 3600;

const angka = (nama: string, bawaan: number) => {
  const n = Number.parseFloat(process.env[nama] ?? "");
  return Number.isFinite(n) ? n : bawaan;
};
export const JOB_RETENTION_HOURS = UMUR_SIMPAN_JAM;
export const RATA_AWAL_DETIK = angka("VIDEO_PERKIRAAN_AWAL_DETIK", 90);
export const WORKER_PARALEL = Math.max(1, Math.trunc(angka("VIDEO_WORKER_PARALEL", 1)));
// Batas atas slot serentak yang boleh dipilih master (jaga CPU/RAM VPS).
export const SLOT_MAKS = Math.max(1, Math.trunc(angka("VIDEO_SLOT_MAKS", 8)));
export const KUNCI_SLOT = "videojob:slot";
export const TERLANTAR_DETIK = angka("VIDEO_JOB_TERLANTAR_DETIK", 900);
export const STATUS_AKTIF_JOB: readonly StatusJob[] = ["queued", "downloading", "rendering"];
export const STATUS_BERJALAN_JOB: readonly StatusJob[] = ["downloading", "rendering"];
export const PESAN_TERLANTAR =
  "Terputus: server dijalankan ulang di tengah proses. Tekan Coba lagi untuk membuat ulang dari awal.";

let klien: Redis | null = null;
/** Klien Redis bersama (REDIS_URL); bisa diganti untuk uji lewat aturRedis. */
export function redis(): Redis {
  if (!klien) {
    klien = new Redis(process.env.REDIS_URL || "redis://localhost:6379/0", {
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
    });
  }
  return klien;
}
export function aturRedis(r: Redis): void {
  klien = r;
}

export const sekarang = () => Date.now() / 1000;

export function amanId(jobId: string): string {
  const aman = Array.from(String(jobId))
    .filter((c) => /[A-Za-z0-9_-]/.test(c))
    .join("")
    .slice(0, 64);
  if (!aman) throw new GalatVideo("ID job tidak sah");
  return aman;
}

export function jobPath(jobId: string): string {
  return path.join(jobsDir(), amanId(jobId));
}

function urai(mentah: string | null, jobId: string): Job | null {
  if (mentah === null) return null;
  try {
    return JSON.parse(mentah) as Job;
  } catch {
    return { job_id: jobId, status: "error", message: "Status job rusak" } as Job;
  }
}

export async function bacaStatus(jobId: string): Promise<Job> {
  const status = urai(await redis().get(KUNCI_JOB + amanId(jobId)), jobId);
  if (!status) throw new GalatVideo(`Job '${jobId}' tidak ditemukan`);
  return status;
}

// Penulisan status = baca-ubah-tulis. Kabar progres & log render datang
// tanpa ditunggu satu sama lain; tanpa antrean per job, dua penulisan yang
// bersamaan saling menimpa (Python menulisnya berurutan dari satu utas).
const antreTulis = new Map<string, Promise<unknown>>();

/** Ubah status job; `log` ditambahkan ke catatan & jadi pesan terakhir. */
export function tulisStatus(jobId: string, ubahan: Record<string, unknown> & { log?: string }): Promise<Job> {
  const id = amanId(jobId);
  const sebelum = antreTulis.get(id) ?? Promise.resolve();
  const kerja = sebelum.catch(() => undefined).then(() => tulisStatusLangsung(id, ubahan));
  antreTulis.set(id, kerja);
  void kerja.finally(() => {
    if (antreTulis.get(id) === kerja) antreTulis.delete(id);
  }).catch(() => undefined);
  return kerja;
}

async function tulisStatusLangsung(id: string, ubahan: Record<string, unknown> & { log?: string }): Promise<Job> {
  const kunci = KUNCI_JOB + id;
  const r = redis();
  let data = urai(await r.get(kunci), id);
  if (!data) data = { job_id: id, logs: [], progress: 0, created: sekarang() } as unknown as Job;
  const { log, ...lain } = ubahan;
  if (log) {
    data.logs = [...(data.logs ?? []), log].slice(-200);
    data.message = log;
  }
  Object.assign(data, lain);
  data.job_id = id;
  data.updated = sekarang();
  const skor = Number(data.created) || sekarang();
  const pipa = r.multi();
  pipa.set(kunci, JSON.stringify(data), "EX", Math.trunc(JOB_RETENTION_HOURS * 3600));
  pipa.zadd(KUNCI_URUT, skor, id);
  // Daftar antrean mengikuti status: masuk selama belum selesai, keluar
  // begitu selesai/gagal/dibatalkan — apa pun jalur yang mengubahnya.
  if (STATUS_AKTIF_JOB.includes(data.status)) pipa.zadd(KUNCI_AKTIF, skor, id);
  else pipa.zrem(KUNCI_AKTIF, id);
  await pipa.exec();
  return data;
}

/** Job terbaru; `owner` menyaring per akun. */
export async function daftarJob(batas = 20, owner: string | null = null): Promise<Job[]> {
  const r = redis();
  const ambil = owner === null ? batas : Math.min(batas * 10, 1000);
  const ids = await r.zrevrange(KUNCI_URUT, 0, Math.max(ambil, 1) - 1);
  if (ids.length === 0) return [];
  const isi = await r.mget(ids.map((i) => KUNCI_JOB + i));
  const hilang: string[] = [];
  const hasil: Job[] = [];
  for (let n = 0; n < ids.length; n++) {
    const mentah = isi[n];
    if (mentah === null) {
      hilang.push(ids[n]);
      continue;
    }
    let st: Job;
    try {
      st = JSON.parse(mentah);
    } catch {
      continue;
    }
    if (owner !== null && String(st.owner ?? "") !== owner) continue;
    hasil.push(st);
    if (hasil.length >= batas) break;
  }
  if (hilang.length) await r.zrem(KUNCI_URUT, ...hilang);
  return hasil;
}

function umurKabar(st: Job): number {
  const t = Number(st.updated ?? st.created ?? 0);
  return Number.isFinite(t) ? sekarang() - t : 0;
}

/** Job aktif yang lama membisu ditandai gagal (dipanggil pemantau status). */
export async function segarkanKalauTerlantar(st: Job): Promise<Job> {
  if (STATUS_AKTIF_JOB.includes(st.status) && umurKabar(st) > TERLANTAR_DETIK) {
    return tulisStatus(st.job_id, { status: "error", log: PESAN_TERLANTAR });
  }
  return st;
}

export async function tandaiTerlantar(semuaBerjalan = false, alasan = PESAN_TERLANTAR): Promise<number> {
  let n = 0;
  for (const job of await daftarJob(1000)) {
    if (!STATUS_AKTIF_JOB.includes(job.status)) continue;
    if ((semuaBerjalan && STATUS_BERJALAN_JOB.includes(job.status)) || umurKabar(job) > TERLANTAR_DETIK) {
      await tulisStatus(job.job_id, { status: "error", log: alasan });
      n += 1;
    }
  }
  return n;
}

/** Hapus satu job seluruhnya: berkas dan catatannya. */
export async function buangJob(jobId: string): Promise<void> {
  const id = amanId(jobId);
  fs.rmSync(path.join(jobsDir(), id), { recursive: true, force: true });
  const r = redis();
  await r.multi().del(KUNCI_JOB + id).del(KUNCI_BATAL + id).zrem(KUNCI_URUT, id).zrem(KUNCI_AKTIF, id).exec();
}

export async function rataDurasi(): Promise<number> {
  const n = Number.parseFloat((await redis().get(KUNCI_RATA)) ?? "");
  return Number.isFinite(n) && n > 0 ? n : RATA_AWAL_DETIK;
}

/** Rata-rata bergerak: 30% bobot untuk job terbaru. */
export async function catatDurasi(detik: number): Promise<void> {
  if (detik <= 0) return;
  const baru = (await rataDurasi()) * 0.7 + Math.min(Math.max(detik, 5), 3600) * 0.3;
  try {
    await redis().set(KUNCI_RATA, baru.toFixed(1));
  } catch {
    // perkiraan bukan hal kritis
  }
}

function sisaDetik(st: Job, rata: number, kini: number): number {
  const mulai = Number(st.mulai_proses ?? kini);
  const berjalan = Number.isFinite(mulai) ? kini - mulai : 0;
  let sisa = rata - berjalan;
  const progres = Number(st.progress ?? 0) || 0;
  const lamaRender = kini - (Number(st.mulai_render ?? 0) || 0);
  if (st.status === "rendering" && progres > 0 && progres < 100 && lamaRender > 0 && lamaRender < kini) {
    sisa = (lamaRender * (100 - progres)) / progres;
  }
  return Math.max(5, sisa);
}

export type Antrean = { posisi: number; di_depan: number; sedang_dikerjakan: boolean; perkiraan_detik: number };

/** Nomor antrean & perkiraan tunggu; null bila job sudah tidak aktif. */
/** Berapa render boleh berjalan SERENTAK (diatur master, disimpan di Redis). */
export async function slotSerentak(): Promise<number> {
  try {
    const n = Number.parseInt((await redis().get(KUNCI_SLOT)) ?? "", 10);
    if (Number.isFinite(n) && n >= 1 && n <= SLOT_MAKS) return n;
  } catch {
    // Redis bermasalah: pakai bawaan dari env.
  }
  return Math.min(WORKER_PARALEL, SLOT_MAKS);
}

/** Setel jumlah slot serentak (dibatasi 1..SLOT_MAKS). */
export async function aturSlotSerentak(n: number): Promise<number> {
  const v = Math.max(1, Math.min(SLOT_MAKS, Math.trunc(Number(n) || 1)));
  await redis().set(KUNCI_SLOT, String(v));
  return v;
}

export async function posisiAntrean(jobId: string): Promise<Antrean | null> {
  const id = amanId(jobId);
  const r = redis();
  const ids = await r.zrange(KUNCI_AKTIF, 0, -1);
  if (!ids.includes(id)) return null;
  const isi = await r.mget(ids.map((i) => KUNCI_JOB + i));
  const hidup: Job[] = [];
  const basi: string[] = [];
  ids.forEach((i, n) => {
    let st: Job | null = null;
    try {
      st = isi[n] ? JSON.parse(isi[n] as string) : null;
    } catch {
      st = null;
    }
    if (!st || !STATUS_AKTIF_JOB.includes(st.status)) basi.push(i);
    else hidup.push(st);
  });
  if (basi.length) await r.zrem(KUNCI_AKTIF, ...basi);
  const rata = await rataDurasi();
  // Perkiraan tunggu dibagi jumlah slot serentak yang berlaku (diatur master):
  // makin banyak slot, makin cepat antrean dikerjakan.
  const slot = await slotSerentak();
  const kini = sekarang();
  let tunggu = 0;
  let diDepan = 0;
  for (const st of hidup) {
    if (st.job_id === id) {
      if (STATUS_BERJALAN_JOB.includes(st.status)) {
        return { posisi: 1, di_depan: 0, sedang_dikerjakan: true, perkiraan_detik: Math.round(sisaDetik(st, rata, kini)) };
      }
      return { posisi: diDepan + 1, di_depan: diDepan, sedang_dikerjakan: false, perkiraan_detik: Math.round(tunggu / slot + rata) };
    }
    diDepan += 1;
    tunggu += STATUS_BERJALAN_JOB.includes(st.status) ? sisaDetik(st, rata, kini) : rata;
  }
  return null;
}

export async function mintaBatal(jobId: string): Promise<void> {
  await redis().set(KUNCI_BATAL + amanId(jobId), "1", "EX", BATAL_UMUR_DETIK);
}

export async function dimintaBatal(jobId: string): Promise<boolean> {
  try {
    return (await redis().exists(KUNCI_BATAL + amanId(jobId))) > 0;
  } catch {
    // Redis bermasalah: lebih baik render diteruskan daripada salah paham.
    return false;
  }
}

export async function lupakanBatal(jobId: string): Promise<void> {
  await redis().del(KUNCI_BATAL + amanId(jobId));
}

/** Siapkan status awal job baru; kembalikan id-nya. */
export async function buatJob(url: string, templateId: string, texts: Record<string, string> = {}, owner = ""): Promise<string> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  await tulisStatus(id, {
    status: "queued",
    progress: 0,
    url,
    // Alamat sumber disimpan terpisah: kolom "url" nanti ditimpa alamat
    // hasil render, sedangkan tombol "coba lagi" butuh yang asli.
    sumber_url: url,
    template_id: templateId,
    owner: String(owner).trim().toLowerCase(),
    texts,
    output: null,
    error: null,
    log: "Job masuk antrean.",
  });
  return id;
}
