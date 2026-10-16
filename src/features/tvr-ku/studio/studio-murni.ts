// ============================================================
// STUDIO TEMPLATE — logika MURNI editor (16 Okt 2026): geser & ubah ukuran
// elemen di kanvas dengan tempel ke garis bantu, seret batang timeline,
// elemen baru dari berkas, dan riwayat urungkan/ulangi. Tanpa React/DOM;
// diuji di tests/uji-studio-template.mts.
// ============================================================

import {
  DURASI_MIN,
  LEBAR_KANVAS,
  SEPANJANG,
  TIGA_DETIK_AWAL,
  TINGGI_KANVAS,
  NAMA_JENIS,
  detikEfektif,
  idPernakBaru,
  patokDari,
  type DokStudio,
  type ElemenStudio,
  type JenisElemen,
  type Rect,
  type Waktu,
} from "@/mesin-video/studio-model";

export type Garis = { arah: "v" | "h"; pos: number };
export type Pegangan = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
export const PEGANGAN_SUDUT: readonly Pegangan[] = ["nw", "ne", "sw", "se"];
export const PEGANGAN_SISI: readonly Pegangan[] = ["n", "s", "e", "w"];
export const UKURAN_MIN = 16;

// Batas skema `Rect` di studio-model.ts (z.object tidak diekspor — dicerminkan di sini; ubah bersama).
// Rect di luar batas ini ditolak server (422) saat menyimpan.
export const BATAS_RECT = {
  xMin: -LEBAR_KANVAS,
  xMaks: LEBAR_KANVAS * 2,
  yMin: -TINGGI_KANVAS,
  yMaks: TINGGI_KANVAS * 2,
  ukuranMin: 8,
  wMaks: LEBAR_KANVAS * 3,
  hMaks: TINGGI_KANVAS * 3,
} as const;

const jepit = (v: number, min: number, maks: number) => Math.min(maks, Math.max(min, Math.round(Number.isFinite(v) ? v : 0)));

/** Jepit rect ke batas yang diterima skema server (bilangan bulat, posisi & ukuran dalam rentang). */
export function jepitRect(r: Rect): Rect {
  const b = BATAS_RECT;
  return {
    x: jepit(r.x, b.xMin, b.xMaks),
    y: jepit(r.y, b.yMin, b.yMaks),
    w: jepit(r.w, b.ukuranMin, b.wMaks),
    h: jepit(r.h, b.ukuranMin, b.hMaks),
  };
}

// ---------- kanvas: tempel ke garis bantu ----------

/** Titik tempel tetap kanvas: tepi & tengah. */
export const GARIS_KANVAS = {
  v: [0, LEBAR_KANVAS / 2, LEBAR_KANVAS],
  h: [0, TINGGI_KANVAS / 2, TINGGI_KANVAS],
};

/** Titik tempel dari elemen lain (tepi & tengah). */
export function garisDari(rects: readonly Rect[]): { v: number[]; h: number[] } {
  const v = [...GARIS_KANVAS.v];
  const h = [...GARIS_KANVAS.h];
  for (const r of rects) {
    v.push(r.x, r.x + r.w / 2, r.x + r.w);
    h.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  return { v, h };
}

/** Geser terdekat (dalam ambang) supaya salah satu `tepi` jatuh di salah satu `garis`; 0 = tidak menempel. */
function selisihTempel(tepi: readonly number[], garis: readonly number[], ambang: number): { geser: number; pos: number | null } {
  let terbaik: { geser: number; pos: number | null } = { geser: 0, pos: null };
  let jarak = ambang + 1e-9;
  for (const t of tepi) {
    for (const g of garis) {
      const d = g - t;
      if (Math.abs(d) < jarak) {
        jarak = Math.abs(d);
        terbaik = { geser: d, pos: g };
      }
    }
  }
  return terbaik;
}

/** Geser rect sejauh (dx, dy) lalu tempelkan ke garis terdekat. Mengembalikan rect baru + garis yang aktif. */
export function geserRect(awal: Rect, dx: number, dy: number, garis: { v: number[]; h: number[] }, ambang: number): { rect: Rect; garis: Garis[] } {
  const x = awal.x + dx;
  const y = awal.y + dy;
  const tx = selisihTempel([x, x + awal.w / 2, x + awal.w], garis.v, ambang);
  const ty = selisihTempel([y, y + awal.h / 2, y + awal.h], garis.h, ambang);
  const aktif: Garis[] = [];
  if (tx.pos !== null) aktif.push({ arah: "v", pos: tx.pos });
  if (ty.pos !== null) aktif.push({ arah: "h", pos: ty.pos });
  return { rect: jepitRect({ ...awal, x: x + tx.geser, y: y + ty.geser }), garis: aktif };
}

/**
 * Ubah ukuran lewat satu pegangan. `rasio` (w/h) dikunci untuk pegangan sudut bila diberikan.
 * Sisi yang ditarik menempel ke garis bantu.
 */
export function ubahUkuran(
  awal: Rect,
  pegangan: Pegangan,
  dx: number,
  dy: number,
  rasio: number | null,
  garis: { v: number[]; h: number[] },
  ambang: number,
): { rect: Rect; garis: Garis[] } {
  let kiri = awal.x;
  let atas = awal.y;
  let kanan = awal.x + awal.w;
  let bawah = awal.y + awal.h;
  const aktif: Garis[] = [];
  const tempelSatu = (nilai: number, daftar: number[], arah: "v" | "h") => {
    const t = selisihTempel([nilai], daftar, ambang);
    if (t.pos !== null) aktif.push({ arah, pos: t.pos });
    return nilai + t.geser;
  };
  if (pegangan.includes("w")) kiri = Math.min(kanan - UKURAN_MIN, tempelSatu(kiri + dx, garis.v, "v"));
  if (pegangan.includes("e")) kanan = Math.max(kiri + UKURAN_MIN, tempelSatu(kanan + dx, garis.v, "v"));
  if (pegangan.includes("n")) atas = Math.min(bawah - UKURAN_MIN, tempelSatu(atas + dy, garis.h, "h"));
  if (pegangan.includes("s")) bawah = Math.max(atas + UKURAN_MIN, tempelSatu(bawah + dy, garis.h, "h"));
  let w = kanan - kiri;
  let h = bawah - atas;
  if (rasio && rasio > 0 && pegangan.length === 2) {
    // Sudut: ukuran mengikuti sisi yang paling banyak berubah, rasio tetap; sudut seberang diam.
    if (Math.abs(w - awal.w) / awal.w >= Math.abs(h - awal.h) / awal.h) h = w / rasio;
    else w = h * rasio;
    w = Math.max(UKURAN_MIN, w);
    h = Math.max(UKURAN_MIN, h);
    if (pegangan.includes("w")) kiri = kanan - w;
    if (pegangan.includes("n")) atas = bawah - h;
    aktif.length = 0;
  }
  return { rect: jepitRect({ x: kiri, y: atas, w, h }), garis: aktif };
}

/** Rata cepat terhadap kanvas. */
export function rataKanvas(r: Rect, posisi: "kiri" | "tengah-h" | "kanan" | "atas" | "tengah-v" | "bawah"): Rect {
  switch (posisi) {
    case "kiri": return { ...r, x: 0 };
    case "tengah-h": return { ...r, x: Math.round((LEBAR_KANVAS - r.w) / 2) };
    case "kanan": return { ...r, x: LEBAR_KANVAS - r.w };
    case "atas": return { ...r, y: 0 };
    case "tengah-v": return { ...r, y: Math.round((TINGGI_KANVAS - r.h) / 2) };
    case "bawah": return { ...r, y: TINGGI_KANVAS - r.h };
  }
}

/**
 * Tinggi baru (berkas diganti / latar dihapus) dengan lebar tetap. Elemen yang menempel ke dasar kanvas
 * tetap menempel ke dasar, yang menempel ke atas tetap di atas, selain itu titik tengahnya diam.
 */
export function sesuaikanTinggi(r: Rect, hBaru: number): Rect {
  const h = Math.min(BATAS_RECT.hMaks, Math.max(UKURAN_MIN, Math.round(hBaru)));
  if (r.y + r.h >= TINGGI_KANVAS - 1) return jepitRect({ ...r, y: TINGGI_KANVAS - h, h });
  if (r.y <= 0) return jepitRect({ ...r, h });
  return jepitRect({ ...r, y: r.y + r.h / 2 - h / 2, h });
}

/** Area tulisan berita dijaga tetap di dalam kanvas. */
export function jepitKanvas(r: Rect): Rect {
  const w = Math.min(LEBAR_KANVAS, Math.max(UKURAN_MIN, r.w));
  const h = Math.min(TINGGI_KANVAS, Math.max(UKURAN_MIN, r.h));
  return { w, h, x: Math.min(LEBAR_KANVAS - w, Math.max(0, r.x)), y: Math.min(TINGGI_KANVAS - h, Math.max(0, r.y)) };
}

// ---------- timeline ----------

export type ModeSeretWaktu = "kiri" | "kanan" | "tengah";

/** Tempel detik ke titik terdekat (dalam ambang detik), selain itu kelipatan 0,5 bila dekat, selain itu 0,1. */
export function tempelDetik(t: number, titik: readonly number[], ambang: number, bebas: boolean): number {
  if (bebas) return Math.round(t * 10) / 10;
  let terbaik: number | null = null;
  let jarak = ambang;
  for (const p of titik) {
    const d = Math.abs(p - t);
    if (d < jarak) {
      jarak = d;
      terbaik = p;
    }
  }
  if (terbaik !== null) return terbaik;
  const setengah = Math.round(t * 2) / 2;
  if (Math.abs(setengah - t) < ambang * 0.6) return setengah;
  return Math.round(t * 10) / 10;
}

/**
 * Seret batang timeline: ujung kiri/kanan (ubah durasi) atau tengah (geser, durasi tetap). Ujung yang
 * diseret dipatok ulang (paruh awal = dari awal, paruh akhir = sebelum akhir, mentok = akhir video);
 * ujung yang tidak disentuh mempertahankan patokannya (seret satu ujung tidak memindah patokan ujung lain).
 */
export function seretWaktu(
  awal: Waktu,
  mode: ModeSeretWaktu,
  dt: number,
  durasi: number,
  titik: readonly number[],
  ambang: number,
  bebas: boolean,
): Waktu {
  const m0 = Math.max(0, Math.min(durasi, detikEfektif(awal.mulai, durasi)));
  const s0 = Math.max(0, Math.min(durasi, detikEfektif(awal.selesai, durasi)));
  let m = m0;
  let s = s0;
  if (mode === "kiri") m = Math.max(0, Math.min(s0 - DURASI_MIN, tempelDetik(m0 + dt, titik, ambang, bebas)));
  if (mode === "kanan") s = Math.min(durasi, Math.max(m0 + DURASI_MIN, tempelDetik(s0 + dt, titik, ambang, bebas)));
  if (mode === "tengah") {
    const panjang = s0 - m0;
    const mentah = Math.max(0, Math.min(durasi - panjang, m0 + dt));
    const tm = tempelDetik(mentah, titik, ambang, bebas);
    const ts = tempelDetik(mentah + panjang, titik, ambang, bebas) - panjang;
    m = Math.max(0, Math.min(durasi - panjang, Math.abs(tm - mentah) <= Math.abs(ts - mentah) ? tm : ts));
    s = m + panjang;
  }
  const patokMulai = () => (m <= 0.05 ? { dari: "awal" as const, d: 0 } : patokDari(m, durasi));
  if (mode === "kiri") return { mulai: patokMulai(), selesai: awal.selesai };
  if (mode === "kanan") return { mulai: awal.mulai, selesai: patokDari(s, durasi) };
  return { mulai: patokMulai(), selesai: patokDari(s, durasi) };
}

/** Titik tempel timeline: awal/akhir video, garis putar, ujung elemen lain. */
export function titikTimeline(dok: DokStudio, kecuali: string | null, durasi: number, putar: number): number[] {
  const titik = [0, durasi, putar];
  for (const e of dok.elemen) {
    if (e.id === kecuali) continue;
    titik.push(detikEfektif(e.waktu.mulai, durasi), detikEfektif(e.waktu.selesai, durasi));
  }
  return titik;
}

/** Ganti patokan satu ujung (awal <-> akhir) dengan detik efektif yang sama. */
export function balikPatok(w: Waktu, ujung: "mulai" | "selesai", durasi: number): Waktu {
  const p = w[ujung];
  const t = detikEfektif(p, durasi);
  const b = (x: number) => Math.round(Math.max(0, x) * 10) / 10;
  const baru = p.dari === "awal" ? { dari: "akhir" as const, d: b(durasi - t) } : { dari: "awal" as const, d: b(t) };
  return { ...w, [ujung]: baru };
}

export const PRESET_WAKTU: readonly { kunci: string; label: string; waktu: Waktu }[] = [
  { kunci: "sepanjang", label: "Sepanjang video", waktu: SEPANJANG },
  { kunci: "awal3", label: "3 detik pertama", waktu: TIGA_DETIK_AWAL },
  { kunci: "akhir5", label: "5 detik terakhir", waktu: { mulai: { dari: "akhir", d: 5 }, selesai: { dari: "akhir", d: 0 } } },
];

// ---------- elemen baru ----------

export type UkuranBerkas = { w: number; h: number };

/** Kotak muat dalam lebar/tinggi maksimum dengan rasio berkas. */
function muat(u: UkuranBerkas | null, maksW: number, maksH: number): { w: number; h: number } {
  if (!u || u.w <= 0 || u.h <= 0) return { w: maksW, h: Math.min(maksH, maksW) };
  const s = Math.min(maksW / u.w, maksH / u.h);
  return { w: Math.max(UKURAN_MIN, Math.round(u.w * s)), h: Math.max(UKURAN_MIN, Math.round(u.h * s)) };
}

/** Elemen baru untuk jenis & berkas ini, ditaruh di tempat yang lazim. */
export function elemenBaru(dok: DokStudio, jenis: JenisElemen, file: string | null, ukuran: UkuranBerkas | null): ElemenStudio {
  const dasar = { nama: "", file, opacity: 1, tersembunyi: false, teks: null, kunci_hijau: false };
  const id = jenis === "pernak" ? idPernakBaru(dok) : jenis;
  switch (jenis) {
    case "logo": {
      const u = muat(ukuran, 150, 150);
      return { ...dasar, id, jenis, rect: { x: LEBAR_KANVAS - u.w - 24, y: 24, ...u }, waktu: SEPANJANG };
    }
    case "footer": {
      // Selebar kanvas, menempel ke dasar; tinggi ikut rasio berkas (maks 400 px).
      const h = Math.min(400, Math.max(UKURAN_MIN, ukuran && ukuran.w > 0 ? Math.round((LEBAR_KANVAS * ukuran.h) / ukuran.w) : 60));
      return { ...dasar, id, jenis, rect: { x: 0, y: TINGGI_KANVAS - h, w: LEBAR_KANVAS, h }, waktu: SEPANJANG };
    }
    case "boom": {
      const u = muat(ukuran, 280, 158);
      return { ...dasar, id, jenis, rect: { x: 45, y: 55, ...u }, waktu: SEPANJANG };
    }
    case "kategori":
      return { ...dasar, id, jenis, file: null, rect: { x: 44, y: 700, w: 270, h: 56 }, waktu: TIGA_DETIK_AWAL };
    case "berita": {
      const teks = { x: 38, y: 760, w: 660, h: 190 };
      const u = file ? muat(ukuran, LEBAR_KANVAS, 600) : { w: 680, h: 230 };
      const rect = file ? { x: 0, y: TINGGI_KANVAS - u.h, w: u.w, h: u.h } : { x: 20, y: 740, ...u };
      return { ...dasar, id, jenis, rect, waktu: TIGA_DETIK_AWAL, teks };
    }
    case "pernak": {
      const u = muat(ukuran, 220, 220);
      return { ...dasar, id, jenis, rect: { x: Math.round((LEBAR_KANVAS - u.w) / 2), y: 320, ...u }, waktu: SEPANJANG };
    }
  }
}

/** Nama tampil elemen. */
export const namaElemen = (e: ElemenStudio) => e.nama || (e.jenis === "pernak" ? `${NAMA_JENIS.pernak} ${e.id.replace("pernak-", "")}` : NAMA_JENIS[e.jenis]);

/** Pindah elemen satu langkah ke depan (+1) / belakang (-1) di urutan gambar. */
export function pindahUrutan(dok: DokStudio, id: string, arah: 1 | -1): DokStudio {
  const i = dok.elemen.findIndex((e) => e.id === id);
  const j = i + arah;
  if (i < 0 || j < 0 || j >= dok.elemen.length) return dok;
  const elemen = [...dok.elemen];
  [elemen[i], elemen[j]] = [elemen[j]!, elemen[i]!];
  return { ...dok, elemen };
}

export function ubahElemen(dok: DokStudio, id: string, ubah: (e: ElemenStudio) => ElemenStudio): DokStudio {
  return { ...dok, elemen: dok.elemen.map((e) => (e.id === id ? ubah(e) : e)) };
}

// ---------- riwayat ----------

export type Riwayat = { lalu: string[]; nanti: string[] };
export const MAKS_RIWAYAT = 60;

/**
 * Simpan keadaan sebelum perubahan (dokumen atau JSON-nya) — perubahan berturut-turut yang sama tidak menumpuk.
 * Panggil HANYA bila dokumen benar-benar berubah (lihat `perluCatat`): mencatat mengosongkan tumpukan ulangi.
 */
export function catatRiwayat(r: Riwayat, sebelum: DokStudio | string): Riwayat {
  const j = typeof sebelum === "string" ? sebelum : JSON.stringify(sebelum);
  if (r.lalu[r.lalu.length - 1] === j) return r;
  return { lalu: [...r.lalu, j].slice(-MAKS_RIWAYAT), nanti: [] };
}

/**
 * Riwayat malas: `tunda` = JSON keadaan saat gerakan/ketikan dimulai (pointerdown, fokus). Baru dicatat bila
 * dokumen hasil perubahan berbeda darinya — klik/fokus tanpa perubahan tidak menambah langkah urungkan dan
 * tidak membuang tumpukan ulangi.
 */
export const perluCatat = (tunda: string | null, baru: DokStudio): tunda is string => tunda !== null && JSON.stringify(baru) !== tunda;

export function urungkan(r: Riwayat, kini: DokStudio): { riwayat: Riwayat; dok: DokStudio } | null {
  const j = r.lalu[r.lalu.length - 1];
  if (!j) return null;
  return { riwayat: { lalu: r.lalu.slice(0, -1), nanti: [...r.nanti, JSON.stringify(kini)] }, dok: JSON.parse(j) as DokStudio };
}

export function ulangi(r: Riwayat, kini: DokStudio): { riwayat: Riwayat; dok: DokStudio } | null {
  const j = r.nanti[r.nanti.length - 1];
  if (!j) return null;
  return { riwayat: { lalu: [...r.lalu, JSON.stringify(kini)], nanti: r.nanti.slice(0, -1) }, dok: JSON.parse(j) as DokStudio };
}

// ---------- format ----------

export function fmtDetik(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1).padStart(4, "0").replace(".", ",");
  return `${m}:${s}`;
}
export const fmtDurasi = (x: number) => `${x.toFixed(1).replace(".", ",")} dtk`;
