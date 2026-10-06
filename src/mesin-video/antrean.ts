// Antrean render (pengganti Celery). BullMQ di Redis yang sama dengan status
// job; status yang dibaca halaman tetap kunci videojob:* milik job.ts, BullMQ
// hanya pengantar "kerjakan job ini".
import { Queue } from "bullmq";
import Redis from "ioredis";
import { bacaStatus, daftarJob, redis, STATUS_AKTIF_JOB, tulisStatus } from "./job";

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
  /** Jenis tugas (5 Okt 2026): kosong = render template; "kompres" = Kompres Video; "hapuslatar" = Hapus Latar Boom. */
  jenis?: "kompres" | "hapuslatar" | "blur";
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

/** Batas prioritas BullMQ (1 = paling didahulukan). */
const PRIORITAS_MAKS = 2_097_152;

/**
 * PRIORITAS ADIL (6 Okt 2026): slot serentak (10) dipakai bergiliran antar
 * ORANG, bukan siapa cepat dia dapat semua. Prioritas = jumlah job aktif
 * pemiliknya (termasuk job ini) — video pertama seseorang = 1, kedua = 2, dst.
 * BullMQ mengambil prioritas terkecil dulu dan FIFO di antara yang sama,
 * jadi video ke-2 seseorang baru dikerjakan setelah video ke-1 semua orang
 * yang sudah mengantre. Akun tim dihitung per anggota pembuatnya.
 */
async function hitungPrioritas(jobId: string): Promise<number> {
  try {
    const st = await bacaStatus(jobId);
    const pemilik = String(st.owner ?? "").trim().toLowerCase();
    if (!pemilik) return 1;
    const anggota = String((st as Record<string, unknown>).anggota ?? "");
    const aktif = (await daftarJob(500, pemilik)).filter(
      (j) =>
        STATUS_AKTIF_JOB.includes(j.status) &&
        (!anggota || String((j as Record<string, unknown>).anggota ?? "") === anggota),
    );
    const n = Math.min(PRIORITAS_MAKS, Math.max(1, aktif.length));
    await tulisStatus(jobId, { prioritas: n });
    return n;
  } catch {
    return 1;
  }
}

/** Kirim job ke worker (pengganti render_video.delay). */
export async function kirimRender(muatan: MuatanRender): Promise<void> {
  const prioritas = await hitungPrioritas(muatan.job_id);
  if (pengirim) return pengirim(muatan);
  await ambilAntrean().add("render_video", muatan, {
    jobId: muatan.job_id,
    priority: prioritas,
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
