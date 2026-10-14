// ============================================================
// DENAH RUANG BOT — satu gedung, empat ruang (13 Okt 2026). Logika murni.
//
// Grid isometrik 16x16, dibagi sekat kaca:
//
//          x: 0 ─────────── 10 ────── 16
//   y: 0    │  RUANG KERJA  │ RUANG MEETING
//           │ (meja, sofa)  │ (meja rapat, layar)
//   y: 10   ├─ pintu ───────┼─ pintu ─────
//           │ RUANG KOORDI- │ KAMAR TIDUR
//   y: 16   │ NATOR (Nara)  │ (agen tanpa API key)
//
// Pintu = celah pada sekat. Semua jalur jalan didefinisikan di sini dan HARUS
// melewati pintu, bukan menembus sekat (diuji di tests/uji-ruang-dunia.mts lewat
// segmenMenembus). Dipakai simulasi (jalur) dan penggambar (perabot, sekat).
// ============================================================

import type { TahapBot, TempatBot } from "./tipe";

export type Titik = [number, number];

/** Sisi gedung bot Redaksi (empat ruang). */
export const UKURAN_DENAH = 16;
/** Seluruh denah: gedung bot (x 0..16) + sayap penghuni (x 16..28: aula, database, alat, pos). */
export const PANJANG_X = 28;
export const PANJANG_Y = 16;

// ---------- ruang kerja (meja pencarian / edit / posting + sofa) ----------

export type Stasiun = {
  nama: string;
  /** Meja: [gx, gy, lebar, dalam]. Sofa tidak punya meja. */
  meja?: [number, number, number, number];
  kursi: Titik[];
  /** Titik keluar dari kursi menuju tengah ruangan. */
  keluar: Titik;
  monitor?: Titik[];
  lampu?: Titik;
  /** Posisi pil label di lantai. */
  label: Titik;
};

export const STASIUN: Record<TahapBot, Stasiun> = {
  cari: { nama: "MEJA PENCARIAN", meja: [1, 2, 2.6, 1], kursi: [[3.0, 1.5]], keluar: [4.4, 1.5], monitor: [[1.2, 2.3], [1.85, 2.3]], lampu: [2.5, 2.2], label: [2.3, 3.7] },
  edit: { nama: "MEJA EDIT", meja: [6, 2, 2.6, 1], kursi: [[6.6, 1.5]], keluar: [5.4, 1.5], monitor: [[7.3, 2.3], [7.95, 2.3]], lampu: [8.25, 2.2], label: [7.3, 3.7] },
  posting: { nama: "MEJA POSTING", meja: [2.2, 5.8, 1, 2.6], kursi: [[1.6, 7.6]], keluar: [1.6, 5.0], monitor: [[2.45, 6.1], [2.45, 6.85]], lampu: [2.7, 8.05], label: [3.75, 7.3] },
  istirahat: { nama: "SOFA ISTIRAHAT", kursi: [[7.9, 8.2], [8.9, 8.2]], keluar: [6.0, 8.1], label: [8.2, 9.55] },
};

/** Titik temu di tengah ruang kerja; semua jalan lewat sini. */
export const TITIK_TENGAH: Titik = [5, 5];
/** Tempat bot menunggu giliran (satu per bot, bergilir). */
export const TEMPAT_ANTRE: Titik[] = [[4.3, 4.7], [5.7, 4.7], [5.0, 6.1]];

// ---------- ruang meeting & kamar tidur ----------

/** Pintu ruang kerja <-> ruang meeting (celah sekat di x=10, y 4.3..5.9). Jalan dari TITIK_TENGAH. */
export const PINTU_KERJA_MEETING: Titik[] = [[9.2, 5.1], [10.8, 5.1]];
export const KURSI_RAPAT: Titik[] = [[12.0, 2.9], [13.3, 2.9], [14.6, 2.9]];
/** Pojok kiri-atas tiap kasur ([gx, gy]); panjang kasur 1.3 x 2.4. */
export const KASUR: Titik[] = [[10.7, 11.6], [12.4, 11.6], [14.1, 11.6]];
/** Tempat bot berdiri di kepala kasur sebelum "naik" (lalu digambar sebagai orang tidur). */
export const KEPALA_KASUR: Titik[] = KASUR.map((k): Titik => [k[0] + 0.65, 10.9]);
export const KURSI_TAMU_RAPAT: Titik[] = [[12.6, 7.2], [13.9, 7.2]];

/** Pasangan jalan (dari TITIK_TENGAH ke kursi / kebalikannya) untuk tempat selain meja kerja. */
function masukRapat(i: number): Titik[] {
  const k = KURSI_RAPAT[i];
  return [...PINTU_KERJA_MEETING, [10.8, 2.0], [k[0], 2.0], k];
}
function keluarRapat(i: number): Titik[] {
  const k = KURSI_RAPAT[i];
  return [[k[0], 2.0], [10.8, 2.0], [10.8, 5.1], [9.2, 5.1]];
}
function masukTidur(i: number): Titik[] {
  return [...PINTU_KERJA_MEETING, [10.8, 8.6], [11.1, 9.4], [11.1, 10.7], KEPALA_KASUR[i]];
}
function keluarTidur(i: number): Titik[] {
  return [KEPALA_KASUR[i], [11.1, 10.7], [11.1, 9.4], [10.8, 8.6], [10.8, 5.1], [9.2, 5.1]];
}

/** Jumlah kursi rapat / kasur. */
export const KAPASITAS: Record<"rapat" | "tidur", number> = { rapat: KURSI_RAPAT.length, tidur: KASUR.length };

/** Titik yang dilalui dari TITIK_TENGAH sampai kursi `idx` di tempat itu (tanpa TITIK_TENGAH sendiri). */
export function jalanMasuk(tempat: TempatBot, idx: number): Titik[] {
  if (tempat === "rapat") return masukRapat(idx);
  if (tempat === "tidur") return masukTidur(idx);
  const s = STASIUN[tempat];
  return [s.keluar, s.kursi[idx]];
}

/** Titik yang dilalui dari kursi `idx` sampai sebelum TITIK_TENGAH. */
export function jalanKeluar(tempat: TempatBot, idx: number): Titik[] {
  if (tempat === "rapat") return keluarRapat(idx);
  if (tempat === "tidur") return keluarTidur(idx);
  return [STASIUN[tempat].keluar];
}

/** Titik pijak bot di kursi/kasur itu. */
export function titikKursi(tempat: TempatBot, idx: number): Titik {
  if (tempat === "rapat") return KURSI_RAPAT[idx];
  if (tempat === "tidur") return KEPALA_KASUR[idx];
  return STASIUN[tempat].kursi[idx];
}

// ---------- ruang koordinator (Nara) ----------

export const MEJA_KOORDINATOR = {
  meja: [6.2, 12.0, 2.6, 1] as [number, number, number, number],
  monitor: [[6.85, 12.3], [7.5, 12.3]] as Titik[],
  lampu: [8.6, 12.3] as Titik,
  kursi: [6.7, 11.45] as Titik,
};
/** Berdiri di depan papan penugasan (dinding kiri ruang koordinator). */
export const PAPAN_TUGAS: Titik = [1.9, 12.6];
/** Pintu ruang koordinator <-> ruang kerja (celah sekat di y=10, x 2.2..3.6). */
export const JALAN_KOORDINATOR_KE_KERJA: Titik[] = [[6.7, 10.9], [2.9, 10.9], [2.9, 9.3]];
export const JALAN_KERJA_KE_KOORDINATOR: Titik[] = [[2.9, 9.3], [2.9, 10.9]];
export const JALAN_MEJA_KE_PAPAN: Titik[] = [[6.7, 10.9], [2.6, 11.4], PAPAN_TUGAS];
export const JALAN_PAPAN_KE_KERJA: Titik[] = [[2.6, 11.4], [2.9, 10.9], [2.9, 9.3]];
export const JALAN_PULANG_KE_MEJA: Titik[] = [[2.9, 9.3], [2.9, 10.9], [6.7, 10.9], MEJA_KOORDINATOR.kursi];
/** Dari depan papan langsung pulang ke meja (tetap di ruang koordinator). */
export const JALAN_PAPAN_KE_MEJA: Titik[] = [[2.6, 11.4], [2.9, 10.9], [6.7, 10.9], MEJA_KOORDINATOR.kursi];
/** Kursi Nara di ruang meeting + jalannya (dari/ke TITIK_TENGAH lewat pintu). */
export const KURSI_NARA_RAPAT: Titik = [12.6, 7.2];
export const JALAN_MASUK_RAPAT_NARA: Titik[] = [...PINTU_KERJA_MEETING, [10.8, 7.6], [12.6, 7.6], KURSI_NARA_RAPAT];
export const JALAN_KELUAR_RAPAT_NARA: Titik[] = [[12.6, 7.6], [10.8, 7.6], [10.8, 5.1], [9.2, 5.1]];

// ---------- sayap penghuni (pengguna online) ----------
//
//   x: 16 ───────────────────────── 28
//   y: 0   │ AULA (semua yang online berdiri/duduk di sini; pintu depan di pojok kanan)
//   y: 6   ├─ pintu ──┬─ pintu ──┬─ pintu ─
//          │ RUANG    │ RUANG    │ RUANG
//          │ DATABASE │ ALAT     │ POS
//   y: 16  │ (rak)    │ (3 mesin)│ (kotak post)
//
// Pintu ke tiga ruang ada di garis y=6; semua jalan penghuni lewat aula (titik jalur y=5).

export const Y_SEKAT_SAYAP = 6;
/** Pusat pintu (koordinat x) ke tiap ruang di sayap. */
export const PINTU_SAYAP = { database: 18.0, alat: 22.0, pos: 26.0 } as const;
/** Titik di aula tepat di depan pintu, dan titik di dalam ruang tepat setelah pintu. */
const DEPAN_PINTU_Y = 5.0;
const DALAM_PINTU_Y = 6.9;
/** Tempat penghuni muncul / pergi (pintu depan di dinding belakang aula). */
export const PINTU_MASUK: Titik = [27.4, 0.9];

export type JenisStasiunPenghuni = "rak" | "autoedit" | "kompres" | "blur" | "kotak_post";

export type StasiunPenghuni = {
  jenis: JenisStasiunPenghuni;
  idx: number;
  /** Tempat berdiri. Selalu menghadap sisi -x (bagian depan mesin/rak). */
  titik: Titik;
  /** Pusat pintu ruangnya (koordinat x). */
  pintu: number;
};

function bangunStasiun(jenis: JenisStasiunPenghuni, pintu: number, x: number, ys: number[]): StasiunPenghuni[] {
  return ys.map((y, idx) => ({ jenis, idx, titik: [x, y] as Titik, pintu }));
}

/** Rak (6), mesin alat (2 operator per mesin), kotak post (3 tempat berdiri). */
export const RAK_DATABASE: { gx: number; gy: number; panjang: number }[] = [6.9, 8.4, 9.9, 11.4, 12.9, 14.4].map((gy) => ({ gx: 16.15, gy, panjang: 1.4 }));
export const MESIN_ALAT: { jenis: "autoedit" | "kompres" | "blur"; gx: number; gy: number; panjang: number }[] = [
  { jenis: "autoedit", gx: 20.2, gy: 6.9, panjang: 2.2 },
  { jenis: "kompres", gx: 20.2, gy: 9.9, panjang: 2.2 },
  { jenis: "blur", gx: 20.2, gy: 12.9, panjang: 2.2 },
];
export const KOTAK_POST = { gx: 24.3, gy: 8.0, lebar: 1.0, panjang: 2.0 };

export const STASIUN_PENGHUNI: Record<JenisStasiunPenghuni, StasiunPenghuni[]> = {
  rak: bangunStasiun("rak", PINTU_SAYAP.database, 17.8, RAK_DATABASE.map((r) => r.gy + r.panjang / 2)),
  autoedit: bangunStasiun("autoedit", PINTU_SAYAP.alat, 21.9, [MESIN_ALAT[0].gy + 0.6, MESIN_ALAT[0].gy + 1.6]),
  kompres: bangunStasiun("kompres", PINTU_SAYAP.alat, 21.9, [MESIN_ALAT[1].gy + 0.6, MESIN_ALAT[1].gy + 1.6]),
  blur: bangunStasiun("blur", PINTU_SAYAP.alat, 21.9, [MESIN_ALAT[2].gy + 0.6, MESIN_ALAT[2].gy + 1.6]),
  kotak_post: bangunStasiun("kotak_post", PINTU_SAYAP.pos, 26.1, [8.2, 9.0, 9.8]),
};

/** Dari aula (titik mana pun) ke stasiun: lewat depan pintu, masuk, berdiri. */
export function jalanMasukPenghuni(s: StasiunPenghuni): Titik[] {
  return [[s.pintu, DEPAN_PINTU_Y], [s.pintu, DALAM_PINTU_Y], s.titik];
}

/** Dari stasiun kembali ke aula (berakhir di depan pintu, di aula). */
export function jalanKeluarPenghuni(s: StasiunPenghuni): Titik[] {
  return [[s.pintu, DALAM_PINTU_Y], [s.pintu, DEPAN_PINTU_Y]];
}

/**
 * Tempat berdiri di aula. Dua lapis (selisih setengah langkah) supaya cukup banyak orang tetap
 * tidak menumpuk; baris paling depan menghindari jalur depan pintu.
 */
export const SLOT_AULA: Titik[] = (() => {
  const hasil: Titik[] = [];
  const pintu = [PINTU_SAYAP.database, PINTU_SAYAP.alat, PINTU_SAYAP.pos];
  for (const lapis of [0, 1]) {
    for (const y0 of [1.4, 2.5, 3.6, 4.7]) {
      for (let k = 0; k < 9; k++) {
        const x = 17.0 + k * 1.3 + lapis * 0.65;
        const y = y0 + lapis * 0.55;
        if (x > 27.7 || y > 5.2) continue;
        if (x > 26.3 && y < 2.4) continue; // dekat pintu depan
        if (y > 4.4 && pintu.some((p) => Math.abs(x - p) < 0.85)) continue; // jalur depan pintu ruang
        hasil.push([Number(x.toFixed(2)), Number(y.toFixed(2))]);
      }
    }
  }
  return hasil;
})();

// ---------- sekat kaca ----------

export type Sekat = { x: number; y: number; w: number; d: number; buram: boolean };

/** Lempeng sekat (celah di antaranya = pintu). `buram` = kaca susu (kamar tidur). */
export const SEKAT: Sekat[] = [
  { x: 9.94, y: 0, w: 0.12, d: 4.3, buram: false },
  { x: 9.94, y: 5.9, w: 0.12, d: 4.1, buram: false },
  { x: 9.94, y: 10, w: 0.12, d: 6, buram: true },
  { x: 0, y: 9.94, w: 2.2, d: 0.12, buram: false },
  { x: 3.6, y: 9.94, w: 6.4, d: 0.12, buram: false },
  { x: 10, y: 9.94, w: 0.4, d: 0.12, buram: true },
  { x: 11.8, y: 9.94, w: 4.2, d: 0.12, buram: true },
  // sayap penghuni: dinding antara gedung bot dan sayap, garis pintu ke tiga ruang, dan sekat antar-ruang
  { x: 15.94, y: 0, w: 0.12, d: 16, buram: false },
  { x: 16, y: 5.94, w: 1.3, d: 0.12, buram: false },
  { x: 18.7, y: 5.94, w: 2.6, d: 0.12, buram: false },
  { x: 22.7, y: 5.94, w: 2.6, d: 0.12, buram: false },
  { x: 26.7, y: 5.94, w: 1.3, d: 0.12, buram: false },
  { x: 19.94, y: 6, w: 0.12, d: 10, buram: false },
  { x: 23.94, y: 6, w: 0.12, d: 10, buram: false },
];

/** Tiang kayu di tepi tiap pintu. */
export const TIANG_PINTU: Titik[] = [
  [10.0, 4.3], [10.0, 5.9], [2.2, 10.0], [3.6, 10.0], [10.4, 10.0], [11.8, 10.0],
  [17.3, 6.0], [18.7, 6.0], [21.3, 6.0], [22.7, 6.0], [25.3, 6.0], [26.7, 6.0],
];

export type ZonaRuang = "kerja" | "meeting" | "koordinator" | "tidur" | "aula" | "database" | "alat" | "pos";

export function zonaDari(x: number, y: number): ZonaRuang {
  if (x >= 16) {
    if (y < Y_SEKAT_SAYAP) return "aula";
    return x < 20 ? "database" : x < 24 ? "alat" : "pos";
  }
  if (x >= 10) return y >= 10 ? "tidur" : "meeting";
  return y >= 10 ? "koordinator" : "kerja";
}

export type LabelRuang = { kunci: ZonaRuang; nama: string; titik: Titik; warna: string };

/** Pil nama ruang (di lantai, dekat sudut depan). */
export const LABEL_RUANG: LabelRuang[] = [
  { kunci: "kerja", nama: "RUANG KERJA", titik: [5.0, 9.55], warna: "#f59e0b" },
  { kunci: "meeting", nama: "RUANG MEETING", titik: [15.45, 7.6], warna: "#fb7185" },
  { kunci: "koordinator", nama: "RUANG KOORDINATOR", titik: [2.2, 15.5], warna: "#38bdf8" },
  { kunci: "tidur", nama: "KAMAR TIDUR", titik: [14.2, 15.6], warna: "#94a3b8" },
  { kunci: "aula", nama: "AULA · ONLINE", titik: [22.0, 5.5], warna: "#22c55e" },
  { kunci: "database", nama: "RUANG DATABASE", titik: [18.0, 15.5], warna: "#a78bfa" },
  { kunci: "alat", nama: "RUANG ALAT", titik: [22.0, 15.5], warna: "#38bdf8" },
  { kunci: "pos", nama: "KOTAK POST", titik: [26.0, 15.5], warna: "#f97316" },
];

// ---------- geometri jalan ----------

/**
 * true bila ruas a->b menembus (memotong) lempeng sekat mana pun. Clipping Liang–Barsky
 * terhadap persegi panjang sekat; menyentuh tepat di tepi dianggap tidak menembus.
 */
export function segmenMenembus(a: Titik, b: Titik, sekat: readonly Sekat[] = SEKAT): boolean {
  const EPS = 1e-9;
  for (const s of sekat) {
    let t0 = 0;
    let t1 = 1;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const batas: [number, number][] = [
      [-dx, a[0] - s.x],
      [dx, s.x + s.w - a[0]],
      [-dy, a[1] - s.y],
      [dy, s.y + s.d - a[1]],
    ];
    let luar = false;
    for (const [p, q] of batas) {
      if (Math.abs(p) < EPS) {
        if (q <= EPS) {
          luar = true;
          break;
        }
        continue;
      }
      const r = q / p;
      if (p < 0) {
        if (r > t1) {
          luar = true;
          break;
        }
        if (r > t0) t0 = r;
      } else {
        if (r < t0) {
          luar = true;
          break;
        }
        if (r < t1) t1 = r;
      }
    }
    if (!luar && t1 - t0 > EPS) return true;
  }
  return false;
}

/** true bila titik jatuh di dalam lempeng sekat (jalan tidak boleh berhenti di sana). */
export function titikDiSekat(p: Titik, sekat: readonly Sekat[] = SEKAT): boolean {
  return sekat.some((s) => p[0] > s.x && p[0] < s.x + s.w && p[1] > s.y && p[1] < s.y + s.d);
}

/** Semua ruas dari `awal` melewati `titik` berurutan; true bila ada yang menembus sekat atau keluar denah. */
export function jalurTerlarang(awal: Titik, titik: readonly Titik[]): boolean {
  let a = awal;
  for (const p of titik) {
    if (p[0] < 0 || p[1] < 0 || p[0] > PANJANG_X || p[1] > PANJANG_Y) return true;
    if (titikDiSekat(p) || segmenMenembus(a, p)) return true;
    a = p;
  }
  return false;
}

// ---------- gerak ----------

export type Badan = { x: number; y: number; arah: 1 | -1; belakang: boolean };

/**
 * Majukan `badan` menyusuri `jalur` sejauh `jarak` grid (jalur dikurangi di tempat).
 * Mengembalikan true bila jalur sudah habis. Arah pandang mengikuti sumbu layar isometrik.
 */
export function ikutiJalur(badan: Badan, jalur: Titik[], jarak: number): boolean {
  let d = jarak;
  while (d > 0 && jalur.length > 0) {
    const [tx, ty] = jalur[0];
    const dx = tx - badan.x;
    const dy = ty - badan.y;
    const L = Math.hypot(dx, dy);
    if (L <= d) {
      badan.x = tx;
      badan.y = ty;
      jalur.shift();
      d -= L;
    } else {
      badan.x += (dx / L) * d;
      badan.y += (dy / L) * d;
      badan.arah = dx - dy > 0 ? 1 : dx - dy < 0 ? -1 : badan.arah;
      badan.belakang = dx + dy < 0;
      d = 0;
    }
  }
  return jalur.length === 0;
}
