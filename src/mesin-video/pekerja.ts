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
  slotSerentak,
} from "./job";
import { probe } from "./media";
import { hapusLatar } from "./hapus-latar";
import { templatePath } from "./jalur";
import { kompresVideo, mutuSah } from "./kompres";
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

/**
 * Kompres Video (uji coba, 5 Okt 2026). Berkas masukan sudah ada di folder
 * job (diunggah lewat API); hasilnya output.mp4 di folder yang sama → otomatis
 * masuk Stok Video pemiliknya.
 */
export async function kompresJob(m: MuatanRender): Promise<{ job_id: string; status: string; [k: string]: unknown }> {
  const jobId = m.job_id;
  const folder = jobPath(jobId);
  const catat = (teks: string) => tulisStatus(jobId, { log: teks }).then(() => undefined);
  try {
    const st = await bacaStatus(jobId).catch(() => null);
    if (!st || st.status !== "queued") return { job_id: jobId, status: st?.status ?? "hilang" };
    if (await dimintaBatal(jobId)) {
      await lupakanBatal(jobId);
      await tulisStatus(jobId, { status: "dibatalkan", progress: 0, log: "Dihentikan sebelum mulai." });
      return { job_id: jobId, status: "dibatalkan" };
    }
    const masukan = path.join(folder, String((st as Record<string, unknown>).masukan ?? ""));
    if (!fs.existsSync(masukan)) throw new GalatVideo("Berkas video yang akan dikompres tidak ditemukan.");
    await tulisStatus(jobId, { status: "rendering", progress: 0, task_id: jobId, mulai_proses: Date.now() / 1000 });
    const hasil = await kompresVideo(masukan, folder, mutuSah(m.mutu), await durasiVideo(masukan), {
      progress: (p) => tulisStatus(jobId, { progress: p }).then(() => undefined),
      log: catat,
      batal: () => dimintaBatal(jobId),
    });
    hapusDiam(masukan);
    const hemat = hasil.size_awal > 0 ? Math.round((100 * (hasil.size_awal - hasil.size)) / hasil.size_awal) : 0;
    await tulisStatus(jobId, {
      status: "done",
      progress: 100,
      output: path.basename(hasil.berkas),
      url: "",
      durasi: await durasiVideo(hasil.berkas),
      size: hasil.size,
      size_awal: hasil.size_awal,
      crf: hasil.crf,
      vmaf: hasil.vmaf,
      hemat_persen: hemat,
      diperkecil: hasil.diperkecil,
      log: hasil.diperkecil
        ? `Selesai: ${hemat}% lebih kecil, VMAF ${hasil.vmaf}.`
        : "Video sudah efisien — tidak bisa diperkecil tanpa menurunkan kualitas. Video asli disimpan.",
    });
    await bersihkanJobLama();
    return { job_id: jobId, status: "done" };
  } catch (e) {
    const dibatal = e instanceof Dibatalkan;
    const pesan = e instanceof GalatVideo ? e.message : e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    if (dibatal) await lupakanBatal(jobId);
    else console.error(`Kompres ${jobId} gagal`, e);
    // Masukan (sampai 100 MB) tak berguna lagi; jangan makan kuota 48 jam.
    try {
      for (const n of fs.existsSync(folder) ? fs.readdirSync(folder) : []) if (n.startsWith("masukan.")) hapusDiam(path.join(folder, n));
    } catch {
      // folder sudah hilang
    }
    await tulisStatus(jobId, dibatal ? { status: "dibatalkan", log: "Kompres dihentikan." } : { status: "error", error: pesan, log: `Gagal: ${pesan}` });
    await bersihkanSetelahGagal(jobId, folder);
    return { job_id: jobId, status: dibatal ? "dibatalkan" : "error" };
  }
}

/** Berkas "boom.*" terbaru di folder, atau null. */
function boomDi(folder: string): string | null {
  try {
    const calon = fs
      .readdirSync(folder)
      .filter((n) => n.startsWith("boom."))
      .map((n) => path.join(folder, n))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return calon[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Hapus Latar Boom (uji coba, 5 Okt 2026). Salinan video Boom (draf atau
 * yang terpasang) sudah ada di folder job; hasil MOV beralpha dipasang
 * sebagai DRAF Boom template — pengguna melihatnya di pratinjau lalu
 * menekan Simpan & Tetapkan. Bila Boom sudah diganti/dibuang selagi diproses,
 * hasilnya dibuang (tidak menimpa pilihan baru pengguna).
 */
export async function hapusLatarJob(m: MuatanRender): Promise<{ job_id: string; status: string; [k: string]: unknown }> {
  const jobId = m.job_id;
  const folder = jobPath(jobId);
  const buangSisa = () => {
    try {
      for (const n of fs.existsSync(folder) ? fs.readdirSync(folder) : []) {
        if (n.startsWith("masukan.") || n === "boom.mov") hapusDiam(path.join(folder, n));
      }
    } catch {
      // folder sudah hilang
    }
  };
  try {
    const st = (await bacaStatus(jobId).catch(() => null)) as (Record<string, unknown> & { status: string }) | null;
    if (!st || st.status !== "queued") return { job_id: jobId, status: st?.status ?? "hilang" };
    if (await dimintaBatal(jobId)) {
      await lupakanBatal(jobId);
      buangSisa();
      await tulisStatus(jobId, { status: "dibatalkan", progress: 0, log: "Dihentikan sebelum mulai." });
      return { job_id: jobId, status: "dibatalkan" };
    }
    const masukan = path.join(folder, String(st.masukan ?? ""));
    const tid = String(st.tid ?? "");
    if (!tid || !fs.existsSync(masukan)) throw new GalatVideo("Video Boom yang akan diproses tidak ditemukan.");
    await tulisStatus(jobId, { status: "rendering", progress: 0, task_id: jobId, mulai_proses: Date.now() / 1000 });
    const hasil = await hapusLatar(masukan, folder, await durasiVideo(masukan), {
      progress: (p) => tulisStatus(jobId, { progress: p }).then(() => undefined),
      batal: () => dimintaBatal(jobId),
    });
    hapusDiam(masukan);

    // Pasang sebagai draf — hanya bila Boom belum berubah sejak dimulai.
    const draf = path.join(templatePath(tid), "assets", ".draf");
    const kini = boomDi(draf);
    const asal = st.draf_sumber as { nama?: string; mtime?: number } | null | undefined;
    const masihSama = asal
      ? kini !== null && path.basename(kini) === asal.nama && Math.abs(fs.statSync(kini).mtimeMs - Number(asal.mtime)) < 1
      : kini === null;
    if (!masihSama || (await dimintaBatal(jobId))) {
      await lupakanBatal(jobId);
      buangSisa();
      await tulisStatus(jobId, { status: "dibatalkan", progress: 0, log: "Bahan Boom sudah diganti — hasil hapus latar dibuang." });
      return { job_id: jobId, status: "dibatalkan" };
    }
    fs.mkdirSync(draf, { recursive: true });
    for (const n of fs.readdirSync(draf)) if (n.startsWith("boom.")) hapusDiam(path.join(draf, n));
    fs.renameSync(hasil.berkas, path.join(draf, "boom.mov"));
    await tulisStatus(jobId, {
      status: "done",
      progress: 100,
      mode: hasil.mode,
      warna: hasil.warna,
      frame: hasil.frame,
      log:
        hasil.mode === "warna"
          ? `Latar warna polos (${hasil.warna}) dibuang.`
          : `Latar dibuang dengan AI (${hasil.frame} frame).`,
    });
    return { job_id: jobId, status: "done" };
  } catch (e) {
    const dibatal = e instanceof Dibatalkan;
    const pesan = e instanceof GalatVideo ? e.message : e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    if (dibatal) await lupakanBatal(jobId);
    else console.error(`Hapus latar ${jobId} gagal`, e);
    buangSisa();
    await tulisStatus(jobId, dibatal ? { status: "dibatalkan", log: "Hapus latar dihentikan." } : { status: "error", error: pesan, log: `Gagal: ${pesan}` });
    hapusDiam(path.join(folder, "kerja"), true);
    return { job_id: jobId, status: dibatal ? "dibatalkan" : "error" };
  }
}

/** Satu pintu worker: render template, Kompres Video, atau Hapus Latar Boom. */
function kerjakan(m: MuatanRender) {
  if (m.jenis === "kompres") return kompresJob(m);
  if (m.jenis === "hapuslatar") return hapusLatarJob(m);
  return renderVideo(m);
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

  const slotAwal = await slotSerentak();
  const worker = new Worker<MuatanRender>(NAMA_ANTREAN, (j: JobBull<MuatanRender>) => kerjakan(j.data), {
    connection: koneksiBull(),
    concurrency: slotAwal,
    // Unduhan (10 mnt) + render (30 mnt): kunci diperpanjang otomatis selama
    // proses hidup; kalau proses mati, tugasnya dianggap macet lalu dikirim
    // ulang — dan dilewati karena statusnya sudah bukan queued.
    lockDuration: 60_000,
    maxStalledCount: 1,
  });
  worker.on("error", (e) => console.error("Worker antrean galat", e));
  console.info(`Worker Auto Edit (TS) siap, ${slotAwal} video sekaligus`);

  // Slot serentak bisa diubah master tanpa restart: ikuti nilai Redis.
  const selarasSlot = async () => {
    try {
      const n = await slotSerentak();
      if (worker.concurrency !== n) {
        worker.concurrency = n;
        console.info(`Slot serentak diubah jadi ${n}`);
      }
    } catch {
      // nilai lama dipertahankan
    }
  };
  const pewaktuSlot = setInterval(selarasSlot, 5000);
  pewaktuSlot.unref();

  const tutup = async () => {
    clearInterval(pewaktu);
    clearInterval(pewaktuSlot);
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
