// Rute /api/video/* (cermin video_api.py): template berlapis, unggahan,
// pratinjau, hook, dan job render. Semua milik satu akun ("pri-<id>").
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { workerHidup } from "../antrean";
import { deteksiKotakTeks } from "../deteksi";
import { rapikanGambar } from "../gambar";
import { buatHook } from "../hook";
import { GalatVideo, type Template } from "../jenis";
import { aman, templatePath, uploadsDir } from "../jalur";
import { AWALAN_UNGGAHAN, MAX_SOURCE_SECONDS, MAX_SOURCE_UPLOAD_MB, POLA_CROP } from "../konfig";
import { kompositStatis, pngRgb } from "../komposit";
import { batasByte, lupakan, pemakaianByte } from "../kuota";
import { pastikanIsiMedia, probe, rapikanVideo } from "../media";
import { POSISI_RUMUS } from "../perintah";
import {
  amanId,
  buangJob,
  daftarJob,
  jobPath,
  segarkanKalauTerlantar,
  STATUS_AKTIF_JOB,
  tandaiTerlantar,
} from "../job";
import {
  asetTemplate,
  bolehUbah,
  buangAsetTakTerpakai,
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
  saveTemplate,
  templateAwalUntuk,
} from "../template";
import { kotakKategoriBawaan } from "../teks";
import { previewSource } from "../unduh";
import {
  akhiran,
  f0,
  akunDari,
  cabutTugas,
  floatLax,
  intLax,
  intQuery,
  JENIS_ASET,
  JENIS_VIDEO,
  jobTerjangkau,
  kirimJob,
  MAX_ASSET_MB,
  MAX_BATCH,
  pastikanAntreanMuat,
  pastikanHook,
  pastikanKuota,
  sediakanRuangUnggah,
  sumberSah,
  tangani,
  templateMilik,
  templateTerlihat,
  tulisUnggahan,
  urut,
  type Pengguna,
} from "./bantu";
import { bacaJson, GalatHttp, identitas, kirimBerkas, kirimGambar, type Permintaan, type Router } from "./dasar";

// ============================================================
//  IDENTITAS (akses.py pengguna_wajib)
// ============================================================

// Akun yang sudah pernah dibuatkan template awal di proses ini.
const sudahDisiapkan = new Set<string>();

/** Akun yang belum punya template sama sekali dapat satu, meminjam bawaan. */
function siapkanTemplateAwal(pemilik: string): void {
  if (sudahDisiapkan.has(pemilik)) return;
  sudahDisiapkan.add(pemilik);
  try {
    if (listTemplates(pemilik).length) return;
    templateAwalUntuk(pemilik);
  } catch (e) {
    // Template bawaan belum ada di disk: halaman membuatkan template kosong.
    if (e instanceof GalatVideo) console.info(`Template awal untuk ${pemilik} tidak dibuat: ${e.message}`);
    else console.error(`Template awal untuk ${pemilik} gagal dibuat`, e);
  }
}

export function penggunaWajib(pm: Permintaan): Pengguna {
  const p = identitas(pm);
  siapkanTemplateAwal(p.username);
  return p;
}

// ============================================================
//  VALIDASI ISI TEMPLATE
// ============================================================
//
// overlays/texts masuk ke perintah ffmpeg dan ke perender teks. Nilai yang
// tidak masuk akal ditolak di pintu depan, bukan saat worker merender.

// w/h overlay dibatasi ke dimensi kanvas maksimum (bukan 8192): nilai di
// atas kanvas hanya memaksa ffmpeg menskala-naik aset ke buffer raksasa
// (sampai 30 overlay sekaligus) → risiko OOM, tanpa manfaat visual.
const BATAS_OVERLAY: Record<string, [number, number]> = { w: [0, 4096], h: [0, 4096], start: [0, 3600], end: [0, 3600] };
const BATAS_TEKS: Record<string, [number, number]> = {
  size: [1, 400], min_size: [1, 400], max_lines: [1, 50], stroke: [0, 50],
  line_spacing: [0, 400], box_padding: [0, 400], line_height: [0.5, 5],
  max_width: [0, 1], width: [0, 8192], x: [-8192, 8192], y: [-8192, 8192],
  start: [0, 3600], end: [0, 3600],
};

/** float() Python atas nilai sembarang; NaN bila tidak bisa. */
function floatPy(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim().replace(/_/g, "");
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return Number(t);
    if (/^[-+]?(inf|infinity)$/i.test(t)) return t.startsWith("-") ? -Infinity : Infinity;
    if (/^[-+]?nan$/i.test(t)) return Number.NaN;
  }
  throw new TypeError("bukan angka");
}

function periksaAngka(item: Record<string, unknown>, batas: Record<string, [number, number]>, jenis: string): string | null {
  for (const [kunci, [bawah, atas]] of Object.entries(batas)) {
    const nilai = item[kunci];
    if (nilai === null || nilai === undefined || nilai === "" || typeof nilai === "boolean") continue;
    let angka: number;
    try {
      angka = floatPy(nilai);
    } catch {
      return `${jenis}.${kunci} harus angka`;
    }
    if (!(bawah <= angka && angka <= atas)) return `${jenis}.${kunci} harus di antara ${bawah} dan ${atas}`;
  }
  return null;
}

function periksaPosisi(nilai: unknown, jenis: string): string | null {
  if (nilai === null || nilai === undefined || (typeof nilai === "number")) return null;
  const teks = String(typeof nilai === "boolean" ? (nilai ? "True" : "False") : nilai).trim();
  if (POSISI_RUMUS.has(teks)) return null;
  try {
    const n = floatPy(teks);
    if (n >= -8192 && n <= 8192) return null;
  } catch {
    // jatuh ke penolakan di bawah
  }
  return `${jenis} tidak sah: ${JSON.stringify(teks.slice(0, 30)).replace(/^"|"$/g, "'")}`;
}

const kamus = z.record(z.string(), z.unknown());
const kotakInt = z.record(z.string(), intLax).nullable();

function strMax(maks: number) {
  return z.string().max(maks, `String should have at most ${maks} characters`);
}

const TemplateBody = z
  .object({
    name: z.string().min(1, "String should have at least 1 character").max(100, "String should have at most 100 characters"),
    width: intLax.pipe(z.number().min(120).max(4096)).default(1080),
    height: intLax.pipe(z.number().min(120).max(4096)).default(1920),
    fps: intLax.pipe(z.number().min(1).max(60)).default(30),
    intro: strMax(200).nullable().default(null),
    outro: strMax(200).nullable().default(null),
    max_duration: floatLax.pipe(z.number().min(1).max(600)).nullable().default(null),
    overlays: z.array(kamus).max(30).default([]),
    texts: z.array(kamus).max(20).default([]),
    text_box: kotakInt.default(null),
    badge_box: kotakInt.default(null),
    kategori: strMax(30).nullable().default(""),
    teks_warna: z.string().nullable().default("white"),
  })
  .superRefine((b, ctx) => {
    for (const item of b.overlays) {
      const crop = String(item.crop || "").trim();
      let pesan: string | null = null;
      if (crop && !POLA_CROP.test(crop)) pesan = "overlay.crop harus berbentuk lebar:tinggi:x:y (angka)";
      else if (String(item.file || "").length > 200) pesan = "overlay.file terlalu panjang";
      else pesan = periksaAngka(item, BATAS_OVERLAY, "overlay") ?? periksaPosisi(item.x, "overlay.x") ?? periksaPosisi(item.y, "overlay.y");
      if (pesan) {
        ctx.addIssue({ code: "custom", path: ["overlays"], message: `Value error, ${pesan}` });
        return;
      }
    }
    for (const item of b.texts) {
      const pesan =
        periksaAngka(item, BATAS_TEKS, "teks") ?? (String(item.default || "").length > 2000 ? "teks.default terlalu panjang" : null);
      if (pesan) {
        ctx.addIssue({ code: "custom", path: ["texts"], message: `Value error, ${pesan}` });
        return;
      }
    }
    for (const k of ["text_box", "badge_box"] as const) {
      const v = b[k];
      if (v && Object.values(v).some((n) => !(n >= -8192 && n <= 8192))) {
        ctx.addIssue({ code: "custom", path: [k], message: "Value error, koordinat kotak di luar batas kanvas" });
      }
    }
  })
  .transform((b) => ({
    ...b,
    kategori: String(b.kategori || "").split(/\s+/).filter(Boolean).join(" "),
    teks_warna: b.teks_warna === "black" || b.teks_warna === "white" ? b.teks_warna : "white",
  }));

// Nilai teks dibatasi 2000 char/entri: tanpa ini `texts.hook` boleh ~2 MB
// (batas badan JSON) dan tata letak teks (O(k²) per baris, sinkron di worker)
// memblok worker bermenit-menit → menahan render semua orang. Samakan dengan
// cap `teks.default` template dan MAKS_HOOK rute TVR.
const teksBody = z.record(z.string(), z.string().max(2000)).default({});
const DuplikatBody = z.object({ name: z.string().min(1).max(100) });
const BatchBody = z.object({
  url: z.string().min(5).max(2000),
  template_ids: MAX_BATCH ? z.array(z.string()).min(1).max(MAX_BATCH) : z.array(z.string()).min(1),
  texts: teksBody,
  teks_warna: z
    .string()
    .nullable()
    .default(null)
    .transform((v) => (v === "black" || v === "white" ? v : "")),
});
const JobBody = z.object({
  url: z.string().min(5).max(2000),
  template_id: z.string().min(1).max(80),
  texts: teksBody,
});
const PreviewBody = z.object({ url: z.string().min(5).max(2000) });
const HookBody = z.object({ naskah: z.string().min(3).max(5000) });
const BersihkanBody = z.object({ job_ids: z.array(z.string()).max(500).default([]) });

// ============================================================
//  BANTUAN
// ============================================================

function denganAset(data: Template, p: Pengguna): Record<string, unknown> {
  const folder = path.join(templatePath(String(data.id)), "assets");
  let aset: string[] = [];
  try {
    aset = urut(
      fs
        .readdirSync(folder, { withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => d.name),
    );
  } catch {
    aset = [];
  }
  return {
    ...data,
    assets: aset,
    badge_box_default: kotakKategoriBawaan(data.text_box),
    can_edit: bolehUbah(data, akunDari(p)),
  };
}

// Kapan tiap akun terakhir menjalankan deteksi: analisisnya membaca seluruh
// gambar layer, menekan tombolnya berkali-kali adalah cara termurah membuat
// server sibuk tanpa hasil.
export const deteksiTerakhir = new Map<string, number>();
export const JEDA_DETEKSI_DETIK = (() => {
  const n = Number.parseFloat(process.env.VIDEO_JEDA_DETEKSI ?? "");
  return Number.isFinite(n) ? n : 3;
})();

/** Unggahan sumber dari perangkat (dipakai /api/video/sources & /api/tvr/sumber). */
export async function unggahSumber(pm: Permintaan, p: Pengguna): Promise<Record<string, unknown>> {
  const batas = Math.trunc(MAX_SOURCE_UPLOAD_MB * 1_048_576);
  await sediakanRuangUnggah(pm, batas);
  const idUnggahan = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const folder = path.join(uploadsDir(), idUnggahan);
  let nama = "";
  let hasil: { jalur: string; ukuran: number };
  let info: Record<string, unknown>;
  try {
    hasil = await tulisUnggahan(
      pm,
      (asli) => {
        nama = aman(path.basename(asli || "video"));
        if (!JENIS_VIDEO.has(akhiran(nama))) {
          throw new GalatHttp(415, `Jenis berkas tidak didukung. Pakai: ${urut(JENIS_VIDEO).join(", ")}`);
        }
        fs.mkdirSync(folder, { recursive: true });
        return path.join(folder, `source${akhiran(nama)}`);
      },
      batas,
      `Video sumber melebihi ${f0(MAX_SOURCE_UPLOAD_MB)} MB.`,
    );
    try {
      info = await probe(hasil.jalur);
    } catch (e) {
      if (e instanceof GalatVideo) throw new GalatHttp(415, `Berkas bukan video yang bisa dibaca: ${e.message}`);
      throw e;
    }
  } catch (e) {
    fs.rmSync(folder, { recursive: true, force: true });
    throw e;
  }
  const durasi = Number(info.duration ?? 0) || 0;
  if (durasi > MAX_SOURCE_SECONDS + 1) {
    // Ditolak di sini juga: percuma menyimpan berkas yang pasti tidak diproses.
    fs.rmSync(folder, { recursive: true, force: true });
    throw new GalatHttp(
      413,
      `Videonya ${f0(durasi / 60)} menit, lebih panjang dari batas ${f0(MAX_SOURCE_SECONDS / 60)} menit.`,
    );
  }
  fs.writeFileSync(path.join(folder, ".pemilik"), akunDari(p), "utf8");
  return {
    url: `${AWALAN_UNGGAHAN}${idUnggahan}`,
    name: nama,
    size: hasil.ukuran,
    duration: info.duration ?? null,
    width: info.width ?? null,
    height: info.height ?? null,
  };
}

// ============================================================
//  RUTE
// ============================================================

export function pasangRuteVideo(r: Router): void {
  const A = "/api/video";

  r.get(`${A}/info`, async (pm) => {
    // Angkanya dari server supaya berkas tidak ditolak SESUDAH terunggah penuh.
    const p = penggunaWajib(pm);
    const pemilik = akunDari(p);
    const dipakai = await pemakaianByte(pemilik);
    const batas = batasByte(pemilik);
    return {
      worker_aktif: await workerHidup(),
      maks_aset_mb: MAX_ASSET_MB,
      maks_sumber_mb: MAX_SOURCE_UPLOAD_MB,
      jenis_aset: urut(JENIS_ASET),
      jenis_sumber: urut(JENIS_VIDEO),
      kuota: {
        dipakai_mb: Math.round((dipakai / 1_048_576) * 10) / 10,
        batas_mb: Math.round(batas / 1_048_576),
        persen: batas ? Math.min(100, Math.round((dipakai * 100) / batas)) : 0,
        tamu: false,
      },
    };
  });

  r.post(`${A}/preview`, async (pm) => {
    penggunaWajib(pm);
    const body = await bacaJson(pm, PreviewBody);
    try {
      return await previewSource(body.url);
    } catch (e) {
      return tangani(e);
    }
  });

  r.post(`${A}/hook`, async (pm) => {
    penggunaWajib(pm);
    const body = await bacaJson(pm, HookBody);
    const hasil = await buatHook(body.naskah);
    if (!hasil.hook) throw new GalatHttp(400, "Naskah terlalu pendek untuk dijadikan hook.");
    return hasil;
  });

  r.get(`${A}/templates`, async (pm) => {
    const p = penggunaWajib(pm);
    return { templates: listTemplates(akunDari(p)) };
  });

  r.post(`${A}/templates`, async (pm) => {
    const p = penggunaWajib(pm);
    const templateId = pm.query.get("template_id") || null;
    const body = await bacaJson(pm, TemplateBody);
    if (templateId && fs.existsSync(path.join(templatePath(templateId), "template.json"))) templateMilik(templateId, p);
    let hasil: Template;
    try {
      hasil = saveTemplate(body as unknown as Record<string, unknown>, templateId, akunDari(p));
    } catch (e) {
      return tangani(e);
    }
    // Berkas layer yang tidak dirujuk lagi tetap memakan jatah penyimpanan.
    try {
      buangAsetTakTerpakai(String(hasil.id ?? templateId), hasil);
      lupakan(akunDari(p));
    } catch (e) {
      console.error(`Pembersihan aset ${templateId} gagal`, e);
    }
    return hasil;
  });

  r.get(`${A}/templates/{template_id}`, async (pm) => {
    const p = penggunaWajib(pm);
    return denganAset(templateTerlihat(pm.params.template_id, p), p);
  });

  r.get(`${A}/templates/{template_id}/preview.png`, async (pm) => {
    const p = penggunaWajib(pm);
    const teks = intQuery(pm, "teks", 0);
    const contohHook = pm.query.get("contoh_hook") ?? "";
    const template = templateTerlihat(pm.params.template_id, p);
    const contoh = teks
      ? {
          hook: Array.from(contohHook || "VIRAL! CONTOH TULISAN BERITA UNTUK MELIHAT LETAK DAN UKURANNYA").slice(0, 180).join(""),
          sumber: "SUMBER: CONTOH",
        }
      : null;
    try {
      return kirimGambar(pm, await pngRgb(await kompositStatis(template, contoh)));
    } catch (e) {
      return tangani(e);
    }
  });

  r.post(`${A}/templates/{template_id}/detect-box`, async (pm) => {
    const p = penggunaWajib(pm);
    const pemilik = akunDari(p);
    const kini = Date.now() / 1000;
    if (kini - (deteksiTerakhir.get(pemilik) ?? 0) < JEDA_DETEKSI_DETIK) {
      throw new GalatHttp(429, `Tunggu ${f0(JEDA_DETEKSI_DETIK)} detik sebelum mendeteksi lagi.`);
    }
    deteksiTerakhir.set(pemilik, kini);
    const template = templateTerlihat(pm.params.template_id, p);
    let kotak;
    try {
      kotak = await deteksiKotakTeks(await kompositStatis(template, null));
    } catch (e) {
      return tangani(e);
    }
    if (!kotak) throw new GalatHttp(404, "Tidak menemukan bidang polos yang cukup luas untuk kotak teks.");
    return { text_box: kotak };
  });

  r.post(`${A}/templates/{template_id}/duplicate`, async (pm) => {
    const p = penggunaWajib(pm);
    const body = await bacaJson(pm, DuplikatBody);
    templateTerlihat(pm.params.template_id, p);
    let hasil: Template;
    try {
      hasil = duplicateTemplate(pm.params.template_id, body.name, null, akunDari(p));
    } catch (e) {
      return tangani(e);
    }
    return denganAset(hasil, p);
  });

  r.delete(`${A}/templates/{template_id}`, async (pm) => {
    const p = penggunaWajib(pm);
    const tid = pm.params.template_id;
    templateMilik(tid, p);
    // Job terlantar ditandai gagal dulu supaya tidak menyandera templatenya.
    await tandaiTerlantar();
    const berjalan = (await daftarJob(200, akunDari(p))).filter(
      (j) => j.template_id === tid && STATUS_AKTIF_JOB.includes(j.status),
    );
    if (berjalan.length) {
      throw new GalatHttp(
        409,
        `Template ini sedang dipakai ${berjalan.length} video yang belum selesai. Tunggu sampai selesai atau hentikan dulu.`,
      );
    }
    deleteTemplate(tid);
    lupakan(akunDari(p));
    return { ok: true };
  });

  r.post(`${A}/templates/{template_id}/assets`, async (pm) => {
    const p = penggunaWajib(pm);
    const tid = pm.params.template_id;
    templateMilik(tid, p);
    await pastikanKuota(p);
    const batas = Math.trunc(MAX_ASSET_MB * 1_048_576);
    await sediakanRuangUnggah(pm, batas);
    const folder = path.join(templatePath(tid), "assets");
    let nama = "";
    let hasil: { jalur: string; ukuran: number };
    try {
      hasil = await tulisUnggahan(
        pm,
        (asli) => {
          nama = aman(path.basename(asli || "aset"));
          if (!JENIS_ASET.has(akhiran(nama))) {
            throw new GalatHttp(415, `Jenis berkas tidak didukung. Pakai: ${urut(JENIS_ASET).join(", ")}`);
          }
          fs.mkdirSync(folder, { recursive: true });
          return path.join(folder, nama);
        },
        batas,
        `Berkas melebihi ${f0(MAX_ASSET_MB)} MB`,
      );
    } finally {
      lupakan(akunDari(p));
    }
    try {
      await pastikanIsiMedia(hasil.jalur);
    } catch (e) {
      fs.rmSync(hasil.jalur, { force: true });
      throw e;
    }
    const ukuran = (await rapikanGambar(hasil.jalur)) ?? (await rapikanVideo(hasil.jalur)) ?? hasil.ukuran;
    return { file: `assets/${nama}`, size: ukuran };
  });

  r.delete(`${A}/templates/{template_id}/assets/{nama}`, async (pm) => {
    const p = penggunaWajib(pm);
    templateMilik(pm.params.template_id, p);
    fs.rmSync(path.join(templatePath(pm.params.template_id), "assets", aman(pm.params.nama)), { force: true });
    lupakan(akunDari(p));
    return { ok: true };
  });

  r.post(`${A}/sources`, async (pm) => unggahSumber(pm, penggunaWajib(pm)));

  r.post(`${A}/jobs`, async (pm) => {
    const p = penggunaWajib(pm);
    const body = await bacaJson(pm, JobBody);
    templateTerlihat(body.template_id, p);
    pastikanHook(body.texts);
    const url = await sumberSah(body.url, p);
    await pastikanKuota(p);
    await pastikanAntreanMuat(1, p);
    return { job_id: await kirimJob(url, body.template_id, body.texts, p), status: "queued" };
  });

  r.post(`${A}/jobs/batch`, async (pm) => {
    // Satu job per set layer untuk link yang sama; sumbernya diunduh sekali
    // lalu dipakai ulang dari cache.
    const p = penggunaWajib(pm);
    const body = await bacaJson(pm, BatchBody);
    const ids: string[] = [];
    for (const mentah of body.template_ids) {
      const tid = mentah.trim();
      if (tid && !ids.includes(tid)) ids.push(tid);
    }
    if (!ids.length) throw new GalatHttp(400, "Pilih minimal satu set layer.");
    for (const tid of ids) templateTerlihat(tid, p);
    pastikanHook(body.texts);
    const url = await sumberSah(body.url, p);
    await pastikanKuota(p);
    await pastikanAntreanMuat(ids.length, p);
    const jobs: { job_id: string; template_id: string; status: string }[] = [];
    for (const tid of ids) {
      jobs.push({ job_id: await kirimJob(url, tid, body.texts, p, body.teks_warna), template_id: tid, status: "queued" });
    }
    return { jobs };
  });

  r.get(`${A}/jobs`, async (pm) => {
    const p = penggunaWajib(pm);
    const limit = intQuery(pm, "limit", 20);
    // Job yang ditinggal worker mati ditandai gagal dulu, supaya daftar yang
    // tampil keadaan sebenarnya - bukan "menyusun 2%" yang beku.
    await tandaiTerlantar();
    return { jobs: await daftarJob(Math.max(1, Math.min(100, limit)), akunDari(p)) };
  });

  r.post(`${A}/jobs/stop`, async (pm) => {
    const p = penggunaWajib(pm);
    const belum = (await daftarJob(500, akunDari(p))).filter((j) => STATUS_AKTIF_JOB.includes(j.status));
    for (const j of belum) await cabutTugas(j);
    return { dihentikan: belum.length };
  });

  r.post(`${A}/jobs/cleanup`, async (pm) => {
    const p = penggunaWajib(pm);
    const body = await bacaJson(pm, BersihkanBody);
    let dihapus = 0;
    for (const mentah of body.job_ids.slice(0, 500)) {
      const jobId = String(mentah).trim();
      if (!jobId) continue;
      try {
        await jobTerjangkau(jobId, p);
      } catch (e) {
        if (e instanceof GalatHttp) continue; // bukan miliknya, atau sudah tidak ada
        throw e;
      }
      await buangJob(jobId);
      dihapus += 1;
    }
    return { dihapus };
  });

  r.get(`${A}/jobs/{job_id}`, async (pm) => {
    // Dipoll halaman: job aktif yang lama membisu ditandai gagal di sini.
    const p = penggunaWajib(pm);
    return segarkanKalauTerlantar(await jobTerjangkau(pm.params.job_id, p));
  });

  r.get(`${A}/jobs/{job_id}/file`, async (pm) => {
    const p = penggunaWajib(pm);
    const status = await jobTerjangkau(pm.params.job_id, p);
    if (!status.output) throw new GalatHttp(409, "Video belum selesai disusun");
    const berkas = path.join(jobPath(pm.params.job_id), aman(String(status.output)));
    if (!fs.existsSync(berkas) || !fs.statSync(berkas).isFile()) throw new GalatHttp(404, "Berkas hasil sudah tidak ada");
    // Nama unduh dari id yang SUDAH disanitasi (amanId), bukan segmen URL
    // mentah yang bisa menyelipkan CR/LF ke header content-disposition.
    return kirimBerkas(pm, berkas, "video/mp4", `${amanId(pm.params.job_id)}.mp4`);
  });

  r.delete(`${A}/jobs/{job_id}`, async (pm) => {
    const p = penggunaWajib(pm);
    await jobTerjangkau(pm.params.job_id, p);
    await buangJob(pm.params.job_id);
    return { ok: true };
  });

  r.post(`${A}/jobs/{job_id}/stop`, async (pm) => {
    const p = penggunaWajib(pm);
    const status = await jobTerjangkau(pm.params.job_id, p);
    if (!STATUS_AKTIF_JOB.includes(status.status)) throw new GalatHttp(409, "Video ini sudah tidak berjalan.");
    await cabutTugas(status);
    return { ok: true, job_id: pm.params.job_id };
  });

  r.post(`${A}/jobs/{job_id}/ulangi`, async (pm) => {
    const p = penggunaWajib(pm);
    const status = await jobTerjangkau(pm.params.job_id, p);
    let sumber = String(status.sumber_url ?? "");
    const templateId = String(status.template_id ?? "");
    if (!sumber || !templateId) throw new GalatHttp(409, "Bahan job ini sudah tidak lengkap; buat ulang dari awal.");
    templateTerlihat(templateId, p);
    sumber = await sumberSah(sumber, p);
    await pastikanKuota(p);
    await pastikanAntreanMuat(1, p);
    const texts = (status.texts as Record<string, string> | undefined) ?? {};
    return { job_id: await kirimJob(sumber, templateId, texts, p), template_id: templateId, status: "queued" };
  });
}

/** Dipakai tvr.ts: berkas aset yang dirujuk template masih ada? */
export function asetAda(template: Template, file: string): boolean {
  try {
    return asetTemplate(template, file) !== null;
  } catch (e) {
    if (e instanceof GalatVideo) return false;
    throw e;
  }
}
