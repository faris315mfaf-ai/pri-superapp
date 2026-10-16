// ============================================================
// DUNIA v2 — logika murni penggambar (16 Okt 2026): proyeksi layar, arah &
// pose karakter, keadaan perabot beranimasi, sekat rendah & kusen pintu,
// dinding modul yang dipertahankan / diturunkan. Tanpa DOM; diuji di
// tests/uji-dunia2-murni.mts. Penggambar: dunia2-gambar.ts, ruang-dunia2.tsx.
// ============================================================

import {
  BATAS2,
  DALAM_DUNIA,
  KASUR2,
  KURSI_NARA_RAPAT2,
  KURSI_RAPAT2,
  KURSI_TAMU_RAPAT2,
  LEBAR_DUNIA,
  MEJA_KOORDINATOR2,
  PAPAN_TUGAS2,
  PINTU2,
  STASIUN2,
  STASIUN_PENGHUNI2,
  ruangDi,
  type ArahHadap,
  type Duduk2,
  type JenisStasiunPenghuni2,
  type Ruang2,
  type Titik,
} from "./denah2";
import { konfigBawaan, type KonfigKarakter } from "@/lib/karakter-murni";
import type { AnimKarakter } from "./karakter-sprite";

// ---------- proyeksi ----------

/** Satu tile = 64×32 px layar; tinggi karakter berdiri ±60 px. */
export const SETENGAH_TILE_X = 32;
export const SETENGAH_TILE_Y = 16;
export const PINGGIR_LATAR = 60;
/** Ruang di atas lantai untuk dinding belakang (±150 px) + kepala karakter. */
export const ATAS_LATAR = 220;
export const LEBAR_LATAR = (LEBAR_DUNIA + DALAM_DUNIA) * SETENGAH_TILE_X + PINGGIR_LATAR * 2;
export const TINGGI_LATAR = (LEBAR_DUNIA + DALAM_DUNIA) * SETENGAH_TILE_Y + ATAS_LATAR + 80;
const OX = DALAM_DUNIA * SETENGAH_TILE_X + PINGGIR_LATAR;
const OY = ATAS_LATAR;

/** Titik dunia (x, y, z px ke atas) → piksel latar. */
export function keLayar(x: number, y: number, z = 0): { x: number; y: number } {
  return { x: OX + (x - y) * SETENGAH_TILE_X, y: OY + (x + y) * SETENGAH_TILE_Y - z };
}

/** Piksel latar → titik dunia di bidang lantai (z = 0). */
export function dariLayar(sx: number, sy: number): Titik {
  const u = (sx - OX) / SETENGAH_TILE_X; // x − y
  const v = (sy - OY) / SETENGAH_TILE_Y; // x + y
  return [(u + v) / 2, (v - u) / 2];
}

// ---------- arah & pose ----------

/** Arah 4 dari arah layar simulasi (ikutiJalur: arah ±1 = kanan/kiri layar, belakang = menjauh). */
export function arahDariBadan(arah: 1 | -1, belakang: boolean): ArahHadap {
  if (belakang) return arah > 0 ? "NE" : "NW";
  return arah > 0 ? "SE" : "SW";
}

/** Semua titik duduk / berdiri bertanda di denah v2. */
export const SEMUA_DUDUK: readonly Duduk2[] = [
  ...Object.values(STASIUN2).flat(),
  ...KURSI_RAPAT2,
  KURSI_NARA_RAPAT2,
  ...KURSI_TAMU_RAPAT2,
  MEJA_KOORDINATOR2.kursi,
  PAPAN_TUGAS2,
  ...Object.values(STASIUN_PENGHUNI2).flat(),
];

/** Dudukan tepat di posisi itu (toleransi kecil), atau null. */
export function cariDuduk(x: number, y: number, eps = 0.05): Duduk2 | null {
  for (const d of SEMUA_DUDUK) if (Math.abs(d.titik[0] - x) < eps && Math.abs(d.titik[1] - y) < eps) return d;
  return null;
}

export type PoseKarakter2 = { anim: AnimKarakter; arah: ArahHadap; duduk: Duduk2 | null };

/**
 * Pose & arah untuk digambar: berjalan → walk mengikuti arah gerak; di dudukan
 * bertanda → pose & arah dudukan (kerja = work, duduk = sit, berdiri = idle);
 * selain itu diam menghadap arah terakhir.
 */
export function poseKarakter(b: { x: number; y: number; arah: 1 | -1; belakang: boolean }, berjalan: boolean): PoseKarakter2 {
  if (berjalan) return { anim: "walk", arah: arahDariBadan(b.arah, b.belakang), duduk: null };
  const d = cariDuduk(b.x, b.y);
  if (d) return { anim: d.pose === "kerja" ? "work" : d.pose === "duduk" ? "sit" : "idle", arah: d.arah, duduk: d };
  return { anim: "idle", arah: arahDariBadan(b.arah, b.belakang), duduk: null };
}

/** Bot yang berbaring: duduk di atas kasurnya (pose sit, menghadap SE, di depan kasur). */
export function poseTidur(idxKasur: number): { titik: Titik; pose: PoseKarakter2 } {
  const k = KASUR2[idxKasur] ?? KASUR2[0]!;
  return {
    titik: k.baring,
    pose: { anim: "sit", arah: "SE", duduk: { titik: k.baring, arah: "SE", pose: "duduk", depanPerabot: true } },
  };
}

// ---------- perabot beranimasi ----------

export type StatusPerabot = {
  /** Meja bot yang sedang dipakai bekerja. */
  mejaSibuk: (tahap: "cari" | "edit" | "posting") => boolean;
  /** Stasiun anggota sedang dipakai bekerja. */
  stasiunSibuk: (jenis: JenisStasiunPenghuni2, idx: number) => boolean;
};

const urutan = (n: number, tMs: number, msPerFrame: number) => Math.floor(tMs / msPerFrame) % n;

/**
 * Indeks frame perabot ber-keadaan (urutan frame = manifest perabot `keadaan`).
 *  rak_server   kosong/separuh/penuh/penuh_kedip — diam: separuh; dipakai: penuh ↔ penuh_kedip
 *  mesin_*      mati/jalan_1/jalan_2/jalan_3|selesai — diam: mati; dipakai: berputar
 *  kotak_post   tutup/buka/masuk/terkirim — diam: tutup; dipakai: buka → masuk → terkirim
 *  meja_monitor mati/cari/edit/unggah — meja bot: sesuai tahap bila sibuk; meja pos: unggah bila kotak post dipakai
 */
export function frameKeadaan(kunci: string, s: StatusPerabot, tMs: number): number {
  const [jenis, nomor] = kunci.split(":") as [string, string];
  if (jenis === "meja") {
    if (nomor === "cari" || nomor === "edit" || nomor === "posting") return s.mejaSibuk(nomor) ? { cari: 1, edit: 2, posting: 3 }[nomor] : 0;
    if (nomor === "pos") return [0, 1, 2].some((i) => s.stasiunSibuk("kotak_post", i)) ? 3 : 0;
    return 0;
  }
  const idx = Number(nomor);
  if (!Number.isInteger(idx)) return 0;
  if (jenis === "rak") return s.stasiunSibuk("rak", idx) ? 2 + urutan(2, tMs, 420) : 1;
  if (jenis === "autoedit" || jenis === "kompres") return s.stasiunSibuk(jenis, idx) ? 1 + urutan(3, tMs, 260) : 0;
  if (jenis === "blur") return s.stasiunSibuk("blur", idx) ? 1 + urutan(2, tMs, 300) : 0;
  if (jenis === "kotak_post") return s.stasiunSibuk("kotak_post", idx) ? 1 + urutan(3, tMs, 500) : 0;
  return 0;
}

// ---------- dinding modul & sekat rendah ----------

/**
 * Dinding modul pada posisi `t` (koordinat sepanjang dinding) dipertahankan utuh bila
 * di baliknya BUKAN ruang lain (dinding luar gedung); diturunkan bila berbatasan ruang.
 * sisi "kiri" = garis x = r.x (t = y), "kanan" = garis y = r.y (t = x).
 */
export function dindingUtuh(r: Ruang2, sisi: "kiri" | "kanan", t: number): boolean {
  return sisi === "kiri" ? ruangDi(r.x - 0.5, t) === null : ruangDi(t, r.y - 0.5) === null;
}

export type RuasSekat = { sumbu: "x" | "y"; pada: number; dari: number; sampai: number; kunci: number };

/** Sekat rendah antar-ruang per 1 tile (tanpa celah pintu), dengan kunci kedalaman tengah ruas. */
export const RUAS_SEKAT2: readonly RuasSekat[] = BATAS2.filter((b) => b.dalam).map((b) => ({
  sumbu: b.sumbu,
  pada: b.pada,
  dari: b.dari,
  sampai: b.sampai,
  kunci: b.sumbu === "x" ? b.pada + (b.dari + b.sampai) / 2 : (b.dari + b.sampai) / 2 + b.pada,
}));

/** Kusen pintu: tiang di kedua ujung tiap celah pintu. */
export const KUSEN2: readonly { titik: Titik; kunci: number }[] = PINTU2.flatMap((p) =>
  [p.dari, p.sampai].map((t) => {
    const titik: Titik = p.sumbu === "x" ? [p.pada, t] : [t, p.pada];
    return { titik, kunci: titik[0] + titik[1] + 0.02 };
  }),
);

/** Tinggi sekat rendah & kusen (px layar). */
export const TINGGI_SEKAT = 16;
export const TINGGI_KUSEN = 54;

// ---------- rupa anggota ----------

/**
 * Rupa tiap anggota untuk penggambar: rupa tersimpan dari status dunia (Karakter Saya), ditimpa
 * rupa akun sendiri yang baru disimpan (tampil langsung tanpa menunggu status berikutnya).
 */
export function petaRupaAnggota(
  daftar: readonly { id: number; rupa?: KonfigKarakter }[],
  sayaId?: number,
  rupaSaya?: KonfigKarakter,
): Map<number, KonfigKarakter> {
  const m = new Map<number, KonfigKarakter>();
  for (const p of daftar) if (p.rupa) m.set(p.id, p.rupa);
  if (sayaId !== undefined && rupaSaya) m.set(sayaId, rupaSaya);
  return m;
}

/** Rupa satu anggota: tersimpan, atau rupa bawaan stabil per akun. */
export function rupaAnggota(peta: ReadonlyMap<number, KonfigKarakter>, id: number): KonfigKarakter {
  return peta.get(id) ?? konfigBawaan(id);
}

// ---------- kamera ----------

/** Kamera: titik latar di tengah layar (cx, cy) & skala (px layar per px latar). */
export type Kamera2 = { cx: number; cy: number; s: number };
export const ZOOM_MAKS2 = 3;

/** Skala "Pas": seluruh gedung terlihat dalam wadah w×h. */
export function skalaPas(w: number, h: number): number {
  return Math.max(0.15, Math.min(w / LEBAR_LATAR, h / TINGGI_LATAR) * 0.98);
}

/**
 * Skala untuk melihat satu ruang (±720×480 px latar): bilangan bulat bila ≥ 1 supaya piksel
 * tetap tajam, selain itu sebesar yang muat (tidak lebih kecil dari Pas).
 */
export function skalaRuang(w: number, h: number): number {
  const v = Math.min(w / 720, h / 480);
  return v >= 1 ? Math.min(ZOOM_MAKS2, Math.floor(v)) : Math.max(skalaPas(w, h), v);
}

/** Skala dijepit [Pas, 3×]; pusat dijepit agar latar menutupi layar (atau di tengah bila lebih kecil). */
export function jepitKamera(k: Kamera2, w: number, h: number): Kamera2 {
  const s = Math.min(ZOOM_MAKS2, Math.max(skalaPas(w, h), k.s));
  const sw = w / 2 / s, sh = h / 2 / s;
  const cx = LEBAR_LATAR / 2 <= sw ? LEBAR_LATAR / 2 : Math.min(LEBAR_LATAR - sw, Math.max(sw, k.cx));
  const cy = TINGGI_LATAR / 2 <= sh ? TINGGI_LATAR / 2 : Math.min(TINGGI_LATAR - sh, Math.max(sh, k.cy));
  return { cx, cy, s };
}

/** Ubah skala sambil menahan titik latar yang berada di bawah (jx, jy) layar. */
export function zoomDiJangkar(k: Kamera2, sBaru: number, jx: number, jy: number, w: number, h: number): Kamera2 {
  const wx = (jx - w / 2) / k.s + k.cx;
  const wy = (jy - h / 2) / k.s + k.cy;
  return { cx: wx - (jx - w / 2) / sBaru, cy: wy - (jy - h / 2) / sBaru, s: sBaru };
}

/**
 * Satu langkah animasi kamera menuju tujuan (redaman eksponensial, τ detik): pusat linear,
 * skala di ruang log (zoom terasa rata). `selesai` = sudah menempel tujuan (selisih < 0,5 px layar).
 */
export function dekatiKamera(k: Kamera2, tujuan: Kamera2, dt: number, tau = 0.11): { kamera: Kamera2; selesai: boolean } {
  const a = 1 - Math.exp(-Math.max(0, dt) / tau);
  const s = Math.exp(Math.log(k.s) + (Math.log(tujuan.s) - Math.log(k.s)) * a);
  const kamera = { cx: k.cx + (tujuan.cx - k.cx) * a, cy: k.cy + (tujuan.cy - k.cy) * a, s };
  const selesai = Math.abs(kamera.cx - tujuan.cx) * s < 0.5 && Math.abs(kamera.cy - tujuan.cy) * s < 0.5 && Math.abs(kamera.s / tujuan.s - 1) < 0.002;
  return { kamera: selesai ? { ...tujuan } : kamera, selesai };
}

/** Titik latar → piksel wadah. */
export function latarKeWadah(k: Kamera2, sx: number, sy: number, w: number, h: number): { x: number; y: number } {
  return { x: (sx - k.cx) * k.s + w / 2, y: (sy - k.cy) * k.s + h / 2 };
}

/** Titik latar terlihat di wadah dengan pinggiran `pinggir` (pecahan lebar/tinggi). */
export function terlihatDiKamera(k: Kamera2, sx: number, sy: number, w: number, h: number, pinggir = 0.1): boolean {
  const p = latarKeWadah(k, sx, sy, w, h);
  return p.x >= w * pinggir && p.x <= w * (1 - pinggir) && p.y >= h * pinggir && p.y <= h * (1 - pinggir);
}

/** Pusat pandangan satu ruang (sedikit ke atas: dinding belakang ikut terlihat). */
export function pusatRuang(r: Ruang2): { x: number; y: number } {
  const p = keLayar(r.x + r.w / 2, r.y + r.d / 2);
  return { x: p.x, y: p.y - 60 };
}
