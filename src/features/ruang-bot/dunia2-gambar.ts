// ============================================================
// DUNIA v2 — penggambar satu frame (klien), 16 Okt 2026.
//
// Urutan: latar gedung (modul ruang, dinding dalam sudah dibuang) → objek
// terurut kedalaman (perabot [titik tengah jejak], sekat rendah per tile,
// kusen pintu, bot, Nara, anggota online [aturan dudukan]) → kertas surat
// Nara yang melayang → lapisan malam. Koordinat gambar = piksel latar (1x);
// kamera (geser/zoom) dipasang pemanggil lewat transform konteks.
// ============================================================

import { KONFIG_NARA, konfigBawaan, type KonfigKarakter } from "@/lib/karakter-murni";
import { KASUR2, PERABOT2, kedalamanKarakter, kedalamanPerabot, type JenisStasiunPenghuni2 } from "./denah2";
import type { AsetDunia2 } from "./dunia2-aset";
import {
  KUSEN2,
  RUAS_SEKAT2,
  TINGGI_KUSEN,
  TINGGI_SEKAT,
  frameKeadaan,
  keLayar,
  poseKarakter,
  poseTidur,
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
};

// ---------- frame karakter (cache sinkron di atas perakit async) ----------

const siap = new Map<string, HTMLCanvasElement | "proses">();
const MAKS_SIAP = 600;
const kunciKonfig = (k: KonfigKarakter) => `${k.kulit}${k.rambut}${k.warnaRambut}${k.atasan}${k.warnaAtasan}${k.warnaCelana}${k.warnaSepatu}`;

/** Frame karakter bila sudah dirakit; bila belum, minta dirakit (muncul di frame berikutnya). */
function frameSegera(k: KonfigKarakter, anim: AnimKarakter, arah: ArahKarakter, frame: number): HTMLCanvasElement | null {
  const kunci = `${kunciKonfig(k)}|${anim}|${arah}|${frame}`;
  const ada = siap.get(kunci);
  if (ada && ada !== "proses") return ada;
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

const SEKAT_DEPAN = "#dccdb0";
const SEKAT_SISI = "#cbb994";
const SEKAT_TUTUP = "#8a5a3a";
const GARIS = "#2a2028";

/** Sekat rendah satu tile: muka tegak + tutup kayu, garis tepi gelap. */
function ruasSekat(c: CanvasRenderingContext2D, r: (typeof RUAS_SEKAT2)[number]) {
  const a = r.sumbu === "x" ? keLayar(r.pada, r.dari) : keLayar(r.dari, r.pada);
  const b = r.sumbu === "x" ? keLayar(r.pada, r.sampai) : keLayar(r.sampai, r.pada);
  const h = TINGGI_SEKAT;
  c.fillStyle = r.sumbu === "x" ? SEKAT_SISI : SEKAT_DEPAN;
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.lineTo(b.x, b.y - h);
  c.lineTo(a.x, a.y - h);
  c.closePath();
  c.fill();
  c.fillStyle = SEKAT_TUTUP;
  c.beginPath();
  c.moveTo(a.x, a.y - h);
  c.lineTo(b.x, b.y - h);
  c.lineTo(b.x, b.y - h + 3);
  c.lineTo(a.x, a.y - h + 3);
  c.closePath();
  c.fill();
  c.strokeStyle = GARIS;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(a.x, a.y - h);
  c.lineTo(b.x, b.y - h);
  c.stroke();
}

function kusen(c: CanvasRenderingContext2D, x: number, y: number) {
  const p = keLayar(x, y);
  const px = Math.round(p.x), py = Math.round(p.y);
  c.fillStyle = GARIS;
  c.fillRect(px - 3, py - TINGGI_KUSEN - 1, 6, TINGGI_KUSEN + 1);
  c.fillStyle = SEKAT_TUTUP;
  c.fillRect(px - 2, py - TINGGI_KUSEN, 4, TINGGI_KUSEN);
  c.fillStyle = "#b07a4f";
  c.fillRect(px - 2, py - TINGGI_KUSEN, 1, TINGGI_KUSEN);
}

// ---------- frame ----------

type Objek = { kunci: number; gambar: () => void };

export function gambarFrame2(a: Adegan2): void {
  const { c, aset, t, sim, penghuni } = a;
  c.imageSmoothingEnabled = false;
  c.drawImage(aset.latar, 0, 0);

  const sibukStasiun = (jenis: JenisStasiunPenghuni2, idx: number) => penghuni.penghuniDi(jenis, idx) !== null;
  const mejaSibuk = (tahap: "cari" | "edit" | "posting") => sim.bots.some((b) => b.tempat === tahap && b.keadaan === "bekerja");
  const objek: Objek[] = [];

  for (const p of PERABOT2) {
    const s = aset.perabot.get(p.sprite);
    if (!s) continue;
    const f = p.kunci && s.frames > 1 ? Math.min(s.frames - 1, frameKeadaan(p.kunci, { mejaSibuk, stasiunSibuk: sibukStasiun }, t)) : 0;
    const d = keLayar(p.x + p.tapak[0], p.y + p.tapak[1]);
    objek.push({ kunci: kedalamanPerabot(p), gambar: () => c.drawImage(s.img, f * s.w, 0, s.w, s.h, Math.round(d.x - s.jx), Math.round(d.y - s.jy), s.w, s.h) });
  }
  for (const r of RUAS_SEKAT2) objek.push({ kunci: r.kunci, gambar: () => ruasSekat(c, r) });
  for (const k of KUSEN2) objek.push({ kunci: k.kunci, gambar: () => kusen(c, k.titik[0], k.titik[1]) });

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
      kunci = kedalamanPerabot(PERABOT2.find((p) => p.kunci === `kasur:${kasur}`)!) + 0.01;
    } else {
      pose = poseKarakter(b, b.keadaan === "berjalan");
      kunci = kedalamanKarakter(b.x, b.y, pose.duduk);
    }
    const s = keLayar(titik[0], titik[1]);
    a.posisi.set(b.id, { sx: s.x, sy: s.y });
    const dipilih = a.terpilihId === b.id;
    objek.push({
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
    objek.push({
      kunci: kedalamanKarakter(n.x, n.y, pose.duduk) + 0.002,
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
    objek.push({
      kunci: kedalamanKarakter(p.x, p.y, pose.duduk) + 0.001,
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
    c.fillRect(0, 0, aset.latar.width, aset.latar.height);
  }
}
