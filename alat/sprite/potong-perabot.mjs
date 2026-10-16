#!/usr/bin/env node
// ============================================================
// POTONG PERABOT — lembar perabot & benda beranimasi AI (grid 4×3, latar
// magenta) → sprite perabot terpisah untuk Ruang Bot (16 Okt 2026).
//
// Tiap benda punya jejak lantai [a, b] tile (a sejajar dinding kanan, b sejajar
// dinding kiri). Skala satu lembar dikalibrasi dari benda "penuh" (yang memang
// memenuhi jejaknya: meja, kasur, karpet, konter, mesin) → lebar layar jejak
// (a + b) * 32 px. Satu skala itu dipakai untuk semua benda di lembar tsb.
//
// Jangkar sprite = titik paling bawah benda (sudut depan jejak). Penempatan
// di ruang: sudut depan jejak tile (i..i+a, j..j+b) =
//   (sudutBelakang.x + (i + a - j - b) * 32, sudutBelakang.y + (i + a + j + b) * 16).
// Frame animasi satu baris diselaraskan pada jangkar yang sama (tidak bergetar).
//
//   node alat/sprite/potong-perabot.mjs [--sumber DIR] [--keluar DIR]
//        [--pratinjau berkas.png] [--ruang public/ruang/v1]
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
const KELUAR = A.keluar ?? "public/perabot/v1";
const PRATINJAU = A.pratinjau ? rumah(A.pratinjau) : null;
const RUANG = A.ruang ?? "public/ruang/v1";
const ISI_JEJAK = 0.94; // benda penuh menyisakan sedikit tepi di dalam jejaknya

// Katalog: urutan = sel kiri→kanan, atas→bawah. `penuh` = dipakai kalibrasi skala.
const LEMBAR = [
  {
    berkas: "perabot_1_ruang.png",
    benda: [
      { id: "meja_kiri", tapak: [1, 2], penuh: true },
      { id: "meja_kanan", tapak: [2, 1], penuh: true, catatan: "monitor menghadap belakang" },
      { id: "kursi_se", tapak: [1, 1] },
      { id: "kursi_sw", tapak: [1, 1] },
      { id: "kursi_ne", tapak: [1, 1] },
      { id: "kursi_nw", tapak: [1, 1] },
      { id: "meja_laptop", tapak: [1, 1], penuh: true },
      { id: "lemari_arsip", tapak: [1, 1] },
      { id: "rak_buku_kiri", tapak: [1, 1] },
      { id: "rak_buku_kanan", tapak: [1, 1] },
      { id: "tempat_sampah", tapak: [1, 1] },
      { id: "tanaman_tinggi", tapak: [1, 1] },
    ],
  },
  {
    berkas: "perabot_2_ruang.png",
    benda: [
      { id: "meja_rapat_panjang", tapak: [2, 3], penuh: true },
      { id: "meja_rapat_bundar", tapak: [2, 2], penuh: true },
      { id: "layar_presentasi", tapak: [1, 1] },
      { id: "meja_eksekutif", tapak: [1, 2], penuh: true },
      { id: "sofa_se", tapak: [1, 2], penuh: true },
      { id: "sofa_sw", tapak: [2, 1], penuh: true },
      { id: "meja_kopi", tapak: [1, 1] },
      { id: "kasur_kiri", tapak: [2, 1], penuh: true },
      { id: "kasur_kanan", tapak: [1, 2], penuh: true },
      { id: "nakas", tapak: [1, 1] },
      { id: "kursi_santai", tapak: [1, 1] },
      { id: "karpet", tapak: [2, 3], penuh: true, datar: true },
    ],
  },
  {
    berkas: "perabot_3_ruang.png",
    benda: [
      { id: "meja_resepsionis", tapak: [3, 1], penuh: true },
      { id: "bangku", tapak: [1, 2], penuh: true },
      { id: "tanaman_kecil", tapak: [1, 1] },
      { id: "tanaman_besar", tapak: [1, 1] },
      { id: "dispenser", tapak: [1, 1] },
      { id: "mesin_kopi", tapak: [1, 1] },
      { id: "mesin_minuman", tapak: [1, 1] },
      { id: "banner", tapak: [1, 1] },
      { id: "konter_pos", tapak: [1, 2], penuh: true },
      { id: "sekat_kaca_kiri", tapak: [1, 1] },
      { id: "sekat_kaca_kanan", tapak: [1, 1] },
      { id: "kardus", tapak: [1, 1] },
    ],
  },
  {
    berkas: "animasi_1_mesin.png",
    animasi: [
      { id: "rak_server", tapak: [1, 1], penuh: true, keadaan: ["kosong", "separuh", "penuh", "penuh_kedip"] },
      { id: "mesin_autoedit", tapak: [1, 1], penuh: true, keadaan: ["mati", "jalan_1", "jalan_2", "jalan_3"] },
      { id: "mesin_kompres", tapak: [1, 1], penuh: true, keadaan: ["mati", "jalan_1", "jalan_2", "jalan_3"] },
    ],
  },
  {
    berkas: "animasi_2_pos.png",
    animasi: [
      { id: "mesin_blur", tapak: [1, 1], penuh: true, keadaan: ["mati", "jalan_1", "jalan_2", "selesai"] },
      { id: "kotak_post", tapak: [1, 1], keadaan: ["tutup", "buka", "masuk", "terkirim"] },
      { id: "meja_monitor", tapak: [1, 2], penuh: true, keadaan: ["mati", "cari", "edit", "unggah"] },
    ],
  },
];

const latarKah = (r, g, b) => {
  const m = Math.min(r, b);
  const M = Math.max(r, b);
  return m > 22 && g < m * 0.5 && M - m < M * 0.6;
};
const terang = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

async function baca(p) {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, d: new Uint8ClampedArray(data) };
}

/** Garis grid: baris/kolom yang > separuhnya gelap. Dikelompokkan → pusat garis. */
function garisGrid(img) {
  const { w, h, d } = img;
  const gelap = (x, y) => { const o = (y * w + x) * 4; return terang(d[o], d[o + 1], d[o + 2]) < 70; };
  const kelompok = (xs) => {
    const out = [];
    for (const x of xs) {
      if (out.length && x - out[out.length - 1].at(-1) <= 3) out[out.length - 1].push(x);
      else out.push([x]);
    }
    return out.map((g) => ({ a: g[0], b: g[g.length - 1] }));
  };
  const kol = [];
  for (let x = 0; x < w; x++) { let n = 0; for (let y = 0; y < h; y++) if (gelap(x, y)) n++; if (n > h * 0.5) kol.push(x); }
  const bar = [];
  for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (gelap(x, y)) n++; if (n > w * 0.5) bar.push(y); }
  return { kol: kelompok(kol), bar: kelompok(bar) };
}

/** Batas sel dari garis grid (tepi gambar ikut jadi batas). */
function batasSel(garis, panjang, jumlah) {
  const dalam = garis.filter((g) => g.a > 4 && g.b < panjang - 5);
  if (dalam.length !== jumlah - 1) {
    // Garis tidak lengkap: bagi rata.
    return Array.from({ length: jumlah }, (_, i) => ({ a: Math.ceil((i * panjang) / jumlah) + 4, b: Math.floor(((i + 1) * panjang) / jumlah) - 4 }));
  }
  const tepi = [{ b: -1 }, ...dalam, { a: panjang }];
  return Array.from({ length: jumlah }, (_, i) => ({ a: tepi[i].b + 4, b: tepi[i + 1].a - 4 }));
}

function bersihkan(img) {
  const { w, h, d } = img;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (latarKah(d[o], d[o + 1], d[o + 2]) || terang(d[o], d[o + 1], d[o + 2]) < 70 && d[o] < 80 && d[o + 2] > d[o + 1] + 15 && d[o] > d[o + 1] + 15) d[o + 3] = 0;
  }
  for (let ulang = 0; ulang < 2; ulang++) {
    const hapus = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const o = (y * w + x) * 4;
        if (!d[o + 3] || !(d[o] - d[o + 1] > 45 && d[o + 2] - d[o + 1] > 45)) continue;
        if (!d[o - 1] || !d[o + 7] || !d[o - w * 4 + 3] || !d[o + w * 4 + 3]) hapus.push(o);
      }
    }
    for (const o of hapus) d[o + 3] = 0;
  }
}

/** Kotak isi (baris/kolom dengan ≥ 2 piksel) + jangkar = pusat baris piksel terbawah. */
function ukurSel(img, s) {
  const kol = new Array(s.x1 - s.x0).fill(0);
  const bar = new Array(s.y1 - s.y0).fill(0);
  for (let y = s.y0; y < s.y1; y++) for (let x = s.x0; x < s.x1; x++) if (img.d[(y * img.w + x) * 4 + 3]) { kol[x - s.x0]++; bar[y - s.y0]++; }
  const x0 = kol.findIndex((v) => v >= 2);
  const y0 = bar.findIndex((v) => v >= 2);
  if (x0 < 0 || y0 < 0) return null;
  const x1 = kol.length - 1 - [...kol].reverse().findIndex((v) => v >= 2);
  const y1 = bar.length - 1 - [...bar].reverse().findIndex((v) => v >= 2);
  const yb = s.y0 + y1;
  let sx = 0, n = 0;
  for (let y = yb - 2; y <= yb; y++) for (let x = s.x0 + x0; x <= s.x0 + x1; x++) if (img.d[(y * img.w + x) * 4 + 3]) { sx += x; n++; }
  return { x0: s.x0 + x0, y0: s.y0 + y0, x1: s.x0 + x1, y1: yb, jangkar: { x: n ? sx / n : (s.x0 + x0 + s.x0 + x1) / 2, y: yb + 1 } };
}

/** Ambil kotak sumber `k` diperkecil skala `f`; garis tepi gelap dipertahankan (seperti potong-karakter). */
function kecilkan(img, k, f, lebar, tinggi, geser) {
  const out = { w: lebar, h: tinggi, d: new Uint8ClampedArray(lebar * tinggi * 4) };
  const inv = 1 / f;
  for (let v = 0; v < tinggi; v++) {
    for (let u = 0; u < lebar; u++) {
      const sx0 = geser.x + u * inv, sy0 = geser.y + v * inv;
      const sx1 = sx0 + inv, sy1 = sy0 + inv;
      let r = 0, g = 0, b = 0, a = 0, gr = 0, gg = 0, gb = 0, ga = 0;
      for (let yi = Math.floor(sy0); yi < sy1; yi++) {
        if (yi < k.y0 || yi > k.y1) continue;
        const wy = Math.min(sy1, yi + 1) - Math.max(sy0, yi);
        for (let xi = Math.floor(sx0); xi < sx1; xi++) {
          if (xi < k.x0 || xi > k.x1) continue;
          const o = (yi * img.w + xi) * 4;
          if (!img.d[o + 3]) continue;
          const bobot = (Math.min(sx1, xi + 1) - Math.max(sx0, xi)) * wy;
          const pr = img.d[o], pg = img.d[o + 1], pb = img.d[o + 2];
          r += pr * bobot; g += pg * bobot; b += pb * bobot; a += bobot;
          if (terang(pr, pg, pb) < 55) { gr += pr * bobot; gg += pg * bobot; gb += pb * bobot; ga += bobot; }
        }
      }
      const luas = inv * inv;
      if (a / luas < 0.5) continue;
      const p = (v * lebar + u) * 4;
      if (ga / luas >= 0.35) { out.d[p] = gr / ga; out.d[p + 1] = gg / ga; out.d[p + 2] = gb / ga; }
      else { out.d[p] = r / a; out.d[p + 1] = g / a; out.d[p + 2] = b / a; }
      out.d[p + 3] = 255;
    }
  }
  return out;
}

async function tulis(img, p, palet = 64) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await sharp(Buffer.from(img.d.buffer, img.d.byteOffset, img.d.length), { raw: { width: img.w, height: img.h, channels: 4 } })
    .png({ palette: true, colours: palet, dither: 0, effort: 10 })
    .toFile(p);
}

async function main() {
  const t0 = Date.now();
  const manifest = {
    schemaVersion: 1,
    artStatus: "AI_DRAFT",
    dibuat: new Date().toISOString(),
    tile: { width: 64, height: 32 },
    penempatan: "jangkar sprite (sudut depan jejak) = (sudutBelakang.x + (i + a - j - b) * 32, sudutBelakang.y + (i + a + j + b) * 16) untuk jejak [a,b] di tile (i,j)",
    benda: {},
  };
  const sprite = {};
  for (const L of LEMBAR) {
    const img = await baca(path.join(SUMBER, L.berkas));
    const grid = garisGrid(img);
    bersihkan(img);
    const kol = batasSel(grid.kol, img.w, 4);
    const bar = batasSel(grid.bar, img.h, 3);
    const daftar = L.benda
      ? L.benda.map((b, n) => ({ ...b, sel: [{ x0: kol[n % 4].a, x1: kol[n % 4].b, y0: bar[Math.floor(n / 4)].a, y1: bar[Math.floor(n / 4)].b }] }))
      : L.animasi.map((b, r) => ({ ...b, sel: kol.map((c) => ({ x0: c.a, x1: c.b, y0: bar[r].a, y1: bar[r].b })) }));
    for (const b of daftar) b.ukur = b.sel.map((s) => ukurSel(img, s));
    // Kalibrasi skala lembar dari benda penuh (frame pertama).
    const skala = median(daftar.filter((b) => b.penuh && b.ukur[0]).map((b) => (((b.tapak[0] + b.tapak[1]) * 32 * ISI_JEJAK) / (b.ukur[0].x1 - b.ukur[0].x0 + 1))));
    console.log(`${L.berkas}: grid ${kol.length}×${bar.length}${grid.kol.length ? "" : " (rata)"}, skala ${skala.toFixed(4)}`);
    for (const b of daftar) {
      const frame = b.ukur.filter(Boolean);
      if (frame.length !== b.ukur.length) { console.warn(`  ${b.id}: sel kosong, dilewati`); continue; }
      // Kotak gabungan relatif jangkar → semua frame memakai bingkai & jangkar yang sama.
      const kiri = Math.max(...frame.map((k) => k.jangkar.x - k.x0));
      const kanan = Math.max(...frame.map((k) => k.x1 + 1 - k.jangkar.x));
      const atas = Math.max(...frame.map((k) => k.jangkar.y - k.y0));
      const lebar = Math.ceil((kiri + kanan) * skala) + 2;
      const tinggi = Math.ceil(atas * skala) + 2;
      const jx = Math.round(kiri * skala) + 1;
      const jy = tinggi - 1;
      const hasil = frame.map((k) => kecilkan(img, k, skala, lebar, tinggi, { x: k.jangkar.x - jx / skala, y: k.jangkar.y - jy / skala }));
      if (b.keadaan) {
        const strip = { w: lebar * hasil.length, h: tinggi, d: new Uint8ClampedArray(lebar * hasil.length * tinggi * 4) };
        hasil.forEach((f, n) => { for (let y = 0; y < tinggi; y++) strip.d.set(f.d.subarray(y * lebar * 4, (y + 1) * lebar * 4), (y * strip.w + n * lebar) * 4); });
        await tulis(strip, path.join(KELUAR, `${b.id}.png`));
      } else {
        await tulis(hasil[0], path.join(KELUAR, `${b.id}.png`));
      }
      sprite[b.id] = { img: hasil, jx, jy, tapak: b.tapak };
      manifest.benda[b.id] = {
        file: `${b.id}.png`,
        tapak: b.tapak,
        frame: { width: lebar, height: tinggi },
        jangkar: { x: jx, y: jy },
        ...(b.keadaan ? { keadaan: b.keadaan } : {}),
        ...(b.datar ? { datar: true } : {}),
        ...(b.catatan ? { catatan: b.catatan } : {}),
        sumber: L.berkas,
      };
    }
  }
  await fs.writeFile(path.join(KELUAR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  if (PRATINJAU) await pratinjau(sprite);
  console.log(`selesai ${((Date.now() - t0) / 1000).toFixed(1)} dtk → ${KELUAR} (${Object.keys(sprite).length} benda)`);
}

/** Pratinjau: ruang kerja berperabot + ruang database/alat/pos dengan benda beranimasi. */
async function pratinjau(sprite) {
  const mRuang = JSON.parse(await fs.readFile(path.join(RUANG, "manifest.json"), "utf8"));
  const tata = {
    kerja: [["karpet", 3, 4], ["meja_kiri", 0, 2], ["kursi_ne", 1, 3], ["meja_monitor", 0, 6, 2], ["kursi_ne", 1, 7], ["rak_buku_kanan", 5, 0], ["rak_buku_kanan", 6, 0], ["lemari_arsip", 8, 0], ["sofa_se", 5, 7], ["meja_kopi", 6, 5], ["tanaman_tinggi", 9, 9], ["tempat_sampah", 2, 1]],
    database: [["rak_server", 1, 0, 0], ["rak_server", 2, 0, 1], ["rak_server", 3, 0, 2], ["rak_server", 4, 0, 3], ["rak_server", 0, 2, 2], ["rak_server", 0, 3, 3], ["tanaman_besar", 9, 9]],
    alat: [["mesin_autoedit", 1, 0, 1], ["mesin_autoedit", 3, 0, 0], ["mesin_kompres", 0, 2, 2], ["mesin_kompres", 0, 4, 0], ["mesin_blur", 5, 0, 1], ["mesin_blur", 7, 0, 3], ["kardus", 8, 8]],
    pos: [["kotak_post", 2, 2, 2], ["kotak_post", 4, 2, 3], ["konter_pos", 0, 5], ["meja_monitor", 0, 1, 3], ["kursi_ne", 1, 2], ["dispenser", 9, 0], ["kardus", 7, 1], ["tanaman_kecil", 9, 9]],
  };
  const lapis = [];
  let ox = 0;
  let tinggiMaks = 0;
  for (const [nama, isi] of Object.entries(tata)) {
    const r = mRuang.ruang[nama];
    if (!r) continue;
    lapis.push({ input: path.join(RUANG, r.file), left: ox, top: 0 });
    const B = r.sudutBelakang;
    // urut kedalaman: sudut depan jejak (i + a + j + b)
    const urut = isi.map(([id, i, j, f = 0]) => ({ id, i, j, f, s: sprite[id] })).filter((x) => x.s).sort((p, q) => p.i + p.s.tapak[0] + p.j + p.s.tapak[1] - (q.i + q.s.tapak[0] + q.j + q.s.tapak[1]));
    for (const { i, j, f, s } of urut) {
      const [a, b] = s.tapak;
      const fx = B.x + (i + a - j - b) * 32;
      const fy = B.y + (i + a + j + b) * 16;
      const im = s.img[Math.min(f, s.img.length - 1)];
      lapis.push({ input: Buffer.from(im.d.buffer, im.d.byteOffset, im.d.length), raw: { width: im.w, height: im.h, channels: 4 }, left: Math.round(ox + fx - s.jx), top: Math.round(fy - s.jy) });
    }
    ox += r.kanvas.width;
    tinggiMaks = Math.max(tinggiMaks, r.kanvas.height);
  }
  await fs.mkdir(path.dirname(PRATINJAU), { recursive: true });
  const dasar = await sharp({ create: { width: ox, height: tinggiMaks, channels: 4, background: { r: 30, g: 26, b: 38, alpha: 1 } } }).composite(lapis).png().toBuffer();
  await sharp(dasar).resize(ox * 2, tinggiMaks * 2, { kernel: "nearest" }).toFile(PRATINJAU);
  console.log(`pratinjau → ${PRATINJAU}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
