// ============================================================
// DUNIA RUANG BOT — primitif gambar isometrik (14 Okt 2026).
// Dipakai dunia-gambar (gedung bot + adegan) dan dunia-sayap (sayap penghuni).
// ============================================================

import type { Titik } from "./denah";

// ---------- konstanta kanvas ----------

/** Lebar = (28 + 16) * 16 + margin; tinggi muat sampai sudut depan denah 28x16. */
export const W = 716;
export const H = 436;
export const OX = 262;
export const OY = 70;
export const TINGGI_DINDING = 64;

export type Ctx = CanvasRenderingContext2D;

/** Posisi layar (piksel kanvas logis) titik kepala/kaki sebuah karakter. */
export type PosisiLayar = { sx: number; sy: number };

// ---------- primitif ----------

export const P = (gx: number, gy: number, z = 0): Titik => [Math.round(OX + (gx - gy) * 16), Math.round(OY + (gx + gy) * 8 - z)];

export function px(c: Ctx, x: number, y: number, w: number, h: number, warna: string) {
  c.fillStyle = warna;
  c.fillRect(x, y, w, h);
}

export function poly(c: Ctx, pts: Titik[], warna: string) {
  let a = 1e9;
  let b = -1e9;
  for (const p of pts) {
    if (p[0] < a) a = p[0];
    if (p[0] > b) b = p[0];
  }
  c.fillStyle = warna;
  const n = pts.length;
  for (let x = a; x < b; x++) {
    const xc = x + 0.5;
    let lo = 1e9;
    let hi = -1e9;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      if ((p[0] <= xc && q[0] > xc) || (q[0] <= xc && p[0] > xc)) {
        const y = p[1] + ((xc - p[0]) / (q[0] - p[0])) * (q[1] - p[1]);
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
    if (hi > lo) {
      const l = Math.round(lo);
      const h = Math.round(hi);
      if (h > l) c.fillRect(x, l, 1, h - l);
    }
  }
}

/** Acak semu stabil dari angka (dipakai untuk ubin, buku, bintang). */
export const hs = (n0: number) => {
  const n = Math.sin(n0 * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Terangkan/gelapkan warna "#rrggbb" dengan faktor k (dijepit 0..255). */
export function terang(warna: string, k: number): string {
  const n = parseInt(warna.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return "#" + ((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
}

export function disc(c: Ctx, cx: number, cy: number, r: number, warna: string) {
  c.fillStyle = warna;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    c.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

export function box(c: Ctx, gx: number, gy: number, w: number, d: number, h: number, z0: number, cT: string, cL: string, cR: string) {
  const z1 = z0 + h;
  poly(c, [P(gx, gy, z1), P(gx + w, gy, z1), P(gx + w, gy + d, z1), P(gx, gy + d, z1)], cT);
  poly(c, [P(gx, gy + d, z1), P(gx + w, gy + d, z1), P(gx + w, gy + d, z0), P(gx, gy + d, z0)], cL);
  poly(c, [P(gx + w, gy, z1), P(gx + w, gy + d, z1), P(gx + w, gy + d, z0), P(gx + w, gy, z0)], cR);
}

/** Titik pada dinding: sisi kiri (x=0) atau kanan (y=0). */
export const WP = (sisi: "L" | "R", u: number, v: number): Titik => (sisi === "L" ? P(0, u, v) : P(u, 0, v));

export function wq(c: Ctx, sisi: "L" | "R", u0: number, u1: number, v0: number, v1: number, warna: string) {
  poly(c, [WP(sisi, u0, v0), WP(sisi, u1, v0), WP(sisi, u1, v1), WP(sisi, u0, v1)], warna);
}

export function frect(c: Ctx, g0: number, g1: number, h0: number, h1: number, warna: string, z = 0) {
  poly(c, [P(g0, h0, z), P(g1, h0, z), P(g1, h1, z), P(g0, h1, z)], warna);
}


// ---------- latar bersama ----------

export function lantai(c: Ctx, gx0: number, gx1: number, gy0: number, gy1: number, A: string, B: string, benih: number) {
  for (let gx = gx0; gx < gx1; gx++) {
    for (let gy = gy0; gy < gy1; gy++) {
      let warna = (gx + gy) & 1 ? A : B;
      const r = hs(gx * 13 + gy * 7 + benih);
      if (r > 0.82) warna = terang(warna, 1.05);
      else if (r < 0.12) warna = terang(warna, 0.94);
      poly(c, [P(gx, gy), P(gx + 1, gy), P(gx + 1, gy + 1), P(gx, gy + 1)], warna);
    }
  }
}

/** Satu bentang dinding (sisi s, dari u0 ke u1): papan atas, tiang, alas kayu, lis. */
export function dindingBand(c: Ctx, s: "L" | "R", u0: number, u1: number, warna: string, warnaLis: string, alas: string, papan: string) {
  wq(c, s, u0, u1, 0, TINGGI_DINDING, warna);
  for (let u = Math.ceil(u0); u < u1; u++) wq(c, s, u - 0.02, u + 0.02, 18, TINGGI_DINDING - 3, terang(warna, 1.18));
  wq(c, s, u0, u1, 0, 16, alas);
  for (let u = u0; u < u1; u += 1) wq(c, s, u + 0.04, Math.min(u1, u + 0.5), 3, 15, papan);
  wq(c, s, u0, u1, 16, 18.5, warnaLis);
  wq(c, s, u0, u1, 0, 3, "#3b2410");
  wq(c, s, u0, u1, TINGGI_DINDING - 2.5, TINGGI_DINDING, "#1a1736");
}


/** Jendela pada dinding (siang: langit; malam: bintang & bulan). */
export function jendela(c: Ctx, malam: boolean, s: "L" | "R", u0: number, u1: number) {
    wq(c, s, u0 - 0.14, u1 + 0.14, 21, 57, "#c89458");
    wq(c, s, u0, u1, 24, 54, malam ? "#0d1130" : "#aedcff");
    if (!malam) {
      wq(c, s, u0, u1, 24, 33, "#fff0c8");
      wq(c, s, u0, u1, 33, 36, "#d9efff");
    } else {
      for (let i = 0; i < 7; i++) {
        const q = WP(s, u0 + hs(i + u0) * (u1 - u0), 30 + hs(i * 3 + u0) * 20);
        px(c, q[0], q[1], 1, 1, "#fff6cf");
      }
      const m = WP(s, u1 - 0.35, 48);
      disc(c, m[0], m[1], 3, "#fff2b8");
      disc(c, m[0] + 1, m[1] - 1, 3, "#0d1130");
    }
    if (!malam) {
      for (let v = 44; v < 54; v += 2.6) wq(c, s, u0, u1, v, v + 1.1, "#f1e4c3");
    }
    wq(c, s, (u0 + u1) / 2 - 0.04, (u0 + u1) / 2 + 0.04, 24, 54, "#c89458");
    wq(c, s, u0 - 0.22, u1 + 0.22, 19.5, 21.5, "#e6b878");
  }
