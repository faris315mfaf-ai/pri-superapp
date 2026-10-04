// Rute /api/tvr/* (cermin tvr_api.py): Edit Otomatis TVR Saya — satu
// template per akun, satu video per akun.
//
// 1. TEMPLATE. Bahan diunggah ke DRAF dulu; "Simpan & Tetapkan" memindahkan
//    draf ke tempatnya, MENGGANTIKAN berkas lama, bukan menumpuk.
// 2. EDIT. Video sumber + tulisan -> satu job di antrean server bersama.
// 3. HASIL disimpan sementara (umur job) sampai anggota memilih.
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { z } from "zod";
import { deteksiKotakTeks } from "../deteksi";
import { rapikanGambar } from "../gambar";
import { buatHook } from "../hook";
import { GalatVideo, type Job, type Template } from "../jenis";
import { aman, folderUnggahan, pemilikUnggahan, templatePath } from "../jalur";
import { FFMPEG_BIN, FFPROBE_BIN, MAX_SOURCE_UPLOAD_MB } from "../konfig";
import { kompositStatis, pngRgb } from "../komposit";
import { lupakan } from "../kuota";
import { denganKunci } from "../kunci";
import { pastikanIsiMedia, probe, punyaAlpha, rapikanVideo } from "../media";
import {
  bacaStatus,
  buangJob,
  buatJob,
  JOB_RETENTION_HOURS,
  jobPath,
  mintaBatal,
  posisiAntrean,
  redis,
  segarkanKalauTerlantar,
  STATUS_AKTIF_JOB,
  STATUS_BERJALAN_JOB,
  tulisStatus,
} from "../job";
import { kirimRender } from "../antrean";
import { buangAsetTakTerpakai, loadTemplate, namaSetUnik, saveTemplate } from "../template";
import { kotakKategoriBawaan } from "../teks";
import {
  akhiran,
  f0,
  cabutTugas,
  JENIS_VIDEO as JENIS_VIDEO_API,
  MAX_ASSET_MB,
  pastikanAntreanMuat,
  pastikanKuota,
  sediakanRuangUnggah,
  sumberSah,
  tangani,
  tulisUnggahan,
  urut,
  type Pengguna,
} from "./bantu";
import { bacaJson, GalatHttp, identitas, kirimBerkas, kirimGambar, type Permintaan, type Router } from "./dasar";
import { asetAda, deteksiTerakhir, JEDA_DETEKSI_DETIK, unggahSumber } from "./video";

const jalankan = promisify(execFile);
const angkaEnv = (nama: string, bawaan: number) => {
  const n = Number.parseFloat(process.env[nama] ?? "");
  return Number.isFinite(n) ? n : bawaan;
};

const LEBAR = 720;
const TINGGI = 1280;
const FPS = 30;
const SLOT = ["kotak", "boom", "bingkai", "penutup"] as const;
type Slot = (typeof SLOT)[number];
const NAMA_SLOT: Record<Slot, string> = {
  kotak: "Kotak monas",
  boom: "Boom like share",
  bingkai: "Bingkai teratas",
  penutup: "Video penutup",
};
const JENIS_VIDEO = new Set([".mp4", ".mov", ".webm", ".m4v"]);
// Kotak monas & bingkai teratas WAJIB PNG: keduanya butuh bagian tembus
// pandang, dan hanya PNG yang pasti menyimpannya.
const JENIS_SLOT: Record<Slot, Set<string>> = {
  kotak: new Set([".png"]),
  boom: new Set([".png", ".gif", ...JENIS_VIDEO]),
  bingkai: new Set([".png"]),
  penutup: new Set(JENIS_VIDEO),
};
const SLOT_WAJIB: Slot[] = ["kotak", "bingkai"];
const MAKS_GIF_MB = angkaEnv("TVR_MAKS_GIF_MB", 20);
// Bisa diubah uji (pengganti monkeypatch di uji Python).
export const batasTvr = { maksAnimasiDetik: angkaEnv("TVR_MAKS_ANIMASI_DETIK", 60) };
const MAKS_HOOK = 180;
// Video sumber lebih panjang dari ini dipotong (bukan ditolak).
const MAKS_DURASI_DETIK = angkaEnv("TVR_MAKS_DURASI_DETIK", 180);
const MAKS_SUMBER = 60;
// Penunjuk akun -> job hidup sedikit lebih lama dari job-nya sendiri.
const UMUR_PENUNJUK = Math.trunc(JOB_RETENTION_HOURS * 3600) + 3600;
const KUNCI_JOB_AKUN = "tvrjob:";
const KUNCI_UNGGAHAN = "tvrunggah:";

// Susunan tulisan PERSIS template GODAM (kanvas 720x1280).
const TEKS_HOOK = {
  name: "hook", style: "berita", align: "justify", size: 38, min_size: 22,
  max_lines: 4, x: 38, y: 783, width: 660, line_height: 1.15,
  color: "black", kicker_color: "#d32d27", start: 0, end: 3,
};
const TEKS_KATEGORI = { name: "kategori", style: "kategori", source: "kategori", color: "white", start: 0, end: 3 };
const PILIHAN_RATA = ["justify", "left", "center", "right"];
const MAKS_KATEGORI = 30;
const TEKS_SUMBER = {
  name: "sumber", size: 10, x: null, y: 1253, align: "right",
  color: "white", stroke: 1, stroke_color: "black",
};

type Kotak = { x: number; y: number; w: number; h: number };

const akun = (p: Pengguna) => String(p.username);
const idTemplate = (p: Pengguna) => `tvr-${p.user_id}`;
const folderAset = (p: Pengguna) => path.join(templatePath(idTemplate(p)), "assets");
const folderDraf = (p: Pengguna) => path.join(folderAset(p), ".draf");

/** Identitas TVR: sama dengan penggunaWajib tanpa membuatkan template awal. */
const penggunaTvr = (pm: Permintaan): Pengguna => identitas(pm);

function berkasDi(folder: string, awalan: string): string[] {
  try {
    return fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.startsWith(awalan))
      .map((d) => path.join(folder, d.name));
  } catch {
    return [];
  }
}

/** Berkas milik satu slot di folder ini ("kotak.png", "boom.mov", ...), terbaru dulu. */
function berkasSlot(folder: string, slot: string): string | null {
  const calon = berkasDi(folder, `${slot}.`).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return calon[0] ?? null;
}

function bacaTemplate(p: Pengguna): Template | null {
  try {
    return loadTemplate(idTemplate(p));
  } catch (e) {
    if (e instanceof GalatVideo) return null;
    throw e;
  }
}

function jenis(berkas: string | null): string {
  if (berkas === null) return "";
  const a = akhiran(berkas);
  if (a === ".gif") return "gif";
  return JENIS_VIDEO.has(a) ? "video" : "gambar";
}

async function infoSlot(p: Pengguna, template: Template | null): Promise<Record<string, Record<string, unknown>>> {
  const hasil: Record<string, Record<string, unknown>> = {};
  for (const slot of SLOT) {
    const hidup = berkasSlot(folderAset(p), slot);
    const draf = berkasSlot(folderDraf(p), slot);
    const dipakai = draf ?? hidup;
    const info: Record<string, unknown> = { ada: hidup !== null, draf: draf !== null, jenis: jenis(dipakai) };
    if (slot === "boom" && dipakai !== null && jenis(dipakai) === "video") info.alpha = await punyaAlpha(dipakai);
    hasil[slot] = info;
  }
  if (template) hasil.boom.kunci_hijau = Boolean(template.kunci_hijau);
  return hasil;
}

/** Perataan tulisan berita: disimpan di layer "berita", seperti GODAM. */
function rata(template: Template | null): string {
  for (const layer of (template?.texts as Record<string, unknown>[] | undefined) ?? []) {
    if (layer.style === "berita" && PILIHAN_RATA.includes(String(layer.align))) return String(layer.align);
  }
  return "justify";
}

async function keadaan(p: Pengguna): Promise<Record<string, unknown>> {
  const template = bacaTemplate(p);
  const isi = (template ?? {}) as Template;
  return {
    ada: template !== null,
    siap: Boolean(template && template.siap),
    slot: await infoSlot(p, template),
    text_box: isi.text_box ?? null,
    badge_box: isi.badge_box ?? null,
    badge_box_default: kotakKategoriBawaan(isi.text_box),
    kategori: String(isi.kategori || ""),
    rata: rata(template),
    teks_warna: isi.teks_warna || "white",
    diperbarui: isi.diperbarui ?? null,
  };
}

const rujukanRelatif = (p: Pengguna, berkas: string) =>
  path.relative(templatePath(idTemplate(p)), berkas).split(path.sep).join("/");

/** Tiga layer tetap, urut dari bawah ke atas. */
function susunan(p: Pengguna, berkas: Partial<Record<Slot, string | null>>, kunciHijau: boolean): Record<string, unknown>[] {
  const rujukan = (slot: Slot) => (berkas[slot] ? rujukanRelatif(p, berkas[slot] as string) : "");
  const boom = berkas.boom ?? null;
  const boomBergerak = ["video", "gif"].includes(jenis(boom));
  return [
    // Selebar layar, menempel ke dasar; tingginya mengikuti rasio berkas.
    { label: "kotak monas", file: rujukan("kotak"), x: 0, y: "main_h-h", w: LEBAR, h: null, start: 0, end: 3 },
    // Ukuran & letak persis GODAM (280x158 di 45,55).
    {
      label: "boom like share", file: rujukan("boom"), x: 45, y: 55, w: 280, h: 158, loop: boomBergerak,
      kunci_hijau: Boolean(kunciHijau && jenis(boom) === "video"),
    },
    { label: "bingkai teratas", file: rujukan("bingkai"), x: 0, y: "main_h-h", w: LEBAR, h: null },
  ];
}

function templateDari(
  p: Pengguna,
  berkas: Partial<Record<Slot, string | null>>,
  textBox: Kotak | null,
  teksWarna: string,
  kunciHijau: boolean,
  badgeBox: Kotak | null = null,
  kategori = "",
  perataan = "justify",
): Record<string, unknown> {
  const penutup = berkas.penutup ?? null;
  return {
    name: "TVR Saya",
    width: LEBAR,
    height: TINGGI,
    fps: FPS,
    intro: null,
    outro: penutup ? rujukanRelatif(p, penutup) : null,
    max_duration: MAKS_DURASI_DETIK,
    overlays: susunan(p, berkas, kunciHijau),
    texts: [{ ...TEKS_HOOK, align: PILIHAN_RATA.includes(perataan) ? perataan : "justify" }, TEKS_KATEGORI, TEKS_SUMBER],
    text_box: textBox,
    badge_box: badgeBox,
    kategori,
    teks_warna: teksWarna === "white" || teksWarna === "black" ? teksWarna : "white",
    kunci_hijau: Boolean(kunciHijau),
  };
}

/** Template akun ini; dibuat kosong (belum ditetapkan) bila belum ada. */
function pastikanTemplate(p: Pengguna): Template {
  const ada = bacaTemplate(p);
  if (ada !== null) return ada;
  const tid = idTemplate(p);
  const isi = templateDari(p, {}, null, "white", false);
  isi.siap = false;
  isi.name = namaSetUnik("TVR Saya", tid, akun(p));
  return saveTemplate(isi, tid, akun(p));
}

/** Template seperti yang AKAN tersimpan: draf menimpa berkas, pilihan pratinjau menimpa yang tersimpan. */
function templateGabungan(
  p: Pengguna,
  textBox: Kotak | null,
  teksWarna: string | null,
  badgeBox: Kotak | null = null,
  kategori: string | null = null,
  perataan: string | null = null,
): Template {
  const template = (bacaTemplate(p) ?? {}) as Template;
  const berkas: Partial<Record<Slot, string | null>> = {};
  for (const slot of SLOT) berkas[slot] = berkasSlot(folderDraf(p), slot) ?? berkasSlot(folderAset(p), slot);
  const isi = templateDari(
    p,
    berkas,
    textBox ?? ((template.text_box as Kotak | undefined) ?? null),
    teksWarna || String(template.teks_warna || "white"),
    Boolean(template.kunci_hijau),
    badgeBox ?? ((template.badge_box as Kotak | undefined) ?? null),
    kategori ?? String(template.kategori || ""),
    perataan || rata(bacaTemplate(p)),
  );
  isi.id = idTemplate(p);
  return isi as Template;
}

// ============================================================
//  VALIDASI BERKAS
// ============================================================

function awalBerkas(jalur: string, n: number): Buffer {
  const fd = fs.openSync(jalur, "r");
  try {
    const buf = Buffer.alloc(n);
    const dibaca = fs.readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, dibaca);
  } finally {
    fs.closeSync(fd);
  }
}

/** WEBM VP8/VP9 menyimpan transparansinya sebagai tag, bukan pix_fmt. */
async function alphaWebm(jalur: string): Promise<boolean> {
  try {
    const { stdout } = await jalankan(
      FFPROBE_BIN,
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream_tags=alpha_mode", "-of", "default=nw=1:nk=1", jalur],
      { timeout: 60_000 },
    );
    return stdout.trim() === "1";
  } catch (e) {
    const out = (e as { stdout?: string }).stdout;
    return String(out ?? "").trim() === "1";
  }
}

/**
 * WEBM transparan -> MOV qtrle beralpha. Dekoder VP9 bawaan ffmpeg MEMBUANG
 * transparansi WEBM; hanya libvpx yang membacanya. Diubah sekali saat
 * diunggah supaya setiap render memakai berkas yang pasti terbaca beralpha.
 */
async function webmKeMov(jalur: string): Promise<string> {
  let kodek = "";
  try {
    kodek = (
      await jalankan(FFPROBE_BIN, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=nw=1:nk=1", jalur], {
        timeout: 60_000,
      })
    ).stdout.trim();
  } catch (e) {
    kodek = String((e as { stdout?: string }).stdout ?? "").trim();
  }
  const dekoder = kodek === "vp8" ? "libvpx" : "libvpx-vp9";
  const tujuan = jalur.slice(0, -path.extname(jalur).length) + ".mov";
  const perintah = [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-c:v", dekoder, "-i", jalur,
    "-vf", "scale='min(560,iw)':-2", "-c:v", "qtrle", "-pix_fmt", "argb", "-an", tujuan,
  ];
  let ok = true;
  try {
    await jalankan(FFMPEG_BIN, perintah, { timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  } catch {
    ok = false;
  }
  if (!ok || !fs.existsSync(tujuan)) {
    fs.rmSync(tujuan, { force: true });
    throw new GalatHttp(415, "WEBM transparan ini tidak bisa dibaca. Coba format MOV atau GIF.");
  }
  fs.rmSync(jalur, { force: true });
  return tujuan;
}

/** Tolak berkas yang bukan jenis aslinya, lalu rapikan. Mengembalikan path akhir. */
async function periksaDanRapikan(slot: Slot, jalur: string): Promise<string> {
  const a = akhiran(jalur);
  const nama = NAMA_SLOT[slot];
  if (a === ".png") {
    if (!awalBerkas(jalur, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      throw new GalatHttp(415, `${nama}: berkas ini bukan PNG asli (hanya berganti nama).`);
    }
    await pastikanIsiMedia(jalur);
    await rapikanGambar(jalur);
    return jalur;
  }
  if (a === ".gif") {
    const kepala = awalBerkas(jalur, 6).toString("latin1");
    if (kepala !== "GIF87a" && kepala !== "GIF89a") throw new GalatHttp(415, `${nama}: berkas ini bukan GIF asli.`);
    try {
      // Setara im.verify(): seluruh bingkai harus terbaca.
      await sharp(jalur, { animated: true }).raw().toBuffer();
    } catch {
      throw new GalatHttp(415, `${nama}: GIF ini rusak.`);
    }
    return jalur;
  }
  // Video.
  await pastikanIsiMedia(jalur);
  const durasi = Number((await probe(jalur)).duration ?? 0) || 0;
  if (durasi < 0.2) throw new GalatHttp(415, `${nama}: videonya terlalu pendek atau kosong.`);
  if (durasi > batasTvr.maksAnimasiDetik) {
    throw new GalatHttp(413, `${nama}: videonya ${f0(durasi)} detik, maksimal ${f0(batasTvr.maksAnimasiDetik)} detik.`);
  }
  if (a === ".webm" && slot === "boom" && (await alphaWebm(jalur))) return webmKeMov(jalur);
  await rapikanVideo(jalur);
  return jalur;
}

// ============================================================
//  SKEMA
// ============================================================

const KotakTeks = z.object({
  x: z.number().int().min(0).max(LEBAR),
  y: z.number().int().min(0).max(TINGGI),
  w: z.number().int().min(20).max(LEBAR),
  h: z.number().int().min(20).max(TINGGI),
});

/** Kategori ditulis kapital, spasi dirapikan (sama dengan GODAM). */
const bersihKategori = (nilai: string) =>
  Array.from(String(nilai || "").split(/\s+/).filter(Boolean).join(" ").toUpperCase()).slice(0, MAKS_KATEGORI).join("");

const SimpanBody = z.object({
  text_box: KotakTeks.nullable().default(null),
  // Kosong = tebakan otomatis di atas kotak tulisan.
  badge_box: KotakTeks.nullable().default(null),
  kategori: z.string().max(MAKS_KATEGORI).default(""),
  rata: z.enum(["justify", "left", "center", "right"]).default("justify"),
  teks_warna: z.enum(["white", "black"]).default("white"),
  kunci_hijau: z.boolean().default(false),
  kosongkan: z.array(z.enum(["boom", "penutup"])).max(2).default([]),
});

function kotakSah(kotak: Kotak | null): Kotak | null {
  if (kotak === null) return null;
  if (kotak.x + kotak.w > LEBAR || kotak.y + kotak.h > TINGGI) throw new GalatHttp(422, "Kotak tulisan keluar dari layar.");
  return { x: kotak.x, y: kotak.y, w: kotak.w, h: kotak.h };
}

/** "x,y,w,h" dari alamat pratinjau; null bila kosong/tidak sah. */
function kotakDariTeks(nilai: string): Kotak | null {
  try {
    const bagian = nilai.split(",");
    if (bagian.length !== 4) return null;
    const [x, y, w, h] = bagian.map((b) => {
      const n = Number(b.trim());
      if (b.trim() === "" || !Number.isFinite(n)) throw new Error("bukan angka");
      return Math.trunc(n);
    });
    const hasil = KotakTeks.safeParse({ x, y, w, h });
    return hasil.success ? kotakSah(hasil.data) : null;
  } catch {
    return null;
  }
}

const HookBody = z.object({ naskah: z.string().min(1).max(5000) });

const JobBody = z.object({
  url: z.string().min(1).max(2000),
  hook: z
    .string()
    .max(MAKS_HOOK)
    .transform((v, ctx) => {
      const n = v.split(/\s+/).filter(Boolean).join(" ");
      if (!n) ctx.addIssue({ code: "custom", message: "Value error, Tulisan beritanya kosong." });
      return n;
    }),
  sumber: z.string().max(MAKS_SUMBER).default(""),
  // Kategori (badge NEWS/HIBURAN) kini DITENTUKAN PER VIDEO di langkah Buat
  // Video, bukan lagi disimpan di template. Engine memakai texts["kategori"]
  // lebih dulu, baru template.kategori; jadi nilai ini yang tampil.
  kategori: z.string().max(MAKS_KATEGORI).default(""),
});

// ============================================================
//  JOB: SATU PER AKUN
// ============================================================

/** Job yang sedang dipegang akun ini, atau null (penunjuk basi dibuang). */
async function jobDipegang(a: string): Promise<Job | null> {
  const r = redis();
  const jobId = await r.get(KUNCI_JOB_AKUN + a);
  if (!jobId) return null;
  let status: Job;
  try {
    status = await bacaStatus(jobId);
  } catch (e) {
    if (!(e instanceof GalatVideo)) throw e;
    await r.del(KUNCI_JOB_AKUN + a);
    return null;
  }
  if (String(status.owner ?? "") !== a) {
    await r.del(KUNCI_JOB_AKUN + a);
    return null;
  }
  return segarkanKalauTerlantar(status);
}

async function dipakaiJobAktif(a: string, url: string): Promise<boolean> {
  const job = await jobDipegang(a);
  return Boolean(job && STATUS_AKTIF_JOB.includes(job.status) && job.sumber_url === url);
}

function ringkasJob(status: Job): Record<string, unknown> {
  const kunci = ["job_id", "status", "progress", "message", "error", "durasi", "size", "created", "sumber_url", "texts"];
  return Object.fromEntries(kunci.map((k) => [k, (status as Record<string, unknown>)[k] ?? null]));
}

async function jobDanAntrean(p: Pengguna): Promise<Record<string, unknown>> {
  const job = await jobDipegang(akun(p));
  if (job === null) return { job: null, antrean: null };
  const antrean = STATUS_AKTIF_JOB.includes(job.status) ? await posisiAntrean(job.job_id) : null;
  return { job: ringkasJob(job), antrean };
}

// ============================================================
//  RUTE
// ============================================================

export function pasangRuteTvr(r: Router): void {
  const A = "/api/tvr";

  r.get(`${A}/ringkas`, async (pm) => {
    // Semua yang dibutuhkan halaman saat dibuka, dalam satu panggilan.
    const p = penggunaTvr(pm);
    return {
      template: await keadaan(p),
      ...(await jobDanAntrean(p)),
      batas: {
        maks_aset_mb: MAX_ASSET_MB,
        maks_gif_mb: MAKS_GIF_MB,
        maks_sumber_mb: MAX_SOURCE_UPLOAD_MB,
        maks_animasi_detik: batasTvr.maksAnimasiDetik,
        maks_durasi_detik: MAKS_DURASI_DETIK,
        maks_hook: MAKS_HOOK,
        maks_sumber_teks: MAKS_SUMBER,
        maks_kategori: MAKS_KATEGORI,
        jenis_slot: Object.fromEntries(SLOT.map((s) => [s, urut(JENIS_SLOT[s])])),
        jenis_sumber: urut(JENIS_VIDEO_API),
        umur_simpan_jam: JOB_RETENTION_HOURS,
      },
    };
  });

  r.post(`${A}/template/draf/{slot}`, async (pm) => {
    // Terima satu bahan ke DRAF. Template yang berlaku belum berubah.
    const p = penggunaTvr(pm);
    const slot = pm.params.slot as Slot;
    if (!(SLOT as readonly string[]).includes(slot)) throw new GalatHttp(404, "Bahan tidak dikenal.");
    // Nama berkas baru diketahui di tengah aliran multipart; akhirannya
    // diperiksa begitu terbaca, sebelum satu bita pun ditulis (lihat
    // tulisUnggahanSlot).
    await pastikanKuota(p);
    const batasMaks = Math.trunc(Math.max(MAKS_GIF_MB, MAX_ASSET_MB) * 1_048_576);
    await sediakanRuangUnggah(pm, batasMaks);
    const draf = folderDraf(p);
    let sementara = "";
    let akhir: string;
    try {
      const diterima = await tulisUnggahanSlot(pm, p, slot, draf, (j) => (sementara = j));
      akhir = await periksaDanRapikan(slot, diterima);
    } catch (e) {
      if (sementara) {
        fs.rmSync(sementara, { force: true });
        fs.rmSync(sementara.slice(0, -path.extname(sementara).length) + ".mov", { force: true });
      }
      throw e;
    } finally {
      lupakan(akun(p));
    }
    await denganKunci(akun(p), () => {
      if (!fs.existsSync(akhir)) {
        // Template disimpan (draf dibereskan) selagi berkas ini diunggah.
        throw new GalatHttp(409, "Template baru saja disimpan. Unggah bahan ini sekali lagi.");
      }
      for (const lama of berkasDi(draf, `${slot}.`)) fs.rmSync(lama, { force: true });
      fs.renameSync(akhir, path.join(draf, `${slot}${akhiran(akhir)}`));
    });
    return { template: await keadaan(p) };
  });

  r.delete(`${A}/template/draf`, async (pm) => {
    // Batal: semua draf dibuang, template yang berlaku tetap.
    const p = penggunaTvr(pm);
    await denganKunci(akun(p), () => fs.rmSync(folderDraf(p), { recursive: true, force: true }));
    lupakan(akun(p));
    return { template: await keadaan(p) };
  });

  r.get(`${A}/template/pratinjau.png`, async (pm) => {
    // Gambar template (draf + yang berlaku) beserta contoh tulisannya.
    const p = penggunaTvr(pm);
    const q = pm.query;
    const kotak = q.get("kotak") ?? "";
    const badge = q.get("badge") ?? "";
    const kategori = q.get("kategori");
    const perataan = q.get("rata") ?? "";
    const warna = q.get("warna") ?? "";
    const teks = q.get("teks") ?? "";
    const template = templateGabungan(
      p,
      kotak ? kotakDariTeks(kotak) : null,
      warna === "white" || warna === "black" ? warna : null,
      badge ? kotakDariTeks(badge) : null,
      kategori !== null ? bersihKategori(kategori) : null,
      PILIHAN_RATA.includes(perataan) ? perataan : null,
    );
    const contoh = {
      hook: Array.from(teks.trim() || "VIRAL! CONTOH TULISAN BERITA UNTUK MELIHAT LETAK DAN UKURANNYA")
        .slice(0, MAKS_HOOK)
        .join(""),
      sumber: "SUMBER: CONTOH",
    };
    try {
      return kirimGambar(pm, await pngRgb(await kompositStatis(template, contoh)));
    } catch (e) {
      return tangani(e);
    }
  });

  r.post(`${A}/template/deteksi`, async (pm) => {
    // Tebak letak kotak tulisan dari gambar kotak monas & bingkai.
    const p = penggunaTvr(pm);
    const a = akun(p);
    const kini = Date.now() / 1000;
    if (kini - (deteksiTerakhir.get(a) ?? 0) < JEDA_DETEKSI_DETIK) {
      throw new GalatHttp(429, `Tunggu ${f0(JEDA_DETEKSI_DETIK)} detik sebelum mendeteksi lagi.`);
    }
    deteksiTerakhir.set(a, kini);
    const template = templateGabungan(p, null, null);
    let kotak;
    try {
      kotak = await deteksiKotakTeks(await kompositStatis(template, null));
    } catch (e) {
      return tangani(e);
    }
    if (!kotak) {
      throw new GalatHttp(404, "Tidak menemukan bidang polos untuk tulisan. Tentukan sendiri dengan menyeret di gambar.");
    }
    return { text_box: kotak };
  });

  r.put(`${A}/template`, async (pm) => {
    // Simpan & Tetapkan: draf menggantikan berkas lama, template siap dipakai.
    const p = penggunaTvr(pm);
    const body = await bacaJson(pm, SimpanBody);
    const a = akun(p);
    const tid = idTemplate(p);
    const kotak = kotakSah(body.text_box);
    await denganKunci(a, () => {
      if (bacaTemplate(p) === null) throw new GalatHttp(404, "Unggah bahan template dulu.");
      const aset = folderAset(p);
      const draf = folderDraf(p);
      // Periksa kelengkapan SEBELUM memindahkan apa pun: gagal di sini tidak
      // boleh meninggalkan template setengah berganti.
      const akan: Partial<Record<Slot, string | null>> = {};
      for (const slot of SLOT) {
        akan[slot] = (body.kosongkan as string[]).includes(slot) ? null : berkasSlot(draf, slot) ?? berkasSlot(aset, slot);
      }
      const kurang = SLOT_WAJIB.filter((s) => akan[s] === null).map((s) => NAMA_SLOT[s]);
      if (kurang.length) throw new GalatHttp(400, `${kurang.join(" dan ")} wajib diunggah.`);
      if (kotak === null) throw new GalatHttp(400, "Tentukan posisi tulisan dulu.");

      const final: Partial<Record<Slot, string | null>> = {};
      for (const slot of SLOT) {
        const baru = berkasSlot(draf, slot);
        const dikosongkan = (body.kosongkan as string[]).includes(slot);
        if (dikosongkan || baru !== null) {
          // Berkas lama slot ini beserta salinan ringannya dibuang: template
          // yang diedit MENGGANTIKAN, tidak menumpuk.
          for (const lama of berkasDi(aset, `${slot}.`)) fs.rmSync(lama, { force: true });
          for (const lama of berkasDi(path.join(aset, ".ringan"), `${slot}-`)) fs.rmSync(lama, { force: true });
        }
        if (dikosongkan) {
          if (baru !== null) fs.rmSync(baru, { force: true });
          final[slot] = null;
        } else if (baru !== null) {
          const tujuan = path.join(aset, `${slot}${akhiran(baru)}`);
          fs.renameSync(baru, tujuan);
          final[slot] = tujuan;
        } else {
          final[slot] = berkasSlot(aset, slot);
        }
      }
      fs.rmSync(draf, { recursive: true, force: true });

      const isi = templateDari(
        p, final, kotak, body.teks_warna, body.kunci_hijau,
        kotakSah(body.badge_box), bersihKategori(body.kategori), body.rata,
      );
      isi.siap = true;
      isi.diperbarui = Date.now() / 1000;
      isi.name = bacaTemplate(p)?.name || "TVR Saya";
      try {
        const hasil = saveTemplate(isi, tid, a);
        buangAsetTakTerpakai(tid, hasil);
      } catch (e) {
        tangani(e);
      }
    });
    lupakan(a);
    return { template: await keadaan(p) };
  });

  r.post(`${A}/sumber`, async (pm) => {
    // Unggahan sebelumnya dibuang bila tidak sedang dipakai job.
    const p = penggunaTvr(pm);
    const hasil = await unggahSumber(pm, p);
    const a = akun(p);
    const rd = redis();
    const lama = await rd.get(KUNCI_UNGGAHAN + a);
    if (lama && lama !== hasil.url && !(await dipakaiJobAktif(a, lama))) {
      const folder = folderUnggahan(lama);
      if (folder !== null && pemilikUnggahan(lama) === a) fs.rmSync(folder, { recursive: true, force: true });
    }
    await rd.set(KUNCI_UNGGAHAN + a, String(hasil.url), "EX", UMUR_PENUNJUK);
    return hasil;
  });

  r.post(`${A}/hook`, async (pm) => {
    penggunaTvr(pm);
    const body = await bacaJson(pm, HookBody);
    const hasil = await buatHook(body.naskah);
    if (!hasil.hook) throw new GalatHttp(400, "Naskahnya terlalu pendek untuk dijadikan tulisan.");
    return hasil;
  });

  r.post(`${A}/jobs`, async (pm) => {
    const p = penggunaTvr(pm);
    const body = await bacaJson(pm, JobBody);
    const a = akun(p);
    const tid = idTemplate(p);
    await denganKunci(a, async () => {
      const template = bacaTemplate(p);
      if (!template || !template.siap) throw new GalatHttp(409, "Buat dan tetapkan template dulu.");
      for (const layer of (template.overlays as Record<string, unknown>[] | undefined) ?? []) {
        if (layer.file && !asetAda(template, String(layer.file))) {
          throw new GalatHttp(409, "Bahan template ada yang hilang. Unggah ulang lewat Edit Template.");
        }
      }
      const lama = await jobDipegang(a);
      if (lama !== null) {
        if (STATUS_AKTIF_JOB.includes(lama.status)) {
          throw new GalatHttp(409, "Videomu sebelumnya masih diproses. Tunggu sampai selesai.");
        }
        if (lama.status === "done") {
          throw new GalatHttp(409, "Videomu sebelumnya sudah jadi. Unggah ke sosmed atau edit ulang dulu.");
        }
        // Gagal/dibatalkan: dibuang, diganti yang baru.
        await buangJob(lama.job_id);
      }
      const url = await sumberSah(body.url, p);
      await pastikanKuota(p);
      await pastikanAntreanMuat(1, p);
      const texts = {
        hook: body.hook,
        sumber: body.sumber.split(/\s+/).filter(Boolean).join(" "),
        kategori: bersihKategori(body.kategori),
      };
      const jobId = await buatJob(url, tid, texts, a);
      await redis().set(KUNCI_JOB_AKUN + a, jobId, "EX", UMUR_PENUNJUK);
      await kirimRender({ job_id: jobId, url, template_id: tid, texts });
    });
    return jobDanAntrean(p);
  });

  r.get(`${A}/jobs/saya`, async (pm) => jobDanAntrean(penggunaTvr(pm)));

  r.get(`${A}/jobs/saya/berkas`, async (pm) => {
    const p = penggunaTvr(pm);
    const job = await jobDipegang(akun(p));
    if (job === null || job.status !== "done" || !job.output) throw new GalatHttp(409, "Videonya belum jadi.");
    const berkas = path.join(jobPath(job.job_id), aman(String(job.output)));
    if (!fs.existsSync(berkas) || !fs.statSync(berkas).isFile()) {
      throw new GalatHttp(404, "Berkas hasil sudah tidak ada (lewat masa simpan). Edit ulang.");
    }
    return kirimBerkas(pm, berkas, "video/mp4", `tvr-edit-${job.job_id}.mp4`);
  });

  r.delete(`${A}/jobs/saya`, async (pm) => {
    // Edit ulang / batal / sesudah diunggah: hasil dihapus, antrean kosong.
    // hapus_sumber ikut membuang video unggahan sumbernya.
    const p = penggunaTvr(pm);
    const hapusSumber = boolQuery(pm, "hapus_sumber");
    const a = akun(p);
    const rd = redis();
    await denganKunci(a, async () => {
      const job = await jobDipegang(a);
      await rd.del(KUNCI_JOB_AKUN + a);
      let sumber = String(job?.sumber_url ?? "");
      if (job !== null) {
        if (STATUS_BERJALAN_JOB.includes(job.status)) {
          // Sedang dikerjakan worker: diminta berhenti; berkasnya dibersihkan
          // worker/penyapu.
          await mintaBatal(job.job_id);
          await tulisStatus(job.job_id, { log: "Dibatalkan pemiliknya." });
        } else {
          if (job.status === "queued") await cabutTugas(job);
          await buangJob(job.job_id);
        }
      }
      if (hapusSumber) {
        if (!sumber) sumber = String((await rd.get(KUNCI_UNGGAHAN + a)) ?? "");
        const folder = folderUnggahan(sumber);
        if (folder !== null && pemilikUnggahan(sumber) === a) fs.rmSync(folder, { recursive: true, force: true });
        if ((await rd.get(KUNCI_UNGGAHAN + a)) === sumber) await rd.del(KUNCI_UNGGAHAN + a);
      }
    });
    lupakan(a);
    return { ok: true };
  });
}

/** bool pydantic dari query: true/false/1/0/yes/no/on/off; selain itu 422. */
function boolQuery(pm: Permintaan, nama: string): boolean {
  const v = pm.query.get(nama);
  if (v === null) return false;
  const t = v.trim().toLowerCase();
  if (["1", "true", "t", "yes", "y", "on"].includes(t)) return true;
  if (["0", "false", "f", "no", "n", "off"].includes(t)) return false;
  throw new GalatHttp(422, [{ type: "bool_parsing", loc: ["query", nama], msg: "Input should be a valid boolean, unable to interpret input" }]);
}

/** Unggahan satu slot ke nama sementara di folder draf, dengan batas sesuai jenis. */
async function tulisUnggahanSlot(
  pm: Permintaan,
  p: Pengguna,
  slot: Slot,
  draf: string,
  catat: (jalur: string) => void,
): Promise<string> {
  const batasMaks = Math.trunc(Math.max(MAKS_GIF_MB, MAX_ASSET_MB) * 1_048_576);
  const h = await tulisUnggahan(
    pm,
    (asli) => {
      const a = akhiran(asli || "");
      if (!JENIS_SLOT[slot].has(a)) {
        const daftar = urut(JENIS_SLOT[slot]).map((s) => s.replace(/^\./, "").toUpperCase()).join(", ");
        const wajib = JENIS_SLOT[slot].size === 1 ? " wajib" : " harus";
        throw new GalatHttp(415, `${NAMA_SLOT[slot]}${wajib} ${daftar}.`);
      }
      // Sepenuhnya sinkron, jadi tidak bisa disela permintaan lain (pengganti
      // kunci akun di Python).
      pastikanTemplate(p);
      fs.mkdirSync(draf, { recursive: true });
      // Draf lama slot ini tetap utuh sampai berkas baru lolos pemeriksaan.
      const batas = Math.trunc((a === ".gif" ? MAKS_GIF_MB : MAX_ASSET_MB) * 1_048_576);
      const jalur = path.join(draf, `_${slot}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}${a}`);
      catat(jalur);
      return { jalur, batas, pesan: `${NAMA_SLOT[slot]} melebihi ${f0(batas / 1_048_576)} MB.` };
    },
    batasMaks,
    `${NAMA_SLOT[slot]} melebihi ${f0(batasMaks / 1_048_576)} MB.`,
  );
  return h.jalur;
}
