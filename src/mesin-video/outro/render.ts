// RENDER outro: frame demi frame ke pipa ffmpeg (rawvideo rgb24 -> x264),
// lalu audio ditempel — cermin render_video, render_dpp, tempel_audio, dan
// tempel_audio_dpp di outro.py.
//
// Python merender di thread; di sini render berjalan async di proses yang
// sama dan memberi jeda ke event loop tiap frame (setImmediate), supaya
// permintaan HTTP lain (status, daftar) tetap terlayani selama render.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FFMPEG_BIN } from "../konfig";
import {
  cahayaPilDpp,
  DPP_AJAKAN,
  DPP_AUDIO,
  DPP_DETIK,
  DPP_T_HANDLE,
  DPP_T_LOGO,
  DPP_T_PIL,
  DPP_T_TAGLINE,
  DPP_TAGLINE,
  gelombangDpp,
  latarDpp,
  logoDpp,
  pilDpp,
} from "./dpp";
import { baru, BICUBIC, Gambar, keRgb, LANCZOS, potong, putar, salin, ubahUkuran } from "./gambar";
import { DENTING, KUNCI_AKUN, type Gaya, type KunciAkun } from "./gaya";
import { Dibatalkan, OutroError } from "./galat";
import { Kuas } from "./kuas";
import {
  adaBerkas,
  badge,
  bagi,
  clamp,
  dekor,
  gerakLatar,
  glowBadge,
  halus,
  ikon,
  latar,
  lenting,
  logoUnggahan,
  modPy,
  muatGlyph,
  skala,
  susun,
  teksGambar,
  tempel,
  type CacheGerak,
} from "./lukis";

function angkaEnv(nama: string, bawaan: number): number {
  const mentah = (process.env[nama] ?? "").trim();
  if (!mentah) return bawaan;
  const v = Number.parseInt(mentah, 10);
  return Number.isFinite(v) ? v : bawaan;
}

/** Dibaca saat modul dimuat, sama seperti konstanta modul Python. */
export const VIDEO_W = angkaEnv("OUTRO_VIDEO_W", 1080);
export const VIDEO_H = angkaEnv("OUTRO_VIDEO_H", 1920);
export const FPS = angkaEnv("OUTRO_FPS", 30);

/** Bendera batal (threading.Event). */
export class TandaBatal {
  private nyala = false;
  set(): void {
    this.nyala = true;
  }
  isSet(): boolean {
    return this.nyala;
  }
}

export type Lapor = (persen: number) => void;

/** Data job yang dibutuhkan perender. */
export type JobRender = { channel: string; akun: Record<string, string>; logo?: string; seed: number; mode: string };

const jeda = () => new Promise<void>((selesai) => setImmediate(selesai));

/** VIDEO_THREADS untuk outro: bawaan "1", "0" diganti "1" (kontainer 1 GB). */
function utasRender(): string {
  let utas = process.env.VIDEO_THREADS || "1";
  if (utas === "0") utas = "1";
  return utas;
}

// ------------------------------------------------------------------
//  Pipa ffmpeg rawvideo -> x264
// ------------------------------------------------------------------

class PipaFfmpeg {
  private readonly proses;
  private readonly fdLog: number;
  private kode: number | null | undefined = undefined;
  private readonly selesaiJanji: Promise<void>;
  rusak = false;
  galatSpawn: Error | null = null;

  constructor(
    readonly keluaran: string,
    private readonly berkasLog: string,
    w: number,
    h: number,
  ) {
    const utas = utasRender();
    this.fdLog = fs.openSync(berkasLog, "w");
    this.proses = spawn(
      FFMPEG_BIN,
      [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", utas,
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${w}x${h}`, "-r", String(FPS), "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
        "-threads", utas, "-movflags", "+faststart", keluaran,
      ],
      { stdio: ["pipe", "ignore", this.fdLog], windowsHide: true },
    );
    this.selesaiJanji = new Promise<void>((selesai) => {
      this.proses.on("error", (e) => {
        // Popen Python melempar FileNotFoundError saat ffmpeg tak ada; di sini
        // galat spawn disimpan lalu dilempar setelah loop (lihat alirkan).
        this.galatSpawn = e;
        this.rusak = true;
        if (this.kode === undefined) this.kode = -1;
        selesai();
      });
      this.proses.on("close", (kode, sinyal) => {
        // Python: returncode = -nomor_sinyal bila dibunuh sinyal.
        this.kode = kode ?? (sinyal ? -(os.constants.signals[sinyal] ?? 1) : -1);
        selesai();
      });
    });
    this.proses.stdin!.on("error", () => {
      this.rusak = true; // BrokenPipeError: ffmpeg sudah mati
    });
  }

  /** Tulis satu frame; false bila pipa sudah putus (lalu loop berhenti). */
  async tulis(buf: Uint8Array): Promise<boolean> {
    if (this.rusak || this.kode !== undefined) return false;
    const stdin = this.proses.stdin!;
    const lanjut = stdin.write(buf);
    if (!lanjut) {
      await new Promise<void>((ok) => {
        const beres = () => {
          stdin.off("drain", beres);
          stdin.off("error", beres);
          stdin.off("close", beres);
          ok();
        };
        stdin.on("drain", beres);
        stdin.on("error", beres);
        stdin.on("close", beres);
      });
    }
    return !this.rusak;
  }

  bunuh(): void {
    try {
      this.proses.kill("SIGKILL");
    } catch {
      /* sudah mati */
    }
  }

  async tutup(): Promise<number> {
    try {
      this.proses.stdin!.end();
    } catch {
      /* pipa sudah tertutup */
    }
    await this.selesaiJanji;
    try {
      fs.closeSync(this.fdLog);
    } catch {
      /* sudah tertutup */
    }
    return this.kode ?? -1;
  }

  get returncode(): number {
    return this.kode ?? -1;
  }

  barisLog(): string[] {
    try {
      return fs
        .readFileSync(this.berkasLog, "utf8")
        .split(/\r?\n/)
        .filter((b) => b.trim());
    } catch {
      return [];
    }
  }
}

function sebabMatiVideo(p: PipaFfmpeg): string {
  const baris = p.barisLog();
  if (p.returncode === -9) {
    return "ffmpeg dihentikan paksa oleh sistem (SIGKILL) - hampir pasti kehabisan memori di kontainer.";
  }
  return baris.length
    ? `ffmpeg keluar dengan kode ${p.returncode}: ${Array.from(baris[baris.length - 1]).slice(0, 200).join("")}`
    : `ffmpeg keluar dengan kode ${p.returncode} tanpa pesan.`;
}

function sebabMatiDpp(p: PipaFfmpeg): string {
  const b = p.barisLog();
  if (p.returncode === -9) return "ffmpeg dihentikan paksa oleh sistem (SIGKILL) - hampir pasti kehabisan memori.";
  return `ffmpeg keluar dengan kode ${p.returncode}` + (b.length ? `: ${Array.from(b[b.length - 1]).slice(0, 200).join("")}` : " tanpa pesan.");
}

// ------------------------------------------------------------------
//  Mode biasa
// ------------------------------------------------------------------

const TATA_PERLU_NAMA = new Set(["grid", "baris-ikon", "dua-kolom", "kiri-atas", "bawah", "melingkar", "dua-baris", "kolom-kanan"]);

/** Isi akun berurutan KUNCI_AKUN, hanya yang terisi. */
function isiAkun(akun: Record<string, string>): [KunciAkun, string][] {
  return KUNCI_AKUN.filter((k) => akun[k]).map((k) => [k, akun[k]] as [KunciAkun, string]);
}

/**
 * Semua bahan statis + fungsi penggambar satu frame (dipisah dari pipa
 * supaya uji bisa membandingkan frame tertentu dengan Python).
 */
export async function siapkanBiasa(job: JobRender, g: Gaya) {
  const w = VIDEO_W - (VIDEO_W % 2);
  const h = VIDEO_H - (VIDEO_H % 2);
  const channel = job.channel;
  const isi = isiAkun(job.akun);
  const durasi = g.durasi;
  const huruf = (s: string) => (g.huruf_besar ? s.toUpperCase() : s);
  await muatGlyph();

  const bgLatar = latar(w, h, g);
  await jeda();
  const pakaiLogo = adaBerkas(job.logo);
  const namaTeksPerlu = pakaiLogo || TATA_PERLU_NAMA.has(g.tata);
  const L = susun(w, h, g, isi.length, namaTeksPerlu);
  const [bx, by, D] = L.badge;
  const gbBadge = pakaiLogo ? await logoUnggahan(job.logo!, D) : await badge(channel, D, g, jeda);
  const glow = g.glow_badge ? glowBadge(D, g) : null;
  const pusatBadge: [number, number] = [bx + bagi(D, 2), by + bagi(D, 2)];
  const namaIm = L.pakai_nama_teks
    ? teksGambar(huruf(channel), Math.trunc(w * 0.058), [...g.teks, 255], g.miring, g.font_teks)
    : null;
  const warnaTeks = [...g.teks, 255];
  const barisIms = isi.slice(0, L.baris.length).map(([k, nilai], i) => {
    const b = L.baris[i];
    const ik = ikon(k, b.ikon_s, g);
    const tx = teksGambar(g.huruf_besar && g.acak < 0.3 ? huruf(nilai) : nilai, b.font, warnaTeks, false, g.font_teks);
    return { ik, tx, b };
  });
  await jeda();
  const tBadge = 0.35;
  const tHandle = 1.6;
  const total = Math.max(1, Math.trunc(FPS * durasi));
  const cache: CacheGerak = new Map();
  let lebarTengah: number | null = null;

  const frameKe = (n: number): Gambar => {
    const t = n / FPS;
    let frame: Gambar;
    if (g.gerak_latar === "zoom") {
      // 16 tingkat zoom dihitung sekali, bukan resize latar penuh tiap frame.
      const k = Math.min(15, Math.trunc((16 * t) / durasi));
      const kunci = `zoom:${k}`;
      if (!cache.has(kunci)) {
        const f = 1.0 + 0.06 * (k / 15);
        const besar = ubahUkuran(bgLatar, Math.trunc(w * f), Math.trunc(h * f));
        const ox = bagi(besar.w - w, 2);
        const oy = bagi(besar.h - h, 2);
        cache.set(kunci, potong(besar, ox, oy, ox + w, oy + h));
      }
      frame = salin(cache.get(kunci) as Gambar);
    } else if (g.gerak_latar === "geser") {
      if (!cache.has("latar_lebar")) cache.set("latar_lebar", ubahUkuran(bgLatar, Math.trunc(w * 1.08), Math.trunc(h * 1.08)));
      const besar = cache.get("latar_lebar") as Gambar;
      const dx = Math.trunc((besar.w - w) * (t / durasi));
      const dy = Math.trunc((besar.h - h) * 0.5);
      frame = potong(besar, dx, dy, dx + w, dy + h);
    } else {
      frame = salin(bgLatar);
    }
    gerakLatar(frame, w, h, t, g, cache);
    dekor(frame, w, h, t, g, pusatBadge, D);

    // ----- badge -----
    if (t >= tBadge) {
      const u = (t - tBadge) / 0.8;
      const a = clamp(u / 0.35);
      const apung = Math.trunc(5 * Math.sin(t * 1.8));
      const jenis = g.masuk_badge;
      let dx = 0;
      let dy = 0;
      let bimg: Gambar;
      if (jenis === "lenting") {
        bimg = skala(gbBadge, Math.max(0.02, lenting(u)));
      } else if (jenis === "turun") {
        bimg = gbBadge;
        dy = Math.trunc(-(1 - halus(u)) * h * 0.25);
      } else if (jenis === "putar") {
        bimg = putar(skala(gbBadge, Math.max(0.05, halus(u))), (1 - halus(u)) * 180, BICUBIC, false);
      } else if (jenis === "kiri") {
        bimg = gbBadge;
        dx = Math.trunc(-(1 - halus(u)) * w * 0.6);
      } else if (jenis === "kedip") {
        bimg = skala(gbBadge, 1.0 + 0.06 * Math.sin(Math.min(u, 1.0) * Math.PI * 2));
      } else {
        bimg = skala(gbBadge, 1.35 - 0.35 * halus(u));
      }
      if (glow !== null) {
        const gx = pusatBadge[0] - bagi(glow.w, 2) + dx;
        const gy = pusatBadge[1] - bagi(glow.h, 2) + dy + apung;
        tempel(frame, glow, gx, gy, a * (0.7 + 0.3 * Math.sin(t * 2.0)));
      }
      tempel(frame, bimg, bx + bagi(D - bimg.w, 2) + dx, by + bagi(D - bimg.h, 2) + apung + dy, a);
    }

    // ----- nama (teks) -----
    if (namaIm !== null && t >= tBadge + 0.6) {
      const a = halus((t - tBadge - 0.6) / 0.5);
      const [nx, ny] = L.nama!;
      let x = nx - bagi(namaIm.w, 2);
      if (L.nama_kiri) x = Math.trunc(w * 0.06) + D + Math.trunc(w * 0.06);
      tempel(frame, namaIm, x, ny + Math.trunc(24 * (1 - a)), a);
    }

    // ----- handle -----
    barisIms.forEach(({ ik, tx, b }, i) => {
      const mulai = tHandle + i * 0.13;
      if (t < mulai) return;
      const u = (t - mulai) / 0.45;
      const a = halus(u);
      const jenis = g.masuk_handle;
      const dx = jenis === "kiri" ? Math.trunc(-70 * (1 - a)) : jenis === "kanan" ? Math.trunc(70 * (1 - a)) : 0;
      const dy = jenis === "atas" ? Math.trunc(40 * (1 - a)) : 0;
      const sk = jenis === "pop" ? Math.max(0.05, lenting(u)) : 1.0;
      const ikx = sk !== 1.0 ? skala(ik, sk) : ik;
      let txxIm = tx;
      if (jenis === "ketik") {
        const lebar = Math.max(1, Math.trunc(tx.w * clamp(u)));
        txxIm = potong(tx, 0, 0, lebar, tx.h);
      }
      if (b.pil) {
        const [px, py, pw, ph] = b.pil;
        const lap = baru("RGBA", pw, ph, [0, 0, 0, 0]);
        new Kuas(lap).roundedRectangle([0, 0, pw - 1, ph - 1], bagi(ph, 2), [...g.aksen, 60], [...g.aksen2, 140], 2);
        tempel(frame, lap, px + dx, py + dy, a);
      }
      if (b.tengah) {
        if (lebarTengah === null) lebarTengah = Math.max(...barisIms.map((r) => r.ik.w + 18 + r.tx.w));
        const x0 = bagi(w, 2) - bagi(lebarTengah, 2);
        tempel(frame, ikx, x0 + dx + bagi(ik.w - ikx.w, 2), b.y! + dy + bagi(ik.h - ikx.h, 2), a);
        tempel(frame, txxIm, x0 + ik.w + 18 + dx, b.y! + dy + bagi(ik.h - tx.h, 2), a);
      } else if (b.teks_tengah_y !== undefined) {
        const [ix, iy] = b.ikon!;
        tempel(frame, ikx, ix + dx + bagi(ik.w - ikx.w, 2), iy + dy + bagi(ik.h - ikx.h, 2), a);
        tempel(frame, txxIm, bagi(w, 2) - bagi(tx.w, 2), b.teks_tengah_y + dy, a);
      } else if (b.teks_tengah !== undefined && b.teks_tengah !== null) {
        const [ix, iy] = b.ikon!;
        tempel(frame, ikx, ix + dx + bagi(ik.w - ikx.w, 2), iy + dy + bagi(ik.h - ikx.h, 2), a);
        const [cx, cy] = b.teks_tengah;
        tempel(frame, txxIm, cx - bagi(tx.w, 2), cy + dy, a);
      } else {
        const [ix, iy] = b.ikon!;
        const [txx, txy] = b.teks!;
        tempel(frame, ikx, ix + dx + bagi(ik.w - ikx.w, 2), iy + dy + bagi(ik.h - ikx.h, 2), a);
        tempel(frame, txxIm, txx + dx, txy + dy + bagi(ik.h - tx.h, 2), a);
      }
    });
    return frame;
  };
  return { w, h, total, frameKe };
}

/** Loop render bersama: frame ke pipa, batal, laporan kemajuan. */
async function alirkan(
  folder: string,
  w: number,
  h: number,
  total: number,
  frameKe: (n: number) => Gambar,
  ev: TandaBatal,
  lapor: Lapor,
): Promise<PipaFfmpeg> {
  const pipa = new PipaFfmpeg(path.join(folder, "video-tanpa-audio.mp4"), path.join(folder, "ffmpeg.log"), w, h);
  try {
    const laporTiap = Math.max(1, bagi(total, 12));
    for (let n = 0; n < total; n++) {
      if (ev.isSet()) {
        pipa.bunuh();
        throw new Dibatalkan("Render dihentikan.");
      }
      const frame = frameKe(n);
      // Buffer baru per frame: stdin bisa masih memegang buffer sebelumnya.
      if (!(await pipa.tulis(keRgb(frame)))) break;
      if (n % laporTiap === 0) lapor(Math.trunc((n / total) * 100));
      await jeda();
    }
  } finally {
    await pipa.tutup();
  }
  if (pipa.galatSpawn) throw pipa.galatSpawn;
  return pipa;
}

export async function renderVideo(job: JobRender, g: Gaya, folder: string, ev: TandaBatal, lapor: Lapor): Promise<string> {
  const { w, h, total, frameKe } = await siapkanBiasa(job, g);
  const pipa = await alirkan(folder, w, h, total, frameKe, ev, lapor);
  if (pipa.returncode !== 0 || !adaBerkas(pipa.keluaran)) {
    throw new OutroError(`Gagal merender video outro: ${sebabMatiVideo(pipa)}`);
  }
  lapor(100);
  return pipa.keluaran;
}

// ------------------------------------------------------------------
//  Mode DPP
// ------------------------------------------------------------------

export async function siapkanDpp(job: JobRender) {
  const w = VIDEO_W - (VIDEO_W % 2);
  const h = VIDEO_H - (VIDEO_H % 2);
  const isi = isiAkun(job.akun);
  await muatGlyph();
  // --- unsur tetap, dirender sekali ---
  const latarIm = latarDpp(w, h);
  const D = Math.trunc(w * 0.56);
  const logo = await logoDpp(job.channel, D);
  await jeda();
  const bx = bagi(w - D, 2);
  const by = Math.trunc(h * 0.19);
  // Tinggi tagline menentukan posisi pil dan semua baris sosmed di bawahnya;
  // kotak vertikalnya berasal dari metrik berhinting Pillow (metrik-font.ts).
  const tagIm = teksGambar(DPP_TAGLINE, Math.trunc(w * 0.062), [255, 255, 255, 255], true);
  const tagY = by + D + Math.trunc(h * 0.03);
  const pilW = Math.trunc(w * 0.6);
  const pilH = Math.trunc(h * 0.05);
  const [pilIm, pilTitik] = pilDpp(DPP_AJAKAN, pilW, pilH);
  const pilX = bagi(w - pilW, 2);
  const pilY = tagY + tagIm.h + Math.trunc(h * 0.02);
  const ikonS = Math.trunc(w * 0.072);
  const pitch = isi.length <= 4 ? Math.trunc(h * 0.052) : Math.trunc(h * 0.048);
  const barisY0 = pilY + pilH + Math.trunc(h * 0.035);
  const baris = isi.map(([k, v]) => ({
    ik: ikon(k, ikonS, { ikon: "warna" }),
    tx: teksGambar(v, Math.trunc(w * 0.041), [255, 255, 255, 255], false, "poppins-regular"),
  }));
  // Ukuran logo dicache: mengubah ukuran PNG besar tiap frame itu mahal.
  const cacheLogo = new Map<string, Gambar>();
  const logoUkuran = (lebar: number, tinggi: number) => {
    const kw = Math.max(2, lebar);
    const kh = Math.max(2, tinggi);
    const kunci = `${kw}x${kh}`;
    let im = cacheLogo.get(kunci);
    if (!im) {
      im = ubahUkuran(logo, kw, kh, LANCZOS);
      cacheLogo.set(kunci, im);
    }
    return im;
  };
  const total = Math.max(1, Math.trunc(FPS * DPP_DETIK));

  const frameKe = (n: number): Gambar => {
    const t = n / FPS;
    const frame = salin(latarIm);
    gelombangDpp(new Kuas(frame), w, h, t);

    // logo: putaran-balik (lebar mengikuti |cos|) + lentingan ukuran
    if (t >= DPP_T_LOGO) {
      const u = t - DPP_T_LOGO;
      const p = clamp(u / 1.0);
      const sudut = ((1 - halus(clamp(u / 0.3))) * Math.PI) / 2;
      let sk: number;
      if (u < 0.45) sk = 0.2 + 1.15 * halus(u / 0.45);
      else if (u < 0.75) sk = 1.35;
      else sk = 1.35 - 0.35 * halus((u - 0.75) / 0.25);
      sk = Math.max(0.05, sk);
      const tinggiL = Math.trunc(D * sk);
      const lebarL = Math.trunc(D * sk * Math.max(0.04, Math.abs(Math.cos(sudut))));
      const imL = logoUkuran(lebarL, tinggiL);
      const apung = p >= 1 ? Math.trunc(4 * Math.sin(t * 1.6)) : 0;
      tempel(frame, imL, bx + bagi(D - imL.w, 2), by + bagi(D - imL.h, 2) + apung, clamp((t - DPP_T_LOGO) / 0.2));
    }

    // tagline: naik dari bawah sambil memudar masuk
    if (t >= DPP_T_TAGLINE) {
      const a = halus((t - DPP_T_TAGLINE) / 0.35);
      tempel(frame, tagIm, bagi(w - tagIm.w, 2), tagY + Math.trunc(180 * (1 - a)), a);
    }

    // handle: masuk hampir bersamaan dari kiri
    baris.forEach(({ ik, tx }, i) => {
      const mulai = DPP_T_HANDLE + i * 0.06;
      if (t < mulai) return;
      const a = halus((t - mulai) / 0.35);
      const geser = Math.trunc(-50 * (1 - a));
      const y = barisY0 + i * pitch;
      tempel(frame, ik, Math.trunc(w * 0.225) + geser, y, a);
      tempel(frame, tx, Math.trunc(w * 0.325) + geser, y + bagi(ikonS - tx.h, 2), a);
    });

    // pil: cahayanya datang lebih dulu, garis pilnya menyusul
    if (t >= DPP_T_PIL) {
      const aCahaya = halus((t - DPP_T_PIL) / 0.25);
      const aPil = halus((t - DPP_T_PIL - 0.2) / 0.35);
      if (aPil > 0) tempel(frame, pilIm, pilX, pilY, aPil);
      const cahaya = cahayaPilDpp(pilW, pilH, pilTitik, modPy((t - DPP_T_PIL) / 1.6, 1.0));
      tempel(frame, cahaya, pilX, pilY, aCahaya);
    }
    return frame;
  };
  return { w, h, total, frameKe };
}

export async function renderDpp(job: JobRender, folder: string, ev: TandaBatal, lapor: Lapor): Promise<string> {
  const { w, h, total, frameKe } = await siapkanDpp(job);
  const pipa = await alirkan(folder, w, h, total, frameKe, ev, lapor);
  if (pipa.returncode !== 0 || !adaBerkas(pipa.keluaran)) {
    throw new OutroError(`Gagal merender outro DPP: ${sebabMatiDpp(pipa)}`);
  }
  lapor(100);
  return pipa.keluaran;
}

// ------------------------------------------------------------------
//  Audio
// ------------------------------------------------------------------

/** Galat batas waktu subprocess.run (TimeoutExpired Python). */
class TimeoutExpired extends Error {
  constructor(perintah: string[], detik: number) {
    super(`Command '[${perintah.map((a) => `'${a}'`).join(", ")}]' timed out after ${detik} seconds`);
    this.name = "TimeoutExpired";
  }
}

function jalankanFfmpeg(args: string[], batasDetik: number): Promise<{ kode: number; stderr: string }> {
  return new Promise((selesai, gagal) => {
    const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    p.stdout.on("data", () => {});
    p.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    let habis = false;
    const pewaktu = setTimeout(() => {
      habis = true;
      p.kill("SIGKILL");
    }, batasDetik * 1000);
    p.on("error", (e) => {
      clearTimeout(pewaktu);
      gagal(e);
    });
    p.on("close", (kode, sinyal) => {
      clearTimeout(pewaktu);
      if (habis) gagal(new TimeoutExpired([FFMPEG_BIN, ...args], batasDetik));
      else selesai({ kode: kode ?? (sinyal ? -(os.constants.signals[sinyal] ?? 1) : -1), stderr });
    });
  });
}

/** Ekor stderr seperti (hasil.stderr or "").strip()[-200:]. */
const ekor200 = (s: string) => Array.from(s.trim()).slice(-200).join("");

export async function tempelAudio(video: string, folder: string, detik: number): Promise<string> {
  const keluaran = path.join(folder, "outro.mp4");
  if (!adaBerkas(DENTING)) {
    fs.copyFileSync(video, keluaran);
    return keluaran;
  }
  const tunda = Math.trunc(detik * 1000);
  const utas = process.env.VIDEO_THREADS || "1";
  const hasil = await jalankanFfmpeg(
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", utas,
      "-i", video, "-i", DENTING,
      "-filter_complex", `[1:a]adelay=${tunda}|${tunda},apad[a]`,
      "-map", "0:v", "-map", "[a]", "-shortest",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", keluaran,
    ],
    120,
  );
  if (hasil.kode !== 0 || !adaBerkas(keluaran)) {
    console.warn(`audio gagal ditempel, video tanpa audio dipakai: ${ekor200(hasil.stderr)}`);
    fs.copyFileSync(video, keluaran);
  }
  return keluaran;
}

/** Pasang jalur suara outro acuan apa adanya (sudah sejajar dari detik 0). */
export async function tempelAudioDpp(video: string, folder: string): Promise<string> {
  const keluaran = path.join(folder, "outro.mp4");
  if (!adaBerkas(DPP_AUDIO)) {
    fs.copyFileSync(video, keluaran);
    return keluaran;
  }
  const utas = process.env.VIDEO_THREADS || "1";
  const hasil = await jalankanFfmpeg(
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", utas,
      "-i", video, "-i", DPP_AUDIO,
      "-map", "0:v", "-map", "1:a", "-shortest",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", keluaran,
    ],
    120,
  );
  if (hasil.kode !== 0 || !adaBerkas(keluaran)) {
    console.warn(`audio DPP gagal ditempel, video tanpa audio dipakai: ${ekor200(hasil.stderr)}`);
    fs.copyFileSync(video, keluaran);
  }
  return keluaran;
}
export { OutroError, Dibatalkan } from "./galat";
