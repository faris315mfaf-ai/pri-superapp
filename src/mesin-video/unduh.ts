// Pengunduh video sumber — cermin bagian "UNDUH SUMBER" video_edit.py:
// penjaga SSRF (periksa_url), yt-dlp (argumen identik), penahan situs setelah
// 429, cache unduhan, download_source, preview_source, dan penyapu cache.
//
// Pengunduh berjalan di server yang juga memegang database produksi, jadi
// penjaga SSRF di sini SENGAJA meniru urlparse + ipaddress Python apa adanya
// (bukan URL WHATWG milik Node, yang diam-diam mengubah "http://2130706433/"
// menjadi 127.0.0.1 dan menormalkan host dengan cara lain).
import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DOWNLOAD_TIMEOUT_SECONDS,
  FFMPEG_BIN,
  IG_SESSIONID,
  JEDA_BATAS_DETIK,
  MAX_SOURCE_SECONDS,
  MAX_UNDUH_MB,
  PREVIEW_TIMEOUT_SECONDS,
  SITUS_DIIZINKAN,
  SOURCE_CACHE_SECONDS,
  TUNGGU_ULANG_DETIK,
  UNDUH_PROXY,
  YTDLP_BIN,
} from "./konfig";
import { GalatVideo } from "./jenis";
import { cacheDir, folderUnggahan, uploadsDir } from "./jalur";
import {
  adalahBerkas,
  adalahDict,
  ambil,
  formatF,
  hapusBerkas,
  jalankanProses,
  pencatat,
  potongPy,
  probe,
  pyFloat,
  pyOr,
  pySplitLines,
  pyStr,
  pyStrip,
  pyTruthy,
  WaktuHabis,
  type HasilProses,
} from "./media";

// ============================================================
//  TITIK SAMBUNG (Redis, DNS, jam) — bisa diganti untuk uji
// ============================================================

/** Bagian ioredis yang dipakai penahan situs. */
export type KlienRedisBatas = {
  get(kunci: string): Promise<string | null>;
  set(kunci: string, nilai: string, mode: "EX", detik: number): Promise<unknown>;
  del(kunci: string): Promise<number>;
  ttl(kunci: string): Promise<number>;
};

let redisBatas: KlienRedisBatas | null = null;
/** Pasang klien Redis bersama (null = penahan dalam proses saja, seperti tanpa REDIS_URL). */
export function pasangRedisBatas(klien: KlienRedisBatas | null): void {
  redisBatas = klien;
}

export type PenyelesaiDns = (inang: string) => Promise<string[]>;
const dnsAsli: PenyelesaiDns = async (inang) =>
  (await dns.promises.lookup(inang, { all: true })).map((a) => a.address);
let penyelesaiDns: PenyelesaiDns = dnsAsli;
/** Ganti penyelesai DNS (uji); null = dns.promises.lookup sungguhan. */
export function pasangPenyelesaiDns(fungsi: PenyelesaiDns | null): void {
  penyelesaiDns = fungsi ?? dnsAsli;
}

let tidur = (detik: number) => new Promise<void>((r) => setTimeout(r, detik * 1000));
/** Ganti time.sleep (uji jeda 429 tanpa benar-benar menunggu 80 detik). */
export function pasangTidur(fungsi: ((detik: number) => Promise<void>) | null): void {
  tidur = fungsi ?? ((detik: number) => new Promise<void>((r) => setTimeout(r, detik * 1000)));
}

let awalanYtdlp: string[] | null = null;
/** Ganti cara memanggil yt-dlp (uji dengan yt-dlp palsu); null = [YTDLP_BIN]. */
export function pasangPerintahYtdlp(perintah: string[] | null): void {
  awalanYtdlp = perintah;
}

const sekarangMono = () => performance.now() / 1000;
const sekarangDetik = () => Date.now() / 1000;

// ============================================================
//  urlparse PYTHON (3.11)
// ============================================================

const C0_ATAU_SPASI = /^[\x00-\x20]+/;
const HURUF_SKEMA = /^[A-Za-z0-9+\-.]+$/;

type BagianUrl = { scheme: string; netloc: string };

/** urllib.parse.urlsplit — hanya skema & netloc yang dipakai di sini. */
function urlsplitPy(url: string): BagianUrl {
  url = url.replace(C0_ATAU_SPASI, "").replace(/[\t\r\n]/g, "");
  let scheme = "";
  let netloc = "";
  const i = url.indexOf(":");
  if (i > 0 && /^[A-Za-z]/.test(url[0]) && HURUF_SKEMA.test(url.slice(0, i))) {
    scheme = url.slice(0, i).toLowerCase();
    url = url.slice(i + 1);
  }
  if (url.slice(0, 2) === "//") {
    let batas = url.length;
    for (const c of "/?#") {
      const j = url.indexOf(c, 2);
      if (j >= 0) batas = Math.min(batas, j);
    }
    netloc = url.slice(2, batas);
    if ((netloc.includes("[") && !netloc.includes("]")) || (netloc.includes("]") && !netloc.includes("["))) {
      throw new Error("Invalid IPv6 URL");
    }
    if (netloc.includes("[") && netloc.includes("]")) periksaNetlocBerkurung(netloc);
  }
  periksaNetloc(netloc);
  return { scheme, netloc };
}

function partisi(s: string, pemisah: string): [string, string, string] {
  const i = s.indexOf(pemisah);
  return i < 0 ? [s, "", ""] : [s.slice(0, i), pemisah, s.slice(i + pemisah.length)];
}

function partisiKanan(s: string, pemisah: string): [string, string, string] {
  const i = s.lastIndexOf(pemisah);
  return i < 0 ? ["", "", s] : [s.slice(0, i), pemisah, s.slice(i + pemisah.length)];
}

function periksaNetlocBerkurung(netloc: string): void {
  const inangPort = partisiKanan(netloc, "@")[2];
  const [sebelum, adaBuka, dikurung] = partisi(inangPort, "[");
  let inang: string;
  if (adaBuka) {
    if (sebelum) throw new Error("Invalid IPv6 URL");
    const [h, , port] = partisi(dikurung, "]");
    if (port && !port.startsWith(":")) throw new Error("Invalid IPv6 URL");
    inang = h;
  } else {
    inang = partisi(inangPort, ":")[0];
  }
  if (inang.startsWith("v")) {
    if (!/^v[a-fA-F0-9]+\.[^\n]+$/.test(inang)) throw new Error("IPvFuture address is invalid");
  } else {
    const ip = ipDariTeks(inang);
    if (!ip) throw new Error(`'${inang}' does not appear to be an IPv4 or IPv6 address`);
    if (ip.versi === 4) throw new Error("An IPv4 address cannot be in brackets");
  }
}

/** _checknetloc: karakter yang berubah jadi / ? # @ : setelah NFKC ditolak. */
function periksaNetloc(netloc: string): void {
  if (!netloc || /^[\x00-\x7f]*$/.test(netloc)) return;
  const n = netloc.replace(/[@:#?]/g, "");
  const n2 = n.normalize("NFKC");
  if (n === n2) return;
  for (const c of "/?#@:") {
    if (n2.includes(c)) throw new Error(`netloc '${netloc}' contains invalid characters under NFKC normalization`);
  }
}

/** .hostname: tanpa userinfo & port, huruf kecil (zona IPv6 dibiarkan). */
function hostnamePy(netloc: string): string | null {
  const infoInang = partisiKanan(netloc, "@")[2];
  const [, adaBuka, dikurung] = partisi(infoInang, "[");
  const inang = adaBuka ? partisi(dikurung, "]")[0] : partisi(infoInang, ":")[0];
  if (!inang) return null;
  const [h, persen, zona] = partisi(inang, "%");
  return h.toLowerCase() + persen + zona;
}

/** (.username, .password). */
function userinfoPy(netloc: string): [string | null, string | null] {
  const [info, ada] = partisiKanan(netloc, "@");
  if (!ada) return [null, null];
  const [nama, adaSandi, sandi] = partisi(info, ":");
  return [nama, adaSandi ? sandi : null];
}

// ============================================================
//  ipaddress PYTHON (3.11)
// ============================================================

type AlamatIp = { versi: 4 | 6; nilai: bigint };

function ipv4DariTeks(s: string): bigint | null {
  if (!s || s.includes("/")) return null;
  const oktet = s.split(".");
  if (oktet.length !== 4) return null;
  let nilai = BigInt(0);
  for (const o of oktet) {
    if (!o || !/^[0-9]+$/.test(o) || o.length > 3) return null;
    if (o !== "0" && o[0] === "0") return null; // nol di depan ditolak (ambigu oktal)
    const n = Number(o);
    if (n > 255) return null;
    nilai = (nilai << BigInt(8)) | BigInt(n);
  }
  return nilai;
}

function ipv6DariTeks(s: string): bigint | null {
  if (s.includes("/")) return null;
  const [alamat, adaZona, zona] = partisi(s, "%");
  if (adaZona && (!zona || zona.includes("%"))) return null;
  if (!alamat) return null;
  const bagian = alamat.split(":");
  if (bagian.length < 3) return null;
  if (bagian[bagian.length - 1].includes(".")) {
    const v4 = ipv4DariTeks(bagian.pop()!);
    if (v4 === null) return null;
    bagian.push(((v4 >> BigInt(16)) & BigInt(0xffff)).toString(16), (v4 & BigInt(0xffff)).toString(16));
  }
  if (bagian.length > 9) return null;
  let lompat: number | null = null;
  for (let i = 1; i < bagian.length - 1; i++) {
    if (!bagian[i]) {
      if (lompat !== null) return null;
      lompat = i;
    }
  }
  let hi: number;
  let lo: number;
  let dilompati: number;
  if (lompat !== null) {
    hi = lompat;
    lo = bagian.length - lompat - 1;
    if (!bagian[0]) {
      hi -= 1;
      if (hi) return null;
    }
    if (!bagian[bagian.length - 1]) {
      lo -= 1;
      if (lo) return null;
    }
    dilompati = 8 - (hi + lo);
    if (dilompati < 1) return null;
  } else {
    if (bagian.length !== 8 || !bagian[0] || !bagian[bagian.length - 1]) return null;
    hi = bagian.length;
    lo = 0;
    dilompati = 0;
  }
  const hextet = (h: string): bigint | null => (/^[0-9a-fA-F]{1,4}$/.test(h) ? BigInt(`0x${h}`) : null);
  let nilai = BigInt(0);
  for (let i = 0; i < hi; i++) {
    const h = hextet(bagian[i]);
    if (h === null) return null;
    nilai = (nilai << BigInt(16)) | h;
  }
  nilai <<= BigInt(16 * dilompati);
  for (let i = bagian.length - lo; i < bagian.length; i++) {
    const h = hextet(bagian[i]);
    if (h === null) return null;
    nilai = (nilai << BigInt(16)) | h;
  }
  return nilai;
}

/** ipaddress.ip_address(teks), atau null kalau bukan alamat IP. */
export function ipDariTeks(s: string): AlamatIp | null {
  const v4 = ipv4DariTeks(s);
  if (v4 !== null) return { versi: 4, nilai: v4 };
  const v6 = ipv6DariTeks(s);
  return v6 !== null ? { versi: 6, nilai: v6 } : null;
}

type Jaringan = [bigint, number];
function jar(alamat: string, awalan: number): Jaringan {
  const ip = ipDariTeks(alamat);
  if (!ip) throw new Error(`jaringan tidak sah: ${alamat}`);
  return [ip.nilai, awalan];
}
function dalam(ip: bigint, lebarBit: number, [dasar, awalan]: Jaringan): boolean {
  const geser = BigInt(lebarBit - awalan);
  return ip >> geser === dasar >> geser;
}

// Daftar persis _IPv4Constants / _IPv6Constants Python 3.11.16.
const V4_PRIBADI = [
  jar("0.0.0.0", 8), jar("10.0.0.0", 8), jar("127.0.0.0", 8), jar("169.254.0.0", 16),
  jar("172.16.0.0", 12), jar("192.0.0.0", 24), jar("192.0.0.170", 31), jar("192.0.2.0", 24),
  jar("192.168.0.0", 16), jar("198.18.0.0", 15), jar("198.51.100.0", 24), jar("203.0.113.0", 24),
  jar("240.0.0.0", 4), jar("255.255.255.255", 32),
];
const V4_PENGECUALIAN = [jar("192.0.0.9", 32), jar("192.0.0.10", 32)];
const V4_PUBLIK_SEMU = jar("100.64.0.0", 10); // CGNAT: bukan pribadi, bukan global
const V6_PRIBADI = [
  jar("::1", 128), jar("::", 128), jar("::ffff:0:0", 96), jar("64:ff9b:1::", 48), jar("100::", 64),
  jar("2001::", 23), jar("2001:db8::", 32), jar("2002::", 16), jar("3fff::", 20), jar("fc00::", 7),
  jar("fe80::", 10),
];
const V6_PENGECUALIAN = [
  jar("2001:1::1", 128), jar("2001:1::2", 128), jar("2001:3::", 32), jar("2001:4:112::", 48),
  jar("2001:20::", 28), jar("2001:30::", 28),
];

function v4Global(ip: bigint): boolean {
  if (dalam(ip, 32, V4_PUBLIK_SEMU)) return false;
  const pribadi = V4_PRIBADI.some((n) => dalam(ip, 32, n)) && V4_PENGECUALIAN.every((n) => !dalam(ip, 32, n));
  return !pribadi;
}

/** ip.is_global Python 3.11 (alamat IPv4-mapped dinilai dari IPv4-nya). */
export function isGlobalPy(ip: AlamatIp): boolean {
  if (ip.versi === 4) return v4Global(ip.nilai);
  if (ip.nilai >> BigInt(32) === BigInt(0xffff)) return v4Global(ip.nilai & BigInt(0xffffffff));
  const pribadi =
    V6_PRIBADI.some((n) => dalam(ip.nilai, 128, n)) && V6_PENGECUALIAN.every((n) => !dalam(ip.nilai, 128, n));
  return !pribadi;
}

// Pengetatan DI ATAS Python: is_global Python menganggap multicast
// (224.0.0.0/4, ff00::/8), site-local fec0::/10, blok ::/8 (IPv4-compatible
// ::a.b.c.d) dan NAT64 64:ff9b::/96 yang membungkus IPv4 pribadi sebagai
// "global". Situs video publik tidak pernah beralamat di sana, jadi menolaknya
// tidak mengubah link sah apa pun, dan menutup celah SSRF yang tersisa.
const V4_MULTICAST = jar("224.0.0.0", 4);
const V6_TAMBAHAN = [jar("ff00::", 8), jar("fec0::", 10), jar("::", 8)];
const V6_NAT64 = jar("64:ff9b::", 96);

/** Alamat hasil DNS boleh dihubungi pengunduh? */
export function alamatPublik(ip: AlamatIp): boolean {
  if (!isGlobalPy(ip)) return false;
  if (ip.versi === 4) return !dalam(ip.nilai, 32, V4_MULTICAST);
  if (ip.nilai >> BigInt(32) === BigInt(0xffff)) return !dalam(ip.nilai & BigInt(0xffffffff), 32, V4_MULTICAST);
  // NAT64 diperiksa lebih dulu: 64:ff9b::/96 berada DI DALAM ::/8, padahal
  // yang menentukan adalah IPv4 yang dibungkusnya.
  if (dalam(ip.nilai, 128, V6_NAT64)) return alamatPublik({ versi: 4, nilai: ip.nilai & BigInt(0xffffffff) });
  return !V6_TAMBAHAN.some((n) => dalam(ip.nilai, 128, n));
}

// ============================================================
//  PENJAGA SSRF
// ============================================================

export function situsDiizinkan(inang: string, daftar: readonly string[] = SITUS_DIIZINKAN): boolean {
  if (daftar.includes("*")) return true;
  return daftar.some((s) => inang === s || inang.endsWith(`.${s}`));
}

/**
 * Tolak link yang bukan situs video publik; kembalikan link yang dirapikan.
 * Link ke alamat internal (127.0.0.1, jaringan docker, IP pribadi) atau ke
 * situs di luar daftar ditolak SEBELUM yt-dlp menyentuhnya.
 */
export async function periksaUrl(url: unknown, daftar: readonly string[] = SITUS_DIIZINKAN): Promise<string> {
  const u = pyStrip(pyStr(pyOr(url, "")));
  let bagian: BagianUrl;
  try {
    bagian = urlsplitPy(u);
  } catch {
    throw new GalatVideo("Link video tidak sah.");
  }
  const hostname = hostnamePy(bagian.netloc);
  if ((bagian.scheme !== "http" && bagian.scheme !== "https") || !hostname) {
    throw new GalatVideo("Link video harus diawali http:// atau https://");
  }
  const [nama, sandi] = userinfoPy(bagian.netloc);
  if (nama || sandi) throw new GalatVideo("Link video tidak boleh memuat nama pengguna atau sandi.");
  const inang = hostname.toLowerCase().replace(/\.+$/, "");
  if (ipDariTeks(inang)) throw new GalatVideo("Pakai link situs video (Instagram, TikTok, ...), bukan alamat IP.");
  if (!situsDiizinkan(inang, daftar)) {
    throw new GalatVideo(
      "Link ini bukan dari situs video yang didukung (Instagram, TikTok, " +
        "YouTube, Facebook, X, Threads). Unggah berkasnya lewat pilihan “File”.",
    );
  }
  let alamat: string[];
  try {
    alamat = [...new Set(await penyelesaiDns(inang))];
  } catch {
    throw new GalatVideo("Situs sumbernya tidak bisa dihubungi dari server ini.");
  }
  for (const a of alamat) {
    const ip = ipDariTeks(a.split("%")[0]);
    if (!ip || !alamatPublik(ip)) {
      pencatat.warning(`Link ${inang} ditolak: ${a} bukan alamat publik`);
      throw new GalatVideo("Link ini mengarah ke alamat yang tidak diizinkan.");
    }
  }
  return u;
}

// ============================================================
//  PENAHAN SITUS SETELAH 429
// ============================================================

// Kalimat yang berarti "kamu terlalu sering meminta". Dicocokkan pada
// keluaran yt-dlp, sebab kode keluarnya sama saja dengan galat lain.
const KENA_BATAS = /(HTTP Error 429|Too Many Requests|rate.?limit)/i;

// Penahan kalau Redis tidak ada: cukup untuk satu proses.
const BATAS_LOKAL = new Map<string, number>();

/** Nama situs untuk penahan: "instagram.com" dari alamat apa pun. */
export function situs(url: string): string {
  let inang: string;
  try {
    inang = urlsplitPy(url).netloc.toLowerCase().split(":")[0];
  } catch {
    return "";
  }
  const bagian = inang.split(".").filter((b) => b !== "www" && b !== "m");
  return bagian.length >= 2 ? bagian.slice(-2).join(".") : inang;
}

/** Berapa detik lagi situs ini ditahan setelah kena 429. 0 = bebas. */
export async function sisaTahanan(url: string): Promise<number> {
  const s = situs(url);
  if (!s) return 0.0;
  if (redisBatas) {
    try {
      const sisa = await redisBatas.ttl(`videojob:batas:${s}`);
      return sisa && sisa > 0 ? sisa : 0.0;
    } catch {
      // jatuh ke penahan dalam proses
    }
  }
  return Math.max(0.0, (BATAS_LOKAL.get(s) ?? 0.0) - sekarangDetik());
}

/** Catat bahwa situs ini baru saja menolak karena terlalu sering diminta. */
export async function tahanSitus(url: string): Promise<void> {
  const s = situs(url);
  if (!s) return;
  BATAS_LOKAL.set(s, sekarangDetik() + JEDA_BATAS_DETIK);
  if (!redisBatas) return;
  try {
    await redisBatas.set(`videojob:batas:${s}`, "1", "EX", Math.trunc(JEDA_BATAS_DETIK));
  } catch {
    // catatan lokal di atas sudah cukup
  }
}

/** Unduhan berhasil: tahanannya dicabut supaya job berikutnya tidak menunggu. */
export async function bebaskanSitus(url: string): Promise<void> {
  const s = situs(url);
  if (!s) return;
  BATAS_LOKAL.delete(s);
  if (!redisBatas) return;
  try {
    await redisBatas.del(`videojob:batas:${s}`);
  } catch {
    // abaikan
  }
}

/** Situs yang baru menolak 429 tidak ditembak lagi sebelum jedanya habis. */
export async function tolakKalauDitahan(url: string): Promise<void> {
  const tahanan = await sisaTahanan(url);
  if (tahanan > 0 && !(IG_SESSIONID && url.toLowerCase().includes("instagram.com"))) {
    throw new GalatVideo(
      `${situs(url) || "Situs ini"} sedang membatasi permintaan dari server ` +
        `ini (429). Tunggu ${Math.trunc(tahanan) + 1} detik lagi, atau unggah berkas ` +
        "videonya langsung.",
    );
  }
}

// ============================================================
//  PESAN GALAT yt-dlp
// ============================================================

// Galat yt-dlp yang sering muncul, diterjemahkan jadi kalimat yang bisa
// dikerjakan pengguna (bukan teks Inggris berisi flag baris perintah).
const TERJEMAHAN: readonly (readonly [RegExp, string])[] = [
  [
    /confirm you.{0,3}re not a bot|Sign in to confirm/i,
    "YouTube menolak permintaan dari server ini karena menganggapnya robot. " +
      "Link YouTube memang belum bisa dipakai di sini. Pakai link Instagram " +
      "atau TikTok, atau unduh videonya dulu lalu kirim lewat pilihan " +
      "“File” di atas.",
  ],
  [
    /empty media response|login required|requires? (a )?login|only available (for|to) registered/i,
    "Postingan ini tidak bisa dibaca tanpa akun. Unggah berkas videonya " +
      "lewat pilihan “File”, atau minta admin mengisi Session ID " +
      "Instagram server (VIDEO_IG_SESSIONID).",
  ],
  [
    /private (video|account)|This account is private/i,
    "Akun atau videonya privat, jadi tidak bisa diambil. Pakai video yang " +
      "bisa dibuka umum, atau unggah berkasnya langsung.",
  ],
  [
    /video unavailable|has been removed|no longer available|content isn.{0,3}t available|not available on this app/i,
    "Videonya sudah tidak ada atau dihapus di sumbernya.",
  ],
  [/age.?restricted|inappropriate for some users/i, "Videonya dibatasi umur, jadi tidak bisa diambil tanpa akun."],
  [
    /Unsupported URL|is not a valid URL/i,
    "Link ini tidak dikenali. Pakai link Instagram, TikTok, atau link " + "langsung ke berkas MP4.",
  ],
  [
    /Unable to download webpage|Failed to resolve|Connection (reset|refused)|Temporary failure/i,
    "Situs sumbernya tidak bisa dihubungi dari server ini. Coba lagi " + "sebentar lagi.",
  ],
];

/** Terjemahan galat yt-dlp; "" kalau belum dikenal (pesan aslinya tetap dipakai). */
export function pesanRamah(keluaran: string): string {
  for (const [pola, pesan] of TERJEMAHAN) if (pola.test(keluaran)) return pesan;
  return "";
}

const keluaranDari = (h: HasilProses) => `${h.stdout || ""}\n${h.stderr || ""}`;

/** Ubah kegagalan yt-dlp jadi pesan yang bisa ditindaklanjuti. */
export async function galatYtdlp(hasil: HasilProses, url: string, pakaiCookie: boolean, aksi: string): Promise<GalatVideo> {
  const keluaran = keluaranDari(hasil);
  if (KENA_BATAS.test(keluaran)) {
    // Sudah ditunggu dan diulang, tetap ditolak: situsnya ditahan supaya job
    // berikutnya tidak memperparah keadaan.
    await tahanSitus(url);
    const saran = pakaiCookie
      ? "Sesi akun server pun ikut ditolak, jadi tunggu beberapa menit."
      : "Unggah berkas videonya langsung, atau tunggu beberapa menit.";
    return new GalatVideo(
      `${situs(url) || "Situs sumber"} menolak karena terlalu banyak ` +
        `permintaan dari server ini (429). ${saran}`,
    );
  }
  const ramah = pesanRamah(keluaran);
  if (ramah) return new GalatVideo(ramah);
  const pesan = pySplitLines(pyStrip(hasil.stderr || hasil.stdout || ""));
  const detail = pesan.length ? pesan[pesan.length - 1] : "penyebab tidak diketahui";
  return new GalatVideo(`${aksi}: ${potongPy(detail, 300)}`);
}

// ============================================================
//  MENJALANKAN yt-dlp
// ============================================================

/** Cara memanggil yt-dlp (YTDLP_BIN, bawaannya "yt-dlp" di PATH). */
export function perintahYtdlp(): string[] {
  return awalanYtdlp ? [...awalanYtdlp] : [YTDLP_BIN];
}

export function dasarYtdlp(): string[] {
  return [...perintahYtdlp(), ...(UNDUH_PROXY ? ["--proxy", UNDUH_PROXY] : []), "--no-playlist", "--no-progress"];
}

/** Salinan perintah yt-dlp tanpa pasangan "--cookies <berkas>". */
export function tanpaCookie(perintah: readonly string[]): string[] {
  const bersih: string[] = [];
  let lewati = false;
  for (const bagian of perintah) {
    if (lewati) {
      lewati = false;
      continue;
    }
    if (bagian === "--cookies") {
      lewati = true;
      continue;
    }
    bersih.push(bagian);
  }
  return bersih;
}

/**
 * Jalankan yt-dlp; lepas cookie yang ditolak, dan tunggu kalau kena 429.
 * Cookie mati merusak (Instagram membalas badan kosong → "Failed to parse
 * JSON"), jadi dilepas dulu sebelum menyerah. 429 berarti "tunggu sebentar"
 * dan yt-dlp tidak mengulangnya sendiri, jadi penantiannya dilakukan di sini
 * selama masih ada sisa waktu. WaktuHabis dilempar apa adanya.
 */
export async function ytdlpDenganMundur(
  perintah: readonly string[],
  url: string,
  pakaiCookie: boolean,
  batas: number,
  log?: ((pesan: string) => void) | null,
): Promise<HasilProses> {
  const tenggat = sekarangMono() + batas;
  const jalankan = (pakai: readonly string[]) =>
    jalankanProses([...pakai, url], Math.max(30.0, tenggat - sekarangMono()));

  let dipakai: readonly string[] = perintah;
  let hasil = await jalankan(dipakai);
  if (hasil.returncode !== 0 && pakaiCookie && !KENA_BATAS.test(keluaranDari(hasil))) {
    // Cookie ditolak, dan bukan karena kena batas: coba lagi tanpa cookie.
    if (log) {
      const baris = pySplitLines(keluaranDari(hasil)).filter((b) => b.includes("ERROR"));
      const alasan = baris.length ? ` (${potongPy(pyStrip(baris[baris.length - 1]), 160)})` : "";
      log(`Session ID-nya ditolak${alasan}; mencoba lagi tanpa cookie.`);
    }
    pencatat.info(`yt-dlp gagal dengan cookie, diulang tanpa cookie: ${url}`);
    const tanpa = tanpaCookie(perintah);
    const kedua = await jalankan(tanpa);
    if (kedua.returncode === 0) return kedua;
    if (KENA_BATAS.test(keluaranDari(kedua))) {
      dipakai = tanpa;
      hasil = kedua;
    }
  }

  for (const tunggu of TUNGGU_ULANG_DETIK) {
    if (hasil.returncode === 0 || !KENA_BATAS.test(keluaranDari(hasil))) break;
    // Menunggu lalu kehabisan waktu sama saja dengan gagal, hanya lebih lama.
    if (sekarangMono() + tunggu + 30 > tenggat) break;
    if (log) log(`Situsnya sedang membatasi unduhan; menunggu ${Math.trunc(tunggu)} detik lalu mencoba lagi.`);
    pencatat.info(`yt-dlp kena 429, menunggu ${formatF(tunggu, 0)} detik: ${url}`);
    await tidur(tunggu);
    hasil = await jalankan(dipakai);
  }
  return hasil;
}

/** Berkas cookie dari Session ID server, khusus link Instagram. */
export function cookieInstagram(url: string, folder: string): string | null {
  if (!IG_SESSIONID || !url.toLowerCase().includes("instagram.com")) return null;
  fs.mkdirSync(folder, { recursive: true });
  const berkas = path.join(folder, "cookies.txt");
  const kedaluwarsa = Math.trunc(sekarangDetik()) + 86400 * 30;
  fs.writeFileSync(
    berkas,
    "# Netscape HTTP Cookie File\n" + `.instagram.com\tTRUE\t/\tTRUE\t${kedaluwarsa}\tsessionid\t${IG_SESSIONID}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  fs.chmodSync(berkas, 0o600);
  return berkas;
}

// ============================================================
//  BERKAS HASIL UNDUHAN
// ============================================================

/** Daftar berkas "source.*" (glob) dalam urutan direktori, hanya berkas biasa. */
function globSumber(folder: string, awalan = "source."): string[] {
  let nama: string[];
  try {
    nama = fs.readdirSync(folder);
  } catch {
    return [];
  }
  return nama.filter((n) => n.startsWith(awalan)).map((n) => path.join(folder, n));
}

const urutNama = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** shutil.copy2: salin isi DAN waktu ubah (cache menilai umur dari mtime). */
function salin2(asal: string, tujuan: string): void {
  fs.copyFileSync(asal, tujuan);
  const st = fs.statSync(asal);
  fs.utimesSync(tujuan, st.atime, st.mtime);
}

const ukuranBerkas = (berkas: string) => fs.statSync(berkas).size;

// Potongan yang ditinggalkan yt-dlp: "source.f<id>.mp4" (satu jalur saja,
// belum digabung), ".part", ".ytdl". Bukan video sumber yang utuh.
const POTONGAN_YTDLP = /^source\.f[\p{L}\p{N}_-]+\.[\p{L}\p{N}_]+$|\.(part|ytdl|temp)$/u;

/**
 * Berkas hasil unduhan yang utuh, bukan potongan satu jalur. Yang bersuara
 * didahulukan: dulu potongan video-saja "source.f<id>v.mp4" menang atas
 * "source.mp4" yang lengkap ("f" < "m"), dan hasil editnya bisu.
 */
export async function pilihBerkasSumber(folder: string): Promise<string | null> {
  const semua = globSumber(folder).filter(adalahBerkas);
  const utuh = semua.filter((p) => !POTONGAN_YTDLP.test(path.basename(p)));
  const calon = utuh.length ? utuh : semua;
  if (!calon.length) return null;
  const terurut = [...calon].sort((a, b) => ukuranBerkas(b) - ukuranBerkas(a));
  for (const berkas of terurut) {
    try {
      if ((await probe(berkas)).has_audio) return berkas;
    } catch (e) {
      if (!(e instanceof GalatVideo)) throw e;
    }
  }
  return calon.reduce((terbesar, p) => (ukuranBerkas(p) > ukuranBerkas(terbesar) ? p : terbesar));
}

/**
 * Video sumber tanpa suara: ambil jalur audionya sendiri lalu gabungkan.
 * Kalau audionya tak bisa diambil, video aslinya dikembalikan apa adanya -
 * bisu, tapi tidak menggagalkan job.
 */
export async function susulkanAudio(
  video: string,
  perintah: readonly string[],
  url: string,
  pakaiCookie: boolean,
  log?: ((pesan: string) => void) | null,
): Promise<string> {
  const folder = path.dirname(video);
  for (const lama of globSumber(folder, "audio-susulan.")) hapusBerkas(lama);
  const pakai: string[] = [];
  let lewati = false;
  for (const bagian of perintah) {
    if (lewati) {
      lewati = false;
      continue;
    }
    if (bagian === "-f" || bagian === "-o" || bagian === "--merge-output-format") {
      lewati = true;
      continue;
    }
    pakai.push(bagian);
  }
  pakai.push("-f", "ba/b[acodec!=none]", "-o", path.join(folder, "audio-susulan.%(ext)s"));
  let hasil: HasilProses | null;
  try {
    hasil = await ytdlpDenganMundur(pakai, url, pakaiCookie, 180, log);
  } catch (e) {
    if (!(e instanceof WaktuHabis)) throw e;
    hasil = null;
  }
  const audio = globSumber(folder, "audio-susulan.").sort(urutNama)[0] ?? null;
  if (hasil === null || hasil.returncode !== 0 || audio === null) {
    if (log) {
      if (url.toLowerCase().includes("instagram.com")) {
        // Terbukti 27 Sep 2026 (reel Ddvp79eTigN): Instagram membisukan
        // postingan tertentu untuk negara server (lagunya dibatasi wilayah).
        log(
          "Peringatan: hasilnya TANPA SUARA. Instagram membisukan video ini " +
            "untuk lokasi server (lagunya dibatasi per negara). Unduh videonya " +
            "di HP/laptop lalu pakai unggah berkas.",
        );
      } else {
        log("Peringatan: video sumber tidak punya suara, dan audionya tidak bisa diambil.");
      }
    }
    return video;
  }
  const gabungan = path.join(folder, "source-bersuara.mp4");
  const mux = await jalankanProses(
    [FFMPEG_BIN, "-y", "-loglevel", "error", "-i", video, "-i", audio,
      "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-shortest", gabungan],
    300,
  );
  hapusBerkas(audio);
  if (mux.returncode !== 0 || !adalahBerkas(gabungan)) {
    pencatat.warning(`Gagal menggabung audio susulan: ${(mux.stderr || "").slice(-300)}`);
    if (log) log("Peringatan: video sumber tidak punya suara, dan audionya gagal digabung.");
    return video;
  }
  const tujuanAkhir = path.join(folder, "source.mp4");
  hapusBerkas(video);
  fs.renameSync(gabungan, tujuanAkhir);
  if (log) log("Audio video sumber diambil terpisah lalu digabungkan.");
  return tujuanAkhir;
}

// ============================================================
//  UNDUH & PRATINJAU
// ============================================================

const mb = (berkas: string) => formatF(ukuranBerkas(berkas) / 1_048_576, 1);

/** Unduh video dari link situs video, atau salin video unggahan. */
export async function downloadSource(
  url: unknown,
  tujuan: string,
  log?: ((pesan: string) => void) | null,
): Promise<string> {
  let u = pyStrip(pyStr(pyOr(url, "")));
  fs.mkdirSync(tujuan, { recursive: true });

  // Sumber dari komputer pengguna: disalin (bukan dipindah) karena satu
  // unggahan bisa dipakai banyak job (satu per template).
  const folder = folderUnggahan(u);
  if (folder !== null) {
    const berkas = fs.existsSync(folder) && fs.statSync(folder).isDirectory()
      ? globSumber(folder).filter(adalahBerkas).sort(urutNama)
      : [];
    if (!berkas.length) {
      throw new GalatVideo(
        "Video sumber unggahan sudah tidak ada di server (mungkin sudah " + "dibersihkan). Unggah lagi berkasnya.",
      );
    }
    const salinan = path.join(tujuan, path.basename(berkas[0]));
    salin2(berkas[0], salinan);
    if (log) log(`Memakai video sumber dari unggahan (${mb(salinan)} MB)`);
    return salinan;
  }

  u = await periksaUrl(u);
  const cache = path.join(cacheDir(), crypto.createHash("sha1").update(u, "utf8").digest("hex"));

  const dariCache = async (): Promise<string | null> => {
    for (const tersimpan of globSumber(cache).sort(urutNama)) {
      if (sekarangDetik() - fs.statSync(tersimpan).mtimeMs / 1000 < SOURCE_CACHE_SECONDS) {
        // Sumber bisu yang terlanjur tersimpan jangan dipakai ulang: justru
        // itu yang membuat mencoba lagi tetap tanpa suara.
        let bisu: boolean;
        try {
          bisu = !(await probe(tersimpan)).has_audio;
        } catch (e) {
          if (!(e instanceof GalatVideo)) throw e;
          bisu = true;
        }
        if (bisu) {
          hapusBerkas(tersimpan);
          continue;
        }
        const salinan = path.join(tujuan, path.basename(tersimpan));
        salin2(tersimpan, salinan);
        if (log) log("Memakai video sumber yang baru saja diunduh (cache).");
        return salinan;
      }
    }
    return null;
  };

  let siap = await dariCache();
  if (siap !== null) return siap;

  // Beberapa render dari link yang sama bisa berjalan bersamaan. Yang lebih
  // dulu memegang kunci yang mengunduh; sisanya menunggu lalu memakai hasilnya.
  const kunci = `${cache}.lock`;
  fs.mkdirSync(path.dirname(kunci), { recursive: true });
  let pemegang = false;
  try {
    fs.mkdirSync(kunci);
    pemegang = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    // Kunci yang ditinggalkan proses mati tidak boleh menahan selamanya.
    try {
      if (sekarangDetik() - fs.statSync(kunci).mtimeMs / 1000 > DOWNLOAD_TIMEOUT_SECONDS) {
        fs.rmSync(kunci, { recursive: true, force: true });
      }
    } catch {
      // abaikan
    }
  }
  if (!pemegang) {
    if (log) log("Menunggu unduhan video sumber yang sedang berjalan ...");
    const batas = sekarangDetik() + DOWNLOAD_TIMEOUT_SECONDS;
    while (sekarangDetik() < batas && fs.existsSync(kunci)) {
      await tidur(1.0);
      siap = await dariCache();
      if (siap !== null) return siap;
    }
    siap = await dariCache();
    if (siap !== null) return siap;
  }

  try {
    await tolakKalauDitahan(u);
    const perintah = [
      ...dasarYtdlp(),
      "--retries", "3",
      // Galat extractor (termasuk 429 saat membaca halaman postingan) tidak
      // ikut diatur "--retries"; ini yang mengaturnya.
      "--extractor-retries", "3",
      "--retry-sleep", "extractor:exp=5:60",
      "--retry-sleep", "http:exp=5:60",
      // Jeda antar-permintaan supaya tidak terlihat sebagai serbuan.
      "--sleep-requests", "1",
      // Ditolak SEBELUM diunduh: durasi di bawah batas ATAU tidak diketahui.
      // Dua penyaring terpisah berarti ATAU; satu penyaring ber-"|" ditolak.
      "--match-filter", `duration <= ${Math.trunc(MAX_SOURCE_SECONDS)}`,
      "--match-filter", "!duration",
      "--max-filesize", `${MAX_UNDUH_MB}M`,
      // Pilihan berjalur audio terpisah dicoba SEBELUM berkas tunggal.
      "-f", "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b",
      "--merge-output-format", "mp4",
      "-o", path.join(tujuan, "source.%(ext)s"),
    ];
    const berkasCookie = cookieInstagram(u, path.join(tujuan, ".kuki"));
    if (berkasCookie !== null) {
      perintah.push("--cookies", berkasCookie);
      if (log) log("Memakai Session ID server untuk mengunduh dari Instagram.");
    }
    if (log) log(`Mengunduh video dari ${u}`);
    let terpilih: string | null = null;
    let hasil: HasilProses;
    try {
      hasil = await ytdlpDenganMundur(perintah, u, berkasCookie !== null, Math.trunc(DOWNLOAD_TIMEOUT_SECONDS), log);
      if (hasil.returncode === 0) {
        terpilih = await pilihBerkasSumber(tujuan);
        if (terpilih !== null) {
          let bisu: boolean;
          try {
            bisu = !(await probe(terpilih)).has_audio;
          } catch (e) {
            if (!(e instanceof GalatVideo)) throw e;
            bisu = false;
          }
          if (bisu) terpilih = await susulkanAudio(terpilih, perintah, u, berkasCookie !== null, log);
        }
      }
    } catch (e) {
      if (e instanceof WaktuHabis) throw new GalatVideo("Unduhan video melewati batas waktu");
      throw e;
    } finally {
      fs.rmSync(path.join(tujuan, ".kuki"), { recursive: true, force: true });
    }

    if (hasil.returncode !== 0) throw await galatYtdlp(hasil, u, berkasCookie !== null, "Gagal mengunduh video");
    if (terpilih === null) {
      const keluaranYtdlp = `${hasil.stdout}\n${hasil.stderr}`;
      if (keluaranYtdlp.includes("does not pass filter")) {
        // Ditolak penyaring durasi: yt-dlp keluar 0 tanpa membuat berkas.
        throw new GalatVideo(
          `Videonya lebih panjang dari batas ${formatF(MAX_SOURCE_SECONDS / 60, 0)} menit, ` +
            "jadi tidak diunduh. Pakai video yang lebih pendek.",
        );
      }
      if (keluaranYtdlp.includes("File is larger than max-filesize")) {
        throw new GalatVideo(`Berkas videonya melebihi batas unduhan ${MAX_UNDUH_MB} MB.`);
      }
      throw new GalatVideo("Video terunduh tetapi berkasnya tidak ditemukan");
    }

    // Berhasil: tahanan situsnya dicabut supaya job berikutnya tidak menunggu.
    await bebaskanSitus(u);
    if (log) log(`Video terunduh (${mb(terpilih)} MB)`);
    try {
      fs.mkdirSync(cache, { recursive: true });
      salin2(terpilih, path.join(cache, path.basename(terpilih)));
    } catch (e) {
      // cache hanya pelengkap, jangan gagalkan job
      pencatat.warning(`Gagal menyimpan cache sumber: ${e instanceof Error ? e.message : e}`);
    }
    return terpilih;
  } finally {
    if (pemegang) fs.rmSync(kunci, { recursive: true, force: true });
  }
}

export type PratinjauSumber = {
  title: unknown;
  description: string;
  view_count: unknown;
  like_count: unknown;
  upload_date: unknown;
  uploader: string;
  duration: number | null;
  thumbnail: unknown;
  extractor: unknown;
  width: unknown;
  height: unknown;
  webpage_url: unknown;
  too_long: boolean;
  max_seconds: number;
};

/** Keterangan video dari sebuah link TANPA mengunduh berkasnya. */
export async function previewSource(url: unknown): Promise<PratinjauSumber> {
  const u = await periksaUrl(url);
  // Pratinjau adalah permintaan PERTAMA yang menyentuh situsnya; kalau situsnya
  // sedang menahan, menembaknya lagi hanya memperpanjang tahanan itu.
  await tolakKalauDitahan(u);
  const perintah = [
    ...dasarYtdlp(),
    "--no-warnings",
    "--skip-download",
    "--dump-single-json",
    // Pratinjau harus cepat, jadi ulangannya sedikit dan jedanya pendek.
    "--retries", "2",
    "--extractor-retries", "1",
    "--retry-sleep", "extractor:3",
    "--sleep-requests", "0.5",
  ];
  const folderKuki = fs.mkdtempSync(path.join(os.tmpdir(), "godam-kuki-"));
  let berkasCookie: string | null = null;
  let hasil: HasilProses;
  try {
    berkasCookie = cookieInstagram(u, folderKuki);
    if (berkasCookie !== null) perintah.push("--cookies", berkasCookie);
    try {
      hasil = await ytdlpDenganMundur(perintah, u, berkasCookie !== null, Math.trunc(PREVIEW_TIMEOUT_SECONDS));
    } catch (e) {
      if (e instanceof WaktuHabis) throw new GalatVideo("Pratinjau link melewati batas waktu");
      throw e;
    }
  } finally {
    fs.rmSync(folderKuki, { recursive: true, force: true });
  }

  if (hasil.returncode !== 0) throw await galatYtdlp(hasil, u, berkasCookie !== null, "Tidak bisa membaca link");
  await bebaskanSitus(u);

  let data: unknown;
  try {
    data = JSON.parse(hasil.stdout || "{}");
  } catch {
    throw new GalatVideo("Balasan yt-dlp tidak bisa dibaca");
  }
  if (!adalahDict(data)) throw new TypeError(`'${Array.isArray(data) ? "list" : typeof data}' object has no attribute 'get'`);
  const dapat = (k: string) => ambil(data, k);

  let durasi: number | null = null;
  const mentah = dapat("duration");
  if (mentah !== null && mentah !== undefined) {
    try {
      durasi = pyFloat(mentah);
    } catch {
      durasi = null;
    }
  }

  // Pemilik video untuk kredit "SUMBER: ...": nama akun ("channel")
  // didahulukan atas nama tampilan ("uploader") yang bebas diisi.
  const pemilik =
    pyStrip(pyStr(pyOr(dapat("channel"), ""))) ||
    pyStrip(pyStr(pyOr(dapat("uploader"), ""))) ||
    pyStrip(pyStr(pyOr(dapat("uploader_id"), ""))).replace(/^@+/, "");
  return {
    title: pyOr(dapat("title"), "(tanpa judul)"),
    // Caption asli (IG/TikTok) atau deskripsi (YouTube), untuk hook otomatis.
    description: potongPy(pyStrip(pyStr(pyOr(dapat("description"), ""))), 2000),
    view_count: pyOr(dapat("view_count"), 0),
    like_count: pyOr(dapat("like_count"), 0),
    upload_date: pyOr(dapat("upload_date"), ""),
    uploader: pemilik,
    duration: durasi,
    thumbnail: pyOr(dapat("thumbnail"), ""),
    extractor: pyOr(pyOr(dapat("extractor_key"), dapat("extractor")), ""),
    width: pyOr(dapat("width"), 0),
    height: pyOr(dapat("height"), 0),
    webpage_url: pyOr(dapat("webpage_url"), u),
    // Terlalu panjang untuk diproses - penolakan, bukan peringatan.
    too_long: Boolean(durasi && durasi > MAX_SOURCE_SECONDS),
    max_seconds: MAX_SOURCE_SECONDS,
  };
}

// ============================================================
//  PENYAPU
// ============================================================

/**
 * Hapus unduhan sumber yang sudah melewati umur cache, termasuk folder
 * kunci (.lock) basi - kalau tidak, link yang gagal di tengah jalan bisa
 * terkunci selamanya.
 */
export function bersihkanCacheUnduhan(batasDetik: number | null = null): number {
  const batas = sekarangDetik() - (batasDetik === null ? SOURCE_CACHE_SECONDS : batasDetik);
  let dihapus = 0;
  const folder = cacheDir();
  for (const nama of fs.readdirSync(folder)) {
    const isi = path.join(folder, nama);
    let st: fs.Stats;
    try {
      st = fs.statSync(isi);
      if (st.mtimeMs / 1000 >= batas) continue;
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      try {
        fs.rmSync(isi, { recursive: true, force: true });
      } catch {
        // ignore_errors=True
      }
    } else {
      hapusBerkas(isi);
    }
    dihapus += 1;
  }
  if (dihapus) pencatat.info(`${dihapus} unduhan sumber kedaluwarsa dibuang dari cache`);
  return dihapus;
}

/** Hapus video sumber unggahan yang lebih tua dari batas. */
export function bersihkanUnggahanLama(batasDetik: number): number {
  let dihapus = 0;
  const folder = uploadsDir();
  for (const nama of fs.readdirSync(folder)) {
    const isi = path.join(folder, nama);
    const st = fs.statSync(isi);
    if (st.isDirectory() && sekarangDetik() - st.mtimeMs / 1000 > batasDetik) {
      try {
        fs.rmSync(isi, { recursive: true, force: true });
      } catch {
        // ignore_errors=True
      }
      dihapus += 1;
    }
  }
  return dihapus;
}
