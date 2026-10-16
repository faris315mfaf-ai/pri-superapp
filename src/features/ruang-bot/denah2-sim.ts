// ============================================================
// DENAH v2 UNTUK SIMULASI (16 Okt 2026) — DenahSim di atas denah2.ts.
// Semua perpindahan memakai pencarian jalan A* (cariJalan) dengan cache;
// titik serah surat Nara dipilih di sekitar bot (terjangkau, tidak terhalang).
// ============================================================

import type { DenahSim, StasiunSim } from "./denah-sim";
import {
  KASUR2,
  KURSI_NARA_RAPAT2,
  KURSI_RAPAT2,
  LEBAR_DUNIA,
  MEJA_KOORDINATOR2,
  PAPAN_TUGAS2,
  PINTU_MASUK2,
  SLOT_AULA2,
  STASIUN2,
  STASIUN_PENGHUNI2,
  TEMPAT_ANTRE2,
  TERHALANG2,
  TITIK_TENGAH2,
  cariJalan,
  ruangDi,
  type Titik,
} from "./denah2";
import type { TahapBot, TempatBot } from "./tipe";

const MAKS_CACHE = 4000;
const cache = new Map<string, Titik[]>();

/** Jalan a→b (tanpa a, berakhir di b); salinan baru tiap panggilan. Tak tersambung → langsung ke b. */
export function jalan2(a: Titik, b: Titik): Titik[] {
  const k = `${a[0].toFixed(2)},${a[1].toFixed(2)}>${b[0].toFixed(2)},${b[1].toFixed(2)}`;
  let j = cache.get(k);
  if (!j) {
    j = cariJalan(a, b) ?? [b];
    if (cache.size >= MAKS_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(k, j);
  }
  return j.map((p): Titik => [p[0], p[1]]);
}

function titikKursi2(t: TempatBot, idx: number): Titik {
  if (t === "rapat") return KURSI_RAPAT2[idx]!.titik;
  if (t === "tidur") return KASUR2[idx]!.berdiri;
  return STASIUN2[t][idx]!.titik;
}

const NAMA_TEMPAT: Record<TempatBot, string> = {
  cari: "meja pencarian",
  edit: "meja edit",
  posting: "meja posting",
  istirahat: "sofa istirahat",
  rapat: "ruang meeting",
  tidur: "ruang istirahat",
};

/** Titik berdiri Nara saat menyerahkan surat: dekat bot, satu sisi gedung, terjangkau dari papan. */
function titikSerah(bot: { x: number; y: number }, dari: Titik): Titik {
  const r = ruangDi(bot.x, bot.y);
  let terbaik: { titik: Titik; panjang: number } | null = null;
  for (const jarak of [0.9, 1.3, 1.8]) {
    for (let k = 0; k < 8; k++) {
      const s = (k * Math.PI) / 4;
      const t: Titik = [Number((bot.x + Math.cos(s) * jarak).toFixed(2)), Number((bot.y + Math.sin(s) * jarak).toFixed(2))];
      const rt = ruangDi(t[0], t[1]);
      if (!rt || (r && rt.sisi !== r.sisi)) continue;
      if (TERHALANG2.has(Math.floor(t[1]) * LEBAR_DUNIA + Math.floor(t[0]))) continue;
      const j = cariJalan(dari, t);
      if (!j) continue;
      let panjang = 0;
      let a = dari;
      for (const p of j) { panjang += Math.hypot(p[0] - a[0], p[1] - a[1]); a = p; }
      if (!terbaik || panjang < terbaik.panjang) terbaik = { titik: t, panjang };
    }
    if (terbaik) break;
  }
  return terbaik?.titik ?? TITIK_TENGAH2;
}

const kursiNara = MEJA_KOORDINATOR2.kursi.titik;
const papan = PAPAN_TUGAS2.titik;
const rapatNara = KURSI_NARA_RAPAT2.titik;

export const DENAH_SIM_V2: DenahSim = {
  bot: {
    kapasitas: { rapat: KURSI_RAPAT2.length, tidur: KASUR2.length },
    kursiPerTahap: { cari: STASIUN2.cari.length, edit: STASIUN2.edit.length, posting: STASIUN2.posting.length, istirahat: STASIUN2.istirahat.length } satisfies Record<TahapBot, number>,
    namaTempat: (t) => NAMA_TEMPAT[t],
    titikTengah: TITIK_TENGAH2,
    tempatAntre: TEMPAT_ANTRE2,
    jalanMasuk: (t, i) => jalan2(TITIK_TENGAH2, titikKursi2(t, i)),
    jalanKeluar: (t, i) => jalan2(titikKursi2(t, i), TITIK_TENGAH2).slice(0, -1),
    titikKursi: titikKursi2,
  },
  nara: {
    kursiMeja: kursiNara,
    mejaKePapan: () => jalan2(kursiNara, papan),
    mejaKeRapat: () => jalan2(kursiNara, rapatNara),
    papanKeMeja: () => jalan2(papan, kursiNara),
    papanKeBot: (bot) => jalan2(papan, titikSerah(bot, papan)),
    serahKeMeja: (dari) => jalan2(dari, kursiNara),
    rapatKePapan: () => jalan2(rapatNara, papan),
    rapatKeMeja: () => jalan2(rapatNara, kursiNara),
  },
  penghuni: {
    pintuMasuk: PINTU_MASUK2,
    slotAula: SLOT_AULA2,
    stasiun: STASIUN_PENGHUNI2 as Record<keyof typeof STASIUN_PENGHUNI2, readonly StasiunSim[]>,
    jalanKeStasiun: (dari, s) => jalan2(dari, s.titik),
    jalanKeSlot: (dari, slot) => jalan2(dari, slot),
    jalanKePintu: (dari) => jalan2(dari, PINTU_MASUK2),
  },
};
