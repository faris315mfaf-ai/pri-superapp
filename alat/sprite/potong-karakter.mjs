#!/usr/bin/env node
// ============================================================
// POTONG KARAKTER — lembar sprite AI (latar magenta) → atlas karakter
// sesuai kontrak kit TV Rakyat (16 Okt 2026).
//
// Masukan (folder --sumber, bawaan ~/Documents/TEST):
//   badan  : 12 kolom × 4 baris — idle(1) walk(6) sit(1) work(4); baris NW, NE, SE, SW
//   rambut : 4 kolom (NW, NE, SE, SW) × N baris gaya, abu-abu netral
//   atasan : 4 kolom (NW, NE, SE, SW) × N baris model, abu-abu netral, pose idle
//
// Keluaran (folder --keluar, bawaan public/karakter/v1):
//   badan_{anim}.png (+ _kulit masker), rambut_NN.png, atasan_NN_idle.png (+ _kulit),
//   versi @2x, dan manifest.json (frame 64×96, jangkar (32,80), offset kepala per frame).
//
// Cara kerja: latar magenta + garis grid dibuang, satu skala per lembar
// (tinggi karakter berdiri = --tinggi px), pengambilan sampel per area dengan
// garis tepi gelap dipertahankan, lalu palet dirapikan. Rambut & atasan
// diselaraskan ke kepala/kaus pose idle; rambut mengikuti offset kepala per frame.
//
//   node alat/sprite/potong-karakter.mjs [--sumber DIR] [--keluar DIR] [--tinggi 60]
//        [--pratinjau berkas.png] [--badan F] [--rambut F] [--atasan F]
//        [--rambut-baris N] [--atasan-baris N]   (bawaan: dideteksi dari celah kosong)
// ============================================================

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

function argumen(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    o[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "1";
  }
  return o;
}

const A = argumen(process.argv.slice(2));
const rumah = (p) => (p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p);
const SUMBER = rumah(A.sumber ?? "~/Documents/TEST");
const KELUAR = A.keluar ?? "public/karakter/v1";
const PRATINJAU = A.pratinjau ? rumah(A.pratinjau) : null;
const TINGGI = Number(A.tinggi ?? 60);

const ARAH = ["NW", "NE", "SE", "SW"];
const ANIMASI = [
  { nama: "idle", kolom: [0], fps: 2 },
  { nama: "walk", kolom: [1, 2, 3, 4, 5, 6], fps: 8 },
  { nama: "sit", kolom: [7], fps: 1 },
  { nama: "work", kolom: [8, 9, 10, 11], fps: 6 },
];
const LEMBAR = {
  badan: { berkas: A.badan ?? "Sprite Piksel Karakter Isometrik Magenta.png", kol: 12, bar: 4 },
  rambut: { berkas: A.rambut ?? "Atlas Rambut Pixel Empat Arah.png", kol: 4, bar: A["rambut-baris"] ? Number(A["rambut-baris"]) : "auto" },
  atasan: { berkas: A.atasan ?? "Lembar Sprite Pixel Art Pakaian Torso.png", kol: 4, bar: A["atasan-baris"] ? Number(A["atasan-baris"]) : "auto" },
};
const SKALA_KELUARAN = [
  { akhiran: "", fw: 64, fh: 96, ax: 32, ay: 80, kali: 1 },
  { akhiran: "@2x", fw: 128, fh: 192, ax: 64, ay: 160, kali: 2 },
];

// ---------- gambar dasar ----------
const baru = (w, h) => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });

async function baca(p) {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, d: new Uint8ClampedArray(data) };
}

async function tulis(img, p, palet = 0) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  let s = sharp(Buffer.from(img.d.buffer, img.d.byteOffset, img.d.length), { raw: { width: img.w, height: img.h, channels: 4 } });
  s = palet ? s.png({ palette: true, colours: palet, dither: 0, effort: 10 }) : s.png({ compressionLevel: 9 });
  await s.toFile(p);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const terang = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// ---------- warna khusus ----------
// Latar: magenta / ungu gelap (vinyet) — hijau jauh di bawah merah & biru yang setara.
function latarKah(r, g, b) {
  const m = Math.min(r, b);
  const M = Math.max(r, b);
  return m > 22 && g < m * 0.5 && M - m < M * 0.6;
}
// Kulit: jingga (merah > hijau > biru), bukan putih/abu.
const kulitKah = (r, g, b) => r > 90 && r > g + 18 && g > b + 8 && r - b > 45;
// Abu netral (rambut, pakaian dasar).
const netralKah = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < 22;

function bersihkan(img) {
  const { w, h, d } = img;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (latarKah(d[o], d[o + 1], d[o + 2])) d[o + 3] = 0;
  }
  // Garis grid: baris/kolom yang lebih dari separuhnya gelap (posisinya tidak selalu seragam).
  const gelap = (o) => d[o + 3] && terang(d[o], d[o + 1], d[o + 2]) < 70;
  const barisGrid = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (gelap((y * w + x) * 4)) n++;
    if (n > w * 0.5) barisGrid.push(y);
  }
  const kolomGrid = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (gelap((y * w + x) * 4)) n++;
    if (n > h * 0.5) kolomGrid.push(x);
  }
  for (const y of barisGrid) for (let yy = y - 1; yy <= y + 1; yy++) if (yy >= 0 && yy < h) for (let x = 0; x < w; x++) d[(yy * w + x) * 4 + 3] = 0;
  for (const x of kolomGrid) for (let xx = x - 1; xx <= x + 1; xx++) if (xx >= 0 && xx < w) for (let y = 0; y < h; y++) d[(y * w + xx) * 4 + 3] = 0;
  // Pinggir lembar sering bervinyet gelap: buang bingkai 2 px.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) d[(y * w + x) * 4 + 3] = 0;
  // Pinggiran merah muda (campuran latar) yang menempel di tepi dibuang.
  for (let ulang = 0; ulang < 2; ulang++) {
    const hapus = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const o = (y * w + x) * 4;
        if (!d[o + 3]) continue;
        if (!(d[o] - d[o + 1] > 45 && d[o + 2] - d[o + 1] > 45)) continue;
        if (!d[o - 1] || !d[o + 7] || !d[o - w * 4 + 3] || !d[o + w * 4 + 3]) hapus.push(o);
      }
    }
    for (const o of hapus) d[o + 3] = 0;
  }
}

/**
 * Batas baris dari celah kosong: pita berisi (≥ minTinggi px) dipisah di tengah
 * celahnya. Dipakai untuk lembar yang tinggi barisnya tidak seragam.
 */
function pitaBaris(img, minTinggi = 10) {
  const { w, h, d } = img;
  const pita = [];
  let mulai = -1;
  for (let y = 0; y <= h; y++) {
    let n = 0;
    if (y < h) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) n++;
    const ada = n > 3;
    if (ada && mulai < 0) mulai = y;
    if (!ada && mulai >= 0) { if (y - mulai >= minTinggi) pita.push([mulai, y - 1]); mulai = -1; }
  }
  return pita.map((p, i) => ({
    y0: i === 0 ? 0 : Math.floor((pita[i - 1][1] + p[0]) / 2),
    y1: i === pita.length - 1 ? h : Math.ceil((p[1] + pita[i + 1][0]) / 2),
  }));
}

function sel(img, L, c, r, tepi = 3) {
  const cw = img.w / L.kol;
  const x0 = Math.ceil(c * cw) + tepi;
  const x1 = Math.floor((c + 1) * cw) - tepi;
  if (L.batas) return { x0, x1, y0: L.batas[r].y0 + 1, y1: L.batas[r].y1 - 1 };
  const ch = img.h / L.bar;
  return { x0, x1, y0: Math.ceil(r * ch) + tepi, y1: Math.floor((r + 1) * ch) - tepi };
}

/** Kotak isi yang tahan bintik: baris/kolom dihitung hanya bila berisi ≥ 2 piksel. */
function kotak(img, s, uji = null, minimal = 2) {
  const kol = new Array(s.x1 - s.x0).fill(0);
  const bar = new Array(s.y1 - s.y0).fill(0);
  let n = 0;
  for (let y = s.y0; y < s.y1; y++) {
    for (let x = s.x0; x < s.x1; x++) {
      const o = (y * img.w + x) * 4;
      if (!img.d[o + 3]) continue;
      if (uji && !uji(img.d[o], img.d[o + 1], img.d[o + 2])) continue;
      kol[x - s.x0]++;
      bar[y - s.y0]++;
      n++;
    }
  }
  if (!n) return null;
  const x0 = kol.findIndex((v) => v >= minimal);
  const x1 = kol.length - 1 - [...kol].reverse().findIndex((v) => v >= minimal);
  const y0 = bar.findIndex((v) => v >= minimal);
  const y1 = bar.length - 1 - [...bar].reverse().findIndex((v) => v >= minimal);
  if (x0 < 0 || y0 < 0) return null;
  return { x0: s.x0 + x0, y0: s.y0 + y0, x1: s.x0 + x1, y1: s.y0 + y1, n };
}

/** Lebar isi (opsional teruji) pada pita baris [ya, yb). */
function lebarPita(img, s, ya, yb, uji = null) {
  let x0 = Infinity;
  let x1 = -1;
  for (let y = Math.max(s.y0, ya); y < Math.min(s.y1, yb); y++) {
    for (let x = s.x0; x < s.x1; x++) {
      const o = (y * img.w + x) * 4;
      if (!img.d[o + 3]) continue;
      if (uji && !uji(img.d[o], img.d[o + 1], img.d[o + 2])) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  }
  return x1 >= x0 ? { x0, x1, w: x1 - x0 + 1, c: (x0 + x1 + 1) / 2 } : null;
}

/**
 * Gambar sel sumber ke bingkai tujuan dengan skala k: titik sumber `sa` jatuh di
 * titik tujuan `da`. Tiap piksel tujuan = rata-rata area sumber; bila garis tepi
 * gelap menutupi ≥ 35% area, piksel memakai warna gelap itu (tepi tetap tegas).
 */
function gambarKe(dst, fx, fy, fw, fh, src, rect, sa, da, k) {
  const inv = 1 / k;
  for (let v = 0; v < fh; v++) {
    const sy0 = sa.y + (v - da.y) * inv;
    const sy1 = sy0 + inv;
    if (sy1 <= rect.y0 || sy0 >= rect.y1) continue;
    for (let u = 0; u < fw; u++) {
      const sx0 = sa.x + (u - da.x) * inv;
      const sx1 = sx0 + inv;
      if (sx1 <= rect.x0 || sx0 >= rect.x1) continue;
      let r = 0, g = 0, b = 0, a = 0, gr = 0, gg = 0, gb = 0, ga = 0;
      for (let yi = Math.floor(sy0); yi < sy1; yi++) {
        if (yi < rect.y0 || yi >= rect.y1) continue;
        const wy = Math.min(sy1, yi + 1) - Math.max(sy0, yi);
        for (let xi = Math.floor(sx0); xi < sx1; xi++) {
          if (xi < rect.x0 || xi >= rect.x1) continue;
          const o = (yi * src.w + xi) * 4;
          if (!src.d[o + 3]) continue;
          const bobot = (Math.min(sx1, xi + 1) - Math.max(sx0, xi)) * wy;
          const pr = src.d[o], pg = src.d[o + 1], pb = src.d[o + 2];
          r += pr * bobot; g += pg * bobot; b += pb * bobot; a += bobot;
          if (terang(pr, pg, pb) < 55) { gr += pr * bobot; gg += pg * bobot; gb += pb * bobot; ga += bobot; }
        }
      }
      const luas = inv * inv;
      if (a / luas < 0.5) continue;
      const p = ((fy + v) * dst.w + fx + u) * 4;
      if (ga / luas >= 0.35) { dst.d[p] = gr / ga; dst.d[p + 1] = gg / ga; dst.d[p + 2] = gb / ga; }
      else { dst.d[p] = r / a; dst.d[p + 1] = g / a; dst.d[p + 2] = b / a; }
      dst.d[p + 3] = 255;
    }
  }
}

function masker(img, uji) {
  const m = baru(img.w, img.h);
  for (let i = 0; i < img.w * img.h; i++) {
    const o = i * 4;
    if (img.d[o + 3] && uji(img.d[o], img.d[o + 1], img.d[o + 2])) { m.d[o] = m.d[o + 1] = m.d[o + 2] = 255; m.d[o + 3] = 255; }
  }
  return m;
}

/**
 * Masker per zona tubuh untuk pakaian dasar badan (kaus putih, celana abu tua,
 * sepatu putih). Tiap frame diukur kotak siluetnya; `uji(r,g,b,rel)` menerima
 * posisi relatif baris (0 = puncak kepala, 1 = alas kaki).
 */
function maskerZona(atlas, fw, fh, uji) {
  const m = baru(atlas.w, atlas.h);
  for (let fy = 0; fy < atlas.h; fy += fh) {
    for (let fx = 0; fx < atlas.w; fx += fw) {
      let y0 = -1, y1 = -1;
      for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) if (atlas.d[(y * atlas.w + x) * 4 + 3]) { if (y0 < 0) y0 = y; y1 = y; }
      if (y0 < 0) continue;
      for (let y = y0; y <= y1; y++) {
        const rel = (y - y0) / Math.max(1, y1 - y0);
        for (let x = fx; x < fx + fw; x++) {
          const o = (y * atlas.w + x) * 4;
          if (atlas.d[o + 3] && uji(atlas.d[o], atlas.d[o + 1], atlas.d[o + 2], rel)) { m.d[o] = m.d[o + 1] = m.d[o + 2] = 255; m.d[o + 3] = 255; }
        }
      }
    }
  }
  return m;
}
const sepatuKah = (r, g, b, rel) => netralKah(r, g, b) && terang(r, g, b) > 140 && rel >= 0.84;
const celanaKah = (r, g, b, rel) => netralKah(r, g, b) && terang(r, g, b) >= 45 && terang(r, g, b) <= 125 && rel >= 0.5 && rel < 0.93;
const bajuKah = (r, g, b, rel) => netralKah(r, g, b) && terang(r, g, b) > 140 && rel >= 0.28 && rel < 0.84;

/**
 * Kepala di bingkai tujuan: puncak siluet (kepala selalu bagian tertinggi; garis
 * tepinya stabil, tidak seperti piksel kulit yang bergeser saat palet dirapikan)
 * + pusat-x dari pita atas kepala.
 */
function kepalaDi(img, fx, fy, fw, fh, tinggi) {
  const s = { x0: fx, y0: fy, x1: fx + fw, y1: fy + fh };
  const k = kotak(img, s, null, 2);
  if (!k) return null;
  const pita = lebarPita(img, s, k.y0, k.y0 + Math.max(2, Math.round(tinggi * 0.25)));
  return { x: Math.round((pita ? pita.c : (k.x0 + k.x1 + 1) / 2) - fx), y: k.y0 - fy };
}

// ---------- proses ----------
async function main() {
  const t0 = Date.now();
  const src = {};
  for (const [nama, L] of Object.entries(LEMBAR)) {
    const p = path.join(SUMBER, L.berkas);
    src[nama] = await baca(p);
    bersihkan(src[nama]);
    if (L.bar === "auto") { L.batas = pitaBaris(src[nama]); L.bar = L.batas.length; }
    console.log(`baca ${nama}: ${L.berkas} ${src[nama].w}x${src[nama].h}, sel ${(src[nama].w / L.kol).toFixed(1)}x${(src[nama].h / L.bar).toFixed(1)}`);
  }
  const B = src.badan;

  // Jangkar tiap arah (baris badan): pusat-x & alas kaki dari idle + walk, relatif ke sel.
  const jangkar = [];
  const tinggiBerdiri = [];
  for (let r = 0; r < 4; r++) {
    const cx = [], alas = [];
    for (let c = 0; c <= 6; c++) {
      const s = sel(B, LEMBAR.badan, c, r);
      const k = kotak(B, s);
      if (!k) throw new Error(`sel badan kosong: kolom ${c + 1} baris ${r + 1}`);
      cx.push((k.x0 + k.x1 + 1) / 2 - s.x0);
      alas.push(k.y1 + 1 - s.y0);
      tinggiBerdiri.push(k.y1 - k.y0 + 1);
    }
    jangkar.push({ x: median(cx), y: median(alas) });
  }
  const k = TINGGI / median(tinggiBerdiri);
  console.log(`skala badan ${k.toFixed(4)} (tinggi sumber ${median(tinggiBerdiri)} px → ${TINGGI} px)`);

  // Kepala & kaus idle di sumber (untuk menyelaraskan rambut & atasan).
  const acuanBadan = [];
  for (let r = 0; r < 4; r++) {
    const s = sel(B, LEMBAR.badan, 0, r);
    const kk = kotak(B, s, kulitKah, 2);
    const hTinggi = median(tinggiBerdiri);
    const kepala = lebarPita(B, s, kk.y0, kk.y0 + Math.round(hTinggi * 0.4), kulitKah);
    const kausAtas = kk.y0 + Math.round(hTinggi * 0.4);
    const kaus = kotak(B, { ...s, y0: kausAtas, y1: s.y0 + jangkar[r].y - Math.round(hTinggi * 0.22) }, (r2, g2, b2) => netralKah(r2, g2, b2) && terang(r2, g2, b2) > 165, 3);
    acuanBadan.push({
      kepala: { x: kepala.c, y: kk.y0, w: kepala.w },
      kaus: kaus ? { x: (kaus.x0 + kaus.x1 + 1) / 2, y: kaus.y0, w: kaus.x1 - kaus.x0 + 1, h: kaus.y1 - kaus.y0 + 1 } : null,
      sel: s,
    });
  }
  const keDest = (r, px, py, S) => ({
    x: S.ax + (px - (acuanBadan[r].sel.x0 + jangkar[r].x)) * k * S.kali,
    y: S.ay + (py - (acuanBadan[r].sel.y0 + jangkar[r].y)) * k * S.kali,
  });

  const manifest = {
    schemaVersion: 1,
    id: "tvr_ai_v1",
    artStatus: "AI_DRAFT",
    dibuat: new Date().toISOString(),
    frame: { width: 64, height: 96, anchor: { x: 32, y: 80 } },
    versi2x: { akhiran: "@2x", width: 128, height: 192, anchor: { x: 64, y: 160 } },
    tinggiKarakter: TINGGI,
    directions: ARAH,
    atlasFormat: "columns=animation frame index, rows=direction (NW,NE,SE,SW)",
    animations: Object.fromEntries(ANIMASI.map((a) => [a.nama, { frames: a.kolom.length, fps: a.fps, loop: true }])),
    layers: {},
    kepala: {},
    warnaDasar: {},
    sumber: Object.fromEntries(Object.entries(LEMBAR).map(([n, L]) => [n, L.berkas])),
  };

  const hasil = {}; // untuk pratinjau (versi 1x)
  for (const S of SKALA_KELUARAN) {
    // ---- badan ----
    for (const an of ANIMASI) {
      const atlas = baru(S.fw * an.kolom.length, S.fh * 4);
      for (let r = 0; r < 4; r++) {
        an.kolom.forEach((c, j) => {
          const s = sel(B, LEMBAR.badan, c, r);
          gambarKe(atlas, j * S.fw, r * S.fh, S.fw, S.fh, B, s, { x: s.x0 + jangkar[r].x, y: s.y0 + jangkar[r].y }, { x: S.ax, y: S.ay }, k * S.kali);
        });
      }
      await tulis(atlas, path.join(KELUAR, `badan_${an.nama}${S.akhiran}.png`), 64);
      await tulis(masker(atlas, kulitKah), path.join(KELUAR, `badan_${an.nama}_kulit${S.akhiran}.png`), 2);
      await tulis(maskerZona(atlas, S.fw, S.fh, bajuKah), path.join(KELUAR, `badan_${an.nama}_baju${S.akhiran}.png`), 2);
      await tulis(maskerZona(atlas, S.fw, S.fh, celanaKah), path.join(KELUAR, `badan_${an.nama}_celana${S.akhiran}.png`), 2);
      await tulis(maskerZona(atlas, S.fw, S.fh, sepatuKah), path.join(KELUAR, `badan_${an.nama}_sepatu${S.akhiran}.png`), 2);
      if (S.kali === 1) {
        hasil[`badan_${an.nama}`] = atlas;
        // offset kepala tiap frame terhadap idle arah yang sama
        manifest.kepala[an.nama] = {};
        for (let r = 0; r < 4; r++) {
          manifest.kepala[an.nama][ARAH[r]] = an.kolom.map((_, j) => {
            const h = kepalaDi(atlas, j * S.fw, r * S.fh, S.fw, S.fh, TINGGI);
            return h ? [h.x, h.y] : null;
          });
        }
      }
    }

    // ---- rambut ----
    const R = src.rambut;
    const LR = LEMBAR.rambut;
    const acuanRambut = [];
    for (let c = 0; c < 4; c++) {
      const s0 = sel(R, LR, c, 0);
      const k0 = kotak(R, s0);
      const pita = lebarPita(R, s0, k0.y0, k0.y0 + Math.round((k0.y1 - k0.y0 + 1) * 0.6));
      acuanRambut.push({ x: pita.c - s0.x0, y: k0.y0 - s0.y0, w: pita.w });
    }
    for (let j = 0; j < LR.bar; j++) {
      const atlas = baru(S.fw, S.fh * 4);
      for (let r = 0; r < 4; r++) {
        const ref = acuanRambut[r];
        const kepala = acuanBadan[r].kepala;
        // Sedikit lebih besar & lebih tinggi dari kepala supaya kulit kepala tidak mengintip.
        const kr = ((k * S.kali * kepala.w) / ref.w) * 1.05;
        const s = sel(R, LR, r, j);
        const kb = kotak(R, s);
        if (!kb) continue;
        // Gaya lebih tebal dari acuan: puncaknya lebih tinggi dari tengkorak sebanyak setengah kelebihan lebarnya.
        const pita = lebarPita(R, s, kb.y0, kb.y0 + Math.round((kb.y1 - kb.y0 + 1) * 0.4));
        const tebal = pita ? Math.max(0, (pita.w - ref.w) / 2) * 0.6 : 0;
        const titikSumber = { x: pita ? pita.c : s.x0 + ref.x, y: kb.y0 + tebal };
        const tujuan = keDest(r, kepala.x, kepala.y, S);
        gambarKe(atlas, 0, r * S.fh, S.fw, S.fh, R, s, titikSumber, { x: tujuan.x, y: tujuan.y - S.kali }, kr);
      }
      const nn = String(j + 1).padStart(2, "0");
      await tulis(atlas, path.join(KELUAR, `rambut_${nn}${S.akhiran}.png`), 32);
      if (S.kali === 1) hasil[`rambut_${nn}`] = atlas;
    }

    // ---- atasan (idle) ----
    const T = src.atasan;
    const LT = LEMBAR.atasan;
    const kausUji = (r2, g2, b2) => netralKah(r2, g2, b2) && terang(r2, g2, b2) > 120;
    const acuanAtasan = [];
    for (let c = 0; c < 4; c++) {
      const s0 = sel(T, LT, c, 0);
      const k0 = kotak(T, s0, kausUji, 3);
      acuanAtasan.push({ x: (k0.x0 + k0.x1 + 1) / 2 - s0.x0, y: k0.y0 - s0.y0, w: k0.x1 - k0.x0 + 1, h: k0.y1 - k0.y0 + 1 });
    }
    for (let j = 0; j < LT.bar; j++) {
      const atlas = baru(S.fw, S.fh * 4);
      for (let r = 0; r < 4; r++) {
        const ref = acuanAtasan[r];
        const kaus = acuanBadan[r].kaus;
        if (!kaus) continue;
        // Lebar DAN tinggi: ujung atasan harus menutup kaus putih badan.
        const kt = k * S.kali * Math.max(kaus.w / ref.w, (kaus.h / ref.h) * 1.04);
        const s = sel(T, LT, r, j);
        const tujuan = keDest(r, kaus.x, kaus.y, S);
        gambarKe(atlas, 0, r * S.fh, S.fw, S.fh, T, s, { x: s.x0 + ref.x, y: s.y0 + ref.y }, { x: tujuan.x, y: tujuan.y }, kt);
      }
      const nn = String(j + 1).padStart(2, "0");
      await tulis(atlas, path.join(KELUAR, `atasan_${nn}_idle${S.akhiran}.png`), 48);
      await tulis(masker(atlas, kulitKah), path.join(KELUAR, `atasan_${nn}_idle_kulit${S.akhiran}.png`), 2);
      if (S.kali === 1) hasil[`atasan_${nn}`] = atlas;
    }
  }

  // Warna dasar (untuk mewarnai ulang di klien).
  const idle = hasil.badan_idle;
  const kulit = [[], [], []];
  for (let i = 0; i < idle.w * idle.h; i++) {
    const o = i * 4;
    if (idle.d[o + 3] && kulitKah(idle.d[o], idle.d[o + 1], idle.d[o + 2])) for (let c = 0; c < 3; c++) kulit[c].push(idle.d[o + c]);
  }
  const lumRambut = [];
  for (const [n, img] of Object.entries(hasil)) {
    if (!n.startsWith("rambut_")) continue;
    for (let i = 0; i < img.w * img.h; i++) {
      const o = i * 4;
      if (img.d[o + 3]) { const l = terang(img.d[o], img.d[o + 1], img.d[o + 2]); if (l > 45) lumRambut.push(l); }
    }
  }
  // Terang median tiap zona pakaian: acuan pewarnaan ulang (warna baru × terang piksel / acuan).
  const terangZona = (img, m) => {
    const ls = [];
    for (let i = 0; i < img.w * img.h; i++) if (m.d[i * 4 + 3]) ls.push(terang(img.d[i * 4], img.d[i * 4 + 1], img.d[i * 4 + 2]));
    return Math.round(median(ls));
  };
  const lumAtasan = [];
  for (const [n, img] of Object.entries(hasil)) {
    if (!n.startsWith("atasan_")) continue;
    for (let i = 0; i < img.w * img.h; i++) {
      const o = i * 4;
      if (img.d[o + 3] && netralKah(img.d[o], img.d[o + 1], img.d[o + 2])) { const l = terang(img.d[o], img.d[o + 1], img.d[o + 2]); if (l > 45) lumAtasan.push(l); }
    }
  }
  manifest.warnaDasar = {
    kulit: hex(median(kulit[0]), median(kulit[1]), median(kulit[2])),
    terangRambut: Math.round(median(lumRambut)),
    terangBaju: terangZona(idle, maskerZona(idle, 64, 96, bajuKah)),
    terangCelana: terangZona(idle, maskerZona(idle, 64, 96, celanaKah)),
    terangSepatu: terangZona(idle, maskerZona(idle, 64, 96, sepatuKah)),
    terangAtasan: Math.round(median(lumAtasan)),
  };
  manifest.layers = {
    badan: {
      file: "badan_{animation}.png",
      kulit: "badan_{animation}_kulit.png",
      baju: "badan_{animation}_baju.png",
      celana: "badan_{animation}_celana.png",
      sepatu: "badan_{animation}_sepatu.png",
      animations: ANIMASI.map((a) => a.nama),
    },
    rambut: { jumlah: LEMBAR.rambut.bar, file: "rambut_{nn}.png", frames: 1, ikutKepala: true, warna: "abu-abu netral; warnai ulang di klien" },
    atasan: { jumlah: LEMBAR.atasan.bar, file: "atasan_{nn}_idle.png", kulit: "atasan_{nn}_idle_kulit.png", animations: ["idle"], warna: "abu-abu netral; warnai ulang di klien" },
  };
  await fs.writeFile(path.join(KELUAR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  if (PRATINJAU) await buatPratinjau(hasil, manifest, PRATINJAU);
  console.log(`selesai ${((Date.now() - t0) / 1000).toFixed(1)} dtk → ${KELUAR}`);
}

// ---------- pratinjau ----------
function warnai(img, warna, uji, acuan) {
  const n = parseInt(warna.slice(1), 16);
  const t = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = { w: img.w, h: img.h, d: new Uint8ClampedArray(img.d) };
  for (let i = 0; i < img.w * img.h; i++) {
    const o = i * 4;
    if (!out.d[o + 3] || !uji(out.d[o], out.d[o + 1], out.d[o + 2])) continue;
    const f = terang(out.d[o], out.d[o + 1], out.d[o + 2]) / acuan;
    for (let c = 0; c < 3; c++) out.d[o + c] = Math.min(255, t[c] * f);
  }
  return out;
}

function tumpuk(dst, src, sx, sy, w, h, dx, dy, geser = [0, 0]) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = ((sy + y) * src.w + sx + x) * 4;
      if (!src.d[o + 3]) continue;
      const tx = dx + x + geser[0];
      const ty = dy + y + geser[1];
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      const p = (ty * dst.w + tx) * 4;
      dst.d[p] = src.d[o]; dst.d[p + 1] = src.d[o + 1]; dst.d[p + 2] = src.d[o + 2]; dst.d[p + 3] = 255;
    }
  }
}

async function buatPratinjau(hasil, manifest, keluar) {
  const FW = 64, FH = 96;
  const rambutAda = Object.keys(hasil).filter((n) => n.startsWith("rambut_")).sort();
  const atasanAda = Object.keys(hasil).filter((n) => n.startsWith("atasan_")).sort();
  const acuanKulit = (() => { const n = parseInt(manifest.warnaDasar.kulit.slice(1), 16); return terang((n >> 16) & 255, (n >> 8) & 255, n & 255); })();
  const kombinasi = [
    { rambut: 0, atasan: -1, warnaRambut: "#24252B", kulit: null },
    ...rambutAda.map((_, i) => ({ rambut: i, atasan: i % (atasanAda.length + 1) - 1, warnaRambut: ["#24252B", "#443129", "#784832", "#B27349", "#D7AD71", "#9E382F"][i % 6], kulit: ["#F6D3BE", "#DAA17C", null, "#95583E", "#543124"][i % 5] })),
  ];
  // Baris 1: idle 4 arah tiap kombinasi. Baris 2: walk 6 frame tiap arah (rambut mengikuti kepala).
  const kolomIdle = kombinasi.length;
  const lebar = Math.max(kolomIdle, 24) * FW;
  const kanvas = baru(lebar, FH * 4 + FH * 4);
  for (let i = 0; i < kanvas.w * kanvas.h; i++) { kanvas.d[i * 4] = 241; kanvas.d[i * 4 + 1] = 245; kanvas.d[i * 4 + 2] = 249; kanvas.d[i * 4 + 3] = 255; }
  const rakit = (frameBadan, anim, j, r, kmb) => {
    let badan = frameBadan;
    if (kmb.kulit) badan = warnai(badan, kmb.kulit, kulitKah, acuanKulit);
    return { badan, anim, j, r, kmb };
  };
  kombinasi.forEach((kmb, i) => {
    for (let r = 0; r < 4; r++) {
      const { badan } = rakit(hasil.badan_idle, "idle", 0, r, kmb);
      tumpuk(kanvas, badan, 0, r * FH, FW, FH, i * FW, r * FH);
      if (kmb.atasan >= 0) {
        let at = hasil[atasanAda[kmb.atasan]];
        if (kmb.kulit) at = warnai(at, kmb.kulit, kulitKah, acuanKulit);
        tumpuk(kanvas, at, 0, r * FH, FW, FH, i * FW, r * FH);
      }
      const rb = warnai(hasil[rambutAda[kmb.rambut]], kmb.warnaRambut, (a, b, c) => terang(a, b, c) > 45, manifest.warnaDasar.terangRambut);
      tumpuk(kanvas, rb, 0, r * FH, FW, FH, i * FW, r * FH);
    }
  });
  // walk + work dengan rambut ikut kepala
  const rb = warnai(hasil.rambut_03 ?? hasil[rambutAda[0]], "#443129", (a, b, c) => terang(a, b, c) > 45, manifest.warnaDasar.terangRambut);
  let x = 0;
  for (const anim of ["walk", "sit", "work"]) {
    const atlas = hasil[`badan_${anim}`];
    const n = manifest.animations[anim].frames;
    for (let j = 0; j < n; j++) {
      for (let r = 0; r < 4; r++) {
        tumpuk(kanvas, atlas, j * FW, r * FH, FW, FH, x, FH * 4 + r * FH);
        const h = manifest.kepala[anim][ARAH[r]][j];
        const h0 = manifest.kepala.idle[ARAH[r]][0];
        const geser = h && h0 ? [Math.round(h[0] - h0[0]), Math.round(h[1] - h0[1])] : [0, 0];
        tumpuk(kanvas, rb, 0, r * FH, FW, FH, x, FH * 4 + r * FH, geser);
      }
      x += FW;
    }
  }
  await fs.mkdir(path.dirname(keluar), { recursive: true });
  await sharp(Buffer.from(kanvas.d.buffer), { raw: { width: kanvas.w, height: kanvas.h, channels: 4 } })
    .resize(kanvas.w * 2, kanvas.h * 2, { kernel: "nearest" })
    .png()
    .toFile(keluar);
  console.log(`pratinjau → ${keluar}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
