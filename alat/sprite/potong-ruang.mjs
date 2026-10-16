#!/usr/bin/env node
// ============================================================
// POTONG RUANG — cangkang ruang AI (latar magenta) → modul ruang isometrik
// presisi untuk Ruang Bot (16 Okt 2026).
//
// Tiap gambar `ruang_<nama>.png` berisi lantai + 2 dinding belakang. Jumlah
// tile & kemiringan yang digambar AI tidak pernah tepat, jadi alat ini:
//   1. membuang latar magenta,
//   2. mencari tepi depan lantai (regresi, tebal pelat dikoreksi) DAN tepi
//      belakangnya (pertemuan lantai–dinding, lewat sebaran warna lantai) → 4 sudut,
//   3. memetakan (homografi 4 titik) lantai itu ke lantai W×D tile 64×32
//      (sisi terpanjang = --modul; sisi lain sebanding agar dinding tetap tegak),
//   4. menulis PNG 1x & @2x + manifest (sudut belakang lantai di kanvas).
//
// Titik pusat tile (i, j) di kanvas = (bx + (i - j) * 32, by + (i + j + 1) * 16),
// dengan (bx, by) = manifest.ruang[n].sudutBelakang — sama dengan proyeksi kit.
//
//   node alat/sprite/potong-ruang.mjs [--sumber DIR] [--keluar DIR] [--modul 10]
//        [--pratinjau berkas.png] [--karakter public/karakter/v1]
//        [--kalibrasi alat/sprite/kalibrasi-ruang.json]   (sudut belakang ukuran manual per ruang)
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
const KELUAR = A.keluar ?? "public/ruang/v1";
const PRATINJAU = A.pratinjau ? rumah(A.pratinjau) : null;
const KARAKTER = A.karakter ?? "public/karakter/v1";
const MODUL = Number(A.modul ?? 10);
const KALIBRASI = await (async () => {
  const p = A.kalibrasi ?? path.join(path.dirname(new URL(import.meta.url).pathname), "kalibrasi-ruang.json");
  try { return JSON.parse(await fs.readFile(p, "utf8")).ruang ?? {}; } catch { return {}; }
})();
const TW = 64;
const TH = 32;

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
  const d = new Uint8ClampedArray(data);
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * 4;
    if (latarKah(d[o], d[o + 1], d[o + 2])) d[o + 3] = 0;
  }
  // Pinggiran merah muda yang menempel di tepi.
  const w = info.width;
  const h = info.height;
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
  return { w, h, d };
}

/** Regresi garis y = a + b·x pada titik-titik. */
function garis(titik) {
  const n = titik.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of titik) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { a: (sy - b * sx) / n, b };
}

/** Sudut lantai (permukaan atas) dari profil bawah gambar. */
function sudutLantai(img) {
  const { w, h, d } = img;
  const bawah = new Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) if (d[(y * w + x) * 4 + 3]) { bawah[x] = y; break; }
  }
  const xs = [...Array(w).keys()].filter((x) => bawah[x] >= 0);
  const kiri = xs[0];
  const kanan = xs[xs.length - 1];
  let tengah = kiri;
  for (const x of xs) if (bawah[x] > bawah[tengah]) tengah = x;
  const sisi = (a, b) => {
    const t = [];
    for (let x = a; x <= b; x++) if (bawah[x] >= 0) t.push([x, bawah[x]]);
    return garis(t);
  };
  const lebarKiri = tengah - kiri;
  const lebarKanan = kanan - tengah;
  const gk = sisi(kiri + Math.round(lebarKiri * 0.1), tengah - Math.round(lebarKiri * 0.1));
  const gn = sisi(tengah + Math.round(lebarKanan * 0.1), kanan - Math.round(lebarKanan * 0.1));
  // Sudut depan = perpotongan dua garis tepi.
  const xd = (gn.a - gk.a) / (gk.b - gn.b);
  const depan = { x: xd, y: gk.a + gk.b * xd };

  // Tebal pelat: sisi pelat = pita seragam di atas garis tepi bawah; permukaan
  // lantai dimulai di garis sorot terang pertama (lompatan kecerahan > 40).
  const tebal = [];
  const lum = (x, y) => { const o = (y * w + x) * 4; return terang(d[o], d[o + 1], d[o + 2]); };
  for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    for (const [x0, ref] of [[kiri + lebarKiri * f, bawah], [tengah + lebarKanan * f, bawah]]) {
      const x = Math.round(x0);
      const yb = ref[x];
      for (let dy = 8; dy < 60 && yb - dy > 0; dy++) {
        if (lum(x, yb - dy) - lum(x, yb - dy + 1) > 40) { tebal.push(dy); break; }
      }
    }
  }
  const t = median(tebal);
  return {
    depanKiri: { a: gk.a - t, b: gk.b }, // tepi depan permukaan atas (pelat dikoreksi)
    depanKanan: { a: gn.a - t, b: gn.b },
    depan: { x: depan.x, y: depan.y - t },
    kiriX: kiri,
    kananX: kanan,
    tebal: t,
    miring: [gk.b, -gn.b],
  };
}

/** Perpotongan dua garis y = a + b·x. */
const potongGaris = (g1, g2) => {
  const x = (g2.a - g1.a) / (g1.b - g2.b);
  return { x, y: g1.a + g1.b * x };
};

/**
 * Tepi belakang lantai = pertemuan lantai–dinding yang SEBENARNYA (AI sering
 * menaruh dinding lebih ke depan dari jajaran genjang tepi depan). Dinding tegak,
 * jadi sudut belakang lantai tepat di bawah puncak sudut dinding. Kolom itu
 * ditelusuri dari dalam lantai ke atas sampai warnanya berhenti mirip lantai
 * selama ≥ 6 px (list dinding). Kedua tepi belakang ditarik dari titik itu,
 * sejajar tepi depan seberangnya.
 */
function garisBelakang(img, s, kalibrasi) {
  if (kalibrasi) {
    const [x, y] = kalibrasi;
    return {
      belakangKiri: { a: y - s.depanKanan.b * x, b: s.depanKanan.b },
      belakangKanan: { a: y - s.depanKiri.b * x, b: s.depanKiri.b },
      sumber: "kalibrasi",
    };
  }
  const { w, h, d } = img;
  // Kolom sudut: puncak siluet (titik tertinggi dinding).
  let xc = -1, yAtas = Infinity;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) if (d[(y * w + x) * 4 + 3]) { if (y < yAtas) { yAtas = y; xc = x; } break; }
  }
  const warna = (x, y) => { const o = (y * w + x) * 4; return d[o + 3] ? [d[o], d[o + 1], d[o + 2]] : null; };
  const jarak = (p, q) => (p && q ? Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) : Infinity);
  // Mulai dari tengah kedalaman lantai di kolom sudut.
  const yTersirat = s.depanKiri.a + s.depanKiri.b * s.kiriX + s.depanKanan.a + s.depanKanan.b * s.kananX - s.depan.y;
  const temuan = [];
  for (const x of [xc - 3, xc, xc + 3]) {
    const yMulai = Math.round(yTersirat + (s.depan.y - yTersirat) * 0.45);
    const jejak = [];
    let jauh = 0;
    for (let y = yMulai; y > yAtas; y--) {
      const p = warna(x, y);
      const acuan = jejak.length ? [0, 1, 2].map((c) => median(jejak.slice(-20).map((q) => q[c]))) : p;
      if (jarak(p, acuan) > 55) { if (++jauh >= 6) { temuan.push(y + jauh); break; } }
      else { jauh = 0; jejak.push(p); }
    }
  }
  const yc = temuan.length ? median(temuan) : yTersirat;
  const belakang = { x: xc, y: yc };
  return {
    belakangKiri: { a: belakang.y - s.depanKanan.b * belakang.x, b: s.depanKanan.b },
    belakangKanan: { a: belakang.y - s.depanKiri.b * belakang.x, b: s.depanKiri.b },
  };
}

/** Homografi 4 titik: fungsi yang memetakan titik bidang `dari` ke bidang `ke`. */
function homografi(dari, ke) {
  const M = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = dari[i];
    const { x: u, y: v } = ke[i];
    M.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    M.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Eliminasi Gauss dengan pivot parsial.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 9; k++) M[r][k] -= f * M[c][k];
    }
  }
  const h = M.map((baris, i) => baris[8] / baris[i]);
  return (x, y) => {
    const z = h[6] * x + h[7] * y + 1;
    return { x: (h[0] * x + h[1] * y + h[2]) / z, y: (h[3] * x + h[4] * y + h[5]) / z };
  };
}

/** Lengkungkan dengan sampel super 4×4; alfa biner seperti pixel art. */
function lengkungkan(img, balik, W, H) {
  const out = { w: W, h: H, d: new Uint8ClampedArray(W * H * 4) };
  const N = 4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const s = balik(x + (sx + 0.5) / N, y + (sy + 0.5) / N);
          const xi = Math.floor(s.x), yi = Math.floor(s.y);
          if (xi < 0 || yi < 0 || xi >= img.w || yi >= img.h) continue;
          const o = (yi * img.w + xi) * 4;
          if (!img.d[o + 3]) continue;
          r += img.d[o]; g += img.d[o + 1]; b += img.d[o + 2]; a++;
        }
      }
      if (a < (N * N) / 2) continue;
      const p = (y * W + x) * 4;
      out.d[p] = r / a; out.d[p + 1] = g / a; out.d[p + 2] = b / a; out.d[p + 3] = 255;
    }
  }
  return out;
}

async function tulis(img, p, palet = 0) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  let s = sharp(Buffer.from(img.d.buffer, img.d.byteOffset, img.d.length), { raw: { width: img.w, height: img.h, channels: 4 } });
  s = palet ? s.png({ palette: true, colours: palet, dither: 0, effort: 10 }) : s.png({ compressionLevel: 9 });
  await s.toFile(p);
}

async function main() {
  const t0 = Date.now();
  const berkas = (await fs.readdir(SUMBER)).filter((f) => /^ruang_[a-z0-9_]+\.png$/i.test(f)).sort();
  if (!berkas.length) throw new Error(`Tidak ada ruang_*.png di ${SUMBER}`);
  const manifest = {
    schemaVersion: 1,
    artStatus: "AI_DRAFT",
    dibuat: new Date().toISOString(),
    tile: { width: TW, height: TH },
    modul: MODUL,
    proyeksi: "i = 0..ukuran.w-1 (sepanjang dinding kanan), j = 0..ukuran.d-1 (sepanjang dinding kiri); pusat tile (i,j) = (sudutBelakang.x + (i - j) * 32, sudutBelakang.y + (i + j + 1) * 16)",
    ruang: {},
  };
  const hasil = {};
  for (const f of berkas) {
    const nama = f.replace(/^ruang_/i, "").replace(/\.png$/i, "").toLowerCase();
    const img = await baca(path.join(SUMBER, f));
    const s = sudutLantai(img);
    const gb = garisBelakang(img, s, KALIBRASI[nama]?.belakang);
    // Empat sudut lantai sebenarnya: tepi depan (permukaan atas) × tepi belakang (pertemuan dinding).
    s.kiri = potongGaris(s.depanKiri, gb.belakangKiri);
    s.kanan = potongGaris(s.depanKanan, gb.belakangKanan);
    s.belakang = potongGaris(gb.belakangKiri, gb.belakangKanan);
    // Ukuran lantai dalam tile: sisi kiri-depan = W (sejajar dinding kanan),
    // sisi kanan-depan = D. Sisi terpanjang = MODUL; sisi lain sebanding (AI
    // menggambar lantai persegi panjang walau diminta persegi). Memaksa persegi
    // akan memiringkan dinding. Tiap sisi = rata-rata dua tepi sejajarnya.
    const sisiW = (s.depan.x - s.kiri.x + (s.kanan.x - s.belakang.x)) / 2;
    const sisiD = (s.kanan.x - s.depan.x + (s.belakang.x - s.kiri.x)) / 2;
    const panjang = Math.max(sisiW, sisiD);
    const W = Math.max(4, Math.round((MODUL * sisiW) / panjang));
    const D = Math.max(4, Math.round((MODUL * sisiD) / panjang));
    const lebarSumber = s.kanan.x - s.kiri.x;
    const k = ((W + D) * (TW / 2)) / lebarSumber;
    const atasSumber = (() => {
      for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.d[(y * img.w + x) * 4 + 3]) return y;
      return 0;
    })();
    const tinggiDinding = Math.ceil((s.belakang.y - atasSumber) * k * 1.06) + 4;

    for (const kali of [1, 2]) {
      const pinggir = 24 * kali;
      const hx = (TW / 2) * kali; // langkah layar per tile
      const hy = (TH / 2) * kali;
      const lebarK = (W + D) * hx + pinggir * 2;
      const by = pinggir + tinggiDinding * kali;
      const tinggiK = by + (W + D) * hy + Math.ceil(s.tebal * k * kali) + pinggir;
      const bx = pinggir + D * hx;
      const balik = homografi(
        [
          { x: bx - D * hx, y: by + D * hy },
          { x: bx + (W - D) * hx, y: by + (W + D) * hy },
          { x: bx + W * hx, y: by + W * hy },
          { x: bx, y: by },
        ],
        [s.kiri, s.depan, s.kanan, s.belakang],
      );
      const out = lengkungkan(img, balik, lebarK, tinggiK);
      const akhiran = kali === 2 ? "@2x" : "";
      await tulis(out, path.join(KELUAR, `${nama}${akhiran}.png`), 96);
      if (kali === 1) {
        hasil[nama] = { img: out, bx, by, W, D };
        manifest.ruang[nama] = {
          file: `${nama}.png`,
          file2x: `${nama}@2x.png`,
          kanvas: { width: lebarK, height: tinggiK },
          ukuran: { w: W, d: D },
          sudutBelakang: { x: bx, y: by },
          sumber: f,
          ukurSumber: { miring: s.miring.map((v) => Number(v.toFixed(3))), tebalPelat: s.tebal },
        };
      }
    }
    console.log(`${nama}: ${W}×${D} tile (${gb.sumber ?? "otomatis"}), miring ${s.miring.map((v) => v.toFixed(3)).join("/")}, pelat ${s.tebal}px → ${manifest.ruang[nama].kanvas.width}x${manifest.ruang[nama].kanvas.height}`);
  }
  await fs.writeFile(path.join(KELUAR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  if (PRATINJAU) await pratinjau(hasil);
  console.log(`selesai ${((Date.now() - t0) / 1000).toFixed(1)} dtk → ${KELUAR}`);
}

/** Pratinjau: tiap ruang + titik pusat tile + beberapa karakter dari atlas (bila ada). */
async function pratinjau(hasil) {
  const nama = Object.keys(hasil);
  const kol = 4;
  const sel = { w: Math.max(...nama.map((n) => hasil[n].img.w)), h: Math.max(...nama.map((n) => hasil[n].img.h)) };
  const lapis = [];
  let adaKarakter = true;
  try { await fs.access(path.join(KARAKTER, "badan_idle.png")); } catch { adaKarakter = false; }
  const potong = (f, r) => sharp(path.join(KARAKTER, f)).extract({ left: 0, top: r * 96, width: 64, height: 96 }).png().toBuffer();
  const titik = Buffer.from([255, 255, 255, 170]);
  const orang = [[2, 2, 2, "rambut_03.png"], [6, 3, 3, "rambut_18.png"], [4, 6, 0, "rambut_11.png"]];
  for (let n = 0; n < nama.length; n++) {
    const { img, bx, by } = hasil[nama[n]];
    const ox = (n % kol) * sel.w;
    const oy = Math.floor(n / kol) * sel.h;
    lapis.push({ input: Buffer.from(img.d.buffer, img.d.byteOffset, img.d.length), raw: { width: img.w, height: img.h, channels: 4 }, left: ox, top: oy });
    for (let i = 0; i < hasil[nama[n]].W; i++) for (let j = 0; j < hasil[nama[n]].D; j++) {
      lapis.push({ input: titik, raw: { width: 1, height: 1, channels: 4 }, left: Math.round(ox + bx + (i - j) * 32), top: Math.round(oy + by + (i + j + 1) * 16) });
    }
    if (!adaKarakter) continue;
    for (const [i, j, r, rambut] of orang.sort((p, q) => p[0] + p[1] - (q[0] + q[1]))) {
      const left = Math.round(ox + bx + (i - j) * 32 - 32);
      const top = Math.round(oy + by + (i + j + 1) * 16 - 80);
      lapis.push({ input: await potong("badan_idle.png", r), left, top });
      lapis.push({ input: await potong(rambut, r), left, top });
    }
  }
  const W = kol * sel.w;
  const H = Math.ceil(nama.length / kol) * sel.h;
  await fs.mkdir(path.dirname(PRATINJAU), { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 30, g: 26, b: 38, alpha: 1 } } })
    .composite(lapis)
    .png()
    .toFile(PRATINJAU);
  console.log(`pratinjau → ${PRATINJAU}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
