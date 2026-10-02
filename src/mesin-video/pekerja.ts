// Worker render (pengganti video_tasks.render_video + Celery). Mengambil
// job dari antrean BullMQ, mengunduh sumber, merender, lalu menulis status
// ke kunci videojob:* yang sama dengan yang dibaca API.
import fs from "node:fs";
import path from "node:path";
import { Worker, type Job as JobBull } from "bullmq";
import { DETAK_DETIK, KUNCI_DETAK_WORKER, koneksiBull, NAMA_ANTREAN, type MuatanRender } from "./antrean";
import { Dibatalkan, GalatVideo } from "./jenis";
import {
  bacaStatus,
  catatDurasi,
  dimintaBatal,
  jobPath,
  lupakanBatal,
  redis,
  tandaiTerlantar,
  tulisStatus,
  WORKER_PARALEL,
} from "./job";
import { probe } from "./media";
import { render } from "./render";
import { loadTemplate } from "./template";
import { downloadSource, pasangRedisBatas } from "./unduh";
import { bersihkanJobLama } from "./volume";

/** Durasi hasil render dalam detik; 0 kalau tidak terbaca. */
async function durasiVideo(berkas: string): Promise<number> {
  try {
    return Math.round((Number((await probe(berkas)).duration ?? 0) || 0) * 10) / 10;
  } catch {
    return 0;
  }
}

function hapusDiam(p: string, rekursif = false): void {
  try {
    fs.rmSync(p, { force: true, recursive: rekursif });
  } catch {
    // tidak kritis
  }
}

/**
 * Buang sisa proses render yang tidak dipakai lagi: catatan ffmpeg, salinan
 * perintahnya, dan gambar teks sementara. Video hasilnya tetap tinggal.
 */
function bersihkanBerkasKerja(folder: string): void {
  for (const nama of ["ffmpeg.log", "ffmpeg-command.txt"]) hapusDiam(path.join(folder, nama));
  try {
    for (const n of fs.readdirSync(folder)) if (/^text_.*\.png$/.test(n)) hapusDiam(path.join(folder, n));
  } catch {
    // folder sudah tidak ada
  }
  hapusDiam(path.join(folder, "kerja"), true);
}

/** Pembersihan saat gagal: catatan ffmpeg DIPERTAHANKAN (isinya alasan gagal). */
async function bersihkanSetelahGagal(jobId: string, folder: string): Promise<void> {
  try {
    for (const n of fs.existsSync(folder) ? fs.readdirSync(folder) : []) {
      if (n.startsWith("source.")) hapusDiam(path.join(folder, n));
    }
    // Hasil setengah jadi dari render yang dihentikan/gagal tidak berguna.
    hapusDiam(path.join(folder, "output.mp4"));
    hapusDiam(path.join(folder, "kerja"), true);
  } catch (e) {
    console.warn(`Sisa job ${jobId} gagal dibersihkan:`, e instanceof Error ? e.message : e);
  }
  try {
    await bersihkanJobLama();
  } catch (e) {
    console.error("Pembersihan job lama gagal", e);
  }
}

export async function renderVideo(m: MuatanRender): Promise<{ job_id: string; status: string; [k: string]: unknown }> {
  const jobId = m.job_id;
  const folder = jobPath(jobId);
  const catat = (teks: string) => tulisStatus(jobId, { log: teks }).then(() => undefined);
  try {
    // Hanya job yang masih menunggu yang dikerjakan: antrean bisa mengirim
    // ulang tugas yang workernya mati, padahal saat worker hidup lagi job itu
    // sudah ditandai gagal (dan mungkin sudah dibuat ulang).
    let keadaan: string | null;
    try {
      keadaan = (await bacaStatus(jobId)).status;
    } catch (e) {
      if (!(e instanceof GalatVideo)) throw e;
      keadaan = null;
    }
    if (keadaan !== "queued") {
      console.info(`Job ${jobId} dilewati: statusnya ${keadaan}, bukan queued`);
      return { job_id: jobId, status: keadaan || "hilang" };
    }
    // Job yang sudah diminta berhenti sebelum sempat mulai tidak dikerjakan.
    if (await dimintaBatal(jobId)) {
      await lupakanBatal(jobId);
      await tulisStatus(jobId, { status: "dibatalkan", progress: 0, log: "Dihentikan sebelum mulai." });
      return { job_id: jobId, status: "dibatalkan" };
    }
    let template = loadTemplate(m.template_id);
    // Penimpaan warna tulisan berita untuk render ini saja.
    if (m.teks_warna === "black" || m.teks_warna === "white") template = { ...template, teks_warna: m.teks_warna };
    await tulisStatus(jobId, { status: "downloading", progress: 0, task_id: jobId, mulai_proses: Date.now() / 1000 });
    await catat(`Template: ${template.name || m.template_id}`);
    const sumber = await downloadSource(m.url, folder, catat);

    await tulisStatus(jobId, { status: "rendering", progress: 0, mulai_render: Date.now() / 1000 });
    const hasil = await render(template, sumber, folder, {
      texts: m.texts ?? {},
      log: catat,
      progress: (p: number) => tulisStatus(jobId, { progress: p }).then(() => undefined),
      batal: () => dimintaBatal(jobId),
    });
    // Sumber tidak dipakai lagi; hapus supaya disk hemat.
    hapusDiam(sumber);

    try {
      const mulai = Number((await bacaStatus(jobId)).mulai_proses ?? 0);
      if (mulai > 0) await catatDurasi(Date.now() / 1000 - mulai);
    } catch {
      // perkiraan bukan hal kritis
    }
    await tulisStatus(jobId, {
      status: "done",
      progress: 100,
      output: path.basename(hasil),
      // Hasil diambil lewat /api/video/jobs/<id>/file dari volume media.
      url: "",
      durasi: await durasiVideo(hasil),
      size: fs.statSync(hasil).size,
      log: "Video siap diunduh.",
    });
    bersihkanBerkasKerja(folder);
    await bersihkanJobLama();
    return { job_id: jobId, status: "done", output: hasil };
  } catch (e) {
    if (e instanceof Dibatalkan) {
      console.info(`Job video ${jobId} dihentikan pengguna`);
      await lupakanBatal(jobId);
      await tulisStatus(jobId, { status: "dibatalkan", log: "Pembuatan video dihentikan." });
      await bersihkanSetelahGagal(jobId, folder);
      return { job_id: jobId, status: "dibatalkan" };
    }
    if (e instanceof GalatVideo) {
      console.warn(`Job video ${jobId} gagal: ${e.message}`);
      await tulisStatus(jobId, { status: "error", error: e.message, log: `Gagal: ${e.message}` });
      await bersihkanSetelahGagal(jobId, folder);
      return { job_id: jobId, status: "error", error: e.message };
    }
    console.error(`Job video ${jobId} gagal tak terduga`, e);
    const pesan = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await tulisStatus(jobId, { status: "error", error: pesan, log: `Gagal: ${pesan}` });
    await bersihkanSetelahGagal(jobId, folder);
    return { job_id: jobId, status: "error", error: pesan };
  }
}

async function mulai(): Promise<void> {
  // Penahan situs (jeda setelah 429) dibagi bersama API lewat Redis.
  pasangRedisBatas(redis());
  // Begitu worker siap, job yang ditinggal worker lama ditandai gagal: deploy
  // memulai ulang container, render yang berjalan mati tanpa sempat menulis.
  try {
    const n = await tandaiTerlantar(
      true,
      "Terputus: worker dijalankan ulang (deploy) di tengah proses. Tekan Coba lagi untuk membuat ulang dari awal.",
    );
    if (n) console.warn(`${n} job terlantar ditandai gagal saat worker hidup`);
  } catch (e) {
    console.error("Gagal menandai job terlantar saat worker hidup", e);
  }

  const detak = async () => {
    try {
      await redis().set(KUNCI_DETAK_WORKER, String(Date.now()), "EX", DETAK_DETIK * 3);
    } catch {
      // Redis sesaat tidak terjangkau: detak berikutnya mencoba lagi.
    }
  };
  await detak();
  const pewaktu = setInterval(detak, DETAK_DETIK * 1000);

  const worker = new Worker<MuatanRender>(NAMA_ANTREAN, (j: JobBull<MuatanRender>) => renderVideo(j.data), {
    connection: koneksiBull(),
    concurrency: WORKER_PARALEL,
    // Unduhan (10 mnt) + render (30 mnt): kunci diperpanjang otomatis selama
    // proses hidup; kalau proses mati, tugasnya dianggap macet lalu dikirim
    // ulang — dan dilewati karena statusnya sudah bukan queued.
    lockDuration: 60_000,
    maxStalledCount: 1,
  });
  worker.on("error", (e) => console.error("Worker antrean galat", e));
  console.info(`Worker Auto Edit (TS) siap, ${WORKER_PARALEL} video sekaligus`);

  const tutup = async () => {
    clearInterval(pewaktu);
    try {
      await redis().del(KUNCI_DETAK_WORKER);
    } catch {
      // tidak kritis
    }
    await worker.close();
    await redis().quit();
    process.exit(0);
  };
  process.on("SIGTERM", () => void tutup());
  process.on("SIGINT", () => void tutup());
}

if (process.env.AUTOEDIT_PERAN === "worker") void mulai();
