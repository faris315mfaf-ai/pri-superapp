// Pemeriksaan & perapian berkas media — cermin probe/_punya_alpha/_aset_ringan
// di video_edit.py serta _rapikan_video dan separuh-video _pastikan_isi_media
// di video_api.py.
//
// Bagian atas berkas ini berisi pembantu "setara Python": format angka, potong
// teks, kebenaran (truthiness), int()/float(). Alasannya: argumen ffmpeg dan
// pesan galat harus SAMA PERSIS dengan versi Python (keduanya bergantian
// memakai disk & antrean yang sama, dan uji kesetaraan membandingkan
// argumennya karakter demi karakter). JS memformat angka berbeda: toFixed
// membulatkan setengah ke atas (Python: setengah ke genap), String(2.0) = "2"
// (Python: "2.0"), dan trim() memakai daftar spasi yang lain.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BATAS_FRAME_MB, FFMPEG_BIN, FFPROBE_BIN, VIDEO_THREADS } from "./konfig";
import { pastikanIsiGambar } from "./gambar";
import { GalatVideo } from "./jenis";

// ============================================================
//  PEMBANTU SETARA PYTHON
// ============================================================

/** Karakter yang dianggap spasi oleh str.strip()/str.isspace() Python. */
const SPASI_PY = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const AWAL_SPASI = new RegExp(`^[${SPASI_PY}]+`);
const AKHIR_SPASI = new RegExp(`[${SPASI_PY}]+$`);

/** str.strip() Python. Beda dengan trim(): BOM (U+FEFF) bukan spasi, \x1c-\x1f dan \x85 spasi. */
export function pyStrip(s: string): string {
  return s.replace(AWAL_SPASI, "").replace(AKHIR_SPASI, "");
}

const KELAS_BARIS = "[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]";
const PEMISAH_BARIS = new RegExp(`\r\n|${KELAS_BARIS}`);
const AKHIR_BARIS = new RegExp(`(\r\n|${KELAS_BARIS})$`);

/** str.splitlines() Python: pemisahnya lebih banyak dari "\n", tanpa potongan kosong di ujung. */
export function pySplitLines(s: string): string[] {
  if (!s) return [];
  const bagian = s.split(PEMISAH_BARIS);
  if (AKHIR_BARIS.test(s)) bagian.pop();
  return bagian;
}

/** s[:n] Python — dihitung per code point, bukan per unit UTF-16. */
export function potongPy(s: string, n: number): string {
  const huruf = Array.from(s);
  return huruf.length <= n ? s : huruf.slice(0, n).join("");
}

/** bool(nilai) Python: dict/list kosong juga dianggap salah. */
export function pyTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  // bool(nan) Python = True, jadi cukup dibandingkan dengan nol.
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
}

/** `a or b` Python. */
export function pyOr<A, B>(a: A, b: B): A | B {
  return pyTruthy(a) ? a : b;
}

/** isinstance(nilai, dict). */
export function adalahDict(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** dict.get(kunci) — hanya milik sendiri, jadi "constructor" tidak ikut terbaca dari prototipe. */
export function ambil(obj: unknown, kunci: string): unknown {
  return adalahDict(obj) && Object.prototype.hasOwnProperty.call(obj, kunci) ? obj[kunci] : undefined;
}

/** Digit desimal versi Python (shortest round-trip) dari String(x) JS. */
function digitDanTitik(x: number): { digit: string; titik: number } {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(Math.abs(x)));
  if (!m) throw new Error(`angka tak terduga: ${x}`);
  let digit = m[1] + (m[2] ?? "");
  let titik = m[1].length + Number(m[3] ?? 0);
  const nolDepan = /^0*/.exec(digit)![0].length;
  digit = digit.slice(nolDepan);
  titik -= nolDepan;
  digit = digit.replace(/0+$/, "");
  return { digit: digit || "0", titik };
}

/** repr(float) / str(float) Python: 2.0 → "2.0", 1e16 → "1e+16", 1e-05 → "1e-05". */
export function pyFloatRepr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const tanda = x < 0 ? "-" : "";
  const { digit, titik } = digitDanTitik(x);
  let hasil: string;
  if (titik > -4 && titik <= 16) {
    if (titik <= 0) hasil = `0.${"0".repeat(-titik)}${digit}`;
    else if (titik >= digit.length) hasil = `${digit}${"0".repeat(titik - digit.length)}.0`;
    else hasil = `${digit.slice(0, titik)}.${digit.slice(titik)}`;
  } else {
    const e = titik - 1;
    const mantisa = digit.length > 1 ? `${digit[0]}.${digit.slice(1)}` : digit;
    hasil = `${mantisa}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
  }
  return tanda + hasil;
}

/** Nilai pasti sebuah double: mantisa × 2^pangkat (keduanya bilangan bulat). */
function uraiDouble(x: number): { mantisa: bigint; pangkat: number } {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(x));
  const tinggi = dv.getUint32(0);
  const rendah = dv.getUint32(4);
  const eksp = (tinggi >>> 20) & 0x7ff;
  let mantisa = (BigInt(tinggi & 0xfffff) << BigInt(32)) | BigInt(rendah);
  if (eksp === 0) return { mantisa, pangkat: -1074 };
  mantisa |= BigInt(1) << BigInt(52);
  return { mantisa, pangkat: eksp - 1075 };
}

/**
 * f"{x:.{d}f}" Python, tepat sampai digit terakhir. toFixed() membulatkan
 * kasus tepat-setengah ke atas, Python ke genap: 630 detik / 60 = 10.5 menit
 * tertulis "10" di Python, "11" lewat toFixed. Hitungan memakai BigInt atas
 * nilai biner pastinya supaya tidak ada pembulatan ganda.
 */
export function formatF(x: number, d: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  const negatif = x < 0 || Object.is(x, -0);
  const { mantisa, pangkat } = uraiDouble(x);
  const skala = BigInt(10) ** BigInt(d);
  let n: bigint;
  if (pangkat >= 0) {
    n = (mantisa << BigInt(pangkat)) * skala;
  } else {
    const pembilang = mantisa * skala;
    const penyebut = BigInt(1) << BigInt(-pangkat);
    n = pembilang / penyebut;
    const sisa2 = (pembilang % penyebut) * BigInt(2);
    if (sisa2 > penyebut || (sisa2 === penyebut && n % BigInt(2) === BigInt(1))) n += BigInt(1);
  }
  let s = n.toString();
  if (d > 0) {
    s = s.padStart(d + 1, "0");
    s = `${s.slice(0, -d)}.${s.slice(-d)}`;
  }
  return (negatif ? "-" : "") + s;
}

/** round(x) Python tanpa ndigits: bilangan bulat, setengah dibulatkan ke genap. */
export function pyRound(x: number): number {
  if (!Number.isFinite(x)) throw new Error(`cannot convert float ${Number.isNaN(x) ? "NaN" : "infinity"} to integer`);
  const bawah = Math.floor(x);
  const selisih = x - bawah;
  if (selisih < 0.5) return bawah;
  if (selisih > 0.5) return bawah + 1;
  return bawah % 2 === 0 ? bawah : bawah + 1;
}

/** a % b Python (hasil ikut tanda pembagi). */
export function pyMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

const POLA_INT_PY = /^[+-]?\d(?:_?\d)*$/;
const POLA_FLOAT_PY =
  /^[+-]?(?:(?:\d(?:_?\d)*)?\.?\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?|\d(?:_?\d)*\.(?:[eE][+-]?\d(?:_?\d)*)?|inf(?:inity)?|nan)$/i;

/** int(nilai) Python: memotong pecahan, menerima teks bilangan bulat saja. */
export function pyInt(v: unknown): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") {
    if (Number.isNaN(v)) throw new Error("cannot convert float NaN to integer");
    if (!Number.isFinite(v)) throw new Error("cannot convert float infinity to integer");
    return Math.trunc(v) || 0;
  }
  if (typeof v === "string") {
    const t = pyStrip(v);
    if (!POLA_INT_PY.test(t)) throw new Error(`invalid literal for int() with base 10: ${pyRepr(v)}`);
    return Number(t.replace(/_/g, ""));
  }
  throw new Error(`int() argument must be a string, a bytes-like object or a real number, not '${namaJenisPy(v)}'`);
}

/** float(nilai) Python. */
export function pyFloat(v: unknown): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = pyStrip(v);
    if (!POLA_FLOAT_PY.test(t)) throw new Error(`could not convert string to float: ${pyRepr(v)}`);
    const bersih = t.replace(/_/g, "").toLowerCase();
    const negatif = bersih.startsWith("-");
    const inti = bersih.replace(/^[+-]/, "");
    if (inti.startsWith("inf")) return negatif ? -Infinity : Infinity;
    if (inti === "nan") return NaN;
    return Number(bersih);
  }
  throw new Error(`float() argument must be a string or a real number, not '${namaJenisPy(v)}'`);
}

function namaJenisPy(v: unknown): string {
  if (v === null || v === undefined) return "NoneType";
  if (Array.isArray(v)) return "list";
  if (typeof v === "object") return "dict";
  return typeof v;
}

/** Angka bulat tanpa notasi ilmiah (str(int) Python), juga untuk angka raksasa. */
export function teksBulat(n: number): string {
  return BigInt(Math.trunc(n)).toString();
}

const TAK_TERCETAK = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

/** repr(str) Python — dipakai pesan galat yang menampilkan nilai crop. */
export function pyRepr(s: string): string {
  const kutip = s.includes("'") && !s.includes('"') ? '"' : "'";
  let hasil = kutip;
  for (const c of s) {
    if (c === "\\") hasil += "\\\\";
    else if (c === kutip) hasil += `\\${c}`;
    else if (c === "\n") hasil += "\\n";
    else if (c === "\r") hasil += "\\r";
    else if (c === "\t") hasil += "\\t";
    else if (c !== " " && TAK_TERCETAK.test(c)) {
      const kode = c.codePointAt(0)!;
      if (kode < 0x100) hasil += `\\x${kode.toString(16).padStart(2, "0")}`;
      else if (kode < 0x10000) hasil += `\\u${kode.toString(16).padStart(4, "0")}`;
      else hasil += `\\U${kode.toString(16).padStart(8, "0")}`;
    } else hasil += c;
  }
  return hasil + kutip;
}

/** str(nilai) Python untuk nilai dari JSON (None/True/1080/1.5/teks). */
export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return Number.isInteger(v) && Math.abs(v) < 1e16 ? teksBulat(v) : pyFloatRepr(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

// ============================================================
//  MENJALANKAN PROSES (subprocess.run)
// ============================================================

/** subprocess.TimeoutExpired — sengaja BUKAN GalatVideo, sama seperti di Python. */
export class WaktuHabis extends Error {
  constructor(perintah: readonly string[], detik: number) {
    super(`Command '${perintah.join(" ")}' timed out after ${pyFloatRepr(detik)} seconds`);
    this.name = "WaktuHabis";
  }
}

export type HasilProses = { returncode: number; stdout: string; stderr: string };

/** Kode keluar gaya Python: proses yang ditembak sinyal = -nomor sinyal (SIGKILL → -9). */
export function kodeKeluar(kode: number | null, sinyal: NodeJS.Signals | null): number {
  if (kode !== null) return kode;
  const nomor = sinyal ? (os.constants.signals as Record<string, number>)[sinyal] : undefined;
  return nomor ? -nomor : -1;
}

/**
 * subprocess.run(..., capture_output=True, text=True, timeout=...). Lewat batas
 * waktu → anak ditembak lalu WaktuHabis dilempar; program tak ada → galat
 * ENOENT dilempar apa adanya (FileNotFoundError di Python).
 */
export function jalankanProses(perintah: readonly string[], batasDetik?: number | null): Promise<HasilProses> {
  return new Promise((selesai, gagal) => {
    let anak;
    try {
      anak = spawn(perintah[0], perintah.slice(1), { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      gagal(e);
      return;
    }
    const keluar: Buffer[] = [];
    const galat: Buffer[] = [];
    let habis = false;
    let galatSpawn: Error | null = null;
    anak.stdout.on("data", (b: Buffer) => keluar.push(b));
    anak.stderr.on("data", (b: Buffer) => galat.push(b));
    const pengatur =
      batasDetik !== undefined && batasDetik !== null
        ? setTimeout(() => {
            habis = true;
            anak.kill("SIGKILL");
          }, Math.max(0, batasDetik * 1000))
        : null;
    anak.on("error", (e) => {
      galatSpawn = e;
    });
    anak.on("close", (kode, sinyal) => {
      if (pengatur) clearTimeout(pengatur);
      if (galatSpawn) return gagal(galatSpawn);
      if (habis) return gagal(new WaktuHabis(perintah, batasDetik ?? 0));
      selesai({
        returncode: kodeKeluar(kode, sinyal),
        stdout: Buffer.concat(keluar).toString("utf8"),
        stderr: Buffer.concat(galat).toString("utf8"),
      });
    });
  });
}

/** `except (OSError, subprocess.TimeoutExpired)` Python. */
export function galatOsAtauWaktu(e: unknown): boolean {
  return e instanceof WaktuHabis || (e instanceof Error && typeof (e as NodeJS.ErrnoException).code === "string");
}

/** Pencatat sisi server (logger Python). Bukan bagian dari keluaran yang diuji. */
export const pencatat = {
  info: (pesan: string) => console.info(`[mesin-video] ${pesan}`),
  warning: (pesan: string) => console.warn(`[mesin-video] ${pesan}`),
};

/** Path.suffix Python: ".mp4" dari "a.mp4"; berkas tersembunyi ".mp4" tanpa akhiran. */
export function akhiran(berkas: string): string {
  const nama = path.basename(berkas);
  const titik = nama.lastIndexOf(".");
  if (titik <= 0 || titik === nama.length - 1) return "";
  return nama.slice(titik);
}

/** Path.stem Python. */
export function batang(berkas: string): string {
  const nama = path.basename(berkas);
  const ak = akhiran(nama);
  return ak ? nama.slice(0, -ak.length) : nama;
}

export function adalahBerkas(berkas: string): boolean {
  try {
    return fs.statSync(berkas).isFile();
  } catch {
    return false;
  }
}

/** unlink(missing_ok=True). */
export function hapusBerkas(berkas: string): void {
  try {
    fs.unlinkSync(berkas);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

// ============================================================
//  PERIKSA BERKAS VIDEO
// ============================================================

export type InfoMedia = { duration: number; width: number; height: number; has_audio: boolean };

type StreamProbe = { codec_type?: unknown; width?: unknown; height?: unknown };

/** Baca durasi, ukuran, dan ada-tidaknya audio dari sebuah berkas. */
export async function probe(berkas: string): Promise<InfoMedia> {
  const hasil = await jalankanProses(
    [
      FFPROBE_BIN, "-v", "error",
      "-show_entries", "format=duration",
      "-show_entries", "stream=codec_type,width,height",
      "-of", "json", berkas,
    ],
    60,
  );
  if (hasil.returncode !== 0) {
    throw new GalatVideo(`Tidak bisa membaca video: ${potongPy(pyStrip(hasil.stderr), 200)}`);
  }
  const data: unknown = JSON.parse(hasil.stdout || "{}");
  const mentah = pyOr(ambil(data, "streams"), []);
  const streams: StreamProbe[] = Array.isArray(mentah) ? (mentah as StreamProbe[]) : [];
  const video = streams.find((s) => ambil(s, "codec_type") === "video") ?? {};
  let durasi: number;
  try {
    durasi = pyFloat(pyOr(ambil(pyOr(ambil(data, "format"), {}), "duration"), 0.0));
  } catch {
    durasi = 0.0;
  }
  return {
    duration: durasi,
    width: pyInt(pyOr(ambil(video, "width"), 0)),
    height: pyInt(pyOr(ambil(video, "height"), 0)),
    has_audio: streams.some((s) => ambil(s, "codec_type") === "audio"),
  };
}

/** True kalau berkas videonya menyimpan lapisan transparan. */
export async function punyaAlpha(berkas: string): Promise<boolean> {
  const hasil = await jalankanProses([
    FFPROBE_BIN, "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=pix_fmt", "-of", "default=nw=1:nk=1", berkas,
  ]);
  const px = pyStrip(hasil.stdout || "").toLowerCase();
  return ["yuva", "rgba", "argb", "bgra", "abgr"].some((a) => px.startsWith(a)) || px.endsWith("a");
}

// Aset video yang jauh lebih besar dari tempat ia digambar. Satu frame
// ProRes 1920x1080 12-bit berisi 16 MB, dan ffmpeg menahan belasan frame
// sekaligus di rantai filternya - padahal stikernya cuma digambar 280x158.
const VIDEO_EXT = new Set([".mov", ".mp4", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg"]);

/**
 * Kecilkan aset video yang kelewat besar untuk tempat ia digambar. Yang
 * dihemat MEMORI ffmpeg (frame setelah dibuka), bukan disk. Hasilnya disimpan
 * di folder ".ringan" di sebelah aset asli dengan nama yang ikut ukuran
 * berkas asli, jadi cukup sekali untuk semua render dan aset yang diganti
 * tidak memakai hasil kecil yang lama.
 */
export async function asetRingan(berkas: string, lebarPakai: number, tinggiPakai: number): Promise<string> {
  if (!VIDEO_EXT.has(akhiran(berkas).toLowerCase())) return berkas;
  let info: InfoMedia;
  try {
    info = await probe(berkas);
  } catch (e) {
    if (e instanceof GalatVideo) return berkas;
    throw e;
  }
  const asalW = pyInt(pyOr(info.width, 0));
  const asalH = pyInt(pyOr(info.height, 0));
  if (asalW <= 0 || asalH <= 0) return berkas;
  if ((asalW * asalH * 4) / 1_048_576 <= BATAS_FRAME_MB) return berkas; // framenya memang kecil

  // Ukuran tujuan: yang tidak disebut dihitung dari rasio aslinya.
  if (lebarPakai && !tinggiPakai) tinggiPakai = Math.max(2, pyRound((lebarPakai * asalH) / asalW));
  else if (tinggiPakai && !lebarPakai) lebarPakai = Math.max(2, pyRound((tinggiPakai * asalW) / asalH));
  if (!lebarPakai || !tinggiPakai) return berkas;
  lebarPakai -= pyMod(lebarPakai, 2);
  tinggiPakai -= pyMod(tinggiPakai, 2);
  if (lebarPakai >= asalW || tinggiPakai >= asalH) return berkas; // tidak ada yang bisa dikecilkan

  const folder = path.join(path.dirname(berkas), ".ringan");
  try {
    fs.mkdirSync(folder, { recursive: true });
  } catch {
    return berkas;
  }
  const alpha = await punyaAlpha(berkas);
  let tanda: number;
  try {
    tanda = fs.statSync(berkas).size;
  } catch {
    return berkas;
  }
  const tujuan = path.join(folder, `${batang(berkas)}-${lebarPakai}x${tinggiPakai}-${tanda}${alpha ? ".mov" : ".mp4"}`);
  if (adalahBerkas(tujuan)) return tujuan;

  // qtrle satu-satunya penyandi beralpha yang pasti ada di ffmpeg mana pun;
  // berkasnya besar tapi ini hanya singgahan.
  const sandi = alpha
    ? ["-c:v", "qtrle", "-pix_fmt", "argb"]
    : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"];
  const perintah = [
    FFMPEG_BIN, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-threads", "1", "-i", berkas,
    "-vf", `scale=${lebarPakai}:${tinggiPakai}`, ...sandi,
    "-c:a", "copy", tujuan,
  ];
  let hasil: HasilProses;
  try {
    hasil = await jalankanProses(perintah, 600);
  } catch (e) {
    if (!galatOsAtauWaktu(e)) throw e;
    pencatat.warning(`Aset ${path.basename(berkas)} gagal dikecilkan: ${e instanceof Error ? e.message : e}`);
    return berkas;
  }
  if (hasil.returncode !== 0 || !adalahBerkas(tujuan)) {
    const ekor = pySplitLines(pyStrip(hasil.stderr || "")).slice(-1);
    pencatat.warning(`Aset ${path.basename(berkas)} gagal dikecilkan: ${ekor.length ? ekor[0] : "tanpa pesan"}`);
    hapusBerkas(tujuan);
    return berkas;
  }
  pencatat.info(
    `Aset ${path.basename(berkas)} dikecilkan ${asalW}x${asalH} -> ${lebarPakai}x${tinggiPakai} supaya hemat memori`,
  );
  return tujuan;
}

// ============================================================
//  PERAPIAN VIDEO UNGGAHAN (video_api.py)
// ============================================================

function angkaEnv(nama: string, bawaan: number): number {
  const nilai = Number.parseInt(process.env[nama] ?? "", 10);
  return Number.isFinite(nilai) ? nilai : bawaan;
}

// Berlaku untuk video layer, intro, dan outro: berkas 4K pada kanvas 720x1280
// memaksa ffmpeg membongkar frame raksasa yang langsung dibuang lagi.
export const MAX_SISI_VIDEO = angkaEnv("VIDEO_MAX_VIDEO_SIDE", 1920);
export const JENIS_VIDEO: ReadonlySet<string> = new Set([".mp4", ".mov", ".m4v", ".webm"]);

/**
 * Perkecil video layer/outro yang resolusinya jauh di atas kanvas. Hanya
 * sekali saat diunggah, jadi setiap render sesudahnya ikut lebih ringan.
 * Mengembalikan ukuran berkas baru, atau null kalau tidak berubah.
 */
export async function rapikanVideo(berkas: string): Promise<number | null> {
  if (!JENIS_VIDEO.has(akhiran(berkas).toLowerCase())) return null;
  let info: InfoMedia;
  try {
    info = await probe(berkas);
  } catch (e) {
    if (!(e instanceof GalatVideo)) throw e;
    pencatat.warning(`Video ${path.basename(berkas)} tidak bisa dibaca: ${e.message}`);
    return null;
  }
  const lebar = pyInt(pyOr(info.width, 0));
  const tinggi = pyInt(pyOr(info.height, 0));
  if (!lebar || !tinggi || Math.max(lebar, tinggi) <= MAX_SISI_VIDEO) return null;
  const skala = MAX_SISI_VIDEO / Math.max(lebar, tinggi);
  // Dibulatkan ke angka genap; encoder yuv420p menolak ukuran ganjil.
  const baruL = Math.max(2, pyRound((lebar * skala) / 2) * 2);
  const baruT = Math.max(2, pyRound((tinggi * skala) / 2) * 2);
  const sementara = path.join(path.dirname(berkas), `${batang(berkas)}-kecil${akhiran(berkas)}`);
  const perintah = [
    FFMPEG_BIN, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-threads", VIDEO_THREADS,
    "-i", berkas,
    "-vf", `scale=${baruL}:${baruT}`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    sementara,
  ];
  try {
    let hasil = await jalankanProses(perintah, 600);
    if (hasil.returncode !== 0 || !adalahBerkas(sementara)) {
      // Sebagian berkas audionya tidak bisa disalin; ulangi dengan aac.
      perintah[perintah.indexOf("copy")] = "aac";
      hasil = await jalankanProses(perintah, 600);
    }
    if (hasil.returncode !== 0 || !adalahBerkas(sementara)) {
      pencatat.warning(`Video ${path.basename(berkas)} gagal diperkecil: ${potongPy(hasil.stderr || "", 200)}`);
      hapusBerkas(sementara);
      return null;
    }
    fs.renameSync(sementara, berkas);
  } catch (e) {
    if (!galatOsAtauWaktu(e)) throw e;
    pencatat.warning(`Video ${path.basename(berkas)} gagal diperkecil: ${e instanceof Error ? e.message : e}`);
    hapusBerkas(sementara);
    return null;
  }
  pencatat.info(`Video ${path.basename(berkas)} diperkecil ${lebar}x${tinggi} -> ${baruL}x${baruT}`);
  return fs.statSync(berkas).size;
}

/**
 * Galat pintu depan berkode HTTP (HTTPException 415 di video_api.py). Bentuknya
 * sama dengan GalatHttp server ({status, detail}) supaya bisa diteruskan apa
 * adanya tanpa modul ini bergantung pada lapisan server.
 */
export class GalatIsiMedia extends Error {
  readonly status: number;
  readonly detail: string;
  constructor(status: number, pesan: string) {
    super(pesan);
    this.name = "GalatIsiMedia";
    this.status = status;
    this.detail = pesan;
  }
}

export const JENIS_GAMBAR: ReadonlySet<string> = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * _pastikan_isi_media utuh: gambar diperiksa setara PIL Image.verify()
 * (gambar.ts: termasuk CRC PNG, jadi SVG/teks yang dinamai .png ditolak),
 * selain itu harus video yang punya gambar. Ditolak = 415.
 */
export async function pastikanIsiMedia(berkas: string): Promise<void> {
  if (JENIS_GAMBAR.has(akhiran(berkas).toLowerCase())) {
    try {
      await pastikanIsiGambar(berkas);
    } catch {
      throw new GalatIsiMedia(415, "Berkas ini bukan gambar yang bisa dibaca.");
    }
    return;
  }
  await pastikanIsiVideo(berkas);
}

/**
 * Separuh-video _pastikan_isi_media: berkasnya benar-benar video yang punya
 * gambar, bukan sekadar bernama .mp4. Gambar diperiksa oleh pemanggil.
 */
export async function pastikanIsiVideo(berkas: string): Promise<void> {
  let info: InfoMedia;
  try {
    info = await probe(berkas);
  } catch {
    throw new GalatIsiMedia(415, "Berkas ini bukan video yang bisa dibaca.");
  }
  if (!info.width || !info.height) throw new GalatIsiMedia(415, "Video ini tidak punya gambar.");
}
