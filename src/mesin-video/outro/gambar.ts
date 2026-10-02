// Inti gambar yang meniru Pillow 12 (libImaging) SAMPAI KE PEMBULATANNYA.
//
// Kenapa tidak memakai canvas/sharp untuk semua ini: outro.py menyusun tiap
// frame dari puluhan operasi Pillow (alpha_composite, resize LANCZOS/BICUBIC
// dengan pra-perkalian alfa, GaussianBlur kotak-tiga-lintasan, rotate
// BICUBIC, ...). Skia/libvips punya algoritma sendiri; hasilnya "mirip" tapi
// selisih 1-3 nilai warna di tiap piksel menumpuk lintas lapisan. Dengan
// porting algoritma C-nya langsung (Resample.c, BoxBlur.c, Geometry.c,
// AlphaComposite.c, Paste.c, Convert.c), frame TS identik bit-per-bit
// dengan frame Python untuk semua unsur selain glyph teks.
//
// Konvensi: gambar RGBA = 4 byte/piksel TANPA pra-perkalian (seperti mode
// "RGBA" Pillow); "L" = 1 byte/piksel. Operasi yang di Pillow melewati mode
// "RGBa" (pra-perkalian) melakukannya di sini secara eksplisit.

export type Mode = "RGBA" | "L";

/** Konstanta filter, nilainya sama dengan Image.Resampling Pillow. */
export const NEAREST = 0;
export const LANCZOS = 1;
export const BILINEAR = 2;
export const BICUBIC = 3;
export type Filter = typeof NEAREST | typeof LANCZOS | typeof BILINEAR | typeof BICUBIC;

export class Gambar {
  readonly bands: number;
  constructor(
    readonly mode: Mode,
    readonly w: number,
    readonly h: number,
    readonly data: Uint8Array,
  ) {
    this.bands = mode === "RGBA" ? 4 : 1;
    if (data.length !== w * h * this.bands) throw new Error(`ukuran data ${data.length} != ${w}x${h}x${this.bands}`);
  }
}

export type Warna = readonly number[];

/** Image.new(mode, (w, h), warna). */
export function baru(mode: Mode, w: number, h: number, warna: Warna | number = 0): Gambar {
  const bands = mode === "RGBA" ? 4 : 1;
  const data = new Uint8Array(w * h * bands);
  if (mode === "L") {
    const v = typeof warna === "number" ? warna : warna[0];
    if (v) data.fill(v);
  } else {
    // RGBA dengan angka hanya dipakai sebagai 0 (transparan), seperti Image.new(..., 0).
    if (typeof warna === "number") {
      if (warna !== 0) throw new Error("warna RGBA harus berupa (r, g, b[, a])");
      return new Gambar(mode, w, h, data);
    }
    const r = warna[0] ?? 0;
    const g = warna[1] ?? 0;
    const b = warna[2] ?? 0;
    const a = warna.length >= 4 ? warna[3] : 255;
    if (r || g || b || a) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
      }
    }
  }
  return new Gambar(mode, w, h, data);
}

export function salin(im: Gambar): Gambar {
  return new Gambar(im.mode, im.w, im.h, im.data.slice());
}

/** ImagingCrop: area di luar sumber terisi 0. */
export function potong(im: Gambar, x0: number, y0: number, x1: number, y1: number): Gambar {
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const b = im.bands;
  const out = new Uint8Array(w * h * b);
  const sx0 = Math.max(0, x0);
  const sx1 = Math.min(im.w, x1);
  if (sx1 > sx0) {
    for (let y = 0; y < h; y++) {
      const sy = y0 + y;
      if (sy < 0 || sy >= im.h) continue;
      const awal = (sy * im.w + sx0) * b;
      out.set(im.data.subarray(awal, awal + (sx1 - sx0) * b), (y * w + (sx0 - x0)) * b);
    }
  }
  return new Gambar(im.mode, w, h, out);
}

/** ((a >> 8) + a) >> 8 — SHIFTFORDIV255 di ImagingUtils.h. */
const bagi255 = (a: number) => (((a >>> 8) + a) >>> 8);
/** BLEND(mask, in1, in2) = DIV255(in1 * (255 - mask) + in2 * mask). */
const blend = (m: number, a: number, b: number) => bagi255(a * (255 - m) + b * m + 128);

// Tabel pembagian bilangan bulat (dihitung sekali, 64 ribu entri): pembagian
// per piksel adalah bagian termahal alpha_composite dan RGBa->RGBA di JS.
let koef1: Uint16Array | null = null;
/** coef1 = floor(sa*255*255*128 / (sa*255 + da*(255-sa))), indeks (sa << 8) | da. */
function tabelKoef1(): Uint16Array {
  if (!koef1) {
    koef1 = new Uint16Array(65536);
    for (let sa = 1; sa < 256; sa++) {
      for (let da = 0; da < 256; da++) koef1[(sa << 8) | da] = Math.floor((sa * 255 * 255 * 128) / (sa * 255 + da * (255 - sa)));
    }
  }
  return koef1;
}
let bukaKaliLut: Uint8Array | null = null;
/** CLIP8(255 * c / a), indeks (a << 8) | c. */
function tabelBukaKali(): Uint8Array {
  if (!bukaKaliLut) {
    bukaKaliLut = new Uint8Array(65536);
    for (let a = 1; a < 256; a++) {
      for (let c = 0; c < 256; c++) {
        const v = Math.floor((255 * c) / a);
        bukaKaliLut[(a << 8) | c] = v > 255 ? 255 : v;
      }
    }
  }
  return bukaKaliLut;
}

/**
 * Image.alpha_composite(lapisan, dest=(dx, dy)) di tempat — rumus bilangan
 * bulat AlphaComposite.c (presisi 7 bit), dengan pemotongan di tepi.
 */
export function alphaComposite(dasar: Gambar, lapisan: Gambar, dx = 0, dy = 0): void {
  if (dasar.mode !== "RGBA" || lapisan.mode !== "RGBA") throw new Error("alpha_composite butuh RGBA");
  const x0 = Math.max(0, dx);
  const y0 = Math.max(0, dy);
  const x1 = Math.min(dasar.w, dx + lapisan.w);
  const y1 = Math.min(dasar.h, dy + lapisan.h);
  if (x1 <= x0 || y1 <= y0) return;
  const d = dasar.data;
  const s = lapisan.data;
  const koef = tabelKoef1();
  for (let y = y0; y < y1; y++) {
    let pd = (y * dasar.w + x0) * 4;
    let ps = ((y - dy) * lapisan.w + (x0 - dx)) * 4;
    for (let x = x0; x < x1; x++, pd += 4, ps += 4) {
      const sa = s[ps + 3];
      if (sa === 0) continue;
      if (sa === 255) {
        // Sumber buram penuh: rumus bilangan bulat di atas menghasilkan tepat
        // warna sumber dan alfa 255 (sudah dibuktikan untuk semua nilai).
        d[pd] = s[ps];
        d[pd + 1] = s[ps + 1];
        d[pd + 2] = s[ps + 2];
        d[pd + 3] = 255;
        continue;
      }
      const da = d[pd + 3];
      const outa255 = sa * 255 + da * (255 - sa);
      const coef1 = koef[(sa << 8) | da];
      const coef2 = 32640 - coef1;
      // SHIFTFORDIV255(t + (0x80 << 7)) >> 7, ditulis langsung (tanpa panggilan).
      let t = s[ps] * coef1 + d[pd] * coef2 + 16384;
      d[pd] = (((t >>> 8) + t) >>> 8) >>> 7;
      t = s[ps + 1] * coef1 + d[pd + 1] * coef2 + 16384;
      d[pd + 1] = (((t >>> 8) + t) >>> 8) >>> 7;
      t = s[ps + 2] * coef1 + d[pd + 2] * coef2 + 16384;
      d[pd + 2] = (((t >>> 8) + t) >>> 8) >>> 7;
      t = outa255 + 0x80;
      d[pd + 3] = ((t >>> 8) + t) >>> 8;
    }
  }
}

/** alpha_composite satu piksel sumber (r, g, b, sa) ke (x, y) — rumus yang sama. */
export function kompositPiksel(dasar: Gambar, x: number, y: number, r: number, g: number, b: number, sa: number): void {
  if (sa === 0) return;
  const d = dasar.data;
  const pd = (y * dasar.w + x) * 4;
  if (sa === 255) {
    d[pd] = r;
    d[pd + 1] = g;
    d[pd + 2] = b;
    d[pd + 3] = 255;
    return;
  }
  const da = d[pd + 3];
  const outa255 = sa * 255 + da * (255 - sa);
  const coef1 = tabelKoef1()[(sa << 8) | da];
  const coef2 = 32640 - coef1;
  let t = r * coef1 + d[pd] * coef2 + 16384;
  d[pd] = (((t >>> 8) + t) >>> 8) >>> 7;
  t = g * coef1 + d[pd + 1] * coef2 + 16384;
  d[pd + 1] = (((t >>> 8) + t) >>> 8) >>> 7;
  t = b * coef1 + d[pd + 2] * coef2 + 16384;
  d[pd + 2] = (((t >>> 8) + t) >>> 8) >>> 7;
  t = outa255 + 0x80;
  d[pd + 3] = ((t >>> 8) + t) >>> 8;
}

/** ImagingPaste dengan masker "L" (paste_mask_L), di tempat. */
export function tempelMasker(dasar: Gambar, sumber: Gambar, masker: Gambar, dx = 0, dy = 0): void {
  if (dasar.mode !== sumber.mode || masker.mode !== "L") throw new Error("mode paste tidak cocok");
  if (masker.w !== sumber.w || masker.h !== sumber.h) throw new Error("ukuran masker tidak cocok");
  const b = dasar.bands;
  const x0 = Math.max(0, dx);
  const y0 = Math.max(0, dy);
  const x1 = Math.min(dasar.w, dx + sumber.w);
  const y1 = Math.min(dasar.h, dy + sumber.h);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const m = masker.data[(y - dy) * masker.w + (x - dx)];
      const pd = (y * dasar.w + x) * b;
      const ps = ((y - dy) * sumber.w + (x - dx)) * b;
      for (let c = 0; c < b; c++) dasar.data[pd + c] = blend(m, dasar.data[pd + c], sumber.data[ps + c]);
    }
  }
}

/**
 * ImagingFill2 dengan masker "L" (fill_mask_L): cara ImageDraw.text
 * menempelkan glyph. Untuk RGBA, piksel tujuan yang alfanya 0 langsung
 * mendapat warna tinta penuh (bukan dicampur dengan hitam transparan).
 */
export function isiMasker(dasar: Gambar, tinta: Warna, masker: Gambar, dx: number, dy: number): void {
  let w = masker.w;
  let h = masker.h;
  let sx0 = 0;
  let sy0 = 0;
  let x0 = dx;
  let y0 = dy;
  if (x0 < 0) {
    w += x0;
    if (w <= 0) return;
    sx0 = -x0;
    x0 = 0;
  }
  if (x0 + w > dasar.w) w = dasar.w - x0;
  if (y0 < 0) {
    h += y0;
    if (h <= 0) return;
    sy0 = -y0;
    y0 = 0;
  }
  if (y0 + h > dasar.h) h = dasar.h - y0;
  if (w <= 0 || h <= 0) return;
  const d = dasar.data;
  if (dasar.mode === "L") {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y + y0) * dasar.w + x + x0;
        d[p] = blend(masker.data[(y + sy0) * masker.w + x + sx0], d[p], tinta[0]);
      }
    }
    return;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = masker.data[(y + sy0) * masker.w + x + sx0];
      const p = ((y + y0) * dasar.w + x + x0) * 4;
      const alfaLama = d[p + 3];
      for (let i = 0; i < 4; i++) {
        let cm = m;
        if (i !== 3 && cm !== 0) cm = 255 - (255 - cm) * (1 - Math.trunc((255 - alfaLama) / 255));
        d[p + i] = blend(cm, d[p + i], tinta[i]);
      }
    }
  }
}

export function ambilKanal(im: Gambar, kanal: number): Gambar {
  const out = new Uint8Array(im.w * im.h);
  for (let i = 0, j = kanal; i < out.length; i++, j += im.bands) out[i] = im.data[j];
  return new Gambar("L", im.w, im.h, out);
}

/** Image.putalpha(L) di tempat. */
export function pasangAlpha(im: Gambar, alpha: Gambar): void {
  for (let i = 0, j = 3; i < alpha.data.length; i++, j += 4) im.data[j] = alpha.data[i];
}

/** Image.point(fungsi) untuk "L": tabel 256 nilai, dibulatkan seperti round() Python. */
export function point(im: Gambar, fungsi: (v: number) => number): Gambar {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const v = bulatGenap(fungsi(i));
    lut[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  const out = new Uint8Array(im.data.length);
  for (let i = 0; i < out.length; i++) out[i] = lut[im.data[i]];
  return new Gambar(im.mode, im.w, im.h, out);
}

/** round() Python untuk float: setengah ke genap. */
export function bulatGenap(v: number): number {
  const f = Math.floor(v);
  const sisa = v - f;
  if (sisa > 0.5) return f + 1;
  if (sisa < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** RGBA -> RGBa (rgbA2rgba, MULDIV255). */
function praKali(im: Gambar): Gambar {
  const s = im.data;
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3];
    out[i] = bagi255(s[i] * a + 128);
    out[i + 1] = bagi255(s[i + 1] * a + 128);
    out[i + 2] = bagi255(s[i + 2] * a + 128);
    out[i + 3] = a;
  }
  return new Gambar("RGBA", im.w, im.h, out);
}

/** RGBa -> RGBA (rgba2rgbA): CLIP8(255 * c / a) dengan pembagian bulat. */
function bukaKali(im: Gambar): Gambar {
  const s = im.data;
  const lut = tabelBukaKali();
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3];
    if (a === 255 || a === 0) continue;
    const baris = a << 8;
    s[i] = lut[baris | s[i]];
    s[i + 1] = lut[baris | s[i + 1]];
    s[i + 2] = lut[baris | s[i + 2]];
  }
  return im;
}

// ------------------------------------------------------------------
//  Resample.c — resize dua lintasan, koefisien titik tetap 22 bit
// ------------------------------------------------------------------

type FilterResample = { f: (x: number) => number; support: number };

const sinc = (x: number) => {
  if (x === 0.0) return 1.0;
  x = x * Math.PI;
  return Math.sin(x) / x;
};
const FILTER_RESAMPLE: Record<number, FilterResample> = {
  [BILINEAR]: {
    f: (x) => {
      if (x < 0.0) x = -x;
      return x < 1.0 ? 1.0 - x : 0.0;
    },
    support: 1.0,
  },
  [BICUBIC]: {
    f: (x) => {
      const a = -0.5;
      if (x < 0.0) x = -x;
      if (x < 1.0) return ((a + 2.0) * x - (a + 3.0)) * x * x + 1;
      if (x < 2.0) return (((x - 5) * x + 8) * x - 4) * a;
      return 0.0;
    },
    support: 2.0,
  },
  [LANCZOS]: {
    f: (x) => (-3.0 <= x && x < 3.0 ? sinc(x) * sinc(x / 3) : 0.0),
    support: 3.0,
  },
};

const PRECISION_BITS = 32 - 8 - 2;

function hitungKoefisien(inSize: number, in0: number, in1: number, outSize: number, filter: FilterResample) {
  const scale = Math.fround(in1 - in0) / outSize;
  const filterscale = scale < 1.0 ? 1.0 : scale;
  const support = filter.support * filterscale;
  const ksize = Math.ceil(support) * 2 + 1;
  const kk = new Int32Array(outSize * ksize);
  const bounds = new Int32Array(outSize * 2);
  const invFilterscale = 1.0 / filterscale;
  const k = new Float64Array(ksize);
  for (let xx = 0; xx < outSize; xx++) {
    const center = in0 + (xx + 0.5) * scale;
    let ww = 0.0;
    let xmin = Math.trunc(center - support + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.trunc(center + support + 0.5);
    if (xmax > inSize) xmax = inSize;
    xmax -= xmin;
    k.fill(0);
    for (let x = 0; x < xmax; x++) {
      const w = filter.f((x + xmin - center + 0.5) * invFilterscale);
      k[x] = w;
      ww += w;
    }
    if (ww !== 0.0) for (let x = 0; x < xmax; x++) k[x] /= ww;
    // normalize_coeffs_8bpc
    for (let x = 0; x < ksize; x++) {
      const v = k[x];
      kk[xx * ksize + x] = v < 0 ? Math.trunc(-0.5 + v * (1 << PRECISION_BITS)) : Math.trunc(0.5 + v * (1 << PRECISION_BITS));
    }
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
  }
  return { ksize, kk, bounds };
}

const clip8 = (ss: number) => {
  const v = ss >> PRECISION_BITS;
  return v < 0 ? 0 : v > 255 ? 255 : v;
};

function resampleHorizontal(
  imIn: Gambar,
  outW: number,
  outH: number,
  offset: number,
  ko: { ksize: number; kk: Int32Array; bounds: Int32Array },
): Gambar {
  const b = imIn.bands;
  const out = new Uint8Array(outW * outH * b);
  const { ksize, kk, bounds } = ko;
  const src = imIn.data;
  const awal = 1 << (PRECISION_BITS - 1);
  for (let yy = 0; yy < outH; yy++) {
    const baris = (yy + offset) * imIn.w * b;
    let po = yy * outW * b;
    for (let xx = 0; xx < outW; xx++) {
      const xmin = bounds[xx * 2];
      const xmax = bounds[xx * 2 + 1];
      const kb = xx * ksize;
      if (b === 4) {
        // Empat kanal sekaligus: urutan penjumlahan bilangan bulat tidak
        // mengubah hasil, tapi akses memorinya jauh lebih rapat.
        let s0 = awal;
        let s1 = awal;
        let s2 = awal;
        let s3 = awal;
        let p = baris + xmin * 4;
        for (let x = 0; x < xmax; x++, p += 4) {
          const k = kk[kb + x];
          s0 += src[p] * k;
          s1 += src[p + 1] * k;
          s2 += src[p + 2] * k;
          s3 += src[p + 3] * k;
        }
        out[po] = clip8(s0);
        out[po + 1] = clip8(s1);
        out[po + 2] = clip8(s2);
        out[po + 3] = clip8(s3);
        po += 4;
      } else {
        let ss = awal;
        for (let x = 0; x < xmax; x++) ss += src[baris + x + xmin] * kk[kb + x];
        out[po++] = clip8(ss);
      }
    }
  }
  return new Gambar(imIn.mode, outW, outH, out);
}

function resampleVertikal(
  imIn: Gambar,
  outH: number,
  ko: { ksize: number; kk: Int32Array; bounds: Int32Array },
): Gambar {
  const b = imIn.bands;
  const w = imIn.w;
  const stride = w * b;
  const out = new Uint8Array(stride * outH);
  const { ksize, kk, bounds } = ko;
  const src = imIn.data;
  const awal = 1 << (PRECISION_BITS - 1);
  for (let yy = 0; yy < outH; yy++) {
    const ymin = bounds[yy * 2];
    const ymax = bounds[yy * 2 + 1];
    const kb = yy * ksize;
    const po = yy * stride;
    const r0 = ymin * stride;
    // Jalur cepat untuk 2-3 ketukan (perbesaran BILINEAR/BICUBIC), sisanya umum.
    // Semua sama dengan ss = awal + sum(src * k) bilangan bulat di C.
    if (ymax === 2) {
      const k0 = kk[kb];
      const k1 = kk[kb + 1];
      const r1 = r0 + stride;
      for (let i = 0; i < stride; i++) out[po + i] = clip8((awal + src[r0 + i] * k0 + src[r1 + i] * k1) | 0);
    } else if (ymax === 3) {
      const k0 = kk[kb];
      const k1 = kk[kb + 1];
      const k2 = kk[kb + 2];
      const r1 = r0 + stride;
      const r2 = r1 + stride;
      for (let i = 0; i < stride; i++) out[po + i] = clip8((awal + src[r0 + i] * k0 + src[r1 + i] * k1 + src[r2 + i] * k2) | 0);
    } else {
      for (let i = 0; i < stride; i++) {
        let ss = awal;
        for (let y = 0, p = r0 + i; y < ymax; y++, p += stride) ss += src[p] * kk[kb + y];
        out[po + i] = clip8(ss | 0);
      }
    }
  }
  return new Gambar(imIn.mode, w, outH, out);
}

/** ImagingResample (tanpa pra-perkalian; dipanggil oleh ubahUkuran). */
function resample(imIn: Gambar, xsize: number, ysize: number, filterId: number): Gambar {
  const filter = FILTER_RESAMPLE[filterId];
  if (!filter) throw new Error(`filter resize ${filterId} tidak didukung`);
  const box = [0, 0, imIn.w, imIn.h];
  const perluH = xsize !== imIn.w || box[0] !== 0 || box[2] !== xsize;
  const perluV = ysize !== imIn.h || box[1] !== 0 || box[3] !== ysize;
  const kv = hitungKoefisien(imIn.h, box[1], box[3], ysize, filter);
  const yAwal = kv.bounds[0];
  const yAkhir = kv.bounds[ysize * 2 - 2] + kv.bounds[ysize * 2 - 1];
  let im = imIn;
  if (perluH) {
    const kh = hitungKoefisien(imIn.w, box[0], box[2], xsize, filter);
    for (let i = 0; i < ysize; i++) kv.bounds[i * 2] -= yAwal;
    im = resampleHorizontal(imIn, xsize, yAkhir - yAwal, yAwal, kh);
  }
  if (perluV) im = resampleVertikal(im, ysize, kv);
  return im === imIn ? salin(imIn) : im;
}

/**
 * Image.resize(ukuran, filter). Bawaan Pillow = BICUBIC. RGBA dipra-kalikan
 * dulu (mode RGBa) supaya tepi transparan tidak menggelap.
 */
export function ubahUkuran(im: Gambar, w: number, h: number, filter: Filter = BICUBIC): Gambar {
  if (w === im.w && h === im.h) return salin(im);
  if (filter === NEAREST) {
    const a = [im.w / w, 0, 0, 0, im.h / h, 0];
    return transformAffine(im, w, h, a, NEAREST);
  }
  if (im.mode === "RGBA") return bukaKali(resample(praKali(im), w, h, filter));
  return resample(im, w, h, filter);
}

/** Image.thumbnail((maks, maks), filter): menjaga rasio, tidak memperbesar. */
export function thumbnail(im: Gambar, maksW: number, maksH: number, filter: Filter = BICUBIC): Gambar {
  let x = Math.floor(maksW);
  let y = Math.floor(maksH);
  if (x >= im.w && y >= im.h) return im;
  const aspek = im.w / im.h;
  const bulatAspek = (n: number, kunci: (v: number) => number) => {
    const a = Math.floor(n);
    const b = Math.ceil(n);
    // min(floor, ceil, key=...) mengambil yang pertama bila seri.
    return Math.max(kunci(b) < kunci(a) ? b : a, 1);
  };
  if (x / y >= aspek) {
    x = bulatAspek(y * aspek, (n) => Math.abs(aspek - n / y));
  } else {
    const xx = x;
    y = bulatAspek(x / aspek, (n) => (n === 0 ? 0 : Math.abs(aspek - xx / n)));
  }
  if (im.w === x && im.h === y) return im;
  // reducing_gap tidak ikut ke cabang RGBa di Image.resize, jadi tanpa reduce().
  return ubahUkuran(im, x, y, filter);
}

// ------------------------------------------------------------------
//  BoxBlur.c — GaussianBlur = tiga kotak dengan tepi pecahan
// ------------------------------------------------------------------

function radiusGauss(radius: number, passes: number): number {
  const f = Math.fround;
  const sigma2 = f(f(radius * radius) / passes);
  const L = f(Math.sqrt(12.0 * sigma2 + 1.0));
  const l = f(Math.floor((L - 1.0) / 2.0));
  let a = f(f(f(2 * l) + 1) * f(f(l * f(l + 1)) - f(3 * sigma2)));
  a = f(a / f(6 * f(sigma2 - f(f(l + 1) * f(l + 1)))));
  return f(l + a);
}

/**
 * ImagingLineBoxBlur8/32. Cabang-cabang tepi di C setara dengan jendela
 * berindeks terjepit [0, lastx]: acc(x) = acc(x-1) + in[x+r] - in[x-r-1] dan
 * bobot pecahan fw untuk in[x-r-1] + in[x+r+1] — semua bilangan bulat, jadi
 * hasilnya identik, tanpa closure per piksel.
 */
function blurBarisKotak(
  lineIn: Uint8Array,
  inOff: number,
  lineOut: Uint8Array,
  outOff: number,
  b: number,
  lastx: number,
  r: number,
  ww: number,
  fw: number,
): void {
  if (b === 4) {
    blurBarisKotak4(lineIn, inOff, lineOut, outOff, lastx, r, ww, fw);
    return;
  }
  // Satu kanal ("L"). Bagian tengah tanpa penjepitan indeks.
  const tengahAkhir = lastx - r - 1;
  let acc = 0;
  for (let i = -r - 1; i <= r - 1; i++) acc += lineIn[inOff + (i < 0 ? 0 : i > lastx ? lastx : i)];
  for (let x = 0, po = outOff; x <= lastx; x++, po++) {
    const iKurang = x - r - 1;
    const iTambah = x + r;
    let vKurang: number;
    let vTambah: number;
    let vJauh: number;
    if (iKurang >= 0 && x <= tengahAkhir) {
      vKurang = lineIn[inOff + iKurang];
      vTambah = lineIn[inOff + iTambah];
      vJauh = lineIn[inOff + iTambah + 1];
    } else {
      vKurang = lineIn[inOff + (iKurang < 0 ? 0 : iKurang)];
      vTambah = lineIn[inOff + (iTambah > lastx ? lastx : iTambah)];
      vJauh = lineIn[inOff + (iTambah + 1 > lastx ? lastx : iTambah + 1)];
    }
    acc += vTambah - vKurang;
    lineOut[po] = (acc * ww + (vKurang + vJauh) * fw + 8388608) >>> 24;
  }
}

/** Versi RGBA: indeks terjepit dihitung sekali per x untuk keempat kanal. */
function blurBarisKotak4(
  lineIn: Uint8Array,
  inOff: number,
  lineOut: Uint8Array,
  outOff: number,
  lastx: number,
  r: number,
  ww: number,
  fw: number,
): void {
  let a0 = 0;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  for (let i = -r - 1; i <= r - 1; i++) {
    const p = inOff + (i < 0 ? 0 : i > lastx ? lastx : i) * 4;
    a0 += lineIn[p];
    a1 += lineIn[p + 1];
    a2 += lineIn[p + 2];
    a3 += lineIn[p + 3];
  }
  for (let x = 0, po = outOff; x <= lastx; x++, po += 4) {
    const iKurang = x - r - 1;
    const iTambah = x + r;
    const pK = inOff + (iKurang < 0 ? 0 : iKurang) * 4;
    const pT = inOff + (iTambah > lastx ? lastx : iTambah) * 4;
    const pJ = inOff + (iTambah + 1 > lastx ? lastx : iTambah + 1) * 4;
    let k = lineIn[pK];
    a0 += lineIn[pT] - k;
    lineOut[po] = (a0 * ww + (k + lineIn[pJ]) * fw + 8388608) >>> 24;
    k = lineIn[pK + 1];
    a1 += lineIn[pT + 1] - k;
    lineOut[po + 1] = (a1 * ww + (k + lineIn[pJ + 1]) * fw + 8388608) >>> 24;
    k = lineIn[pK + 2];
    a2 += lineIn[pT + 2] - k;
    lineOut[po + 2] = (a2 * ww + (k + lineIn[pJ + 2]) * fw + 8388608) >>> 24;
    k = lineIn[pK + 3];
    a3 += lineIn[pT + 3] - k;
    lineOut[po + 3] = (a3 * ww + (k + lineIn[pJ + 3]) * fw + 8388608) >>> 24;
  }
}

function blurHorizontal(im: Gambar, floatRadius: number): Gambar {
  const radius = Math.trunc(floatRadius);
  const ww = Math.trunc(Math.fround(16777216 / Math.fround(Math.fround(floatRadius * 2) + 1)));
  const fw = Math.trunc((16777216 - (radius * 2 + 1) * ww) / 2);
  const b = im.bands;
  const out = new Uint8Array(im.data.length);
  const stride = im.w * b;
  for (let y = 0; y < im.h; y++) {
    blurBarisKotak(im.data, y * stride, out, y * stride, b, im.w - 1, radius, ww, fw);
  }
  return new Gambar(im.mode, im.w, im.h, out);
}

function transposisi(im: Gambar): Gambar {
  const b = im.bands;
  const out = new Uint8Array(im.data.length);
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      const ps = (y * im.w + x) * b;
      const pd = (x * im.h + y) * b;
      for (let c = 0; c < b; c++) out[pd + c] = im.data[ps + c];
    }
  }
  return new Gambar(im.mode, im.h, im.w, out);
}

/** ImageFilter.GaussianBlur(radius) — RGBA diburamkan tanpa pra-perkalian, seperti Pillow. */
export function gaussianBlur(im: Gambar, radius: number): Gambar {
  const r = Math.fround(radius);
  if (r === 0) return salin(im);
  if (im.w === 0 || im.h === 0) return salin(im);
  const passes = 3;
  const xr = radiusGauss(r, passes);
  let hasil = im;
  if (xr !== 0) {
    hasil = blurHorizontal(im, xr);
    for (let i = 1; i < passes; i++) hasil = blurHorizontal(hasil, xr);
  }
  if (xr !== 0) {
    let t = transposisi(hasil);
    for (let i = 0; i < passes; i++) t = blurHorizontal(t, xr);
    hasil = transposisi(t);
  }
  return hasil === im ? salin(im) : hasil;
}

// ------------------------------------------------------------------
//  Geometry.c — transform affine, rotate, transpose
// ------------------------------------------------------------------

const COORD = (v: number) => (v < 0.0 ? -1 : Math.trunc(v));
const LANTAI = (v: number) => (v < 0.0 ? Math.floor(v) : Math.trunc(v));

function sampelBilinear(im: Gambar, xin: number, yin: number, out: Uint8Array, po: number): boolean {
  if (xin < 0.0 || xin >= im.w || yin < 0.0 || yin >= im.h) return false;
  xin -= 0.5;
  yin -= 0.5;
  const x = LANTAI(xin);
  const y = LANTAI(yin);
  const dx = xin - x;
  const dy = yin - y;
  const b = im.bands;
  const s = im.data;
  const W = im.w;
  const xc0 = (x < 0 ? 0 : x < W ? x : W - 1) * b;
  const xc1 = (x + 1 < 0 ? 0 : x + 1 < W ? x + 1 : W - 1) * b;
  const yc = y < 0 ? 0 : y < im.h ? y : im.h - 1;
  const ada2 = y + 1 >= 0 && y + 1 < im.h;
  const p1 = yc * W * b;
  const p2 = (y + 1) * W * b;
  for (let c = 0; c < b; c++) {
    const a0 = s[p1 + xc0 + c];
    let v1 = a0 + (s[p1 + xc1 + c] - a0) * dx;
    let v2 = v1;
    if (ada2) {
      const b0 = s[p2 + xc0 + c];
      v2 = b0 + (s[p2 + xc1 + c] - b0) * dx;
    }
    v1 = v1 + (v2 - v1) * dy;
    out[po + c] = Math.trunc(v1) & 0xff;
  }
  return true;
}

function kubik(v1: number, v2: number, v3: number, v4: number, d: number): number {
  const p1 = v2;
  const p2 = -v1 + v3;
  const p3 = 2 * (v1 - v2) + v3 - v4;
  const p4 = -v1 + v2 - v3 + v4;
  return p1 + d * (p2 + d * (p3 + d * p4));
}

function sampelBikubik(im: Gambar, xin: number, yin: number, out: Uint8Array, po: number): boolean {
  if (xin < 0.0 || xin >= im.w || yin < 0.0 || yin >= im.h) return false;
  xin -= 0.5;
  yin -= 0.5;
  let x = LANTAI(xin);
  let y = LANTAI(yin);
  const dx = xin - x;
  const dy = yin - y;
  x--;
  y--;
  const b = im.bands;
  const s = im.data;
  const W = im.w;
  const H = im.h;
  const x0 = (x < 0 ? 0 : x < W ? x : W - 1) * b;
  const x1 = (x + 1 < 0 ? 0 : x + 1 < W ? x + 1 : W - 1) * b;
  const x2 = (x + 2 < 0 ? 0 : x + 2 < W ? x + 2 : W - 1) * b;
  const x3 = (x + 3 < 0 ? 0 : x + 3 < W ? x + 3 : W - 1) * b;
  const yc = y < 0 ? 0 : y < H ? y : H - 1;
  const r1 = yc * W * b;
  const ada2 = y + 1 >= 0 && y + 1 < H;
  const ada3 = y + 2 >= 0 && y + 2 < H;
  const ada4 = y + 3 >= 0 && y + 3 < H;
  const r2 = (y + 1) * W * b;
  const r3 = (y + 2) * W * b;
  const r4 = (y + 3) * W * b;
  for (let c = 0; c < b; c++) {
    const v1 = kubik(s[r1 + x0 + c], s[r1 + x1 + c], s[r1 + x2 + c], s[r1 + x3 + c], dx);
    const v2 = ada2 ? kubik(s[r2 + x0 + c], s[r2 + x1 + c], s[r2 + x2 + c], s[r2 + x3 + c], dx) : v1;
    const v3 = ada3 ? kubik(s[r3 + x0 + c], s[r3 + x1 + c], s[r3 + x2 + c], s[r3 + x3 + c], dx) : v2;
    const v4 = ada4 ? kubik(s[r4 + x0 + c], s[r4 + x1 + c], s[r4 + x2 + c], s[r4 + x3 + c], dx) : v3;
    const v = kubik(v1, v2, v3, v4, dy);
    out[po + c] = v <= 0.0 ? 0 : v >= 255.0 ? 255 : Math.trunc(v);
  }
  return true;
}

/** ImagingTransformAffine tanpa pra-perkalian (fill=1: piksel luar = 0). */
function affineMentah(im: Gambar, w: number, h: number, a: number[], filter: number): Gambar {
  const b = im.bands;
  const out = new Uint8Array(w * h * b);
  if (filter === BILINEAR || filter === BICUBIC) {
    const sampel = filter === BILINEAR ? sampelBilinear : sampelBikubik;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xin = x + 0.5;
        const yin = y + 0.5;
        sampel(im, a[0] * xin + a[1] * yin + a[2], a[3] * xin + a[4] * yin + a[5], out, (y * w + x) * b);
      }
    }
    return new Gambar(im.mode, w, h, out);
  }
  if (filter !== NEAREST) throw new Error(`filter transform ${filter} tidak didukung`);
  const salinPiksel = (xs: number, ys: number, po: number) => {
    const ps = (ys * im.w + xs) * b;
    for (let c = 0; c < b; c++) out[po + c] = im.data[ps + c];
  };
  if (a[1] === 0 && a[3] === 0) {
    // ImagingScaleAffine
    const xintab = new Int32Array(w);
    let xo = a[2] + a[0] * 0.5;
    let yo = a[5] + a[4] * 0.5;
    let xmin = w;
    let xmax = 0;
    for (let x = 0; x < w; x++) {
      const xi = COORD(xo);
      if (xi >= 0 && xi < im.w) {
        xmax = x + 1;
        if (x < xmin) xmin = x;
        xintab[x] = xi;
      }
      xo += a[0];
    }
    for (let y = 0; y < h; y++) {
      const yi = COORD(yo);
      if (yi >= 0 && yi < im.h) for (let x = xmin; x < xmax; x++) salinPiksel(xintab[x], yi, (y * w + x) * b);
      yo += a[4];
    }
    return new Gambar(im.mode, w, h, out);
  }
  const cekTetap = (x: number, y: number) =>
    Math.abs(x * a[0] + y * a[1] + a[2]) < 32768.0 && Math.abs(x * a[3] + y * a[4] + a[5]) < 32768.0;
  if (cekTetap(0, 0) && cekTetap(w, h) && cekTetap(0, h) && cekTetap(w, 0)) {
    const FIX = (v: number) => LANTAI(v * 65536.0 + 0.5);
    const a0 = FIX(a[0]);
    const a1 = FIX(a[1]);
    const a3 = FIX(a[3]);
    const a4 = FIX(a[4]);
    let a2 = FIX(a[2] + a[0] * 0.5 + a[1] * 0.5);
    let a5 = FIX(a[5] + a[3] * 0.5 + a[4] * 0.5);
    for (let y = 0; y < h; y++) {
      let xx = a2;
      let yy = a5;
      for (let x = 0; x < w; x++) {
        const xi = xx >> 16;
        if (xi >= 0 && xi < im.w) {
          const yi = yy >> 16;
          if (yi >= 0 && yi < im.h) salinPiksel(xi, yi, (y * w + x) * b);
        }
        xx = (xx + a0) | 0;
        yy = (yy + a3) | 0;
      }
      a2 = (a2 + a1) | 0;
      a5 = (a5 + a4) | 0;
    }
    return new Gambar(im.mode, w, h, out);
  }
  let xo = a[2] + a[1] * 0.5 + a[0] * 0.5;
  let yo = a[5] + a[4] * 0.5 + a[3] * 0.5;
  for (let y = 0; y < h; y++) {
    let xx = xo;
    let yy = yo;
    for (let x = 0; x < w; x++) {
      const xi = COORD(xx);
      if (xi >= 0 && xi < im.w) {
        const yi = COORD(yy);
        if (yi >= 0 && yi < im.h) salinPiksel(xi, yi, (y * w + x) * b);
      }
      xx += a[0];
      yy += a[3];
    }
    xo += a[1];
    yo += a[4];
  }
  return new Gambar(im.mode, w, h, out);
}

/** Image.transform((w, h), AFFINE, data, resample). */
export function transformAffine(im: Gambar, w: number, h: number, data: readonly number[], filter: Filter = NEAREST): Gambar {
  const a = data.slice(0, 6) as number[];
  if (im.mode === "RGBA" && filter !== NEAREST) return bukaKali(affineMentah(praKali(im), w, h, a, filter));
  return affineMentah(im, w, h, a, filter);
}

export function putar180(im: Gambar): Gambar {
  const b = im.bands;
  const out = new Uint8Array(im.data.length);
  const n = im.w * im.h;
  for (let i = 0; i < n; i++) for (let c = 0; c < b; c++) out[(n - 1 - i) * b + c] = im.data[i * b + c];
  return new Gambar(im.mode, im.w, im.h, out);
}

/** Transpose.ROTATE_90 (berlawanan jarum jam): out[w-1-x][y] = in[y][x]. */
export function putar90(im: Gambar): Gambar {
  const b = im.bands;
  const out = new Uint8Array(im.data.length);
  const W = im.h;
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      const pd = ((im.w - 1 - x) * W + y) * b;
      const ps = (y * im.w + x) * b;
      for (let c = 0; c < b; c++) out[pd + c] = im.data[ps + c];
    }
  }
  return new Gambar(im.mode, im.h, im.w, out);
}

/** Transpose.ROTATE_270: out[x][h-1-y] = in[y][x]. */
export function putar270(im: Gambar): Gambar {
  const b = im.bands;
  const out = new Uint8Array(im.data.length);
  const W = im.h;
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      const pd = (x * W + (im.h - 1 - y)) * b;
      const ps = (y * im.w + x) * b;
      for (let c = 0; c < b; c++) out[pd + c] = im.data[ps + c];
    }
  }
  return new Gambar(im.mode, im.h, im.w, out);
}

/** round(x, 15) Python (setengah-genap pada nilai desimal tepat). */
function bulat15(x: number): number {
  return Number(x.toFixed(15));
}

/** Modulo float Python: hasil bertanda sama dengan pembagi. */
export function modPy(a: number, b: number): number {
  const m = a % b;
  if (m !== 0 && m < 0 !== b < 0) return m + b;
  return m === 0 ? (b < 0 ? -0 : 0) : m;
}

/** Image.rotate(sudut, resample, expand) — termasuk jalur cepat transpose. */
export function putar(im: Gambar, sudutDerajat: number, filter: Filter = NEAREST, expand = false): Gambar {
  const sudut = modPy(sudutDerajat, 360.0);
  if (sudut === 0) return salin(im);
  if (sudut === 180) return putar180(im);
  if ((sudut === 90 || sudut === 270) && (expand || im.w === im.h)) return sudut === 90 ? putar90(im) : putar270(im);
  let w = im.w;
  let h = im.h;
  const cx = w / 2;
  const cy = h / 2;
  const rad = -(sudut * (Math.PI / 180));
  const m = [bulat15(Math.cos(rad)), bulat15(Math.sin(rad)), 0.0, bulat15(-Math.sin(rad)), bulat15(Math.cos(rad)), 0.0];
  const tr = (x: number, y: number): [number, number] => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
  [m[2], m[5]] = tr(-cx - 0, -cy - 0);
  m[2] += cx;
  m[5] += cy;
  if (expand) {
    const xx: number[] = [];
    const yy: number[] = [];
    for (const [x, y] of [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ]) {
      const [tx, ty] = tr(x, y);
      xx.push(tx);
      yy.push(ty);
    }
    const nw = Math.ceil(Math.max(...xx)) - Math.floor(Math.min(...xx));
    const nh = Math.ceil(Math.max(...yy)) - Math.floor(Math.min(...yy));
    [m[2], m[5]] = tr(-(nw - w) / 2.0, -(nh - h) / 2.0);
    w = nw;
    h = nh;
  }
  return transformAffine(im, w, h, m, filter);
}

/** Byte RGB untuk ffmpeg (frame.convert("RGB").tobytes()). */
export function keRgb(im: Gambar, tujuan?: Uint8Array): Uint8Array {
  const n = im.w * im.h;
  const out = tujuan ?? new Uint8Array(n * 3);
  const s = im.data;
  for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) {
    out[k] = s[j];
    out[k + 1] = s[j + 1];
    out[k + 2] = s[j + 2];
  }
  return out;
}
