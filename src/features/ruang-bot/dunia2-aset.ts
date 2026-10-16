// ============================================================
// DUNIA v2 — aset (klien): latar gedung dirakit dari 8 modul ruang
// (public/ruang/v1) + sprite perabot (public/perabot/v1). Dimuat sekali.
//
// Latar: tiap modul digambar di posisinya (urut belakang → depan). Piksel
// dinding modul yang berbatasan dengan ruang lain (bukan dindingUtuh) tidak
// masuk latar: dipisah menjadi gambar "dinding dalam" per ruang, dua mode
// (rendah ±56 px bertutup kayu / penuh setinggi aslinya, bercelah pintu), yang
// digambar per lapisan ruang oleh dunia2-gambar.ts. Dinding luar gedung tetap
// utuh di latar.
// ============================================================

import { RUANG2 } from "./denah2";
import { LEBAR_LATAR, MODE_DINDING, TINGGI_LATAR, diCelahPintu, dindingUtuh, keLayar, pikselDindingDalam, type ModeDinding } from "./dunia2-murni";

type ManifestRuang = {
  ruang: Record<string, { file: string; kanvas: { width: number; height: number }; ukuran: { w: number; d: number }; sudutBelakang: { x: number; y: number } }>;
};
type ManifestPerabot = {
  benda: Record<string, { file: string; tapak: [number, number]; frame: { width: number; height: number }; jangkar: { x: number; y: number }; keadaan?: string[] }>;
};

export type SpritePerabot = { img: HTMLImageElement; w: number; h: number; jx: number; jy: number; frames: number };
/** Gambar dinding dalam satu ruang, sudah di posisi latar (x, y = pojok kiri atas). */
export type DindingDalam = { kunci: string; img: HTMLCanvasElement; x: number; y: number };
export type AsetDunia2 = {
  latar: HTMLCanvasElement;
  perabot: Map<string, SpritePerabot>;
  dinding: Record<ModeDinding, DindingDalam[]>;
};

const WARNA_TUTUP: [number, number, number] = [0x8a, 0x5a, 0x3a];
const WARNA_GARIS: [number, number, number] = [0x2a, 0x20, 0x28];

let janji: Promise<AsetDunia2> | null = null;

function muatGambar(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, gagal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => gagal(new Error(`gagal memuat ${src}`));
    img.src = src;
  });
}

async function json<T>(src: string): Promise<T> {
  const r = await fetch(src);
  if (!r.ok) throw new Error(`${src} ${r.status}`);
  return (await r.json()) as T;
}

/** Kanvas dari data piksel, dipotong ke kotak pembatas piksel tak-transparan (null bila kosong). */
function potongKotak(data: ImageData): { img: HTMLCanvasElement; x: number; y: number } | null {
  const { width: w, height: h, data: d } = data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const img = document.createElement("canvas");
  img.width = x1 - x0 + 1;
  img.height = y1 - y0 + 1;
  img.getContext("2d")!.putImageData(data, -x0, -y0, x0, y0, img.width, img.height);
  return { img, x: x0, y: y0 };
}

type NasibPiksel = ReturnType<typeof pikselDindingDalam>;
type SisiDinding = "kiri" | "kanan";

/**
 * Inti pemisahan dinding dalam (murni, tanpa DOM — diuji di tests/uji-dunia2-murni.mts).
 * `d` = RGBA modul lebar×tinggi: alfa piksel dinding dalam dinolkan di tempat; `keluaran[mode]` (RGBA
 * ukuran sama, awalnya kosong) diisi piksel dinding dalam mode itu. `sb` = sudutBelakang modul.
 *
 * Semua yang hanya bergantung pada kolom x (sisi, t sepanjang dinding, dindingUtuh, celah pintu,
 * garis lantai) dihitung sekali per kolom, dan nasib piksel dihafal per (sisi, celah, mode, tinggi) —
 * pikselDindingDalam bergantung pada t hanya lewat diCelahPintu. Hanya piksel di atas garis lantai
 * yang dikunjungi, kerja per piksel O(1) (dulu: tiap piksel memindai 8 ruang + 2× semua pintu →
 * utas utama terblokir saat gedung dirakit, terasa di ponsel). Hasil identik per byte dengan cara
 * lama — dijaga uji pembanding di tests/uji-dunia2-murni.mts.
 */
export function pisahPikselDinding(
  d: Uint8ClampedArray,
  lebar: number,
  tinggiKanvas: number,
  sb: { x: number; y: number },
  ruang: (typeof RUANG2)[number],
  keluaran: Record<ModeDinding, Uint8ClampedArray>,
): void {
  const { x: bx, y: by } = sb;
  const jepit = (t: number, a: number, b: number) => Math.min(b - 0.01, Math.max(a, t));
  // Per kolom: garis lantai dinding (NaN = kolom tanpa dinding dalam sisi itu), t, dan celah pintu.
  // Garis lantai dinding kiri y = by + (bx − x)/2, kanan y = by + (x − bx)/2.
  const lantaiKiri = new Float64Array(lebar).fill(NaN);
  const lantaiKanan = new Float64Array(lebar).fill(NaN);
  const tKiri = new Float64Array(lebar);
  const tKanan = new Float64Array(lebar);
  const celahKiri = new Uint8Array(lebar);
  const celahKanan = new Uint8Array(lebar);
  for (let x = 0; x < lebar; x++) {
    if (ruang.potongKiri && x <= bx && x >= bx - ruang.d * 32 - 40) {
      const t = jepit(ruang.y + (bx - x) / 32, ruang.y, ruang.y + ruang.d);
      if (!dindingUtuh(ruang, "kiri", t)) {
        lantaiKiri[x] = by + (bx - x) / 2;
        tKiri[x] = t;
        celahKiri[x] = diCelahPintu(ruang, "kiri", t) ? 1 : 0;
      }
    }
    if (ruang.potongKanan && x >= bx && x <= bx + ruang.w * 32 + 40) {
      const t = jepit(ruang.x + (x - bx) / 32, ruang.x, ruang.x + ruang.w);
      if (!dindingUtuh(ruang, "kanan", t)) {
        lantaiKanan[x] = by + (x - bx) / 2;
        tKanan[x] = t;
        celahKanan[x] = diCelahPintu(ruang, "kanan", t) ? 1 : 0;
      }
    }
  }
  // Hafalan nasib per (sisi, celah, mode) → (tinggi → nasib); indeks = sisi·2M + celah·M + mode.
  const nMode = MODE_DINDING.length;
  const hafal = Array.from({ length: 4 * nMode }, () => new Map<number, NasibPiksel>());
  const keluaranMode = MODE_DINDING.map((mode) => keluaran[mode]);
  /** Baris y0..y1−1 kolom x adalah dinding dalam sisi itu (tiap piksel berdiri sendiri: urutan bebas). */
  const isiKolom = (x: number, y0: number, y1: number, sisi: SisiDinding, lantai: number, t: number, celah: number) => {
    const dasar = (sisi === "kiri" ? 0 : 2 * nMode) + celah * nMode;
    for (let y = y0; y < y1; y++) {
      const o = (y * lebar + x) * 4;
      if (!d[o + 3]) continue;
      const tinggi = lantai - y;
      for (let i = 0; i < nMode; i++) {
        const m = hafal[dasar + i]!;
        let nasib = m.get(tinggi);
        if (nasib === undefined) m.set(tinggi, (nasib = pikselDindingDalam(ruang, sisi, t, tinggi, MODE_DINDING[i]!)));
        if (nasib === "buang") continue;
        const k = keluaranMode[i]!;
        const warna = nasib === "tutup" ? WARNA_TUTUP : nasib === "garis" ? WARNA_GARIS : null;
        k[o] = warna ? warna[0] : d[o]!;
        k[o + 1] = warna ? warna[1] : d[o + 1]!;
        k[o + 2] = warna ? warna[2] : d[o + 2]!;
        k[o + 3] = warna ? 255 : d[o + 3]!;
      }
      d[o + 3] = 0;
    }
  };
  // Hanya piksel di atas garis lantai yang disentuh (y < lantai ⇔ y < ⌈lantai⌉ untuk y bulat);
  // sisi kiri didahulukan bila kedua sisi berlaku (sama seperti pemeriksaan per piksel dulu).
  const jepitBaris = (v: number) => Math.max(0, Math.min(tinggiKanvas, Math.ceil(v)));
  for (let x = 0; x < lebar; x++) {
    const lk = lantaiKiri[x]!, ln = lantaiKanan[x]!;
    const batasKiri = Number.isNaN(lk) ? 0 : jepitBaris(lk);
    if (batasKiri > 0) isiKolom(x, 0, batasKiri, "kiri", lk, tKiri[x]!, celahKiri[x]!);
    if (!Number.isNaN(ln)) isiKolom(x, batasKiri, jepitBaris(ln), "kanan", ln, tKanan[x]!, celahKanan[x]!);
  }
}

/**
 * Modul ruang dipisah: `latar` = modul tanpa dinding dalam; `dinding[mode]` = hanya dinding dalam
 * (mode rendah: dipotong & bertutup kayu; penuh: utuh) dengan celah pintu.
 */
function pisahDinding(img: HTMLImageElement, m: ManifestRuang["ruang"][string], ruang: (typeof RUANG2)[number]) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const dinding = {} as Record<ModeDinding, { img: HTMLCanvasElement; x: number; y: number } | null>;
  if (!ruang.potongKiri && !ruang.potongKanan) {
    for (const mode of MODE_DINDING) dinding[mode] = null;
    return { latar: c, dinding };
  }
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const keluaran = Object.fromEntries(MODE_DINDING.map((mode) => [mode, new ImageData(c.width, c.height)])) as Record<ModeDinding, ImageData>;
  pisahPikselDinding(
    data.data,
    c.width,
    c.height,
    m.sudutBelakang,
    ruang,
    Object.fromEntries(MODE_DINDING.map((mode) => [mode, keluaran[mode].data])) as Record<ModeDinding, Uint8ClampedArray>,
  );
  ctx.putImageData(data, 0, 0);
  for (const mode of MODE_DINDING) dinding[mode] = potongKotak(keluaran[mode]);
  return { latar: c, dinding };
}

/** Beri giliran ke utas utama di antara modul (masukan & animasi "Memuat gedung…" tetap jalan). */
const giliran = () => new Promise<void>((ok) => setTimeout(ok, 0));

async function rakit(): Promise<AsetDunia2> {
  const [mr, mp] = await Promise.all([json<ManifestRuang>("/ruang/v1/manifest.json"), json<ManifestPerabot>("/perabot/v1/manifest.json")]);
  const latar = document.createElement("canvas");
  latar.width = LEBAR_LATAR;
  latar.height = TINGGI_LATAR;
  const ctx = latar.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const urut = [...RUANG2].sort((a, b) => a.x + a.y - (b.x + b.y));
  const gambarRuang = await Promise.all(urut.map((r) => muatGambar(`/ruang/v1/${mr.ruang[r.modul]!.file}`)));
  const dinding: Record<ModeDinding, DindingDalam[]> = { rendah: [], penuh: [] };
  for (let i = 0; i < urut.length; i++) {
    // Satu modul per giliran: urutan gambar (belakang → depan) tetap sama.
    if (i > 0) await giliran();
    const r = urut[i]!;
    const m = mr.ruang[r.modul]!;
    const modul = pisahDinding(gambarRuang[i]!, m, r);
    const s = keLayar(r.x, r.y);
    const ox = Math.round(s.x - m.sudutBelakang.x), oy = Math.round(s.y - m.sudutBelakang.y);
    ctx.drawImage(modul.latar, ox, oy);
    for (const mode of MODE_DINDING) {
      const w = modul.dinding[mode];
      if (w) dinding[mode].push({ kunci: r.kunci, img: w.img, x: ox + w.x, y: oy + w.y });
    }
  }
  const perabot = new Map<string, SpritePerabot>();
  await Promise.all(
    Object.entries(mp.benda).map(async ([id, b]) => {
      const img = await muatGambar(`/perabot/v1/${b.file}`);
      perabot.set(id, { img, w: b.frame.width, h: b.frame.height, jx: b.jangkar.x, jy: b.jangkar.y, frames: b.keadaan?.length ?? 1 });
    }),
  );
  return { latar, perabot, dinding };
}

/** Aset dunia v2 (dimuat & dirakit sekali per halaman). */
export function muatAsetDunia2(): Promise<AsetDunia2> {
  if (!janji) {
    janji = rakit();
    janji.catch(() => { janji = null; });
  }
  return janji;
}
