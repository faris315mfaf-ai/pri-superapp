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
import { batasByte, lupakan, pemakaianByte, petaKhusus } from "../kuota";
import { mutuSah, TARGET_VMAF } from "../kompres";
import { buatPratinjau, EFEK_BLUR, MAKS_KOTAK, ukuranTampil } from "../blur-watermark";
import { denganKunci } from "../kunci";
import { pastikanIsiMedia, probe, punyaAlpha, rapikanVideo } from "../media";
import {
  bacaStatus,
  buangJob,
  buatJob,
  daftarJob,
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
//  ANTREAN (1 render/akun) + STOK VIDEO (hasil render + unggahan manual)
// ============================================================
//
// Model baru (4 Okt 2026): video jadi TIDAK lagi menempel di satu slot.
// Begitu selesai, ia masuk STOK (daftar video jadi milik akun, disimpan 2
// hari = JOB_RETENTION_HOURS lalu tersapu otomatis), dan antrean langsung
// bebas untuk video berikutnya. Stok juga bisa diisi UNGGAHAN MANUAL (video
// jadi dari perangkat, tanpa diedit). Di langkah Unggah ke Sosmed, pengguna
// memilih dari stok ini.

const MAKS_STOK = Math.max(1, Math.trunc(angkaEnv("TVR_MAKS_STOK", 50)));
// Batas stok khusus per pemilik, mis. akun tim TV Rakyat Official (5 Okt 2026).
const MAKS_STOK_KHUSUS = petaKhusus("TVR_MAKS_STOK_KHUSUS");
const maksStok = (a: string) => MAKS_STOK_KHUSUS.get(a.trim().toLowerCase()) ?? MAKS_STOK;
// Render aktif per pemilik: akun pribadi 1; akun TIM boleh banyak sekaligus
// (antrean bersama, kecepatannya tetap diatur slot serentak global).
const MAKS_JOB_AKTIF_KHUSUS = petaKhusus("TVR_JOB_AKTIF_KHUSUS");
const maksJobAktif = (a: string) => MAKS_JOB_AKTIF_KHUSUS.get(a.trim().toLowerCase()) ?? 1;
/** Penunjuk unggahan sumber: per akun, dan per anggota untuk akun tim. */
const kunciUnggahan = (p: Pengguna) => KUNCI_UNGGAHAN + akun(p) + (p.anggota ? `:${p.anggota}` : "");

/** Judul otomatis item stok dari tulisan berita (hook). */
function judulDariHook(hook: string): string {
  const t = String(hook || "").replace(/\s+/g, " ").trim();
  if (!t) return "Video";
  const potong = ((t.split(/[.!?\n]/)[0] || t).trim() || t);
  const huruf = Array.from(potong);
  return huruf.length > 48 ? huruf.slice(0, 48).join("").trimEnd() + "…" : potong;
}

/** Judul item unggahan manual dari nama berkasnya (tanpa ekstensi). */
function judulDariBerkas(nama: string): string {
  const dasar = String(nama || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const huruf = Array.from(dasar);
  return huruf.length > 48 ? huruf.slice(0, 48).join("").trimEnd() + "…" : dasar || "Video";
}

/** Job yang masih diproses (queued/downloading/rendering) milik akun, atau null. */
/** Job Kompres Video berjalan di jalurnya sendiri — tidak memblokir Edit Otomatis. */
const jobKompres = (j: Job) => (j as Record<string, unknown>).jenis === "kompres";
/** Job Hapus Latar Boom: menulis ke draf template, bukan ke stok. */
const jobHapusLatar = (j: Job) => (j as Record<string, unknown>).jenis === "hapuslatar";
/** Job Blur Watermark: hasilnya masuk Stok seperti Kompres. */
const jobBlur = (j: Job) => (j as Record<string, unknown>).jenis === "blur";
/** Job "sampingan" tidak memblokir antrean Edit Otomatis akun. */
const jobSampingan = (j: Job) => jobKompres(j) || jobHapusLatar(j) || jobBlur(j);

async function jobAktif(a: string): Promise<Job | null> {
  for (const j of await daftarJob(50, a)) {
    if (STATUS_AKTIF_JOB.includes(j.status) && !jobSampingan(j)) return segarkanKalauTerlantar(j);
  }
  return null;
}

/** Semua job aktif pemilik (akun tim bisa banyak), terbaru dulu. */
async function semuaJobAktif(a: string): Promise<Job[]> {
  const hasil: Job[] = [];
  for (const j of await daftarJob(Math.max(50, maksJobAktif(a) * 3), a)) {
    if (!STATUS_AKTIF_JOB.includes(j.status) || jobSampingan(j)) continue;
    const segar = await segarkanKalauTerlantar(j);
    if (STATUS_AKTIF_JOB.includes(segar.status)) hasil.push(segar);
  }
  return hasil;
}

async function dipakaiJobAktif(a: string, url: string): Promise<boolean> {
  return (await semuaJobAktif(a)).some((j) => j.sumber_url === url);
}

function ringkasJob(status: Job): Record<string, unknown> {
  const kunci = ["job_id", "status", "progress", "message", "error", "durasi", "size", "created", "sumber_url", "texts", "anggota"];
  return Object.fromEntries(kunci.map((k) => [k, (status as Record<string, unknown>)[k] ?? null]));
}

/** Satu item Stok untuk halaman: judul, tanggal upload, durasi, ukuran. */
function ringkasStok(job: Job): Record<string, unknown> {
  const texts = (job.texts as Record<string, string> | undefined) ?? {};
  const judul = String(job.judul ?? "").trim() || judulDariHook(texts.hook ?? "");
  return {
    id: job.job_id,
    judul,
    tanggal: job.created ?? null,
    durasi: job.durasi ?? null,
    size: job.size ?? null,
    sumber: String(job.sumber_stok ?? "render"),
    // Waktu (detik) video ini terkirim ke sosmed; null = belum. Video yang
    // sudah terunggah TIDAK dihapus — tetap di stok sampai masa simpannya habis.
    terunggah: typeof job.terunggah === "number" ? job.terunggah : null,
    // Hasil Kompres Video (dan render yang dikompres otomatis): ukuran asli,
    // penghematan, dan skor kualitas.
    ...(job.sumber_stok === "kompres" || (job as Record<string, unknown>).hemat_persen !== undefined
      ? {
          size_awal: (job as Record<string, unknown>).size_awal ?? null,
          hemat_persen: (job as Record<string, unknown>).hemat_persen ?? null,
          vmaf: (job as Record<string, unknown>).vmaf ?? null,
        }
      : {}),
  };
}

/** Stok = video jadi milik akun (hasil render + unggahan manual), terbaru dulu. */
async function daftarStok(a: string): Promise<Job[]> {
  return (await daftarJob(maksStok(a) * 2, a)).filter((j) => j.status === "done" && Boolean(j.output));
}

/** Keadaan yang dipantau halaman: job aktif (bila ada) + antrean + stok. */
async function stokDanAntrean(p: Pengguna): Promise<Record<string, unknown>> {
  const a = akun(p);
  const aktif = await jobAktif(a);
  const antrean = aktif ? await posisiAntrean(aktif.job_id) : null;
  const stok = (await daftarStok(a)).map(ringkasStok);
  // Akun tim: seluruh antrean tim (siapa membuat apa, nomor antreannya).
  const jobs =
    maksJobAktif(a) > 1
      ? await Promise.all(
          (await semuaJobAktif(a)).map(async (j) => ({ ...ringkasJob(j), antrean: await posisiAntrean(j.job_id) })),
        )
      : undefined;
  // Pemakaian penyimpanan akun (template + stok + render) untuk ditampilkan
  // di Stok Video (5 Okt 2026). Gagal dibaca tidak menggagalkan halaman.
  const dipakai = await pemakaianByte(a).catch(() => null);
  return {
    job: aktif ? ringkasJob(aktif) : null,
    antrean,
    ...(jobs ? { jobs, maks_job_aktif: maksJobAktif(a) } : {}),
    stok,
    maks_stok: maksStok(a),
    kuota: {
      dipakai_mb: dipakai === null ? null : Math.round(dipakai / 1_048_576),
      batas_mb: Math.round(batasByte(a) / 1_048_576),
    },
  };
}

// ============================================================
//  HAPUS LATAR BOOM (uji coba, 5 Okt 2026) — lihat ../hapus-latar.ts
// ============================================================

/** Job hapus latar terbaru milik akun, atau null. */
async function hapusLatarTerakhir(a: string): Promise<Job | null> {
  for (const j of await daftarJob(30, a)) if (jobHapusLatar(j)) return j;
  return null;
}

/** Ringkasan untuk editor: yang masih jalan, atau yang selesai < 30 menit lalu. */
async function ringkasHapusLatar(a: string): Promise<Record<string, unknown> | null> {
  const j = await hapusLatarTerakhir(a);
  if (!j) return null;
  const aktif = STATUS_AKTIF_JOB.includes(j.status);
  if (!aktif && Date.now() / 1000 - Number(j.created ?? 0) > 30 * 60) return null;
  const r = j as Record<string, unknown>;
  return {
    id: j.job_id,
    status: j.status,
    progress: j.progress ?? 0,
    mode: r.mode ?? null,
    warna: r.warna ?? null,
    log: j.message ?? null,
    error: j.error ?? null,
    antrean: aktif && j.status === "queued" ? await posisiAntrean(j.job_id) : null,
  };
}

/** Hentikan hapus latar yang masih jalan (Boom diganti / editor ditutup). */
async function batalkanHapusLatar(a: string): Promise<void> {
  const j = await hapusLatarTerakhir(a);
  if (!j || !STATUS_AKTIF_JOB.includes(j.status)) return;
  if (STATUS_BERJALAN_JOB.includes(j.status)) {
    await mintaBatal(j.job_id);
  } else {
    await cabutTugas(j);
    await buangJob(j.job_id);
  }
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
      ...(await stokDanAntrean(p)),
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
    if (slot === "boom") await batalkanHapusLatar(akun(p));
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
    await batalkanHapusLatar(akun(p));
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
    const lama = await rd.get(kunciUnggahan(p));
    if (lama && lama !== hasil.url && !(await dipakaiJobAktif(a, lama))) {
      const folder = folderUnggahan(lama);
      if (folder !== null && pemilikUnggahan(lama) === a) fs.rmSync(folder, { recursive: true, force: true });
    }
    await rd.set(kunciUnggahan(p), String(hasil.url), "EX", UMUR_PENUNJUK);
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
      // Hanya SATU render berjalan per akun; video jadi masuk Stok (tak
      // memblok). Job gagal/dibatalkan tidak menghalangi — biarkan tersapu.
      const batasAktif = maksJobAktif(a);
      if (batasAktif <= 1) {
        if (await jobAktif(a)) throw new GalatHttp(409, "Masih ada video yang sedang diproses. Tunggu sampai selesai.");
      } else if ((await semuaJobAktif(a)).length >= batasAktif) {
        throw new GalatHttp(409, `Antrean tim penuh (${batasAktif} video). Tunggu sebagian selesai dulu.`);
      }
      if ((await daftarStok(a)).length >= maksStok(a)) {
        throw new GalatHttp(409, `Stok video penuh (maksimal ${maksStok(a)}). Hapus beberapa dulu.`);
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
      // Akun tim: catat anggota pembuatnya (antrean tim & hak membatalkan).
      if (p.anggota) await tulisStatus(jobId, { anggota: p.anggota });
      await kirimRender({ job_id: jobId, url, template_id: tid, texts });
    });
    return stokDanAntrean(p);
  });

  r.get(`${A}/jobs/saya`, async (pm) => stokDanAntrean(penggunaTvr(pm)));

  r.delete(`${A}/jobs/saya`, async (pm) => {
    // Batalkan video yang sedang diproses (atau bersihkan job gagal) dan,
    // bila diminta, buang video unggahan sumbernya.
    const p = penggunaTvr(pm);
    const hapusSumber = boolQuery(pm, "hapus_sumber");
    const a = akun(p);
    const rd = redis();
    await denganKunci(a, async () => {
      const job = await jobAktif(a);
      let sumber = String(job?.sumber_url ?? "");
      if (job !== null) {
        if (STATUS_BERJALAN_JOB.includes(job.status)) {
          await mintaBatal(job.job_id);
          await tulisStatus(job.job_id, { log: "Dibatalkan pemiliknya." });
        } else {
          if (job.status === "queued") await cabutTugas(job);
          await buangJob(job.job_id);
        }
      }
      if (hapusSumber) {
        if (!sumber) sumber = String((await rd.get(kunciUnggahan(p))) ?? "");
        const folder = folderUnggahan(sumber);
        if (folder !== null && pemilikUnggahan(sumber) === a) fs.rmSync(folder, { recursive: true, force: true });
        if ((await rd.get(kunciUnggahan(p))) === sumber) await rd.del(kunciUnggahan(p));
      }
    });
    lupakan(a);
    return { ok: true };
  });

  r.delete(`${A}/jobs/{id}`, async (pm) => {
    // Batalkan SATU job tertentu (akun tim: hanya milik anggota pembuatnya).
    const p = penggunaTvr(pm);
    const a = akun(p);
    let job: Job;
    try {
      job = await bacaStatus(pm.params.id);
    } catch (e) {
      if (e instanceof GalatVideo) throw new GalatHttp(404, "Video tidak ditemukan.");
      throw e;
    }
    const pembuat = String((job as Record<string, unknown>).anggota ?? "");
    if (String(job.owner ?? "") !== a || (p.anggota && pembuat && pembuat !== p.anggota)) {
      throw new GalatHttp(404, "Video tidak ditemukan.");
    }
    if (STATUS_BERJALAN_JOB.includes(job.status)) {
      await mintaBatal(job.job_id);
      await tulisStatus(job.job_id, { log: "Dibatalkan pembuatnya." });
    } else if (job.status === "queued" || job.status === "error" || job.status === "dibatalkan") {
      if (job.status === "queued") await cabutTugas(job);
      await buangJob(job.job_id);
    } else {
      throw new GalatHttp(409, "Video ini sudah jadi — hapus dari Stok bila tidak dipakai.");
    }
    lupakan(a);
    return stokDanAntrean(p);
  });

  // ---- KOMPRES VIDEO (uji coba, 5 Okt 2026) -----------------------
  // Gerbang SuperApp membatasi jalur ini ke akun yang modul "kompres"-nya
  // dibuka master. Hasilnya masuk Stok Video pemiliknya.
  async function daftarKompres(a: string): Promise<Record<string, unknown>[]> {
    const hasil: Record<string, unknown>[] = [];
    for (const j of await daftarJob(30, a)) {
      if (!jobKompres(j)) continue;
      const aktif = STATUS_AKTIF_JOB.includes(j.status);
      // Yang aktif, plus yang gagal/dibatalkan dalam 6 jam terakhir.
      if (!aktif && !(j.status === "error" || j.status === "dibatalkan")) continue;
      if (!aktif && Date.now() / 1000 - Number(j.created ?? 0) > 6 * 3600) continue;
      const r = j as Record<string, unknown>;
      hasil.push({
        id: j.job_id,
        status: j.status,
        progress: j.progress ?? 0,
        judul: r.judul ?? "Video",
        mutu: r.mutu ?? "seimbang",
        size_awal: r.size_awal ?? null,
        log: j.message ?? null,
        error: j.error ?? null,
        antrean: aktif && j.status === "queued" ? await posisiAntrean(j.job_id) : null,
      });
    }
    return hasil;
  }

  r.get(`${A}/kompres`, async (pm) => {
    const p = penggunaTvr(pm);
    return { kompres: await daftarKompres(akun(p)), target_vmaf: TARGET_VMAF, maks_mb: MAX_SOURCE_UPLOAD_MB };
  });

  r.post(`${A}/kompres`, async (pm) => {
    const p = penggunaTvr(pm);
    const a = akun(p);
    const mutu = mutuSah(pm.query.get("mutu"));
    if ((await daftarKompres(a)).some((k) => STATUS_AKTIF_JOB.includes(k.status as Job["status"]))) {
      throw new GalatHttp(409, "Masih ada video yang sedang dikompres. Tunggu sampai selesai.");
    }
    await pastikanKuota(p);
    if ((await daftarStok(a)).length >= maksStok(a)) {
      throw new GalatHttp(409, `Stok video penuh (maksimal ${maksStok(a)}). Hapus beberapa dulu.`);
    }
    const batas = Math.trunc(MAX_SOURCE_UPLOAD_MB * 1_048_576);
    await sediakanRuangUnggah(pm, batas);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const folder = jobPath(id);
    let namaAsli = "";
    let hasil: { jalur: string; ukuran: number };
    try {
      hasil = await tulisUnggahan(
        pm,
        (asli) => {
          namaAsli = aman(path.basename(asli || "video"));
          if (!JENIS_VIDEO.has(akhiran(namaAsli))) {
            throw new GalatHttp(415, `Jenis berkas tidak didukung. Pakai: ${urut(JENIS_VIDEO).join(", ")}`);
          }
          fs.mkdirSync(folder, { recursive: true });
          return path.join(folder, `masukan${akhiran(namaAsli)}`);
        },
        batas,
        `Video melebihi ${f0(MAX_SOURCE_UPLOAD_MB)} MB.`,
      );
      await pastikanIsiMedia(hasil.jalur);
      await probe(hasil.jalur);
    } catch (e) {
      fs.rmSync(folder, { recursive: true, force: true });
      throw e;
    }
    await tulisStatus(id, {
      status: "queued",
      progress: 0,
      owner: a,
      jenis: "kompres",
      mutu,
      masukan: path.basename(hasil.jalur),
      judul: judulDariBerkas(namaAsli),
      sumber_stok: "kompres",
      size_awal: hasil.ukuran,
      log: "Masuk antrean kompres.",
    });
    await kirimRender({ job_id: id, url: "", template_id: "", texts: {}, jenis: "kompres", mutu });
    lupakan(a);
    return { kompres: await daftarKompres(a) };
  });

  r.delete(`${A}/kompres/{id}`, async (pm) => {
    const p = penggunaTvr(pm);
    const a = akun(p);
    let job: Job;
    try {
      job = await bacaStatus(pm.params.id);
    } catch (e) {
      if (e instanceof GalatVideo) throw new GalatHttp(404, "Video tidak ditemukan.");
      throw e;
    }
    if (String(job.owner ?? "") !== a || !jobKompres(job)) throw new GalatHttp(404, "Video tidak ditemukan.");
    if (STATUS_BERJALAN_JOB.includes(job.status)) {
      await mintaBatal(job.job_id);
    } else {
      if (job.status === "queued") await cabutTugas(job);
      await buangJob(job.job_id);
    }
    lupakan(a);
    return { kompres: await daftarKompres(a) };
  });

  // ---- HAPUS LATAR BOOM (uji coba) ---------------------------------
  // Gerbang SuperApp membatasi jalur ini ke akun yang modul "hapuslatar"-nya
  // dibuka master. Hasilnya menjadi DRAF Boom di editor template.
  r.get(`${A}/template/hapus-latar`, async (pm) => {
    const p = penggunaTvr(pm);
    return { hapus_latar: await ringkasHapusLatar(akun(p)), template: await keadaan(p) };
  });

  r.post(`${A}/template/hapus-latar`, async (pm) => {
    const p = penggunaTvr(pm);
    const a = akun(p);
    const lama = await hapusLatarTerakhir(a);
    if (lama && STATUS_AKTIF_JOB.includes(lama.status)) {
      throw new GalatHttp(409, "Latar Boom masih diproses. Tunggu sampai selesai.");
    }
    await pastikanKuota(p);
    const sumberDraf = berkasSlot(folderDraf(p), "boom");
    const sumber = sumberDraf ?? berkasSlot(folderAset(p), "boom");
    if (!sumber || jenis(sumber) !== "video") throw new GalatHttp(400, "Unggah video Boom like share dulu.");
    if (await punyaAlpha(sumber)) throw new GalatHttp(400, "Video Boom ini sudah transparan — tidak ada latar yang perlu dibuang.");
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const folder = jobPath(id);
    fs.mkdirSync(folder, { recursive: true });
    const masukan = `masukan${akhiran(sumber)}`;
    fs.copyFileSync(sumber, path.join(folder, masukan));
    await tulisStatus(id, {
      status: "queued",
      progress: 0,
      owner: a,
      jenis: "hapuslatar",
      masukan,
      tid: idTemplate(p),
      // Penanda Boom saat dimulai: hasil hanya dipasang bila belum berubah.
      draf_sumber: sumberDraf ? { nama: path.basename(sumberDraf), mtime: fs.statSync(sumberDraf).mtimeMs } : null,
      judul: "Hapus latar Boom",
      log: "Masuk antrean hapus latar.",
    });
    await kirimRender({ job_id: id, url: "", template_id: idTemplate(p), texts: {}, jenis: "hapuslatar" });
    lupakan(a);
    return { hapus_latar: await ringkasHapusLatar(a), template: await keadaan(p) };
  });

  r.delete(`${A}/template/hapus-latar`, async (pm) => {
    const p = penggunaTvr(pm);
    await batalkanHapusLatar(akun(p));
    return { hapus_latar: await ringkasHapusLatar(akun(p)), template: await keadaan(p) };
  });

  // ---- BLUR WATERMARK (uji coba) ----------------------------------
  // Gerbang SuperApp membatasi jalur ini ke akun yang modul "blurwm"-nya
  // dibuka master. Alur: video (unggahan / dari Stok) → DRAF + gambar
  // pratinjau → pengguna menandai ≤3 kotak & memilih efek → antrean →
  // hasilnya masuk Stok Video. Lihat ../blur-watermark.ts.
  const KotakBlur = z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.01).max(1),
    h: z.number().min(0.01).max(1),
  });
  const ProsesBlurBody = z.object({
    efek: z.enum(EFEK_BLUR),
    kotak: z.array(KotakBlur).min(1).max(MAKS_KOTAK),
  });

  function ringkasBlur(j: Job, antrean: unknown = null): Record<string, unknown> {
    const r = j as Record<string, unknown>;
    return {
      id: j.job_id,
      status: j.status,
      progress: j.progress ?? 0,
      judul: r.judul ?? "Video",
      efek: r.efek ?? null,
      kotak: r.kotak ?? [],
      lebar: r.lebar ?? null,
      tinggi: r.tinggi ?? null,
      durasi: r.durasi ?? null,
      size_awal: r.size_awal ?? null,
      log: j.message ?? null,
      error: j.error ?? null,
      antrean,
    };
  }

  /** Draf, yang sedang diproses, dan yang gagal/dibatalkan < 6 jam (bisa diulang). */
  async function daftarBlur(a: string): Promise<Record<string, unknown>[]> {
    const hasil: Record<string, unknown>[] = [];
    for (const j of await daftarJob(30, a)) {
      if (!jobBlur(j) || j.status === "done") continue;
      const aktif = STATUS_AKTIF_JOB.includes(j.status);
      if (!aktif && Date.now() / 1000 - Number(j.created ?? 0) > 6 * 3600) continue;
      hasil.push(ringkasBlur(j, aktif && j.status === "queued" ? await posisiAntrean(j.job_id) : null));
    }
    return hasil;
  }

  async function blurMilik(a: string, id: string): Promise<Job> {
    let j: Job;
    try {
      j = await bacaStatus(id);
    } catch (e) {
      if (e instanceof GalatVideo) throw new GalatHttp(404, "Video tidak ditemukan.");
      throw e;
    }
    if (String(j.owner ?? "") !== a || !jobBlur(j)) throw new GalatHttp(404, "Video tidak ditemukan.");
    return j;
  }

  /** Satu draf per akun: draf/gagal lama dibuang; tolak bila masih ada yang diproses. */
  async function siapkanDrafBaru(a: string): Promise<void> {
    for (const j of await daftarJob(30, a)) {
      if (!jobBlur(j)) continue;
      if (STATUS_AKTIF_JOB.includes(j.status)) {
        throw new GalatHttp(409, "Masih ada video yang sedang di-blur. Tunggu sampai selesai.");
      }
      if (j.status !== "done") await buangJob(j.job_id);
    }
  }

  async function catatDrafBlur(p: Pengguna, id: string, masukan: string, judul: string): Promise<Record<string, unknown>> {
    const folder = jobPath(id);
    try {
      await pastikanIsiMedia(masukan);
      const durasi = Number((await probe(masukan)).duration ?? 0) || 0;
      const { lebar, tinggi } = await ukuranTampil(masukan);
      await buatPratinjau(masukan, path.join(folder, "pratinjau.jpg"), durasi);
      const st = await tulisStatus(id, {
        status: "draf",
        progress: 0,
        owner: akun(p),
        jenis: "blur",
        masukan: path.basename(masukan),
        judul,
        sumber_stok: "blur",
        size_awal: fs.statSync(masukan).size,
        durasi: Math.round(durasi * 10) / 10,
        lebar,
        tinggi,
        log: "Tandai area watermark.",
      });
      return ringkasBlur(st);
    } catch (e) {
      fs.rmSync(folder, { recursive: true, force: true });
      if (e instanceof GalatVideo) throw new GalatHttp(415, e.message);
      throw e;
    }
  }

  r.get(`${A}/blur`, async (pm) => {
    const p = penggunaTvr(pm);
    return { blur: await daftarBlur(akun(p)), maks_mb: MAX_SOURCE_UPLOAD_MB, maks_kotak: MAKS_KOTAK, efek: EFEK_BLUR };
  });

  r.post(`${A}/blur`, async (pm) => {
    // Unggahan dari perangkat → draf.
    const p = penggunaTvr(pm);
    const a = akun(p);
    await siapkanDrafBaru(a);
    await pastikanKuota(p);
    const batas = Math.trunc(MAX_SOURCE_UPLOAD_MB * 1_048_576);
    await sediakanRuangUnggah(pm, batas);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const folder = jobPath(id);
    let namaAsli = "";
    let hasil: { jalur: string };
    try {
      hasil = await tulisUnggahan(
        pm,
        (asli) => {
          namaAsli = aman(path.basename(asli || "video"));
          if (!JENIS_VIDEO.has(akhiran(namaAsli))) {
            throw new GalatHttp(415, `Jenis berkas tidak didukung. Pakai: ${urut(JENIS_VIDEO).join(", ")}`);
          }
          fs.mkdirSync(folder, { recursive: true });
          return path.join(folder, `masukan${akhiran(namaAsli)}`);
        },
        batas,
        `Video melebihi ${f0(MAX_SOURCE_UPLOAD_MB)} MB.`,
      );
    } catch (e) {
      fs.rmSync(folder, { recursive: true, force: true });
      throw e;
    }
    const draf = await catatDrafBlur(p, id, hasil.jalur, judulDariBerkas(namaAsli));
    lupakan(a);
    return { draf, blur: await daftarBlur(a) };
  });

  r.post(`${A}/blur/dari-stok/{id}`, async (pm) => {
    // Video yang sudah ada di Stok → draf (berkas ditautkan, bukan disalin).
    const p = penggunaTvr(pm);
    const a = akun(p);
    const stok = await stokMilik(a, pm.params.id);
    const asal = path.join(jobPath(stok.job_id), aman(String(stok.output)));
    if (!fs.existsSync(asal)) throw new GalatHttp(404, "Berkas videonya sudah tidak ada (lewat masa simpan).");
    await siapkanDrafBaru(a);
    await pastikanKuota(p);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const folder = jobPath(id);
    fs.mkdirSync(folder, { recursive: true });
    const masukan = path.join(folder, `masukan${akhiran(asal) || ".mp4"}`);
    try {
      fs.linkSync(asal, masukan);
    } catch {
      fs.copyFileSync(asal, masukan);
    }
    const judulStok = String(ringkasStok(stok).judul ?? "Video");
    const draf = await catatDrafBlur(p, id, masukan, `Blur — ${judulStok}`.slice(0, 60));
    lupakan(a);
    return { draf, blur: await daftarBlur(a) };
  });

  r.get(`${A}/blur/{id}/pratinjau.jpg`, async (pm) => {
    const p = penggunaTvr(pm);
    const j = await blurMilik(akun(p), pm.params.id);
    const folder = jobPath(j.job_id);
    const gambar = path.join(folder, "pratinjau.jpg");
    if (!fs.existsSync(gambar)) {
      const masukan = path.join(folder, aman(String((j as Record<string, unknown>).masukan ?? "")));
      if (!fs.existsSync(masukan)) throw new GalatHttp(404, "Video sudah tidak ada.");
      await buatPratinjau(masukan, gambar, Number((j as Record<string, unknown>).durasi ?? 0));
    }
    return kirimGambar(pm, fs.readFileSync(gambar), "image/jpeg");
  });

  r.post(`${A}/blur/{id}/proses`, async (pm) => {
    const p = penggunaTvr(pm);
    const a = akun(p);
    const body = await bacaJson(pm, ProsesBlurBody);
    const j = await blurMilik(a, pm.params.id);
    if (!["draf", "error", "dibatalkan"].includes(j.status)) {
      throw new GalatHttp(409, "Video ini sedang diproses atau sudah selesai.");
    }
    const masukan = path.join(jobPath(j.job_id), aman(String((j as Record<string, unknown>).masukan ?? "")));
    if (!fs.existsSync(masukan)) throw new GalatHttp(410, "Video sudah tidak ada. Unggah ulang.");
    if ((await daftarStok(a)).length >= maksStok(a)) {
      throw new GalatHttp(409, `Stok video penuh (maksimal ${maksStok(a)}). Hapus beberapa dulu.`);
    }
    const kotak = body.kotak.map((k) => ({
      x: Math.min(k.x, 0.99),
      y: Math.min(k.y, 0.99),
      w: Math.min(k.w, 1 - Math.min(k.x, 0.99)),
      h: Math.min(k.h, 1 - Math.min(k.y, 0.99)),
    }));
    await tulisStatus(j.job_id, {
      status: "queued",
      progress: 0,
      error: null,
      efek: body.efek,
      kotak,
      log: "Masuk antrean blur.",
    });
    await kirimRender({ job_id: j.job_id, url: "", template_id: "", texts: {}, jenis: "blur" });
    lupakan(a);
    return { blur: await daftarBlur(a) };
  });

  r.delete(`${A}/blur/{id}`, async (pm) => {
    const p = penggunaTvr(pm);
    const a = akun(p);
    const j = await blurMilik(a, pm.params.id);
    if (STATUS_BERJALAN_JOB.includes(j.status)) {
      await mintaBatal(j.job_id);
    } else if (j.status !== "done") {
      if (j.status === "queued") await cabutTugas(j);
      await buangJob(j.job_id);
    }
    lupakan(a);
    return { blur: await daftarBlur(a) };
  });

  // ---- STOK VIDEO -------------------------------------------------
  r.get(`${A}/stok`, async (pm) => stokDanAntrean(penggunaTvr(pm)));

  /** Satu item stok milik akun ini (status done), atau galat. */
  async function stokMilik(a: string, id: string): Promise<Job> {
    let st: Job;
    try {
      st = await bacaStatus(id);
    } catch (e) {
      if (e instanceof GalatVideo) throw new GalatHttp(404, "Video stok tidak ditemukan.");
      throw e;
    }
    if (String(st.owner ?? "") !== a || st.status !== "done" || !st.output) {
      throw new GalatHttp(404, "Video stok tidak ditemukan.");
    }
    return st;
  }

  r.get(`${A}/stok/{id}/berkas`, async (pm) => {
    const p = penggunaTvr(pm);
    const st = await stokMilik(akun(p), pm.params.id);
    const berkas = path.join(jobPath(st.job_id), aman(String(st.output)));
    if (!fs.existsSync(berkas) || !fs.statSync(berkas).isFile()) {
      throw new GalatHttp(404, "Berkas videonya sudah tidak ada (lewat masa simpan).");
    }
    return kirimBerkas(pm, berkas, "video/mp4", `tvr-${st.job_id}.mp4`);
  });

  r.get(`${A}/stok/{id}/thumb`, async (pm) => {
    // Gambar sampul (1 frame) untuk ditampilkan sebelum video dimuat. Dibuat
    // sekali lalu di-cache di folder job (ikut terhapus bersama jobnya).
    const p = penggunaTvr(pm);
    const st = await stokMilik(akun(p), pm.params.id);
    const folder = jobPath(st.job_id);
    const video = path.join(folder, aman(String(st.output)));
    if (!fs.existsSync(video)) throw new GalatHttp(404, "Berkas videonya sudah tidak ada (lewat masa simpan).");
    const thumb = path.join(folder, "thumb.jpg");
    if (!fs.existsSync(thumb)) {
      const dasar = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"];
      const akhirCmd = ["-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", thumb];
      try {
        // Lewati 0,5 dtk supaya tak kena frame hitam pembuka.
        await jalankan(FFMPEG_BIN, [...dasar, "-ss", "0.5", "-i", video, ...akhirCmd], { timeout: 30_000 });
      } catch {
        // Video sangat pendek: ambil frame pertama tanpa seek.
        try {
          await jalankan(FFMPEG_BIN, [...dasar, "-i", video, ...akhirCmd], { timeout: 30_000 });
        } catch {
          // dibiarkan: dicek keberadaannya di bawah
        }
      }
    }
    if (!fs.existsSync(thumb)) throw new GalatHttp(404, "Pratinjau gagal dibuat.");
    return kirimGambar(pm, fs.readFileSync(thumb), "image/jpeg");
  });

  r.post(`${A}/stok/{id}/terunggah`, async (pm) => {
    // Tandai sudah dikirim ke sosmed (dipanggil setelah upload-post sukses).
    const p = penggunaTvr(pm);
    const st = await stokMilik(akun(p), pm.params.id);
    await tulisStatus(st.job_id, { terunggah: Date.now() / 1000, log: "Terkirim ke sosmed." });
    return stokDanAntrean(p);
  });

  r.delete(`${A}/stok/{id}`, async (pm) => {
    const p = penggunaTvr(pm);
    await stokMilik(akun(p), pm.params.id);
    await buangJob(pm.params.id);
    lupakan(akun(p));
    return { ok: true };
  });

  r.post(`${A}/stok`, async (pm) => {
    // Tambah video JADI dari perangkat langsung ke stok (tanpa diedit).
    const p = penggunaTvr(pm);
    const a = akun(p);
    await pastikanKuota(p);
    if ((await daftarStok(a)).length >= maksStok(a)) {
      throw new GalatHttp(409, `Stok video penuh (maksimal ${maksStok(a)}). Hapus beberapa dulu.`);
    }
    const batas = Math.trunc(MAX_SOURCE_UPLOAD_MB * 1_048_576);
    await sediakanRuangUnggah(pm, batas);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const folder = jobPath(id);
    let namaAsli = "";
    let hasil: { jalur: string; ukuran: number };
    let info: Record<string, unknown>;
    try {
      hasil = await tulisUnggahan(
        pm,
        (asli) => {
          namaAsli = aman(path.basename(asli || "video"));
          if (!JENIS_VIDEO.has(akhiran(namaAsli))) {
            throw new GalatHttp(415, `Jenis berkas tidak didukung. Pakai: ${urut(JENIS_VIDEO).join(", ")}`);
          }
          fs.mkdirSync(folder, { recursive: true });
          return path.join(folder, `output${akhiran(namaAsli)}`);
        },
        batas,
        `Video melebihi ${f0(MAX_SOURCE_UPLOAD_MB)} MB.`,
      );
      await pastikanIsiMedia(hasil.jalur);
      info = await probe(hasil.jalur);
    } catch (e) {
      fs.rmSync(folder, { recursive: true, force: true });
      throw e;
    }
    await tulisStatus(id, {
      status: "done",
      progress: 100,
      owner: a,
      output: path.basename(hasil.jalur),
      durasi: Math.round((Number(info.duration) || 0) * 10) / 10,
      size: hasil.ukuran,
      judul: judulDariBerkas(namaAsli),
      sumber_stok: "unggah",
      log: "Ditambahkan ke stok.",
    });
    lupakan(a);
    return stokDanAntrean(p);
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
