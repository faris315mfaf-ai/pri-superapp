// ============================================================
// RUMAH BOT (runner) — PEMANEN: daftar video terbaru satu akun sumber lewat
// yt-dlp (--flat-playlist) (13 Okt 2026).
//
// Aturan keras:
//  - handle divalidasi KETAT sebelum spawn (cegah injeksi opsi/shell); proses
//    dijalankan TANPA shell dengan array argumen;
//  - tidak pernah lebih dari SATU yt-dlp berjalan serentak (antrean di sini);
//  - tanpa proxy, rotasi, atau penyamaran. Bila 429/login/"Sign in" terdeteksi,
//    sumber dihentikan dan galatnya dilaporkan; 3 kegagalan beruntun per
//    sumber -> dilewati 1 jam;
//  - proses anak TIDAK mewarisi env runner (tidak membawa BOT_RUNNER_SECRET).
// Hasil ujian lapangan (scripts/spike-pemanen.sh) menentukan bentuk URL profil:
// ubah HANYA tabel PROFIL di bawah.
// ============================================================

import { spawn } from "node:child_process";
import type { KandidatMasuk, LaporanRunner, SumberPanen } from "../lib/bot-protokol";
import { pesanGalat } from "./galat";

// ---- Konfigurasi profil per platform (SATU tempat) ----

type Profil = {
  /** Membangun URL profil dari handle yang sudah tervalidasi (tanpa @ di depan). */
  urlProfil: (handleTanpaAt: string) => string | null;
  /** Membangun URL video penuh dari id (bila yt-dlp hanya memberi id). */
  urlVideo: (id: string, handleTanpaAt: string) => string | null;
};

const ID_YT = /^[A-Za-z0-9_-]{11}$/;
const ID_KANAL_YT = /^UC[A-Za-z0-9_-]{22}$/;
const ID_ANGKA = /^\d{5,25}$/;
const ID_IG = /^[A-Za-z0-9_-]{5,20}$/;

export const PROFIL: Record<string, Profil> = {
  instagram: {
    urlProfil: (h) => `https://www.instagram.com/${h}/`,
    urlVideo: (id) => (ID_IG.test(id) ? `https://www.instagram.com/p/${id}/` : null),
  },
  tiktok: {
    urlProfil: (h) => `https://www.tiktok.com/@${h}`,
    urlVideo: (id, h) => (ID_ANGKA.test(id) ? `https://www.tiktok.com/@${h}/video/${id}` : null),
  },
  youtube: {
    // Kanal: @handle atau id kanal UC...; tab /videos agar yang terdaftar video, bukan tab.
    urlProfil: (h) => (ID_KANAL_YT.test(h) ? `https://www.youtube.com/channel/${h}/videos` : `https://www.youtube.com/@${h}/videos`),
    urlVideo: (id) => (ID_YT.test(id) ? `https://www.youtube.com/watch?v=${id}` : null),
  },
};

const ALIAS_PLATFORM: Record<string, string> = { ig: "instagram", yt: "youtube", tt: "tiktok" };

export function normalkanPlatform(p: string): string {
  const k = String(p ?? "").trim().toLowerCase();
  return ALIAS_PLATFORM[k] ?? k;
}

// ---- Validasi ----

const POLA_HANDLE = /^[A-Za-z0-9._@-]{2,64}$/;

/**
 * Handle sah: karakter terbatas, tidak diawali '-', tanpa '..', dan '@' hanya
 * boleh di posisi pertama. Mencegah injeksi opsi yt-dlp (mis. "--exec=...").
 */
export function handleSah(handle: string): boolean {
  if (typeof handle !== "string" || !POLA_HANDLE.test(handle)) return false;
  if (handle.startsWith("-") || handle.includes("..")) return false;
  if (handle.lastIndexOf("@") > 0) return false;
  return true;
}

/** URL profil, atau null bila platform/handle tidak sah. */
export function bangunUrlProfil(platform: string, handle: string): string | null {
  const p = PROFIL[normalkanPlatform(platform)];
  if (!p || !handleSah(handle)) return null;
  const at = handle.startsWith("@");
  const bersih = at ? handle.slice(1) : handle;
  if (bersih.length < 1 || bersih.startsWith(".") || bersih.startsWith("-")) return null;
  return p.urlProfil(bersih);
}

// ---- Parse keluaran yt-dlp ----

const MAKS_JUDUL = 120;
const MAKS_CAPTION = 300;
const MAKS_URL = 500;

const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const angka = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
const teks = (x: unknown): string => (typeof x === "string" ? x : "");

function bersihkan(t: string, maks: number): string {
  // Buang karakter kendali; rapikan spasi.
  return t.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maks);
}

/** timestamp (detik epoch) atau upload_date (YYYYMMDD) -> ISO 8601, atau null. */
export function waktuTerbit(timestamp: unknown, uploadDate: unknown): string | null {
  const ts = angka(timestamp);
  if (ts !== null && ts > 946_684_800 && ts < 4_102_444_800) return new Date(ts * 1000).toISOString();
  const d = teks(uploadDate);
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(d);
  if (m) {
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return null;
}

export type HasilParse = { kandidat: KandidatMasuk[]; barisRusak: number };

/**
 * Mengubah keluaran `--dump-json` (satu objek JSON per baris) menjadi kandidat.
 * Baris yang bukan JSON / bukan video dilewati; `maks` membatasi jumlah.
 * `platform` & `handle` dipakai untuk membangun URL penuh bila yt-dlp hanya memberi id.
 */
export function parseKeluaranYtdlp(keluaran: string, platform: string, handle: string, maks = 10): HasilParse {
  const kandidat: KandidatMasuk[] = [];
  const lihat = new Set<string>();
  let rusak = 0;
  const profil = PROFIL[normalkanPlatform(platform)];
  const handleBersih = handle.startsWith("@") ? handle.slice(1) : handle;
  for (const baris of keluaran.split("\n")) {
    if (kandidat.length >= maks) break;
    const b = baris.trim();
    if (!b) continue;
    let o: unknown;
    try {
      o = JSON.parse(b);
    } catch {
      rusak++;
      continue;
    }
    if (!adalahObjek(o)) {
      rusak++;
      continue;
    }
    // Entri yang sebenarnya daftar (tab kanal/playlist) bukan video.
    if (o._type === "playlist") continue;

    let url = "";
    for (const c of [teks(o.webpage_url), teks(o.url)]) {
      if (/^https?:\/\//i.test(c) && c.length <= MAKS_URL) {
        url = c;
        break;
      }
    }
    if (!url) {
      const id = teks(o.id);
      const pembuat = profil?.urlVideo;
      const uploader = teks(o.uploader_id).replace(/^@/, "");
      const dibangun = id && pembuat ? pembuat(id, handleSah(uploader) ? uploader : handleBersih) : null;
      if (dibangun) url = dibangun;
    }
    if (!url || lihat.has(url)) continue;
    lihat.add(url);
    const caption = teks(o.description);
    const judul = teks(o.title);
    kandidat.push({
      url,
      judul: bersihkan(judul || caption, MAKS_JUDUL),
      caption: bersihkan(caption, MAKS_CAPTION),
      durasi_detik: angka(o.duration) !== null ? Math.round(angka(o.duration)!) : null,
      tayangan: angka(o.view_count) !== null ? Math.round(angka(o.view_count)!) : null,
      waktu_terbit: waktuTerbit(o.timestamp, o.upload_date),
    });
  }
  return { kandidat, barisRusak: rusak };
}

// ---- Deteksi pembatasan ----

export type JenisGalat = "dibatasi" | "login";

const POLA_DIBATASI = /HTTP Error 429|\b429\b.{0,30}(too many|rate)|too many requests|rate[-\s]?limit/i;
const POLA_LOGIN = /sign in|log ?in (is )?required|login required|requires? (a )?log ?in|use --cookies|cookies? (are |is )?(needed|required)|confirm you.?re not a bot|checkpoint required/i;

/** Membaca stderr/stdout yt-dlp: apakah tanda pembatasan laju atau tuntutan login? */
export function deteksiPembatasan(teksGalat: string): JenisGalat | null {
  if (POLA_DIBATASI.test(teksGalat)) return "dibatasi";
  if (POLA_LOGIN.test(teksGalat)) return "login";
  return null;
}

// ---- Proses ----

export type HasilProses = {
  kode: number | null;
  stdout: string;
  stderr: string;
  waktuHabis: boolean;
  terpotong: boolean;
};

export type OpsiProses = { batasMs: number; maksByte: number };
export type JalankanProses = (bin: string, args: string[], opsi: OpsiProses) => Promise<HasilProses>;

const MAKS_STDERR = 64 * 1024;

/** Menjalankan proses TANPA shell, env minimal, dengan batas waktu & ukuran keluaran. */
export const jalankanProsesNyata: JalankanProses = (bin, args, opsi) =>
  new Promise((selesai) => {
    // Cast: tipe ProcessEnv dari Next mewajibkan NODE_ENV; env anak sengaja minimal.
    const env = {} as NodeJS.ProcessEnv;
    for (const k of ["PATH", "HOME", "LANG", "TMPDIR", "TZ"]) if (process.env[k]) env[k] = process.env[k]!;
    let anak;
    try {
      anak = spawn(bin, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env, detached: true });
    } catch (e) {
      selesai({ kode: null, stdout: "", stderr: pesanGalat(e), waktuHabis: false, terpotong: false });
      return;
    }
    let out = "";
    let err = "";
    let waktuHabis = false;
    let terpotong = false;
    let usai = false;
    const bunuh = () => {
      try {
        if (anak.pid) process.kill(-anak.pid, "SIGKILL");
      } catch {
        try {
          anak.kill("SIGKILL");
        } catch {}
      }
    };
    const pewaktu = setTimeout(() => {
      waktuHabis = true;
      bunuh();
    }, opsi.batasMs);
    anak.stdout.setEncoding("utf8");
    anak.stderr.setEncoding("utf8");
    anak.stdout.on("data", (c: string) => {
      if (out.length + c.length > opsi.maksByte) {
        terpotong = true;
        out += c.slice(0, Math.max(0, opsi.maksByte - out.length));
        bunuh();
        return;
      }
      out += c;
    });
    anak.stderr.on("data", (c: string) => {
      if (err.length < MAKS_STDERR) err += c.slice(0, MAKS_STDERR - err.length);
    });
    const akhiri = (kode: number | null) => {
      if (usai) return;
      usai = true;
      clearTimeout(pewaktu);
      selesai({ kode, stdout: out, stderr: err, waktuHabis, terpotong });
    };
    anak.on("error", (e) => {
      err += `\n${pesanGalat(e)}`;
      akhiri(null);
    });
    anak.on("close", (kode) => akhiri(kode));
  });

// ---- Pemanen ----

export type OpsiPemanen = {
  ytdlpBin: string;
  cookiesFile: string | null;
  jalankan?: JalankanProses;
  sekarang?: () => number;
  batasMs?: number;
  maksByte?: number;
  maksItem?: number;
  /** Kegagalan beruntun sebelum sumber dilewati. */
  ambangGagal?: number;
  /** Lama dilewati (ms). */
  jedaLewatiMs?: number;
};

export type JenisHasil = "ok" | "handle_tak_sah" | "dibatasi" | "login" | "waktu_habis" | "gagal" | "dilewati";

export type HasilPanen = { kandidat: KandidatMasuk[]; galat?: string; jenis: JenisHasil };

export class Pemanen {
  private readonly jalankan: JalankanProses;
  private readonly sekarang: () => number;
  private readonly batasMs: number;
  private readonly maksByte: number;
  private readonly maksItem: number;
  private readonly ambang: number;
  private readonly jedaLewati: number;
  private rantai: Promise<unknown> = Promise.resolve();
  private readonly gagalBeruntun = new Map<string, { n: number; sampai: number }>();

  constructor(private readonly opsi: OpsiPemanen) {
    this.jalankan = opsi.jalankan ?? jalankanProsesNyata;
    this.sekarang = opsi.sekarang ?? Date.now;
    this.batasMs = opsi.batasMs ?? 90_000;
    this.maksByte = opsi.maksByte ?? 2 * 1024 * 1024;
    this.maksItem = opsi.maksItem ?? 10;
    this.ambang = opsi.ambangGagal ?? 3;
    this.jedaLewati = opsi.jedaLewatiMs ?? 60 * 60 * 1000;
  }

  /** Argumen yt-dlp (array; TANPA shell). Dipisah agar bisa diuji. */
  argumen(url: string): string[] {
    const a = [
      "--flat-playlist",
      "--dump-json",
      "--playlist-end",
      String(this.maksItem),
      "--no-warnings",
      "--socket-timeout",
      "20",
      "--ignore-no-formats-error",
    ];
    if (this.opsi.cookiesFile) a.push("--cookies", this.opsi.cookiesFile);
    a.push(url);
    return a;
  }

  /** Antre: hanya satu yt-dlp berjalan pada satu waktu. */
  private giliran<T>(kerja: () => Promise<T>): Promise<T> {
    const hasil = this.rantai.then(kerja, kerja);
    this.rantai = hasil.catch(() => undefined);
    return hasil;
  }

  async panen(s: SumberPanen): Promise<HasilPanen> {
    const url = bangunUrlProfil(s.platform, s.handle);
    if (!url) return { kandidat: [], jenis: "handle_tak_sah", galat: "platform atau handle sumber tidak sah (tidak dijalankan)" };
    const kunci = `${normalkanPlatform(s.platform)}:${s.handle.toLowerCase()}`;
    return this.giliran(async () => {
      const catatan = this.gagalBeruntun.get(kunci);
      if (catatan && catatan.n >= this.ambang) {
        if (this.sekarang() < catatan.sampai) {
          const menit = Math.ceil((catatan.sampai - this.sekarang()) / 60_000);
          return { kandidat: [], jenis: "dilewati" as const, galat: `sumber dilewati (${catatan.n} kegagalan beruntun), dicoba lagi ±${menit} menit lagi` };
        }
        // Masa lewati habis: beri satu kesempatan lagi.
        this.gagalBeruntun.delete(kunci);
      }
      const hasil = await this.jalankan(this.opsi.ytdlpBin, this.argumen(url), { batasMs: this.batasMs, maksByte: this.maksByte });
      return this.nilai(kunci, s, hasil);
    });
  }

  private nilai(kunci: string, s: SumberPanen, h: HasilProses): HasilPanen {
    // Potongan terakhir bisa baris setengah jadi saat dipotong/dibunuh: buang.
    const bersih = h.terpotong || h.waktuHabis ? h.stdout.slice(0, h.stdout.lastIndexOf("\n") + 1) : h.stdout;
    const { kandidat } = parseKeluaranYtdlp(bersih, s.platform, s.handle, this.maksItem);
    const gejala = deteksiPembatasan(`${h.stderr}\n${kandidat.length === 0 ? h.stdout.slice(0, 2000) : ""}`);
    const berhasil = kandidat.length > 0 || (h.kode === 0 && !h.waktuHabis);
    if (berhasil && !gejala) {
      this.gagalBeruntun.delete(kunci);
      return { kandidat, jenis: "ok" };
    }
    const lama = this.gagalBeruntun.get(kunci)?.n ?? 0;
    const n = lama + 1;
    this.gagalBeruntun.set(kunci, { n, sampai: this.sekarang() + this.jedaLewati });
    if (gejala && kandidat.length === 0) {
      return {
        kandidat: [],
        jenis: gejala,
        galat: gejala === "dibatasi" ? "dibatasi platform (429/rate-limit); sumber dihentikan" : "platform meminta login/cookies; sumber dihentikan",
      };
    }
    if (kandidat.length > 0) {
      // Ada hasil sebagian, tetapi ada gejala pembatasan: pakai hasilnya, tetap catat sebagai kegagalan.
      return { kandidat, jenis: gejala ?? "gagal", galat: "hasil sebagian; platform menunjukkan pembatasan" };
    }
    if (h.waktuHabis) return { kandidat: [], jenis: "waktu_habis", galat: `yt-dlp melewati batas waktu ${Math.round(this.batasMs / 1000)} detik` };
    const baris = h.stderr.split("\n").map((x) => x.trim()).filter(Boolean).pop() ?? "";
    return { kandidat: [], jenis: "gagal", galat: `yt-dlp gagal (kode ${h.kode ?? "?"}): ${bersihkan(baris, 160)}` };
  }
}

// ---- Laporan ----

const MAKS_LAPORAN_KARAKTER = 7000;

/**
 * Membentuk laporan `kandidat` yang muat dalam batas badan permintaan aplikasi
 * (saat ini 8 KB): caption dipersingkat bertahap, lalu kandidat terlama dibuang.
 */
export function bentukLaporanKandidat(sumberId: number, kandidat: KandidatMasuk[], galat?: string, maksKarakter = MAKS_LAPORAN_KARAKTER): LaporanRunner {
  const g = galat ? { galat: bersihkan(galat, 200) } : {};
  let daftar = kandidat.slice(0, 40).map((k) => ({ ...k }));
  const ukuran = () => JSON.stringify({ aksi: "lapor", bot_id: 999999, laporan: { jenis: "kandidat", sumber_id: sumberId, kandidat: daftar, ...g } }).length;
  for (const batasCaption of [MAKS_CAPTION, 150, 60, 0]) {
    daftar = daftar.map((k) => ({ ...k, caption: k.caption.slice(0, batasCaption) }));
    if (ukuran() <= maksKarakter) break;
  }
  while (daftar.length > 0 && ukuran() > maksKarakter) daftar = daftar.slice(0, -1);
  return { jenis: "kandidat", sumber_id: sumberId, kandidat: daftar, ...g };
}
