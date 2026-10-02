// Teks untuk outro: tata letak ala ImageFont/ImageDraw Pillow (FreeType),
// glyph dirasterisasi @napi-rs/canvas (Skia).
//
// TATA LETAK sama dengan Pillow: advance dan tepi atas/bawah tiap huruf
// ASCII diambil dari metrik FreeType BERHINTING yang ditabelkan dari Pillow
// (metrik-font.ts, ukuran 1..160); pena maju dalam 26.6 dan tiap glyph jatuh
// di PIXEL(pena); kotak teks = gabungan kotak glyph + garis pena (titik asal
// selalu ikut); ascender = ceil metrik font; anchor "la"/"ls"/"ms"; masker
// dipotong seukuran kotak lalu ditempel dengan fill_mask_L. Variasi "Bold"
// font variabel dipilih dari fvar seperti set_variation_by_name("Bold").
//
// Yang TIDAK identik: bentuk glyph. FreeType (autohinter/bytecode) menggeser
// tepi batang huruf ke kisi piksel; Skia tidak punya hinting. Glyph digambar
// 1..8x lebih besar lalu dirata-rata (cakupan luas linear seperti FreeType),
// dan bagian atas/bawah tiap glyph ditarik ke tepi berhinting dari tabel.
// Sisa selisihnya hanya di piksel tepi huruf.
//
// Kerning: Pillow produksi memakai libraqm (kerning GPOS aktif) -> bawaan
// aktif. Pillow tanpa raqm (mesin uji lokal) tidak memakai kerning; uji
// mematikannya lewat aturKerning(false) mengikuti bendera emas.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { isiMasker, Gambar, type Warna } from "./gambar";
import { METRIK_BERHINTING, UKURAN_MAKS_METRIK } from "./metrik-font";

/** Metrik berhinting satu ukuran: [advance, atas, bawah] per huruf ASCII 32..126. */
type MetrikUkuran = { advance: Int16Array; atas: Int16Array; bawah: Int16Array };

const tabelMetrik = new Map<string, Int16Array[] | null>();

/** Buka satu tabel: selisih int8 per ukuran -> nilai kumulatif. */
function bukaTabel(b64: string): Int16Array {
  const selisih = new Int8Array(zlib.inflateSync(Buffer.from(b64, "base64")));
  const nilai = new Int16Array(selisih.length);
  for (let i = 0; i < selisih.length; i++) nilai[i] = (i >= 95 ? nilai[i - 95] : 0) + selisih[i];
  return nilai;
}

/** Metrik FreeType berhinting dari Pillow (metrik-font.ts), bila tercakup. */
function metrikTabel(berkas: string, ukuran: number): MetrikUkuran | null {
  if (ukuran < 1 || ukuran > UKURAN_MAKS_METRIK || ukuran !== Math.trunc(ukuran)) return null;
  const nama = path.basename(berkas);
  let tabel = tabelMetrik.get(nama);
  if (tabel === undefined) {
    const isi = METRIK_BERHINTING[nama];
    tabel = isi ? isi.map(bukaTabel) : null;
    tabelMetrik.set(nama, tabel);
  }
  if (!tabel) return null;
  const awal = (ukuran - 1) * 95;
  return { advance: tabel[0].subarray(awal, awal + 95), atas: tabel[1].subarray(awal, awal + 95), bawah: tabel[2].subarray(awal, awal + 95) };
}

// ------------------------------------------------------------------
//  Pembaca TTF mini: fvar + name, untuk menemukan instans "Bold"
// ------------------------------------------------------------------

type Instans = { nama: string; koordinat: Record<string, number> };
type InfoFont = { instans: Instans[]; adaFvar: boolean; adaFpgm: boolean };

function bacaFont(berkas: string): InfoFont {
  const kosong: InfoFont = { instans: [], adaFvar: false, adaFpgm: false };
  let buf: Buffer;
  try {
    buf = fs.readFileSync(berkas);
  } catch {
    return kosong;
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const nTabel = dv.getUint16(4);
  const tabel: Record<string, number> = {};
  for (let i = 0; i < nTabel; i++) {
    const p = 12 + i * 16;
    const tag = buf.toString("latin1", p, p + 4);
    tabel[tag] = dv.getUint32(p + 8);
  }
  kosong.adaFvar = tabel.fvar !== undefined;
  kosong.adaFpgm = tabel.fpgm !== undefined;
  if (tabel.fvar === undefined || tabel.name === undefined) return kosong;
  const f = tabel.fvar;
  const offAxes = dv.getUint16(f + 4);
  const nAxes = dv.getUint16(f + 8);
  const ukAxis = dv.getUint16(f + 10);
  const nInst = dv.getUint16(f + 12);
  const ukInst = dv.getUint16(f + 14);
  const sumbu: string[] = [];
  for (let i = 0; i < nAxes; i++) sumbu.push(buf.toString("latin1", f + offAxes + i * ukAxis, f + offAxes + i * ukAxis + 4));
  // name: Pillow mengambil catatan PERTAMA dengan nameID itu (platform apa pun)
  // lalu outro.py men-decode byte-nya sebagai UTF-8.
  const n = tabel.name;
  const jml = dv.getUint16(n + 2);
  const offStr = dv.getUint16(n + 4);
  const namaId = (id: number): string | null => {
    for (let i = 0; i < jml; i++) {
      const r = n + 6 + i * 12;
      if (dv.getUint16(r + 6) !== id) continue;
      const pj = dv.getUint16(r + 8);
      const off = dv.getUint16(r + 10);
      return new TextDecoder("utf-8").decode(buf.subarray(n + offStr + off, n + offStr + off + pj));
    }
    return null;
  };
  const hasil: Instans[] = [];
  for (let i = 0; i < nInst; i++) {
    const p = f + offAxes + nAxes * ukAxis + i * ukInst;
    const koordinat: Record<string, number> = {};
    for (let a = 0; a < nAxes; a++) koordinat[sumbu[a]] = dv.getInt32(p + 4 + a * 4) / 65536;
    hasil.push({ nama: namaId(dv.getUint16(p)) ?? "", koordinat });
  }
  return { ...kosong, instans: hasil };
}

// ------------------------------------------------------------------
//  Font
// ------------------------------------------------------------------

const aliasBerkas = new Map<string, string>();
let nomorAlias = 0;

function aliasUntuk(berkas: string): string | null {
  const ada = aliasBerkas.get(berkas);
  if (ada) return ada;
  const alias = `outro-font-${++nomorAlias}`;
  const kunci = GlobalFonts.registerFromPath(berkas, alias);
  if (!kunci) return null;
  aliasBerkas.set(berkas, alias);
  return alias;
}

type UkuranGlyph = { lebar: number; kiri: number; kanan: number; atas: number; bawah: number };

/**
 * Tata letak ala Pillow: libraqm (produksi) memakai kerning GPOS, tata
 * letak "basic" (Pillow tanpa raqm) tidak. Bawaan = raqm, seperti produksi;
 * uji mengikuti bendera "raqm" di berkas emasnya.
 */
let pakaiKerning = true;
export function aturKerning(nyala: boolean): void {
  pakaiKerning = nyala;
}

/**
 * HANYA untuk uji: glyph tidak digambar (tata letak tetap dihitung). Dengan
 * ImageDraw.text dimatikan juga di Python, frame "tanpa glyph" kedua mesin
 * harus identik — bukti bahwa semua selisih tersisa berasal dari glyph.
 */
let tanpaGlyph = false;
export function aturTanpaGlyph(nyala: boolean): void {
  tanpaGlyph = nyala;
}

/** round() C: setengah menjauhi nol. */
const bulatC = (v: number) => (v >= 0 ? Math.floor(v + 0.5) : -Math.floor(-v + 0.5));

/** PIXEL() _imagingft.c: 26.6 -> piksel, dibulatkan setengah ke atas. */
const PIXEL = (v: number) => Math.floor((v + 32) / 64);

type TataGlyph = {
  huruf: string[];
  /** posisi pena (26.6) sebelum tiap glyph. */
  pos: number[];
  /** posisi akhir pena, 26.6. */
  posisi: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export class Fonta {
  readonly ascender: number;
  readonly descender: number;
  private readonly alias: string;
  private readonly css: string;
  private readonly variasi: string;
  private readonly cacheGlyph = new Map<string, UkuranGlyph>();
  private readonly cacheKern = new Map<string, number>();
  private readonly cacheTata = new Map<string, TataGlyph>();
  private readonly metrik: MetrikUkuran | null;

  constructor(
    readonly berkas: string,
    readonly size: number,
    alias: string,
    variasi: Record<string, number> | null,
    /**
     * FreeType tidak menggeser tepi atas/bawah glyph font variabel ber-bytecode
     * (Montserrat): kotak vertikalnya = ceil kotak TANPA hinting, dan glyph-nya
     * tidak ditarik. Untuk huruf di luar tabel metrik (non-ASCII, ukuran > 160)
     * font lain memakai batas bulat Skia, yang paling sering cocok dengan
     * hinting FreeType.
     */
    private readonly vertikalTanpaHinting = false,
  ) {
    this.alias = alias;
    this.metrik = metrikTabel(berkas, size);
    this.css = `${size}px "${alias}"`;
    this.variasi = variasi
      ? Object.entries(variasi)
          .map(([k, v]) => `"${k}" ${v}`)
          .join(", ")
      : "normal";
    const m = this.konteks().measureText("Hg");
    // FreeType (TrueType, hinting): ascender = FT_PIX_CEIL, descender = FT_PIX_FLOOR.
    this.ascender = Math.ceil(m.fontBoundingBoxAscent - 1e-9);
    this.descender = -Math.ceil(m.fontBoundingBoxDescent - 1e-9);
  }

  private aturKonteks(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>, skala = 1) {
    ctx.font = skala === 1 ? this.css : `${this.size * skala}px "${this.alias}"`;
    (ctx as unknown as { fontVariationSettings: string }).fontVariationSettings = this.variasi;
    (ctx as unknown as { fontKerning: string }).fontKerning = "normal";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    return ctx;
  }

  private konteks() {
    return this.aturKonteks(konteksUkur());
  }

  /** Metrik satu glyph (tanpa hinting): lebar maju + kotak tinta. */
  private glyph(c: string): UkuranGlyph {
    let g = this.cacheGlyph.get(c);
    if (!g) {
      const m = this.konteks().measureText(c);
      g = {
        lebar: m.width,
        kiri: m.actualBoundingBoxLeft,
        kanan: m.actualBoundingBoxRight,
        atas: m.actualBoundingBoxAscent,
        bawah: m.actualBoundingBoxDescent,
      };
      if (this.vertikalTanpaHinting) {
        // Diukur 32x lebih besar lalu dibagi: batas pecahan tanpa pembulatan Skia.
        const besar = this.aturKonteks(konteksUkur(), 32).measureText(c);
        g.atas = besar.actualBoundingBoxAscent / 32;
        g.bawah = besar.actualBoundingBoxDescent / 32;
      }
      this.cacheGlyph.set(c, g);
    }
    return g;
  }

  private readonly cacheTarik = new Map<string, [number, number] | null>();

  /**
   * Faktor tarik vertikal [atas, bawah] = tepi berhinting (tabel Pillow) /
   * tepi tanpa hinting (Skia diukur 32x). null bila tidak ada data atau font
   * memang tidak di-hinting vertikal oleh FreeType (Montserrat).
   */
  private tarikVertikal(c: string): [number, number] | null {
    if (!this.metrik || this.vertikalTanpaHinting) return null;
    const kode = c.codePointAt(0)!;
    if (kode < 32 || kode > 126) return null;
    let t = this.cacheTarik.get(c);
    if (t === undefined) {
      const m = this.aturKonteks(konteksUkur(), 32).measureText(c);
      const atas = m.actualBoundingBoxAscent / 32;
      const bawah = m.actualBoundingBoxDescent / 32;
      const tA = this.metrik.atas[kode - 32];
      const tB = this.metrik.bawah[kode - 32];
      const sA = atas > 0.25 && tA > 0 ? tA / atas : 1;
      const sB = bawah > 0.25 && tB > 0 ? tB / bawah : 1;
      t = sA === 1 && sB === 1 ? null : [sA, sB];
      this.cacheTarik.set(c, t);
    }
    return t;
  }

  /** Kerning pasangan (piksel pecahan) = lebar(ab) - lebar(a) - lebar(b). */
  private kern(a: string, b: string): number {
    const kunci = a + "\u0000" + b;
    let k = this.cacheKern.get(kunci);
    if (k === undefined) {
      k = this.konteks().measureText(a + b).width - this.glyph(a).lebar - this.glyph(b).lebar;
      if (Math.abs(k) < 1e-6) k = 0;
      this.cacheKern.set(kunci, k);
    }
    return k;
  }

  /**
   * text_layout + bounding_box_and_anchors (_imagingft.c): tiap glyph maju
   * selebar advance yang DIBULATKAN ke piksel (FreeType dengan hinting),
   * kerning (bila raqm) ditambahkan ke glyph sebelumnya dalam 26.6, posisi
   * glyph = PIXEL(posisi pena). Kotak = gabungan kotak tinta tiap glyph dan
   * garis pena 0..posisi akhir — titik asal selalu ikut.
   */
  private tata(teks: string): TataGlyph | null {
    if (!teks) return null;
    const ada = this.cacheTata.get(teks);
    if (ada) return ada;
    const huruf = Array.from(teks);
    const maju = huruf.map((c) => {
      const kode = c.codePointAt(0)!;
      // ASCII: advance berhinting dari tabel Pillow; lainnya = lebar Skia dibulatkan.
      if (this.metrik && kode >= 32 && kode <= 126) return this.metrik.advance[kode - 32] * 64;
      return Math.floor(this.glyph(c).lebar + 0.5) * 64;
    });
    if (pakaiKerning) {
      for (let i = 1; i < huruf.length; i++) maju[i - 1] += Math.round(this.kern(huruf[i - 1], huruf[i]) * 64);
    }
    let posisi = 0;
    let xMin = 0;
    let xMax = 0;
    let yMin = 0;
    let yMax = 0;
    const pos: number[] = [];
    huruf.forEach((c, i) => {
      const p = PIXEL(posisi);
      pos.push(posisi);
      posisi += maju[i];
      const majuPx = PIXEL(posisi);
      if (majuPx > xMax) xMax = majuPx;
      const g = this.glyph(c);
      // FT_Glyph_Get_CBox(FT_GLYPH_BBOX_PIXELS): lantai/langit-langit kotak kendali.
      const kiri = Math.floor(-g.kiri + 1e-9);
      const kanan = Math.ceil(g.kanan - 1e-9);
      const adaTinta = kanan > kiri || g.atas + g.bawah > 0;
      const bx0 = adaTinta ? kiri : 0;
      const bx1 = adaTinta ? kanan : 0;
      if (bx1 + p > xMax) xMax = bx1 + p;
      if (bx0 + p < xMin) xMin = bx0 + p;
      const kode = c.codePointAt(0)!;
      let by1 = adaTinta ? Math.ceil(g.atas - 1e-9) : 0;
      let by0 = adaTinta ? Math.floor(-g.bawah + 1e-9) : 0;
      if (this.metrik && kode >= 32 && kode <= 126) {
        // Tepi atas/bawah berhinting dari tabel Pillow (sudah termasuk titik asal).
        by1 = this.metrik.atas[kode - 32];
        by0 = -this.metrik.bawah[kode - 32];
      }
      if (by1 > yMax) yMax = by1;
      if (by0 < yMin) yMin = by0;
    });
    const hasil = { huruf, pos, posisi, xMin, xMax, yMin, yMax };
    if (this.cacheTata.size < 4096) this.cacheTata.set(teks, hasil);
    return hasil;
  }

  private jangkar(teks: string, anchor: string) {
    const k = this.tata(teks);
    if (!k) return null;
    let xAnchor = 0;
    if (anchor[0] === "m") xAnchor = PIXEL(Math.trunc(k.posisi / 2));
    else if (anchor[0] === "r") xAnchor = PIXEL(k.posisi);
    else if (anchor[0] !== "l") throw new Error(`bad anchor specified: ${anchor}`);
    let yAnchor: number;
    switch (anchor[1]) {
      case "a":
        yAnchor = this.ascender;
        break;
      case "t":
        yAnchor = k.yMax;
        break;
      case "m":
        yAnchor = PIXEL(Math.trunc(((this.ascender + this.descender) * 64) / 2));
        break;
      case "s":
        yAnchor = 0;
        break;
      case "b":
        yAnchor = k.yMin;
        break;
      case "d":
        yAnchor = this.descender;
        break;
      default:
        throw new Error(`bad anchor specified: ${anchor}`);
    }
    return {
      ...k,
      lebar: k.xMax - k.xMin,
      tinggi: k.yMax - k.yMin,
      xOffset: -xAnchor + k.xMin,
      yOffset: -(-yAnchor + k.yMax),
    };
  }

  /** ImageDraw.textbbox(xy, teks, font, anchor). */
  textbbox(xy: readonly [number, number], teks: string, anchor = "la"): [number, number, number, number] {
    const j = this.jangkar(teks, anchor);
    if (!j) return [xy[0], xy[1], xy[0], xy[1]];
    return [xy[0] + j.xOffset, xy[1] + j.yOffset, xy[0] + j.xOffset + j.lebar, xy[1] + j.yOffset + j.tinggi];
  }

  /** ImageDraw.textlength: jumlah advance 26.6 dibagi 64. */
  textlength(teks: string): number {
    const k = this.tata(teks);
    return k ? k.posisi / 64 : 0;
  }

  /**
   * ImageDraw.text((x, y), teks, fill, anchor) pada gambar RGBA/L: masker
   * glyph seukuran kotak teks (glyph di luar kotak terpotong, seperti
   * font_render) lalu fill_mask_L dengan tinta.
   */
  gambar(tujuan: Gambar, xy: readonly [number, number], teks: string, tinta: Warna | number, anchor = "la"): void {
    const j = this.jangkar(teks, anchor);
    if (!j || tanpaGlyph) return;
    const xi = Math.trunc(xy[0]);
    const yi = Math.trunc(xy[1]);
    const xStart = xy[0] - xi;
    const yStart = xy[1] - yi;
    const w = j.lebar + Math.ceil(xStart);
    const h = j.tinggi + Math.ceil(yStart);
    if (w <= 0 || h <= 0) return;
    // Glyph digambar SKALA kali lebih besar lalu dirata-rata kotak: hasilnya
    // cakupan luas yang linear seperti rasterizer "smooth" FreeType. Skia di
    // ukuran asli menebalkan glyph kecil (koreksi gamma/kontras) ~5-25%.
    // Glyph >= 256 px sudah digambar sebagai path oleh Skia (tanpa koreksi),
    // dan kanvas dibatasi ~8 juta piksel supaya teks badge besar tetap ringan.
    const skala = Math.max(1, Math.min(8, Math.ceil(256 / this.size), Math.floor(Math.sqrt(8e6 / (w * h)))));
    const ctx = this.aturKonteks(createCanvas(w * skala, h * skala).getContext("2d"), skala);
    ctx.fillStyle = "#fff";
    // Pena awal = round(-x_min + start) dan baris dasar = y_max + start, dalam
    // 26.6 lalu PIXEL — bitmap glyph FreeType selalu jatuh di piksel bulat.
    const penaX = bulatC((-j.xMin + xStart) * 64);
    const oy = -PIXEL(bulatC(-(j.yMax + yStart) * 64));
    const dasar = oy * skala;
    j.huruf.forEach((c, i) => {
      if (!c.trim()) return;
      const x = PIXEL(penaX + j.pos[i]) * skala;
      const tarik = this.tarikVertikal(c);
      if (!tarik) {
        ctx.fillText(c, x, dasar);
        return;
      }
      // Hinting FreeType menaruh tepi atas/bawah glyph di batas piksel. Bagian
      // di atas dan di bawah garis dasar ditarik terpisah ke tepi berhinting
      // dari tabel, supaya tepi itu jatuh di baris piksel yang sama.
      for (const [y0, y1, s] of [
        [0, dasar, tarik[0]],
        [dasar, h * skala, tarik[1]],
      ] as const) {
        if (y1 <= y0) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y0, w * skala, y1 - y0);
        ctx.clip();
        ctx.setTransform(1, 0, 0, s, 0, dasar * (1 - s));
        ctx.fillText(c, x, dasar);
        ctx.restore();
      }
    });
    const rgba = ctx.getImageData(0, 0, w * skala, h * skala).data;
    const masker = new Uint8Array(w * h);
    if (skala === 1) {
      for (let i = 0, p = 3; i < masker.length; i++, p += 4) masker[i] = rgba[p];
    } else {
      const lebarBesar = w * skala;
      const luas = skala * skala;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let jumlah = 0;
          for (let yy = 0; yy < skala; yy++) {
            let p = ((y * skala + yy) * lebarBesar + x * skala) * 4 + 3;
            for (let xx = 0; xx < skala; xx++, p += 4) jumlah += rgba[p];
          }
          masker[y * w + x] = Math.floor((jumlah + luas / 2) / luas);
        }
      }
    }
    const warna = typeof tinta === "number" ? [tinta] : tinta;
    isiMasker(tujuan, warna, new Gambar("L", w, h, masker), xi + j.xOffset, yi + j.yOffset);
  }
}

let ctxUkur: ReturnType<ReturnType<typeof createCanvas>["getContext"]> | null = null;
function konteksUkur() {
  if (!ctxUkur) ctxUkur = createCanvas(4, 4).getContext("2d");
  return ctxUkur;
}

const cacheFont = new Map<string, Fonta>();

/**
 * _font(ukuran, nama): buka berkas font, pilih instans "Bold" bila font
 * variabel memilikinya; gagal = Poppins Bold bawaan.
 */
export function bukaFont(berkas: string, ukuran: number, cadangan: string): Fonta {
  const kunci = `${berkas}|${ukuran}`;
  const ada = cacheFont.get(kunci);
  if (ada) return ada;
  let fonta: Fonta;
  const alias = fs.existsSync(berkas) ? aliasUntuk(berkas) : null;
  if (alias) {
    const info = bacaFont(berkas);
    const bold = info.instans.find((i) => i.nama === "Bold");
    fonta = new Fonta(berkas, ukuran, alias, bold ? bold.koordinat : null, info.adaFvar && info.adaFpgm);
  } else {
    const aliasCadangan = aliasUntuk(cadangan);
    if (!aliasCadangan) throw new Error(`Font tidak bisa dimuat: ${berkas}`);
    fonta = new Fonta(cadangan, ukuran, aliasCadangan, null);
  }
  cacheFont.set(kunci, fonta);
  return fonta;
}
