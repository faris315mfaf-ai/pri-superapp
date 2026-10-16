// ============================================================
// DENAH UNTUK SIMULASI — antarmuka yang dipakai SimulasiBot, SimulasiNara &
// SimulasiPenghuni (16 Okt 2026). Simulasi tidak lagi mengimpor tata letak
// langsung, sehingga dunia lama (denah.ts, rute tulis tangan) dan dunia v2
// (denah2.ts, A*) memakai logika tugas / antre / rapat yang SAMA.
//
// DENAH_SIM_V1 mengembalikan rute lama persis seperti sebelumnya (uji lama
// tetap berlaku tanpa diubah). DENAH_SIM_V2 ada di denah2-sim.ts.
// ============================================================

import {
  JALAN_KELUAR_RAPAT_NARA,
  JALAN_KERJA_KE_KOORDINATOR,
  JALAN_KOORDINATOR_KE_KERJA,
  JALAN_MASUK_RAPAT_NARA,
  JALAN_MEJA_KE_PAPAN,
  JALAN_PAPAN_KE_KERJA,
  JALAN_PAPAN_KE_MEJA,
  JALAN_PULANG_KE_MEJA,
  KAPASITAS,
  MEJA_KOORDINATOR,
  PINTU_KERJA_MEETING,
  PINTU_MASUK,
  PINTU_SAYAP,
  SLOT_AULA,
  STASIUN,
  STASIUN_PENGHUNI,
  TEMPAT_ANTRE,
  TITIK_TENGAH,
  jalanKeluar,
  jalanMasuk,
  jalanMasukPenghuni,
  titikKursi,
  zonaDari,
  type JenisStasiunPenghuni,
  type StasiunPenghuni,
  type Titik,
} from "./denah";
import type { TahapBot, TempatBot } from "./tipe";

/** Tata letak yang dibutuhkan SimulasiBot. */
export interface DenahBot {
  readonly kapasitas: Readonly<Record<"rapat" | "tidur", number>>;
  /** Jumlah kursi per tempat kerja (meja = 1, sofa = 2). */
  readonly kursiPerTahap: Readonly<Record<TahapBot, number>>;
  /** Nama tempat untuk teks antre ("meja pencarian", …). */
  namaTempat(t: TempatBot): string;
  /** Titik temu; semua jalan bot lewat sini. */
  readonly titikTengah: Titik;
  readonly tempatAntre: readonly Titik[];
  /** Dari titikTengah (tidak termasuk) sampai kursi. */
  jalanMasuk(t: TempatBot, idx: number): Titik[];
  /** Dari kursi sampai SEBELUM titikTengah. */
  jalanKeluar(t: TempatBot, idx: number): Titik[];
  titikKursi(t: TempatBot, idx: number): Titik;
}

/** Tata letak yang dibutuhkan SimulasiNara (perpindahan bernama). */
export interface DenahNara {
  readonly kursiMeja: Titik;
  mejaKePapan(): Titik[];
  mejaKeRapat(): Titik[];
  papanKeMeja(): Titik[];
  /** Dari papan ke titik serah di dekat bot. */
  papanKeBot(bot: { x: number; y: number }): Titik[];
  /** Dari titik serah (posisi Nara sekarang) pulang ke kursi meja. */
  serahKeMeja(dari: Titik): Titik[];
  rapatKePapan(): Titik[];
  rapatKeMeja(): Titik[];
}

/** Stasiun anggota sejauh yang dibutuhkan simulasi. */
export type StasiunSim = { readonly jenis: JenisStasiunPenghuni; readonly idx: number; readonly titik: Titik };

/** Tata letak yang dibutuhkan SimulasiPenghuni. */
export interface DenahPenghuni {
  readonly pintuMasuk: Titik;
  readonly slotAula: readonly Titik[];
  readonly stasiun: Readonly<Record<JenisStasiunPenghuni, readonly StasiunSim[]>>;
  /** Dari posisi sekarang (di aula) ke stasiun. */
  jalanKeStasiun(dari: Titik, s: StasiunSim): Titik[];
  /** Dari posisi sekarang (di mana pun) kembali ke slot aula. */
  jalanKeSlot(dari: Titik, slot: Titik): Titik[];
  /** Dari posisi sekarang ke pintu masuk (pergi). */
  jalanKePintu(dari: Titik): Titik[];
}

export type DenahSim = { bot: DenahBot; nara: DenahNara; penghuni: DenahPenghuni };

// ---------- v1: denah lama, rute tulis tangan (perilaku persis seperti sebelumnya) ----------

const jepit = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Titik keluar ruang sayap menuju aula (lewat pintunya); [] bila sudah di aula. */
function keAulaV1(dari: Titik): Titik[] {
  const z = zonaDari(dari[0], dari[1]);
  const pintu = z === "database" ? PINTU_SAYAP.database : z === "alat" ? PINTU_SAYAP.alat : z === "pos" ? PINTU_SAYAP.pos : null;
  return pintu === null ? [] : [[pintu, 6.9], [pintu, 5.0]];
}

export const DENAH_SIM_V1: DenahSim = {
  bot: {
    kapasitas: KAPASITAS,
    kursiPerTahap: { cari: STASIUN.cari.kursi.length, edit: STASIUN.edit.kursi.length, posting: STASIUN.posting.kursi.length, istirahat: STASIUN.istirahat.kursi.length },
    namaTempat: (t) => (t === "tidur" ? "kamar tidur" : t === "rapat" ? "ruang meeting" : STASIUN[t].nama.toLowerCase()),
    titikTengah: TITIK_TENGAH,
    tempatAntre: TEMPAT_ANTRE,
    jalanMasuk,
    jalanKeluar,
    titikKursi,
  },
  nara: {
    kursiMeja: MEJA_KOORDINATOR.kursi,
    mejaKePapan: () => [...JALAN_MEJA_KE_PAPAN],
    mejaKeRapat: () => [...JALAN_KOORDINATOR_KE_KERJA, TITIK_TENGAH, ...JALAN_MASUK_RAPAT_NARA],
    papanKeMeja: () => [...JALAN_PAPAN_KE_MEJA],
    papanKeBot: (bot) => {
      const menuju: Titik[] =
        zonaDari(bot.x, bot.y) === "kerja"
          ? [[jepit(bot.x + 0.6, 0.5, 9.4), jepit(bot.y + 0.7, 0.5, 9.4)]]
          : [...PINTU_KERJA_MEETING]; // bot di ruang lain: serahkan dari pintu
      return [...JALAN_PAPAN_KE_KERJA, TITIK_TENGAH, ...menuju];
    },
    // Dari ruang kerja atau dari pintu ruang meeting: sama-sama lewat titik tengah.
    serahKeMeja: (dari) => [...(dari[0] > 10 ? [PINTU_KERJA_MEETING[0]] : []), TITIK_TENGAH, ...JALAN_PULANG_KE_MEJA],
    rapatKePapan: () => [...JALAN_KELUAR_RAPAT_NARA, TITIK_TENGAH, ...JALAN_KERJA_KE_KOORDINATOR, ...JALAN_MEJA_KE_PAPAN.slice(1)],
    rapatKeMeja: () => [...JALAN_KELUAR_RAPAT_NARA, TITIK_TENGAH, ...JALAN_PULANG_KE_MEJA],
  },
  penghuni: {
    pintuMasuk: PINTU_MASUK,
    slotAula: SLOT_AULA,
    stasiun: STASIUN_PENGHUNI,
    jalanKeStasiun: (_dari, s) => jalanMasukPenghuni(s as StasiunPenghuni),
    jalanKeSlot: (dari, slot) => [...keAulaV1(dari), slot],
    jalanKePintu: (dari) => [...keAulaV1(dari), PINTU_MASUK],
  },
};
