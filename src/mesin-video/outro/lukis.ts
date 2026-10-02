// Unsur gambar outro mode "biasa": latar, gerak latar, dekorasi, badge,
// ikon platform, teks, dan tata letak — cermin bagian ALAT GAMBAR sampai
// TATA LETAK di outro.py.
//
// Bagian numpy ditulis ulang per piksel dengan Math.fround di tiap langkah:
// numpy menghitung array float32 dan skalar Python dibulatkan ke float32
// dulu (NEP 50), jadi urutan dan pembulatannya diikuti satu per satu.
// Tanpa itu, astype(uint8) (pemotongan, bukan pembulatan) mudah meleset 1.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  alphaComposite,
  ambilKanal,
  baru,
  BICUBIC,
  BILINEAR,
  Gambar,
  gaussianBlur,
  kompositPiksel,
  LANCZOS,
  pasangAlpha,
  point,
  potong,
  putar,
  tempelMasker,
  thumbnail,
  transformAffine,
  ubahUkuran,
  type Warna,
} from "./gambar";
import { ASET, FONT, FONT_LAIN, WARNA_MEREK, type Gaya, type KunciAkun, type RGB } from "./gaya";
import { bukaFont, type Fonta } from "./huruf";
import { Kuas } from "./kuas";
import { expF32 } from "./numerik";
import { AcakNumpy, AcakPython } from "./prng";
import { FONT_BUNDLED } from "../konfig";

const f32 = Math.fround;
const TAU = 2 * Math.PI;

export function modPy(a: number, b: number): number {
  const m = a % b;
  return m !== 0 && m < 0 !== b < 0 ? m + b : m;
}

/** Pembagian lantai Python (//) untuk bilangan bulat. */
export const bagi = (a: number, b: number) => Math.floor(a / b);

// ------------------------------------------------------------------
//  ALAT GAMBAR
// ------------------------------------------------------------------

export function font(ukuran: number, nama = "poppins"): Fonta {
  const jalur = FONT[nama] ?? FONT_LAIN[nama] ?? FONT.poppins;
  return bukaFont(jalur, ukuran, FONT_BUNDLED);
}

export const clamp = (v: number, lo = 0.0, hi = 1.0) => (v < lo ? lo : v > hi ? hi : v);

export function halus(t: number): number {
  t = clamp(t);
  return t * t * (3 - 2 * t);
}

export function lenting(t: number): number {
  t = clamp(t);
  const c1 = 1.70158;
  const c3 = 2.70158;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/** _teks_gambar: teks + bayangan tiga lapis, opsional dimiringkan. */
export function teksGambar(teks: string, ukuran: number, warna: Warna, miring = false, namaFont = "poppins"): Gambar {
  const f = font(ukuran, namaFont);
  const [x0, y0, x1, y1] = f.textbbox([0, 0], teks);
  const tepi = Math.max(6, bagi(ukuran, 6));
  const geser = miring ? Math.trunc((y1 - y0) * 0.22) : 0;
  let im = baru("RGBA", x1 - x0 + 2 * tepi + geser, y1 - y0 + 2 * tepi, [0, 0, 0, 0]);
  const ox = tepi - x0;
  const oy = tepi - y0;
  for (const [dx, dy] of [
    [2, 3],
    [3, 2],
    [0, 3],
  ]) {
    f.gambar(im, [ox + dx, oy + dy], teks, [0, 0, 0, 150]);
  }
  f.gambar(im, [ox, oy], teks, warna);
  if (miring) im = transformAffine(im, im.w, im.h, [1, 0.22, -geser, 0, 1, 0], BICUBIC);
  return im;
}

/** _tempel: alpha_composite yang terpotong di tepi, dengan alfa tambahan. */
export function tempel(dasar: Gambar, lapisan: Gambar, x: number, y: number, alpha = 1.0): void {
  if (alpha <= 0) return;
  if (alpha < 1) {
    const a = point(ambilKanal(lapisan, 3), (v) => Math.trunc(v * alpha));
    lapisan = new Gambar("RGBA", lapisan.w, lapisan.h, lapisan.data.slice());
    pasangAlpha(lapisan, a);
  }
  const w = lapisan.w;
  const h = lapisan.h;
  const sx0 = Math.max(0, -x);
  const sy0 = Math.max(0, -y);
  const sx1 = Math.min(w, dasar.w - x);
  const sy1 = Math.min(h, dasar.h - y);
  if (sx1 <= sx0 || sy1 <= sy0) return;
  if (sx0 !== 0 || sy0 !== 0 || sx1 !== w || sy1 !== h) {
    lapisan = potong(lapisan, sx0, sy0, sx1, sy1);
    x += sx0;
    y += sy0;
  }
  alphaComposite(dasar, lapisan, x, y);
}

export function skala(im: Gambar, faktor: number): Gambar {
  if (Math.abs(faktor - 1.0) < 1e-3) return im;
  return ubahUkuran(im, Math.max(2, Math.trunc(im.w * faktor)), Math.max(2, Math.trunc(im.h * faktor)));
}

const lebihTerang = (c: RGB, k: number): RGB => [Math.min(255, c[0] + k), Math.min(255, c[1] + k), Math.min(255, c[2] + k)];
const rgba = (c: RGB, a: number): Warna => [c[0], c[1], c[2], a];

/** np.linspace(0, 1, n, dtype=float32): dihitung di float64 lalu dipotong ke float32. */
export function linspace32(n: number): Float32Array {
  const out = new Float32Array(n);
  if (n === 1) {
    out[0] = 0;
    return out;
  }
  const step = 1.0 / (n - 1);
  for (let i = 0; i < n; i++) out[i] = i * step + 0;
  out[n - 1] = 1.0;
  return out;
}

const u8 = (v: number) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.trunc(v));

// ------------------------------------------------------------------
//  LATAR (statis per gaya) + GERAKAN LATAR (per frame)
// ------------------------------------------------------------------

export function latar(w: number, h: number, g: Gaya): Gambar {
  const ys = linspace32(h);
  const xs = linspace32(w);
  const atas = g.atas;
  const bawah = g.bawah;
  const radial = g.latar === "radial";
  const [sx, sy] = g.acak < 0.5 ? [0.88, 0.94] : [0.12, 0.08];
  const fsx = f32(sx);
  const fsy = f32(sy);
  const k06 = f32(0.6);
  const k042 = f32(0.42);
  const k16 = f32(1.6);
  const k07 = f32(0.7);
  const k03 = f32(0.3);
  const k11 = f32(1.1);
  const k022 = f32(0.22);
  const k018 = f32(0.18);
  const butir = g.latar === "butir" ? new AcakNumpy(g.seed) : null;
  const data = new Uint8Array(w * h * 4);
  const dasar = new Float32Array(3);
  // Bagian x yang tidak bergantung y dihitung sekali.
  const dxGlow = new Float32Array(w);
  const vx2 = new Float32Array(w);
  const dxRad = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const t = f32(xs[x] - fsx);
    dxGlow[x] = f32(f32(t * t) * k11);
    const vx = f32(f32(xs[x] - 0.5) * 2);
    vx2[x] = f32(vx * vx);
    const r = f32(xs[x] - 0.5);
    dxRad[x] = f32(f32(r * r) * k06);
  }
  for (let y = 0; y < h; y++) {
    const yv = ys[y];
    const ty = f32(yv - fsy);
    const dyGlow = f32(f32(ty * ty) * k16);
    const vy = f32(f32(yv - 0.5) * 2);
    const vy2 = f32(vy * vy);
    const ry = f32(yv - k042);
    const ry2 = f32(ry * ry);
    const uY = f32(k07 * yv);
    for (let x = 0; x < w; x++) {
      let u: number;
      if (radial) {
        u = f32(f32(Math.sqrt(f32(dxRad[x] + ry2))) * k16);
        u = clamp(u, 0, 1);
        for (let c = 0; c < 3; c++) dasar[c] = f32(bawah[c] + f32((atas[c] - bawah[c]) * u));
      } else {
        u = g.acak < 0.5 ? yv : clamp(f32(uY + f32(k03 * xs[x])), 0, 1);
        for (let c = 0; c < 3; c++) dasar[c] = f32(atas[c] + f32((bawah[c] - atas[c]) * u));
      }
      const d2 = f32(dxGlow[x] + dyGlow);
      const e = f32(expF32(f32(-d2 / k022)));
      const vig = f32(1.0 - f32(k018 * clamp(f32(vx2[x] + vy2), 0, 1)));
      for (let c = 0; c < 3; c++) {
        dasar[c] = f32(f32(dasar[c] + f32(e * g.glow[c])) * vig);
      }
      if (butir) {
        // size=(h, w, 1): satu sampel per piksel, dipakai ke tiga kanal.
        const n = f32(butir.normal(0, 9));
        for (let c = 0; c < 3; c++) dasar[c] = f32(dasar[c] + n);
      }
      const p = (y * w + x) * 4;
      data[p] = u8(dasar[0]);
      data[p + 1] = u8(dasar[1]);
      data[p + 2] = u8(dasar[2]);
      data[p + 3] = 255;
    }
  }
  const im = new Gambar("RGBA", w, h, data);

  const lap = baru("RGBA", w, h, [0, 0, 0, 0]);
  const d = new Kuas(lap);
  const jenis = g.latar;
  if (jenis === "titik") {
    const c = rgba(g.dekor2, 70);
    for (let yy = 28; yy < h; yy += 56) for (let xx = 28; xx < w; xx += 56) d.ellipse([xx - 3, yy - 3, xx + 3, yy + 3], c);
  } else if (jenis === "garis-miring") {
    for (let k = -h; k < w + h; k += 90) d.line([[k, 0], [k + h, h]], rgba(g.dekor1, 55), 3);
  } else if (jenis === "heks") {
    const r = 54;
    let j = 0;
    for (let yy = 0; yy < h + r; yy += Math.trunc(r * 1.5), j++) {
      for (let xx = 0; xx < w + r; xx += Math.trunc(r * 1.732)) {
        const cx = xx + (j % 2 ? r * 0.866 : 0);
        const pts: [number, number][] = [];
        for (let i = 0; i < 6; i++) {
          const a = (60 * i + 30) * (Math.PI / 180);
          pts.push([cx + r * 0.9 * Math.cos(a), yy + r * 0.9 * Math.sin(a)]);
        }
        d.polygon(pts, null, rgba(g.dekor2, 50));
      }
    }
  } else if (jenis === "kotak") {
    const s = 80;
    let j = 0;
    for (let yy = 0; yy < h; yy += s, j++) {
      let i = 0;
      for (let xx = 0; xx < w; xx += s, i++) if ((i + j) % 2 === 0) d.rectangle([xx, yy, xx + s, yy + s], [255, 255, 255, 8]);
    }
  } else if (jenis === "gumpal") {
    const rnd = new AcakPython(g.seed + 7);
    for (const warna of [g.dekor1, g.dekor2, g.aksen]) {
      const cx = rnd.uniform(0.1, 0.9) * w;
      const cy = rnd.uniform(0.1, 0.9) * h;
      const r = rnd.uniform(0.25, 0.45) * w;
      d.ellipse([cx - r, cy - r * 0.8, cx + r, cy + r * 0.8], rgba(warna, 60));
    }
    alphaComposite(im, gaussianBlur(lap, w * 0.12));
    return im;
  }
  alphaComposite(im, lap);
  return im;
}

function sinar(w: number, g: Gaya): Gambar {
  // Kipas berpusat di badge; 1,25x LEBAR layar cukup (lihat outro.py).
  const n = Math.trunc(w * 1.25);
  const im = baru("RGBA", n, n, [0, 0, 0, 0]);
  const d = new Kuas(im);
  const c = n / 2;
  for (let i = 0; i < 14; i++) {
    const a = (i * TAU) / 14;
    d.polygon(
      [
        [c, c],
        [c + n * Math.cos(a - 0.06), c + n * Math.sin(a - 0.06)],
        [c + n * Math.cos(a + 0.06), c + n * Math.sin(a + 0.06)],
      ],
      rgba(g.dekor2, 38),
    );
  }
  return gaussianBlur(im, 6);
}

export type CacheGerak = Map<string, unknown>;

/** _gerak_latar: lapisan latar yang bergerak tiap frame. */
export function gerakLatar(frame: Gambar, w: number, h: number, t: number, g: Gaya, cache: CacheGerak): void {
  const jenis = g.latar;
  if (jenis === "sapuan") {
    const sudut = g.sudut_sapuan;
    const cs = f32(Math.cos(sudut));
    const sn = f32(Math.sin(sudut));
    const pmax = w * Math.cos(sudut) + h * Math.sin(sudut);
    const pos = f32(pmax * (0.1 + 0.8 * modPy(t / g.durasi, 1.0)));
    const pembagi = f32(2 * 150.0 ** 2);
    let projX = cache.get("sapuan_x") as Float32Array | undefined;
    if (!projX) {
      projX = new Float32Array(w);
      for (let x = 0; x < w; x++) projX[x] = f32(x * cs);
      cache.set("sapuan_x", projX);
    }
    // Lapisan sapuan = warna aksen2 dengan alfa dari kurva Gauss. Alih-alih
    // membuat lapisan penuh lalu alpha_composite, piksel beralfa > 0 langsung
    // dikomposit dengan rumus yang sama — hasilnya identik. Hanya pita
    // |selisih| <= 480 yang dihitung (di luar itu exp(..)*110 < 1 -> alfa 0);
    // sudut sapuan 18..62 derajat jadi selisih naik seiring x.
    const [ar, ag, ab] = g.aksen2;
    for (let y = 0; y < h; y++) {
      const py = f32(y * sn);
      const xAwal = Math.max(0, Math.floor((pos - 480 - py) / cs) - 2);
      const xAkhir = Math.min(w - 1, Math.ceil((pos + 480 - py) / cs) + 2);
      for (let x = xAwal; x <= xAkhir; x++) {
        const selisih = f32(f32(projX[x] + py) - pos);
        if (selisih > 480 || selisih < -480) continue;
        const sweep = f32(expF32(f32(-f32(selisih * selisih) / pembagi)));
        const a = Math.trunc(f32(sweep * 110));
        if (a === 0) continue;
        kompositPiksel(frame, x, y, ar, ag, ab, a);
      }
    }
  } else if (jenis === "partikel") {
    let partikel = cache.get("partikel") as number[][] | undefined;
    if (!partikel) {
      const rnd = new AcakPython(g.seed + 3);
      partikel = [];
      for (let i = 0; i < 70; i++) {
        partikel.push([rnd.uniform(0, w), rnd.uniform(0, h), rnd.uniform(2, 5), rnd.uniform(8, 30), rnd.uniform(0, TAU)]);
      }
      cache.set("partikel", partikel);
    }
    const lap = baru("RGBA", w, h, [0, 0, 0, 0]);
    const d = new Kuas(lap);
    for (const [px, py, r, v, ph] of partikel) {
      const y = modPy(py - v * t, h);
      const a = Math.trunc(120 + 100 * (0.5 + 0.5 * Math.sin(ph + t * 2.0)));
      d.ellipse([px - r, y - r, px + r, y + r], rgba(g.aksen2, a));
    }
    alphaComposite(frame, lap);
  } else if (jenis === "bokeh") {
    let bokeh = cache.get("bokeh") as number[][] | undefined;
    if (!bokeh) {
      const rnd = new AcakPython(g.seed + 5);
      bokeh = [];
      for (let i = 0; i < 12; i++) {
        bokeh.push([rnd.uniform(0, w), rnd.uniform(0, h), rnd.uniform(40, 130), rnd.uniform(4, 14), rnd.uniform(0, TAU)]);
      }
      cache.set("bokeh", bokeh);
    }
    const q = 4;
    const lap = baru("RGBA", bagi(w, q), bagi(h, q), [0, 0, 0, 0]);
    const d = new Kuas(lap);
    for (const [px, py, r, v, ph] of bokeh) {
      const y = modPy(py - v * t, h);
      const x = px + 30 * Math.sin(ph + t * 0.6);
      d.ellipse([(x - r) / q, (y - r) / q, (x + r) / q, (y + r) / q], rgba(g.dekor2, 28));
    }
    alphaComposite(frame, ubahUkuran(gaussianBlur(lap, 18 / q), w, h, BILINEAR));
  } else if (jenis === "sinar") {
    if (!cache.has("sinar")) {
      const penuh = sinar(w, g);
      cache.set("sinar_n", penuh.w);
      cache.set("sinar", ubahUkuran(penuh, bagi(penuh.w, 4), bagi(penuh.h, 4), BILINEAR));
    }
    const n = cache.get("sinar_n") as number;
    const s = ubahUkuran(putar(cache.get("sinar") as Gambar, t * 6.0, BILINEAR), n, n, BILINEAR);
    tempel(frame, s, bagi(w, 2) - bagi(n, 2), Math.trunc(h * 0.33) - bagi(n, 2), 1.0);
  } else if (jenis === "pita-halus") {
    const q = 4;
    const lap = baru("RGBA", bagi(w, q), bagi(h, q), [0, 0, 0, 0]);
    const d = new Kuas(lap);
    for (let k = 0; k < 5; k++) {
      const titik: [number, number][] = [];
      for (let x = 0; x < w + 40; x += 40) {
        titik.push([x / q, (h * (0.25 + 0.14 * k) + 40 * Math.sin(x / 180 + t * 1.2 + k)) / q]);
      }
      d.line(titik, rgba(g.dekor2, 40), Math.max(2, bagi(26, q)));
    }
    alphaComposite(frame, ubahUkuran(gaussianBlur(lap, 8 / q), w, h, BILINEAR));
  } else if (jenis === "sorot") {
    const q = 4;
    const lap = baru("RGBA", bagi(w, q), bagi(h, q), [0, 0, 0, 0]);
    const d = new Kuas(lap);
    const cx = w * (0.5 + 0.35 * Math.sin(t * 0.7));
    const r = w * 0.55;
    d.ellipse([(cx - r) / q, (h * 0.3 - r) / q, (cx + r) / q, (h * 0.3 + r) / q], rgba(g.dekor2, 34));
    alphaComposite(frame, ubahUkuran(gaussianBlur(lap, 70 / q), w, h, BILINEAR));
  }
}

// ------------------------------------------------------------------
//  DEKORASI
// ------------------------------------------------------------------

/**
 * x ** e Python untuk e pecahan: basis negatif menghasilkan bilangan
 * kompleks, lalu int() di pemanggil gagal dengan TypeError ini. Terjadi bila
 * OUTRO_VIDEO_W bukan kelipatan 40 (titik gelombang melewati tepi kanan);
 * pesannya ditiru supaya job gagal dengan teks yang sama seperti versi Python.
 */
export function pangkatPy(basis: number, e: number): number {
  if (basis < 0 && !Number.isInteger(e)) {
    throw new TypeError("int() argument must be a string, a bytes-like object or a real number, not 'complex'");
  }
  return basis ** e;
}

function gelombang(kuas: Kuas, w: number, h: number, t: number, naik: number, g: Gaya, kanan: boolean): void {
  const dasarY = h + 60 - Math.trunc(300 * naik);
  const lapis: [RGB, number, number, number, number][] = [
    [g.dekor1, 0.0, 0, 300, 0.7],
    [g.dekor2, 1.7, 70, 225, 0.9],
    [g.aksen, 3.3, 150, 150, 1.15],
  ];
  for (const [isi, fase, turun, naikKanan, kec] of lapis) {
    const titik: [number, number][] = [];
    for (let x = 0; x < w + 40; x += 40) {
      const u = kanan ? x / w : 1 - x / w;
      const y =
        dasarY + turun + 140 * pangkatPy(1 - u, 1.2) - naikKanan * pangkatPy(u, 1.7) -
        34 * Math.sin(u * 3.6 + fase + t * kec) - 18 * Math.sin(u * 7.9 - fase * 0.6 + t * kec * 0.7);
      titik.push([x, Math.trunc(y)]);
    }
    kuas.polygon([...titik, [w, h], [0, h]], rgba(isi, 255));
    kuas.line(titik, rgba(lebihTerang(isi, 40), 255), 3);
  }
}

export function dekor(frame: Gambar, w: number, h: number, t: number, g: Gaya, pusat: [number, number], D: number): void {
  const jenis = g.dekor;
  const naik = halus(t / 0.9);
  if (jenis === "tanpa") return;
  if (jenis === "gelombang-kanan" || jenis === "gelombang-kiri") {
    gelombang(new Kuas(frame), w, h, t, naik, g, jenis === "gelombang-kanan");
    return;
  }
  const lap = baru("RGBA", w, h, [0, 0, 0, 0]);
  const d = new Kuas(lap);
  const [cx, cy] = pusat;
  if (jenis === "pita") {
    const geser = Math.trunc((1 - naik) * 400);
    [g.dekor1, g.dekor2, g.aksen].forEach((warna, i) => {
      const y0 = h - 420 + i * 120 + geser + Math.trunc(8 * Math.sin(t * 1.5 + i));
      d.polygon([[0, y0 + 160], [w, y0 - 60], [w, y0 + 40], [0, y0 + 260]], rgba(warna, 230));
    });
  } else if (jenis === "cincin") {
    for (let i = 0; i < 3; i++) {
      const r = D * (0.62 + i * 0.14) * (0.9 + 0.1 * naik) + 6 * Math.sin(t * 1.2 + i);
      d.ellipse([cx - r, cy - r, cx + r, cy + r], null, rgba(g.aksen, 120 - i * 30), 4);
    }
  } else if (jenis === "sudut") {
    const s = Math.trunc(w * 0.55 * naik);
    d.polygon([[0, 0], [s, 0], [0, s]], rgba(g.dekor1, 200));
    d.polygon([[w, h], [w - s, h], [w, h - s]], rgba(g.dekor2, 200));
    d.polygon([[0, 0], [Math.trunc(s * 0.6), 0], [0, Math.trunc(s * 0.6)]], rgba(g.aksen, 160));
  } else if (jenis === "garis") {
    const panjang = Math.trunc(w * naik);
    [Math.trunc(h * 0.08), Math.trunc(h * 0.11), Math.trunc(h * 0.9), Math.trunc(h * 0.93)].forEach((yy, i) => {
      const x0 = i % 2 === 0 ? 0 : w - panjang;
      d.line([[x0, yy], [x0 + panjang, yy]], rgba(g.aksen, 200), i % 2 === 0 ? 4 : 2);
    });
  } else if (jenis === "bingkai") {
    const m = Math.trunc(w * 0.045);
    const a = Math.trunc(255 * naik);
    d.roundedRectangle([m, m, w - m, h - m], Math.trunc(w * 0.04), null, rgba(g.aksen, a), 6);
    d.roundedRectangle([m + 14, m + 14, w - m - 14, h - m - 14], Math.trunc(w * 0.035), null, rgba(g.aksen2, bagi(a, 2)), 2);
  } else if (jenis === "segitiga") {
    const s = Math.trunc(w * 0.7 * naik);
    d.polygon([[w, 0], [w - s, 0], [w, Math.trunc(s * 0.8)]], rgba(g.dekor1, 210));
    d.polygon([[0, h], [s, h], [0, h - Math.trunc(s * 0.8)]], rgba(g.dekor2, 210));
  } else if (jenis === "bar") {
    const tb = Math.trunc(h * 0.06 * naik);
    d.rectangle([0, 0, w, tb], rgba(g.aksen, 255));
    d.rectangle([0, h - tb, w, h], rgba(g.aksen, 255));
    d.rectangle([0, tb, w, tb + 6], rgba(g.aksen2, 200));
    d.rectangle([0, h - tb - 6, w, h - tb], rgba(g.aksen2, 200));
  } else if (jenis === "lingkaran") {
    const rnd = new AcakPython(g.seed + 11);
    for (let i = 0; i < 7; i++) {
      const r = rnd.uniform(40, 160) * (0.6 + 0.4 * naik);
      const x = rnd.uniform(0, w);
      let y = rnd.uniform(0, h);
      y += 10 * Math.sin(t * 0.8 + i);
      d.ellipse([x - r, y - r, x + r, y + r], null, rgba(g.dekor2, 110), 3);
    }
  } else if (jenis === "diagonal-ganda") {
    const geser = Math.trunc((1 - naik) * w);
    d.polygon([[w - geser, 0], [w + 220 - geser, 0], [0 + 220 - geser, h], [0 - geser, h]], rgba(g.dekor1, 150));
    d.polygon([[w + 260 - geser, 0], [w + 340 - geser, 0], [340 - geser, h], [260 - geser, h]], rgba(g.aksen, 120));
  } else if (jenis === "busur") {
    const r = Math.trunc(w * 1.3);
    const yb = h + Math.trunc(r * 0.55) - Math.trunc(120 * naik);
    d.ellipse([bagi(w, 2) - r, yb - r, bagi(w, 2) + r, yb + r], rgba(g.dekor1, 255));
    d.ellipse([bagi(w, 2) - r, yb - r + 60, bagi(w, 2) + r, yb + r + 60], rgba(g.dekor2, 255));
  } else if (jenis === "titik-sudut") {
    for (let j = 0; j < 12; j++) {
      for (let i = 0; i < 12; i++) {
        const r = Math.max(0.0, (10 - i - j) * 1.1) * naik;
        if (r > 0.5) {
          d.ellipse([w - 40 - i * 44 - r, h - 40 - j * 44 - r, w - 40 - i * 44 + r, h - 40 - j * 44 + r], rgba(g.aksen, 200));
          d.ellipse([40 + i * 44 - r, 40 + j * 44 - r, 40 + i * 44 + r, 40 + j * 44 + r], rgba(g.aksen, 200));
        }
      }
    }
  }
  alphaComposite(frame, lap);
}

// ------------------------------------------------------------------
//  BADGE (logo) - sembilan bentuk, satu gaya bevel
// ------------------------------------------------------------------

function maskBentuk(bentuk: string, n: number, r: number, bulat: number): Gambar {
  const c = n / 2;
  let m = baru("L", n, n, 0);
  const d = new Kuas(m);
  if (bentuk === "lingkaran" || bentuk === "lencana") {
    d.ellipse([c - r, c - r, c + r, c + r], 255);
    return m;
  }
  if (bentuk === "kotak") {
    d.roundedRectangle([c - r, c - r, c + r, c + r], r * 0.28, 255);
    return m;
  }
  if (bentuk === "pil") {
    d.roundedRectangle([c - r, c - r * 0.62, c + r, c + r * 0.62], r * 0.62, 255);
    return m;
  }
  let pts: [number, number][];
  const rad = (dg: number) => dg * (Math.PI / 180);
  if (bentuk === "berlian") {
    pts = [[c, c - r], [c + r, c], [c, c + r], [c - r, c]];
  } else if (bentuk === "bintang") {
    pts = [];
    for (let i = 0; i < 16; i++) {
      const rr = i % 2 === 0 ? r : r * 0.82;
      const a = rad(22.5 * i - 90);
      pts.push([c + rr * Math.cos(a), c + rr * Math.sin(a)]);
    }
  } else if (bentuk === "heksagon") {
    pts = [];
    for (let i = 0; i < 6; i++) pts.push([c + r * Math.cos(rad(60 * i - 30)), c + r * Math.sin(rad(60 * i - 30))]);
  } else if (bentuk === "perisai") {
    pts = [[c - r, c - r * 0.85], [c + r, c - r * 0.85], [c + r, c + r * 0.15], [c, c + r], [c - r, c + r * 0.15]];
  } else {
    pts = [];
    for (let i = 0; i < 8; i++) pts.push([c + r * Math.cos(rad(22.5 + 45 * i)), c + r * Math.sin(rad(22.5 + 45 * i))]);
  }
  d.polygon(pts, 255);
  if (bulat > 0) m = point(gaussianBlur(m, bulat), (v) => (v >= 128 ? 255 : 0));
  return m;
}

/** Jeda kecil ke event loop: badge 4x resolusi butuh beberapa detik CPU. */
export type Jeda = () => Promise<void>;
const tanpaJeda: Jeda = async () => {};

export async function badge(nama: string, diameter: number, g: Gaya, jeda: Jeda = tanpaJeda): Promise<Gambar> {
  const D = diameter;
  const S = 4;
  const n = D * S;
  const c = n / 2;
  let im = baru("RGBA", n, n, [0, 0, 0, 0]);
  const lapis = (m: Gambar, warna: RGB) => {
    const lap = baru("RGBA", n, n, [warna[0], warna[1], warna[2], 255]);
    pasangAlpha(lap, m);
    alphaComposite(im, lap);
  };
  const bentuk = g.bentuk;
  const bulat = c * 0.05;
  const aksen = g.aksen;
  const bingkai = g.aksen2;
  const redup: RGB = [Math.max(0, aksen[0] - 25), Math.max(0, aksen[1] - 25), Math.max(0, aksen[2] - 25)];
  let bayang = maskBentuk(bentuk, n, c * 0.93, bulat);
  bayang = gaussianBlur(transformAffine(bayang, n, n, [1, 0, 0, 0, 1, -c * 0.07]), c * 0.09);
  lapis(bayang, [0, 0, 0]);
  await jeda();
  let mask: Gambar;
  if (bentuk === "lencana") {
    const cincin = baru("L", n, n, 0);
    new Kuas(cincin).ellipse([c * 0.03, c * 0.03, n - c * 0.03, n - c * 0.03], null, 255, Math.trunc(c * 0.07));
    lapis(cincin, bingkai);
    lapis(maskBentuk(bentuk, n, c * 0.84, 0), bingkai);
    lapis(maskBentuk(bentuk, n, c * 0.78, 0), redup);
    mask = maskBentuk(bentuk, n, c * 0.72, 0);
  } else {
    lapis(maskBentuk(bentuk, n, c * 0.94, c * 0.06), bingkai);
    await jeda();
    lapis(maskBentuk(bentuk, n, c * 0.855, bulat), redup);
    await jeda();
    lapis(maskBentuk(bentuk, n, c * 0.815, bulat), bingkai);
    await jeda();
    mask = maskBentuk(bentuk, n, c * 0.775, c * 0.045);
  }
  lapis(mask, aksen);
  await jeda();
  // Kilap bevel numpy: r2 dan terang dalam float32.
  const cy85 = f32(c * 0.85);
  const fc = f32(c);
  const penyebut = f32((c * 0.8) ** 2);
  const pangkat = f32(1.2);
  const data = im.data;
  for (let y = 0; y < n; y++) {
    const dy = f32(y - cy85);
    const dy2 = f32(dy * dy);
    for (let x = 0; x < n; x++) {
      const mv = mask.data[y * n + x];
      if (mv === 0) continue; // terang = 0 -> += 0 tidak mengubah apa pun
      const dx = f32(x - fc);
      const r2 = f32(f32(f32(dx * dx) + dy2) / penyebut);
      const dasar = clamp(f32(1 - r2), 0, 1);
      const terang = f32(f32(Math.pow(dasar, pangkat)) * f32(mv / 255));
      const p = (y * n + x) * 4;
      data[p] = u8(f32(data[p] + f32(44 * terang)));
      data[p + 1] = u8(f32(data[p + 1] + f32(30 * terang)));
      data[p + 2] = u8(f32(data[p + 2] + f32(30 * terang)));
    }
  }
  await jeda();
  let kilau = baru("RGBA", n, n, [0, 0, 0, 0]);
  new Kuas(kilau).ellipse([c * 0.25, c * 0.28, c * 1.25, c * 0.95], [255, 255, 255, 70]);
  kilau = gaussianBlur(kilau, c * 0.12);
  const aKilau = baru("L", n, n, 0);
  tempelMasker(aKilau, ambilKanal(kilau, 3), mask);
  pasangAlpha(kilau, aKilau);
  alphaComposite(im, kilau);
  await jeda();

  // nama channel: kontras terhadap warna aksen
  const terangAksen = 0.299 * aksen[0] + 0.587 * aksen[1] + 0.114 * aksen[2];
  const warnaTeks: Warna = terangAksen > 150 ? [20, 20, 24, 255] : [255, 255, 255, 255];
  const besar = nama.toUpperCase();
  const kata = pisahSpasi(besar);
  let lebarMaks = c * (["lingkaran", "lencana", "heksagon", "berlian", "bintang"].includes(bentuk) ? 1.05 : 1.15);
  let barisBaris: [string, number][];
  if (bentuk === "pil") {
    barisBaris = [[kata.join(" "), c]];
    lebarMaks = c * 1.6;
  } else if (kata.length >= 2) {
    const belah = kata.length > 2 ? Math.max(1, bagi(kata.length, 2)) : 1;
    barisBaris = [
      [kata.slice(0, belah).join(" "), c * 0.8],
      [kata.slice(belah).join(" "), c * 1.22],
    ];
  } else {
    const s = Array.from(besar);
    const tengah = bagi(s.length, 2);
    barisBaris = s.length > 6 ? [[s.slice(0, tengah).join(""), c * 0.8], [s.slice(tengah).join(""), c * 1.22]] : [[besar, c]];
  }
  for (const [baris, yPusat] of barisBaris) {
    if (!baris) continue;
    let uk = Math.trunc(c * 0.3);
    let f = font(uk, g.font_badge);
    while (uk > 20 && f.textbbox([0, 0], baris)[2] > lebarMaks) {
      uk -= 4;
      f = font(uk, g.font_badge);
    }
    const [x0, y0, x1, y1] = f.textbbox([0, 0], baris);
    const px = c - (x1 - x0) / 2 - x0;
    const py = yPusat - (y1 - y0) / 2 - y0;
    f.gambar(im, [px + 4, py + 5], baris, [0, 0, 0, 150]);
    f.gambar(im, [px, py], baris, warnaTeks);
  }
  if (barisBaris.length === 2 && barisBaris.every(([b]) => b)) {
    new Kuas(im).line([[c * 0.45, c], [c * 1.55, c]], [warnaTeks[0], warnaTeks[1], warnaTeks[2], 230], Math.trunc(c * 0.02));
  }
  await jeda();
  im = ubahUkuran(im, D, D, LANCZOS);
  return im;
}

/** str.split() Python: dipisah di tiap deret spasi (termasuk \x1c-\x1f). */
export function pisahSpasi(s: string): string[] {
  return s.split(/[\s\x1c-\x1f]+/u).filter(Boolean);
}

export async function bacaPng(berkas: string): Promise<Gambar> {
  const { data, info } = await sharp(berkas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`PNG ${berkas} tidak bisa dibaca sebagai RGBA`);
  return new Gambar("RGBA", info.width, info.height, new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
}

export async function logoUnggahan(berkas: string, diameter: number): Promise<Gambar> {
  const im = thumbnail(await bacaPng(berkas), diameter, diameter, LANCZOS);
  const kanvas = baru("RGBA", diameter, diameter, [0, 0, 0, 0]);
  alphaComposite(kanvas, im, bagi(diameter - im.w, 2), bagi(diameter - im.h, 2));
  return kanvas;
}

export function glowBadge(D: number, g: Gaya): Gambar {
  const n = Math.trunc(D * 1.6);
  const im = baru("RGBA", n, n, [0, 0, 0, 0]);
  const r = D * 0.55;
  new Kuas(im).ellipse([n / 2 - r, n / 2 - r, n / 2 + r, n / 2 + r], rgba(g.aksen, 150));
  return gaussianBlur(im, D * 0.14);
}

// ------------------------------------------------------------------
//  IKON PLATFORM - glyph merek resmi
// ------------------------------------------------------------------

const cacheGlyph = new Map<string, Gambar>();

export async function muatGlyph(): Promise<void> {
  for (const k of ["instagram", "youtube", "facebook", "tiktok", "x", "threads"]) {
    if (!cacheGlyph.has(k)) cacheGlyph.set(k, await bacaPng(path.join(ASET, "ikon", `${k}.png`)));
  }
}

function glyph(platform: string): Gambar {
  const g = cacheGlyph.get(platform);
  if (!g) throw new Error(`glyph ${platform} belum dimuat (panggil muatGlyph dulu)`);
  return g;
}

export type GayaIkon = Pick<Gaya, "ikon"> & Partial<Pick<Gaya, "teks" | "aksen">>;

/**
 * Ikon platform: glyph resmi di atas latar sesuai gaya (warna / mono /
 * garis / lingkaran). Harus memanggil muatGlyph() lebih dulu.
 */
export function ikon(platform: KunciAkun, s: number, g: GayaIkon): Gambar {
  const S = 3;
  const n = s * S;
  const gaya = g.ikon;
  let im = baru("RGBA", n, n, [0, 0, 0, 0]);
  let d = new Kuas(im);
  const mask = baru("L", n, n, 0);
  if (gaya === "lingkaran" || gaya === "garis") new Kuas(mask).ellipse([0, 0, n - 1, n - 1], 255);
  else new Kuas(mask).roundedRectangle([0, 0, n - 1, n - 1], n * 0.22, 255);

  let warnaGlyph: RGB;
  if (gaya === "garis") {
    const teks = g.teks!;
    d.ellipse([n * 0.03, n * 0.03, n * 0.97, n * 0.97], null, rgba(teks, 200), Math.max(2, bagi(n, 28)));
    warnaGlyph = teks;
  } else if (gaya === "mono") {
    const aksen = g.aksen!;
    d.roundedRectangle([0, 0, n - 1, n - 1], n * 0.22, rgba(aksen, 255));
    const terang = 0.299 * aksen[0] + 0.587 * aksen[1] + 0.114 * aksen[2];
    warnaGlyph = terang > 150 ? [20, 20, 24] : [255, 255, 255];
  } else {
    if (platform === "instagram") {
      const ys = linspace32(n);
      const xs = linspace32(n);
      const a = [255, 190, 60];
      const m = [225, 45, 110];
      const b = [110, 45, 200];
      const k06 = f32(0.6);
      const k04 = f32(0.4);
      const bg = baru("RGBA", n, n, [0, 0, 0, 255]);
      for (let y = 0; y < n; y++) {
        const uy = f32(k06 * ys[y]);
        for (let x = 0; x < n; x++) {
          const u = clamp(f32(uy + f32(k04 * f32(1 - xs[x]))), 0, 1);
          const p = (y * n + x) * 4;
          for (let c = 0; c < 3; c++) {
            const v = u < 0.5 ? f32(a[c] + f32((m[c] - a[c]) * f32(u / 0.5))) : f32(m[c] + f32((b[c] - m[c]) * f32(f32(u - 0.5) / 0.5)));
            bg.data[p + c] = u8(v);
          }
        }
      }
      pasangAlpha(bg, mask);
      im = bg;
      d = new Kuas(im);
    } else if (gaya === "lingkaran") {
      d.ellipse([0, 0, n - 1, n - 1], rgba(WARNA_MEREK[platform], 255));
    } else {
      d.roundedRectangle([0, 0, n - 1, n - 1], n * 0.22, rgba(WARNA_MEREK[platform], 255));
    }
    warnaGlyph = [255, 255, 255];
  }

  // glyph: PNG putih-transparan diwarnai lalu ditempel di tengah
  const ukur = Math.trunc(n * 0.6);
  const gl = ubahUkuran(glyph(platform), ukur, ukur, LANCZOS);
  const alfaGlyph = ambilKanal(gl, 3);
  if (platform === "tiktok" && (gaya === "warna" || gaya === "lingkaran")) {
    // ciri khas TikTok: bayangan sian & merah muda di kiri-atas dan kanan-bawah
    for (const [warna, dx, dy] of [
      [[37, 244, 238], -n * 0.02, -n * 0.02],
      [[254, 44, 85], n * 0.02, n * 0.02],
    ] as [RGB, number, number][]) {
      const lap = baru("RGBA", ukur, ukur, rgba(warna, 255));
      pasangAlpha(lap, alfaGlyph);
      alphaComposite(im, lap, Math.trunc((n - ukur) / 2 + dx), Math.trunc((n - ukur) / 2 + dy));
    }
  }
  const lap = baru("RGBA", ukur, ukur, rgba(warnaGlyph, 255));
  pasangAlpha(lap, alfaGlyph);
  alphaComposite(im, lap, bagi(n - ukur, 2), bagi(n - ukur, 2));
  if (gaya !== "garis" && !(platform === "instagram" && gaya === "warna")) {
    const a = baru("L", n, n, 0);
    tempelMasker(a, ambilKanal(im, 3), mask);
    pasangAlpha(im, a);
  }
  return ubahUkuran(im, s, s, LANCZOS);
}

// ------------------------------------------------------------------
//  TATA LETAK
// ------------------------------------------------------------------

export type Baris = {
  ikon?: [number, number];
  teks?: [number, number];
  teks_tengah?: [number, number] | null;
  teks_tengah_y?: number;
  pil?: [number, number, number, number];
  tengah?: boolean;
  y?: number;
  ikon_s: number;
  font: number;
};

export type Susunan = {
  baris: Baris[];
  nama: [number, number] | null;
  badge: [number, number, number];
  nama_kiri?: boolean;
  pakai_nama_teks: boolean;
};

export function susun(w: number, h: number, g: Gaya, jumlah: number, pakaiNamaTeks: boolean): Susunan {
  const tata = g.tata;
  const n = jumlah;
  const L: Susunan = { baris: [], nama: null, badge: [0, 0, 0], pakai_nama_teks: pakaiNamaTeks };
  const T = Math.trunc;
  const barisKiri = (xIkon: number, y0: number, pitch: number, ik: number, fnt: number, jarak: number) => {
    for (let i = 0; i < n; i++) {
      L.baris.push({ ikon: [xIkon, y0 + i * pitch], teks: [xIkon + ik + jarak, y0 + i * pitch], ikon_s: ik, font: fnt });
    }
  };
  if (tata === "dua-kolom") {
    const D = T(w * 0.4);
    L.badge = [T(w * 0.06), T(h * 0.3), D];
    const ik = T(w * 0.075);
    const pitch = T(h * 0.062);
    barisKiri(T(w * 0.52), T(h * 0.3) + bagi(D - n * pitch, 2), pitch, ik, T(w * 0.04), T(w * 0.02));
    L.nama = [bagi(w, 2), T(h * 0.3) + D + T(h * 0.05)];
  } else if (tata === "grid") {
    const D = T(w * 0.44);
    L.badge = [bagi(w - D, 2), T(h * 0.14), D];
    const ik = T(w * 0.07);
    const kolW = T(w * 0.44);
    const xKol = [T(w * 0.05), T(w * 0.51)];
    const y0 = T(h * 0.14) + D + T(h * 0.09);
    const pitch = T(h * 0.075);
    for (let i = 0; i < n; i++) {
      const xk = xKol[i % 2];
      const yk = y0 + bagi(i, 2) * pitch;
      L.baris.push({ pil: [xk, yk, kolW, T(h * 0.058)], ikon: [xk + 12, yk + 6], teks: [xk + 12 + ik + 14, yk + 6], ikon_s: ik, font: T(w * 0.034) });
    }
    L.nama = [bagi(w, 2), T(h * 0.14) + D + T(h * 0.03)];
  } else if (tata === "dua-baris") {
    const D = T(w * 0.42);
    L.badge = [bagi(w - D, 2), T(h * 0.15), D];
    const ik = T(w * 0.062);
    const kolW = T(w * 0.3);
    const xKol = [T(w * 0.035), T(w * 0.35), T(w * 0.665)];
    const y0 = T(h * 0.15) + D + T(h * 0.1);
    const pitch = T(h * 0.085);
    for (let i = 0; i < n; i++) {
      const xk = xKol[i % 3];
      const yk = y0 + bagi(i, 3) * pitch;
      L.baris.push({ pil: [xk, yk, kolW, T(h * 0.062)], ikon: [xk + 10, yk + 8], teks: [xk + 10 + ik + 10, yk + 8], ikon_s: ik, font: T(w * 0.026) });
    }
    L.nama = [bagi(w, 2), T(h * 0.15) + D + T(h * 0.03)];
  } else if (tata === "baris-ikon") {
    const D = T(w * 0.48);
    L.badge = [bagi(w - D, 2), T(h * 0.16), D];
    const ik = T(w * 0.11);
    const gap = T(w * 0.3);
    const x0 = bagi(w, 2) - gap;
    const y0 = T(h * 0.16) + D + T(h * 0.1);
    for (let i = 0; i < n; i++) {
      const xk = x0 + (i % 3) * gap - bagi(ik, 2);
      const yk = y0 + bagi(i, 3) * T(h * 0.15);
      L.baris.push({ ikon: [xk, yk], teks_tengah: [xk + bagi(ik, 2), yk + ik + 10], ikon_s: ik, font: T(w * 0.03) });
    }
    L.nama = [bagi(w, 2), T(h * 0.16) + D + T(h * 0.035)];
  } else if (tata === "melingkar") {
    const D = T(w * 0.4);
    L.badge = [bagi(w - D, 2), T(h * 0.24), D];
    const ik = T(w * 0.1);
    const cx = bagi(w, 2);
    const cy = T(h * 0.24) + bagi(D, 2);
    const R = D * 0.85;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * TAU) / Math.max(1, n);
      L.baris.push({ ikon: [T(cx + R * Math.cos(a) - ik / 2), T(cy + R * Math.sin(a) - ik / 2)], teks_tengah: null, ikon_s: ik, font: T(w * 0.03) });
    }
    const y0 = T(h * 0.24) + D + T(h * 0.2);
    const pitch = T(h * 0.044);
    for (let i = 0; i < n; i++) L.baris[i].teks_tengah_y = y0 + i * pitch;
    L.nama = [bagi(w, 2), T(h * 0.24) + D + T(h * 0.12)];
  } else if (tata === "kiri-atas") {
    const D = T(w * 0.3);
    L.badge = [T(w * 0.06), T(h * 0.1), D];
    const ik = T(w * 0.085);
    const pitch = T(h * 0.072);
    barisKiri(T(w * 0.1), T(h * 0.1) + D + T(h * 0.09), pitch, ik, T(w * 0.052), T(w * 0.03));
    L.nama = [T(w * 0.06) + D + T(w * 0.06) + T(w * 0.25), T(h * 0.1) + bagi(D, 2) - T(w * 0.03)];
    L.nama_kiri = true;
  } else if (tata === "bawah") {
    const D = T(w * 0.46);
    L.badge = [bagi(w - D, 2), T(h * 0.56), D];
    const ik = T(w * 0.078);
    const pitch = T(h * 0.06);
    barisKiri(T(w * 0.24), T(h * 0.12), pitch, ik, T(w * 0.046), T(w * 0.03));
    L.nama = [bagi(w, 2), T(h * 0.56) + D + T(h * 0.03)];
  } else if (tata === "kolom-kanan") {
    const D = T(w * 0.44);
    L.badge = [T(w * 0.05), T(h * 0.32), D];
    const ik = T(w * 0.07);
    const pilW = T(w * 0.4);
    const x = T(w * 0.56);
    const y0 = T(h * 0.32) + bagi(D - n * T(h * 0.068), 2);
    for (let i = 0; i < n; i++) {
      const yk = y0 + i * T(h * 0.068);
      L.baris.push({ pil: [x, yk, pilW, T(h * 0.056)], ikon: [x + 10, yk + 6], teks: [x + 10 + ik + 10, yk + 6], ikon_s: ik, font: T(w * 0.03) });
    }
    L.nama = [T(w * 0.05) + bagi(D, 2), T(h * 0.32) + D + T(h * 0.03)];
  } else if (tata === "tengah") {
    const D = T(w * 0.5);
    L.badge = [bagi(w - D, 2), T(h * 0.15), D];
    const ik = T(w * 0.075);
    const pitch = T(h * 0.062);
    const y0 = T(h * 0.15) + D + T(h * 0.09);
    for (let i = 0; i < n; i++) L.baris.push({ tengah: true, y: y0 + i * pitch, ikon_s: ik, font: T(w * 0.044) });
    L.nama = [bagi(w, 2), T(h * 0.15) + D + T(h * 0.03)];
  } else {
    // acuan
    const D = T(w * 0.56);
    L.badge = [bagi(w - D, 2), T(h * 0.17), D];
    const ik = T(w * 0.082);
    const pitch = n <= 4 ? T(h * 0.062) : T(h * 0.055);
    barisKiri(T(w * 0.22), T(h * 0.17) + D + T(h * 0.11), pitch, ik, T(w * 0.05), T(w * 0.03));
    L.nama = [bagi(w, 2), T(h * 0.17) + D + T(h * 0.035)];
  }
  return L;
}

/** Ada berkas biasa di jalur itu (Path.is_file()). */
export function adaBerkas(jalur: string | undefined | null): boolean {
  if (!jalur) return false;
  try {
    return fs.statSync(jalur).isFile();
  } catch {
    return false;
  }
}
