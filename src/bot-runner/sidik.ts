// ============================================================
// RUMAH BOT (runner) — PENYIDIK SIDIK VISUAL (3F tahap B, 13 Okt 2026).
//
// Menghitung sidik sebuah video: unduh PRATINJAU RINGAN (≈22 detik pertama, kualitas terendah),
// ambil 1 bingkai/detik lewat ffmpeg (tepi dipotong, diperkecil 9x8 abu-abu), hash tiap bingkai
// (sidik-murni.ts). Pratinjau dihapus segera. Perbandingan antar-video dilakukan di APLIKASI.
//
// Aturan keras (sama dengan pemanen):
//  - URL divalidasi KETAT (https, daftar host) sebelum spawn; proses TANPA shell, argumen berupa
//    larik, `--` sebelum URL; proses anak TIDAK mewarisi env runner (tak membawa BOT_RUNNER_SECRET);
//  - hanya SATU pemeriksaan berjalan pada satu waktu (antrean di sini);
//  - tanpa proxy/penyamaran; gejala 429/login dilaporkan apa adanya.
// Hanya modul bawaan Node; tidak mengimpor src/lib (image mesin tidak menyalinnya).
// ============================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pesanGalat } from "./galat";
import { deteksiPembatasan, jalankanProsesNyata, type JalankanProses } from "./pemanen";
import { MAKS_BINGKAI, MIN_BINGKAI, sidikDariRaw, sidikInformatif } from "./sidik-murni";

const HOST_SAH = ["instagram.com", "tiktok.com", "youtube.com", "youtu.be", "facebook.com", "fb.watch", "x.com", "twitter.com"];

/** URL boleh diunduh? https + host platform yang dikenal (persis atau subdomain). */
export function urlSidikSah(url: string): boolean {
  if (typeof url !== "string" || url.length === 0 || url.length > 500 || /\s/.test(url) || url.startsWith("-")) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return HOST_SAH.some((d) => host === d || host.endsWith(`.${d}`));
}

export type JenisSidik = "ok" | "tak_informatif" | "url_tak_sah" | "dibatasi" | "login" | "waktu_habis" | "gagal";

export type HasilSidik = { jenis: JenisSidik; sidik: string[] | null; galat?: string };

export type SistemBerkas = {
  buatDir(): string;
  daftar(dir: string): string[];
  baca(berkas: string): Uint8Array | null;
  hapusDir(dir: string): void;
};

export const sistemBerkasNyata: SistemBerkas = {
  buatDir: () => fs.mkdtempSync(path.join(os.tmpdir(), "sidik-")),
  daftar: (dir) => {
    try {
      return fs.readdirSync(dir);
    } catch {
      return [];
    }
  },
  baca: (berkas) => {
    try {
      return fs.readFileSync(berkas);
    } catch {
      return null;
    }
  },
  hapusDir: (dir) => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // dibiarkan; /tmp kontainer ikut hilang saat dibuat ulang
    }
  },
};

export type OpsiPenyidik = {
  ytdlpBin: string;
  ffmpegBin: string;
  cookiesFile: string | null;
  jalankan?: JalankanProses;
  berkas?: SistemBerkas;
  batasUnduhMs?: number;
  batasFfmpegMs?: number;
};

/** Bagian pratinjau yang diunduh (detik). */
const DETIK_PRATINJAU = 22;

export class PenyidikVideo {
  private readonly jalankan: JalankanProses;
  private readonly berkas: SistemBerkas;
  private readonly batasUnduh: number;
  private readonly batasFfmpeg: number;
  private rantai: Promise<unknown> = Promise.resolve();

  constructor(private readonly opsi: OpsiPenyidik) {
    this.jalankan = opsi.jalankan ?? jalankanProsesNyata;
    this.berkas = opsi.berkas ?? sistemBerkasNyata;
    this.batasUnduh = opsi.batasUnduhMs ?? 120_000;
    this.batasFfmpeg = opsi.batasFfmpegMs ?? 60_000;
  }

  /** Argumen yt-dlp (larik; TANPA shell). */
  argumenUnduh(url: string, dir: string): string[] {
    const a = [
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout",
      "20",
      "--max-filesize",
      "60M",
      "--no-part",
      "-f",
      "worst[ext=mp4]/worst",
      "--download-sections",
      `*0-${DETIK_PRATINJAU}`,
      "-o",
      path.join(dir, "v.%(ext)s"),
    ];
    if (this.opsi.cookiesFile) a.push("--cookies", this.opsi.cookiesFile);
    a.push("--", url);
    return a;
  }

  /** Argumen ffmpeg: 1 bingkai/detik, tepi dipotong (70% tengah), 9x8 abu-abu, mentah ke berkas. */
  argumenFfmpeg(masukan: string, keluaran: string): string[] {
    return [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-t",
      String(DETIK_PRATINJAU),
      "-i",
      masukan,
      "-an",
      "-vf",
      "fps=1,crop=iw*0.7:ih*0.7,scale=9:8:flags=area,format=gray",
      "-frames:v",
      String(MAKS_BINGKAI),
      "-f",
      "rawvideo",
      keluaran,
    ];
  }

  private giliran<T>(kerja: () => Promise<T>): Promise<T> {
    const hasil = this.rantai.then(kerja, kerja);
    this.rantai = hasil.catch(() => undefined);
    return hasil;
  }

  async periksa(url: string): Promise<HasilSidik> {
    if (!urlSidikSah(url)) return { jenis: "url_tak_sah", sidik: null, galat: "URL tidak sah untuk diperiksa (tidak dijalankan)" };
    return this.giliran(() => this.kerjakan(url));
  }

  private async kerjakan(url: string): Promise<HasilSidik> {
    let dir: string;
    try {
      dir = this.berkas.buatDir();
    } catch (e) {
      return { jenis: "gagal", sidik: null, galat: `tidak bisa membuat folder sementara: ${pesanGalat(e, 100)}` };
    }
    try {
      const unduh = await this.jalankan(this.opsi.ytdlpBin, this.argumenUnduh(url, dir), { batasMs: this.batasUnduh, maksByte: 256 * 1024 });
      const gejala = deteksiPembatasan(unduh.stderr);
      const video = this.berkas.daftar(dir).find((n) => n.startsWith("v."));
      if (!video) {
        if (gejala) return { jenis: gejala, sidik: null, galat: gejala === "dibatasi" ? "dibatasi platform (429)" : "platform meminta login/cookies" };
        if (unduh.waktuHabis) return { jenis: "waktu_habis", sidik: null, galat: `unduh pratinjau melewati ${Math.round(this.batasUnduh / 1000)} detik` };
        const baris = unduh.stderr.split("\n").map((x) => x.trim()).filter(Boolean).pop() ?? "";
        return { jenis: "gagal", sidik: null, galat: `unduh pratinjau gagal (kode ${unduh.kode ?? "?"}): ${baris.slice(0, 140)}` };
      }
      const keluaran = path.join(dir, "bingkai.raw");
      const ff = await this.jalankan(this.opsi.ffmpegBin, this.argumenFfmpeg(path.join(dir, video), keluaran), { batasMs: this.batasFfmpeg, maksByte: 64 * 1024 });
      if (ff.waktuHabis) return { jenis: "waktu_habis", sidik: null, galat: "ffmpeg melewati batas waktu" };
      const mentah = this.berkas.baca(keluaran);
      if (ff.kode !== 0 || !mentah || mentah.length === 0) {
        const baris = ff.stderr.split("\n").map((x) => x.trim()).filter(Boolean).pop() ?? "";
        return { jenis: "gagal", sidik: null, galat: `ffmpeg gagal (kode ${ff.kode ?? "?"}): ${baris.slice(0, 140)}` };
      }
      const sidik = sidikDariRaw(mentah);
      if (sidik.length < MIN_BINGKAI) return { jenis: "gagal", sidik: null, galat: `video terlalu pendek (${sidik.length} bingkai)` };
      return { jenis: sidikInformatif(sidik) ? "ok" : "tak_informatif", sidik };
    } catch (e) {
      return { jenis: "gagal", sidik: null, galat: pesanGalat(e, 160) };
    } finally {
      this.berkas.hapusDir(dir);
    }
  }
}
