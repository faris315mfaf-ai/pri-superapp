// ============================================================
// KARAKTER SPRITE (16 Okt 2026) — perakit rupa pixel art dari atlas
// public/karakter/v1 (alat/sprite/potong-karakter.mjs). Hanya klien.
//
// Satu frame = badan (anim, arah, frame) → atasan (hanya pose diam; pose lain
// memakai kaus dasar berwarna atasan) → rambut (digeser mengikuti kepala).
// Warna diganti lewat masker: kulit (rasio warna), kaus/celana/sepatu/atasan/
// rambut (warna baru × terang piksel / terang acuan). Hasil di-cache per
// konfigurasi + anim + arah + frame + skala.
// ============================================================

import type { KonfigKarakter } from "@/lib/karakter-murni";

export type AnimKarakter = "idle" | "walk" | "sit" | "work";
export type ArahKarakter = "NW" | "NE" | "SE" | "SW";
export const URUTAN_ARAH: readonly ArahKarakter[] = ["NW", "NE", "SE", "SW"];

type Manifest = {
  frame: { width: number; height: number; anchor: { x: number; y: number } };
  animations: Record<AnimKarakter, { frames: number; fps: number }>;
  kepala: Record<AnimKarakter, Record<ArahKarakter, ([number, number] | null)[]>>;
  warnaDasar: { kulit: string; terangRambut: number; terangBaju: number; terangCelana: number; terangSepatu: number; terangAtasan: number };
};

const DASAR = "/karakter/v1";
let manifestJanji: Promise<Manifest> | null = null;
const dataJanji = new Map<string, Promise<ImageData>>();
const frameCache = new Map<string, HTMLCanvasElement>();
// Satu frame 64x96 RGBA ±24 KB; 1200 frame ±29 MB paling banyak (dunia v2 untuk semua akun: banyak rupa sekaligus).
const MAKS_CACHE = 1200;

export function muatManifestKarakter(): Promise<Manifest> {
  if (!manifestJanji) {
    manifestJanji = fetch(`${DASAR}/manifest.json`).then((r) => {
      if (!r.ok) throw new Error(`manifest karakter ${r.status}`);
      return r.json() as Promise<Manifest>;
    });
    manifestJanji.catch(() => { manifestJanji = null; });
  }
  return manifestJanji;
}

function dataGambar(berkas: string): Promise<ImageData> {
  let j = dataJanji.get(berkas);
  if (!j) {
    j = new Promise<ImageData>((ok, gagal) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) { gagal(new Error("canvas 2d tidak tersedia")); return; }
        ctx.drawImage(img, 0, 0);
        ok(ctx.getImageData(0, 0, c.width, c.height));
      };
      img.onerror = () => gagal(new Error(`gagal memuat ${berkas}`));
      img.src = `${DASAR}/${berkas}`;
    });
    j.catch(() => dataJanji.delete(berkas));
    dataJanji.set(berkas, j);
  }
  return j;
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const terang = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const netral = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b) < 26;

/** Warnai piksel dengan warna baru sebanding terangnya terhadap acuan (bayangan & sorot tetap). */
function warnaiTerang(d: Uint8ClampedArray, o: number, warna: [number, number, number], acuan: number) {
  const f = terang(d[o]!, d[o + 1]!, d[o + 2]!) / Math.max(1, acuan);
  d[o] = Math.min(255, warna[0] * f);
  d[o + 1] = Math.min(255, warna[1] * f);
  d[o + 2] = Math.min(255, warna[2] * f);
}

/** Warnai kulit dengan rasio per kanal terhadap kulit dasar sprite. */
function warnaiKulit(d: Uint8ClampedArray, o: number, kulit: [number, number, number], dasar: [number, number, number]) {
  for (let c = 0; c < 3; c++) d[o + c] = Math.min(255, (d[o + c]! * kulit[c]!) / Math.max(1, dasar[c]!));
}

const akhiran = (kali: 1 | 2) => (kali === 2 ? "@2x" : "");

/** Muat semua berkas yang dibutuhkan konfig ini (sekali; selanjutnya dari cache). */
export async function siapkanKarakter(k: KonfigKarakter, kali: 1 | 2 = 1): Promise<void> {
  const s = akhiran(kali);
  const berkas: string[] = [];
  for (const anim of ["idle", "walk", "sit", "work"] as const) {
    berkas.push(`badan_${anim}${s}.png`, `badan_${anim}_kulit${s}.png`, `badan_${anim}_baju${s}.png`, `badan_${anim}_celana${s}.png`, `badan_${anim}_sepatu${s}.png`);
  }
  if (k.rambut > 0) berkas.push(`rambut_${String(k.rambut).padStart(2, "0")}${s}.png`);
  if (k.atasan > 0) {
    const nn = String(k.atasan).padStart(2, "0");
    berkas.push(`atasan_${nn}_idle${s}.png`, `atasan_${nn}_idle_kulit${s}.png`);
  }
  await Promise.all([muatManifestKarakter(), ...berkas.map(dataGambar)]);
}

const kunciKonfig = (k: KonfigKarakter) => `${k.kulit}|${k.rambut}|${k.warnaRambut}|${k.atasan}|${k.warnaAtasan}|${k.warnaCelana}|${k.warnaSepatu}`;

/**
 * Rakit satu frame (harus sudah `siapkanKarakter`). Kanvas berukuran
 * 64×96 (×kali), jangkar kaki di (32, 80) ×kali.
 */
export async function rakitFrame(k: KonfigKarakter, anim: AnimKarakter, arah: ArahKarakter, frame: number, kali: 1 | 2 = 1): Promise<HTMLCanvasElement> {
  const m = await muatManifestKarakter();
  const jumlah = m.animations[anim].frames;
  const f = ((frame % jumlah) + jumlah) % jumlah;
  const kunci = `${kunciKonfig(k)}|${anim}|${arah}|${f}|${kali}`;
  const ada = frameCache.get(kunci);
  if (ada) {
    frameCache.delete(kunci);
    frameCache.set(kunci, ada);
    return ada;
  }

  const s = akhiran(kali);
  const fw = m.frame.width * kali;
  const fh = m.frame.height * kali;
  const baris = URUTAN_ARAH.indexOf(arah);
  const [badan, mKulit, mBaju, mCelana, mSepatu] = await Promise.all([
    dataGambar(`badan_${anim}${s}.png`), dataGambar(`badan_${anim}_kulit${s}.png`), dataGambar(`badan_${anim}_baju${s}.png`),
    dataGambar(`badan_${anim}_celana${s}.png`), dataGambar(`badan_${anim}_sepatu${s}.png`),
  ]);
  const out = new ImageData(fw, fh);
  const d = out.data;
  const kulit = rgb(k.kulit);
  const kulitDasar = rgb(m.warnaDasar.kulit);
  const atasanIdle = k.atasan > 0 && anim === "idle";
  const warnaAtasan = rgb(k.warnaAtasan);

  // 1) badan + pakaian dasar
  const sx0 = f * fw;
  const sy0 = baris * fh;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const so = ((sy0 + y) * badan.width + sx0 + x) * 4;
      if (!badan.data[so + 3]) continue;
      const o = (y * fw + x) * 4;
      d[o] = badan.data[so]!; d[o + 1] = badan.data[so + 1]!; d[o + 2] = badan.data[so + 2]!; d[o + 3] = 255;
      if (mKulit.data[so + 3]) warnaiKulit(d, o, kulit, kulitDasar);
      else if (mBaju.data[so + 3]) warnaiTerang(d, o, warnaAtasan, m.warnaDasar.terangBaju);
      else if (mCelana.data[so + 3]) warnaiTerang(d, o, rgb(k.warnaCelana), m.warnaDasar.terangCelana);
      else if (mSepatu.data[so + 3]) warnaiTerang(d, o, rgb(k.warnaSepatu), m.warnaDasar.terangSepatu);
    }
  }

  // 2) atasan (pose diam saja)
  if (atasanIdle) {
    const nn = String(k.atasan).padStart(2, "0");
    const [at, atKulit] = await Promise.all([dataGambar(`atasan_${nn}_idle${s}.png`), dataGambar(`atasan_${nn}_idle_kulit${s}.png`)]);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const so = ((baris * fh + y) * at.width + x) * 4;
        if (!at.data[so + 3]) continue;
        const o = (y * fw + x) * 4;
        d[o] = at.data[so]!; d[o + 1] = at.data[so + 1]!; d[o + 2] = at.data[so + 2]!; d[o + 3] = 255;
        if (atKulit.data[so + 3]) warnaiKulit(d, o, kulit, kulitDasar);
        else if (netral(d[o]!, d[o + 1]!, d[o + 2]!) && terang(d[o]!, d[o + 1]!, d[o + 2]!) > 40) warnaiTerang(d, o, warnaAtasan, m.warnaDasar.terangAtasan);
      }
    }
  }

  // 3) rambut, digeser mengikuti kepala frame ini terhadap pose diam
  if (k.rambut > 0) {
    const rb = await dataGambar(`rambut_${String(k.rambut).padStart(2, "0")}${s}.png`);
    const h = m.kepala[anim]?.[arah]?.[f];
    const h0 = m.kepala.idle?.[arah]?.[0];
    const gx = h && h0 ? Math.round(h[0] - h0[0]) * kali : 0;
    const gy = h && h0 ? Math.round(h[1] - h0[1]) * kali : 0;
    const warna = rgb(k.warnaRambut);
    for (let y = 0; y < fh; y++) {
      const ty = y + gy;
      if (ty < 0 || ty >= fh) continue;
      for (let x = 0; x < fw; x++) {
        const tx = x + gx;
        if (tx < 0 || tx >= fw) continue;
        const so = ((baris * fh + y) * rb.width + x) * 4;
        if (!rb.data[so + 3]) continue;
        const o = (ty * fw + tx) * 4;
        d[o] = rb.data[so]!; d[o + 1] = rb.data[so + 1]!; d[o + 2] = rb.data[so + 2]!; d[o + 3] = 255;
        if (terang(d[o]!, d[o + 1]!, d[o + 2]!) > 40) warnaiTerang(d, o, warna, m.warnaDasar.terangRambut);
      }
    }
  }

  const kanvas = document.createElement("canvas");
  kanvas.width = fw;
  kanvas.height = fh;
  kanvas.getContext("2d")!.putImageData(out, 0, 0);
  if (frameCache.size >= MAKS_CACHE) frameCache.delete(frameCache.keys().next().value!);
  frameCache.set(kunci, kanvas);
  return kanvas;
}

let manifestSiap: Manifest | null = null;

/** Info animasi tanpa menunggu: null bila manifest belum dimuat (pemuatan dipicu). */
export function infoAnimasiSegera(anim: AnimKarakter): { frames: number; fps: number } | null {
  if (manifestSiap) return manifestSiap.animations[anim];
  muatManifestKarakter()
    .then((m) => { manifestSiap = m; })
    .catch(() => {});
  return null;
}

/** Info animasi (jumlah frame & fps) dari manifest. */
export async function infoAnimasi(anim: AnimKarakter): Promise<{ frames: number; fps: number }> {
  const m = await muatManifestKarakter();
  return m.animations[anim];
}

/**
 * Potret kepala (untuk daftar Online / chat): potongan pose diam menghadap SE
 * di sekitar kepala, ukuran 30×30 (×kali). Mulai 7 px di atas puncak kepala
 * botak supaya rambut tebal / sanggul / hijab tidak terpotong.
 */
export async function rakitPotret(k: KonfigKarakter, kali: 1 | 2 = 1): Promise<HTMLCanvasElement> {
  const m = await muatManifestKarakter();
  await siapkanKarakter(k, kali);
  const frame = await rakitFrame(k, "idle", "SE", 0, kali);
  const h = m.kepala.idle.SE[0] ?? [32, 20];
  const ukuran = 30 * kali;
  const c = document.createElement("canvas");
  c.width = ukuran;
  c.height = ukuran;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, Math.round(h[0] * kali - ukuran / 2), Math.round((h[1] - 7) * kali), ukuran, ukuran, 0, 0, ukuran, ukuran);
  return c;
}
