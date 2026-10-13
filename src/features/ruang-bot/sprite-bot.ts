// ============================================================
// Sprite karakter bot (pixel-art), digambar lewat kode di <canvas> 2D.
//
// Tiap orang punya: kepala (telinga, rambut/topi, alis, mata putih + pupil
// + kilau, hidung, pipi, mulut), leher, badan (kaus, bayangan, sabuk, kartu
// pengenal), dua lengan DENGAN tangan, dan kaki bersepatu. Kaki ada di
// koordinat (fx, fy) = titik pijak di lantai.
// ============================================================

import type { RupaBot } from "./tipe";

export type PoseBot = "diam" | "jalan" | "ketik" | "duduk";

export type OpsiKarakter = {
  rupa: RupaBot;
  /** Waktu dalam milidetik — menggerakkan ayunan kaki, ketikan, kedip. */
  waktu?: number;
  pose?: PoseBot;
  /** 1 = menghadap kanan, -1 = kiri (arah pandang pupil). */
  arah?: 1 | -1;
  /** Tampak belakang (berjalan menjauh). */
  belakang?: boolean;
  /** Angkat badan (px) saat duduk. */
  angkat?: number;
  bicara?: boolean;
  /** Warna kartu pengenal. */
  lencana?: string;
  /** Pegang cangkir (pose duduk). */
  cangkir?: boolean;
};

const GARIS = "#1a1220";

export function gelapkan(warna: string, faktor: number): string {
  const n = parseInt(warna.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * faktor);
  const g = Math.round(((n >> 8) & 255) * faktor);
  const b = Math.round((n & 255) * faktor);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

type Kotak = [number, number, number, number, string];

export function gambarKarakter(ctx: CanvasRenderingContext2D, fx: number, fy: number, o: OpsiKarakter): void {
  const rupa = o.rupa;
  const t = o.waktu ?? 0;
  const isian: Kotak[] = [];
  const wajah: Kotak[] = [];
  const tambah = (x: number, y: number, w: number, h: number, c: string) => isian.push([x, y, w, h, c]);

  const pose = o.pose ?? "diam";
  const jalan = pose === "jalan";
  const mengetik = pose === "ketik";
  const duduk = pose === "duduk";
  const f = Math.floor(t / 170) % 2;
  const dx = o.arah ?? 1;
  const belakang = !!o.belakang;
  const naikTurun = pose === "diam" ? Math.floor(t / 650) % 2 : 0;
  const y = fy - (o.angkat ?? 0) - naikTurun;
  const kulit = rupa.kulit;
  const kulitGelap = gelapkan(kulit, 0.8);
  const bayangan = rupa.bayangan;
  const kedip = Math.floor(t / 100) % 34 === 0;
  const mulutBuka = !!o.bicara && Math.floor(t / 230) % 2 === 0;
  const la = jalan && f ? 2 : 0;
  const lb = jalan && !f ? 2 : 0;

  if (rupa.gayaRambut === "panjang") {
    tambah(fx - 6, y - 26, 2, 13, rupa.rambut);
    tambah(fx + 4, y - 26, 2, 13, rupa.rambut);
  }
  // kaki + sepatu
  tambah(fx - 4, y - 7, 3, 7 - la, rupa.celana);
  tambah(fx + 1, y - 7, 3, 7 - lb, rupa.celana);
  tambah(fx - 5, y - 1 - la, 4, 1, "#2a2430");
  tambah(fx, y - 1 - lb, 4, 1, "#2a2430");
  // badan
  tambah(fx - 4, y - 16, 8, 9, rupa.kaus);
  tambah(fx + 2, y - 16, 2, 9, bayangan);
  tambah(fx - 4, y - 8, 8, 1, "#2a2430");
  if (rupa.berhud) {
    tambah(fx - 4, y - 17, 8, 2, bayangan);
    tambah(fx - 2, y - 12, 4, 2, bayangan);
  }
  tambah(fx - 1, y - 17, 2, 1, kulitGelap);
  if (!belakang) {
    tambah(fx - 1, y - 16, 1, 5, "#e9e4d6");
    tambah(fx - 2, y - 11, 3, 3, "#f6f1e4");
    tambah(fx - 1, y - 10, 1, 1, o.lencana ?? "#d9534f");
  }
  // lengan + tangan
  if (mengetik || duduk) {
    const h1 = mengetik ? (f ? 0 : 1) : 0;
    tambah(fx - 7, y - 15, 2, 4, rupa.kaus);
    tambah(fx - 6, y - 12, 3, 2, rupa.kaus);
    tambah(fx - 4, y - 11 + h1, 2, 2, kulit);
    tambah(fx + 5, y - 15, 2, 4, rupa.kaus);
    tambah(fx + 3, y - 12, 3, 2, rupa.kaus);
    tambah(fx + 2, y - 11 + (mengetik ? 1 - h1 : 0), 2, 2, kulit);
    if (duduk && o.cangkir) {
      tambah(fx + 3, y - 15, 3, 3, "#f4f0e6");
      tambah(fx + 6, y - 14, 1, 1, "#f4f0e6");
    }
  } else {
    const ayun = jalan ? (f ? 1 : 0) : 0;
    tambah(fx - 7, y - 15 + ayun, 2, 6, rupa.kaus);
    tambah(fx - 7, y - 9 + ayun, 2, 2, kulit);
    tambah(fx + 5, y - 15 + (1 - ayun), 2, 6, rupa.kaus);
    tambah(fx + 5, y - 9 + (1 - ayun), 2, 2, kulit);
  }
  // kepala
  if (belakang) {
    tambah(fx - 4, y - 28, 8, 1, rupa.rambut);
    tambah(fx - 5, y - 27, 10, 9, rupa.rambut);
    tambah(fx - 4, y - 18, 8, 1, rupa.rambut);
  } else {
    tambah(fx - 4, y - 28, 8, 1, kulit);
    tambah(fx - 5, y - 27, 10, 9, kulit);
    tambah(fx - 4, y - 18, 8, 1, kulit);
    tambah(fx - 6, y - 23, 1, 3, kulit);
    tambah(fx + 5, y - 23, 1, 3, kulit);
    if (rupa.gayaRambut === "topi") {
      const topi = rupa.warnaTopi ?? "#2d6a4f";
      tambah(fx - 5, y - 28, 10, 4, topi);
      tambah(fx - 5 + (dx > 0 ? 3 : 0), y - 24, 7, 1, gelapkan(topi, 0.7));
      tambah(fx - 5, y - 24, 1, 2, rupa.rambut);
      tambah(fx + 4, y - 24, 1, 2, rupa.rambut);
    } else {
      tambah(fx - 5, y - 29, 10, 4, rupa.rambut);
      tambah(fx - 5, y - 25, 2, 3, rupa.rambut);
      tambah(fx + 3, y - 25, 2, 3, rupa.rambut);
      tambah(fx - 3, y - 25, 3, 1, rupa.rambut);
      if (rupa.gayaRambut === "panjang") {
        tambah(fx - 6, y - 27, 1, 3, rupa.rambut);
        tambah(fx + 5, y - 27, 1, 3, rupa.rambut);
      }
    }
  }
  // wajah (digambar di atas isian)
  if (!belakang) {
    const p0 = dx > 0 ? 1 : 0;
    if (kedip) {
      wajah.push([fx - 3, y - 22, 3, 1, "#2a1a1a"], [fx + 1, y - 22, 3, 1, "#2a1a1a"]);
    } else {
      wajah.push([fx - 3, y - 23, 3, 3, "#ffffff"], [fx + 1, y - 23, 3, 3, "#ffffff"]);
      wajah.push([fx - 3 + p0, y - 23, 2, 3, "#1a1423"], [fx + 1 + p0, y - 23, 2, 3, "#1a1423"]);
      wajah.push([fx - 3 + p0, y - 23, 1, 1, "#ffffff"], [fx + 1 + p0, y - 23, 1, 1, "#ffffff"]);
    }
    if (rupa.gayaRambut !== "topi") wajah.push([fx - 3, y - 25, 3, 1, rupa.rambut], [fx + 1, y - 25, 3, 1, rupa.rambut]);
    wajah.push([fx, y - 20, 1, 1, kulitGelap]);
    if (mulutBuka) wajah.push([fx - 1, y - 19, 3, 2, "#7a2e2e"]);
    else wajah.push([fx - 1, y - 19, 3, 1, "#a8553f"], [fx - 2, y - 20, 1, 1, "#a8553f"], [fx + 2, y - 20, 1, 1, "#a8553f"]);
    wajah.push([fx - 4, y - 20, 1, 1, "#f0a090"], [fx + 3, y - 20, 1, 1, "#f0a090"]);
    if (rupa.kacamata) {
      const g = "#15121c";
      wajah.push(
        [fx - 4, y - 24, 4, 1, g], [fx - 4, y - 20, 4, 1, g], [fx - 4, y - 24, 1, 5, g],
        [fx, y - 24, 5, 1, g], [fx, y - 20, 5, 1, g], [fx, y - 24, 1, 5, g], [fx + 4, y - 24, 1, 5, g],
      );
    }
  }
  // bayangan lantai
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.fillRect(fx - 6, fy - 1, 12, 2);
  ctx.fillRect(fx - 4, fy + 1, 8, 1);
  // garis tepi, lalu isian, lalu wajah
  ctx.fillStyle = GARIS;
  for (const r of isian) ctx.fillRect(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2);
  for (const r of isian) {
    ctx.fillStyle = r[4];
    ctx.fillRect(r[0], r[1], r[2], r[3]);
  }
  for (const r of wajah) {
    ctx.fillStyle = r[4];
    ctx.fillRect(r[0], r[1], r[2], r[3]);
  }
}
