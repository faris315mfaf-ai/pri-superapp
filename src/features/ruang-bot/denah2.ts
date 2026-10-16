// ============================================================
// DENAH v2 RUANG BOT — satu gedung 40×20 tile dari 8 modul ruang pixel art
// (public/ruang/v1, tile 64×32). Logika murni (tanpa DOM). Tahap 2 langkah 1, 16 Okt 2026.
//
//            x: 0 ──── 10 ──── 20 ──── 30 ──── 40
//   y: 0       │ KERJA  │(kosong)│MEETING │  AULA  │   ← baris belakang: dinding luar & hiasan utuh
//   y: 3       │        │KOORDI- │        │        │
//   y: 10      ├────────┼─NATOR──┼────────┼────────┤
//              │ISTIRA- │DATABASE│  ALAT  │  POS   │   ← baris depan
//   y: 20      │ HAT    │        │        │        │
//
// Sisi gedung bot (kerja, koordinator, meeting, istirahat) dan sayap anggota
// (aula, pos, alat, database) TIDAK tersambung — sama seperti denah lama.
// Pintu = celah pada sekat. Jalan dicari otomatis (A* 8 arah di grid tile +
// perapian garis pandang), tidak lagi ditulis tangan.
//
// Koordinat dunia: tile (i, j) menempati [i, i+1) × [j, j+1); titik pecahan.
// Proyeksi layar (penggambar): sx = (x − y) · 32, sy = (x + y) · 16.
// Arah hadap 4 (kit): SE = +x, SW = +y, NE = −y, NW = −x.
// ============================================================

import type { Sekat, Titik } from "./denah";
import { segmenMenembus } from "./denah";

export type { Titik };
export type ArahHadap = "NW" | "NE" | "SE" | "SW";

export const LEBAR_DUNIA = 40;
export const DALAM_DUNIA = 20;

// ---------- ruang ----------

export type KunciRuang2 = "kerja" | "koordinator" | "meeting" | "aula" | "istirahat" | "database" | "alat" | "pos";

export type Ruang2 = {
  kunci: KunciRuang2;
  nama: string;
  /** Pojok belakang (min x, min y) & ukuran dalam tile. */
  x: number;
  y: number;
  w: number;
  d: number;
  /** Berkas modul di public/ruang/v1 (manifest.ruang[modul]). */
  modul: string;
  /** Dinding modul yang diturunkan jadi sekat rendah (bukan dinding luar gedung). */
  potongKiri: boolean;
  potongKanan: boolean;
  warna: string;
  sisi: "bot" | "anggota";
};

export const RUANG2: readonly Ruang2[] = [
  { kunci: "kerja", nama: "RUANG KERJA", x: 0, y: 0, w: 10, d: 10, modul: "kerja", potongKiri: false, potongKanan: false, warna: "#f59e0b", sisi: "bot" },
  { kunci: "koordinator", nama: "RUANG KOORDINATOR", x: 10, y: 3, w: 10, d: 7, modul: "koordinator", potongKiri: true, potongKanan: false, warna: "#38bdf8", sisi: "bot" },
  { kunci: "meeting", nama: "RUANG MEETING", x: 20, y: 0, w: 10, d: 10, modul: "meeting", potongKiri: true, potongKanan: false, warna: "#fb7185", sisi: "bot" },
  { kunci: "aula", nama: "AULA · ONLINE", x: 30, y: 0, w: 10, d: 10, modul: "aula", potongKiri: true, potongKanan: false, warna: "#22c55e", sisi: "anggota" },
  { kunci: "istirahat", nama: "RUANG ISTIRAHAT", x: 0, y: 10, w: 10, d: 10, modul: "istirahat", potongKiri: false, potongKanan: true, warna: "#94a3b8", sisi: "bot" },
  { kunci: "database", nama: "RUANG DATABASE", x: 10, y: 10, w: 10, d: 10, modul: "database", potongKiri: true, potongKanan: true, warna: "#a78bfa", sisi: "anggota" },
  { kunci: "alat", nama: "RUANG ALAT", x: 20, y: 10, w: 10, d: 10, modul: "alat", potongKiri: true, potongKanan: true, warna: "#34d399", sisi: "anggota" },
  { kunci: "pos", nama: "KOTAK POST", x: 30, y: 10, w: 10, d: 10, modul: "pos", potongKiri: true, potongKanan: true, warna: "#f97316", sisi: "anggota" },
];

export function ruangDi(x: number, y: number): Ruang2 | null {
  return RUANG2.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.d) ?? null;
}

// ---------- pintu & sekat ----------

/** Pintu: celah pada garis batas. sumbu "x" = garis x = pada (rentang y); "y" = garis y = pada (rentang x). */
export type Pintu2 = { sumbu: "x" | "y"; pada: number; dari: number; sampai: number; antara: [KunciRuang2, KunciRuang2] };

export const PINTU2: readonly Pintu2[] = [
  { sumbu: "x", pada: 10, dari: 6, sampai: 8, antara: ["kerja", "koordinator"] },
  { sumbu: "x", pada: 20, dari: 6, sampai: 8, antara: ["koordinator", "meeting"] },
  { sumbu: "y", pada: 10, dari: 3, sampai: 5, antara: ["kerja", "istirahat"] },
  { sumbu: "y", pada: 10, dari: 34, sampai: 36, antara: ["aula", "pos"] },
  { sumbu: "x", pada: 30, dari: 12, sampai: 14, antara: ["pos", "alat"] },
  { sumbu: "x", pada: 20, dari: 12, sampai: 14, antara: ["alat", "database"] },
];

/** Tempat penghuni muncul / pergi: pintu kaca di dinding belakang aula. */
export const PINTU_MASUK2: Titik = [38.8, 0.8];

/**
 * Garis batas yang TIDAK boleh dilintasi: semua tepi ruang kecuali celah pintu.
 * Dibangun dari tepi tiap tile ruang yang berbatasan dengan tile lain ruang / luar gedung.
 */
export type Batas2 = { sumbu: "x" | "y"; pada: number; dari: number; sampai: number; dalam: boolean };

function diPintu(sumbu: "x" | "y", pada: number, t: number): boolean {
  return PINTU2.some((p) => p.sumbu === sumbu && p.pada === pada && t > p.dari && t < p.sampai);
}

export const BATAS2: readonly Batas2[] = (() => {
  const hasil: Batas2[] = [];
  const kunci = (x: number, y: number) => ruangDi(x + 0.5, y + 0.5)?.kunci ?? null;
  // garis vertikal x = k (antara tile k-1 dan k), per ruas satu tile
  for (let k = 0; k <= LEBAR_DUNIA; k++) {
    for (let j = 0; j < DALAM_DUNIA; j++) {
      const a = k > 0 ? kunci(k - 1, j) : null;
      const b = k < LEBAR_DUNIA ? kunci(k, j) : null;
      if (a === b || diPintu("x", k, j + 0.5)) continue;
      hasil.push({ sumbu: "x", pada: k, dari: j, sampai: j + 1, dalam: a !== null && b !== null });
    }
  }
  for (let k = 0; k <= DALAM_DUNIA; k++) {
    for (let i = 0; i < LEBAR_DUNIA; i++) {
      const a = k > 0 ? kunci(i, k - 1) : null;
      const b = k < DALAM_DUNIA ? kunci(i, k) : null;
      if (a === b || diPintu("y", k, i + 0.5)) continue;
      hasil.push({ sumbu: "y", pada: k, dari: i, sampai: i + 1, dalam: a !== null && b !== null });
    }
  }
  return hasil;
})();

/**
 * Batas sebagai lempeng tipis (untuk segmenMenembus dari denah lama). Potongan
 * 1-tile yang bersambung digabung jadi satu ruas, dan tiap ruas dipanjangkan
 * 0,01 di kedua ujung: garis yang melintas tepat di sambungan / sudut tidak lolos.
 */
export const SEKAT2: readonly Sekat[] = (() => {
  const ruas: Batas2[] = [];
  const urut = [...BATAS2].sort((a, b) => (a.sumbu === b.sumbu ? a.pada - b.pada || a.dari - b.dari : a.sumbu < b.sumbu ? -1 : 1));
  for (const b of urut) {
    const akhir = ruas[ruas.length - 1];
    if (akhir && akhir.sumbu === b.sumbu && akhir.pada === b.pada && akhir.sampai === b.dari) akhir.sampai = b.sampai;
    else ruas.push({ ...b });
  }
  const E = 0.01;
  return ruas.map((b) =>
    b.sumbu === "x"
      ? { x: b.pada - E, y: b.dari - E, w: 2 * E, d: b.sampai - b.dari + 2 * E, buram: false }
      : { x: b.dari - E, y: b.pada - E, w: b.sampai - b.dari + 2 * E, d: 2 * E, buram: false },
  );
})();

// ---------- perabot ----------

export type Perabot2 = {
  /** id sprite di public/perabot/v1/manifest.json */
  sprite: string;
  /** Pojok belakang jejak (min x, min y). Jejak [a, b] diambil dari manifest. */
  x: number;
  y: number;
  /** Ukuran jejak (a sejajar sumbu x, b sejajar sumbu y) — harus sama dengan manifest. */
  tapak: [number, number];
  /** Kunci keadaan dinamis (frame dipilih penggambar dari data nyata), mis. "meja:cari", "rak:0". */
  kunci?: string;
  /** Tidak menghalangi jalan (karpet, kursi yang diduduki). */
  lewat?: boolean;
  /** Rata lantai: digambar paling dulu. */
  datar?: boolean;
};

const P = (sprite: string, x: number, y: number, tapak: [number, number], ext: Partial<Perabot2> = {}): Perabot2 => ({ sprite, x, y, tapak, ...ext });

/** Kursi / tempat duduk / tempat berdiri yang dipakai simulasi. */
export type Duduk2 = {
  titik: Titik;
  arah: ArahHadap;
  /** "duduk" di kursi/sofa, "kerja" di meja/mesin (pose ketik), "berdiri". */
  pose: "duduk" | "kerja" | "berdiri";
  /** true: karakter digambar DI DEPAN perabot tempat duduknya (sofa, kursi menghadap layar). */
  depanPerabot: boolean;
};

// Ruang kerja: 3 meja bot di dinding jendela (layar menghadap +x; operator di sisi +x menghadap NW).
const MEJA_BOT = { cari: 1.0, edit: 4.0, posting: 7.0 } as const;
export type MejaBot = keyof typeof MEJA_BOT;

export const STASIUN2: Record<MejaBot | "istirahat", Duduk2[]> = {
  cari: [{ titik: [1.95, MEJA_BOT.cari + 1], arah: "NW", pose: "kerja", depanPerabot: false }],
  edit: [{ titik: [1.95, MEJA_BOT.edit + 1], arah: "NW", pose: "kerja", depanPerabot: false }],
  posting: [{ titik: [1.95, MEJA_BOT.posting + 1], arah: "NW", pose: "kerja", depanPerabot: false }],
  // sofa menghadap +y di dinding papan tulis
  istirahat: [
    { titik: [5.0, 0.95], arah: "SW", pose: "duduk", depanPerabot: true },
    { titik: [6.0, 0.95], arah: "SW", pose: "duduk", depanPerabot: true },
  ],
};

/** Titik temu bot di tengah ruang kerja; semua jalan bot berangkat & kembali lewat sini. */
export const TITIK_TENGAH2: Titik = [5.5, 6.5];
export const TEMPAT_ANTRE2: Titik[] = [[4.6, 6.0], [6.4, 6.0], [5.5, 7.4]];

// Meeting: meja panjang, bot di sisi −x menghadap SE, Nara & tamu di sisi +x menghadap NW.
export const KURSI_RAPAT2: Duduk2[] = [3.5, 4.5, 5.5].map((y) => ({ titik: [23.45, y] as Titik, arah: "SE" as const, pose: "duduk" as const, depanPerabot: true }));
export const KURSI_NARA_RAPAT2: Duduk2 = { titik: [26.55, 4.5], arah: "NW", pose: "duduk", depanPerabot: false };
export const KURSI_TAMU_RAPAT2: Duduk2[] = [3.5, 5.5].map((y) => ({ titik: [26.55, y] as Titik, arah: "NW" as const, pose: "duduk" as const, depanPerabot: false }));

// Istirahat: kasur berkepala di dinding kiri. Bot berdiri di sisi kasur lalu "berbaring".
export const KASUR2: { asal: Titik; berdiri: Titik; baring: Titik }[] = [13.0, 15.0, 17.0].map((y) => ({
  asal: [0.1, y] as Titik,
  berdiri: [2.55, y + 0.5] as Titik,
  baring: [1.0, y + 0.5] as Titik,
}));

// Koordinator: Nara duduk di balik meja eksekutif menghadap SE; papan tugas = monitor di dinding belakang.
export const MEJA_KOORDINATOR2 = { asal: [16.0, 6.0] as Titik, kursi: { titik: [15.45, 7.0] as Titik, arah: "SE" as ArahHadap, pose: "kerja" as const, depanPerabot: true } };
export const PAPAN_TUGAS2: Duduk2 = { titik: [15.5, 3.9], arah: "NE", pose: "berdiri", depanPerabot: false };

// ---------- sayap anggota ----------

export type JenisStasiunPenghuni2 = "rak" | "autoedit" | "kompres" | "blur" | "kotak_post";
export type StasiunPenghuni2 = Duduk2 & { jenis: JenisStasiunPenghuni2; idx: number; kunciPerabot: string };

const RAK_Y = [11.0, 12.3, 13.6, 14.9, 16.2, 17.5];
const AUTOEDIT_X = [22.0, 24.0];
const BLUR_X = [26.0, 28.0];
const KOMPRES_Y = [15.0, 17.0];
const KOTAK_X = [34.0, 35.5, 37.0];

const sp = (jenis: JenisStasiunPenghuni2, idx: number, titik: Titik, arah: ArahHadap): StasiunPenghuni2 => ({
  jenis, idx, titik, arah, pose: jenis === "rak" || jenis === "kotak_post" ? "berdiri" : "kerja", depanPerabot: false, kunciPerabot: `${jenis}:${idx}`,
});

export const STASIUN_PENGHUNI2: Record<JenisStasiunPenghuni2, StasiunPenghuni2[]> = {
  rak: RAK_Y.map((y, i) => sp("rak", i, [11.85, y + 0.5], "NW")),
  autoedit: AUTOEDIT_X.map((x, i) => sp("autoedit", i, [x + 0.5, 12.6], "NE")),
  blur: BLUR_X.map((x, i) => sp("blur", i, [x + 0.5, 12.6], "NE")),
  kompres: KOMPRES_Y.map((y, i) => sp("kompres", i, [22.6, y + 0.5], "NW")),
  kotak_post: KOTAK_X.map((x, i) => sp("kotak_post", i, [x + 0.5, 16.6], "NE")),
};

export const PERABOT2: readonly Perabot2[] = [
  // --- kerja ---
  P("karpet", 4.5, 1.4, [2, 3], { lewat: true, datar: true }),
  P("meja_monitor", 0.2, MEJA_BOT.cari, [1, 2], { kunci: "meja:cari" }),
  P("meja_monitor", 0.2, MEJA_BOT.edit, [1, 2], { kunci: "meja:edit" }),
  P("meja_monitor", 0.2, MEJA_BOT.posting, [1, 2], { kunci: "meja:posting" }),
  P("kursi_nw", 1.45, MEJA_BOT.cari + 0.5, [1, 1], { lewat: true }),
  P("kursi_nw", 1.45, MEJA_BOT.edit + 0.5, [1, 1], { lewat: true }),
  P("kursi_nw", 1.45, MEJA_BOT.posting + 0.5, [1, 1], { lewat: true }),
  P("sofa_sw", 4.5, 0.1, [2, 1]),
  P("meja_kopi", 5.0, 2.4, [1, 1]),
  P("tempat_sampah", 3.0, 0.15, [1, 1]),
  P("rak_buku_kanan", 8.0, 0.05, [1, 1]),
  P("lemari_arsip", 9.0, 0.05, [1, 1]),
  P("tanaman_tinggi", 0.1, 9.0, [1, 1]),
  // --- koordinator ---
  P("lemari_arsip", 11.0, 3.05, [1, 1]),
  P("rak_buku_kanan", 12.0, 3.05, [1, 1]),
  P("meja_eksekutif", MEJA_KOORDINATOR2.asal[0], MEJA_KOORDINATOR2.asal[1], [1, 2], { kunci: "meja:koordinator" }),
  P("kursi_se", 14.95, 6.5, [1, 1], { lewat: true }),
  P("tanaman_besar", 19.0, 9.0, [1, 1]),
  P("tanaman_kecil", 10.1, 9.0, [1, 1]),
  // --- meeting ---
  P("layar_presentasi", 21.2, 0.3, [1, 1], { kunci: "layar:rapat" }),
  P("meja_rapat_panjang", 24.0, 3.0, [2, 3]),
  ...KURSI_RAPAT2.map((k) => P("kursi_se", k.titik[0] - 0.5, k.titik[1] - 0.5, [1, 1], { lewat: true })),
  P("kursi_nw", KURSI_NARA_RAPAT2.titik[0] - 0.5, KURSI_NARA_RAPAT2.titik[1] - 0.5, [1, 1], { lewat: true }),
  ...KURSI_TAMU_RAPAT2.map((k) => P("kursi_nw", k.titik[0] - 0.5, k.titik[1] - 0.5, [1, 1], { lewat: true })),
  P("tanaman_tinggi", 29.0, 9.0, [1, 1]),
  P("tanaman_kecil", 20.1, 3.1, [1, 1]),
  // --- istirahat ---
  ...KASUR2.map((k, i) => P("kasur_kiri", k.asal[0], k.asal[1], [2, 1], { kunci: `kasur:${i}` })),
  P("nakas", 0.1, 14.0, [1, 1]),
  P("nakas", 0.1, 16.0, [1, 1]),
  P("kursi_santai", 7.0, 16.5, [1, 1]),
  P("tanaman_besar", 9.0, 19.0, [1, 1]),
  // --- aula ---
  P("tanaman_besar", 30.1, 0.1, [1, 1]),
  P("meja_resepsionis", 31.2, 1.0, [1, 3]),
  P("bangku", 30.2, 6.0, [1, 2]),
  P("dispenser", 38.9, 5.5, [1, 1]),
  P("mesin_kopi", 38.9, 6.6, [1, 1]),
  P("tanaman_kecil", 38.9, 9.0, [1, 1]),
  // --- pos ---
  ...KOTAK_X.map((x, i) => P("kotak_post", x, 15.0, [1, 1], { kunci: `kotak_post:${i}` })),
  P("konter_pos", 31.0, 17.0, [1, 2]),
  P("meja_monitor", 39.0, 12.0, [1, 2], { kunci: "meja:pos" }),
  P("kardus", 38.6, 18.6, [1, 1]),
  P("tanaman_kecil", 30.1, 19.0, [1, 1]),
  // --- alat ---
  ...AUTOEDIT_X.map((x, i) => P("mesin_autoedit", x, 11.0, [1, 1], { kunci: `autoedit:${i}` })),
  ...BLUR_X.map((x, i) => P("mesin_blur", x, 11.0, [1, 1], { kunci: `blur:${i}` })),
  ...KOMPRES_Y.map((y, i) => P("mesin_kompres", 21.0, y, [1, 1], { kunci: `kompres:${i}` })),
  P("kardus", 28.8, 18.8, [1, 1]),
  // --- database ---
  ...RAK_Y.map((y, i) => P("rak_server", 10.2, y, [1, 1], { kunci: `rak:${i}` })),
  P("tanaman_besar", 19.0, 19.0, [1, 1]),
];

// ---------- grid lewat & pencarian jalan ----------

/** Tile terhalang perabot (jejak yang menutupi > 30% tile), atau di luar ruang. */
export const TERHALANG2: ReadonlySet<number> = (() => {
  const s = new Set<number>();
  for (let j = 0; j < DALAM_DUNIA; j++) for (let i = 0; i < LEBAR_DUNIA; i++) if (!ruangDi(i + 0.5, j + 0.5)) s.add(j * LEBAR_DUNIA + i);
  for (const p of PERABOT2) {
    if (p.lewat || p.datar) continue;
    for (let j = Math.floor(p.y); j < Math.ceil(p.y + p.tapak[1]); j++) {
      for (let i = Math.floor(p.x); i < Math.ceil(p.x + p.tapak[0]); i++) {
        const lx = Math.min(i + 1, p.x + p.tapak[0]) - Math.max(i, p.x);
        const ly = Math.min(j + 1, p.y + p.tapak[1]) - Math.max(j, p.y);
        if (lx * ly > 0.3) s.add(j * LEBAR_DUNIA + i);
      }
    }
  }
  return s;
})();

const idx = (i: number, j: number) => j * LEBAR_DUNIA + i;
const dalamGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < LEBAR_DUNIA && j < DALAM_DUNIA;

/** Ada batas di garis antara tile (i,j) dan tetangga ortogonalnya? */
function batasAntara(i: number, j: number, ni: number, nj: number): boolean {
  if (ni !== i) {
    const pada = Math.max(i, ni);
    return BATAS_X.has(`${pada}:${j}`);
  }
  const pada = Math.max(j, nj);
  return BATAS_Y.has(`${pada}:${i}`);
}
const BATAS_X = new Set(BATAS2.filter((b) => b.sumbu === "x").map((b) => `${b.pada}:${b.dari}`));
const BATAS_Y = new Set(BATAS2.filter((b) => b.sumbu === "y").map((b) => `${b.pada}:${b.dari}`));

function bolehLangkah(i: number, j: number, ni: number, nj: number, bebas: ReadonlySet<number>): boolean {
  if (!dalamGrid(ni, nj)) return false;
  const lewat = (a: number, b: number) => !TERHALANG2.has(idx(a, b)) || bebas.has(idx(a, b));
  if (!lewat(ni, nj)) return false;
  if (ni === i || nj === j) return !batasAntara(i, j, ni, nj);
  // diagonal: kedua langkah ortogonal harus sah (tidak memotong sudut sekat/perabot)
  return lewat(ni, j) && lewat(i, nj) && !batasAntara(i, j, ni, j) && !batasAntara(ni, j, ni, nj) && !batasAntara(i, j, i, nj) && !batasAntara(i, nj, ni, nj);
}

/** Garis lurus a→b sah: tidak menembus batas dan tidak melewati tile terhalang (kecuali tile awal/akhir). */
export function garisLewat(a: Titik, b: Titik, bebas: ReadonlySet<number> = new Set()): boolean {
  if (segmenMenembus(a, b, SEKAT2)) return false;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(L / 0.08));
  for (let k = 0; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n;
    const y = a[1] + ((b[1] - a[1]) * k) / n;
    const i = Math.floor(x), j = Math.floor(y);
    if (!dalamGrid(i, j)) return false;
    const t = idx(i, j);
    if (TERHALANG2.has(t) && !bebas.has(t)) return false;
  }
  return true;
}

/**
 * Jalan dari `a` ke `b` (koordinat pecahan). A* 8 arah di grid tile lalu dirapikan
 * dengan garis pandang. Hasil TIDAK memuat `a`, berakhir tepat di `b`.
 * null bila tidak tersambung (mis. sisi bot ↔ sayap anggota).
 */
export function cariJalan(a: Titik, b: Titik): Titik[] | null {
  const ai = Math.floor(a[0]), aj = Math.floor(a[1]);
  const bi = Math.floor(b[0]), bj = Math.floor(b[1]);
  if (!dalamGrid(ai, aj) || !dalamGrid(bi, bj)) return null;
  const bebas = new Set([idx(ai, aj), idx(bi, bj)]);
  if (ai === bi && aj === bj) return [b];
  const g = new Map<number, number>([[idx(ai, aj), 0]]);
  const asal = new Map<number, number>();
  const h = (i: number, j: number) => {
    const dx = Math.abs(i - bi), dy = Math.abs(j - bj);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const buka: [number, number][] = [[h(ai, aj), idx(ai, aj)]];
  const tutup = new Set<number>();
  const target = idx(bi, bj);
  while (buka.length) {
    let m = 0;
    for (let k = 1; k < buka.length; k++) if (buka[k]![0] < buka[m]![0]) m = k;
    const [, c] = buka.splice(m, 1)[0]!;
    if (c === target) break;
    if (tutup.has(c)) continue;
    tutup.add(c);
    const ci = c % LEBAR_DUNIA, cj = (c - ci) / LEBAR_DUNIA;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const ni = ci + di, nj = cj + dj;
      if (!bolehLangkah(ci, cj, ni, nj, bebas)) continue;
      const n = idx(ni, nj);
      const ng = g.get(c)! + (di && dj ? Math.SQRT2 : 1);
      if (ng < (g.get(n) ?? Infinity)) {
        g.set(n, ng);
        asal.set(n, c);
        buka.push([ng + h(ni, nj), n]);
      }
    }
  }
  if (!g.has(target)) return null;
  const sel: number[] = [];
  for (let c: number | undefined = target; c !== undefined; c = asal.get(c)) sel.push(c);
  sel.reverse();
  const titik: Titik[] = [a, ...sel.slice(1, -1).map((c): Titik => [(c % LEBAR_DUNIA) + 0.5, Math.floor(c / LEBAR_DUNIA) + 0.5]), b];
  // perapian: dari tiap titik, lompat ke titik terjauh yang masih terlihat
  const hasil: Titik[] = [];
  let k = 0;
  while (k < titik.length - 1) {
    let jauh = k + 1;
    for (let m = titik.length - 1; m > k + 1; m--) if (garisLewat(titik[k]!, titik[m]!, bebas)) { jauh = m; break; }
    hasil.push(titik[jauh]!);
    k = jauh;
  }
  return hasil.map((p): Titik => [Number(p[0].toFixed(3)), Number(p[1].toFixed(3))]);
}

// ---------- aula ----------

/** Tempat berdiri anggota online di aula (pusat tile lewat, jauh dari pintu & jalur masuk). */
export const SLOT_AULA2: Titik[] = (() => {
  const hasil: Titik[] = [];
  for (let j = 1; j < 10; j++) {
    for (let i = 32; i < 40; i++) {
      if (TERHALANG2.has(idx(i, j))) continue;
      const x = i + 0.5, y = j + 0.5;
      if (Math.hypot(x - PINTU_MASUK2[0], y - PINTU_MASUK2[1]) < 1.6) continue; // depan pintu kaca
      if (j >= 8 && i >= 33 && i <= 36) continue; // jalur ke pintu pos
      hasil.push([x, y]);
    }
  }
  return hasil;
})();

// ---------- label & zona ----------

export function zonaDari2(x: number, y: number): KunciRuang2 | null {
  return ruangDi(x, y)?.kunci ?? null;
}

/** Pil nama ruang di lantai dekat sudut depan ruang. */
export const LABEL_RUANG2: { kunci: KunciRuang2; nama: string; titik: Titik; warna: string }[] = RUANG2.map((r) => ({
  kunci: r.kunci,
  nama: r.nama,
  titik: [r.x + r.w / 2, r.y + r.d - 0.7] as Titik,
  warna: r.warna,
}));

// ---------- urutan gambar (kedalaman) ----------

/**
 * Kunci kedalaman perabot = jumlah koordinat titik tengah jejak (bukan sudut depan):
 * benda besar (meja rapat) tidak menimpa orang yang berdiri di sisi depannya.
 * Benda datar (karpet) selalu paling belakang.
 */
export function kedalamanPerabot(p: Perabot2): number {
  if (p.datar) return -1;
  return p.x + p.tapak[0] / 2 + p.y + p.tapak[1] / 2;
}

/** Perabot tempat duduk/berdiri `titik` (jejaknya memuat titik, atau kursi terdekat ≤ 0,6 tile). */
export function perabotDudukan(titik: Titik): Perabot2 | null {
  let terbaik: Perabot2 | null = null;
  let jarak = 0.6;
  for (const p of PERABOT2) {
    if (p.datar) continue;
    const cx = p.x + p.tapak[0] / 2, cy = p.y + p.tapak[1] / 2;
    const di = titik[0] >= p.x && titik[0] <= p.x + p.tapak[0] && titik[1] >= p.y && titik[1] <= p.y + p.tapak[1];
    const d = di ? 0 : Math.hypot(titik[0] - cx, titik[1] - cy);
    if (!/^(kursi|sofa)/.test(p.sprite) && !di) continue;
    if (/^(kursi|sofa)/.test(p.sprite) && d <= jarak) { terbaik = p; jarak = d; }
  }
  return terbaik;
}

/**
 * Kunci kedalaman karakter. Di dudukan: di depan perabot (sofa, kursi menghadap
 * pemirsa) atau di belakangnya (kursi yang sandarannya ke arah pemirsa).
 */
export function kedalamanKarakter(x: number, y: number, duduk?: Duduk2 | null): number {
  const dasar = x + y;
  if (!duduk) return dasar;
  const p = perabotDudukan(duduk.titik);
  if (!p) return dasar;
  const k = kedalamanPerabot(p);
  return duduk.depanPerabot ? Math.max(dasar, k + 0.01) : Math.min(dasar, k - 0.01);
}

// ---------- arah hadap ----------

/** Arah hadap 4 dari arah gerak (dx, dy) di grid. */
export function arahDariGerak(dx: number, dy: number, sebelumnya: ArahHadap = "SE"): ArahHadap {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return sebelumnya;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "SE" : "NW";
  return dy > 0 ? "SW" : "NE";
}
