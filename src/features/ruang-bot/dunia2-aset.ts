// ============================================================
// DUNIA v2 — aset (klien): latar gedung dirakit dari 8 modul ruang
// (public/ruang/v1) + sprite perabot (public/perabot/v1). Dimuat sekali.
//
// Latar: tiap modul digambar di posisinya (urut belakang → depan). Piksel
// dinding modul dibuang bila di baliknya ada ruang lain (dindingUtuh), jadi
// dinding luar gedung tetap utuh dan dinding dalam diganti sekat rendah yang
// digambar terurut kedalaman (dunia2-gambar.ts).
// ============================================================

import { RUANG2 } from "./denah2";
import { LEBAR_LATAR, TINGGI_LATAR, dindingUtuh, keLayar } from "./dunia2-murni";

type ManifestRuang = {
  ruang: Record<string, { file: string; kanvas: { width: number; height: number }; ukuran: { w: number; d: number }; sudutBelakang: { x: number; y: number } }>;
};
type ManifestPerabot = {
  benda: Record<string, { file: string; tapak: [number, number]; frame: { width: number; height: number }; jangkar: { x: number; y: number }; keadaan?: string[] }>;
};

export type SpritePerabot = { img: HTMLImageElement; w: number; h: number; jx: number; jy: number; frames: number };
export type AsetDunia2 = { latar: HTMLCanvasElement; perabot: Map<string, SpritePerabot> };

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

/** Modul ruang dengan dinding dalam dibuang. */
function potongDinding(img: HTMLImageElement, m: ManifestRuang["ruang"][string], ruang: (typeof RUANG2)[number]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  if (!ruang.potongKiri && !ruang.potongKanan) return c;
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  const { x: bx, y: by } = m.sudutBelakang;
  const jepit = (t: number, a: number, b: number) => Math.min(b - 0.01, Math.max(a, t));
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const o = (y * c.width + x) * 4;
      if (!d[o + 3]) continue;
      let buang = false;
      if (ruang.potongKiri && x <= bx && y < by + (bx - x) / 2 && x >= bx - ruang.d * 32 - 40) {
        buang = !dindingUtuh(ruang, "kiri", jepit(ruang.y + (bx - x) / 32, ruang.y, ruang.y + ruang.d));
      }
      if (!buang && ruang.potongKanan && x >= bx && y < by + (x - bx) / 2 && x <= bx + ruang.w * 32 + 40) {
        buang = !dindingUtuh(ruang, "kanan", jepit(ruang.x + (x - bx) / 32, ruang.x, ruang.x + ruang.w));
      }
      if (buang) d[o + 3] = 0;
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

async function rakit(): Promise<AsetDunia2> {
  const [mr, mp] = await Promise.all([json<ManifestRuang>("/ruang/v1/manifest.json"), json<ManifestPerabot>("/perabot/v1/manifest.json")]);
  const latar = document.createElement("canvas");
  latar.width = LEBAR_LATAR;
  latar.height = TINGGI_LATAR;
  const ctx = latar.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const urut = [...RUANG2].sort((a, b) => a.x + a.y - (b.x + b.y));
  const gambarRuang = await Promise.all(urut.map((r) => muatGambar(`/ruang/v1/${mr.ruang[r.modul]!.file}`)));
  urut.forEach((r, i) => {
    const m = mr.ruang[r.modul]!;
    const modul = potongDinding(gambarRuang[i]!, m, r);
    const s = keLayar(r.x, r.y);
    ctx.drawImage(modul, Math.round(s.x - m.sudutBelakang.x), Math.round(s.y - m.sudutBelakang.y));
  });
  const perabot = new Map<string, SpritePerabot>();
  await Promise.all(
    Object.entries(mp.benda).map(async ([id, b]) => {
      const img = await muatGambar(`/perabot/v1/${b.file}`);
      perabot.set(id, { img, w: b.frame.width, h: b.frame.height, jx: b.jangkar.x, jy: b.jangkar.y, frames: b.keadaan?.length ?? 1 });
    }),
  );
  return { latar, perabot };
}

/** Aset dunia v2 (dimuat & dirakit sekali per halaman). */
export function muatAsetDunia2(): Promise<AsetDunia2> {
  if (!janji) {
    janji = rakit();
    janji.catch(() => { janji = null; });
  }
  return janji;
}
