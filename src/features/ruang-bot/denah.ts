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

/** Sisi grid. */
export const UKURAN_DENAH = 16;

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
];

/** Tiang kayu di tepi tiap pintu. */
export const TIANG_PINTU: Titik[] = [[10.0, 4.3], [10.0, 5.9], [2.2, 10.0], [3.6, 10.0], [10.4, 10.0], [11.8, 10.0]];

export type ZonaRuang = "kerja" | "meeting" | "koordinator" | "tidur";

export function zonaDari(x: number, y: number): ZonaRuang {
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
    if (p[0] < 0 || p[1] < 0 || p[0] > UKURAN_DENAH || p[1] > UKURAN_DENAH) return true;
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
