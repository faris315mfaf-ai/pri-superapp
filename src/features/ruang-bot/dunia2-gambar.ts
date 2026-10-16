// ============================================================
// DUNIA v2 — penggambar satu frame (klien), 16 Okt 2026.
//
// Urutan: latar gedung (lantai + dinding luar) → objek per LAPISAN RUANG
// (belakang → depan; di tiap ruang: dinding dalamnya [mode rendah/penuh], kusen
// pintunya, lalu perabot [titik tengah jejak], bot, Nara, anggota online
// [aturan dudukan] terurut kedalaman) → kertas surat Nara yang melayang →
// lapisan malam. Koordinat gambar = piksel latar (1x);
// kamera (geser/zoom) dipasang pemanggil lewat transform konteks.
// ============================================================

import { KONFIG_NARA, konfigBawaan, type KonfigKarakter } from "@/lib/karakter-murni";
import { KASUR2, PERABOT2, PINTU2, kedalamanKarakter, kedalamanPerabot, type JenisStasiunPenghuni2 } from "./denah2";
import type { AsetDunia2 } from "./dunia2-aset";
import {
  TINGGI_DINDING_RENDAH,
  TINGGI_PINTU,
  URUT_RUANG2,
  frameKeadaan,
  keLayar,
  kunciLapis,
  lapisDi,
  pemilikPintu,
  poseKarakter,
  poseTidur,
  type ModeDinding,
  type PoseKarakter2,
} from "./dunia2-murni";
import { infoAnimasiSegera, rakitFrame, siapkanKarakter, type AnimKarakter, type ArahKarakter } from "./karakter-sprite";
import type { SimulasiBot } from "./simulasi-bot";
import type { Penghuni, SimulasiPenghuni } from "./simulasi-penghuni";

export const ID_NARA2 = "nara";

export type PosisiLayar2 = { sx: number; sy: number };

export type Adegan2 = {
  c: CanvasRenderingContext2D;
  aset: AsetDunia2;
  /** ms (performance.now) — animasi berulang. */
  t: number;
  sim: SimulasiBot;
  penghuni: SimulasiPenghuni;
  /** Konfigurasi sprite tiap bot (id bot). */
  konfigBot: ReadonlyMap<string, KonfigKarakter>;
  /** Konfigurasi sprite anggota online (pilihan Karakter Saya; bawaan bila tidak ada). */
  konfigPenghuni: (p: Penghuni) => KonfigKarakter;
  terpilihId: string | null;
  terpilihPenghuniId: number | null;
  malam: boolean;
  /** Diisi: posisi kaki di layar (untuk tag nama, gelembung, klik). */
  posisi: Map<string, PosisiLayar2>;
  posisiPenghuni: Map<number, PosisiLayar2>;
  /** Dinding dalam: rendah (bawaan) atau penuh setinggi aslinya. */
  dinding?: ModeDinding;
  /** Persegi latar yang terlihat kamera (px latar); benda di luarnya tidak digambar. Bawaan: seluruh latar. */
  pandang?: { x0: number; y0: number; x1: number; y1: number };
};

// ---------- frame karakter (cache sinkron di atas perakit async) ----------

const siap = new Map<string, HTMLCanvasElement | "proses">();
// Merujuk kanvas yang sama dengan cache perakit (tidak menggandakan memori).
const MAKS_SIAP = 1200;
const kunciKonfig = (k: KonfigKarakter) => `${k.kulit}${k.rambut}${k.warnaRambut}${k.atasan}${k.warnaAtasan}${k.warnaCelana}${k.warnaSepatu}`;

/** Frame karakter bila sudah dirakit; bila belum, minta dirakit (muncul di frame berikutnya). */
function frameSegera(k: KonfigKarakter, anim: AnimKarakter, arah: ArahKarakter, frame: number): HTMLCanvasElement | null {
  const kunci = `${kunciKonfig(k)}|${anim}|${arah}|${frame}`;
  const ada = siap.get(kunci);
  if (ada && ada !== "proses") {
    // LRU: frame yang dipakai pindah ke paling baru, jadi yang dibuang selalu yang lama tak terpakai.
    siap.delete(kunci);
    siap.set(kunci, ada);
    return ada;
  }
  if (!ada) {
    if (siap.size >= MAKS_SIAP) siap.delete(siap.keys().next().value!);
    siap.set(kunci, "proses");
    siapkanKarakter(k)
      .then(() => rakitFrame(k, anim, arah, frame))
      .then((c) => siap.set(kunci, c))
      .catch(() => siap.delete(kunci));
  }
  return null;
}

function frameAnim(anim: AnimKarakter, t: number): number {
  const info = infoAnimasiSegera(anim);
  if (!info || info.frames <= 1) return 0;
  return Math.floor((t / 1000) * info.fps) % info.frames;
}

// ---------- primitif ----------

function bayangan(c: CanvasRenderingContext2D, sx: number, sy: number) {
  c.fillStyle = "rgba(0,0,0,.24)";
  c.beginPath();
  c.ellipse(sx, sy - 1, 13, 5, 0, 0, Math.PI * 2);
  c.fill();
}

function cincinPilih(c: CanvasRenderingContext2D, sx: number, sy: number) {
  c.strokeStyle = "#fde68a";
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(sx, sy - 1, 17, 7, 0, 0, Math.PI * 2);
  c.stroke();
}

function karakter(c: CanvasRenderingContext2D, k: KonfigKarakter, pose: PoseKarakter2, sx: number, sy: number, t: number, alfa = 1) {
  // Frame yang belum selesai dirakit (muat pertama) diganti frame 0 / pose diam supaya tidak berkedip hilang.
  const kanvas =
    frameSegera(k, pose.anim, pose.arah, frameAnim(pose.anim, t)) ??
    frameSegera(k, pose.anim, pose.arah, 0) ??
    frameSegera(k, "idle", pose.arah, 0);
  if (!kanvas) return;
  if (alfa < 1) c.globalAlpha = Math.max(0, alfa);
  c.drawImage(kanvas, Math.round(sx - 32), Math.round(sy - 80));
  c.globalAlpha = 1;
}

const KAYU = "#8a5a3a";
const KAYU_TERANG = "#b07a4f";
const GARIS = "#2a2028";

/** Tiang kusen pintu setinggi h px di titik dunia (x, y). */
function tiangKusen(c: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const p = keLayar(x, y);
  const px = Math.round(p.x), py = Math.round(p.y);
  c.fillStyle = GARIS;
  c.fillRect(px - 3, py - h - 1, 6, h + 1);
  c.fillStyle = KAYU;
  c.fillRect(px - 2, py - h, 4, h);
  c.fillStyle = KAYU_TERANG;
  c.fillRect(px - 2, py - h, 1, h);
}

/** Kusen satu pintu: dua tiang; pada dinding penuh ditambah ambang kayu di atas celah. */
function kusenPintu(c: CanvasRenderingContext2D, p: (typeof PINTU2)[number], mode: ModeDinding) {
  const h = mode === "penuh" ? TINGGI_PINTU : TINGGI_DINDING_RENDAH;
  const [ax, ay] = p.sumbu === "x" ? [p.pada, p.dari] : [p.dari, p.pada];
  const [bx, by] = p.sumbu === "x" ? [p.pada, p.sampai] : [p.sampai, p.pada];
  if (mode === "penuh") {
    const a = keLayar(ax, ay, h), b = keLayar(bx, by, h);
    c.strokeStyle = GARIS;
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(a.x, a.y - 1);
    c.lineTo(b.x, b.y - 1);
    c.stroke();
    c.strokeStyle = KAYU;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(a.x, a.y - 1);
    c.lineTo(b.x, b.y - 1);
    c.stroke();
  }
  tiangKusen(c, ax, ay, h);
  tiangKusen(c, bx, by, h);
}

// ---------- frame ----------

type Objek = { kunci: number; gambar: () => void };

export function gambarFrame2(a: Adegan2): void {
  const { c, aset, t, sim, penghuni } = a;
  c.imageSmoothingEnabled = false;
  // Hanya bagian latar & benda yang terlihat kamera (zoom dekat = jauh lebih ringan).
  const lw = aset.latar.width, lh = aset.latar.height;
  const v = a.pandang ?? { x0: 0, y0: 0, x1: lw, y1: lh };
  const vx0 = Math.max(0, Math.floor(v.x0)), vy0 = Math.max(0, Math.floor(v.y0));
  const vx1 = Math.min(lw, Math.ceil(v.x1)), vy1 = Math.min(lh, Math.ceil(v.y1));
  if (vx1 > vx0 && vy1 > vy0) c.drawImage(aset.latar, vx0, vy0, vx1 - vx0, vy1 - vy0, vx0, vy0, vx1 - vx0, vy1 - vy0);
  const tampak = (x: number, y: number, w: number, h: number) => x < v.x1 && x + w > v.x0 && y < v.y1 && y + h > v.y0;
  const tampakKarakter = (sx: number, sy: number) => tampak(sx - 34, sy - 98, 68, 112);

  const sibukStasiun = (jenis: JenisStasiunPenghuni2, idx: number) => penghuni.penghuniDi(jenis, idx) !== null;
  const mejaSibuk = (tahap: "cari" | "edit" | "posting") => sim.bots.some((b) => b.tempat === tahap && b.keadaan === "bekerja");
  const objek: Objek[] = [];

  for (const p of PERABOT2) {
    const s = aset.perabot.get(p.sprite);
    if (!s) continue;
    const f = p.kunci && s.frames > 1 ? Math.min(s.frames - 1, frameKeadaan(p.kunci, { mejaSibuk, stasiunSibuk: sibukStasiun }, t)) : 0;
    const d = keLayar(p.x + p.tapak[0], p.y + p.tapak[1]);
    if (!tampak(d.x - s.jx, d.y - s.jy, s.w, s.h)) continue;
    const lapis = lapisDi(p.x + p.tapak[0] / 2, p.y + p.tapak[1] / 2);
    objek.push({ kunci: kunciLapis(lapis, kedalamanPerabot(p)), gambar: () => c.drawImage(s.img, f * s.w, 0, s.w, s.h, Math.round(d.x - s.jx), Math.round(d.y - s.jy), s.w, s.h) });
  }
  // Dinding dalam tiap ruang: paling awal di lapisannya (di depan isi ruang belakang, di belakang isi ruangnya).
  const mode = a.dinding ?? "rendah";
  for (const w of aset.dinding[mode]) {
    const lapis = URUT_RUANG2.findIndex((r) => r.kunci === w.kunci);
    if (!tampak(w.x, w.y, w.img.width, w.img.height)) continue;
    objek.push({ kunci: kunciLapis(lapis, -900), gambar: () => c.drawImage(w.img, w.x, w.y) });
  }
  for (const p of PINTU2) {
    const pemilik = pemilikPintu(p);
    if (!pemilik) continue;
    objek.push({ kunci: kunciLapis(URUT_RUANG2.indexOf(pemilik), -800), gambar: () => kusenPintu(c, p, mode) });
  }

  // Bot
  a.posisi.clear();
  for (const b of sim.bots) {
    const konfig = a.konfigBot.get(b.id) ?? konfigBawaan(b.indeks + 1);
    let titik: [number, number] = [b.x, b.y];
    let pose: PoseKarakter2;
    let kunci: number;
    const kasur = sim.terbaring(b) ? KASUR2.findIndex((_, i) => sim.tidurDi(i)?.id === b.id) : -1;
    if (kasur >= 0) {
      const tidur = poseTidur(kasur);
      titik = tidur.titik;
      pose = tidur.pose;
      kunci = kunciLapis(lapisDi(titik[0], titik[1]), kedalamanPerabot(PERABOT2.find((p) => p.kunci === `kasur:${kasur}`)!) + 0.01);
    } else {
      pose = poseKarakter(b, b.keadaan === "berjalan");
      kunci = kunciLapis(lapisDi(b.x, b.y), kedalamanKarakter(b.x, b.y, pose.duduk));
    }
    const s = keLayar(titik[0], titik[1]);
    a.posisi.set(b.id, { sx: s.x, sy: s.y });
    const dipilih = a.terpilihId === b.id;
    if (tampakKarakter(s.x, s.y)) objek.push({
      kunci,
      gambar: () => {
        if (!pose.duduk && kasur < 0) bayangan(c, s.x, s.y);
        if (dipilih) cincinPilih(c, s.x, s.y);
        karakter(c, konfig, pose, s.x, s.y, t);
      },
    });
  }

  // Nara
  {
    const n = sim.nara;
    const pose = poseKarakter(n, n.keadaan === "jalan");
    const s = keLayar(n.x, n.y);
    a.posisi.set(ID_NARA2, { sx: s.x, sy: s.y });
    if (tampakKarakter(s.x, s.y)) objek.push({
      kunci: kunciLapis(lapisDi(n.x, n.y), kedalamanKarakter(n.x, n.y, pose.duduk) + 0.002),
      gambar: () => {
        if (!pose.duduk) bayangan(c, s.x, s.y);
        karakter(c, KONFIG_NARA, pose, s.x, s.y, t);
      },
    });
  }

  // Anggota online
  a.posisiPenghuni.clear();
  for (const p of penghuni.penghuni) {
    const berjalan = p.keadaan === "masuk" || p.keadaan === "jalan" || p.keadaan === "keluar";
    const pose = poseKarakter(p, berjalan);
    const s = keLayar(p.x, p.y);
    a.posisiPenghuni.set(p.id, { sx: s.x, sy: s.y });
    const konfig = a.konfigPenghuni(p);
    const dipilih = a.terpilihPenghuniId === p.id;
    if (tampakKarakter(s.x, s.y)) objek.push({
      kunci: kunciLapis(lapisDi(p.x, p.y), kedalamanKarakter(p.x, p.y, pose.duduk) + 0.001),
      gambar: () => {
        if (p.alfa > 0.3 && !pose.duduk) bayangan(c, s.x, s.y);
        if (dipilih) cincinPilih(c, s.x, s.y);
        karakter(c, konfig, pose, s.x, s.y, t, p.alfa);
      },
    });
  }

  objek.sort((p, q) => p.kunci - q.kunci);
  for (const o of objek) o.gambar();

  // Kertas surat tugas Nara (melengkung di atas kepala)
  const kertas = sim.nara.kertas;
  if (kertas) {
    const u = Math.min(1, Math.max(0, (sim.nara.waktu - kertas.t0) / kertas.dur));
    const x = kertas.x0 + (kertas.x1 - kertas.x0) * u;
    const y = kertas.y0 + (kertas.y1 - kertas.y0) * u;
    const p = keLayar(x, y, 52 + Math.sin(u * Math.PI) * 26);
    c.fillStyle = GARIS;
    c.fillRect(Math.round(p.x) - 6, Math.round(p.y) - 5, 12, 10);
    c.fillStyle = "#f6f1e4";
    c.fillRect(Math.round(p.x) - 5, Math.round(p.y) - 4, 10, 8);
    c.fillStyle = "#dc2626";
    c.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 2, 6, 1);
  }

  if (a.malam) {
    c.fillStyle = "rgba(10,12,40,.42)";
    c.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  }
}
