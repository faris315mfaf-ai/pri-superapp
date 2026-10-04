// Operasi gambar mesin Auto Edit — cermin bagian Pillow yang dipakai versi
// Python (video_edit.py & video_api.py): buka gambar jadi RGBA, ubah ukuran
// LANCZOS/BOX, potong, alpha_composite, dan _rapikan_gambar.
//
// Kenapa ditulis ulang bit-demi-bit, bukan memakai resize bawaan sharp:
// deteksi_kotak_teks bekerja pada gambar yang diperkecil BOX lalu diambang
// (terang > 140, tepi < 16). Selisih pembulatan 1 nilai saja bisa memindah
// piksel melewati ambang dan menggeser kotak yang terdeteksi. Rumus di sini
// mengikuti libImaging/Resample.c, AlphaComposite.c, dan Convert.c milik
// Pillow 12.3 (presisi titik-tetap yang sama), sehingga hasilnya identik.
// sharp hanya dipakai untuk membaca (decode) dan menyimpan (encode) berkas.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GalatVideo } from "./jenis";

/** Gambar mentah RGBA 8-bit tanpa premultiply (seperti mode "RGBA" Pillow). */
export type GambarRgba = { width: number; height: number; data: Uint8Array };

/** Sisi terpanjang gambar layer setelah dirapikan (MAX_SISI_GAMBAR Python). */
export const MAX_SISI_GAMBAR = (() => {
  const nilai = (process.env.VIDEO_MAX_IMAGE_SIDE ?? "").trim();
  // int(os.getenv(...)) di Python: nilai tak valid membuat layanan gagal
  // start; di sini cukup kembali ke bawaan supaya worker tetap hidup.
  return /^[+-]?\d+$/.test(nilai) ? Number.parseInt(nilai, 10) : 1600;
})();

export const JENIS_GAMBAR: ReadonlySet<string> = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// Batas jumlah piksel saat MENDEKODE gambar dari luar (bukan buffer sendiri):
// berkas dimensi raksasa yang amat terkompres (mis. 30000×30000 PNG < 200 MB)
// kalau didekode penuh membengkak jadi buffer RGBA raksasa di memori saat
// unggah. 64 MP (±8000×8000) jauh di atas kebutuhan overlay nyata (kanvas
// maksimum 4096²=16 MP) tapi menolak bom-dekompresi. `false` = tanpa batas.
export const LIMIT_PIKSEL_DEKODE = 64_000_000;

export function gambarKosong(width: number, height: number, isi: [number, number, number, number] = [0, 0, 0, 0]): GambarRgba {
  const data = new Uint8Array(width * height * 4);
  if (isi.some((v) => v !== 0)) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = isi[0];
      data[i + 1] = isi[1];
      data[i + 2] = isi[2];
      data[i + 3] = isi[3];
    }
  }
  return { width, height, data };
}

// ------------------------------------------------------------------
//  Baca & simpan
// ------------------------------------------------------------------

/**
 * Buka berkas gambar lalu jadikan RGBA 8-bit — padanan
 * `Image.open(berkas).convert("RGBA")`.
 *
 * ignoreIcc: Pillow TIDAK menerapkan profil warna ICC saat membuka gambar,
 * sedangkan sharp bawaannya mengonversi ke sRGB memakai profil itu. Tanpa
 * opsi ini, layer dari Photoshop (profil Display P3/Adobe RGB) akan bergeser
 * warnanya dibanding versi Python. Rotasi EXIF juga sengaja tidak diterapkan
 * (Pillow pun tidak).
 */
export async function bacaGambarRgba(sumber: string | Buffer): Promise<GambarRgba> {
  const { data, info } = await sharp(sumber, { ignoreIcc: true, limitInputPixels: LIMIT_PIKSEL_DEKODE })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw({ depth: "uchar" })
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`Gambar terbaca ${info.channels} kanal, bukan RGBA`);
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

/** Encode RGBA jadi PNG (isi piksel tidak diubah sedikit pun). */
export async function kePng(gambar: GambarRgba): Promise<Buffer> {
  return sharp(Buffer.from(gambar.data.buffer, gambar.data.byteOffset, gambar.data.length), {
    raw: { width: gambar.width, height: gambar.height, channels: 4 },
    limitInputPixels: false,
  })
    .png()
    .toBuffer();
}

export async function simpanPng(gambar: GambarRgba, tujuan: string): Promise<void> {
  fs.writeFileSync(tujuan, await kePng(gambar));
}

/** Padanan `im.convert("RGB")`: buang kanal alpha begitu saja (tanpa latar). */
export function keRgb(gambar: GambarRgba): Uint8Array {
  const n = gambar.width * gambar.height;
  const keluar = new Uint8Array(n * 3);
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    keluar[j] = gambar.data[i * 4];
    keluar[j + 1] = gambar.data[i * 4 + 1];
    keluar[j + 2] = gambar.data[i * 4 + 2];
  }
  return keluar;
}

// ------------------------------------------------------------------
//  Resample (libImaging/Resample.c)
// ------------------------------------------------------------------

export type Saringan = "lanczos" | "box";

function sinc(x: number): number {
  if (x === 0.0) return 1.0;
  const t = x * Math.PI;
  return Math.sin(t) / t;
}

const SARINGAN: Record<Saringan, { fungsi: (x: number) => number; dukungan: number }> = {
  box: { fungsi: (x) => (x > -0.5 && x <= 0.5 ? 1.0 : 0.0), dukungan: 0.5 },
  lanczos: { fungsi: (x) => (-3.0 <= x && x < 3.0 ? sinc(x) * sinc(x / 3) : 0.0), dukungan: 3.0 },
};

// 8 bit hasil + 2 bit cadangan untuk koefisien negatif/lebih dari 1.
const PRESISI = 22;
const SKALA_PRESISI = 1 << PRESISI;
const SETENGAH_PRESISI = 1 << (PRESISI - 1);

type Koefisien = { ksize: number; batas: Int32Array; kk: Int32Array };

function hitungKoefisien(ukuranMasuk: number, in0: number, in1: number, ukuranKeluar: number, saringan: Saringan): Koefisien {
  const { fungsi, dukungan } = SARINGAN[saringan];
  const skala = (in1 - in0) / ukuranKeluar;
  const skalaSaring = skala < 1.0 ? 1.0 : skala;
  const support = dukungan * skalaSaring;
  const ksize = Math.ceil(support) * 2 + 1;
  const pra = new Float64Array(ukuranKeluar * ksize);
  const batas = new Int32Array(ukuranKeluar * 2);
  const kebalikan = 1.0 / skalaSaring;
  for (let xx = 0; xx < ukuranKeluar; xx++) {
    const tengah = in0 + (xx + 0.5) * skala;
    let ww = 0.0;
    // (int) di C memotong ke arah nol, bukan floor.
    let xmin = Math.trunc(tengah - support + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.trunc(tengah + support + 0.5);
    if (xmax > ukuranMasuk) xmax = ukuranMasuk;
    xmax -= xmin;
    const awal = xx * ksize;
    for (let x = 0; x < xmax; x++) {
      const w = fungsi((x + xmin - tengah + 0.5) * kebalikan);
      pra[awal + x] = w;
      ww += w;
    }
    if (ww !== 0.0) for (let x = 0; x < xmax; x++) pra[awal + x] /= ww;
    batas[xx * 2] = xmin;
    batas[xx * 2 + 1] = xmax;
  }
  const kk = new Int32Array(pra.length);
  for (let i = 0; i < pra.length; i++) {
    kk[i] = pra[i] < 0 ? Math.trunc(-0.5 + pra[i] * SKALA_PRESISI) : Math.trunc(0.5 + pra[i] * SKALA_PRESISI);
  }
  return { ksize, batas, kk };
}

function klip8(ss: number): number {
  const v = Math.floor(ss / SKALA_PRESISI); // >> PRESISI (geser aritmetika)
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Ubah ukuran data piksel terkemas (`kanal` byte per piksel) persis seperti
 * ImagingResample: lintasan horizontal dulu (hanya baris yang dipakai),
 * lalu vertikal, masing-masing dibulatkan ke 8 bit.
 */
export function resampel(
  data: Uint8Array,
  lebar: number,
  tinggi: number,
  kanal: number,
  lebarBaru: number,
  tinggiBaru: number,
  saringan: Saringan,
): Uint8Array {
  const kotak = [0, 0, lebar, tinggi];
  const perluH = lebarBaru !== lebar || kotak[0] !== 0 || kotak[2] !== lebarBaru;
  const perluV = tinggiBaru !== tinggi || kotak[1] !== 0 || kotak[3] !== tinggiBaru;
  const kv = hitungKoefisien(tinggi, kotak[1], kotak[3], tinggiBaru, saringan);
  const barisPertama = kv.batas[0];
  const barisAkhir = kv.batas[tinggiBaru * 2 - 2] + kv.batas[tinggiBaru * 2 - 1];

  let antara = data;
  let lebarAntara = lebar;
  if (perluH) {
    const kh = hitungKoefisien(lebar, kotak[0], kotak[2], lebarBaru, saringan);
    for (let i = 0; i < tinggiBaru; i++) kv.batas[i * 2] -= barisPertama;
    const jumlahBaris = barisAkhir - barisPertama;
    antara = new Uint8Array(lebarBaru * jumlahBaris * kanal);
    lebarAntara = lebarBaru;
    for (let yy = 0; yy < jumlahBaris; yy++) {
      const baris = (yy + barisPertama) * lebar * kanal;
      const barisKeluar = yy * lebarBaru * kanal;
      for (let xx = 0; xx < lebarBaru; xx++) {
        const xmin = kh.batas[xx * 2];
        const xmax = kh.batas[xx * 2 + 1];
        const k0 = xx * kh.ksize;
        for (let c = 0; c < kanal; c++) {
          let ss = SETENGAH_PRESISI;
          for (let x = 0; x < xmax; x++) ss += data[baris + (x + xmin) * kanal + c] * kh.kk[k0 + x];
          antara[barisKeluar + xx * kanal + c] = klip8(ss);
        }
      }
    }
  }
  if (!perluV) return perluH ? antara : data.slice();
  const keluar = new Uint8Array(lebarAntara * tinggiBaru * kanal);
  const langkah = lebarAntara * kanal;
  for (let yy = 0; yy < tinggiBaru; yy++) {
    const ymin = kv.batas[yy * 2];
    const ymax = kv.batas[yy * 2 + 1];
    const k0 = yy * kv.ksize;
    const barisKeluar = yy * langkah;
    for (let i = 0; i < langkah; i++) {
      let ss = SETENGAH_PRESISI;
      for (let y = 0; y < ymax; y++) ss += antara[(y + ymin) * langkah + i] * kv.kk[k0 + y];
      keluar[barisKeluar + i] = klip8(ss);
    }
  }
  return keluar;
}

// MULDIV255 / CLIP8 dari libImaging/ImagingUtils.h.
function muldiv255(a: number, b: number): number {
  const t = a * b + 128;
  return ((t >> 8) + t) >> 8;
}

/**
 * `im.resize((w, h), filter)` untuk gambar RGBA. Pillow mengubahnya ke
 * "RGBa" (premultiply) dulu supaya warna piksel transparan tidak merembes ke
 * tepi, lalu kembali ke "RGBA" — urutan dan rumus pembulatannya ditiru.
 */
export function ubahUkuranRgba(gambar: GambarRgba, lebarBaru: number, tinggiBaru: number, saringan: Saringan): GambarRgba {
  if (lebarBaru === gambar.width && tinggiBaru === gambar.height) {
    return { width: gambar.width, height: gambar.height, data: gambar.data.slice() };
  }
  const n = gambar.width * gambar.height;
  const pra = new Uint8Array(n * 4);
  const d = gambar.data;
  for (let i = 0; i < n * 4; i += 4) {
    const a = d[i + 3];
    pra[i] = muldiv255(d[i], a);
    pra[i + 1] = muldiv255(d[i + 1], a);
    pra[i + 2] = muldiv255(d[i + 2], a);
    pra[i + 3] = a;
  }
  const hasil = resampel(pra, gambar.width, gambar.height, 4, lebarBaru, tinggiBaru, saringan);
  for (let i = 0; i < hasil.length; i += 4) {
    const a = hasil[i + 3];
    if (a !== 255 && a !== 0) {
      hasil[i] = Math.min(255, Math.floor((255 * hasil[i]) / a));
      hasil[i + 1] = Math.min(255, Math.floor((255 * hasil[i + 1]) / a));
      hasil[i + 2] = Math.min(255, Math.floor((255 * hasil[i + 2]) / a));
    }
  }
  return { width: lebarBaru, height: tinggiBaru, data: hasil };
}

// ------------------------------------------------------------------
//  Potong, bbox, alpha composite
// ------------------------------------------------------------------

/** `im.crop((kiri, atas, kanan, bawah))` — area di luar gambar jadi transparan. */
export function potong(gambar: GambarRgba, kiri: number, atas: number, kanan: number, bawah: number): GambarRgba {
  const w = Math.max(0, kanan - kiri);
  const h = Math.max(0, bawah - atas);
  const hasil = gambarKosong(w, h);
  for (let y = 0; y < h; y++) {
    const sy = y + atas;
    if (sy < 0 || sy >= gambar.height) continue;
    for (let x = 0; x < w; x++) {
      const sx = x + kiri;
      if (sx < 0 || sx >= gambar.width) continue;
      const s = (sy * gambar.width + sx) * 4;
      const t = (y * w + x) * 4;
      hasil.data[t] = gambar.data[s];
      hasil.data[t + 1] = gambar.data[s + 1];
      hasil.data[t + 2] = gambar.data[s + 2];
      hasil.data[t + 3] = gambar.data[s + 3];
    }
  }
  return hasil;
}

/** `im.getbbox()` gambar RGBA: kotak piksel yang alpha-nya bukan nol. */
export function kotakIsiAlpha(gambar: GambarRgba): [number, number, number, number] | null {
  let x0 = gambar.width;
  let y0 = gambar.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < gambar.height; y++) {
    const baris = y * gambar.width * 4;
    for (let x = 0; x < gambar.width; x++) {
      if (gambar.data[baris + x * 4 + 3] !== 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

/**
 * `kanvas.alpha_composite(lapis, (dx, dy))` — rumus integer
 * ImagingAlphaComposite (presisi 7 bit) di wilayah yang tertimpa, mengubah
 * `kanvas` di tempat. Pemanggil menjamin lapis berada di dalam kanvas.
 */
export function alphaComposite(kanvas: GambarRgba, lapis: GambarRgba, dx = 0, dy = 0): void {
  const P = 7;
  const SATU = 1 << P;
  for (let y = 0; y < lapis.height; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= kanvas.height) continue;
    for (let x = 0; x < lapis.width; x++) {
      const tx = x + dx;
      if (tx < 0 || tx >= kanvas.width) continue;
      const s = (y * lapis.width + x) * 4;
      const sa = lapis.data[s + 3];
      if (sa === 0) continue;
      const t = (ty * kanvas.width + tx) * 4;
      const d = kanvas.data;
      const blend = d[t + 3] * (255 - sa);
      const outa255 = sa * 255 + blend;
      const coef1 = Math.floor((sa * 255 * 255 * SATU) / outa255);
      const coef2 = 255 * SATU - coef1;
      const bagi = (v: number) => {
        const u = v + (0x80 << P);
        return (((u >>> 8) + u) >>> 8) >>> P;
      };
      d[t] = bagi(lapis.data[s] * coef1 + d[t] * coef2);
      d[t + 1] = bagi(lapis.data[s + 1] * coef1 + d[t + 1] * coef2);
      d[t + 2] = bagi(lapis.data[s + 2] * coef1 + d[t + 2] * coef2);
      const u = outa255 + 0x80;
      d[t + 3] = ((u >> 8) + u) >> 8;
    }
  }
}

// ------------------------------------------------------------------
//  _pastikan_isi_media (bagian gambar) & _rapikan_gambar (video_api.py)
// ------------------------------------------------------------------

const PESAN_BUKAN_GAMBAR = "Berkas ini bukan gambar yang bisa dibaca.";

// Format yang dibaca Pillow dan sharp sama-sama. SVG/PDF/HEIF bisa dibaca
// sharp tapi TIDAK oleh Pillow — dulu ditolak, jadi tetap ditolak.
const FORMAT_DITERIMA = new Set(["png", "jpeg", "webp", "gif", "tiff"]);

let tabelCrc: Uint32Array | null = null;
function crc32(buf: Uint8Array, awal: number, akhir: number): number {
  if (!tabelCrc) {
    tabelCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelCrc[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = awal; i < akhir; i++) c = tabelCrc[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Padanan PngImageFile.verify(): telusuri semua chunk sampai IEND dan cocokkan
 * CRC-nya. Isi IDAT tidak didekompresi — sama seperti Pillow.
 */
function verifikasiPng(buf: Buffer): void {
  const tanda = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 8 || tanda.some((b, i) => buf[i] !== b)) throw new Error("bukan PNG");
  let pos = 8;
  for (;;) {
    if (pos + 8 > buf.length) throw new Error("truncated PNG file");
    const panjang = buf.readUInt32BE(pos);
    const jenis = buf.toString("latin1", pos + 4, pos + 8);
    if (jenis === "IEND") return;
    const akhirData = pos + 8 + panjang;
    if (akhirData + 4 > buf.length) throw new Error(`broken PNG file (incomplete checksum in ${jenis})`);
    if (crc32(buf, pos + 4, akhirData) !== buf.readUInt32BE(akhirData)) {
      throw new Error(`broken PNG file (bad header checksum in ${jenis})`);
    }
    pos = akhirData + 4;
  }
}

/**
 * Pastikan berkas bernama .png/.jpg/.webp benar-benar gambar (bagian gambar
 * dari _pastikan_isi_media). Melempar GalatVideo dengan pesan yang sama
 * dengan versi Python (di sana HTTP 415).
 */
export async function pastikanIsiGambar(berkas: string): Promise<void> {
  try {
    const buf = fs.readFileSync(berkas);
    const meta = await sharp(buf, { limitInputPixels: false }).metadata();
    if (!meta.format || !FORMAT_DITERIMA.has(meta.format) || !meta.width || !meta.height) {
      throw new Error(`format ${meta.format ?? "?"} tidak dikenal`);
    }
    if (meta.format === "png") verifikasiPng(buf);
  } catch {
    throw new GalatVideo(PESAN_BUKAN_GAMBAR);
  }
}

/** round() Python 3: setengah dibulatkan ke genap. */
export function bulatPython(x: number): number {
  const bawah = Math.floor(x);
  const sisa = x - bawah;
  if (sisa < 0.5) return bawah;
  if (sisa > 0.5) return bawah + 1;
  return bawah % 2 === 0 ? bawah : bawah + 1;
}

/**
 * Pangkas pinggiran transparan lalu perkecil gambar layer bila kebesaran.
 * Mengembalikan ukuran berkas baru, atau null kalau tidak ada yang diubah
 * (termasuk kalau berkasnya gagal dibaca — sama seperti Python, hanya dicatat).
 */
export async function rapikanGambar(berkas: string): Promise<number | null> {
  if (!JENIS_GAMBAR.has(path.extname(berkas).toLowerCase())) return null;
  try {
    let im = await bacaGambarRgba(fs.readFileSync(berkas));
    const kotak = kotakIsiAlpha(im);
    let berubah = false;
    if (kotak && !(kotak[0] === 0 && kotak[1] === 0 && kotak[2] === im.width && kotak[3] === im.height)) {
      im = potong(im, ...kotak);
      berubah = true;
    }
    const sisi = Math.max(im.width, im.height);
    if (sisi > MAX_SISI_GAMBAR) {
      const skala = MAX_SISI_GAMBAR / sisi;
      im = ubahUkuranRgba(
        im,
        Math.max(1, bulatPython(im.width * skala)),
        Math.max(1, bulatPython(im.height * skala)),
        "lanczos",
      );
      berubah = true;
    }
    if (!berubah) return null;
    // Format PNG apa pun ekstensinya — persis im.save(path, format="PNG").
    await simpanPng(im, berkas);
  } catch (error) {
    console.warn(`Gambar ${path.basename(berkas)} tidak bisa dirapikan: ${error instanceof Error ? error.message : error}`);
    return null;
  }
  return fs.statSync(berkas).size;
}
