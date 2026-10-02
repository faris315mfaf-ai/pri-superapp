// ImageDraw Pillow 12 (ImageDraw.py + libImaging/Draw.c) — piksel demi piksel.
//
// Pillow menggambar bentuk TANPA antialias: poligon diisi per garis-pindai,
// elips memakai algoritma "quarter" bilangan bulat, busur/pieslice dipotong
// pohon setengah-bidang. Semua itu diport apa adanya (termasuk aritmetika
// float32 di poligon) supaya tepi bentuk jatuh di piksel yang sama dengan
// versi Python. Gambar pada RGBA menimpa piksel langsung (bukan mencampur),
// persis ImageDraw.Draw(im) pada im mode RGBA.
import { bulatGenap, type Gambar, type Warna } from "./gambar";

const f32 = Math.fround;

/** ROUND_UP/ROUND_DOWN Draw.c untuk argumen float32 (0.5F dijumlah di float). */
const naikF = (f: number) => (f >= 0.0 ? Math.floor(f32(f + 0.5)) : -Math.floor(f32(Math.abs(f) + 0.5)));
const turunF = (f: number) => (f >= 0.0 ? Math.ceil(f32(f - 0.5)) : -Math.ceil(f32(Math.abs(f) - 0.5)));
/** Versi untuk argumen double (di ImagingDrawWideLine). */
const naikD = (f: number) => (f >= 0.0 ? Math.floor(f + 0.5) : -Math.floor(Math.abs(f) + 0.5));
const turunD = (f: number) => (f >= 0.0 ? Math.ceil(f - 0.5) : -Math.ceil(Math.abs(f) - 0.5));
/** roundf / lround: setengah menjauhi nol. */
const bulatJauh = (v: number) => (v >= 0 ? Math.floor(v + 0.5) : -Math.floor(-v + 0.5));

type Tepi = { x0: number; y0: number; xmin: number; ymin: number; xmax: number; ymax: number; dx: number };

function buatTepi(x0: number, y0: number, x1: number, y1: number): Tepi {
  const e: Tepi = {
    x0,
    y0,
    xmin: Math.min(x0, x1),
    xmax: Math.max(x0, x1),
    ymin: Math.min(y0, y1),
    ymax: Math.max(y0, y1),
    dx: 0,
  };
  if (y0 !== y1) e.dx = f32((x1 - x0) / (y1 - y0));
  return e;
}

export class Kuas {
  private readonly tinta: Uint8Array;

  constructor(readonly im: Gambar) {
    this.tinta = new Uint8Array(im.bands);
  }

  // ---------------- primitif piksel ----------------

  private pakaiTinta(warna: Warna | number): void {
    if (typeof warna === "number") {
      this.tinta[0] = warna;
      if (this.im.bands === 4) {
        this.tinta[1] = warna;
        this.tinta[2] = warna;
        this.tinta[3] = 255;
      }
      return;
    }
    if (this.im.bands === 1) {
      this.tinta[0] = warna[0];
      return;
    }
    this.tinta[0] = warna[0];
    this.tinta[1] = warna[1];
    this.tinta[2] = warna[2];
    this.tinta[3] = warna.length >= 4 ? warna[3] : 255;
  }

  private titik(x: number, y: number): void {
    const im = this.im;
    if (x < 0 || x >= im.w || y < 0 || y >= im.h) return;
    const b = im.bands;
    const p = (y * im.w + x) * b;
    for (let c = 0; c < b; c++) im.data[p + c] = this.tinta[c];
  }

  private hline(x0: number, y: number, x1: number): void {
    const im = this.im;
    if (y < 0 || y >= im.h) return;
    if (x0 < 0) x0 = 0;
    else if (x0 >= im.w) return;
    if (x1 < 0) return;
    else if (x1 >= im.w) x1 = im.w - 1;
    if (x0 > x1) return;
    const b = im.bands;
    if (b === 1) {
      im.data.fill(this.tinta[0], y * im.w + x0, y * im.w + x1 + 1);
      return;
    }
    for (let p = (y * im.w + x0) * 4, akhir = (y * im.w + x1) * 4; p <= akhir; p += 4) {
      im.data[p] = this.tinta[0];
      im.data[p + 1] = this.tinta[1];
      im.data[p + 2] = this.tinta[2];
      im.data[p + 3] = this.tinta[3];
    }
  }

  /** line8/line32: Bresenham, titik akhir TIDAK digambar. */
  private garis1(x0: number, y0: number, x1: number, y1: number): void {
    let dx = x1 - x0;
    let xs = 1;
    if (dx < 0) {
      dx = -dx;
      xs = -1;
    }
    let dy = y1 - y0;
    let ys = 1;
    if (dy < 0) {
      dy = -dy;
      ys = -1;
    }
    if (dx === 0) {
      for (let i = 0; i < dy; i++, y0 += ys) this.titik(x0, y0);
    } else if (dy === 0) {
      for (let i = 0; i < dx; i++, x0 += xs) this.titik(x0, y0);
    } else if (dx > dy) {
      const n = dx;
      dy += dy;
      let e = dy - dx;
      dx += dx;
      for (let i = 0; i < n; i++) {
        this.titik(x0, y0);
        if (e >= 0) {
          y0 += ys;
          e -= dx;
        }
        e += dy;
        x0 += xs;
      }
    } else {
      const n = dy;
      dx += dx;
      let e = dx - dy;
      dy += dy;
      for (let i = 0; i < n; i++) {
        this.titik(x0, y0);
        if (e >= 0) {
          x0 += xs;
          e -= dy;
        }
        e += dx;
        y0 += ys;
      }
    }
  }

  /** polygon_generic (cabang tanpa alfa). */
  private isiPoligon(tepi: Tepi[]): void {
    const n = tepi.length;
    if (n <= 0) return;
    let ymin = this.im.h - 1;
    let ymax = 0;
    const tabel: Tepi[] = [];
    for (const e of tepi) {
      if (ymin > e.ymin) ymin = e.ymin;
      if (ymax < e.ymax) ymax = e.ymax;
      if (e.ymin === e.ymax) {
        this.hline(e.xmin, e.ymin, e.xmax);
        continue;
      }
      tabel.push(e);
    }
    if (ymin < 0) ymin = 0;
    if (ymax > this.im.h) ymax = this.im.h;
    const xx = new Float64Array(tabel.length * 2);
    for (; ymin <= ymax; ymin++) {
      let j = 0;
      for (let i = 0; i < tabel.length; i++) {
        const cur = tabel[i];
        if (ymin < cur.ymin || ymin > cur.ymax) continue;
        xx[j++] = f32(f32((ymin - cur.y0) * cur.dx) + cur.x0);
        if (ymin === cur.ymax && ymin < ymax) {
          xx[j] = xx[j - 1];
          j++;
        } else if ((ymin === cur.ymin || ymin === cur.ymax) && cur.dx !== 0) {
          for (let k = 0; k < i; k++) {
            const lain = tabel[k];
            if ((ymin !== lain.ymin && ymin !== lain.ymax) || lain.dx === 0) continue;
            if (bulatJauh(xx[j - 1]) === bulatJauh(f32(f32((ymin - lain.y0) * lain.dx) + lain.x0))) {
              const offset = ymin === cur.ymax ? -1 : 1;
              const adj = f32(f32((ymin + offset - cur.y0) * cur.dx) + cur.x0);
              if (ymin + offset >= lain.ymin && ymin + offset <= lain.ymax) {
                const adjLain = f32(f32((ymin + offset - lain.y0) * lain.dx) + lain.x0);
                if (xx[j - 1] > f32(adj + 1) && xx[j - 1] > f32(adjLain + 1)) {
                  xx[j - 1] = f32(bulatJauh(Math.max(adj, adjLain)) + 1);
                } else if (xx[j - 1] < f32(adj - 1) && xx[j - 1] < f32(adjLain - 1)) {
                  xx[j - 1] = f32(bulatJauh(Math.min(adj, adjLain)) - 1);
                }
                break;
              }
            }
          }
        }
      }
      const urut = xx.subarray(0, j).sort();
      for (let i = 1; i < j; i += 2) this.hline(naikF(urut[i - 1]), ymin, turunF(urut[i]));
    }
  }

  /** ImagingDrawWideLine. */
  private garisLebar(x0: number, y0: number, x1: number, y1: number, lebar: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (dx === 0 && dy === 0) {
      this.titik(x0, y0);
      return;
    }
    // hypot C dibulatkan benar; sqrt dari jumlah kuadrat bulat juga tepat.
    const besar = Math.sqrt(dx * dx + dy * dy);
    const kecil = (lebar - 1) / 2.0;
    const rmax = naikD(kecil) / besar;
    const rmin = turunD(kecil) / besar;
    const dxmin = turunD(rmin * dy);
    const dxmax = turunD(rmax * dy);
    const dymin = turunD(rmin * dx);
    const dymax = turunD(rmax * dx);
    const v = [
      [x0 - dxmin, y0 + dymax],
      [x1 - dxmin, y1 + dymax],
      [x1 + dxmax, y1 - dymin],
      [x0 + dxmax, y0 - dymin],
    ];
    this.isiPoligon([
      buatTepi(v[0][0], v[0][1], v[1][0], v[1][1]),
      buatTepi(v[1][0], v[1][1], v[2][0], v[2][1]),
      buatTepi(v[2][0], v[2][1], v[3][0], v[3][1]),
      buatTepi(v[3][0], v[3][1], v[0][0], v[0][1]),
    ]);
  }

  // ---------------- elips (algoritma "quarter") ----------------

  private segmenElips(a: number, b: number, w: number, keluar: (x0: number, y: number, x1: number) => void): void {
    const st = new KeadaanElips(a, b, w);
    const seg = [0, 0, 0];
    while (st.berikut(seg)) keluar(seg[0], seg[1], seg[2]);
  }

  private elipsBaru(x0: number, y0: number, x1: number, y1: number, isi: boolean, lebar: number): void {
    const a = x1 - x0;
    const b = y1 - y0;
    if (a < 0 || b < 0) return;
    if (isi) lebar = a + b;
    this.segmenElips(a, b, lebar, (X0, Y, X1) => {
      this.hline(x0 + Math.trunc((X0 + a) / 2), y0 + Math.trunc((Y + b) / 2), x0 + Math.trunc((X1 + a) / 2));
    });
  }

  private elipsPotong(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    mulai: number,
    akhir: number,
    lebar: number,
    jenis: "busur" | "pie",
  ): void {
    const a = x1 - x0;
    const b = y1 - y0;
    if (a < 0 || b < 0) return;
    const st = new KeadaanElipsPotong(a, b, lebar, mulai, akhir, jenis);
    const seg = [0, 0, 0];
    while (st.berikut(seg)) {
      this.hline(x0 + Math.trunc((seg[0] + a) / 2), y0 + Math.trunc((seg[1] + b) / 2), x0 + Math.trunc((seg[2] + a) / 2));
    }
  }

  // ---------------- API ImageDraw ----------------

  /** draw.polygon(xy, fill=..., outline=...) (lebar garis 1). */
  polygon(xy: ReadonlyArray<readonly [number, number]>, isi?: Warna | number | null, garis?: Warna | number | null): void {
    const p = xy.map(([x, y]) => [Math.trunc(x), Math.trunc(y)] as const);
    if (isi !== undefined && isi !== null) {
      this.pakaiTinta(isi);
      const tepi: Tepi[] = [];
      let i = 0;
      for (; i < p.length - 1; i++) {
        const [x0, y0] = p[i];
        const [x1, y1] = p[i + 1];
        if (y0 === y1 && i !== 0 && y0 === p[i - 1][1]) {
          const akhir = tepi[tepi.length - 1];
          if (x1 > x0 && x0 > p[i - 1][0]) {
            akhir.xmax = x1;
            continue;
          } else if (x1 < x0 && x0 < p[i - 1][0]) {
            akhir.xmin = x1;
            continue;
          }
        }
        tepi.push(buatTepi(x0, y0, x1, y1));
      }
      if (p[i][0] !== p[0][0] || p[i][1] !== p[0][1]) tepi.push(buatTepi(p[i][0], p[i][1], p[0][0], p[0][1]));
      this.isiPoligon(tepi);
    }
    if (garis !== undefined && garis !== null && !samaTinta(garis, isi)) {
      this.pakaiTinta(garis);
      let i = 0;
      for (; i < p.length - 1; i++) this.garis1(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
      this.garis1(p[i][0], p[i][1], p[0][0], p[0][1]);
    }
  }

  /** draw.line(xy, fill, width, joint). */
  line(xy: ReadonlyArray<readonly [number, number]>, warna: Warna | number, lebar = 1, sambungan: "curve" | null = null): void {
    if (lebar === 0) return;
    this.pakaiTinta(warna);
    const p = xy.map(([x, y]) => [Math.trunc(x), Math.trunc(y)] as const);
    if (lebar === 1) {
      for (let i = 0; i < p.length - 1; i++) this.garis1(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
      if (p.length >= 2) this.titik(p[p.length - 1][0], p[p.length - 1][1]);
    } else {
      for (let i = 0; i < p.length - 1; i++) this.garisLebar(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], lebar);
    }
    if (sambungan !== "curve" || lebar <= 4) return;
    // Sambungan melengkung dihitung dari koordinat ASLI (float), seperti ImageDraw.line.
    for (let i = 1; i < xy.length - 1; i++) {
      const titik = xy[i];
      const sudut = [
        [xy[i - 1], titik],
        [titik, xy[i + 1]],
      ].map(([s, e]) => modPyD(Math.atan2(e[0] - s[0], s[1] - e[1]) * (180 / Math.PI), 360));
      if (sudut[0] === sudut[1]) continue;
      const dibalik =
        (sudut[1] > sudut[0] && sudut[1] - 180 > sudut[0]) || (sudut[1] < sudut[0] && sudut[1] + 180 > sudut[0]);
      const kotak: [number, number, number, number] = [
        titik[0] - lebar / 2 + 1,
        titik[1] - lebar / 2 + 1,
        titik[0] + lebar / 2 - 1,
        titik[1] + lebar / 2 - 1,
      ];
      const [s0, e0] = dibalik ? [sudut[1] + 90, sudut[0] + 90] : [sudut[0] - 90, sudut[1] - 90];
      this.pieslice(kotak, s0 - 90, e0 - 90, warna);
      if (lebar > 8) {
        const diSudut = (c: readonly [number, number], s: number): [number, number] => {
          s -= 90;
          const jarak = lebar / 2 - 1;
          const pd = [jarak * Math.cos(s * (Math.PI / 180)), jarak * Math.sin(s * (Math.PI / 180))];
          return [c[0] + (pd[0] > 0 ? Math.floor(pd[0]) : Math.ceil(pd[0])), c[1] + (pd[1] > 0 ? Math.floor(pd[1]) : Math.ceil(pd[1]))];
        };
        const celah: [number, number][] = dibalik
          ? [diSudut(titik, sudut[0] + 90), [titik[0], titik[1]], diSudut(titik, sudut[1] + 90)]
          : [diSudut(titik, sudut[0] - 90), [titik[0], titik[1]], diSudut(titik, sudut[1] - 90)];
        this.line(celah, warna, 3);
      }
    }
  }

  /** draw.ellipse(xy, fill=...) atau outline=..., width=... */
  ellipse(kotak: readonly number[], isi?: Warna | number | null, garis?: Warna | number | null, lebar = 1): void {
    const [x0, y0, x1, y1] = kotak.map(Math.trunc);
    if (isi !== undefined && isi !== null) {
      this.pakaiTinta(isi);
      this.elipsBaru(x0, y0, x1, y1, true, 0);
    }
    if (garis !== undefined && garis !== null && !samaTinta(garis, isi) && lebar !== 0) {
      this.pakaiTinta(garis);
      this.elipsBaru(x0, y0, x1, y1, false, lebar);
    }
  }

  /** draw.rectangle(xy, fill=...) / outline. */
  rectangle(kotak: readonly number[], isi?: Warna | number | null, garis?: Warna | number | null, lebar = 1): void {
    let [x0, y0, x1, y1] = kotak.map(Math.trunc);
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (isi !== undefined && isi !== null) {
      this.pakaiTinta(isi);
      let ya = y0;
      let yb = y1;
      if (ya < 0) ya = 0;
      else if (ya >= this.im.h) ya = Number.NaN;
      if (!Number.isNaN(ya)) {
        if (yb < 0) yb = Number.NaN;
        else if (yb > this.im.h) yb = this.im.h;
        if (!Number.isNaN(yb)) for (let y = ya; y <= yb; y++) this.hline(x0, y, x1);
      }
    }
    if (garis !== undefined && garis !== null && !samaTinta(garis, isi) && lebar !== 0) {
      this.pakaiTinta(garis);
      for (let i = 0; i < lebar; i++) {
        this.hline(x0, y0 + i, x1);
        this.hline(x0, y1 - i, x1);
        this.garis1(x1 - i, y0 + lebar, x1 - i, y1 - lebar + 1);
        this.garis1(x0 + i, y0 + lebar, x0 + i, y1 - lebar + 1);
      }
    }
  }

  /** draw.arc(xy, start, end, fill, width) — sudut dikirim sebagai float32. */
  arc(kotak: readonly number[], mulai: number, akhir: number, warna: Warna | number, lebar = 1): void {
    if (lebar === 0) return;
    this.pakaiTinta(warna);
    const [x0, y0, x1, y1] = kotak.map(Math.trunc);
    const [s, e] = normalisasiSudut(f32(mulai), f32(akhir));
    if (f32(s + 360) === e) {
      this.elipsBaru(x0, y0, x1, y1, false, lebar);
      return;
    }
    if (s === e) return;
    this.elipsPotong(x0, y0, x1, y1, s, e, lebar, "busur");
  }

  /** draw.pieslice(xy, start, end, fill=...). */
  pieslice(kotak: readonly number[], mulai: number, akhir: number, isi: Warna | number): void {
    this.pakaiTinta(isi);
    const [x0, y0, x1, y1] = kotak.map(Math.trunc);
    const [s, e] = normalisasiSudut(f32(mulai), f32(akhir));
    if (f32(s + 360) === e) {
      this.elipsBaru(x0, y0, x1, y1, true, 0);
      return;
    }
    if (s === e) return;
    this.elipsPotong(x0, y0, x1, y1, s, e, x1 + y1 - x0 - y0, "pie");
  }

  /** draw.rounded_rectangle(xy, radius, fill, outline, width) — logika ImageDraw.py. */
  roundedRectangle(
    kotak: readonly number[],
    radius: number,
    isi?: Warna | number | null,
    garis?: Warna | number | null,
    lebar = 1,
  ): void {
    let [x0, y0, x1, y1] = kotak;
    if (x1 < x0) throw new Error("x1 must be greater than or equal to x0");
    if (y1 < y0) throw new Error("y1 must be greater than or equal to y0");
    let d = Math.min(x1 - x0, y1 - y0, radius * 2);
    x0 = bulatGenap(x0);
    y0 = bulatGenap(y0);
    x1 = bulatGenap(x1);
    y1 = bulatGenap(y1);
    const penuhX = d >= x1 - x0 - 1;
    if (penuhX) d = x1 - x0;
    const penuhY = d >= y1 - y0 - 1;
    if (penuhY) d = y1 - y0;
    if (penuhX && penuhY) {
      this.ellipse(kotak, isi, garis, lebar);
      return;
    }
    if (d === 0) {
      this.rectangle(kotak, isi, garis, lebar);
      return;
    }
    const r = Math.trunc(Math.floor(d / 2));
    const adaIsi = isi !== undefined && isi !== null;
    const adaGaris = garis !== undefined && garis !== null && !samaTinta(garis, isi) && lebar !== 0;
    const bagian: [number[], number, number][] = penuhX
      ? [
          [[x0, y0, x0 + d, y0 + d], 180, 360],
          [[x0, y1 - d, x0 + d, y1], 0, 180],
        ]
      : penuhY
        ? [
            [[x0, y0, x0 + d, y0 + d], 90, 270],
            [[x1 - d, y0, x1, y0 + d], 270, 90],
          ]
        : [
            [[x0, y0, x0 + d, y0 + d], 180, 270],
            [[x1 - d, y0, x1, y0 + d], 270, 360],
            [[x1 - d, y1 - d, x1, y1], 0, 90],
            [[x0, y1 - d, x0 + d, y1], 90, 180],
          ];
    const persegi = (k: number[]) => {
      // draw.draw_rectangle(xy, ink, 1) langsung: tanpa trunc ganda.
      this.rectangle(k, this.salinTinta(), null);
    };
    if (adaIsi) {
      this.pakaiTinta(isi!);
      for (const [k, s, e] of bagian) this.pieslice(k, s, e, isi!);
      this.pakaiTinta(isi!);
      if (penuhX) persegi([x0, y0 + r + 1, x1, y1 - r - 1]);
      else if (x1 - r - 1 >= x0 + r + 1) persegi([x0 + r + 1, y0, x1 - r - 1, y1]);
      if (!penuhX && !penuhY) {
        persegi([x0, y0 + r + 1, x0 + r, y1 - r - 1]);
        persegi([x1 - r, y0 + r + 1, x1, y1 - r - 1]);
      }
    }
    if (adaGaris) {
      for (const [k, s, e] of bagian) this.arc(k, s, e, garis!, lebar);
      this.pakaiTinta(garis!);
      if (!penuhX) {
        persegi([x0 + r + 1, y0, x1 - r - 1, y0 + lebar - 1]);
        persegi([x0 + r + 1, y1 - lebar + 1, x1 - r - 1, y1]);
      }
      if (!penuhY) {
        persegi([x0, y0 + r + 1, x0 + lebar - 1, y1 - r - 1]);
        persegi([x1 - lebar + 1, y0 + r + 1, x1, y1 - r - 1]);
      }
    }
  }

  private salinTinta(): number[] {
    return Array.from(this.tinta);
  }
}

function samaTinta(a: Warna | number | null | undefined, b: Warna | number | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const ka = typeof a === "number" ? [a] : Array.from(a);
  const kb = typeof b === "number" ? [b] : Array.from(b);
  if (ka.length === 3) ka.push(255);
  if (kb.length === 3) kb.push(255);
  return ka.length === kb.length && ka.every((v, i) => v === kb[i]);
}

function modPyD(a: number, b: number): number {
  const m = a % b;
  return m !== 0 && m < 0 !== b < 0 ? m + b : m;
}

/** normalize_angles Draw.c dengan semantik float32. */
function normalisasiSudut(al: number, ar: number): [number, number] {
  if (f32(ar - al) >= 360) return [0, 360];
  const alBaru = f32((al < 0 ? 360 - (-al % 360) : al) % 360);
  const selisih = (ar < alBaru ? 360 - (f32(alBaru - ar) % 360) : f32(ar - alBaru)) % 360;
  return [alBaru, f32(alBaru + selisih)];
}

// ------------------------------------------------------------------
//  quarter_state / ellipse_state (Draw.c)
// ------------------------------------------------------------------

class Kuartal {
  private cx = 0;
  private cy = 0;
  private ex = 0;
  private ey = 0;
  private a2 = 0;
  private b2 = 0;
  private a2b2 = 0;
  selesai = false;

  constructor(a: number, b: number) {
    if (a < 0 || b < 0) {
      this.selesai = true;
      return;
    }
    this.cx = a;
    this.cy = b % 2;
    this.ex = a % 2;
    this.ey = b;
    this.a2 = a * a;
    this.b2 = b * b;
    this.a2b2 = this.a2 * this.b2;
  }

  private delta(x: number, y: number): number {
    return Math.abs(this.a2 * y * y + this.b2 * x * x - this.a2b2);
  }

  /** Mengisi [x, y]; false bila habis. */
  berikut(ret: number[]): boolean {
    if (this.selesai) return false;
    ret[0] = this.cx;
    ret[1] = this.cy;
    if (this.cx === this.ex && this.cy === this.ey) {
      this.selesai = true;
    } else {
      let nx = this.cx;
      let ny = this.cy + 2;
      let nd = this.delta(nx, ny);
      if (nx > 1) {
        let baru = this.delta(this.cx - 2, this.cy + 2);
        if (nd > baru) {
          nx = this.cx - 2;
          ny = this.cy + 2;
          nd = baru;
        }
        baru = this.delta(this.cx - 2, this.cy);
        if (nd > baru) {
          nx = this.cx - 2;
          ny = this.cy;
        }
      }
      this.cx = nx;
      this.cy = ny;
    }
    return true;
  }
}

class KeadaanElips {
  private readonly luar: Kuartal;
  private dalam: Kuartal | null = null;
  private py = 0;
  private pl = 0;
  private pr = 0;
  private readonly cy: number[] = [0, 0, 0, 0];
  private readonly cl: number[] = [0, 0, 0, 0];
  private readonly cr: number[] = [0, 0, 0, 0];
  private buf = 0;
  private selesai = false;
  private readonly kiri: number;

  constructor(a: number, b: number, w: number) {
    this.kiri = a % 2;
    this.luar = new Kuartal(a, b);
    const t = [0, 0];
    if (w < 1 || !this.luar.berikut(t)) {
      this.selesai = true;
    } else {
      this.pr = t[0];
      this.py = t[1];
      this.dalam = new Kuartal(a - 2 * (w - 1), b - 2 * (w - 1));
      this.pl = this.kiri;
    }
  }

  /** Mengisi [x0, y, x1] (koordinat kisi kelipatan 2); false bila habis. */
  berikut(ret: number[]): boolean {
    if (this.buf === 0) {
      if (this.selesai) return false;
      const y = this.py;
      let l = this.pl;
      const r = this.pr;
      const t = [0, 0];
      let ada: boolean;
      while ((ada = this.luar.berikut(t)) && t[1] <= y) {
        /* lewati */
      }
      if (!ada) {
        this.selesai = true;
      } else {
        this.pr = t[0];
        this.py = t[1];
      }
      while ((ada = this.dalam!.berikut(t)) && t[1] <= y) l = t[0];
      this.pl = !ada ? this.kiri : t[0];
      if ((l > 0 || l < r) && y > 0) {
        this.cl[this.buf] = l === 0 ? 2 : l;
        this.cy[this.buf] = y;
        this.cr[this.buf] = r;
        this.buf++;
      }
      if (y > 0) {
        this.cl[this.buf] = -r;
        this.cy[this.buf] = y;
        this.cr[this.buf] = -l;
        this.buf++;
      }
      if (l > 0 || l < r) {
        this.cl[this.buf] = l === 0 ? 2 : l;
        this.cy[this.buf] = -y;
        this.cr[this.buf] = r;
        this.buf++;
      }
      this.cl[this.buf] = -r;
      this.cy[this.buf] = -y;
      this.cr[this.buf] = -l;
      this.buf++;
    }
    this.buf--;
    ret[0] = this.cl[this.buf];
    ret[1] = this.cy[this.buf];
    ret[2] = this.cr[this.buf];
    return true;
  }
}

// ------------------------------------------------------------------
//  Pohon pemotong setengah-bidang (arc_init / pie_init, clip_tree_do_clip)
// ------------------------------------------------------------------

type Simpul =
  | { jenis: "potong"; a: number; b: number; c: number }
  | { jenis: "dan" | "atau"; l: Simpul | null; r: Simpul | null };
type Peristiwa = { x: number; t: number };

function potongPohon(akar: Simpul | null, x0: number, y: number, x1: number): Peristiwa[] {
  if (akar === null) {
    return [
      { x: x0, t: 1 },
      { x: x1, t: -1 },
    ];
  }
  if (akar.jenis === "potong") {
    const eps = 1e-9;
    const { a: A, b: B, c: C } = akar;
    if (Math.abs(A) < eps) {
      if (B * y + C < -eps) {
        x0 = 1;
        x1 = 0;
      }
    } else {
      const ix = -(B * y + C) / A;
      if (A * x0 + B * y + C < eps) x0 = bulatJauh(Math.max(x0, ix));
      if (A * x1 + B * y + C < eps) x1 = bulatJauh(Math.min(x1, ix));
    }
    return x0 <= x1
      ? [
          { x: x0, t: 1 },
          { x: x1, t: -1 },
        ]
      : [];
  }
  const l1 = potongPohon(akar.l, x0, y, x1);
  const l2 = potongPohon(akar.r, x0, y, x1);
  const hasil: Peristiwa[] = [];
  let i1 = 0;
  let i2 = 0;
  let k1 = 0;
  let k2 = 0;
  while (i1 < l1.length || i2 < l2.length) {
    let t: Peristiwa;
    if (i2 >= l2.length || (i1 < l1.length && (l1[i1].x < l2[i2].x || (l1[i1].x === l2[i2].x && l1[i1].t > l2[i2].t)))) {
      t = l1[i1++];
      k1 += t.t;
    } else {
      t = l2[i2++];
      k2 += t.t;
    }
    const ekor = hasil.length ? hasil[hasil.length - 1] : null;
    const ambil =
      akar.jenis === "atau"
        ? (t.t === 1 && (ekor === null || ekor.t === -1)) || (t.t === -1 && k1 === 0 && k2 === 0)
        : (t.t === 1 && (ekor === null || ekor.t === -1) && k1 > 0 && k2 > 0) ||
          (t.t === -1 && ekor !== null && ekor.t === 1 && (k1 === 0 || k2 === 0));
    if (ambil) hasil.push(t);
  }
  return hasil;
}

function transposePohon(s: Simpul | null): void {
  if (!s) return;
  if (s.jenis === "potong") {
    const t = s.a;
    s.a = s.b;
    s.b = t;
    return;
  }
  transposePohon(s.l);
  transposePohon(s.r);
}

const SUDUT = Math.PI;

function pohonBusur(a: number, b: number, al: number, ar: number): Simpul | null {
  if (a < b) {
    const akar = pohonBusur(b, a, f32(90 - ar), f32(90 - al));
    transposePohon(akar);
    return akar;
  }
  [al, ar] = normalisasiSudut(al, ar);
  if (ar === f32(al + 360)) return null;
  const lc: Simpul = {
    jenis: "potong",
    a: -a * Math.sin((al * SUDUT) / 180.0),
    b: b * Math.cos((al * SUDUT) / 180.0),
    c: ((a * a - b * b) * Math.sin((al * SUDUT) / 90.0)) / 2.0,
  };
  const rc: Simpul = {
    jenis: "potong",
    a: a * Math.sin((ar * SUDUT) / 180.0),
    b: -b * Math.cos((ar * SUDUT) / 180.0),
    c: ((b * b - a * a) * Math.sin((ar * SUDUT) / 90.0)) / 2.0,
  };
  if (al % 180 === 0 || ar % 180 === 0) {
    return { jenis: f32(ar - al) < 180 ? "dan" : "atau", l: lc, r: rc };
  }
  const bagiAl = Math.trunc(f32(al / 180));
  const bagiAr = Math.trunc(f32(ar / 180));
  if ((bagiAl + bagiAr) % 2 === 1) {
    return {
      jenis: "atau",
      l: { jenis: "dan", l: { jenis: "potong", a: 0, b: bagiAl % 2 === 0 ? 1 : -1, c: 0 }, r: lc },
      r: { jenis: "dan", l: { jenis: "potong", a: 0, b: bagiAr % 2 === 0 ? 1 : -1, c: 0 }, r: rc },
    };
  }
  const jenis = f32(ar - al) < 180 ? "dan" : "atau";
  return {
    jenis,
    l: { jenis, l: lc, r: rc },
    r: { jenis: "potong", a: 0, b: ar < 180 || ar > 540 ? 1 : -1, c: 0 },
  };
}

function pohonPie(a: number, b: number, al: number, ar: number): Simpul {
  const xl = a * Math.cos((al * SUDUT) / 180.0);
  const xr = a * Math.cos((ar * SUDUT) / 180.0);
  const yl = b * Math.sin((al * SUDUT) / 180.0);
  const yr = b * Math.sin((ar * SUDUT) / 180.0);
  const lc: Simpul = { jenis: "potong", a: -yl, b: xl, c: 0 };
  const rc: Simpul = { jenis: "potong", a: yr, b: -xr, c: 0 };
  let akar: Simpul = { jenis: f32(ar - al) < 180 ? "dan" : "atau", l: lc, r: rc };
  if (f32(ar - al) < 90) {
    akar = { jenis: "dan", l: akar, r: { jenis: "potong", a: (xl + xr) / 2.0, b: (yl + yr) / 2.0, c: 0 } };
  }
  return akar;
}

class KeadaanElipsPotong {
  private readonly st: KeadaanElips;
  private readonly akar: Simpul | null;
  private antre: Peristiwa[] = [];
  private posisi = 0;
  private y = 0;

  constructor(a: number, b: number, w: number, al: number, ar: number, jenis: "busur" | "pie") {
    if (jenis === "busur") {
      // arc_init: pada a < b sistem ditransposisi, tapi elipsnya tetap (a, b).
      this.akar = pohonBusur(a, b, al, ar);
    } else {
      this.akar = pohonPie(a, b, al, ar);
    }
    this.st = new KeadaanElips(a, b, w);
  }

  berikut(ret: number[]): boolean {
    const seg = [0, 0, 0];
    while (this.posisi >= this.antre.length && this.st.berikut(seg)) {
      this.antre = potongPohon(this.akar, seg[0], seg[1], seg[2]);
      this.posisi = 0;
      this.y = seg[1];
    }
    if (this.posisi < this.antre.length) {
      ret[1] = this.y;
      ret[0] = this.antre[this.posisi++].x;
      ret[2] = this.antre[this.posisi++].x;
      return true;
    }
    return false;
  }
}
