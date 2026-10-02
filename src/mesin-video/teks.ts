// Perender lapisan teks — cermin _font, _warna, _bungkus_kata,
// _gambar_teks_berita, kotak_kategori_bawaan, _gambar_teks_kategori, dan
// _gambar_teks di video_edit.py (Pillow 12.3 + libraqm di produksi).
//
// Kenapa tidak cukup memakai measureText/fillText kanvas apa adanya:
// 1. Lebar teks menentukan pemenggalan baris dan penyusutan font. Pillow+raqm
//    menjumlahkan advance tiap glyph dalam presisi 26.6 (1/64 piksel) hasil
//    FT_MulDiv FreeType; Skia membulatkan lain. Selisih 1/64 px saja cukup
//    untuk memindah satu kata ke baris berikutnya. Karena itu advance dihitung
//    sendiri dari tabel hmtx font dengan aritmetika titik-tetap FreeType.
// 2. Pillow menaruh tiap glyph di piksel BULAT (PIXEL(x) = pembulatan 26.6),
//    bukan di posisi pecahan. Di sini tiap glyph digambar satu-satu di titik
//    bulat yang sama, dan topeng (mask) glyph digabung serta ditimpakan ke
//    kanvas dengan rumus libImaging (font_render + fill_mask_L), supaya warna
//    tepi huruf di PNG transparan sama dengan versi Python.
// 3. Badge kategori mengukur kotak tinta (textbbox) glyph yang SUDAH di-hint.
//    Poppins tidak membawa instruksi hinting, jadi FreeType memakai autohinter
//    yang mengepaskan tinggi huruf kapital ke grid piksel. Bagian vertikal
//    autohinter (zona biru + penyesuaian skala x-height) ditiru di sini.
// Garis luar glyph dibaca sendiri dari tabel glyf lalu diraster sebagai path
// oleh Skia (y dipetakan lewat zona biru yang sama). Yang belum ditiru adalah
// penjepretan batang vertikal (hinting horizontal) autohinter, jadi tepi
// kiri-kanan huruf bisa berbeda antialias-nya; posisi huruf tetap identik.
import fs from "node:fs";
import crypto from "node:crypto";
import { createCanvas, GlobalFonts, Path2D } from "@napi-rs/canvas";
import { FONT_CANDIDATES } from "./konfig";
import { GalatVideo, type Kotak, type LapisanTeks } from "./jenis";
import { gambarKosong, simpanPng, type GambarRgba } from "./gambar";

export type Rgba = [number, number, number, number];

// ==================================================================
//  Peniru semantik Python (int(), float(), truthiness, str.split())
// ==================================================================

const SPASI_PY = "\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const POLA_PISAH = new RegExp(`[${SPASI_PY}]+`);
const POLA_TEPI = new RegExp(`^[${SPASI_PY}]+|[${SPASI_PY}]+$`, "g");

/** str.split() tanpa argumen: pisah di spasi Unicode versi Python, buang kosong. */
export function pisahKata(s: string): string[] {
  return s.split(POLA_PISAH).filter(Boolean);
}

/** str.strip() tanpa argumen. */
export function rapikanTepi(s: string): string {
  return s.replace(POLA_TEPI, "");
}

/** str.splitlines(): baris terakhir yang kosong sesudah pemisah tidak ikut. */
function pisahBaris(s: string): string[] {
  if (!s) return [];
  const bagian = s.split(/\r\n|[\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029]/);
  if (bagian.length > 1 && bagian[bagian.length - 1] === "") bagian.pop();
  return bagian;
}

/** Nilai "falsy" Python: None, False, 0, "", [] dan {} kosong (NaN tetap truthy). */
export function benar(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** `a or b` Python. */
function atau<T>(v: unknown, bawaan: T): unknown {
  return benar(v) ? v : bawaan;
}

function adaNilai(v: unknown): boolean {
  return v !== null && v !== undefined;
}

/** int() Python untuk nilai dari template.json. Melempar seperti ValueError/TypeError. */
export function intPy(v: unknown): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`cannot convert float ${v} to integer`);
    return Math.trunc(v) || 0;
  }
  if (typeof v === "string") {
    const t = rapikanTepi(v);
    if (/^[+-]?\d+(_\d+)*$/.test(t)) return Number.parseInt(t.replace(/_/g, ""), 10);
    throw new Error(`invalid literal for int() with base 10: '${v}'`);
  }
  throw new Error(`int() argument must be a string or a number, not '${v === null ? "NoneType" : typeof v}'`);
}

/** float() Python (termasuk "inf", "nan", garis bawah pemisah digit). */
export function floatPy(v: unknown): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = rapikanTepi(v).toLowerCase();
    const m = /^([+-]?)(inf|infinity|nan)$/.exec(t);
    if (m) return m[2] === "nan" ? Number.NaN : m[1] === "-" ? -Infinity : Infinity;
    const angka = "\\d+(?:_\\d+)*";
    const pola = new RegExp(`^[+-]?(?:${angka}(?:\\.(?:${angka})?)?|\\.${angka})(?:e[+-]?${angka})?$`);
    if (pola.test(t)) return Number.parseFloat(t.replace(/_/g, ""));
    throw new Error(`could not convert string to float: '${v}'`);
  }
  throw new Error(`float() argument must be a string or a real number, not '${v === null ? "NoneType" : typeof v}'`);
}

/** round() Python 3 (setengah ke genap). */
function bulatPy(x: number): number {
  const bawah = Math.floor(x);
  const sisa = x - bawah;
  if (sisa < 0.5) return bawah;
  if (sisa > 0.5) return bawah + 1;
  return bawah % 2 === 0 ? bawah : bawah + 1;
}

/** round() di C (setengah menjauhi nol) — dipakai libImaging. */
function bulatC(x: number): number {
  return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

function apakahDict(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ==================================================================
//  Warna (_warna + PIL.ImageColor.getrgb)
// ==================================================================

const NAMA_WARNA = new Map(
  (
    "aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 " +
    "black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 " +
    "cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc " +
    "crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 " +
    "darkgrey:a9a9a9 darkgreen:006400 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 " +
    "darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b " +
    "darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 " +
    "deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 " +
    "forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 " +
    "grey:808080 green:008000 greenyellow:adff2f honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 " +
    "ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd " +
    "lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgreen:90ee90 " +
    "lightgray:d3d3d3 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa " +
    "lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 " +
    "lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa " +
    "mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee " +
    "mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa " +
    "mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 " +
    "orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee " +
    "palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 " +
    "purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 " +
    "salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb " +
    "slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c " +
    "teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff " +
    "whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32"
  )
    .split(" ")
    .map((p) => p.split(":") as [string, string]),
);

function modPy(x: number, m: number): number {
  const r = x % m;
  return r !== 0 && r < 0 !== m < 0 ? r + m : r;
}

function hlsKeRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0.0) return [l, l, l];
  const m2 = l <= 0.5 ? l * (1.0 + s) : l + s - l * s;
  const m1 = 2.0 * l - m2;
  const v = (hue: number) => {
    hue = modPy(hue, 1.0);
    if (hue < 1.0 / 6.0) return m1 + (m2 - m1) * hue * 6.0;
    if (hue < 0.5) return m2;
    if (hue < 2.0 / 3.0) return m1 + (m2 - m1) * (2.0 / 3.0 - hue) * 6.0;
    return m1;
  };
  return [v(h + 1.0 / 3.0), v(h), v(h - 1.0 / 3.0)];
}

function hsvKeRgb(h: number, s: number, v: number): [number, number, number] {
  if (s === 0.0) return [v, v, v];
  let i = Math.trunc(h * 6.0);
  const f = h * 6.0 - i;
  const p = v * (1.0 - s);
  const q = v * (1.0 - s * f);
  const t = v * (1.0 - s * (1.0 - f));
  i = modPy(i, 6);
  return ([[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]] as [number, number, number][])[i];
}

/** PIL.ImageColor.getrgb — melempar Error untuk penentu warna yang tidak dikenal. */
export function ambilRgb(warna: string): number[] {
  if (warna.length > 100) throw new Error("color specifier is too long");
  const c = warna.toLowerCase();
  const nama = NAMA_WARNA.get(c);
  if (nama) return [0, 2, 4].map((i) => Number.parseInt(nama.slice(i, i + 2), 16));
  const hex = (s: string) => Number.parseInt(s, 16);
  if (/^#[a-f0-9]{3}$/.test(c)) return [hex(c[1] + c[1]), hex(c[2] + c[2]), hex(c[3] + c[3])];
  if (/^#[a-f0-9]{4}$/.test(c)) return [hex(c[1] + c[1]), hex(c[2] + c[2]), hex(c[3] + c[3]), hex(c[4] + c[4])];
  if (/^#[a-f0-9]{6}$/.test(c)) return [hex(c.slice(1, 3)), hex(c.slice(3, 5)), hex(c.slice(5, 7))];
  if (/^#[a-f0-9]{8}$/.test(c)) return [hex(c.slice(1, 3)), hex(c.slice(3, 5)), hex(c.slice(5, 7)), hex(c.slice(7, 9))];
  let m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(c);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = /^rgb\(\s*(\d+)%\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/.exec(c);
  if (m) return [m[1], m[2], m[3]].map((p) => Math.trunc((Number(p) * 255) / 100.0 + 0.5));
  m = /^hsl\(\s*(\d+\.?\d*)\s*,\s*(\d+\.?\d*)%\s*,\s*(\d+\.?\d*)%\s*\)$/.exec(c);
  if (m) {
    const rgb = hlsKeRgb(Number(m[1]) / 360.0, Number(m[3]) / 100.0, Number(m[2]) / 100.0);
    return rgb.map((x) => Math.trunc(x * 255 + 0.5));
  }
  m = /^hs[bv]\(\s*(\d+\.?\d*)\s*,\s*(\d+\.?\d*)%\s*,\s*(\d+\.?\d*)%\s*\)$/.exec(c);
  if (m) {
    const rgb = hsvKeRgb(Number(m[1]) / 360.0, Number(m[2]) / 100.0, Number(m[3]) / 100.0);
    return rgb.map((x) => Math.trunc(x * 255 + 0.5));
  }
  m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(c);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  throw new Error(`unknown color specifier: '${c}'`);
}

/** Terima "white", "#ffcc00", atau gaya ffmpeg "black@0.5" -> RGBA (_warna). */
export function warna(nilai: unknown, bawaan = "white"): Rgba {
  let teks = rapikanTepi(String(atau(nilai, bawaan)));
  let alpha = 1.0;
  const at = teks.indexOf("@");
  if (at >= 0) {
    const bagian = teks.slice(at + 1);
    teks = teks.slice(0, at);
    try {
      const f = floatPy(bagian);
      // max(0.0, min(1.0, nan)) di Python bernilai 1.0
      alpha = Number.isNaN(f) ? 1.0 : Math.max(0.0, Math.min(1.0, f));
    } catch {
      alpha = 1.0;
    }
  }
  let rgb: number[];
  try {
    rgb = ambilRgb(rapikanTepi(teks) || bawaan);
  } catch {
    rgb = ambilRgb(bawaan);
  }
  return [rgb[0], rgb[1], rgb[2], Math.trunc(alpha * 255)];
}

// ==================================================================
//  Font: pembaca TrueType kecil + metrik ala FreeType
// ==================================================================

type Titik = { x: number; y: number; on: boolean };
type Kontur = Titik[];
type Ekstrem = { y: number; bulat: boolean };
type ZonaBiru = { ref: number; shoot: number; atas: boolean; xHeight: boolean; asc: number; desc: number };
type SkalaV = { skala: number; zona: (ZonaBiru & { refFit: number; shootFit: number; aktif: boolean })[] };

// Titik-tetap FreeType (FT_DivFix, FT_MulFix, FT_MulDiv), dengan pembulatan
// yang sama untuk nilai negatif (besaran dibulatkan, tanda dipasang lagi).
function ftDivFix(a: number, b: number): number {
  const s = Math.sign(a) * Math.sign(b);
  a = Math.abs(a);
  b = Math.abs(b);
  return s * Math.floor((a * 65536 + Math.floor(b / 2)) / b);
}
function ftMulFix(a: number, b: number): number {
  const s = Math.sign(a) * Math.sign(b);
  a = Math.abs(a);
  b = Math.abs(b);
  return s * Math.floor((a * b + 0x8000) / 65536);
}
function ftMulDiv(a: number, b: number, c: number): number {
  const s = Math.sign(a) * Math.sign(b) * Math.sign(c);
  a = Math.abs(a);
  b = Math.abs(b);
  c = Math.abs(c);
  return c === 0 ? 0 : s * Math.floor((a * b + Math.floor(c / 2)) / c);
}
/** PIXEL() di _imagingft.c: 26.6 -> piksel dengan pembulatan setengah ke atas. */
function piksel(x26: number): number {
  return Math.floor((x26 + 32) / 64);
}

// Karakter "default ignorable" disembunyikan HarfBuzz (advance nol, tanpa tinta).
function abaikan(cp: number): boolean {
  return (
    cp === 0xad ||
    cp === 0x34f ||
    cp === 0x61c ||
    (cp >= 0x115f && cp <= 0x1160) ||
    (cp >= 0x17b4 && cp <= 0x17b5) ||
    (cp >= 0x180b && cp <= 0x180f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    cp === 0x3164 ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0xfeff ||
    cp === 0xffa0 ||
    (cp >= 0xfff0 && cp <= 0xfff8) ||
    (cp >= 0x1bca0 && cp <= 0x1bca3) ||
    (cp >= 0x1d173 && cp <= 0x1d17a) ||
    (cp >= 0xe0000 && cp <= 0xe0fff)
  );
}

// Zona biru gaya "latn" autohinter FreeType (afblue.dat).
const ZONA_LATIN: { teks: string; atas: boolean; xHeight: boolean }[] = [
  { teks: "THEZOCQS", atas: true, xHeight: false },
  { teks: "HEZLOCUS", atas: false, xHeight: false },
  { teks: "fijkdbh", atas: true, xHeight: false },
  { teks: "uvxzoesc", atas: true, xHeight: true },
  { teks: "nrxzoesc", atas: false, xHeight: false },
  { teks: "pqgjy", atas: false, xHeight: false },
];

class FontTtf {
  readonly jalur: string;
  readonly alias: string;
  private readonly b: Buffer;
  private readonly tabel = new Map<string, number>();
  readonly upem: number;
  readonly ascender: number;
  readonly descender: number;
  private readonly lebarH: number[] = [];
  private readonly jumlahGlyph: number;
  private readonly formatLoca: number;
  /** Tanpa instruksi TrueType -> FreeType memakai autohinter (lihat FT_Load_Glyph). */
  readonly autohint: boolean;
  /** Font TrueType (garis luar kuadratik di tabel glyf). */
  readonly punyaGlyf: boolean;
  private readonly cmapPetaan: (cp: number) => number;
  private readonly cacheKontur = new Map<number, Kontur[]>();
  private zona: ZonaBiru[] | null = null;
  private readonly cacheSkalaV = new Map<number, SkalaV>();

  constructor(jalur: string) {
    this.jalur = jalur;
    this.b = fs.readFileSync(jalur);
    const b = this.b;
    const n = b.readUInt16BE(4);
    for (let i = 0; i < n; i++) {
      const o = 12 + 16 * i;
      this.tabel.set(b.toString("latin1", o, o + 4), b.readUInt32BE(o + 8));
    }
    const head = this.wajib("head");
    const hhea = this.wajib("hhea");
    const maxp = this.wajib("maxp");
    const hmtx = this.wajib("hmtx");
    this.upem = b.readUInt16BE(head + 18);
    this.formatLoca = b.readInt16BE(head + 50);
    let asc = b.readInt16BE(hhea + 4);
    let desc = b.readInt16BE(hhea + 6);
    const os2 = this.tabel.get("OS/2");
    // FreeType: bila hhea kosong, pakai OS/2 typo lalu win.
    if (asc === 0 && desc === 0 && os2 !== undefined) {
      asc = b.readInt16BE(os2 + 68);
      desc = b.readInt16BE(os2 + 70);
      if (asc === 0 && desc === 0) {
        asc = b.readUInt16BE(os2 + 74);
        desc = -b.readUInt16BE(os2 + 76);
      }
    }
    this.ascender = asc;
    this.descender = desc;
    const nhm = b.readUInt16BE(hhea + 34);
    this.jumlahGlyph = b.readUInt16BE(maxp + 4);
    for (let g = 0; g < this.jumlahGlyph; g++) this.lebarH.push(b.readUInt16BE(hmtx + 4 * Math.min(g, nhm - 1)));
    const maksInstruksi = b.readUInt32BE(maxp) >= 0x00010000 ? b.readUInt16BE(maxp + 26) : 0;
    this.punyaGlyf = this.tabel.has("glyf") && this.tabel.has("loca");
    this.autohint =
      this.tabel.has("glyf") && !this.tabel.has("fpgm") && !this.tabel.has("prep") && maksInstruksi === 0;
    this.cmapPetaan = this.bacaCmap();
    this.alias = `MesinVideo-${crypto.createHash("sha1").update(jalur).digest("hex").slice(0, 10)}`;
    if (!GlobalFonts.registerFromPath(jalur, this.alias)) {
      throw new GalatVideo(`Font ${jalur} tidak bisa dimuat`);
    }
  }

  private wajib(nama: string): number {
    const o = this.tabel.get(nama);
    if (o === undefined) throw new GalatVideo(`Font ${this.jalur} tidak punya tabel ${nama}`);
    return o;
  }

  private bacaCmap(): (cp: number) => number {
    const b = this.b;
    const cm = this.wajib("cmap");
    const n = b.readUInt16BE(cm + 2);
    let f12 = -1;
    let f4 = -1;
    for (let i = 0; i < n; i++) {
      const pid = b.readUInt16BE(cm + 4 + 8 * i);
      const eid = b.readUInt16BE(cm + 6 + 8 * i);
      const off = cm + b.readUInt32BE(cm + 8 + 8 * i);
      const fmt = b.readUInt16BE(off);
      if (fmt === 12 && (pid === 0 || (pid === 3 && eid === 10)) && f12 < 0) f12 = off;
      if (fmt === 4 && (pid === 0 || (pid === 3 && eid === 1)) && f4 < 0) f4 = off;
    }
    if (f12 >= 0) {
      const ng = b.readUInt32BE(f12 + 12);
      return (cp) => {
        let lo = 0;
        let hi = ng - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const o = f12 + 16 + 12 * mid;
          const awal = b.readUInt32BE(o);
          const akhir = b.readUInt32BE(o + 4);
          if (cp < awal) hi = mid - 1;
          else if (cp > akhir) lo = mid + 1;
          else return b.readUInt32BE(o + 8) + cp - awal;
        }
        return 0;
      };
    }
    if (f4 >= 0) {
      const seg = b.readUInt16BE(f4 + 6) / 2;
      const ends = f4 + 14;
      const starts = ends + seg * 2 + 2;
      const deltas = starts + seg * 2;
      const ros = deltas + seg * 2;
      return (cp) => {
        if (cp > 0xffff) return 0;
        for (let i = 0; i < seg; i++) {
          if (b.readUInt16BE(ends + 2 * i) < cp) continue;
          const awal = b.readUInt16BE(starts + 2 * i);
          if (cp < awal) return 0;
          const delta = b.readInt16BE(deltas + 2 * i);
          const ro = b.readUInt16BE(ros + 2 * i);
          if (ro === 0) return (cp + delta) & 0xffff;
          const g = b.readUInt16BE(ros + 2 * i + ro + 2 * (cp - awal));
          return g ? (g + delta) & 0xffff : 0;
        }
        return 0;
      };
    }
    return () => 0;
  }

  glyph(cp: number): number {
    const g = this.cmapPetaan(cp);
    return g < this.jumlahGlyph ? g : 0;
  }

  /** Skala 16.16 FreeType untuk ukuran (ppem) tertentu. */
  skala(ukuran: number): number {
    return ftDivFix(ukuran * 64, this.upem);
  }

  /** getmetrics()[0]: ascender dalam piksel (dibulatkan ke atas oleh FreeType). */
  ascPiksel(ukuran: number): number {
    return Math.ceil(ftMulFix(this.ascender, this.skala(ukuran)) / 64);
  }

  /**
   * Advance satu karakter dalam 26.6 seperti raqm/HarfBuzz (hb-ft tanpa
   * hinting): FT_MulDiv(advance, x_scale, 64) lalu 16.16 -> 26.6.
   */
  advance26(cp: number, ukuran: number): number {
    if (abaikan(cp)) return 0;
    const v16 = ftMulDiv(this.lebarH[this.glyph(cp)] ?? 0, this.skala(ukuran), 64);
    return Math.floor((v16 + 512) / 1024);
  }

  /** ImageDraw.textlength: jumlah advance (26.6) dibagi 64. */
  panjang(teks: string, ukuran: number): number {
    let total = 0;
    for (const ch of teks) total += this.advance26(ch.codePointAt(0) as number, ukuran);
    return total / 64;
  }

  // ---------------- garis luar glyph (tabel glyf) ----------------

  private loca(g: number): number {
    const loca = this.wajib("loca");
    return this.formatLoca ? this.b.readUInt32BE(loca + 4 * g) : 2 * this.b.readUInt16BE(loca + 2 * g);
  }

  kontur(g: number, kedalaman = 0): Kontur[] {
    const simpan = this.cacheKontur.get(g);
    if (simpan) return simpan;
    const hasil: Kontur[] = [];
    const glyf = this.tabel.get("glyf");
    if (glyf !== undefined && g < this.jumlahGlyph && kedalaman < 8) {
      const b = this.b;
      const o = this.loca(g);
      const o2 = this.loca(g + 1);
      if (o2 > o) {
        const p = glyf + o;
        const nc = b.readInt16BE(p);
        if (nc >= 0) {
          const ujung: number[] = [];
          for (let i = 0; i < nc; i++) ujung.push(b.readUInt16BE(p + 10 + 2 * i));
          const np = nc ? ujung[nc - 1] + 1 : 0;
          let q = p + 10 + 2 * nc;
          q += 2 + b.readUInt16BE(q);
          const bendera: number[] = [];
          while (bendera.length < np) {
            const f = b[q++];
            bendera.push(f);
            if (f & 8) for (let r = b[q++]; r > 0; r--) bendera.push(f);
          }
          const xs: number[] = [];
          const ys: number[] = [];
          let v = 0;
          for (const f of bendera) {
            if (f & 2) v += f & 16 ? b[q++] : -b[q++];
            else if (!(f & 16)) {
              v += b.readInt16BE(q);
              q += 2;
            }
            xs.push(v);
          }
          v = 0;
          for (const f of bendera) {
            if (f & 4) v += f & 32 ? b[q++] : -b[q++];
            else if (!(f & 32)) {
              v += b.readInt16BE(q);
              q += 2;
            }
            ys.push(v);
          }
          let s = 0;
          for (const e of ujung) {
            const c: Kontur = [];
            for (let i = s; i <= e; i++) c.push({ x: xs[i], y: ys[i], on: (bendera[i] & 1) === 1 });
            hasil.push(c);
            s = e + 1;
          }
        } else {
          // Glyph komposit (mis. É = E + aksen): gabungkan komponennya.
          let q = p + 10;
          let lanjut = true;
          while (lanjut) {
            const fl = b.readUInt16BE(q);
            const gi = b.readUInt16BE(q + 2);
            q += 4;
            let dx: number;
            let dy: number;
            if (fl & 1) {
              dx = b.readInt16BE(q);
              dy = b.readInt16BE(q + 2);
              q += 4;
            } else {
              dx = b.readInt8(q);
              dy = b.readInt8(q + 1);
              q += 2;
            }
            const f2 = (o3: number) => b.readInt16BE(o3) / 16384;
            let a = 1;
            let bb = 0;
            let c = 0;
            let d = 1;
            if (fl & 8) {
              a = d = f2(q);
              q += 2;
            } else if (fl & 0x40) {
              a = f2(q);
              d = f2(q + 2);
              q += 4;
            } else if (fl & 0x80) {
              a = f2(q);
              bb = f2(q + 2);
              c = f2(q + 4);
              d = f2(q + 6);
              q += 8;
            }
            // Penempatan lewat pencocokan titik (tanpa ARGS_ARE_XY) jarang
            // sekali; komponennya ditaruh tanpa geser.
            if (!(fl & 2)) dx = dy = 0;
            for (const kon of this.kontur(gi, kedalaman + 1)) {
              hasil.push(kon.map((t) => ({ x: Math.round(a * t.x + c * t.y + dx), y: Math.round(bb * t.x + d * t.y + dy), on: t.on })));
            }
            lanjut = (fl & 0x20) !== 0;
          }
        }
      }
    }
    this.cacheKontur.set(g, hasil);
    return hasil;
  }

  // ---------------- autohinter: bagian vertikal ----------------

  /**
   * Titik ekstrem atas/bawah glyph dan apakah segmennya "bulat" — salinan
   * langsung logika af_latin_metrics_init_blues (ambang 5 unit, sudut 20:1,
   * FLAT_THRESHOLD = upem/14).
   */
  private ekstrem(kontur: Kontur[], atas: boolean): Ekstrem | null {
    const titik: Titik[] = [];
    const awalKontur: number[] = [];
    const akhirKontur: number[] = [];
    for (const k of kontur) {
      awalKontur.push(titik.length);
      titik.push(...k);
      akhirKontur.push(titik.length - 1);
    }
    let terbaik = -1;
    let yTerbaik = 0;
    let awalTerbaik = -1;
    let akhirTerbaik = -1;
    for (let nn = 0; nn < kontur.length; nn++) {
      const first = awalKontur[nn];
      const last = akhirKontur[nn];
      if (last <= first) continue;
      for (let pp = first; pp <= last; pp++) {
        if (terbaik < 0 || (atas ? titik[pp].y > yTerbaik : titik[pp].y < yTerbaik)) {
          terbaik = pp;
          yTerbaik = titik[pp].y;
        }
      }
      if (terbaik > akhirTerbaik) {
        awalTerbaik = first;
        akhirTerbaik = last;
      }
    }
    if (terbaik < 0) return null;
    const bx = titik[terbaik].x;
    let segAwal = terbaik;
    let segAkhir = terbaik;
    let onAwal = titik[terbaik].on ? terbaik : -1;
    let onAkhir = onAwal;
    let prev = terbaik;
    do {
      prev = prev > awalTerbaik ? prev - 1 : akhirTerbaik;
      const d = Math.abs(titik[prev].y - yTerbaik);
      if (d > 5 && Math.abs(titik[prev].x - bx) <= 20 * d) break;
      segAwal = prev;
      if (titik[prev].on) {
        onAwal = prev;
        if (onAkhir < 0) onAkhir = prev;
      }
    } while (prev !== terbaik);
    let next = terbaik;
    do {
      next = next < akhirTerbaik ? next + 1 : awalTerbaik;
      const d = Math.abs(titik[next].y - yTerbaik);
      if (d > 5 && Math.abs(titik[next].x - bx) <= 20 * d) break;
      segAkhir = next;
      if (titik[next].on) {
        onAkhir = next;
        if (onAwal < 0) onAwal = next;
      }
    } while (next !== terbaik);
    let bulat: boolean;
    if (onAwal >= 0 && onAkhir >= 0 && Math.abs(titik[onAkhir].x - titik[onAwal].x) > Math.trunc(this.upem / 14)) {
      bulat = false;
    } else {
      bulat = !titik[segAwal].on || !titik[segAkhir].on;
    }
    return { y: yTerbaik, bulat };
  }

  private zonaBiru(): ZonaBiru[] {
    if (this.zona) return this.zona;
    const zona: ZonaBiru[] = [];
    for (const z of ZONA_LATIN) {
      const datar: number[] = [];
      const bulat: number[] = [];
      let asc = 0;
      let desc = 0;
      for (const ch of z.teks) {
        const g = this.glyph(ch.codePointAt(0) as number);
        if (!g) continue;
        const kon = this.kontur(g);
        if (kon.reduce((n, k) => n + k.length, 0) <= 2) continue;
        for (const k of kon) {
          if (k.length < 2) continue;
          for (const t of k) {
            asc = Math.max(asc, t.y);
            desc = Math.min(desc, t.y);
          }
        }
        const e = this.ekstrem(kon, z.atas);
        if (e) (e.bulat ? bulat : datar).push(e.y);
      }
      if (!datar.length && !bulat.length) continue;
      datar.sort((a, c) => a - c);
      bulat.sort((a, c) => a - c);
      let ref: number;
      let shoot: number;
      if (!datar.length) ref = shoot = bulat[bulat.length >> 1];
      else if (!bulat.length) ref = shoot = datar[datar.length >> 1];
      else {
        ref = datar[datar.length >> 1];
        shoot = bulat[bulat.length >> 1];
      }
      if (shoot !== ref && z.atas !== shoot > ref) ref = shoot = Math.trunc((shoot + ref) / 2);
      zona.push({ ref, shoot, atas: z.atas, xHeight: z.xHeight, asc, desc });
    }
    // Zona diurutkan dari bawah lalu dirapikan supaya tidak tumpang tindih.
    const urut = [...zona];
    const kunci = (z: ZonaBiru) => (z.atas ? z.ref : z.shoot);
    for (let i = 1; i < urut.length; i++) {
      for (let j = i; j > 0 && kunci(urut[j]) < kunci(urut[j - 1]); j--) [urut[j - 1], urut[j]] = [urut[j], urut[j - 1]];
    }
    for (let i = 0; i < urut.length - 1; i++) {
      const a = urut[i].atas ? urut[i].shoot : urut[i].ref;
      const bNilai = urut[i + 1].atas ? urut[i + 1].shoot : urut[i + 1].ref;
      if (a > bNilai) {
        if (urut[i].atas) urut[i].shoot = bNilai;
        else urut[i].ref = bNilai;
      }
    }
    this.zona = zona;
    return zona;
  }

  /** af_latin_metrics_scale_dim (vertikal): skala dipaskan ke x-height + posisi zona. */
  skalaV(ukuran: number): SkalaV {
    const ada = this.cacheSkalaV.get(ukuran);
    if (ada) return ada;
    let skala = this.skala(ukuran);
    const zona = this.zonaBiru();
    const xh = zona.find((z) => z.xHeight);
    if (xh) {
      const scaled = ftMulFix(xh.shoot, skala);
      const fitted = (scaled + 40) & ~63;
      if (scaled !== fitted) {
        const baru = ftMulDiv(skala, fitted, scaled);
        let maks = this.upem;
        for (const z of zona) maks = Math.max(maks, z.asc, -z.desc);
        const jarak = ftMulFix(maks, baru - skala);
        if (jarak > -128 && jarak < 128) skala = baru;
      }
    }
    const hasil: SkalaV = {
      skala,
      zona: zona.map((z) => {
        const refCur = ftMulFix(z.ref, skala);
        const shootCur = ftMulFix(z.shoot, skala);
        const jarak = ftMulFix(z.ref - z.shoot, skala);
        if (jarak <= 48 && jarak >= -48) {
          let d2 = Math.abs(jarak);
          d2 = d2 < 32 ? 0 : d2 < 48 ? 32 : 64;
          if (jarak < 0) d2 = -d2;
          const refFit = (refCur + 32) & ~63;
          return { ...z, refFit, shootFit: refFit - d2, aktif: true };
        }
        return { ...z, refFit: refCur, shootFit: shootCur, aktif: false };
      }),
    };
    this.cacheSkalaV.set(ukuran, hasil);
    return hasil;
  }

  /**
   * Posisi vertikal (26.6) satu tepi ekstrem sesudah autohint: tepi yang
   * jatuh di zona biru aktif dikunci ke posisi zona (af_latin_hints_compute_
   * blue_edges); tepi lain dibulatkan ke piksel seperti jangkar batang.
   */
  private yHint(e: Ekstrem, atas: boolean, sv: SkalaV): number {
    let jarakTerbaik = Math.min(ftMulFix(Math.trunc(this.upem / 40), sv.skala), 32);
    let hasil: number | null = null;
    for (const z of sv.zona) {
      if (!z.aktif || z.atas !== atas) continue;
      let d = ftMulFix(Math.abs(e.y - z.ref), sv.skala);
      if (d < jarakTerbaik) {
        jarakTerbaik = d;
        hasil = z.refFit;
      }
      if (e.bulat && d !== 0 && atas !== e.y < z.ref) {
        d = ftMulFix(Math.abs(e.y - z.shoot), sv.skala);
        if (d < jarakTerbaik) {
          jarakTerbaik = d;
          hasil = z.shootFit;
        }
      }
    }
    if (hasil !== null) return hasil;
    return (ftMulFix(e.y, sv.skala) + 32) & ~63;
  }

  /** Peta y (unit font) -> piksel (pecahan) dengan zona biru dikunci ke grid. */
  petaY(ukuran: number): (y: number) => number {
    const sv = this.skalaV(ukuran);
    const titik: [number, number][] = [];
    for (const z of sv.zona) {
      if (!z.aktif) continue;
      titik.push([z.ref, z.refFit / 64]);
      if (z.shoot !== z.ref) titik.push([z.shoot, z.shootFit / 64]);
    }
    titik.sort((a, b) => a[0] - b[0]);
    const s = sv.skala / 65536 / 64;
    return (y: number) => {
      if (!titik.length) return y * s;
      if (y <= titik[0][0]) return titik[0][1] + (y - titik[0][0]) * s;
      const akhir = titik[titik.length - 1];
      if (y >= akhir[0]) return akhir[1] + (y - akhir[0]) * s;
      for (let i = 1; i < titik.length; i++) {
        const [y1, v1] = titik[i];
        if (y <= y1) {
          const [y0, v0] = titik[i - 1];
          return y1 === y0 ? v0 : v0 + ((y - y0) * (v1 - v0)) / (y1 - y0);
        }
      }
      return y * s;
    };
  }

  /** Kotak kendali glyph dalam piksel (FT_GLYPH_BBOX_PIXELS) sesudah hinting. */
  kotakGlyph(g: number, ukuran: number): [number, number, number, number] | null {
    const kon = this.kontur(g);
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const k of kon) {
      for (const t of k) {
        if (t.x < xMin) xMin = t.x;
        if (t.x > xMax) xMax = t.x;
        if (t.y < yMin) yMin = t.y;
        if (t.y > yMax) yMax = t.y;
      }
    }
    if (xMin === Infinity) return null;
    const s = this.skala(ukuran);
    let atas = ftMulFix(yMax, s);
    let bawah = ftMulFix(yMin, s);
    if (this.autohint) {
      const sv = this.skalaV(ukuran);
      const ea = this.ekstrem(kon, true);
      const eb = this.ekstrem(kon, false);
      if (ea) atas = this.yHint(ea, true, sv);
      if (eb) bawah = this.yHint(eb, false, sv);
    }
    return [
      Math.floor(ftMulFix(xMin, s) / 64),
      Math.floor(bawah / 64),
      Math.ceil(ftMulFix(xMax, s) / 64),
      Math.ceil(atas / 64),
    ];
  }

  /**
   * font.getbbox(teks) jangkar "la": (kiri, atas, kanan, bawah), dihitung
   * seperti bounding_box_and_anchors di _imagingft.c.
   */
  kotakTeks(teks: string, ukuran: number): [number, number, number, number] {
    let pos = 0;
    let xMin = 0;
    let xMax = 0;
    let yMin = 0;
    let yMax = 0;
    let ada = false;
    for (const ch of teks) {
      ada = true;
      const cp = ch.codePointAt(0) as number;
      const px = piksel(pos);
      pos += this.advance26(cp, ukuran);
      xMax = Math.max(xMax, piksel(pos));
      const k = abaikan(cp) ? null : this.kotakGlyph(this.glyph(cp), ukuran);
      const [gx0, gy0, gx1, gy1] = k ?? [0, 0, 0, 0];
      xMax = Math.max(xMax, gx1 + px);
      xMin = Math.min(xMin, gx0 + px);
      yMax = Math.max(yMax, gy1);
      yMin = Math.min(yMin, gy0);
    }
    const asc = ada ? this.ascPiksel(ukuran) : 0;
    return [xMin, asc - yMax, xMax, asc - yMin];
  }
}

const cacheFont = new Map<string, FontTtf>();

/** _font(): kandidat font pertama yang ada di disk. */
export function jalurFont(): string {
  for (const kandidat of FONT_CANDIDATES) {
    try {
      if (kandidat && fs.statSync(kandidat).isFile()) return kandidat;
    } catch {
      // belum ada, coba kandidat berikutnya
    }
  }
  throw new GalatVideo(
    "Tidak ada font untuk teks di video. Pasang fonts-dejavu-core " +
      "atau isi environment VIDEO_FONT dengan path file .ttf",
  );
}

function muatFont(jalur = jalurFont()): FontTtf {
  let f = cacheFont.get(jalur);
  if (!f) {
    f = new FontTtf(jalur);
    cacheFont.set(jalur, f);
  }
  return f;
}

/** Ascender (piksel) & lebar teks — diekspor untuk uji paritas. */
export function ukurTeks(teks: string, ukuran: number, jalur?: string): { panjang: number; asc: number; kotak: [number, number, number, number] } {
  const f = muatFont(jalur);
  return { panjang: f.panjang(teks, ukuran), asc: f.ascPiksel(ukuran), kotak: f.kotakTeks(teks, ukuran) };
}

// ==================================================================
//  Rasterisasi: topeng glyph (Skia) + rumus tempel libImaging
// ==================================================================

type TopengGlyph = { kiri: number; atas: number; w: number; h: number; data: Uint8Array };
const cacheTopeng = new Map<string, TopengGlyph | null>();

function jalurGlyph(kontur: Kontur[], skala: number, ox: number, oy: number, petaY?: (y: number) => number): Path2D {
  const p = new Path2D();
  const X = (t: Titik) => ox + t.x * skala;
  const Y = (t: Titik) => oy - (petaY ? petaY(t.y) : t.y * skala);
  for (const k of kontur) {
    if (k.length < 2) continue;
    // Mulai dari titik on-curve (atau titik tengah dua off-curve).
    let mulai = k.findIndex((t) => t.on);
    let awal: Titik;
    if (mulai < 0) {
      awal = { x: (k[0].x + k[1].x) / 2, y: (k[0].y + k[1].y) / 2, on: true };
      mulai = 0;
    } else awal = k[mulai];
    p.moveTo(X(awal), Y(awal));
    let kendali: Titik | null = null;
    for (let i = 1; i <= k.length; i++) {
      const t = k[(mulai + i) % k.length];
      const titikAkhir = i === k.length ? awal : t;
      if (i === k.length) {
        if (kendali) p.quadraticCurveTo(X(kendali), Y(kendali), X(awal), Y(awal));
        else p.lineTo(X(awal), Y(awal));
        break;
      }
      if (titikAkhir.on) {
        if (kendali) p.quadraticCurveTo(X(kendali), Y(kendali), X(t), Y(t));
        else p.lineTo(X(t), Y(t));
        kendali = null;
      } else {
        if (kendali) {
          const tengah = { x: (kendali.x + t.x) / 2, y: (kendali.y + t.y) / 2, on: true };
          p.quadraticCurveTo(X(kendali), Y(kendali), X(tengah), Y(tengah));
        }
        kendali = t;
      }
    }
    p.closePath();
  }
  return p;
}

/**
 * Topeng cakupan satu glyph (0..255) dengan titik asal di piksel bulat.
 * kiri/atas relatif terhadap titik asal (atas negatif = di atas baseline).
 */
function topengGlyph(f: FontTtf, cp: number, ukuran: number, tepi: number): TopengGlyph | null {
  const kunci = `${f.alias}|${ukuran}|${tepi}|${cp}`;
  if (cacheTopeng.has(kunci)) return cacheTopeng.get(kunci) ?? null;
  let hasil: TopengGlyph | null = null;
  const g = f.glyph(cp);
  // Karakter yang tak ada di font memakai glyph 0 (.notdef) — sama seperti
  // Pillow/raqm yang menggambar kotak .notdef, bukan font cadangan.
  const kon = f.punyaGlyf ? f.kontur(g) : [];
  const kosong = abaikan(cp) || (f.punyaGlyf && kon.length === 0);
  if (!kosong) {
    // Kanvas sementara cukup lebar untuk glyph + garis tepi.
    const ruang = Math.ceil(ukuran * (f.punyaGlyf ? 1.6 : 2.5)) + 2 * Math.ceil(tepi) + 8;
    const lebar = ruang * 2;
    const tinggi = ruang * 2;
    const ox = Math.floor(ruang / 2);
    const oy = ruang + Math.floor(ruang / 4);
    const kanvas = createCanvas(lebar, tinggi);
    const ctx = kanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ffffff";
    // FT_Glyph_StrokeBorder (sisi luar) dengan sambungan bulat = glyph yang
    // "digemukkan" sejauh `tepi` piksel ke segala arah.
    ctx.lineWidth = tepi * 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (f.punyaGlyf) {
      // Garis luar glyph digambar sebagai path (bukan fillText): rasternya
      // tidak bergantung pada pemindai font Skia per sistem operasi, jadi
      // hasil uji di Windows sama dengan produksi di Linux. Untuk font tanpa
      // instruksi (Poppins) koordinat y dipetakan lewat zona biru autohinter
      // supaya garis dasar, x-height, dan tinggi kapital jatuh di piksel yang
      // sama dengan FreeType.
      const jalur = jalurGlyph(kon, ukuran / f.upem, ox, oy, f.autohint ? f.petaY(ukuran) : undefined);
      if (tepi > 0) ctx.stroke(jalur);
      ctx.fill(jalur, "nonzero");
    } else {
      // Font CFF/OpenType tanpa tabel glyf: serahkan ke perender teks Skia.
      ctx.font = `${ukuran}px "${f.alias}"`;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      const ch = String.fromCodePoint(cp);
      if (tepi > 0) ctx.strokeText(ch, ox, oy);
      ctx.fillText(ch, ox, oy);
    }
    const data = ctx.getImageData(0, 0, lebar, tinggi).data;
    let x0 = lebar;
    let y0 = tinggi;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < tinggi; y++) {
      for (let x = 0; x < lebar; x++) {
        if (data[(y * lebar + x) * 4 + 3]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    if (x1 >= 0) {
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      const cakupan = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) cakupan[y * w + x] = data[((y + y0) * lebar + x + x0) * 4 + 3];
      }
      hasil = { kiri: x0 - ox, atas: y0 - oy, w, h, data: cakupan };
    }
  }
  cacheTopeng.set(kunci, hasil);
  return hasil;
}

function div255(a: number): number {
  const t = a + 128;
  return ((t >> 8) + t) >> 8;
}

/**
 * Padanan satu panggilan `ImageDraw.text((x, y), teks, fill, stroke_width)`
 * jangkar "la" pada kanvas RGBA.
 *
 * Posisi: Pillow memecah x menjadi int(x) + pecahan; pecahan dibulatkan ke
 * 1/64 lalu tiap glyph diletakkan di PIXEL(pecahan64 + posisi26.6) — piksel
 * bulat. Baseline berada `ascender` piksel di bawah y.
 */
function gambarRun(kanvas: GambarRgba, f: FontTtf, ukuran: number, teks: string, x: number, y: number, tinta: Rgba, tepi = 0): void {
  const xi = Math.trunc(x);
  const yi = Math.trunc(y);
  const awal26 = bulatC((x - xi) * 64);
  const turun = -Math.floor((32 - bulatC((y - yi) * 64)) / 64);
  const baseline = yi + f.ascPiksel(ukuran) + turun;

  // Kumpulkan glyph lalu gabungkan ke satu topeng (font_render mode "L"):
  // piksel yang sudah berisi ditimpa dengan rumus "over".
  const potongan: { t: TopengGlyph; x: number; y: number }[] = [];
  let pos = 0;
  let kiri = Infinity;
  let atas = Infinity;
  let kanan = -Infinity;
  let bawah = -Infinity;
  for (const ch of teks) {
    const cp = ch.codePointAt(0) as number;
    const asal = xi + piksel(awal26 + pos);
    pos += f.advance26(cp, ukuran);
    const t = topengGlyph(f, cp, ukuran, tepi);
    if (!t) continue;
    const gx = asal + t.kiri;
    const gy = baseline + t.atas;
    potongan.push({ t, x: gx, y: gy });
    kiri = Math.min(kiri, gx);
    atas = Math.min(atas, gy);
    kanan = Math.max(kanan, gx + t.w);
    bawah = Math.max(bawah, gy + t.h);
  }
  if (!potongan.length) return;
  const mw = kanan - kiri;
  const mh = bawah - atas;
  const topeng = new Uint8Array(mw * mh);
  for (const { t, x: gx, y: gy } of potongan) {
    for (let yy = 0; yy < t.h; yy++) {
      const baris = (gy - atas + yy) * mw + (gx - kiri);
      for (let xx = 0; xx < t.w; xx++) {
        const s = t.data[yy * t.w + xx];
        if (s === 0) continue;
        const i = baris + xx;
        const lama = topeng[i];
        topeng[i] = lama > 0 ? Math.min(255, s + div255(lama * (255 - s))) : s;
      }
    }
  }
  // fill_mask_L (Paste.c) untuk kanvas RGBA: kanal warna diisi penuh warna
  // tinta bila piksel tujuan masih transparan, kalau tidak dicampur menurut
  // topeng; kanal alpha selalu dicampur menurut topeng.
  const d = kanvas.data;
  for (let yy = 0; yy < mh; yy++) {
    const ty = atas + yy;
    if (ty < 0 || ty >= kanvas.height) continue;
    for (let xx = 0; xx < mw; xx++) {
      const tx = kiri + xx;
      if (tx < 0 || tx >= kanvas.width) continue;
      const m = topeng[yy * mw + xx];
      if (m === 0) continue;
      const o = (ty * kanvas.width + tx) * 4;
      const cmWarna = d[o + 3] === 0 ? 255 : m;
      d[o] = div255(d[o] * (255 - cmWarna) + tinta[0] * cmWarna);
      d[o + 1] = div255(d[o + 1] * (255 - cmWarna) + tinta[1] * cmWarna);
      d[o + 2] = div255(d[o + 2] * (255 - cmWarna) + tinta[2] * cmWarna);
      d[o + 3] = div255(d[o + 3] * (255 - m) + tinta[3] * m);
    }
  }
}

/** ImageDraw.rectangle(fill=...) pada RGBA: piksel ditulis langsung, tanpa campur. */
function gambarKotak(kanvas: GambarRgba, x0: number, y0: number, x1: number, y1: number, isi: Rgba): void {
  if (x1 < x0) throw new Error("x1 must be greater than or equal to x0");
  if (y1 < y0) throw new Error("y1 must be greater than or equal to y0");
  const [ax, , bx] = [x0, y0, x1, y1].map((v) => Math.trunc(v));
  let ay = Math.trunc(y0);
  let by = Math.trunc(y1);
  if (ay < 0) ay = 0;
  else if (ay >= kanvas.height) return;
  if (by < 0) return;
  if (by > kanvas.height) by = kanvas.height;
  for (let y = ay; y <= by; y++) {
    if (y < 0 || y >= kanvas.height) continue;
    let xa = ax;
    let xb = bx;
    if (xa < 0) xa = 0;
    else if (xa >= kanvas.width) continue;
    if (xb < 0) continue;
    if (xb >= kanvas.width) xb = kanvas.width - 1;
    for (let x = xa; x <= xb; x++) {
      const o = (y * kanvas.width + x) * 4;
      kanvas.data[o] = isi[0];
      kanvas.data[o + 1] = isi[1];
      kanvas.data[o + 2] = isi[2];
      kanvas.data[o + 3] = isi[3];
    }
  }
}

// ==================================================================
//  Gaya "berita": paragraf lower-third
// ==================================================================

/** Bagi daftar kata jadi baris-baris yang lebarnya tidak melewati `batas` (_bungkus_kata). */
function bungkusKata(f: FontTtf, kata: string[], ukuran: number, batas: number): string[][] {
  const baris: string[][] = [];
  let sekarang: string[] = [];
  for (const k of kata) {
    const calon = [...sekarang, k].join(" ");
    if (!sekarang.length || f.panjang(calon, ukuran) <= batas) sekarang.push(k);
    else {
      baris.push(sekarang);
      sekarang = [k];
    }
  }
  if (sekarang.length) baris.push(sekarang);
  return baris;
}

export type KataBerita = { teks: string; x: number; y: number; baris: number; pembuka: boolean };
export type TataLetakBerita = {
  /** Ukuran font yang akhirnya dipakai. */
  ukuran: number;
  tinggiBaris: number;
  baris: string[][];
  kata: KataBerita[];
  /** Ada baris yang dibuang karena tetap tidak muat. */
  dipotong: boolean;
  warnaIsi: Rgba;
  warnaPembuka: Rgba;
};

/**
 * Tata letak paragraf gaya lower-third berita TANPA menggambar — ukuran
 * font, pemenggalan baris, dan posisi (x, y) tiap kata. Dipakai perender
 * dan uji paritas. null bila isinya kosong.
 */
export function tataLetakBerita(teks: LapisanTeks, isi: string, lebar: number, tinggi: number): TataLetakBerita | null {
  const t = teks as Record<string, unknown>;
  const f = muatFont();
  const kata = pisahKata(isi);
  if (!kata.length) return null;

  const ukuranAwal = intPy(atau(t.size, 38));
  const ukuranMin = Math.max(8, intPy(atau(t.min_size, 22)));
  const maksBaris = Math.max(1, intPy(atau(t.max_lines, 4)));
  let kelipatan: number;
  try {
    kelipatan = floatPy(atau(t.line_height, 1.15));
  } catch {
    kelipatan = 1.15;
  }

  // Kalau template punya kotak teks, geometri diambil dari kotak itu: teks
  // mengisi lebar kotak dikurangi tepi, dan tingginya dibatasi tinggi kotak.
  let kotak: Record<string, unknown> | null = apakahDict(t.box) ? t.box : null;
  let kx = 0;
  let ky = 0;
  let kw = 0;
  let kh = 0;
  let tinggiMaks: number | null = null;
  if (benar(kotak) && kotak) {
    try {
      kx = intPy(kotak.x);
      ky = intPy(kotak.y);
      kw = intPy(kotak.w);
      kh = intPy(kotak.h);
    } catch {
      kotak = null;
    }
  }
  let kiri: number;
  let batas: number;
  if (benar(kotak)) {
    const tepi = Math.max(12, Math.trunc(kw * 0.05));
    kiri = kx + tepi;
    batas = Math.max(50, kw - 2 * tepi);
    tinggiMaks = Math.max(20, kh - 2 * tepi);
  } else {
    kiri = intPy(atau(t.x, 0));
    batas = intPy(atau(t.width, lebar - 2 * kiri));
    batas = Math.max(50, Math.min(batas, lebar - kiri));
  }

  const tinggiBlok = (uk: number, jumlah: number) => bulatPy(uk * kelipatan) * jumlah;
  // `max_lines` adalah pagar desain untuk teks pendek pada ukuran aslinya.
  // Untuk teks panjang yang sudah disusutkan, yang membatasi adalah tinggi
  // kotaknya — menambah baris lebih baik daripada memenggal isi berita.
  const batasBaris = (uk: number) =>
    tinggiMaks === null ? maksBaris : Math.max(maksBaris, Math.floor(tinggiMaks / Math.max(1, bulatPy(uk * kelipatan))));

  let ukuran = ukuranAwal;
  let baris = bungkusKata(f, kata, ukuran, batas);
  const belumMuat = () =>
    baris.length > batasBaris(ukuran) || (tinggiMaks !== null && tinggiBlok(ukuran, baris.length) > tinggiMaks);

  // Batas bawah kedua: kalau pada min_size pun belum muat, font diturunkan
  // lebih jauh — tulisan agak kecil lebih baik daripada berita hilang separuh.
  const lantai = Math.min(ukuranMin, Math.max(8, Math.trunc(ukuranAwal * 0.4)));
  while (belumMuat() && ukuran > lantai) {
    ukuran -= 1;
    baris = bungkusKata(f, kata, ukuran, batas);
  }
  let dipotong = false;
  if (baris.length > batasBaris(ukuran)) {
    console.warn(`Teks '${adaNilai(t.name) ? String(t.name) : "None"}' tetap ${baris.length} baris pada ukuran ${ukuran}; sisanya dibuang`);
    baris = baris.slice(0, batasBaris(ukuran));
    dipotong = true;
  }

  const tinggiBaris = bulatPy(ukuran * kelipatan);
  let atasBlok: number;
  if (benar(kotak)) {
    // Blok teks diletakkan di tengah kotak secara vertikal.
    atasBlok = ky + Math.max(0, Math.floor((kh - tinggiBaris * baris.length) / 2));
  } else if (adaNilai(t.y)) {
    atasBlok = intPy(t.y);
  } else {
    atasBlok = Math.floor((tinggi - tinggiBaris * baris.length) / 2);
  }

  const warnaIsi = warna(t.color, "black");
  const warnaPembuka = warna(t.kicker_color, "#d32d27");
  const lebarSpasi = f.panjang(" ", ukuran);
  // "justify" (bawaan) meregangkan sela kata sampai rata kiri-kanan; tiga
  // lainnya memakai sela biasa dan hanya menggeser titik mulai tiap baris.
  let rata = rapikanTepi(String(atau(t.align, "justify"))).toLowerCase();
  if (!["justify", "left", "center", "right"].includes(rata)) rata = "justify";

  const hasilKata: KataBerita[] = [];
  baris.forEach((kataBaris, nomor) => {
    const y = atasBlok + nomor * tinggiBaris;
    const lebarKata = kataBaris.map((k) => f.panjang(k, ukuran));
    const terakhir = nomor === baris.length - 1;
    // Baris terakhir dan baris satu kata tidak pernah diregangkan.
    const regang = rata === "justify" && !terakhir && kataBaris.length >= 2;
    let jumlahLebar = 0;
    for (const w of lebarKata) jumlahLebar += w;
    const sela = regang ? (batas - jumlahLebar) / (kataBaris.length - 1) : lebarSpasi;
    const lebarBaris = jumlahLebar + sela * Math.max(0, kataBaris.length - 1);
    let x: number;
    if (rata === "center") x = kiri + Math.max(0.0, (batas - lebarBaris) / 2);
    else if (rata === "right") x = kiri + Math.max(0.0, batas - lebarBaris);
    else x = kiri;
    kataBaris.forEach((k, urutan) => {
      hasilKata.push({ teks: k, x, y, baris: nomor, pembuka: nomor === 0 && urutan === 0 });
      x += lebarKata[urutan] + sela;
    });
  });
  return { ukuran, tinggiBaris, baris, kata: hasilKata, dipotong, warnaIsi, warnaPembuka };
}

function renderBerita(teks: LapisanTeks, isi: string, lebar: number, tinggi: number): GambarRgba {
  const kanvas = gambarKosong(lebar, tinggi);
  const f = muatFont();
  const tata = tataLetakBerita(teks, isi, lebar, tinggi);
  if (!tata) return kanvas;
  for (const k of tata.kata) {
    gambarRun(kanvas, f, tata.ukuran, k.teks, k.x, k.y, k.pembuka ? tata.warnaPembuka : tata.warnaIsi);
  }
  return kanvas;
}

// ==================================================================
//  Gaya "kategori": badge satu kata
// ==================================================================

/** Tempat badge kategori kalau tidak ditentukan: menempel di atas kotak teks, rata kiri. */
export function kotakKategoriBawaan(textBox: unknown): Kotak | null {
  if (!apakahDict(textBox)) return null;
  let tx: number;
  let ty: number;
  let tw: number;
  let th: number;
  try {
    [tx, ty, tw, th] = ["x", "y", "w", "h"].map((k) => intPy(textBox[k]));
  } catch {
    return null;
  }
  const h = Math.max(36, Math.min(80, Math.trunc(th * 0.26)));
  const w = Math.max(120, Math.trunc(tw * 0.41));
  return { x: tx + 6, y: Math.max(0, ty - h), w, h };
}

export type TataLetakKategori = { isi: string; ukuran: number; x: number; y: number; kotak: [number, number, number, number] };

/** Ukuran font & posisi badge kategori tanpa menggambar (untuk uji paritas). */
export function tataLetakKategori(teks: LapisanTeks, isi: string): TataLetakKategori | null {
  const t = teks as Record<string, unknown>;
  const kotak = apakahDict(t.box) ? t.box : null;
  const kata = pisahKata(isi).join(" ").toUpperCase();
  if (!benar(kotak) || !kata || !kotak) return null;
  const [kx, ky, kw, kh] = ["x", "y", "w", "h"].map((k) => {
    if (!(k in kotak)) throw new Error(`KeyError: '${k}'`);
    return intPy(kotak[k]);
  });
  const tepi = Math.max(6, Math.trunc(kh * 0.2));
  const f = muatFont();
  let ukuran = Math.max(10, intPy(atau(t.size, kh)));
  const muat = (uk: number) => {
    const bb = f.kotakTeks(kata, uk);
    return bb[2] - bb[0] <= kw - 2 * tepi && bb[3] - bb[1] <= kh - 2 * tepi;
  };
  while (!muat(ukuran) && ukuran > 10) ukuran -= 1;
  const bb = f.kotakTeks(kata, ukuran);
  const tw = bb[2] - bb[0];
  const th = bb[3] - bb[1];
  const x = kx + Math.floor((kw - tw) / 2) - bb[0];
  const y = ky + Math.floor((kh - th) / 2) - bb[1];
  return { isi: kata, ukuran, x, y, kotak: bb };
}

function renderKategori(teks: LapisanTeks, isi: string, lebar: number, tinggi: number): GambarRgba {
  const kanvas = gambarKosong(lebar, tinggi);
  const tata = tataLetakKategori(teks, isi);
  if (!tata) return kanvas;
  gambarRun(kanvas, muatFont(), tata.ukuran, tata.isi, tata.x, tata.y, warna((teks as Record<string, unknown>).color, "white"));
  return kanvas;
}

// ==================================================================
//  Teks biasa (judul, sumber, dsb.)
// ==================================================================

export type TataLetakBiasa = {
  ukuran: number;
  /** Persegi latar (x0, y0, x1, y1) & warnanya bila `box` diisi. */
  kotak: { xy: [number, number, number, number]; isi: Rgba } | null;
  baris: { teks: string; x: number; y: number }[];
  tinta: Rgba;
  tebalGaris: number;
  tintaGaris: Rgba | null;
};

/** Tata letak teks biasa tanpa menggambar (untuk perender & uji paritas). */
export function tataLetakBiasa(teks: LapisanTeks, isi: string, lebar: number, tinggi: number): TataLetakBiasa {
  const t = teks as Record<string, unknown>;
  const ukuran = intPy(atau(t.size, 56));
  const f = muatFont();

  // Penggal baris supaya muat di lebar maksimum.
  let rasio: number;
  try {
    rasio = floatPy(atau(t.max_width, 0.9));
  } catch {
    rasio = 0.9;
  }
  const batas = Math.max(50, Math.trunc(lebar * Math.max(0.1, Math.min(1.0, rasio))));
  const baris: string[] = [];
  const paragraf = pisahBaris(isi);
  for (const p of paragraf.length ? paragraf : [""]) {
    let sekarang = "";
    for (const kata of pisahKata(p)) {
      const calon = rapikanTepi(`${sekarang} ${kata}`);
      if (f.panjang(calon, ukuran) <= batas || !sekarang) sekarang = calon;
      else {
        baris.push(sekarang);
        sekarang = kata;
      }
    }
    baris.push(sekarang);
  }

  const jarak = intPy(atau(t.line_spacing, ukuran * 0.3));
  const tinggiBaris = ukuran + jarak;
  const tinggiTotal = tinggiBaris * baris.length - jarak;
  const atas = adaNilai(t.y) ? intPy(t.y) : Math.floor((tinggi - tinggiTotal) / 2);
  const rata = String(atau(t.align, "center")).toLowerCase();
  const tebalGaris = intPy(atau(t.stroke, 0));

  let kotak: TataLetakBiasa["kotak"] = null;
  if (benar(t.box)) {
    const isiKotak = warna(t.box_color, "black@0.5");
    const pad = intPy(atau(t.box_padding, 18));
    let lebarKotak = 0;
    for (const b of baris) lebarKotak = Math.max(lebarKotak, f.panjang(b, ukuran));
    const kiriKotak = adaNilai(t.x) ? intPy(t.x) : Math.floor((lebar - lebarKotak) / 2);
    kotak = { xy: [kiriKotak - pad, atas - pad, kiriKotak + lebarKotak + pad, atas + tinggiTotal + pad], isi: isiKotak };
  }

  const tinta = warna(t.color, "white");
  const tintaGaris = tebalGaris ? warna(t.stroke_color, "black") : null;
  const posisi = baris.map((teksBaris, nomor) => {
    const panjang = f.panjang(teksBaris, ukuran);
    let kiri: number;
    if (adaNilai(t.x)) kiri = intPy(t.x);
    else if (rata === "left") kiri = Math.trunc(lebar * 0.05);
    else if (rata === "right") kiri = Math.trunc(lebar * 0.95 - panjang);
    else kiri = Math.trunc(Math.floor((lebar - panjang) / 2));
    return { teks: teksBaris, x: kiri, y: atas + nomor * tinggiBaris };
  });
  return { ukuran, kotak, baris: posisi, tinta, tebalGaris, tintaGaris };
}

function renderBiasa(teks: LapisanTeks, isi: string, lebar: number, tinggi: number): GambarRgba {
  const tata = tataLetakBiasa(teks, isi, lebar, tinggi);
  const f = muatFont();
  const kanvas = gambarKosong(lebar, tinggi);
  if (tata.kotak) gambarKotak(kanvas, ...tata.kotak.xy, tata.kotak.isi);
  for (const b of tata.baris) {
    if (tata.tintaGaris) {
      // Pillow menggambar garis tepi dulu, lalu isi huruf di atasnya —
      // kecuali warnanya sama persis (satu lintasan saja).
      gambarRun(kanvas, f, tata.ukuran, b.teks, b.x, b.y, tata.tintaGaris, tata.tebalGaris);
      if (tata.tintaGaris.some((v, i) => v !== tata.tinta[i])) gambarRun(kanvas, f, tata.ukuran, b.teks, b.x, b.y, tata.tinta);
    } else {
      gambarRun(kanvas, f, tata.ukuran, b.teks, b.x, b.y, tata.tinta);
    }
  }
  return kanvas;
}

// ==================================================================
//  Pintu masuk
// ==================================================================

/**
 * Render satu lapisan teks jadi gambar RGBA transparan seukuran kanvas
 * (tanpa menulis berkas). Gaya "berita" → paragraf lower-third, "kategori"
 * → badge; selain itu teks biasa.
 */
export function renderLapisanTeks(teks: LapisanTeks, isi: string, lebar: number, tinggi: number): GambarRgba {
  const gaya = String(atau((teks as Record<string, unknown>).style, "")).toLowerCase();
  if (gaya === "berita") return renderBerita(teks, isi, lebar, tinggi);
  if (gaya === "kategori") return renderKategori(teks, isi, lebar, tinggi);
  return renderBiasa(teks, isi, lebar, tinggi);
}

/**
 * Render satu lapisan teks jadi PNG transparan seukuran kanvas di `tujuan`,
 * lalu kembalikan `tujuan` (_gambar_teks). Teks digambar sendiri (bukan
 * filter drawtext) karena banyak build ffmpeg tanpa libfreetype.
 */
export async function gambarTeks(teks: LapisanTeks, isi: string, lebar: number, tinggi: number, tujuan: string): Promise<string> {
  await simpanPng(renderLapisanTeks(teks, isi, lebar, tinggi), tujuan);
  return tujuan;
}
