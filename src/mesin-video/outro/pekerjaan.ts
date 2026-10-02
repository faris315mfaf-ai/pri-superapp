// DAFTAR PEKERJAAN outro (cermin bagian "DAFTAR PEKERJAAN" + _jalankan +
// bersihkan_lama di outro.py).
//
// - Pekerjaan disimpan di memori proses; yang SELESAI dan videonya masih ada
//   ditulis ke <MEDIA_DIR>/outro/indeks.json (atomik: .json.baru lalu
//   rename) dengan bentuk JSON yang sama persis seperti versi Python, jadi
//   kedua mesin bisa membaca riwayat satu sama lain.
// - Konkurensi: Python memakai satu Lock global (_sedang_jalan) — hanya SATU
//   outro dirender pada satu waktu, sisanya menunggu giliran. Di sini sama:
//   antrean FIFO dengan batas 1.
// - Batal: tanda per job (threading.Event) yang dicek sebelum mulai, tiap
//   frame (ffmpeg dibunuh), dan sebelum menempel audio.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MEDIA_DIR } from "../konfig";
import { Dibatalkan, OutroError } from "./galat";
import { KUNCI_AKUN, pilihGaya, ringkasGaya } from "./gaya";
import { adaBerkas, pisahSpasi } from "./lukis";
import { renderDpp, renderVideo, tempelAudio, tempelAudioDpp, TandaBatal } from "./render";

export type StatusOutro = "queued" | "running" | "done" | "error" | "dibatalkan";

/** Bentuk job = dict _jobs[job_id] Python (kunci dan arti nilainya sama). */
export type JobOutro = {
  job_id: string;
  status: StatusOutro | string;
  langkah: string;
  progress: number;
  channel: string;
  akun: Record<string, string>;
  seed: number;
  mode: string;
  gaya: string;
  logo: string;
  video: string;
  message: string;
  logs: string[];
  created: number;
  updated: number;
  [lain: string]: unknown;
};

export const MODE_SAH = ["biasa", "dpp"] as const;
/** Riwayat cukup untuk satu kiriman banyak channel sekaligus. */
export const INDEKS_MAKS = 200;

/** Satu outro butuh ~2x ukuran hasilnya selama render (mentah + hasil). */
export const RUANG_OUTRO_MB = (() => {
  const v = Number.parseFloat(process.env.OUTRO_RUANG_MIN_MB ?? "");
  return Number.isFinite(v) ? v : 40;
})();

/** <MEDIA_DIR>/outro — sengaja TIDAK dibuat di sini (outro_dir() Python juga tidak). */
export function folderOutro(): string {
  return path.join(MEDIA_DIR, "outro");
}

const berkasIndeks = () => path.join(folderOutro(), "indeks.json");
const sekarang = () => Date.now() / 1000;

const jobs = new Map<string, JobOutro>();
const batal = new Map<string, TandaBatal>();
const janjiJob = new Map<string, Promise<void>>();
let indeksDimuat = false;

// Antrean render: satu per satu (threading.Lock _sedang_jalan).
let ekorAntrean: Promise<void> = Promise.resolve();
function giliran<T>(kerja: () => Promise<T>): Promise<T> {
  const hasil = ekorAntrean.then(kerja, kerja);
  ekorAntrean = hasil.then(
    () => undefined,
    () => undefined,
  );
  return hasil;
}

const log = {
  info: (pesan: string) => console.info(pesan),
  warning: (pesan: string) => console.warn(pesan),
};

/** Sekali per proses: kembalikan riwayat outro dari disk ke memori. */
function muatIndeks(): void {
  if (indeksDimuat) return;
  indeksDimuat = true;
  let mentah: string;
  try {
    mentah = fs.readFileSync(berkasIndeks(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") log.warning(`Indeks outro tidak bisa dibaca: ${e}`);
    return;
  }
  let daftar: unknown;
  try {
    daftar = JSON.parse(mentah);
  } catch (e) {
    log.warning(`Indeks outro tidak bisa dibaca: ${e}`);
    return;
  }
  for (const job of Array.isArray(daftar) ? daftar : []) {
    if (job && typeof job === "object" && !Array.isArray(job)) {
      const id = (job as JobOutro).job_id;
      if (id && !jobs.has(id)) jobs.set(id, job as JobOutro);
    }
  }
}

/**
 * json.dumps(..., ensure_ascii=False) Python: pemisah ", " dan ": ", teks
 * non-ASCII apa adanya. Supaya berkas yang ditulis kedua mesin seragam.
 */
export function jsonPython(nilai: unknown): string {
  if (nilai === null || nilai === undefined) return "null";
  if (Array.isArray(nilai)) return `[${nilai.map(jsonPython).join(", ")}]`;
  if (typeof nilai === "object") {
    return `{${Object.entries(nilai as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}: ${jsonPython(v)}`)
      .join(", ")}}`;
  }
  if (typeof nilai === "number") {
    if (Number.isNaN(nilai)) return "NaN";
    if (!Number.isFinite(nilai)) return nilai > 0 ? "Infinity" : "-Infinity";
    return JSON.stringify(nilai);
  }
  return JSON.stringify(nilai);
}

/** Tulis ulang indeks: outro selesai yang videonya masih ada, terbaru dulu. */
function catatIndeks(): void {
  try {
    const selesai = [...jobs.values()]
      .filter((j) => j.status === "done" && j.video && adaBerkas(j.video))
      .map((j) => ({ ...j, logs: [...(j.logs ?? [])].slice(-20) }));
    selesai.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    const berkas = berkasIndeks();
    fs.mkdirSync(path.dirname(berkas), { recursive: true });
    const sementara = `${berkas.replace(/\.json$/, "")}.json.baru`;
    fs.writeFileSync(sementara, jsonPython(selesai.slice(0, INDEKS_MAKS)), "utf8");
    fs.renameSync(sementara, berkas);
  } catch (e) {
    // videonya sudah aman; indeks menyusul
    log.warning(`Indeks outro gagal diperbarui: ${e}`);
  }
}

/** Berkas hasil di disk, plus nama channel; null kalau sudah tidak ada. */
export function ambilVideo(jobId: string): [string, string] | null {
  const job = bacaJob(jobId);
  if (job === null || !job.video) return null;
  if (!adaBerkas(job.video)) return null;
  return [job.video, String(job.channel || "outro")];
}

function catat(jobId: string, pesan: string, ubahan: Partial<JobOutro> = {}): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.logs = [...(job.logs ?? []), pesan].slice(-100);
  job.message = pesan;
  Object.assign(job, ubahan);
  job.updated = sekarang();
  log.info(`outro ${jobId}: ${pesan}`);
}

export function bacaJob(jobId: string): JobOutro | null {
  muatIndeks();
  const job = jobs.get(jobId);
  return job ? { ...job } : null;
}

export function daftarJob(batas = 20): JobOutro[] {
  muatIndeks();
  return [...jobs.values()]
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, Math.max(0, batas))
    .map((j) => ({ ...j }));
}

export function mintaBatal(jobId: string): boolean {
  const ev = batal.get(jobId);
  if (!ev) return false;
  ev.set();
  catat(jobId, "Diminta berhenti; menunggu langkah yang sedang berjalan selesai.");
  return true;
}

/** " ".join(str(x or "").split()) Python. */
function rapat(nilai: unknown): string {
  return pisahSpasi(String(nilai || "")).join(" ");
}

/** str.strip() Python (spasi Unicode + \x1c-\x1f). */
function strip(s: string): string {
  return s.replace(/^[\s\x1c-\x1f]+|[\s\x1c-\x1f]+$/gu, "");
}

/** uuid4().hex[:12]. */
function idBaru(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/**
 * mulai_job(channel, akun, seed=None, logo_path=None, mode="biasa"):
 * daftarkan job lalu render di latar belakang. Mengembalikan job_id.
 * Urutan parameter: mode KEEMPAT (Python selalu dipanggil mode=... sebagai
 * kata kunci; di TS posisi keempat yang paling sering dipakai), logo opsional
 * kelima.
 */
export function mulaiJob(
  channel: string,
  akun: Record<string, unknown>,
  seed: number | null = null,
  mode: string = "biasa",
  logoPath: string | null = null,
): string {
  channel = rapat(channel);
  if (!channel) throw new OutroError("Nama channel wajib diisi.");
  mode = strip(String(mode || "biasa")).toLowerCase();
  if (!(MODE_SAH as readonly string[]).includes(mode)) throw new OutroError(`Mode '${mode}' tidak dikenal.`);
  const jobId = idBaru();
  if (seed === null || seed === undefined) {
    // Dari 12 digit heksa job_id langsung (lihat catatan seed di outro.py).
    seed = Number.parseInt(jobId, 16) % 2 ** 31;
  }
  seed = Math.trunc(seed);
  const gaya = pilihGaya(seed);
  const akunBersih: Record<string, string> = {};
  for (const k of KUNCI_AKUN) akunBersih[k] = strip(String(akun?.[k] || ""));
  const t = sekarang();
  jobs.set(jobId, {
    job_id: jobId,
    status: "queued",
    langkah: "antre",
    progress: 0,
    channel,
    akun: akunBersih,
    seed,
    mode,
    // Mode DPP tidak memakai sumbu gaya: tampilannya tetap.
    gaya: mode === "biasa" ? ringkasGaya(gaya) : "DPP - meniru outro TV Rakyat",
    logo: logoPath || "",
    video: "",
    message: "Menunggu giliran.",
    logs: ["Pekerjaan masuk antrean."],
    created: t,
    updated: t,
  });
  batal.set(jobId, new TandaBatal());
  janjiJob.set(
    jobId,
    giliran(() => jalankan(jobId)),
  );
  return jobId;
}

/** Janji yang selesai saat job berakhir (untuk uji dan penutupan rapi). */
export function tungguJob(jobId: string): Promise<void> {
  return janjiJob.get(jobId) ?? Promise.resolve();
}

/** Sisa ruang disk media dalam MB (ruang_media()["sisa_mb"]). */
function sisaMb(): number {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const s = fs.statfsSync(MEDIA_DIR);
  return Math.round(((s.bavail * s.bsize) / 1048576) * 10) / 10;
}

/** Format {x:.nf} Python (setengah-genap pada nilai biner tepat). */
export function formatF(x: number, d: number): string {
  // toFixed(20) menulis nilai biner TEPAT untuk angka seperti byte/2^20.
  // toFixed(d) membulatkan seri menjauhi nol, Python ke digit genap:
  // bedanya hanya saat seri persis dan digit terakhir genap.
  if (Math.abs(x) < 1e21) {
    const tepat = x.toFixed(20);
    const titik = tepat.indexOf(".");
    const potongan = tepat.slice(0, d > 0 ? titik + 1 + d : titik);
    const sisa = tepat.slice(titik + 1 + d);
    if (/^50*$/.test(sisa) && Number(potongan[potongan.length - 1]) % 2 === 0) return potongan;
  }
  return x.toFixed(d);
}

async function jalankan(jobId: string): Promise<void> {
  const ev = batal.get(jobId)!;
  const folder = path.join(folderOutro(), jobId);
  try {
    const job = bacaJob(jobId) ?? ({} as JobOutro);
    if (ev.isSet()) throw new Dibatalkan("Dihentikan sebelum mulai.");
    // Pengukuran yang gagal bukan alasan menolak.
    let sisa: number;
    try {
      sisa = sisaMb();
    } catch {
      sisa = RUANG_OUTRO_MB;
    }
    if (sisa < RUANG_OUTRO_MB) {
      throw new OutroError(
        `Penyimpanan server penuh (sisa ${formatF(sisa, 0)} MB). Hapus beberapa hasil lama dulu, lalu coba lagi.`,
      );
    }
    try {
      fs.mkdirSync(folder, { recursive: true });
    } catch (e) {
      throw new OutroError(`Tidak bisa menyiapkan folder outro: ${pesanOs(e)}`);
    }
    const lapor = (p: number) => catat(jobId, `Merender outro ... ${p}%`, { progress: 5 + Math.trunc(p * 0.85) });
    catat(jobId, `Merender outro (${job.gaya}) ...`, { status: "running", langkah: "render", progress: 5 });
    let mentah: string;
    const gaya = pilihGaya(Math.trunc(job.seed));
    if (job.mode === "dpp") mentah = await renderDpp(job, folder, ev, lapor);
    else mentah = await renderVideo(job, gaya, folder, ev, lapor);
    if (ev.isSet()) throw new Dibatalkan("Dihentikan sebelum menempel audio.");
    catat(jobId, "Menempel audio ...", { langkah: "audio", progress: 92 });
    const hasil = job.mode === "dpp" ? await tempelAudioDpp(mentah, folder) : await tempelAudio(mentah, folder, gaya.denting_detik);
    if (mentah !== hasil) {
      // Bahan mentah tanpa audio tak dipakai lagi.
      fs.rmSync(mentah, { force: true });
    }
    const ukuran = fs.statSync(hasil).size / 1_048_576;
    catat(jobId, `Video outro siap (${formatF(ukuran, 1)} MB).`, { status: "done", langkah: "selesai", progress: 100, video: hasil });
    catatIndeks();
  } catch (e) {
    if (e instanceof Dibatalkan) {
      catat(jobId, e.message, { status: "dibatalkan", langkah: "berhenti" });
    } else if (e instanceof OutroError) {
      catat(jobId, `Gagal: ${e.message}`, { status: "error", langkah: "gagal" });
    } else {
      console.error(`outro ${jobId} gagal`, e);
      const nama = e instanceof Error ? e.name : "Error";
      const pesan = e instanceof Error ? e.message : String(e);
      catat(jobId, `Gagal: ${nama}: ${pesan}`, { status: "error", langkah: "gagal" });
    }
  } finally {
    batal.delete(jobId);
    janjiJob.delete(jobId);
  }
}

/** str(OSError) Python kira-kira: "[Errno N] pesan: 'jalur'". */
function pesanOs(e: unknown): string {
  const err = e as NodeJS.ErrnoException;
  if (err && err.code && err.path) return `[Errno ${err.errno ?? ""}] ${err.code}: '${err.path}'`;
  return err instanceof Error ? err.message : String(e);
}

/** Buang folder outro yang lebih tua dari batas, beserta entri riwayatnya. */
export function bersihkanLama(jam = 24.0): number {
  const akar = folderOutro();
  try {
    if (!fs.statSync(akar).isDirectory()) return 0;
  } catch {
    return 0;
  }
  muatIndeks();
  const batas = sekarang() - jam * 3600;
  let dibuang = 0;
  for (const nama of fs.readdirSync(akar)) {
    const folder = path.join(akar, nama);
    try {
      const st = fs.statSync(folder);
      if (st.isDirectory() && st.mtimeMs / 1000 < batas) {
        fs.rmSync(folder, { recursive: true, force: true });
        dibuang += 1;
      }
    } catch {
      continue;
    }
  }
  if (dibuang) {
    // Entri yang videonya ikut terbuang dilupakan.
    for (const [id, isi] of [...jobs.entries()]) {
      if (isi.status === "done" && isi.video && !adaBerkas(isi.video)) jobs.delete(id);
    }
    catatIndeks();
  }
  return dibuang;
}

/** HANYA untuk uji: lupakan semua job di memori dan muat ulang indeks berikutnya. */
export function aturUlangUntukUji(): void {
  jobs.clear();
  batal.clear();
  janjiJob.clear();
  indeksDimuat = false;
}
