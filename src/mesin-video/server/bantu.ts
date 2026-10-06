// Bantuan bersama rute (cermin bagian BANTUAN video_api.py): siapa pemilik,
// template/job yang terjangkau, rem antrean, kuota, dan unggahan ke disk.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { kirimRender } from "../antrean";
import { GalatVideo, type Job, type Template } from "../jenis";
import { folderUnggahan, pemilikUnggahan } from "../jalur";
import { bacaStatus, buatJob, daftarJob, jumlahMenunggu, mintaBatal, STATUS_AKTIF_JOB, tulisStatus } from "../job";
import { KuotaHabis, lupakan, pastikanMuat } from "../kuota";
import { bolehLihat, bolehUbah, loadTemplate } from "../template";
import { periksaUrl } from "../unduh";
import { ruangMedia, sediakanRuang } from "../volume";
import { GalatHttp, terimaBerkas, type Permintaan, type TujuanBerkas } from "./dasar";

const angkaEnv = (nama: string, bawaan: number) => {
  const n = Number.parseFloat(process.env[nama] ?? "");
  return Number.isFinite(n) ? n : bawaan;
};

// Berapa render berjalan BERSAMAAN ditentukan worker (slot serentak). Di sini
// rem supaya satu orang tidak bisa memenuhi antrean semua orang atau disk
// server. Antrean server dinaikkan 30 → 500 (6 Okt 2026): pengguna boleh
// terus menambah video dan menunggu gilirannya; keadilan antar-orang diatur
// prioritas antrean (antrean.ts), bukan dengan menolak.
export const MAX_QUEUED_JOBS = Math.max(0, Math.trunc(angkaEnv("VIDEO_MAX_QUEUED_JOBS", 500)));
export const MAX_BATCH = Math.max(0, Math.trunc(angkaEnv("VIDEO_MAX_BATCH", 20)));
// Bisa diubah uji (pengganti monkeypatch di uji Python).
export const rem = { aktifPerAkun: Math.max(0, Math.trunc(angkaEnv("VIDEO_MAX_AKTIF_PER_AKUN", 20))) };
export const MAX_ASSET_MB = angkaEnv("VIDEO_MAX_ASSET_MB", 200);
export const JENIS_GAMBAR = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const JENIS_VIDEO = new Set([".mp4", ".mov", ".m4v", ".webm"]);
export const JENIS_ASET = new Set([...JENIS_GAMBAR, ...JENIS_VIDEO]);

/** f"{n:.0f}" Python: pembulatan setengah ke genap (2.5 -> "2"), bukan toFixed. */
export function f0(n: number): string {
  const bawah = Math.floor(n);
  const sisa = n - bawah;
  const bulat = sisa === 0.5 ? (bawah % 2 === 0 ? bawah : bawah + 1) : Math.round(n);
  return String(Object.is(bulat, -0) ? 0 : bulat);
}

/** Urutan seperti sorted() Python (titik kode, bukan locale). */
export const urut = (it: Iterable<string>) => [...it].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export type Pengguna = {
  user_id: string;
  username: string;
  /** Akun TIM (5 Okt 2026): id anggota tim yang mengirim permintaan. */
  anggota?: string;
};

export const akunDari = (p: Pengguna) => String(p.username).trim().toLowerCase();

export function tangani(e: unknown): never {
  if (e instanceof GalatVideo) throw new GalatHttp(400, e.message);
  throw e;
}

/** Template yang boleh dibaca akun ini: miliknya sendiri atau template bawaan. */
export function templateTerlihat(templateId: string, p: Pengguna): Template {
  let data: Template;
  try {
    data = loadTemplate(templateId);
  } catch (e) {
    if (e instanceof GalatVideo) throw new GalatHttp(404, e.message);
    throw e;
  }
  // 404, bukan 403: keberadaan template orang lain tidak perlu diumumkan.
  if (!bolehLihat(data, akunDari(p))) throw new GalatHttp(404, `Template '${templateId}' tidak ditemukan`);
  return data;
}

export function templateMilik(templateId: string, p: Pengguna): Template {
  const data = templateTerlihat(templateId, p);
  if (!bolehUbah(data, akunDari(p))) {
    throw new GalatHttp(403, "Template bawaan tidak bisa diubah. Duplikat dulu untuk menyuntingnya.");
  }
  return data;
}

/** Job milik akun ini; milik orang lain dianggap tidak ada. */
export async function jobTerjangkau(jobId: string, p: Pengguna): Promise<Job> {
  let data: Job;
  try {
    data = await bacaStatus(jobId);
  } catch (e) {
    if (e instanceof GalatVideo) throw new GalatHttp(404, e.message);
    throw e;
  }
  if (String(data.owner ?? "") !== akunDari(p)) throw new GalatHttp(404, `Job '${jobId}' tidak ditemukan`);
  return data;
}

/** Tolak render tanpa isi berita: hasilnya pasti kotak putih tanpa tulisan. */
export function pastikanHook(texts: Record<string, string> | null | undefined): void {
  if (!String(texts?.hook ?? "").trim()) {
    throw new GalatHttp(400, "Isi beritanya kosong. Tulis sendiri atau buat otomatis dari link dulu.");
  }
}

export async function pastikanKuota(p: Pengguna, tambahan = 0): Promise<void> {
  try {
    await pastikanMuat(akunDari(p), tambahan);
  } catch (e) {
    if (e instanceof KuotaHabis) throw new GalatHttp(413, e.message);
    throw e;
  }
}

/** Periksa sumber video SEBELUM job dibuat (unggahan milik sendiri / link publik). */
export async function sumberSah(url: string, p: Pengguna): Promise<string> {
  const u = url.trim();
  if (folderUnggahan(u) !== null) {
    if (pemilikUnggahan(u) !== akunDari(p)) {
      throw new GalatHttp(404, "Video unggahan tidak ditemukan (mungkin sudah dibersihkan). Unggah lagi.");
    }
    return u;
  }
  try {
    return await periksaUrl(u);
  } catch (e) {
    return tangani(e);
  }
}

/**
 * Tolak kalau antrean server atau job aktif akun ini sudah penuh. `maksAkun`
 * menimpa batas per akun (TVR Saya punya batasnya sendiri, termasuk akun tim).
 */
export async function pastikanAntreanMuat(tambahan: number, p: Pengguna, maksAkun?: number): Promise<void> {
  const maksAktif = maksAkun ?? rem.aktifPerAkun;
  if (maksAktif > 0) {
    const aktif = (await daftarJob(maksAktif + tambahan + 1, akunDari(p))).filter((j) => STATUS_AKTIF_JOB.includes(j.status));
    if (aktif.length + tambahan > maksAktif) {
      throw new GalatHttp(
        429,
        `Antrean Anda penuh: ${aktif.length} video belum selesai (maksimal ${maksAktif}). ` +
          "Tunggu sebagian selesai lalu tambah lagi.",
      );
    }
  }
  if (MAX_QUEUED_JOBS > 0) {
    const antre = await jumlahMenunggu();
    if (antre + tambahan > MAX_QUEUED_JOBS) {
      throw new GalatHttp(
        429,
        `Antrean server penuh: ${antre} video menunggu (maksimal ${MAX_QUEUED_JOBS}). Coba lagi beberapa menit lagi.`,
      );
    }
  }
}

/** Ubah kegagalan tulis ke disk jadi jawaban yang bisa dimengerti. */
export function galatTulis(e: unknown): unknown {
  const kode = (e as NodeJS.ErrnoException | null)?.code;
  if (kode === "ENOSPC") {
    console.error("Volume media penuh saat menerima unggahan:", ruangMedia());
    return new GalatHttp(
      507,
      "Ruang penyimpanan server sedang penuh, jadi berkasnya tidak bisa disimpan. Berkas lama sedang " +
        "dibersihkan otomatis - coba lagi beberapa saat lagi.",
    );
  }
  if (kode) {
    console.error("Gagal menulis unggahan ke disk", e);
    return new GalatHttp(500, "Gagal menyimpan berkas di server.");
  }
  return e;
}

/** Pastikan volume masih muat; ukuran dari Content-Length bila ada. */
export async function sediakanRuangUnggah(pm: Permintaan, batasByte: number): Promise<void> {
  let perlu = Number.parseInt(String(pm.req.headers["content-length"] ?? "0"), 10);
  if (!Number.isFinite(perlu)) perlu = 0;
  perlu = perlu > 0 ? Math.min(perlu, batasByte) : batasByte;
  const perluMb = perlu / 1_048_576;
  const sisaMb = await sediakanRuang(perluMb);
  if (sisaMb < perluMb) {
    console.error(`Unggahan ${f0(perluMb)} MB ditolak: sisa volume ${f0(sisaMb)} MB`);
    throw new GalatHttp(
      507,
      `Ruang penyimpanan server tinggal ${f0(sisaMb)} MB, tidak cukup untuk berkas ${f0(perluMb)} MB. ` +
        "Coba berkas yang lebih kecil atau ulangi nanti.",
    );
  }
}

/** Terima unggahan field "file"; galat disk diterjemahkan. */
export async function tulisUnggahan(
  pm: Permintaan,
  tujuan: (namaAsli: string) => TujuanBerkas,
  batas: number,
  pesanBesar: string,
): Promise<{ nama: string; jalur: string; ukuran: number }> {
  try {
    return await terimaBerkas(pm, tujuan, batas, pesanBesar);
  } catch (e) {
    throw galatTulis(e);
  }
}

export const akhiran = (nama: string) => path.extname(nama).toLowerCase();

/** Hentikan satu job: tandai batal, catat keadaannya (worker melewati yang bukan queued). */
export async function cabutTugas(status: Job): Promise<void> {
  const id = String(status.job_id);
  await mintaBatal(id);
  if (status.status === "queued") await tulisStatus(id, { status: "dibatalkan", log: "Dihentikan sebelum mulai." });
  else await tulisStatus(id, { log: "Diminta berhenti; menunggu proses berhenti." });
}

export async function kirimJob(
  url: string,
  templateId: string,
  texts: Record<string, string>,
  p: Pengguna,
  teksWarna = "",
): Promise<string> {
  const jobId = await buatJob(url, templateId, texts, akunDari(p));
  await kirimRender({ job_id: jobId, url, template_id: templateId, texts, ...(teksWarna ? { teks_warna: teksWarna } : {}) });
  return jobId;
}

export function lupakanKuota(p: Pengguna): void {
  lupakan(akunDari(p));
}

export function hapusDiam(jalur: string): void {
  fs.rmSync(jalur, { recursive: true, force: true });
}

// ---------- Pembantu validasi bergaya pydantic (mode lax) ----------

/** int pydantic: angka bulat, atau string angka bulat. */
export const intLax = z.preprocess((v) => {
  if (typeof v === "string" && /^\s*[-+]?\d+\s*$/.test(v)) return Number.parseInt(v, 10);
  return v;
}, z.number().int());

/** float pydantic: angka atau string angka. */
export const floatLax = z.preprocess((v) => {
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return v;
}, z.number());

export function intQuery(pm: Permintaan, nama: string, bawaan: number, min?: number, max?: number): number {
  const mentah = pm.query.get(nama);
  if (mentah === null) return bawaan;
  const n = /^\s*[-+]?\d+\s*$/.test(mentah) ? Number.parseInt(mentah, 10) : Number.NaN;
  const salah = (msg: string) =>
    new GalatHttp(422, [{ type: "int_parsing", loc: ["query", nama], msg }]);
  if (!Number.isFinite(n)) throw salah("Input should be a valid integer, unable to parse string as an integer");
  if (min !== undefined && n < min) throw salah(`Input should be greater than or equal to ${min}`);
  if (max !== undefined && n > max) throw salah(`Input should be less than or equal to ${max}`);
  return n;
}
