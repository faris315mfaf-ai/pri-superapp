"use client";

// ============================================================
// RUANG ISOMETRIK — kanvas kantor pixel-art tempat bot bekerja.
//
// Diporting dari mockup docs/mockups/pri-ruang-bot.html. Kanvas logis kecil
// (352x276) digambar prosedural lalu di-CSS-skala "pixelated" memenuhi lebar
// wadah (aspect-ratio 352/276). Latar statis (lantai, dinding, jendela)
// digambar sekali ke kanvas luar-layar dan dibangun ulang hanya saat
// siang/malam berubah; objek, bot, dinding dinamis digambar tiap frame
// berurut kedalaman.
//
// Loop requestAnimationFrame hanya berjalan bila tab aplikasi aktif DAN
// halaman terlihat. Posisi bot hidup di objek SimulasiBot / ref (bukan
// state), jadi tidak ada render ulang React per frame: overlay (tag nama,
// bubble, pil label meja) diposisikan lewat manipulasi style elemen.
// Menggambar dilewati bila kanvas di luar layar; simulasi tetap maju.
// ============================================================

import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useTabAktif } from "@/hooks/use-tab-aktif";
import { cn } from "@/lib/utils";
import { WARNA_TAHAP, URUTAN_TAHAP } from "./data-contoh";
import { gambarKarakter, type PoseBot } from "./sprite-bot";
import { STASIUN, type BotHidup, type SimulasiBot } from "./simulasi-bot";
import type { BotContoh, RupaBot, TahapBot } from "./tipe";

// ---------- konstanta kanvas ----------

const W = 352;
const H = 276;
const OX = 176;
const OY = 96;
const TINGGI_DINDING = 64;
const N = 10;
/** Batas dt per frame (detik nyata): tab yang baru kembali tidak melonjak. */
const DT_MAKS = 0.1;
/** Selang gambar minimal bila gerak dikurangi (ms). */
const SELANG_GAMBAR_DIKURANGI = 250;
/** Waktu animasi beku untuk gerak dikurangi (mata terbuka, tanpa kedip). */
const WAKTU_BEKU = 100;

type Ctx = CanvasRenderingContext2D;
type Titik = [number, number];

// ---------- primitif ----------

const P = (gx: number, gy: number, z = 0): Titik => [Math.round(OX + (gx - gy) * 16), Math.round(OY + (gx + gy) * 8 - z)];

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
  dindingL: "#2b2a58",
  dindingR: "#37376c",
  kayuGelap: "#3b2410",
  hiasan: "#c89458",
  mejaAtas: "#e4a85f",
  mejaKiri: "#b9763a",
  mejaKanan: "#8e5528",
};

// ---------- latar statis ----------

function gambarLatar(c: Ctx, malam: boolean) {
  c.clearRect(0, 0, W, H);
  px(c, 0, 0, W, H, "#0b0912");
  // lempeng lantai
  poly(c, [P(0, N, 0), P(N, N, 0), P(N, N, -6), P(0, N, -6)], C.lempengL);
  poly(c, [P(N, 0, 0), P(N, N, 0), P(N, N, -6), P(N, 0, -6)], C.lempengR);
  // ubin
  for (let gx = 0; gx < N; gx++) {
    for (let gy = 0; gy < N; gy++) {
      const genap = (gx + gy) & 1;
      let warna = genap ? C.lantaiA : C.lantaiB;
      const r = hs(gx * 13 + gy * 7);
      if (r > 0.82) warna = genap ? "#e8be82" : "#d8a468";
      else if (r < 0.12) warna = genap ? "#d8a96a" : "#c78f50";
      poly(c, [P(gx, gy), P(gx + 1, gy), P(gx + 1, gy + 1), P(gx, gy + 1)], warna);
    }
  }
  // karpet tengah
  frect(c, 3.3, 6.7, 3.5, 6.5, "#6d2a38");
  frect(c, 3.45, 6.55, 3.65, 6.35, "#9c3d4c");
  frect(c, 3.7, 6.3, 3.9, 6.1, "#d9a441");
  frect(c, 3.78, 6.22, 3.98, 6.02, "#9c3d4c");
  for (let i = 0; i < 7; i++) {
    const t = 3.9 + i * 0.4;
    frect(c, t, t + 0.18, 4.3, 4.48, "#d9a441", 0);
  }
  // bayangan dinding di lantai
  poly(c, [P(0, 0), P(N, 0), P(N, 0.55), P(0, 0.55)], "rgba(30,14,10,.2)");
  poly(c, [P(0, 0), P(0.55, 0), P(0.55, N), P(0, N)], "rgba(30,14,10,.2)");
  // dinding
  poly(c, [P(0, 0, TINGGI_DINDING), P(0, N, TINGGI_DINDING), P(0, N, 0), P(0, 0, 0)], C.dindingL);
  poly(c, [P(0, 0, TINGGI_DINDING), P(N, 0, TINGGI_DINDING), P(N, 0, 0), P(0, 0, 0)], C.dindingR);
  for (const s of ["L", "R"] as const) {
    for (let u = 1; u < N; u++) wq(c, s, u - 0.02, u + 0.02, 18, TINGGI_DINDING - 3, s === "L" ? "#323165" : "#41417a");
    wq(c, s, 0, N, 0, 16, s === "L" ? "#5d3b20" : "#6b4426");
    for (let u = 0; u < N; u += 1) wq(c, s, u + 0.04, u + 0.5, 3, 15, s === "L" ? "#6b4426" : "#7a5030");
    wq(c, s, 0, N, 16, 18.5, C.hiasan);
    wq(c, s, 0, N, 0, 3, C.kayuGelap);
    wq(c, s, 0, N, TINGGI_DINDING - 2.5, TINGGI_DINDING, "#1a1736");
  }
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
  // papan kanban (dinding kiri)
  wq(c, "L", 6.1, 8.0, 20, 50, C.hiasan);
  wq(c, "L", 6.2, 7.9, 21, 49, "#ebe3d1");
  wq(c, "L", 6.2, 7.9, 45.5, 49, "#d8cdb4");
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

function meja(c: Ctx, k: TahapBot, t: number, nyala: boolean, sinar: Titik[]) {
  const S = STASIUN[k];
  if (!S.meja || !S.monitor || !S.lampu) return;
  const [gx, gy, w, d] = S.meja;
  const kaki = (x: number, y: number) => box(c, x, y, 0.14, 0.14, 8, 0, "#5b3419", "#5b3419", "#3f2411");
  kaki(gx + 0.05, gy + 0.05);
  kaki(gx + w - 0.2, gy + 0.05);
  kaki(gx + 0.05, gy + d - 0.2);
  kaki(gx + w - 0.2, gy + d - 0.2);
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
  box(c, 6.95, 6.35, 0.1, 0.1, 7, 0, "#5b3419", "#5b3419", "#3f2411");
  box(c, 7.75, 6.35, 0.1, 0.1, 7, 0, "#5b3419", "#5b3419", "#3f2411");
  box(c, 6.95, 6.85, 0.1, 0.1, 7, 0, "#5b3419", "#5b3419", "#3f2411");
  box(c, 7.75, 6.85, 0.1, 0.1, 7, 0, "#5b3419", "#5b3419", "#3f2411");
  const cg = P(7.4, 6.65, 9);
  px(c, cg[0] - 2, cg[1] - 4, 4, 4, "#f4f0e6");
  px(c, cg[0] - 1, cg[1] - 5, 2, 1, "#6a3b1b");
}

function mesinKopi(c: Ctx, t: number) {
  box(c, 9.0, 4.8, 0.75, 0.7, 30, 0, "#d6d9df", "#a9aeb8", "#868b96");
  const y = 4.8 + 0.7;
  const a = 9.08;
  const b = 9.67;
  poly(c, [P(a, y, 26), P(b, y, 26), P(b, y, 19), P(a, y, 19)], "#20242c");
  poly(c, [P(a + 0.08, y, 24.5), P(a + 0.3, y, 24.5), P(a + 0.3, y, 22), P(a + 0.08, y, 22)], Math.floor(t / 500) % 2 ? "#6fe3a3" : "#2a6a4a");
  poly(c, [P(a + 0.35, y, 24.5), P(a + 0.5, y, 24.5), P(a + 0.5, y, 22.8), P(a + 0.35, y, 22.8)], "#e45b4a");
  poly(c, [P(a + 0.12, y, 17), P(a + 0.46, y, 17), P(a + 0.46, y, 11), P(a + 0.12, y, 11)], "#161820");
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

// ---------- adegan ----------

type PosisiLayar = { sx: number; sy: number };

type Adegan = {
  c: Ctx;
  t: number;
  sim: SimulasiBot;
  rupa: Map<string, { rupa: RupaBot; warna: string }>;
  terpilihId: string | null;
  malam: boolean;
  posisi: Map<string, PosisiLayar>;
};

const TAHAP_MEJA: TahapBot[] = ["cari", "edit", "posting"];

function gambarBot(a: Adegan, b: BotHidup) {
  const { c, t } = a;
  const data = a.rupa.get(b.id);
  if (!data) return;
  const duduk = b.keadaan === "bekerja";
  const angkat = duduk ? (b.tahap === "istirahat" ? 3 : 2) : 0;
  const pose: PoseBot = duduk ? (b.tahap === "istirahat" ? "duduk" : "ketik") : b.keadaan === "berjalan" ? "jalan" : "diam";
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
    bicara: !!b.teks && duduk,
    lencana: data.warna,
    cangkir: true,
  });
  a.posisi.set(b.id, { sx: fx, sy: fy - angkat });
}

function gambarObjek(a: Adegan, sinar: Titik[]) {
  const { c, t, sim } = a;
  sinar.length = 0;
  const daftar: { k: number; f: () => void }[] = [];
  const tambah = (k: number, f: () => void) => daftar.push({ k, f });
  tambah(1.3 + 8.2, () => rak(c, 0, 0.3, 1.4));
  tambah(1 + 10.3, () => rak(c, 0, 8.2, 1.4));
  tambah(9.2 + 0.2, () => tanaman(c, 9.3, 0.35));
  tambah(0.35 + 9.3, () => tanaman(c, 0.3, 9.3));
  for (const k of TAHAP_MEJA) {
    const S = STASIUN[k];
    if (!S.meja) continue;
    const [gx, gy, w, d] = S.meja;
    tambah(gx + w + gy + d, () => meja(c, k, t, sim.terisi(k), sinar));
    const s = S.kursi[0];
    tambah(s[0] + s[1] - 0.25, () => kursi(c, s[0], s[1], k === "posting" ? "x" : "y"));
  }
  tambah(14, () => sofaBelakang(c));
  tambah(18.4, () => sofaDepan(c));
  tambah(7.9 + 7.0, () => mejaKopi(c));
  tambah(9.75 + 5.5, () => mesinKopi(c, t));
  for (const b of sim.bots) tambah(b.x + b.y + 0.01, () => gambarBot(a, b));
  daftar.sort((p, q) => p.k - q.k);
  for (const o of daftar) o.f();
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

function gambarFrame(a: Adegan, bg: HTMLCanvasElement, sinar: Titik[]) {
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
  gambarCahaya(c, a.t, a.malam);
  gambarObjek(a, sinar);
  gambarMalam(a, sinar);
}

// ---------- langganan peramban (tanpa setState di effect) ----------

function langganVisibilitas(cb: () => void): () => void {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

function useHalamanTerlihat(): boolean {
  return useSyncExternalStore(
    langganVisibilitas,
    () => document.visibilityState === "visible",
    () => true,
  );
}

const KUERI_GERAK = "(prefers-reduced-motion: reduce)";

function langganGerak(cb: () => void): () => void {
  const mql = window.matchMedia(KUERI_GERAK);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function useGerakDikurangi(): boolean {
  return useSyncExternalStore(
    langganGerak,
    () => window.matchMedia(KUERI_GERAK).matches,
    () => false,
  );
}

// ---------- komponen ----------

export type RuangIsometrikProps = {
  sim: SimulasiBot;
  bots: BotContoh[];
  malam: boolean;
  /** Pengali kecepatan simulasi (1, 3, 8). */
  kecepatan: number;
  terpilihId: string | null;
  onPilih: (id: string | null) => void;
  /** Lapisan di atas kanvas (HUD, spanduk jeda). */
  children?: ReactNode;
  className?: string;
};

export function RuangIsometrik({ sim, bots, malam, kecepatan, terpilihId, onPilih, children, className }: RuangIsometrikProps) {
  const tabAktif = useTabAktif();
  const halamanTerlihat = useHalamanTerlihat();
  const gerakDikurangi = useGerakDikurangi();
  const jalan = tabAktif && halamanTerlihat;

  const kanvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<{ kanvas: HTMLCanvasElement; malam: boolean } | null>(null);
  const tagRef = useRef<(HTMLDivElement | null)[]>([]);
  const gelembungRef = useRef<(HTMLDivElement | null)[]>([]);
  const teksGelembungRef = useRef<(HTMLSpanElement | null)[]>([]);
  const pilRef = useRef<(HTMLDivElement | null)[]>([]);
  const skalaRef = useRef(0);
  const terlihatRef = useRef(true);
  const kotorRef = useRef(true);
  const posisiRef = useRef<Map<string, PosisiLayar>>(new Map());
  const sinarRef = useRef<Titik[]>([]);

  // Nilai terbaru untuk loop (diisi lewat effect agar loop tidak dibuat ulang).
  const malamRef = useRef(malam);
  const kecepatanRef = useRef(kecepatan);
  const terpilihRef = useRef(terpilihId);
  const rupaRef = useRef<Map<string, { rupa: RupaBot; warna: string }>>(new Map());
  const onPilihRef = useRef(onPilih);

  useEffect(() => {
    malamRef.current = malam;
    kecepatanRef.current = kecepatan;
    terpilihRef.current = terpilihId;
    onPilihRef.current = onPilih;
    rupaRef.current = new Map(bots.map((b) => [b.id, { rupa: b.rupa, warna: b.warna }]));
    kotorRef.current = true; // paksa gambar ulang walau mode gerak dikurangi
  }, [malam, kecepatan, terpilihId, onPilih, bots]);

  useEffect(() => {
    sim.setGerakKurang(gerakDikurangi);
  }, [sim, gerakDikurangi]);

  // Ukuran kanvas -> skala overlay. Ukuran 0 (tersembunyi) = tidak menggambar.
  useEffect(() => {
    const el = kanvasRef.current;
    if (!el) return;
    const ukur = () => {
      skalaRef.current = el.clientWidth / W;
      kotorRef.current = true;
    };
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Di luar layar (digulir keluar): lewati menggambar, simulasi tetap maju.
  useEffect(() => {
    const el = kanvasRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entri]) => {
      terlihatRef.current = entri.isIntersecting;
      if (entri.isIntersecting) kotorRef.current = true;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Loop utama: hanya saat tab aktif & halaman terlihat.
  useEffect(() => {
    if (!jalan) return;
    const kanvas = kanvasRef.current;
    const ctx = kanvas?.getContext("2d");
    if (!kanvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;

    let id = 0;
    let terakhir = performance.now();
    let akhirGambar = 0;

    const taruhOverlay = () => {
      const sc = skalaRef.current;
      if (sc <= 0) return;
      const daftar = sim.bots;
      for (let i = 0; i < daftar.length; i++) {
        const b = daftar[i];
        const tag = tagRef.current[i];
        const pos = posisiRef.current.get(b.id);
        if (!tag || !pos) continue;
        tag.style.visibility = "visible";
        tag.style.transform = `translate(${(pos.sx * sc).toFixed(1)}px, ${((pos.sy - 29) * sc).toFixed(1)}px) translate(-50%, -100%)`;
        tag.style.zIndex = String(Math.round(b.y * 10 + b.x * 10) + 10);
        const gel = gelembungRef.current[i];
        const isi = teksGelembungRef.current[i];
        if (gel && isi) {
          const teks = sim.teksTampil(b);
          if (teks) {
            if (isi.textContent !== teks) isi.textContent = teks;
            gel.style.setProperty("--c", WARNA_TAHAP[b.tahap]);
            gel.style.fontSize = `${Math.max(9, Math.min(12, sc * 3.3)).toFixed(1)}px`;
            gel.style.display = "block";
          } else {
            gel.style.display = "none";
          }
        }
      }
      URUTAN_TAHAP.forEach((k, i) => {
        const pil = pilRef.current[i];
        if (!pil) return;
        const p = P(STASIUN[k].label[0], STASIUN[k].label[1], 0);
        pil.style.transform = `translate(${(p[0] * sc).toFixed(1)}px, ${(p[1] * sc).toFixed(1)}px) translate(-50%, -50%)`;
        pil.style.fontSize = `${Math.max(8, sc * 2.9).toFixed(1)}px`;
        pil.dataset.sibuk = sim.terisi(k) ? "ya" : "tidak";
        pil.style.visibility = "visible";
      });
    };

    const langkah = (now: number) => {
      id = requestAnimationFrame(langkah);
      const dtNyata = Math.min(DT_MAKS, Math.max(0, (now - terakhir) / 1000));
      terakhir = now;
      sim.maju(dtNyata * kecepatanRef.current, dtNyata);

      if (!terlihatRef.current || skalaRef.current <= 0) return;
      if (gerakDikurangi && !kotorRef.current && now - akhirGambar < SELANG_GAMBAR_DIKURANGI) return;
      kotorRef.current = false;
      akhirGambar = now;

      // Latar luar-layar dibangun ulang hanya saat siang/malam berganti.
      const malamSekarang = malamRef.current;
      if (!bgRef.current) {
        const kb = document.createElement("canvas");
        kb.width = W;
        kb.height = H;
        bgRef.current = { kanvas: kb, malam: !malamSekarang };
      }
      if (bgRef.current.malam !== malamSekarang) {
        const cb = bgRef.current.kanvas.getContext("2d");
        if (cb) gambarLatar(cb, malamSekarang);
        bgRef.current.malam = malamSekarang;
      }

      gambarFrame(
        {
          c: ctx,
          t: gerakDikurangi ? WAKTU_BEKU : now,
          sim,
          rupa: rupaRef.current,
          terpilihId: terpilihRef.current,
          malam: malamSekarang,
          posisi: posisiRef.current,
        },
        bgRef.current.kanvas,
        sinarRef.current,
      );
      taruhOverlay();
    };

    id = requestAnimationFrame(langkah);
    return () => cancelAnimationFrame(id);
  }, [jalan, sim, gerakDikurangi]);

  const klikKanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    const sc = r.width / W;
    const x = (e.clientX - r.left) / sc;
    const y = (e.clientY - r.top) / sc;
    let kena: BotHidup | null = null;
    for (const b of sim.bots) {
      const pos = posisiRef.current.get(b.id);
      if (pos && Math.abs(x - pos.sx) < 9 && y < pos.sy + 3 && y > pos.sy - 27) kena = b;
    }
    onPilihRef.current(kena ? (terpilihRef.current === kena.id ? null : kena.id) : null);
  };

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-xl bg-[#0b0912]", className)}
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      <canvas
        ref={kanvasRef}
        width={W}
        height={H}
        role="img"
        aria-label="Ruangan kantor pixel-art tempat bot bekerja. Klik bot untuk memilihnya."
        onClick={klikKanvas}
        className="absolute inset-0 block h-full w-full cursor-pointer"
        style={{ imageRendering: "pixelated" }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {bots.map((b, i) => (
          <div
            key={b.id}
            ref={(el) => {
              tagRef.current[i] = el;
            }}
            className="absolute left-0 top-0 flex flex-col items-center gap-[3px]"
            style={{ visibility: "hidden", "--c": b.warna } as CSSProperties}
          >
            <div
              ref={(el) => {
                gelembungRef.current[i] = el;
              }}
              className="relative hidden rounded-md border-2 border-[var(--c)] bg-[#f6f0e2] px-[7px] py-[3px] font-mono font-bold leading-tight text-[#2a2118] shadow-[0_2px_0_rgba(0,0,0,.35)] after:absolute after:-bottom-[6px] after:left-1/2 after:-ml-1 after:border-4 after:border-transparent after:border-t-[var(--c)] after:content-['']"
            >
              <span
                ref={(el) => {
                  teksGelembungRef.current[i] = el;
                }}
                className="block max-w-[150px] truncate whitespace-nowrap sm:max-w-[230px]"
              />
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full border bg-[rgba(14,11,20,.85)] py-px pl-[5px] pr-[7px] text-[10.5px] font-bold text-[#f4efe8]",
                terpilihId === b.id ? "border-[#fde68a]" : "border-white/10",
              )}
            >
              <i className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--c)]" />
              {b.nama}
            </div>
          </div>
        ))}
        {URUTAN_TAHAP.map((k, i) => (
          <div
            key={k}
            ref={(el) => {
              pilRef.current[i] = el;
            }}
            data-sibuk="tidak"
            className="group absolute left-0 top-0 inline-flex items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-[var(--c)] bg-[rgba(14,11,20,.8)] px-[7px] py-[3px] font-mono text-[9.5px] font-bold leading-none tracking-[.6px] text-[#f4efe8] max-[560px]:hidden"
            style={{ visibility: "hidden", "--c": WARNA_TAHAP[k] } as CSSProperties}
          >
            <i className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--c)] group-data-[sibuk=ya]:shadow-[0_0_6px_var(--c)]" />
            {STASIUN[k].nama}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
