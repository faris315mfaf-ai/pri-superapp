// ============================================================
// STUDIO TEMPLATE (16 Okt 2026) — model MURNI, dipakai bersama mesin
// (server/studio.ts) dan editor di peramban (features/tvr-ku/studio).
// Tanpa impor node: hanya zod.
//
// Studio menata lapisan template TVR Saya secara visual: kotak berita (+ area
// tulisan), kotak kategori, logo, footer, boom like share, pernak-pernik
// (gambar), dan outro. Hasilnya diterjemahkan ke template.json biasa
// (overlays + texts) yang dirender perintah.ts — perender yang sama dengan
// editor 4-slot, jadi hasil Studio dan editor lama tetap satu mesin.
//
// WAKTU: tiap ujung dipatok ke AWAL atau AKHIR video sumber ("5 dtk dari awal",
// "3 dtk sebelum akhir"), karena panjang video berita selalu berbeda.
// ============================================================

import { z } from "zod";

export const LEBAR_KANVAS = 720;
export const TINGGI_KANVAS = 1280;
export const MAKS_ELEMEN = 12;
export const MAKS_PERNAK = 6;
export const DURASI_MIN = 0.5;
/** Batas patokan detik (video sumber maksimal 180 dtk). */
export const MAKS_DETIK = 600;
export const OUTRO_MIN = 1;

// Susunan tulisan PERSIS template GODAM (kanvas 720x1280) — sumber tunggal, dipakai juga tvr.ts.
export const TEKS_HOOK = {
  name: "hook", style: "berita", align: "justify", size: 38, min_size: 22,
  max_lines: 4, x: 38, y: 783, width: 660, line_height: 1.15,
  color: "black", kicker_color: "#d32d27", start: 0, end: 3,
};
export const TEKS_KATEGORI = { name: "kategori", style: "kategori", source: "kategori", color: "white", start: 0, end: 3 };
export const TEKS_SUMBER = {
  name: "sumber", size: 10, x: null, y: 1253, align: "right",
  color: "white", stroke: 1, stroke_color: "black",
};
export const PILIHAN_RATA = ["justify", "left", "center", "right"] as const;

export type JenisElemen = "berita" | "kategori" | "logo" | "footer" | "boom" | "pernak";
export const JENIS_TUNGGAL: readonly JenisElemen[] = ["berita", "kategori", "logo", "footer", "boom"];
export const NAMA_JENIS: Record<JenisElemen, string> = {
  berita: "Kotak berita",
  kategori: "Kotak kategori",
  logo: "Logo",
  footer: "Footer",
  boom: "Boom like share",
  pernak: "Pernak-pernik",
};
/** Warna lajur timeline / penanda tiap jenis (editor). */
export const WARNA_JENIS: Record<JenisElemen, string> = {
  berita: "#b91c1c",
  kategori: "#c2410c",
  logo: "#b45309",
  footer: "#0369a1",
  boom: "#047857",
  pernak: "#be185d",
};

const Rect = z.object({
  x: z.number().int().min(-LEBAR_KANVAS).max(LEBAR_KANVAS * 2),
  y: z.number().int().min(-TINGGI_KANVAS).max(TINGGI_KANVAS * 2),
  w: z.number().int().min(8).max(LEBAR_KANVAS * 3),
  h: z.number().int().min(8).max(TINGGI_KANVAS * 3),
});
export type Rect = z.infer<typeof Rect>;

const Patok = z.object({ dari: z.enum(["awal", "akhir"]), d: z.number().min(0).max(MAKS_DETIK) });
export type Patok = z.infer<typeof Patok>;
const Waktu = z.object({ mulai: Patok, selesai: Patok });
export type Waktu = z.infer<typeof Waktu>;

/** Rujukan aset relatif ke folder template: "assets/studio/abc.png" atau berkas editor lama "assets/kotak.png". */
export const POLA_ASET = /^assets\/(studio\/)?[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/;
const Aset = z.string().regex(POLA_ASET).refine((s) => !s.includes(".."), "rujukan aset tidak sah");

export const Elemen = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
  jenis: z.enum(["berita", "kategori", "logo", "footer", "boom", "pernak"]),
  nama: z.string().max(40).default(""),
  file: Aset.nullable().default(null),
  rect: Rect,
  waktu: Waktu,
  opacity: z.number().min(0.1).max(1).default(1),
  tersembunyi: z.boolean().default(false),
  /** Kotak berita: area tulisan berita (wajib untuk jenis berita). */
  teks: Rect.nullable().default(null),
  /** Boom: video berlatar hijau dibuang hijaunya saat render. */
  kunci_hijau: z.boolean().default(false),
});
export type ElemenStudio = z.infer<typeof Elemen>;

export const DokStudio = z.object({
  v: z.literal(1),
  /** Urut bawah -> atas. Tulisan berita & kategori selalu digambar paling depan. */
  elemen: z.array(Elemen).min(1).max(MAKS_ELEMEN),
  outro: z.object({ file: Aset.nullable().default(null), durasi: z.number().min(OUTRO_MIN).max(120).nullable().default(null) }),
  teks_warna: z.enum(["white", "black"]).default("white"),
  rata: z.enum(PILIHAN_RATA).default("justify"),
});
export type DokStudio = z.infer<typeof DokStudio>;

// ---------- waktu ----------

/** Detik efektif sebuah patokan pada video sepanjang `durasi`. */
export const detikEfektif = (p: Patok, durasi: number) => (p.dari === "awal" ? p.d : durasi - p.d);

/** Rentang tampil pada video sepanjang `durasi`; null = tidak tampil (terlalu pendek). */
export function rentangTampil(w: Waktu, durasi: number): { mulai: number; selesai: number } | null {
  const mulai = Math.max(0, detikEfektif(w.mulai, durasi));
  const selesai = Math.min(durasi, detikEfektif(w.selesai, durasi));
  return selesai - mulai >= DURASI_MIN - 1e-9 ? { mulai, selesai } : null;
}

/** Patokan dari detik efektif: paruh awal -> dari awal, paruh akhir -> sebelum akhir, mentok akhir -> akhir video. */
export function patokDari(t: number, durasi: number): Patok {
  const b = (x: number) => Math.round(Math.max(0, x) * 10) / 10;
  if (t >= durasi - 0.05) return { dari: "akhir", d: 0 };
  return t < durasi / 2 ? { dari: "awal", d: b(t) } : { dari: "akhir", d: b(durasi - t) };
}

export const SEPANJANG: Waktu = { mulai: { dari: "awal", d: 0 }, selesai: { dari: "akhir", d: 0 } };
export const TIGA_DETIK_AWAL: Waktu = { mulai: { dari: "awal", d: 0 }, selesai: { dari: "awal", d: 3 } };

/** Teks patokan untuk layar. */
export function teksPatok(p: Patok): string {
  const d = `${p.d.toFixed(1).replace(".", ",")} dtk`;
  if (p.dari === "awal") return p.d === 0 ? "awal video" : `${d} dari awal`;
  return p.d === 0 ? "akhir video" : `${d} sblm akhir`;
}

// ---------- validasi aturan ----------

/** Pesan galat aturan dokumen (di luar skema), atau null bila sah. */
export function periksaAturan(dok: DokStudio): string | null {
  const ids = new Set<string>();
  const hitung: Partial<Record<JenisElemen, number>> = {};
  for (const e of dok.elemen) {
    if (ids.has(e.id)) return "Ada dua elemen dengan nama sama.";
    ids.add(e.id);
    hitung[e.jenis] = (hitung[e.jenis] ?? 0) + 1;
    if (e.jenis === "berita" && !e.teks) return "Area tulisan berita belum ditentukan.";
    if (e.jenis !== "kategori" && e.jenis !== "berita" && !e.file) return `${e.nama || NAMA_JENIS[e.jenis]}: berkas gambarnya belum dipilih.`;
    if (e.waktu.mulai.dari === e.waktu.selesai.dari) {
      const panjang = e.waktu.mulai.dari === "awal" ? e.waktu.selesai.d - e.waktu.mulai.d : e.waktu.mulai.d - e.waktu.selesai.d;
      if (panjang < DURASI_MIN - 1e-9) return `${e.nama || NAMA_JENIS[e.jenis]}: waktu tampil minimal ${DURASI_MIN} detik.`;
    }
  }
  for (const j of JENIS_TUNGGAL) if ((hitung[j] ?? 0) > 1) return `${NAMA_JENIS[j]} hanya boleh satu.`;
  if ((hitung.berita ?? 0) !== 1) return "Template wajib punya satu kotak berita.";
  if ((hitung.pernak ?? 0) > MAKS_PERNAK) return `Pernak-pernik maksimal ${MAKS_PERNAK}.`;
  return null;
}

// ---------- terjemahan ke template.json ----------

const AKHIRAN_BERGERAK = new Set([".gif", ".mov", ".mp4", ".webm", ".m4v"]);
const akhiran = (f: string) => {
  const i = f.lastIndexOf(".");
  return i >= 0 ? f.slice(i).toLowerCase() : "";
};
export const asetBergerak = (f: string | null | undefined) => Boolean(f) && AKHIRAN_BERGERAK.has(akhiran(String(f)));

/** Bidang waktu untuk overlay/teks. Sepanjang video = tanpa start/end (selalu tampil). */
export function bidangWaktu(w: Waktu): Record<string, unknown> {
  const sepanjang = w.mulai.dari === "awal" && w.mulai.d === 0 && w.selesai.dari === "akhir" && w.selesai.d === 0;
  if (sepanjang) return {};
  const hasil: Record<string, unknown> = { start: w.mulai.d };
  if (w.mulai.dari === "akhir") hasil.start_akhir = true;
  if (w.selesai.dari === "awal") hasil.end = w.selesai.d;
  else if (w.selesai.d > 0) {
    hasil.end = w.selesai.d;
    hasil.end_akhir = true;
  } else hasil.end = null;
  return hasil;
}

/** Bagian template.json yang ditentukan Studio. Bidang lain (nama, siap, ...) diisi pemanggil. */
export function templateDariStudio(dok: DokStudio, kategoriBawaan = ""): Record<string, unknown> {
  const tampil = dok.elemen.filter((e) => !e.tersembunyi);
  const overlays: Record<string, unknown>[] = [];
  for (const e of tampil) {
    if (!e.file || e.jenis === "kategori") continue;
    const ov: Record<string, unknown> = {
      label: e.nama || NAMA_JENIS[e.jenis],
      file: e.file,
      x: e.rect.x,
      y: e.rect.y,
      w: e.rect.w,
      h: e.rect.h,
      ...bidangWaktu(e.waktu),
    };
    if (asetBergerak(e.file)) ov.loop = true;
    if (e.jenis === "boom" && e.kunci_hijau) ov.kunci_hijau = true;
    if (e.opacity < 1) ov.opacity = Math.round(e.opacity * 100) / 100;
    overlays.push(ov);
  }
  const berita = tampil.find((e) => e.jenis === "berita") ?? null;
  const kategori = tampil.find((e) => e.jenis === "kategori") ?? null;
  const texts: Record<string, unknown>[] = [];
  if (berita) {
    const { start: _s, end: _e, ...hook } = TEKS_HOOK;
    texts.push({ ...hook, align: dok.rata, ...bidangWaktuTeks(berita.waktu) });
  }
  if (kategori) {
    const { start: _s, end: _e, ...kat } = TEKS_KATEGORI;
    texts.push({ ...kat, ...bidangWaktuTeks(kategori.waktu) });
  }
  texts.push({ ...TEKS_SUMBER });
  return {
    width: LEBAR_KANVAS,
    height: TINGGI_KANVAS,
    fps: 30,
    intro: null,
    outro: dok.outro.file,
    outro_durasi: dok.outro.file && dok.outro.durasi ? dok.outro.durasi : null,
    overlays,
    texts,
    text_box: berita?.teks ?? null,
    // Tanpa kotak kategori: badge tidak digambar (lapisan kategori juga tidak ada).
    badge_box: kategori ? kategori.rect : null,
    kategori: kategoriBawaan,
    teks_warna: dok.teks_warna,
    kunci_hijau: Boolean(tampil.find((e) => e.jenis === "boom")?.kunci_hijau),
    studio: dok,
  };
}

/** Teks: start/end selalu tertulis (perender lama memakai start/end teks apa adanya). */
function bidangWaktuTeks(w: Waktu): Record<string, unknown> {
  const b = bidangWaktu(w);
  if (!("start" in b)) return { start: null, end: null };
  return b;
}

// ---------- dari template editor lama (4 slot) ----------

export type UkuranAset = Record<string, { w: number; h: number } | undefined>;

/** Area tulisan bawaan GODAM bila template belum punya text_box. */
export const AREA_TEKS_BAWAAN: Rect = { x: 38, y: 760, w: 660, h: 190 };

/** Tinggi gambar selebar kanvas mengikuti rasio berkasnya. */
function tinggiPenuh(file: string | null | undefined, ukuran: UkuranAset, cadangan: number): number {
  const u = file ? ukuran[file] : undefined;
  return u && u.w > 0 ? Math.max(8, Math.round((LEBAR_KANVAS * u.h) / u.w)) : cadangan;
}

/**
 * Dokumen Studio dari template yang ada: `studio` tersimpan bila sah, selain itu diterjemahkan dari
 * susunan editor 4-slot (kotak monas = kotak berita, bingkai = footer, boom, penutup = outro).
 * `badgeBawaan` = kotakKategoriBawaan(text_box) dari server (perlu teks.ts).
 */
export function studioDariTemplate(t: Record<string, unknown> | null, ukuran: UkuranAset, badgeBawaan: Rect | null): DokStudio {
  const tersimpan = DokStudio.safeParse(t?.studio);
  if (tersimpan.success && !periksaAturan(tersimpan.data)) return tersimpan.data;
  const overlays = (Array.isArray(t?.overlays) ? t.overlays : []) as Record<string, unknown>[];
  const cari = (label: string) => overlays.find((o) => o.label === label && o.file) ?? null;
  const kotak = cari("kotak monas");
  const boom = cari("boom like share");
  const bingkai = cari("bingkai teratas");
  const teks = (t?.text_box as Rect | null | undefined) ?? null;
  const areaTeks = teks && teks.w > 0 && teks.h > 0 ? { x: teks.x, y: teks.y, w: teks.w, h: teks.h } : AREA_TEKS_BAWAAN;
  const elemen: ElemenStudio[] = [];
  const dasar = { nama: "", opacity: 1, tersembunyi: false, teks: null, kunci_hijau: false };
  if (kotak) {
    const h = tinggiPenuh(String(kotak.file), ukuran, 420);
    elemen.push({ ...dasar, id: "berita", jenis: "berita", file: String(kotak.file), rect: { x: 0, y: TINGGI_KANVAS - h, w: LEBAR_KANVAS, h }, waktu: TIGA_DETIK_AWAL, teks: areaTeks });
  } else {
    elemen.push({ ...dasar, id: "berita", jenis: "berita", file: null, rect: { ...areaTeks }, waktu: TIGA_DETIK_AWAL, teks: areaTeks });
  }
  const badge = (t?.badge_box as Rect | null | undefined) ?? badgeBawaan;
  if (badge) elemen.push({ ...dasar, id: "kategori", jenis: "kategori", rect: { x: badge.x, y: badge.y, w: badge.w, h: badge.h }, waktu: TIGA_DETIK_AWAL, file: null });
  if (boom) {
    elemen.push({ ...dasar, id: "boom", jenis: "boom", file: String(boom.file), rect: { x: 45, y: 55, w: 280, h: 158 }, waktu: SEPANJANG, kunci_hijau: Boolean(t?.kunci_hijau) });
  }
  if (bingkai) {
    const h = tinggiPenuh(String(bingkai.file), ukuran, 1280);
    elemen.push({ ...dasar, id: "footer", jenis: "footer", file: String(bingkai.file), rect: { x: 0, y: TINGGI_KANVAS - h, w: LEBAR_KANVAS, h }, waktu: SEPANJANG });
  }
  const rata = PILIHAN_RATA.find((r) => (Array.isArray(t?.texts) ? (t.texts as Record<string, unknown>[]) : []).some((x) => x.style === "berita" && x.align === r)) ?? "justify";
  return {
    v: 1,
    elemen,
    outro: { file: typeof t?.outro === "string" && POLA_ASET.test(t.outro) ? t.outro : null, durasi: null },
    teks_warna: t?.teks_warna === "black" ? "black" : "white",
    rata,
  };
}

/** id baru untuk pernak-pernik (unik di dokumen). */
export function idPernakBaru(dok: DokStudio): string {
  for (let n = 1; n < 100; n++) {
    const id = `pernak-${n}`;
    if (!dok.elemen.some((e) => e.id === id)) return id;
  }
  return `pernak-${Date.now() % 100000}`;
}

/** Semua rujukan aset yang dipakai dokumen (untuk penyapuan berkas studio yatim). */
export function asetDokumen(dok: DokStudio): Set<string> {
  const s = new Set<string>();
  for (const e of dok.elemen) if (e.file) s.add(e.file);
  if (dok.outro.file) s.add(dok.outro.file);
  return s;
}
