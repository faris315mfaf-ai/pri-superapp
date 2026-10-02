// MODE DPP - meniru outro TV Rakyat, nama channel di logo (cermin bagian
// "MODE DPP" outro.py).
//
// Tampilannya TETAP: latar gelap bersemburat merah, gelombang merah di
// dasar, logo TV Rakyat asli masuk dengan putaran-balik, tagline, pil emas
// berpendar, lalu daftar sosmed. Yang berganti hanya nama channel yang
// ditulis melengkung di bawah tulisan RAKYAT, dan handle sosmednya.
import path from "node:path";
import { alphaComposite, baru, BICUBIC, Gambar, gaussianBlur, LANCZOS, putar, thumbnail, ubahUkuran } from "./gambar";
import { OutroError } from "./galat";
import { ASET } from "./gaya";
import { Kuas } from "./kuas";
import { expF32 } from "./numerik";
import { adaBerkas, bacaPng, bagi, clamp, font, linspace32, pangkatPy, pisahSpasi } from "./lukis";

const f32 = Math.fround;

export const DPP = path.join(ASET, "dpp");
export const DPP_LOGO = path.join(DPP, "logo.png");
export const DPP_AUDIO = path.join(DPP, "audio.m4a");
export const DPP_TAGLINE = "TV Rakyat, Medianya Rakyat";
export const DPP_AJAKAN = "Follow untuk Update Terkini";
export const DPP_DETIK = 5.5;
// Kapan tiap unsur mulai tampil, diukur dari frame-frame acuan.
export const DPP_T_LOGO = 0.95;
export const DPP_T_TAGLINE = 2.1;
export const DPP_T_HANDLE = 2.5;
export const DPP_T_PIL = 2.85;

/** Latar gelap dengan semburat merah-cokelat hangat dari kanan-bawah. */
export function latarDpp(w: number, h: number): Gambar {
  const ys = linspace32(h);
  const xs = linspace32(w);
  const k092 = f32(0.92);
  const k098 = f32(0.98);
  const k13 = f32(1.3);
  const k22 = f32(2.2);
  const k016 = f32(0.16);
  const k018 = f32(0.18);
  const dx2 = new Float32Array(w);
  const vx2 = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const t = f32(xs[x] - k092);
    dx2[x] = f32(f32(t * t) * k13);
    const vx = f32(f32(xs[x] - 0.5) * 2);
    vx2[x] = f32(vx * vx);
  }
  const data = new Uint8Array(w * h * 4);
  const u8 = (v: number) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.trunc(v));
  for (let y = 0; y < h; y++) {
    const yv = ys[y];
    const r0 = f32(f32(7 + f32(9 * yv)) + f32(12 * f32(yv * yv)));
    const g0 = f32(6 + f32(3 * yv));
    const b0 = f32(6 + f32(2 * yv));
    const ty = f32(yv - k098);
    const dy2 = f32(f32(ty * ty) * k22);
    const vy = f32(f32(yv - 0.5) * 2);
    const vy2 = f32(vy * vy);
    for (let x = 0; x < w; x++) {
      const e = f32(expF32(f32(-f32(dx2[x] + dy2) / k016)));
      const vig = f32(1.0 - f32(k018 * clamp(f32(vx2[x] + vy2), 0, 1)));
      const p = (y * w + x) * 4;
      data[p] = u8(f32(f32(r0 + f32(e * 40)) * vig));
      data[p + 1] = u8(f32(f32(g0 + f32(e * 9)) * vig));
      data[p + 2] = u8(f32(f32(b0 + f32(e * 4)) * vig));
      data[p + 3] = 255;
    }
  }
  return new Gambar("RGBA", w, h, data);
}

/** Tiga lapis gelombang merah di dasar, menjulang di kanan, bergerak pelan. */
export function gelombangDpp(kuas: Kuas, w: number, h: number, t: number): void {
  const lapis: [number[], number[], number, number, number, number][] = [
    [[108, 8, 16, 255], [150, 26, 34, 255], 0.0, 0, 300, 0.7],
    [[158, 12, 22, 255], [206, 42, 50, 255], 1.7, 70, 225, 0.9],
    [[214, 22, 30, 255], [240, 84, 88, 255], 3.3, 150, 150, 1.15],
  ];
  const dasarY = h - 240;
  for (const [isi, tepi, fase, turun, naikKanan, kec] of lapis) {
    const titik: [number, number][] = [];
    for (let x = 0; x < w + 40; x += 40) {
      const u = x / w;
      const y =
        dasarY + turun + 140 * pangkatPy(1 - u, 1.2) - naikKanan * pangkatPy(u, 1.7) -
        34 * Math.sin(u * 3.6 + fase + t * kec) -
        18 * Math.sin(u * 7.9 - fase * 0.6 + t * kec * 0.7);
      titik.push([x, Math.trunc(y)]);
    }
    kuas.polygon([...titik, [w, h], [0, h]], isi);
    kuas.line(titik, tepi, 3);
  }
}

/**
 * Lebar tiap huruf teks melengkung. Spasi dilebarkan: di font kecil (~16 px,
 * nama dua baris) spasi aslinya ~4 px dan kata-katanya tampak menempel.
 */
export function lebarHuruf(teks: string, ukuran: number, namaFont = "poppins"): number[] {
  const f = font(ukuran, namaFont);
  return Array.from(teks).map((c) => (c === " " ? Math.max(f.textlength(c), ukuran * 0.42) : f.textlength(c)));
}

/**
 * Tulis teks melengkung mengikuti busur BAWAH lingkaran (bentuk senyum);
 * tiap huruf diputar sesuai garis singgungnya. Mengembalikan rentang sudut.
 */
export function teksBusur(
  kanvas: Gambar,
  teks: string,
  pusat: [number, number],
  r: number,
  ukuran: number,
  warna: number[],
  namaFont = "poppins",
): [number, number] {
  const f = font(ukuran, namaFont);
  const lebar = lebarHuruf(teks, ukuran, namaFont);
  const total = lebar.reduce((a, b) => a + b, 0);
  let a = Math.PI / 2 + total / 2 / r;
  const aAwal = a;
  // Semua huruf duduk di SATU garis dasar (huruf berekor tidak terangkat).
  const naikKapital = -f.textbbox([0, 0], "H", "ls")[1];
  const huruf = Array.from(teks);
  huruf.forEach((c, i) => {
    const lc = lebar[i];
    const aTengah = a - lc / 2 / r;
    const x = pusat[0] + r * Math.cos(aTengah);
    const y = pusat[1] + r * Math.sin(aTengah);
    const kw = Math.trunc(lc + ukuran);
    const kh = Math.trunc(ukuran * 1.6);
    let im = baru("RGBA", kw, kh, [0, 0, 0, 0]);
    f.gambar(im, [kw / 2, kh / 2 + naikKapital / 2], c, warna, "ms");
    const derajat = (Math.PI / 2 - aTengah) * (180 / Math.PI);
    im = putar(im, derajat, BICUBIC, true);
    alphaComposite(kanvas, im, Math.trunc(x - im.w / 2), Math.trunc(y - im.h / 2));
    a -= lc / r;
  });
  return [aAwal, a];
}

/** Garis melengkung dari sudut a0 ke a1 (radian), dihaluskan 3x. */
export function busurGaris(kanvas: Gambar, pusat: [number, number], r: number, a0: number, a1: number, tebal: number, warna: number[]): void {
  const S = 3;
  const lap = baru("RGBA", kanvas.w * S, kanvas.h * S, [0, 0, 0, 0]);
  const cx = pusat[0] * S;
  const cy = pusat[1] * S;
  const rr = r * S;
  const d0 = a0 * (180 / Math.PI);
  const d1 = a1 * (180 / Math.PI);
  const [lo, hi] = d0 <= d1 ? [d0, d1] : [d1, d0];
  new Kuas(lap).arc([cx - rr, cy - rr, cx + rr, cy + rr], lo, hi, warna, Math.max(1, tebal * S));
  alphaComposite(kanvas, ubahUkuran(lap, kanvas.w, kanvas.h, LANCZOS));
}

// Aturan pecah dua baris nama channel di logo DPP (lihat outro.py).
export const TWO_LINE_BELOW = 42;
export const DPP_ACUAN_LEBAR = 680;
export const DPP_SUDUT_MAKS = 0.44 / 0.29;
export const DPP_FONT_MIN = 8;

/** Lebar teks melengkung PERSIS seperti yang digambar teksBusur. */
export function lebarTeks(teks: string, ukuran: number): number {
  return lebarHuruf(teks, ukuran).reduce((a, b) => a + b, 0);
}

/** Ukuran font (pecahan) yang membuat teks tepat selebar lebarBoleh. */
export function fontPas(teks: string, lebarBoleh: number): number {
  const perPx = lebarTeks(teks, 100) / 100;
  return perPx > 0 ? lebarBoleh / perPx : DPP_FONT_MIN;
}

/** round(x, 2) Python. */
const bulat2 = (x: number) => Number(x.toFixed(2));

/** [(teks, jari-jari, font)] - satu baris, atau dua baris bertumpuk. */
export function susunNamaDpp(nama: string, diameter: number, r: number, mulai: number): [string, number, number][] {
  const skala = (diameter * 0.44) / DPP_ACUAN_LEBAR;
  const ambang = TWO_LINE_BELOW * skala;
  const satu = Math.min(mulai, fontPas(nama, DPP_SUDUT_MAKS * r));
  const kata = pisahSpasi(nama);
  const jadi = (f: number) => Math.max(DPP_FONT_MIN, Math.trunc(f));
  if (satu >= ambang || kata.length < 2) return [[nama, r, jadi(satu)]];
  let terbaik: [number, number, string, string] | null = null;
  for (let i = 1; i < kata.length; i++) {
    const atas = kata.slice(0, i).join(" ");
    const bawah = kata.slice(i).join(" ");
    let f = ambang;
    for (let k = 0; k < 6; k++) {
      f = Math.min(ambang, fontPas(atas, DPP_SUDUT_MAKS * (r - f * 0.58)), fontPas(bawah, DPP_SUDUT_MAKS * (r + f * 0.58)));
    }
    const timpang = Math.abs(lebarTeks(atas, 100) - lebarTeks(bawah, 100));
    // (round(f, 2), -timpang) > (round(terbaik_f, 2), -terbaik_timpang)
    if (terbaik === null || bulat2(f) > bulat2(terbaik[0]) || (bulat2(f) === bulat2(terbaik[0]) && -timpang > -terbaik[1])) {
      terbaik = [f, timpang, atas, bawah];
    }
  }
  if (terbaik === null || terbaik[0] <= satu) return [[nama, r, jadi(satu)]];
  const [f, , atas, bawah] = terbaik;
  const u = jadi(f);
  return [
    [atas, r - u * 0.58, u],
    [bawah, r + u * 0.58, u],
  ];
}

/** Logo TV Rakyat asli dengan nama channel melengkung di bawah RAKYAT. */
export async function logoDpp(namaChannel: string, diameter: number): Promise<Gambar> {
  if (!adaBerkas(DPP_LOGO)) throw new OutroError(`Logo DPP tidak ditemukan: ${DPP_LOGO}`);
  const im = thumbnail(await bacaPng(DPP_LOGO), diameter, diameter, LANCZOS);
  const kanvas = baru("RGBA", diameter, diameter, [0, 0, 0, 0]);
  alphaComposite(kanvas, im, bagi(diameter - im.w, 2), bagi(diameter - im.h, 2));
  const nama = pisahSpasi(namaChannel).join(" ");
  if (!nama) return kanvas;
  const pusat: [number, number] = [diameter / 2, diameter / 2];
  const r = diameter * 0.29;
  const warna = [232, 232, 232, 255];
  const mulai = Math.trunc(diameter * 0.066);
  const susunan = susunNamaDpp(nama, diameter, r, mulai);
  const rentang: [number, number][] = [];
  for (const [teks, radius, ukuran] of susunan) rentang.push(teksBusur(kanvas, teks, pusat, radius, ukuran, warna));
  // Garis atas dan bawah yang mengapit nama, sepanjang teks persis.
  const a0 = Math.max(...rentang.map(([a]) => a));
  const a1 = Math.min(...rentang.map(([, b]) => b));
  const ukuran = susunan[0][2];
  let jarak = diameter * 0.038;
  if (susunan.length === 2) jarak = Math.max(jarak, Math.abs(susunan[1][1] - r) + ukuran * 0.36 + diameter * 0.008);
  const tebal = Math.max(2, Math.trunc(diameter * 0.006));
  for (const radius of [r - jarak, r + jarak]) busurGaris(kanvas, pusat, radius, a0, a1, tebal, warna);
  return kanvas;
}

/** Pil emas berteks + titik-titik kelilingnya (jalur cahaya berputar). */
export function pilDpp(teks: string, lebar: number, tinggi: number): [Gambar, [number, number][]] {
  const S = 3;
  const W = lebar * S;
  const H = tinggi * S;
  let im = baru("RGBA", W, H, [0, 0, 0, 0]);
  const d = new Kuas(im);
  const tepi = Math.trunc(H * 0.06);
  const r = H / 2 - tepi;
  d.roundedRectangle([tepi, tepi, W - tepi, H - tepi], r, null, [212, 168, 60, 190], Math.trunc(H * 0.045));
  let f = font(Math.trunc(H * 0.36));
  let [x0, y0, x1, y1] = f.textbbox([0, 0], teks);
  while (x1 - x0 > W * 0.82 && f.size > 12) {
    f = font(f.size - 2);
    [x0, y0, x1, y1] = f.textbbox([0, 0], teks);
  }
  f.gambar(im, [W / 2 - (x1 - x0) / 2 - x0 + 2, H / 2 - (y1 - y0) / 2 - y0 + 3], teks, [0, 0, 0, 160]);
  f.gambar(im, [W / 2 - (x1 - x0) / 2 - x0, H / 2 - (y1 - y0) / 2 - y0], teks, [255, 255, 255, 255]);
  im = ubahUkuran(im, lebar, tinggi, LANCZOS);
  const t = tepi / S;
  const rr = r / S;
  const titik: [number, number][] = [];
  const seg = 40;
  const L = t + rr;
  const R = lebar - t - rr;
  const T = t;
  const B = tinggi - t;
  for (let i = 0; i < seg + 1; i++) titik.push([L + ((R - L) * i) / seg, T]);
  for (let i = 1; i < seg; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / seg;
    titik.push([R + rr * Math.cos(a), t + rr + rr * Math.sin(a)]);
  }
  for (let i = 0; i < seg + 1; i++) titik.push([R - ((R - L) * i) / seg, B]);
  for (let i = 1; i < seg; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / seg;
    titik.push([L + rr * Math.cos(a), t + rr + rr * Math.sin(a)]);
  }
  return [im, titik];
}

/** Seberkas cahaya emas yang berjalan di keliling pil (p: 0..1). */
export function cahayaPilDpp(lebar: number, tinggi: number, titik: [number, number][], p: number): Gambar {
  let im = baru("RGBA", lebar, tinggi, [0, 0, 0, 0]);
  const n = titik.length;
  const awal = ((Math.trunc(p * n) % n) + n) % n;
  const seg: [number, number][] = [];
  for (let i = 0; i < Math.trunc(n * 0.26); i++) seg.push(titik[(awal + i) % n]);
  new Kuas(im).line(seg, [255, 205, 80, 235], Math.max(4, bagi(tinggi, 5)), "curve");
  im = gaussianBlur(im, tinggi * 0.11);
  new Kuas(im).line(seg, [255, 225, 120, 255], Math.max(3, bagi(tinggi, 12)), "curve");
  im = gaussianBlur(im, tinggi * 0.03);
  new Kuas(im).line(seg, [255, 246, 200, 255], Math.max(2, bagi(tinggi, 26)), "curve");
  return im;
}
