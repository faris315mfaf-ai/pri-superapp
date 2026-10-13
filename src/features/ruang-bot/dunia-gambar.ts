// ============================================================
// DUNIA RUANG BOT — penggambar kanvas pixel-art (13 Okt 2026).
//
// Diporting dari mockup docs/mockups/pri-ruang-bot.html: satu gedung empat
// ruang (kerja, meeting, koordinator, kamar tidur) dengan sekat kaca. Kanvas
// logis kecil (524x344) digambar prosedural. Latar statis (lantai, dinding,
// jendela, papan) digambar sekali ke kanvas luar-layar dan dibangun ulang
// hanya saat siang/malam berubah; dinding dinamis, perabot, orang, dan sekat
// digambar tiap frame berurut kedalaman. Tanpa React/DOM: fungsi menerima ctx.
// ============================================================

import { WARNA_TAHAP } from "./data-contoh";
import { KASUR, KURSI_RAPAT, KURSI_TAMU_RAPAT, MEJA_KOORDINATOR, SEKAT, STASIUN, TIANG_PINTU, UKURAN_DENAH as NX, type Titik } from "./denah";
import type { BotHidup, SimulasiBot } from "./simulasi-bot";
import { RUPA_NARA, WARNA_NARA } from "./simulasi-nara";
import { gambarKarakter, type PoseBot } from "./sprite-bot";
import type { RupaBot, TahapBot } from "./tipe";

// ---------- konstanta kanvas ----------

export const W = 524;
export const H = 344;
const OX = 262;
const OY = 70;
const TINGGI_DINDING = 64;
/** Sisi ruang kerja (grid 0..10); sisanya ruang meeting / koordinator / kamar tidur. */
const N = 10;

type Ctx = CanvasRenderingContext2D;

// ---------- primitif ----------

export const P = (gx: number, gy: number, z = 0): Titik => [Math.round(OX + (gx - gy) * 16), Math.round(OY + (gx + gy) * 8 - z)];

function px(c: Ctx, x: number, y: number, w: number, h: number, warna: string) {
  c.fillStyle = warna;
  c.fillRect(x, y, w, h);
}

function poly(c: Ctx, pts: Titik[], warna: string) {
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
const hs = (n0: number) => {
  const n = Math.sin(n0 * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Terangkan/gelapkan warna "#rrggbb" dengan faktor k (dijepit 0..255). */
function terang(warna: string, k: number): string {
  const n = parseInt(warna.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return "#" + ((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
}

function disc(c: Ctx, cx: number, cy: number, r: number, warna: string) {
  c.fillStyle = warna;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    c.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

function box(c: Ctx, gx: number, gy: number, w: number, d: number, h: number, z0: number, cT: string, cL: string, cR: string) {
  const z1 = z0 + h;
  poly(c, [P(gx, gy, z1), P(gx + w, gy, z1), P(gx + w, gy + d, z1), P(gx, gy + d, z1)], cT);
  poly(c, [P(gx, gy + d, z1), P(gx + w, gy + d, z1), P(gx + w, gy + d, z0), P(gx, gy + d, z0)], cL);
  poly(c, [P(gx + w, gy, z1), P(gx + w, gy + d, z1), P(gx + w, gy + d, z0), P(gx + w, gy, z0)], cR);
}

/** Titik pada dinding: sisi kiri (x=0) atau kanan (y=0). */
const WP = (sisi: "L" | "R", u: number, v: number): Titik => (sisi === "L" ? P(0, u, v) : P(u, 0, v));

function wq(c: Ctx, sisi: "L" | "R", u0: number, u1: number, v0: number, v1: number, warna: string) {
  poly(c, [WP(sisi, u0, v0), WP(sisi, u1, v0), WP(sisi, u1, v1), WP(sisi, u0, v1)], warna);
}

function frect(c: Ctx, g0: number, g1: number, h0: number, h1: number, warna: string, z = 0) {
  poly(c, [P(g0, h0, z), P(g1, h0, z), P(g1, h1, z), P(g0, h1, z)], warna);
}

// ---------- warna ruangan (dunia gambar: tetap di terang maupun gelap) ----------

const C = {
  lantaiA: "#e2b374",
  lantaiB: "#d09a5a",
  lempengL: "#5a381c",
  lempengR: "#43280f",
  kayuGelap: "#3b2410",
  hiasan: "#c89458",
  mejaAtas: "#e4a85f",
  mejaKiri: "#b9763a",
  mejaKanan: "#8e5528",
};

/** Warna dinding per ruang. */
const ZW = { kerjaL: "#2b2a58", kerjaR: "#37376c", meetR: "#24505c", koorL: "#1f3a5f" };

// ---------- latar statis ----------

function lantai(c: Ctx, gx0: number, gx1: number, gy0: number, gy1: number, A: string, B: string, benih: number) {
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
function dindingBand(c: Ctx, s: "L" | "R", u0: number, u1: number, warna: string, warnaLis: string, alas: string, papan: string) {
  wq(c, s, u0, u1, 0, TINGGI_DINDING, warna);
  for (let u = Math.ceil(u0); u < u1; u++) wq(c, s, u - 0.02, u + 0.02, 18, TINGGI_DINDING - 3, terang(warna, 1.18));
  wq(c, s, u0, u1, 0, 16, alas);
  for (let u = u0; u < u1; u += 1) wq(c, s, u + 0.04, Math.min(u1, u + 0.5), 3, 15, papan);
  wq(c, s, u0, u1, 16, 18.5, warnaLis);
  wq(c, s, u0, u1, 0, 3, C.kayuGelap);
  wq(c, s, u0, u1, TINGGI_DINDING - 2.5, TINGGI_DINDING, "#1a1736");
}

export function gambarLatar(c: Ctx, malam: boolean) {
  c.clearRect(0, 0, W, H);
  px(c, 0, 0, W, H, "#0b0912");
  // lempeng lantai
  poly(c, [P(0, NX, 0), P(NX, NX, 0), P(NX, NX, -6), P(0, NX, -6)], C.lempengL);
  poly(c, [P(NX, 0, 0), P(NX, NX, 0), P(NX, NX, -6), P(NX, 0, -6)], C.lempengR);
  // lantai per ruang
  lantai(c, 0, 10, 0, 10, C.lantaiA, C.lantaiB, 0); // ruang kerja (kayu hangat)
  lantai(c, 10, 16, 0, 10, "#9db0c4", "#8da1b8", 31); // ruang meeting (karpet biru-abu)
  lantai(c, 0, 10, 10, 16, "#b6c3dd", "#a2b2d2", 57); // ruang koordinator (biru pucat)
  lantai(c, 10, 16, 10, 16, "#cdbbdc", "#bba7ce", 83); // kamar tidur (lavender)
  // karpet ruang kerja
  frect(c, 3.3, 6.7, 3.5, 6.5, "#6d2a38");
  frect(c, 3.45, 6.55, 3.65, 6.35, "#9c3d4c");
  frect(c, 3.7, 6.3, 3.9, 6.1, "#d9a441");
  frect(c, 3.78, 6.22, 3.98, 6.02, "#9c3d4c");
  for (let i = 0; i < 7; i++) {
    const t = 3.9 + i * 0.4;
    frect(c, t, t + 0.18, 4.3, 4.48, "#d9a441", 0);
  }
  // karpet meeting, koordinator (bertepi emas), dan kamar tidur
  frect(c, 11.0, 15.0, 3.2, 7.0, "#1d3b3f");
  frect(c, 11.12, 14.88, 3.32, 6.88, "#2a5a5e");
  frect(c, 1.8, 8.6, 11.4, 15.2, "#1b2a52");
  frect(c, 1.95, 8.45, 11.55, 15.05, "#2a3f78");
  frect(c, 2.15, 8.25, 11.75, 14.85, "#d9a441");
  frect(c, 2.22, 8.18, 11.82, 14.78, "#2a3f78");
  frect(c, 10.5, 15.5, 14.4, 15.7, "#8f78ad");
  frect(c, 10.62, 15.38, 14.5, 15.6, "#b3a0cb");
  // bayangan dinding di lantai
  poly(c, [P(0, 0), P(NX, 0), P(NX, 0.55), P(0, 0.55)], "rgba(30,14,10,.2)");
  poly(c, [P(0, 0), P(0.55, 0), P(0.55, NX), P(0, NX)], "rgba(30,14,10,.2)");
  // dinding belakang (y=0): kerja 0..10, meeting 10..16
  poly(c, [P(0, 0, TINGGI_DINDING), P(0, NX, TINGGI_DINDING), P(0, NX, 0), P(0, 0, 0)], ZW.kerjaL);
  poly(c, [P(0, 0, TINGGI_DINDING), P(NX, 0, TINGGI_DINDING), P(NX, 0, 0), P(0, 0, 0)], ZW.kerjaR);
  dindingBand(c, "R", 0, 10, ZW.kerjaR, C.hiasan, "#6b4426", "#7a5030");
  dindingBand(c, "R", 10, 16, ZW.meetR, "#d9a441", "#2a3f45", "#34525a");
  // dinding kiri (x=0): kerja 0..10, koordinator 10..16
  dindingBand(c, "L", 0, 10, ZW.kerjaL, C.hiasan, "#5d3b20", "#6b4426");
  dindingBand(c, "L", 10, 16, ZW.koorL, "#d9a441", "#3a4f73", "#46618a");
  poly(c, [P(0, 0, TINGGI_DINDING), P(0, 0, 0), [P(0, 0, 0)[0] + 1, P(0, 0, 0)[1]], [P(0, 0, TINGGI_DINDING)[0] + 1, P(0, 0, TINGGI_DINDING)[1]]], "#4a4a85");
  // jendela
  const jendela = (s: "L" | "R", u0: number, u1: number) => {
    wq(c, s, u0 - 0.14, u1 + 0.14, 21, 57, C.hiasan);
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
    wq(c, s, (u0 + u1) / 2 - 0.04, (u0 + u1) / 2 + 0.04, 24, 54, C.hiasan);
    wq(c, s, u0 - 0.22, u1 + 0.22, 19.5, 21.5, "#e6b878");
  };
  jendela("L", 2.4, 3.8);
  jendela("L", 4.3, 5.7);
  jendela("R", 0.7, 2.1);
  jendela("R", 7.1, 8.5);
  jendela("R", 10.8, 12.0);
  jendela("R", 14.4, 15.6);
  jendela("L", 14.6, 15.7);
  // papan kanban (dinding kiri ruang kerja)
  wq(c, "L", 6.1, 8.0, 20, 50, C.hiasan);
  wq(c, "L", 6.2, 7.9, 21, 49, "#ebe3d1");
  wq(c, "L", 6.2, 7.9, 45.5, 49, "#d8cdb4");
  // papan penugasan ruang koordinator (dinding kiri)
  wq(c, "L", 10.9, 14.3, 13, 56, "#d9a441");
  wq(c, "L", 11.0, 14.2, 14.5, 54.5, "#f2ece0");
  wq(c, "L", 11.0, 14.2, 48.5, 54.5, "#2a3f78");
  for (let i = 0; i < 3; i++) {
    wq(c, "L", 11.1 + i * 1.0, 11.95 + i * 1.0, 49.2, 53.8, ["#f08a3c", "#a56bd1", "#4cae6b"][i]);
    if (i < 2) wq(c, "L", 12.0 + i * 1.0, 12.05 + i * 1.0, 15.5, 47.5, "#cfc6b2");
  }
  // layar ruang meeting (dinding belakang)
  wq(c, "R", 11.9, 14.3, 18, 52, "#0e1626");
  wq(c, "R", 12.0, 14.2, 19, 51, "#08111f");
}

// ---------- perabot ----------

const WARNA_BUKU = ["#c2413b", "#3f7fb5", "#e0a93a", "#4c9a63", "#8a5db0", "#d9d2c0", "#c26a2f", "#2f5d8a"];

function rak(c: Ctx, gx: number, gy: number, d: number) {
  box(c, gx, gy, 1, d, 52, 0, "#a8642f", "#7a4420", "#8a4f24");
  const x = gx + 1;
  poly(c, [P(x, gy + 0.05, 50), P(x, gy + d - 0.05, 50), P(x, gy + d - 0.05, 3), P(x, gy + 0.05, 3)], "#2a170c");
  for (let r = 0; r < 4; r++) {
    const zb = 5 + r * 11.5;
    for (let g = gy + 0.08; g < gy + d - 0.14; g += 0.1) {
      const k = Math.floor(g * 10) + r * 37;
      const tinggi = 7 + Math.floor(hs(k) * 3.4);
      poly(c, [P(x, g, zb + tinggi), P(x, g + 0.085, zb + tinggi), P(x, g + 0.085, zb), P(x, g, zb)], WARNA_BUKU[Math.floor(hs(k + 9) * WARNA_BUKU.length)]);
    }
    poly(c, [P(x, gy + 0.03, zb - 1.2), P(x, gy + d - 0.03, zb - 1.2), P(x, gy + d - 0.03, zb - 2.4), P(x, gy + 0.03, zb - 2.4)], "#c58844");
  }
}

function tanaman(c: Ctx, gx: number, gy: number) {
  const [x, y] = P(gx, gy, 0);
  box(c, gx - 0.3, gy - 0.3, 0.6, 0.6, 9, 0, "#b3562f", "#8c3f20", "#6e2f17");
  px(c, x - 1, y - 26, 3, 17, "#5a3a1c");
  const daun: [number, number, number, string][] = [
    [x, y - 34, 9, "#2f6b34"],
    [x - 7, y - 27, 6, "#2f6b34"],
    [x + 7, y - 27, 6, "#2f6b34"],
    [x - 3, y - 40, 6, "#3b8442"],
    [x + 4, y - 36, 5, "#3b8442"],
    [x, y - 30, 5, "#4fa24f"],
  ];
  for (const d of daun) disc(c, d[0], d[1], d[2], d[3]);
  px(c, x - 4, y - 40, 2, 2, "#7ec96b");
  px(c, x + 3, y - 34, 2, 2, "#7ec96b");
}

function lampu(c: Ctx, gx: number, gy: number, z: number, sinar: Titik[]) {
  const [x, y] = P(gx, gy, z);
  px(c, x - 1, y - 6, 2, 6, "#3a3a3a");
  px(c, x - 3, y - 1, 6, 2, "#2b2b2b");
  px(c, x - 4, y - 10, 8, 4, "#f6c453");
  px(c, x - 3, y - 11, 6, 1, "#fde58a");
  sinar.push([x, y - 8]);
}

function monitor(c: Ctx, gx: number, gy: number, z: number, warna: string, nyala: boolean, t: number, benih: number) {
  box(c, gx, gy, 0.5, 0.42, 8, z, "#e2d8c3", "#bdb29c", "#9d927a");
  box(c, gx + 0.12, gy + 0.1, 0.26, 0.2, 1.8, z - 1.5, "#9d927a", "#9d927a", "#9d927a");
  const y = gy + 0.42;
  const a = gx + 0.06;
  const b = gx + 0.44;
  const z0 = z + 2;
  const z1 = z + 7;
  poly(c, [P(a, y, z1), P(b, y, z1), P(b, y, z0), P(a, y, z0)], nyala ? "#08140e" : "#17241c");
  if (nyala) {
    const f = Math.floor(t / 380);
    for (let i = 0; i < 3; i++) {
      const len = 0.1 + 0.26 * hs(benih + i * 5 + f * 3);
      poly(c, [P(a + 0.03, y, z1 - 1.2 - i * 1.6), P(a + 0.03 + len, y, z1 - 1.2 - i * 1.6), P(a + 0.03 + len, y, z1 - 2.2 - i * 1.6), P(a + 0.03, y, z1 - 2.2 - i * 1.6)], warna);
    }
  }
}

function kakiMeja(c: Ctx, x: number, y: number, tinggi = 8) {
  box(c, x, y, 0.14, 0.14, tinggi, 0, "#5b3419", "#5b3419", "#3f2411");
}

function mejaKerja(c: Ctx, k: TahapBot, t: number, nyala: boolean, sinar: Titik[]) {
  const S = STASIUN[k];
  if (!S.meja || !S.monitor || !S.lampu) return;
  const [gx, gy, w, d] = S.meja;
  kakiMeja(c, gx + 0.05, gy + 0.05);
  kakiMeja(c, gx + w - 0.2, gy + 0.05);
  kakiMeja(c, gx + 0.05, gy + d - 0.2);
  kakiMeja(c, gx + w - 0.2, gy + d - 0.2);
  box(c, gx, gy, w, d, 3, 8, C.mejaAtas, C.mejaKiri, C.mejaKanan);
  // laci
  poly(c, [P(gx + 0.2, gy + d, 7.2), P(gx + w * 0.45, gy + d, 7.2), P(gx + w * 0.45, gy + d, 3), P(gx + 0.2, gy + d, 3)], "#7a4420");
  // papan ketik
  const papan = (x: number, y: number) => poly(c, [P(x, y, 11.2), P(x + 0.5, y, 11.2), P(x + 0.5, y + 0.2, 11.2), P(x, y + 0.2, 11.2)], "#2a2630");
  for (const m of S.monitor) monitor(c, m[0], m[1], 11, WARNA_TAHAP[k], nyala, t, Math.floor(m[0] * 10 + m[1]));
  if (k === "posting") papan(2.5, 7.4);
  else papan(S.monitor[0][0] + 0.1, gy + 0.6);
  lampu(c, S.lampu[0], S.lampu[1], 11, sinar);
  // cangkir
  const cg = P(gx + w - 0.3, gy + 0.5, 11);
  px(c, cg[0] - 1, cg[1] - 3, 3, 3, "#f4f0e6");
  px(c, cg[0] + 2, cg[1] - 2, 1, 1, "#f4f0e6");
}

function kursi(c: Ctx, gx: number, gy: number, sandaran: "x" | "y") {
  if (sandaran === "y") box(c, gx - 0.35, gy - 0.42, 0.7, 0.12, 13, 9, "#3a3f66", "#2c3050", "#23263f");
  else box(c, gx - 0.42, gy - 0.35, 0.12, 0.7, 13, 9, "#3a3f66", "#2c3050", "#23263f");
  box(c, gx - 0.06, gy - 0.06, 0.12, 0.12, 6, 0, "#2a2a30", "#2a2a30", "#1b1b20");
  box(c, gx - 0.38, gy - 0.38, 0.76, 0.76, 2.6, 6.4, "#4a5088", "#363b69", "#2c3050");
}

/** Kursi menghadap -y (sandaran di sisi +y): kursi tamu rapat. */
function kursiMenghadapMeja(c: Ctx, gx: number, gy: number) {
  box(c, gx - 0.35, gy + 0.3, 0.7, 0.12, 13, 9, "#3a3f66", "#2c3050", "#23263f");
  box(c, gx - 0.06, gy - 0.06, 0.12, 0.12, 6, 0, "#2a2a30", "#2a2a30", "#1b1b20");
  box(c, gx - 0.38, gy - 0.38, 0.76, 0.76, 2.6, 6.4, "#4a5088", "#363b69", "#2c3050");
}

function sofaBelakang(c: Ctx) {
  box(c, 7, 7.45, 2.4, 0.4, 20, 5, "#3c8a8f", "#2e6e72", "#265a5d");
}

function sofaDepan(c: Ctx) {
  box(c, 7, 7.85, 2.4, 1.05, 7, 0, "#46a0a5", "#2e6e72", "#265a5d");
  box(c, 7, 7.45, 0.28, 1.45, 12, 0, "#3c8a8f", "#2e6e72", "#265a5d");
  box(c, 9.12, 7.45, 0.28, 1.45, 12, 0, "#3c8a8f", "#2e6e72", "#265a5d");
  poly(c, [P(7.3, 8.9, 6.2), P(9.1, 8.9, 6.2), P(9.1, 8.9, 3.2), P(7.3, 8.9, 3.2)], "#2a7378");
  box(c, 7.4, 7.9, 0.55, 0.55, 3, 7, "#e7b04a", "#c28b2c", "#a27020");
}

function mejaKopi(c: Ctx) {
  box(c, 6.9, 6.3, 1.0, 0.7, 2, 7, "#e0a95f", "#b9763a", "#8e5528");
  kakiMeja(c, 6.95, 6.35, 7);
  kakiMeja(c, 7.75, 6.35, 7);
  kakiMeja(c, 6.95, 6.85, 7);
  kakiMeja(c, 7.75, 6.85, 7);
  const cg = P(7.4, 6.65, 9);
  px(c, cg[0] - 2, cg[1] - 4, 4, 4, "#f4f0e6");
  px(c, cg[0] - 1, cg[1] - 5, 2, 1, "#6a3b1b");
}

/** Mesin kopi: di samping sekat, di bawah pintu ke ruang meeting (jalan lewat pintu tidak terhalang). */
const MESIN_KOPI_Y = 6.3;

function mesinKopi(c: Ctx, t: number) {
  box(c, 9.0, MESIN_KOPI_Y, 0.75, 0.7, 30, 0, "#d6d9df", "#a9aeb8", "#868b96");
  const y = MESIN_KOPI_Y + 0.7;
  const a = 9.08;
  const b = 9.67;
  poly(c, [P(a, y, 26), P(b, y, 26), P(b, y, 19), P(a, y, 19)], "#20242c");
  poly(c, [P(a + 0.08, y, 24.5), P(a + 0.3, y, 24.5), P(a + 0.3, y, 22), P(a + 0.08, y, 22)], Math.floor(t / 500) % 2 ? "#6fe3a3" : "#2a6a4a");
  poly(c, [P(a + 0.35, y, 24.5), P(a + 0.5, y, 24.5), P(a + 0.5, y, 22.8), P(a + 0.35, y, 22.8)], "#e45b4a");
  poly(c, [P(a + 0.12, y, 17), P(a + 0.46, y, 17), P(a + 0.46, y, 11), P(a + 0.12, y, 11)], "#161820");
}

/** Meja polos (meja rapat bertumpuk di atasnya). */
function mejaPolos(c: Ctx, gx: number, gy: number, w: number, d: number, cT: string, cL: string, cR: string) {
  kakiMeja(c, gx + 0.1, gy + 0.1, 7);
  kakiMeja(c, gx + w - 0.24, gy + 0.1, 7);
  kakiMeja(c, gx + 0.1, gy + d - 0.24, 7);
  kakiMeja(c, gx + w - 0.24, gy + d - 0.24, 7);
  box(c, gx, gy, w, d, 2, 7, cT, cL, cR);
}

function mejaRapat(c: Ctx, warnaBot: string[]) {
  mejaPolos(c, 11.4, 3.6, 3.5, 3.0, "#e6b46a", "#b9763a", "#8e5528");
  box(c, 11.5, 3.7, 3.3, 2.8, 0.6, 9, "#f0c88a", "#e6b46a", "#e6b46a");
  for (let i = 0; i < KURSI_RAPAT.length; i++) {
    const q = P(KURSI_RAPAT[i][0] + 0.1, 4.4, 9.8);
    px(c, q[0] - 3, q[1] - 1, 6, 2, "#f6f1e4");
    px(c, q[0] - 3, q[1] - 1, 1, 2, warnaBot[i] ?? "#94a3b8");
  }
  const c2 = P(13.1, 5.3, 9.8);
  px(c, c2[0] - 2, c2[1] - 3, 4, 3, "#f4f0e6");
  px(c, c2[0] - 1, c2[1] - 4, 2, 1, "#6a3b1b");
}

function nakas(c: Ctx, gx: number, gy: number, sinar: Titik[]) {
  box(c, gx, gy, 0.55, 0.55, 5, 0, "#a8642f", "#7a4420", "#6e3b1c");
  lampu(c, gx + 0.1, gy + 0.1, 5, sinar);
}

function mejaKoordinator(c: Ctx, t: number, nyala: boolean, sinar: Titik[]) {
  const [gx, gy, w, d] = MEJA_KOORDINATOR.meja;
  kakiMeja(c, gx + 0.05, gy + 0.05);
  kakiMeja(c, gx + w - 0.2, gy + 0.05);
  kakiMeja(c, gx + 0.05, gy + d - 0.2);
  kakiMeja(c, gx + w - 0.2, gy + d - 0.2);
  box(c, gx, gy, w, d, 3, 8, C.mejaAtas, C.mejaKiri, C.mejaKanan);
  for (let i = 0; i < 2; i++) {
    const m = MEJA_KOORDINATOR.monitor[i];
    monitor(c, m[0], m[1], 11, i ? WARNA_NARA : "#38bdf8", nyala, t, 60 + i * 7);
  }
  lampu(c, MEJA_KOORDINATOR.lampu[0], MEJA_KOORDINATOR.lampu[1], 11, sinar);
}

/** Satu kasur; bila `penghuni` ada, ia terbaring (kepala, selimut berwarna bot, huruf Z naik). */
function kasur(a: Adegan, i: number, penghuni: BotHidup | null) {
  const { c, t } = a;
  const [bx, by] = KASUR[i];
  box(c, bx, by - 0.05, 1.3, 0.12, 7, 0, "#6b4426", "#4b2f18", "#3f2411"); // papan kepala
  box(c, bx, by, 1.3, 2.4, 2.5, 0, "#a8642f", "#7a4420", "#6e3b1c"); // rangka
  box(c, bx + 0.06, by + 0.06, 1.18, 2.28, 2.2, 2.5, "#ece8f4", "#cfc9de", "#bdb6cf"); // kasur
  box(c, bx + 0.18, by + 0.12, 0.94, 0.5, 1.2, 4.7, "#ffffff", "#e0dce9", "#cfc9de"); // bantal
  const data = penghuni ? a.rupa.get(penghuni.id) : undefined;
  const tidur = !!penghuni && !!data;
  const warnaSelimut = tidur ? data.warna : "#9aa6c4";
  box(
    c,
    bx + 0.06,
    by + (tidur ? 0.78 : 1.7),
    1.18,
    tidur ? 1.5 : 0.6,
    1.4,
    4.7,
    warnaSelimut,
    tidur ? terang(warnaSelimut, 0.8) : "#7f8bab",
    tidur ? terang(warnaSelimut, 0.65) : "#6b7796",
  );
  if (!tidur || !penghuni || !data) return;
  const [hx, hy] = P(bx + 0.72, by + 0.42, 6.4);
  const rupa = data.rupa;
  const kotak: [number, number, number, number, string][] = [
    [hx - 4, hy - 6, 8, 6, rupa.kulit],
    [hx - 4, hy - 7, 8, 2, rupa.rambut],
    [hx - 5, hy - 5, 1, 3, rupa.rambut],
    [hx + 4, hy - 5, 1, 3, rupa.rambut],
  ];
  c.fillStyle = "#1a1220";
  for (const r of kotak) c.fillRect(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2);
  for (const r of kotak) {
    c.fillStyle = r[4];
    c.fillRect(r[0], r[1], r[2], r[3]);
  }
  px(c, hx - 3, hy - 3, 2, 1, "#2a1a1a");
  px(c, hx + 1, hy - 3, 2, 1, "#2a1a1a");
  px(c, hx - 1, hy - 1, 2, 1, "#a8553f");
  a.posisi.set(penghuni.id, { sx: hx, sy: hy - 4 });
  for (let k = 0; k < 3; k++) {
    // huruf Z yang naik
    const f = (t / 900 + k * 0.33) % 1;
    const zx = hx + 5 + k * 3 + Math.round(f * 3);
    const zy = hy - 9 - Math.round(f * 12);
    c.fillStyle = `rgba(226,232,240,${1 - f})`;
    c.fillRect(zx, zy, 3, 1);
    c.fillRect(zx + 2, zy + 1, 1, 1);
    c.fillRect(zx + 1, zy + 2, 1, 1);
    c.fillRect(zx, zy + 3, 3, 1);
  }
}

/**
 * Satu potong sekat kaca (panjang <= 1 grid): tiang kayu rendah + kaca di atasnya (bening / susu).
 * `batang` = posisi batang kuningan sepanjang sumbu panjang (koordinat grid). Sekat panjang dipotong
 * per 1 grid (lihat potongSekat) supaya urutan gambar terhadap orang yang lewat di sampingnya benar.
 */
function sekat(c: Ctx, gx: number, gy: number, w: number, d: number, buram: boolean, batang: number[]) {
  box(c, gx, gy, w, d, 10, 0, "#8a5a30", "#6b4426", "#5a381c");
  const z0 = 10;
  const z1 = 38;
  const kaca = buram ? "rgba(205,190,235,.46)" : "rgba(170,210,255,.15)";
  if (w < d) {
    // bidang sepanjang gy (muka +x terlihat)
    const x = gx + w;
    poly(c, [P(x, gy, z1), P(x, gy + d, z1), P(x, gy + d, z0), P(x, gy, z0)], kaca);
    for (const a of batang) poly(c, [P(x, a, z1), P(x, a + 0.07, z1), P(x, a + 0.07, z0), P(x, a, z0)], "rgba(240,220,170,.55)");
  } else {
    // bidang sepanjang gx (muka +y terlihat)
    const y = gy + d;
    poly(c, [P(gx, y, z1), P(gx + w, y, z1), P(gx + w, y, z0), P(gx, y, z0)], kaca);
    for (const a of batang) poly(c, [P(a, y, z1), P(a + 0.07, y, z1), P(a + 0.07, y, z0), P(a, y, z0)], "rgba(240,220,170,.55)");
  }
  poly(c, [P(gx, gy, z1 + 1.4), P(gx + w, gy, z1 + 1.4), P(gx + w, gy + d, z1 + 1.4), P(gx, gy + d, z1 + 1.4)], "#caa05a");
}

/**
 * Potong satu lempeng sekat jadi potongan <= 1 grid, masing-masing dengan kunci kedalaman sendiri.
 * Kunci satu sekat panjang (sudut jauhnya) membuat orang yang berjalan di depannya tergambar lebih
 * dulu dan tertimpa dasar kayunya.
 */
type PotonganSekat = { kunci: number; x: number; y: number; w: number; d: number; buram: boolean; batang: number[] };

export function potongSekat(s: { x: number; y: number; w: number; d: number; buram: boolean }): PotonganSekat[] {
  const memanjangY = s.w < s.d;
  const awal = memanjangY ? s.y : s.x;
  const panjang = memanjangY ? s.d : s.w;
  const n = Math.max(1, Math.ceil(panjang - 1e-9));
  const batangSemua: number[] = [];
  for (let g = awal; g <= awal + panjang + 0.01; g += 1.7) batangSemua.push(Math.min(g, awal + panjang - 0.05));
  const hasil: PotonganSekat[] = [];
  for (let k = 0; k < n; k++) {
    const dari = awal + k;
    const sampai = k === n - 1 ? awal + panjang : dari + 1;
    const batang = batangSemua.filter((a) => (k === n - 1 ? a >= dari : a >= dari && a < sampai));
    const x = memanjangY ? s.x : dari;
    const y = memanjangY ? dari : s.y;
    const w = memanjangY ? s.w : sampai - dari;
    const d = memanjangY ? sampai - dari : s.d;
    hasil.push({ kunci: x + w + y + d + 0.2, x, y, w, d, buram: s.buram, batang });
  }
  return hasil;
}

function tiangPintu(c: Ctx, gx: number, gy: number) {
  box(c, gx - 0.07, gy - 0.07, 0.14, 0.14, 40, 0, "#c89458", "#9a6c38", "#7a5230");
}

// ---------- dinding dinamis ----------

function dindingDinamis(c: Ctx, jamDetik: number, batang: number[], hitung: [number, number, number]) {
  // papan statistik (dinding kanan)
  wq(c, "R", 3.2, 6.0, 14.5, 49, "#9b6a3a");
  wq(c, "R", 3.3, 5.9, 16.5, 47.5, "#f5f1e8");
  wq(c, "R", 3.3, 5.9, 14.5, 16.5, "#7a5230");
  wq(c, "R", 3.4, 5.8, 43.5, 46.4, "#e5dccb");
  const warnaBatang = ["#f08a3c", "#a56bd1", "#4cae6b"];
  for (let i = 0; i < 3; i++) {
    const h = Math.min(20, 3 + (batang[i] ?? 0) * 4.5);
    wq(c, "R", 3.5 + i * 0.27, 3.5 + i * 0.27 + 0.19, 19, 19 + h, warnaBatang[i]);
  }
  wq(c, "R", 3.45, 4.4, 18.4, 19, "#2d2740");
  const garis: Titik[] = [[4.75, 30], [4.95, 34], [5.15, 31], [5.35, 38], [5.55, 36], [5.72, 41]];
  for (let i = 0; i < garis.length - 1; i++) {
    for (let s = 0; s <= 6; s++) {
      const u = garis[i][0] + ((garis[i + 1][0] - garis[i][0]) * s) / 6;
      const v = garis[i][1] + ((garis[i + 1][1] - garis[i][1]) * s) / 6;
      const q = WP("R", u, v);
      px(c, q[0], q[1], 1, 1, "#d9534f");
    }
  }
  const pc = WP("R", 5.2, 23.5);
  disc(c, pc[0], pc[1], 5, "#4cae6b");
  c.fillStyle = "#f08a3c";
  for (let dy = -5; dy <= 0; dy++) {
    const w = Math.floor(Math.sqrt(25 - dy * dy));
    c.fillRect(pc[0] - w, pc[1] + dy, w + 1, 1);
  }
  c.fillStyle = "#a56bd1";
  for (let dy = 0; dy <= 5; dy++) {
    const w = Math.floor(Math.sqrt(25 - dy * dy));
    c.fillRect(pc[0] - w, pc[1] + dy, Math.floor(w / 2) + 1, 1);
  }
  // jam dinding mengikuti jam simulasi
  const ck = WP("R", 6.55, 50);
  disc(c, ck[0], ck[1], 6, "#7a4a24");
  disc(c, ck[0], ck[1], 5, "#f6f1e4");
  const mm = (jamDetik / 60) % 60;
  const hh = (jamDetik / 3600) % 12;
  const jarum = (sudut: number, panjang: number, warna: string) => {
    for (let s = 0; s <= panjang; s++) px(c, Math.round(ck[0] + Math.sin(sudut) * s), Math.round(ck[1] - Math.cos(sudut) * s), 1, 1, warna);
  };
  jarum((mm / 60) * 6.283, 4, "#2a2118");
  jarum((hh / 12) * 6.283, 2.5, "#c2413b");
  // kanban: satu kertas per bot yang sedang di tahap itu
  const palet = ["#38bdf8", "#a78bfa", "#34d399"];
  const kertas = ["#fde68a", "#fbcfe8", "#bbf7d0", "#bae6fd"];
  for (let k = 0; k < 3; k++) {
    const u0 = 6.25 + k * 0.55;
    wq(c, "L", u0, u0 + 0.5, 45.5, 48.5, palet[k]);
    for (let n = 0; n < Math.min(hitung[k], 3); n++) wq(c, "L", u0 + 0.04, u0 + 0.46, 40.2 - n * 5, 43.8 - n * 5, kertas[(k + n) % 4]);
  }
}

/** Layar ruang meeting + papan penugasan Nara. */
function dindingRuangLain(a: Adegan) {
  const { c, t, sim } = a;
  const warnaAgen = ["#f08a3c", "#a56bd1", "#4cae6b"];
  // layar rapat: satu kotak per agen (hidup bila hadir, gelap bila tidur) + sorot suara
  for (let i = 0; i < 3; i++) {
    const b = sim.bots[i];
    const u0 = 12.12 + i * 0.68;
    const hadir = !!b && b.tempat === "rapat" && b.keadaan === "bekerja";
    const tidur = !!b && b.tempat === "tidur" && b.keadaan === "bekerja";
    wq(c, "R", u0, u0 + 0.58, 34, 48, tidur ? "#1c2230" : hadir ? terang(b ? (a.rupa.get(b.id)?.warna ?? warnaAgen[i]) : warnaAgen[i], 0.75) : "#222b3f");
    if (hadir) {
      const h = 4 + Math.floor(5 * hs(i * 7 + Math.floor(t / 260)));
      wq(c, "R", u0 + 0.1, u0 + 0.2, 35, 35 + h, "#ffffff");
      wq(c, "R", u0 + 0.28, u0 + 0.38, 35, 35 + Math.max(2, 9 - h), "#ffffff");
    }
  }
  wq(c, "R", 12.12, 14.1, 22, 32, "#101a2e");
  const garis = sim.rapat ? 4 : 1;
  for (let k = 0; k < garis; k++) wq(c, "R", 12.2, 12.2 + 0.5 + hs(k + Math.floor(sim.rapat ? t / 1400 : 0)) * 1.1, 23 + k * 2.2, 24.6 + k * 2.2, "#4b6aa8");
  const live = WP("R", 13.95, 49);
  disc(c, live[0], live[1], 2, sim.rapat ? "#ef4444" : "#4b2a2a");
  // papan penugasan koordinator: catatan per agen
  const kertas = ["#fde68a", "#fbcfe8", "#bbf7d0", "#bae6fd"];
  for (let i = 0; i < 3; i++) {
    const b = sim.bots[i];
    if (!b) continue;
    const u0 = 11.1 + i * 1.0;
    const banyak = sim.nara.jumlahCatatan(b.id);
    for (let k = 0; k < Math.min(3, banyak); k++) wq(c, "L", u0 + 0.04, u0 + 0.82, 40 - k * 8.6, 46 - k * 8.6, kertas[(i + k) % 4]);
  }
}

// ---------- adegan ----------

export type PosisiLayar = { sx: number; sy: number };

export type Adegan = {
  c: Ctx;
  t: number;
  sim: SimulasiBot;
  rupa: Map<string, { rupa: RupaBot; warna: string }>;
  terpilihId: string | null;
  malam: boolean;
  /** Posisi layar (titik kepala) tiap bot + "nara": dipakai penempatan tag & klik. */
  posisi: Map<string, PosisiLayar>;
};

export const ID_NARA = "nara";
const POTONGAN_SEKAT = new Map(SEKAT.map((s) => [s, potongSekat(s)] as const));
const TAHAP_MEJA: TahapBot[] = ["cari", "edit", "posting"];

function gambarBot(a: Adegan, b: BotHidup) {
  const { c, t } = a;
  const data = a.rupa.get(b.id);
  if (!data) return;
  const duduk = b.keadaan === "bekerja";
  const santai = b.tempat === "istirahat" || b.tempat === "rapat";
  const angkat = duduk ? (santai ? 3 : 2) : 0;
  const pose: PoseBot = duduk ? (santai ? "duduk" : "ketik") : b.keadaan === "berjalan" ? "jalan" : "diam";
  const [fx, fy] = P(b.x, b.y, 0);
  if (a.terpilihId === b.id) {
    c.fillStyle = "rgba(253,230,138,.75)";
    c.fillRect(fx - 9, fy, 18, 1);
    c.fillRect(fx - 7, fy + 1, 14, 1);
    c.fillRect(fx - 9, fy - 1, 1, 1);
    c.fillRect(fx + 8, fy - 1, 1, 1);
  }
  gambarKarakter(c, fx, fy, {
    rupa: data.rupa,
    waktu: t,
    pose,
    angkat,
    arah: b.arah,
    belakang: b.belakang && pose === "jalan",
    bicara: !!a.sim.teksTampil(b) && duduk,
    lencana: data.warna,
    cangkir: true,
  });
  a.posisi.set(b.id, { sx: fx, sy: fy - angkat });
}

function gambarNara(a: Adegan) {
  const { c, t, sim } = a;
  const n = sim.nara;
  const duduk = n.keadaan === "meja";
  const rapat = n.keadaan === "rapat";
  const jalan = n.keadaan === "jalan";
  const pose: PoseBot = duduk ? (n.punyaOtak ? "ketik" : "duduk") : rapat ? "duduk" : jalan ? "jalan" : "diam";
  const angkat = duduk ? (n.punyaOtak ? 2 : 3) : rapat ? 3 : 0;
  const [fx, fy] = P(n.x, n.y, 0);
  gambarKarakter(c, fx, fy, {
    rupa: RUPA_NARA,
    waktu: t,
    pose,
    angkat,
    arah: n.arah,
    belakang: (n.belakang && (jalan || n.keadaan === "tempel")) || rapat,
    bicara: n.teksTampil() !== "" && (duduk || rapat),
    lencana: WARNA_NARA,
    cangkir: true,
  });
  a.posisi.set(ID_NARA, { sx: fx, sy: fy - angkat });
}

function gambarKertas(a: Adegan) {
  const k = a.sim.nara.kertas;
  if (!k) return;
  const { c } = a;
  const u = Math.min(1, (a.sim.nara.waktu - k.t0) / k.dur);
  const e = u * u * (3 - 2 * u);
  const z = 16 + Math.sin(u * Math.PI) * 14;
  const q = P(k.x0 + (k.x1 - k.x0) * e, k.y0 + (k.y1 - k.y0) * e, z);
  px(c, q[0] - 3, q[1] - 4, 7, 5, "#f8f3e4");
  px(c, q[0] - 3, q[1] - 4, 7, 1, WARNA_NARA);
  px(c, q[0] - 2, q[1] - 2, 4, 1, "#8a8070");
  px(c, q[0] - 2, q[1], 3, 1, "#8a8070");
}

function gambarObjek(a: Adegan, sinar: Titik[]) {
  const { c, t, sim } = a;
  sinar.length = 0;
  const daftar: { k: number; f: () => void }[] = [];
  const tambah = (k: number, f: () => void) => daftar.push({ k, f });
  const warnaBot = sim.bots.map((b) => a.rupa.get(b.id)?.warna ?? "#94a3b8");

  // ruang kerja
  tambah(1.3 + 8.2, () => rak(c, 0, 0.3, 1.4));
  tambah(1 + 10.3, () => rak(c, 0, 8.2, 1.4));
  tambah(9.2 + 0.2, () => tanaman(c, 9.3, 0.35));
  tambah(0.35 + 9.3, () => tanaman(c, 0.3, 9.3));
  for (const k of TAHAP_MEJA) {
    const S = STASIUN[k];
    if (!S.meja) continue;
    const [gx, gy, w, d] = S.meja;
    tambah(gx + w + gy + d, () => mejaKerja(c, k, t, sim.terisi(k), sinar));
    const s = S.kursi[0];
    tambah(s[0] + s[1] - 0.25, () => kursi(c, s[0], s[1], k === "posting" ? "x" : "y"));
  }
  tambah(14, () => sofaBelakang(c));
  tambah(18.4, () => sofaDepan(c));
  tambah(7.9 + 7.0, () => mejaKopi(c));
  tambah(9.75 + MESIN_KOPI_Y + 0.7, () => mesinKopi(c, t));

  // ruang meeting
  // Kunci kedalaman meja = tepi dekat penonton, bukan sudut jauhnya: orang yang duduk di sisi dekat (Nara) harus tampil di depannya.
  tambah(18.5, () => mejaRapat(c, warnaBot));
  for (const s of KURSI_RAPAT) tambah(s[0] + s[1] - 0.25, () => kursi(c, s[0], s[1], "y"));
  for (const s of KURSI_TAMU_RAPAT) tambah(s[0] + s[1] + 0.5, () => kursiMenghadapMeja(c, s[0], s[1]));
  tambah(15.3 + 0.4 + 0.3, () => tanaman(c, 15.3, 0.45));
  tambah(15.4 + 8.9, () => tanaman(c, 15.4, 8.9));

  // ruang koordinator
  const [dg, dy, dw, dd] = MEJA_KOORDINATOR.meja;
  tambah(dg + dw + dy + dd, () => mejaKoordinator(c, t, sim.nara.bekerjaDiMeja, sinar));
  const ks = MEJA_KOORDINATOR.kursi;
  tambah(ks[0] + ks[1] - 0.25, () => kursi(c, ks[0], ks[1], "y"));
  tambah(9.3 + 15.3, () => tanaman(c, 9.3, 15.3));
  tambah(0.35 + 15.3, () => tanaman(c, 0.4, 15.3));
  tambah(9.2 + 10.6, () => tanaman(c, 9.3, 10.7));

  // kamar tidur
  for (let i = 0; i < KASUR.length; i++) tambah(KASUR[i][0] + 1.3 + KASUR[i][1] + 2.4, () => kasur(a, i, sim.tidurDi(i)));
  tambah(15.1 + 11.6 + 0.55, () => nakas(c, 15.1, 11.6, sinar));
  tambah(15.4 + 15.4, () => tanaman(c, 15.4, 15.4));

  // sekat kaca (pintu = celah) dan tiang pintu
  for (const s of SEKAT) for (const p of POTONGAN_SEKAT.get(s) ?? []) tambah(p.kunci, () => sekat(c, p.x, p.y, p.w, p.d, p.buram, p.batang));
  for (const p of TIANG_PINTU) tambah(p[0] + p[1] + 0.3, () => tiangPintu(c, p[0], p[1]));

  // orang (yang tidur digambar bersama kasurnya)
  for (const b of sim.bots) {
    if (sim.terbaring(b)) continue;
    tambah(b.x + b.y + 0.01, () => gambarBot(a, b));
  }
  tambah(sim.nara.x + sim.nara.y + 0.02, () => gambarNara(a));

  daftar.sort((p, q) => p.k - q.k);
  for (const o of daftar) o.f();
  gambarKertas(a);
}

const BERKAS_CAHAYA: Titik[][] = [
  [[0, 2.4], [0, 3.8], [4.2, 5.6], [4.2, 4.2]],
  [[0, 4.3], [0, 5.7], [4.3, 7.4], [4.3, 5.8]],
  [[0.7, 0], [2.1, 0], [0.6, 3.6], [-0.8, 3.6]],
  [[7.1, 0], [8.5, 0], [7.3, 3.8], [5.9, 3.8]],
];

function gambarCahaya(c: Ctx, t: number, malam: boolean) {
  if (malam) return;
  c.fillStyle = "rgba(255,226,150,.10)";
  for (const q of BERKAS_CAHAYA) {
    const pts = q.map((p) => P(p[0], p[1]));
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    c.fill();
  }
  for (let i = 0; i < 26; i++) {
    const q = BERKAS_CAHAYA[i % 4];
    const s = (t / 9000 + hs(i) * 3) % 1;
    const a = hs(i + 4);
    const gx = q[0][0] + (q[3][0] - q[0][0]) * s + (q[1][0] - q[0][0]) * a;
    const gy = q[0][1] + (q[3][1] - q[0][1]) * s + (q[1][1] - q[0][1]) * a;
    const p = P(gx, gy, 6 + Math.sin(t / 800 + i) * 4 + s * 10);
    c.fillStyle = `rgba(255,246,210,${0.35 + 0.4 * hs(i * 3 + Math.floor(t / 500))})`;
    c.fillRect(p[0], p[1], 1, 1);
  }
}

function gambarMalam(a: Adegan, sinar: Titik[]) {
  const { c, sim } = a;
  if (!a.malam) return;
  c.fillStyle = "rgba(10,12,46,.46)";
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = "lighter";
  for (const l of sinar) {
    const g = c.createRadialGradient(l[0], l[1], 1, l[0], l[1], 34);
    g.addColorStop(0, "rgba(255,190,90,.42)");
    g.addColorStop(1, "rgba(255,190,90,0)");
    c.fillStyle = g;
    c.fillRect(l[0] - 34, l[1] - 34, 68, 68);
  }
  for (const k of TAHAP_MEJA) {
    const S = STASIUN[k];
    if (!sim.terisi(k) || !S.monitor) continue;
    const m = S.monitor[0];
    const p = P(m[0] + 0.25, m[1] + 0.4, 10);
    const g = c.createRadialGradient(p[0], p[1], 1, p[0], p[1], 22);
    const rgb = k === "cari" ? "56,189,248" : k === "edit" ? "167,139,250" : "52,211,153";
    g.addColorStop(0, `rgba(${rgb},.35)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(p[0] - 22, p[1] - 22, 44, 44);
  }
  c.globalCompositeOperation = "source-over";
}

export function gambarFrame(a: Adegan, bg: HTMLCanvasElement, sinar: Titik[]) {
  const { c, sim } = a;
  c.clearRect(0, 0, W, H);
  c.drawImage(bg, 0, 0);
  const hitung: [number, number, number] = [0, 0, 0];
  let antre = 0;
  for (const b of sim.bots) {
    const i = TAHAP_MEJA.indexOf(b.tahap);
    if (i >= 0) hitung[i]++;
    if (b.keadaan === "menunggu") antre++;
  }
  hitung[1] += antre; // yang antre tampil sebagai kertas tambahan di kolom Edit
  dindingDinamis(c, sim.jamSimulasi, sim.bots.slice(0, 3).map((b) => b.kuota), hitung);
  dindingRuangLain(a);
  gambarCahaya(c, a.t, a.malam);
  gambarObjek(a, sinar);
  gambarMalam(a, sinar);
}
