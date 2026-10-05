// Antrean render (pengganti Celery). BullMQ di Redis yang sama dengan status
// job; status yang dibaca halaman tetap kunci videojob:* milik job.ts, BullMQ
// hanya pengantar "kerjakan job ini".
import { Queue } from "bullmq";
import Redis from "ioredis";
import { redis } from "./job";

export const NAMA_ANTREAN = "autoedit-render";
// Detak worker: worker memperbarui kunci ini berkala; API membacanya untuk
// worker_hidup (pengganti celery ping).
export const KUNCI_DETAK_WORKER = "videojob:worker_detak";
export const DETAK_DETIK = 10;

export type MuatanRender = {
  job_id: string;
  url: string;
  template_id: string;
  texts: Record<string, string>;
  teks_warna?: string;
  /** Jenis tugas (5 Okt 2026): kosong = render template; "kompres" = Kompres Video. */
  jenis?: "kompres";
  mutu?: string;
};

/** Koneksi untuk BullMQ: wajib maxRetriesPerRequest null (perintah blok). */
export function koneksiBull(): Redis {
  return new Redis(process.env.REDIS_URL || "redis://localhost:6379/0", { maxRetriesPerRequest: null });
}

let antrean: Queue<MuatanRender> | null = null;
function ambilAntrean(): Queue<MuatanRender> {
  if (!antrean) antrean = new Queue<MuatanRender>(NAMA_ANTREAN, { connection: koneksiBull() });
  return antrean;
}

// Bisa diganti uji (tanpa Redis sungguhan, BullMQ butuh skrip Lua).
let pengirim: ((m: MuatanRender) => Promise<void>) | null = null;
export function aturPengirim(fn: ((m: MuatanRender) => Promise<void>) | null): void {
  pengirim = fn;
}

/** Kirim job ke worker (pengganti render_video.delay). */
export async function kirimRender(muatan: MuatanRender): Promise<void> {
  if (pengirim) return pengirim(muatan);
  await ambilAntrean().add("render_video", muatan, {
    jobId: muatan.job_id,
    // Status sendiri yang mencatat hasil; catatan BullMQ cukup sebentar.
    removeOnComplete: { age: 3600, count: 200 },
    removeOnFail: { age: 3600, count: 200 },
    attempts: 1,
  });
}

let cacheWorker: { ada: boolean; sampai: number } = { ada: false, sampai: 0 };

/** Apakah ada worker yang siap; jawaban diingat 10 detik. */
export async function workerHidup(paksa = false): Promise<boolean> {
  if (!paksa && cacheWorker.sampai > Date.now()) return cacheWorker.ada;
  let ada = false;
  try {
    ada = (await redis().exists(KUNCI_DETAK_WORKER)) > 0;
  } catch {
    ada = false;
  }
  cacheWorker = { ada, sampai: Date.now() + 10_000 };
  return ada;
}

export async function tutupAntrean(): Promise<void> {
  if (antrean) await antrean.close();
  antrean = null;
}
