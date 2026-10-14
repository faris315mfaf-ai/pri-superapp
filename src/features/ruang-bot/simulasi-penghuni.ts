// ============================================================
// SIMULASI PENGHUNI — pengguna online sebagai karakter (14 Okt 2026). Logika murni.
//
// Server (GET /api/bot/dunia) memberi daftar yang SEDANG ONLINE + aksi yang sedang mereka
// kerjakan. Di sini tiap orang menjadi satu karakter di aula; bila mengerjakan sesuatu ia berjalan
// lewat pintu ke stasiunnya dan beranimasi di sana selama aksi berlangsung (ditambah ekornya),
// lalu kembali ke tempatnya di aula:
//   rak        -> ruang database (mengisi berkas ke rak)
//   autoedit / kompres / blur -> ruang alat (mesin masing-masing)
//   kotak_post -> ruang pos (memasukkan surat ke kotak post)
// Orang baru muncul di pintu depan; yang tidak lagi online berjalan ke pintu lalu menghilang.
// Tidak ada yang dikarang: semua gerak diturunkan dari data server (setDaftar) dan jam server.
// ============================================================

import { aktivitasMasihHidup, type AktivitasDunia, type JenisAnimasi, type PenghuniDunia } from "@/lib/dunia-murni";
import {
  PINTU_MASUK,
  PINTU_SAYAP,
  SLOT_AULA,
  STASIUN_PENGHUNI,
  ikutiJalur,
  zonaDari,
  jalanKeluarPenghuni,
  jalanMasukPenghuni,
  type Badan,
  type JenisStasiunPenghuni,
  type StasiunPenghuni,
  type Titik,
} from "./denah";
import { rupaKarakter, warnaKarakter } from "./karakter-pengguna";
import type { RupaBot } from "./tipe";

const KECEPATAN = 2.4;
/** Tenggang sebelum orang yang tak terlihat lagi dianggap pergi (presence berkedip). */
const TENGGANG_HILANG_DETIK = 25;
/** Lama pudar masuk / keluar (detik). */
const DURASI_PUDAR = 0.8;
const LANGKAH_MAKS = 0.25;
const MAKS_TEKS = 110;

export type KeadaanPenghuni = "masuk" | "jalan" | "diam" | "kerja" | "keluar";

export type Penghuni = Badan & {
  readonly id: number;
  /** Data server terakhir. */
  data: PenghuniDunia;
  rupa: RupaBot;
  warna: string;
  keadaan: KeadaanPenghuni;
  /** Stasiun yang dituju / ditempati; null = di aula. */
  stasiun: StasiunPenghuni | null;
  slot: number;
  /** 0..1 */
  alfa: number;
  /** Teks yang layak muncul di gelembung ("" = tanpa gelembung). */
  teks: string;
  /** Waktu animasi (detik sim) saat mulai bekerja di stasiun. */
  mulaiKerja: number;
};

type Dalam = Penghuni & {
  jalur: Titik[];
  hilangSejak: number | null;
  tujuanSlot: boolean;
};

export type OpsiPenghuni = {
  /** Jam server saat ini (ms epoch). Bawaan: Date.now() + selisih dari setDaftar. */
  sekarangMs?: () => number;
  gerakKurang?: () => boolean;
};

const kunciStasiun = (s: StasiunPenghuni) => `${s.jenis}:${s.idx}`;

/** Teks gelembung dari satu aktivitas. */
export function teksAktivitas(a: AktivitasDunia): string {
  const inti = a.judul ? `${a.label}: ${a.judul}` : a.ringkasan || a.label;
  const tujuan = a.akun ? ` → ${a.akun}` : "";
  const teks = `${inti}${tujuan}`.replace(/\s+/g, " ").trim();
  return teks.length > MAKS_TEKS ? `${teks.slice(0, MAKS_TEKS - 1)}…` : teks;
}

/** Jenis stasiun yang cocok untuk satu jenis animasi (null = tetap di aula). */
export function stasiunUntuk(anim: JenisAnimasi): JenisStasiunPenghuni | null {
  return anim === "layar" ? null : anim;
}

export class SimulasiPenghuni {
  readonly penghuni: Penghuni[] = [];
  /** Jumlah online yang tidak digambar karena aula penuh. */
  diluar = 0;

  private readonly dalam: Dalam[] = [];
  private readonly opsi: OpsiPenghuni;
  private waktu = 0;
  private selisihServer = 0;
  private readonly milikStasiun = new Map<string, number>();
  private readonly milikSlot = new Map<number, number>();

  constructor(opsi: OpsiPenghuni = {}) {
    this.opsi = opsi;
  }

  // ---------- baca ----------

  /** Jam server perkiraan (ms epoch). */
  sekarangMs(): number {
    return this.opsi.sekarangMs ? this.opsi.sekarangMs() : Date.now() + this.selisihServer;
  }

  /** Penghuni yang sedang berdiri di stasiun itu, atau null. */
  penghuniDi(jenis: JenisStasiunPenghuni, idx: number): Penghuni | null {
    const id = this.milikStasiun.get(`${jenis}:${idx}`);
    const p = id === undefined ? undefined : this.dalam.find((x) => x.id === id);
    return p && p.keadaan === "kerja" && p.stasiun?.jenis === jenis && p.stasiun.idx === idx ? p : null;
  }

  /** Ada yang sedang bekerja di salah satu stasiun jenis ini? (menyalakan layar/lampu mesin). */
  adaYangBekerja(jenis: JenisStasiunPenghuni): boolean {
    return this.dalam.some((p) => p.keadaan === "kerja" && p.stasiun?.jenis === jenis);
  }

  /** Teks gelembung untuk penghuni (aksi yang sedang dikerjakan; yang dipilih juga menampilkan layarnya). */
  teksTampil(p: Penghuni, terpilihId: number | null): string {
    if (p.teks) return p.teks;
    if (terpilihId === p.id) return p.data.layar_label ? `Membuka ${p.data.layar_label}` : "Online";
    return "";
  }

  // ---------- kendali dari luar ----------

  /**
   * Cocokkan dengan daftar terbaru dari server. `waktuServerMs` dipakai menghitung selisih jam
   * (aktivitas dinilai dengan jam server, bukan jam perangkat).
   */
  setDaftar(daftar: readonly PenghuniDunia[], waktuServerMs: number, kini: number = Date.now()): void {
    this.selisihServer = waktuServerMs - kini;
    const ada = new Set<number>();
    let tak = 0;
    for (const d of daftar) {
      const lama = this.dalam.find((p) => p.id === d.id);
      if (lama) {
        ada.add(d.id);
        const rupaBerubah = lama.data.karakter !== d.karakter;
        lama.data = d;
        lama.hilangSejak = null;
        if (rupaBerubah) this.pasangRupa(lama);
        if (lama.keadaan === "keluar") this.panggilKembali(lama);
        continue;
      }
      const slot = this.cariSlot(d.id);
      if (slot < 0) {
        tak++;
        continue;
      }
      ada.add(d.id);
      this.lahirkan(d, slot);
    }
    this.diluar = tak;
    for (const p of this.dalam) {
      if (!ada.has(p.id) && p.hilangSejak === null && p.keadaan !== "keluar") p.hilangSejak = this.waktu;
    }
  }

  // ---------- maju ----------

  maju(dt: number): void {
    if (!(dt > 0)) return;
    let sisa = dt;
    while (sisa > 0) {
      const d = Math.min(LANGKAH_MAKS, sisa);
      sisa -= d;
      this.waktu += d;
      for (const p of [...this.dalam]) this.langkah(p, d);
    }
  }

  // ---------- internal ----------

  private pasangRupa(p: Dalam): void {
    p.rupa = rupaKarakter(p.data.karakter);
    p.warna = warnaKarakter(p.data.karakter);
  }

  private cariSlot(id: number): number {
    const n = SLOT_AULA.length;
    const awal = (Math.abs(id) * 7919) % n;
    for (let i = 0; i < n; i++) {
      const k = (awal + i) % n;
      if (!this.milikSlot.has(k)) return k;
    }
    return -1;
  }

  private lahirkan(d: PenghuniDunia, slot: number): void {
    const p = {
      id: d.id,
      data: d,
      rupa: rupaKarakter(d.karakter),
      warna: warnaKarakter(d.karakter),
      x: PINTU_MASUK[0],
      y: PINTU_MASUK[1],
      arah: -1 as 1 | -1,
      belakang: false,
      keadaan: "masuk" as KeadaanPenghuni,
      stasiun: null,
      slot,
      alfa: 0,
      teks: "",
      mulaiKerja: 0,
      jalur: [SLOT_AULA[slot]],
      hilangSejak: null,
      tujuanSlot: true,
    } satisfies Dalam;
    this.milikSlot.set(slot, d.id);
    this.dalam.push(p);
    this.penghuni.push(p);
  }

  private hapus(p: Dalam): void {
    this.lepasStasiun(p);
    this.milikSlot.delete(p.slot);
    const i = this.dalam.indexOf(p);
    if (i >= 0) this.dalam.splice(i, 1);
    const j = this.penghuni.indexOf(p);
    if (j >= 0) this.penghuni.splice(j, 1);
  }

  private lepasStasiun(p: Dalam): void {
    if (p.stasiun) {
      const k = kunciStasiun(p.stasiun);
      if (this.milikStasiun.get(k) === p.id) this.milikStasiun.delete(k);
      p.stasiun = null;
    }
  }

  /** Orang yang tadinya diberangkatkan pulang muncul lagi di daftar: kembali ke aula. */
  private panggilKembali(p: Dalam): void {
    p.keadaan = "jalan";
    p.tujuanSlot = true;
    p.jalur = [...this.keAula(p), SLOT_AULA[p.slot]];
  }

  /** Titik yang harus dilalui supaya orang yang sedang di dalam sebuah ruang kembali ke aula lewat pintunya. */
  private keAula(p: Dalam): Titik[] {
    const z = zonaDari(p.x, p.y);
    const pintu = z === "database" ? PINTU_SAYAP.database : z === "alat" ? PINTU_SAYAP.alat : z === "pos" ? PINTU_SAYAP.pos : null;
    return pintu === null ? [] : [[pintu, 6.9], [pintu, 5.0]];
  }

  /** Aktivitas yang sedang hidup menurut jam server, atau null. */
  private aktivitas(p: Dalam): AktivitasDunia | null {
    const a = p.data.aktivitas;
    return a && aktivitasMasihHidup(a, this.sekarangMs()) ? a : null;
  }

  private ambilStasiun(jenis: JenisStasiunPenghuni, id: number): StasiunPenghuni | null {
    const daftar = STASIUN_PENGHUNI[jenis];
    const awal = Math.abs(id) % daftar.length;
    for (let i = 0; i < daftar.length; i++) {
      const s = daftar[(awal + i) % daftar.length];
      if (!this.milikStasiun.has(kunciStasiun(s))) return s;
    }
    return null;
  }

  private jarak(p: Dalam, dt: number): number {
    return this.opsi.gerakKurang?.() ? Infinity : KECEPATAN * dt;
  }

  private langkah(p: Dalam, dt: number): void {
    // Tidak lagi online cukup lama: pulang lewat pintu depan.
    if (p.hilangSejak !== null && p.keadaan !== "keluar" && this.waktu - p.hilangSejak > TENGGANG_HILANG_DETIK) {
      this.mulaiKeluar(p);
    }
    switch (p.keadaan) {
      case "masuk":
        p.alfa = Math.min(1, p.alfa + dt / DURASI_PUDAR);
        if (ikutiJalur(p, p.jalur, this.jarak(p, dt))) this.tibaDiAula(p);
        break;
      case "jalan":
        p.alfa = Math.min(1, p.alfa + dt / DURASI_PUDAR);
        if (ikutiJalur(p, p.jalur, this.jarak(p, dt))) {
          if (p.stasiun && !p.tujuanSlot) this.tibaDiStasiun(p);
          else this.tibaDiAula(p);
        }
        break;
      case "diam":
        this.putuskan(p);
        break;
      case "kerja":
        this.periksaKerja(p);
        break;
      case "keluar": {
        const selesai = ikutiJalur(p, p.jalur, this.jarak(p, dt));
        // Pudar hanya di ujung perjalanan (dekat pintu) supaya tidak menghilang di tengah aula.
        const dekat = Math.hypot(p.x - PINTU_MASUK[0], p.y - PINTU_MASUK[1]);
        p.alfa = Math.max(0, Math.min(p.alfa, dekat / 1.8));
        if (selesai || p.alfa <= 0) this.hapus(p);
        break;
      }
    }
  }

  private tibaDiAula(p: Dalam): void {
    p.keadaan = "diam";
    p.arah = 1;
    p.belakang = false;
    p.tujuanSlot = true;
    p.teks = "";
  }

  private tibaDiStasiun(p: Dalam): void {
    p.keadaan = "kerja";
    p.mulaiKerja = this.waktu;
    p.arah = -1; // menghadap bagian depan mesin / rak
    p.belakang = true;
    this.periksaKerja(p);
  }

  private mulaiKeluar(p: Dalam): void {
    const jalur: Titik[] = [...this.keAula(p)];
    this.lepasStasiun(p);
    jalur.push(PINTU_MASUK);
    p.jalur = jalur;
    p.keadaan = "keluar";
    p.teks = "";
  }

  /** Di aula: bila ada aksi yang butuh stasiun, berangkat. */
  private putuskan(p: Dalam): void {
    const a = this.aktivitas(p);
    const jenis = a ? stasiunUntuk(a.anim) : null;
    if (!a || !jenis) {
      p.teks = "";
      return;
    }
    const s = this.ambilStasiun(jenis, p.id);
    if (!s) {
      p.teks = `Antre: ${a.label}`;
      return;
    }
    this.milikStasiun.set(kunciStasiun(s), p.id);
    p.stasiun = s;
    p.tujuanSlot = false;
    p.jalur = jalanMasukPenghuni(s);
    p.keadaan = "jalan";
    p.teks = teksAktivitas(a);
  }

  /** Di stasiun: selama aksinya sejenis dan hidup, tetap beranimasi; kalau tidak, pulang ke aula. */
  private periksaKerja(p: Dalam): void {
    const a = this.aktivitas(p);
    const s = p.stasiun;
    if (!s) {
      p.keadaan = "diam";
      return;
    }
    if (a && stasiunUntuk(a.anim) === s.jenis) {
      p.teks = teksAktivitas(a);
      return;
    }
    p.jalur = [...jalanKeluarPenghuni(s), SLOT_AULA[p.slot]];
    this.lepasStasiun(p);
    p.tujuanSlot = true;
    p.keadaan = "jalan";
    p.teks = "";
  }
}

/** "HH:MM:SS" WIB dari ms epoch. */
export function jamWibDetik(ms: number): string {
  const d = new Date(ms + 7 * 3600_000);
  const dua = (n: number) => String(n).padStart(2, "0");
  return `${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())}:${dua(d.getUTCSeconds())}`;
}

/**
 * Waktu di atas nama: aksi yang sedang berjalan = lama berjalannya (m:ss); aksi yang baru selesai =
 * jam selesai (WIB); selainnya jam WIB sekarang. `sekarangMs` = jam server.
 */
export function waktuTag(p: Pick<Penghuni, "data">, sekarangMs: number): string {
  const a = p.data.aktivitas;
  if (a && aktivitasMasihHidup(a, sekarangMs)) {
    if (a.berjalan) {
      const d = Math.max(0, Math.floor((sekarangMs - a.mulai) / 1000));
      return `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;
    }
    if (a.akhir !== null) return jamWibDetik(a.akhir);
  }
  return jamWibDetik(sekarangMs);
}
