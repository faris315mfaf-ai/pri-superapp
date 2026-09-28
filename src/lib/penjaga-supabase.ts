// ============================================================
// PENJAGA SUPABASE (28 Sep 2026). SERVER.
//
// Latar belakang (diukur 28 Sep 2026): instansi Supabase Cloud (Medium,
// 2 CPU berbagi) jenuh di sekitar 45 permintaan REST per detik. CPU-nya
// habis di lapisan API, bukan di Postgres (kerja kueri cuma ±3% CPU).
// Begitu lewat batas itu, kueri sepele melonjak dari 0,2 detik ke 33-76
// detik. Aplikasi lalu memperparah keadaan:
//   1. Tanpa batas waktu: tiap permintaan menunggu sampai 5 menit.
//      Tercatat ±1.766 sambungan menggantung dan 922 permintaan pengguna
//      tertahan sekaligus.
//   2. Tanpa batas antrean: tiap permintaan baru langsung dikirim, jadi
//      antrean di Supabase makin panjang (bola salju).
//   3. Tugas latar (metrik video, rekonsiliasi KPI, sinkron komentar)
//      tetap ngebut saat database sudah megap-megap.
//
// Berkas ini membungkus fetch milik klien Supabase (lib/supabase):
//   - batas waktu per permintaan (termasuk waktu antre): pengguna 20 dtk,
//     latar 45 dtk. Galatnya bernama "AbortError" supaya postgrest-js
//     TIDAK mengulang otomatis (ulangan hanya menambah beban);
//   - batas permintaan bersamaan (semua lajur) + antrean terbatas. Antrean
//     penuh = langsung ditolak, bukan ikut menumpuk;
//   - lajur "latar" (tugas berkala, lihat jalankanLatar) mendapat jatah
//     kecil yang MENGECIL sendiri saat database lambat, dan lajur
//     pengguna selalu dilayani lebih dulu;
//   - ringkasan per menit ke log: permintaan per tabel & lajur, p50/p95,
//     waktu habis, penolakan. Inilah alat ukur "siapa yang paling boros".
//
// Hanya permintaan REST (/rest/v1/) yang dijaga. Storage (unggah video
// puluhan MB) dan lainnya dilewatkan apa adanya.
// ============================================================
import { AsyncLocalStorage } from "node:async_hooks";

export type Lajur = "pengguna" | "latar";
export type Tingkat = "normal" | "lambat" | "macet";

type KonteksLajur = { lajur: Lajur; sumber: string };
const konteksLajur = new AsyncLocalStorage<KonteksLajur>();

/**
 * Jalankan pekerjaan sebagai LAJUR LATAR (tugas berkala / penyapu).
 * Semua kueri Supabase di dalamnya — sedalam apa pun pemanggilannya —
 * ikut jatah latar yang kecil dan mengalah pada permintaan pengguna.
 */
export function jalankanLatar<T>(sumber: string, kerja: () => Promise<T>): Promise<T> {
  return konteksLajur.run({ lajur: "latar", sumber }, kerja);
}

export function lajurSaatIni(): KonteksLajur {
  return konteksLajur.getStore() ?? { lajur: "pengguna", sumber: "" };
}

/**
 * Tugas berkala yang boleh menunggu: saat database MACET, jangan mulai
 * (jawaban siap-kirim), supaya kapasitas yang tersisa untuk pengguna.
 * null = silakan jalan.
 */
export function tundaKarenaMacet(nama: string): { jalan: false; ditunda: true; alasan: string } | null {
  const k = kondisiDb();
  if (k.tingkat !== "macet") return null;
  console.warn(`[latar] ${nama} ditunda: database macet (p50 ${k.p50 ?? "?"} ms, waktu habis ${k.waktuHabis60}/menit)`);
  return { jalan: false, ditunda: true, alasan: "Database sedang lambat — tugas ditunda ke giliran berikutnya." };
}

/** true bila tugas LATAR yang sedang berjalan sebaiknya berhenti sekarang. */
export function latarHarusBerhenti(): boolean {
  return lajurSaatIni().lajur === "latar" && kondisiDb().tingkat === "macet";
}

// ------------------------------------------------------------
// Inti (murni, jam bisa disuntik — diuji di tests/uji-penjaga-supabase.mts)
// ------------------------------------------------------------

export type OpsiPenjaga = {
  /** Permintaan REST bersamaan maksimal, semua lajur. */
  maksTotal: number;
  /** Jatah lajur latar saat database normal (mengecil saat lambat/macet). */
  maksLatar: number;
  /** Panjang antrean maksimal per lajur; lebih dari itu langsung ditolak. */
  maksAntre: Record<Lajur, number>;
  /** Batas waktu total (antre + jawaban) per lajur, ms. */
  batasMs: Record<Lajur, number>;
  kini?: () => number;
};

export const OPSI_BAWAAN: OpsiPenjaga = {
  // PostgREST Supabase memegang 40 sambungan database; lebih dari ini
  // hanya menambah antrean di sisi mereka.
  maksTotal: 40,
  maksLatar: 8,
  maksAntre: { pengguna: 300, latar: 60 },
  batasMs: { pengguna: 20_000, latar: 45_000 },
};

/** Ambang kondisi dari p50 lama jawaban 60 detik terakhir. */
export const AMBANG_LAMBAT_MS = 1_500;
export const AMBANG_MACET_MS = 4_000;
const JENDELA_MS = 60_000;
const MIN_SAMPEL = 5;

/** Galat yang sengaja bernama AbortError: postgrest-js tidak mengulangnya. */
export function galatPenjaga(pesan: string): Error {
  const e = new Error(pesan);
  e.name = "AbortError";
  return e;
}

type Penunggu = {
  lajur: Lajur;
  tenggat: number;
  lanjut: () => void;
  tolak: (e: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

type Sampel = { t: number; ms: number };

export type KondisiDb = {
  tingkat: Tingkat;
  /** Median lama jawaban 60 dtk terakhir (null = sampel belum cukup). */
  p50: number | null;
  waktuHabis60: number;
  aktif: number;
  antre: number;
  jatahLatar: number;
};

export class Penjaga {
  private readonly o: OpsiPenjaga;
  private readonly kini: () => number;
  private aktifTotal = 0;
  private aktifLatar = 0;
  private readonly antrean: Record<Lajur, Penunggu[]> = { pengguna: [], latar: [] };
  private sampel: Sampel[] = [];
  private waktuHabis: number[] = [];

  constructor(opsi: OpsiPenjaga = OPSI_BAWAAN) {
    this.o = opsi;
    this.kini = opsi.kini ?? Date.now;
  }

  private bersihkanJendela() {
    const batas = this.kini() - JENDELA_MS;
    if (this.sampel.length && this.sampel[0].t < batas) this.sampel = this.sampel.filter((s) => s.t >= batas);
    if (this.waktuHabis.length && this.waktuHabis[0] < batas) this.waktuHabis = this.waktuHabis.filter((t) => t >= batas);
    // Batas memori: ribuan permintaan per menit cukup diwakili 2.000 sampel terakhir.
    if (this.sampel.length > 2_000) this.sampel = this.sampel.slice(-2_000);
  }

  kondisi(): KondisiDb {
    this.bersihkanJendela();
    let p50: number | null = null;
    if (this.sampel.length >= MIN_SAMPEL) {
      const urut = this.sampel.map((s) => s.ms).sort((a, b) => a - b);
      p50 = urut[Math.floor(urut.length / 2)];
    }
    const habis = this.waktuHabis.length;
    let tingkat: Tingkat = "normal";
    if ((p50 !== null && p50 >= AMBANG_MACET_MS) || habis >= 5) tingkat = "macet";
    else if ((p50 !== null && p50 >= AMBANG_LAMBAT_MS) || habis >= 1) tingkat = "lambat";
    return {
      tingkat,
      p50,
      waktuHabis60: habis,
      aktif: this.aktifTotal,
      antre: this.antrean.pengguna.length + this.antrean.latar.length,
      jatahLatar: this.jatahLatar(tingkat),
    };
  }

  /** Jatah lajur latar menurut kondisi database: rem otomatis. */
  jatahLatar(tingkat: Tingkat = this.kondisi().tingkat): number {
    if (tingkat === "macet") return 1;
    if (tingkat === "lambat") return Math.min(3, this.o.maksLatar);
    return this.o.maksLatar;
  }

  private bolehMasuk(lajur: Lajur, jatahLatar: number): boolean {
    if (this.aktifTotal >= this.o.maksTotal) return false;
    return lajur === "pengguna" || this.aktifLatar < jatahLatar;
  }

  private masuk(lajur: Lajur) {
    this.aktifTotal += 1;
    if (lajur === "latar") this.aktifLatar += 1;
  }

  /** Bangunkan penunggu yang kini boleh jalan — pengguna lebih dulu. */
  private salurkan() {
    const jatah = this.jatahLatar();
    for (const lajur of ["pengguna", "latar"] as const) {
      const q = this.antrean[lajur];
      while (q.length > 0 && this.bolehMasuk(lajur, jatah)) {
        const p = q.shift()!;
        if (p.timer) clearTimeout(p.timer);
        this.masuk(lajur);
        p.lanjut();
      }
    }
  }

  /**
   * Minta slot. Selesai → WAJIB panggil lepas() yang dikembalikan.
   * Menolak (AbortError) bila antrean penuh atau tenggat lewat saat antre.
   */
  async ambil(lajur: Lajur, tenggat: number): Promise<() => void> {
    let dilepas = false;
    const lepas = () => {
      if (dilepas) return;
      dilepas = true;
      this.aktifTotal -= 1;
      if (lajur === "latar") this.aktifLatar -= 1;
      this.salurkan();
    };
    // Antrean lajur ini kosong dan masih ada slot → langsung jalan.
    if (this.antrean[lajur].length === 0 && this.bolehMasuk(lajur, this.jatahLatar())) {
      this.masuk(lajur);
      return lepas;
    }
    if (this.antrean[lajur].length >= this.o.maksAntre[lajur]) {
      this.catatWaktuHabis();
      throw galatPenjaga("Database sedang penuh — permintaan ditolak supaya antrean tidak menumpuk.");
    }
    await new Promise<void>((lanjut, tolak) => {
      const p: Penunggu = { lajur, tenggat, lanjut, tolak, timer: null };
      const sisa = tenggat - this.kini();
      p.timer = setTimeout(() => {
        const q = this.antrean[lajur];
        const i = q.indexOf(p);
        if (i >= 0) q.splice(i, 1);
        this.catatWaktuHabis();
        tolak(galatPenjaga("Database sedang lambat — waktu tunggu antrean habis."));
      }, Math.max(0, sisa));
      this.antrean[lajur].push(p);
    });
    return lepas;
  }

  catatJawaban(ms: number) {
    this.sampel.push({ t: this.kini(), ms });
  }

  catatWaktuHabis() {
    this.waktuHabis.push(this.kini());
  }

  batasMs(lajur: Lajur): number {
    return this.o.batasMs[lajur];
  }
}

// ------------------------------------------------------------
// Ringkasan per menit (alat ukur)
// ------------------------------------------------------------

/** Nama tabel/rpc dari URL REST: /rest/v1/app_user?… → "app_user". */
export function sasaranRest(url: string): string | null {
  const i = url.indexOf("/rest/v1/");
  if (i < 0) return null;
  const sisa = url.slice(i + 9).split("?")[0] ?? "";
  const bagian = sisa.split("/").filter(Boolean);
  if (bagian.length === 0) return "(akar)";
  return bagian[0] === "rpc" && bagian[1] ? `rpc/${bagian[1]}` : bagian[0];
}

type Hitungan = { n: number; ms: number; gagal: number };

/**
 * "Bentuk" kueri tanpa nilainya: kolom select + nama filter & operatornya.
 * Contoh: app_user?select=id,nama&id=eq → menunjuk titik pemanggil di kode
 * (tabel yang sama dibaca dari puluhan tempat dengan bentuk berbeda).
 */
export function bentukKueri(url: string, metode: string, sasaran: string): string {
  const q = url.indexOf("?");
  if (q < 0) return `${metode} ${sasaran}`;
  const bagian: string[] = [];
  for (const [k, v] of new URLSearchParams(url.slice(q + 1))) {
    if (k === "select") bagian.unshift(`select=${v.slice(0, 80)}`);
    else if (k === "limit" || k === "offset" || k === "order" || k === "on_conflict" || k === "columns") bagian.push(k);
    else bagian.push(`${k}=${v.split(".")[0].slice(0, 12)}`);
  }
  return `${metode} ${sasaran}?${bagian.join("&")}`;
}

export class Pencatat {
  private per = new Map<string, Hitungan>();
  private bentuk = new Map<string, number>();
  private lama: number[] = [];
  private ditolak = 0;
  private habis = 0;
  private antreMaks = 0;
  private mulai: number;
  private readonly kini: () => number;

  constructor(kini: () => number = Date.now) {
    this.kini = kini;
    this.mulai = kini();
  }

  catat(kunci: string, ms: number, gagal: boolean) {
    const h = this.per.get(kunci) ?? { n: 0, ms: 0, gagal: 0 };
    h.n += 1;
    h.ms += ms;
    if (gagal) h.gagal += 1;
    this.per.set(kunci, h);
    if (this.lama.length < 5_000) this.lama.push(ms);
  }

  catatBentuk(b: string) {
    // Batas memori: bentuk kueri terbatas jumlahnya, tapi tetap dijaga.
    if (this.bentuk.size >= 500 && !this.bentuk.has(b)) return;
    this.bentuk.set(b, (this.bentuk.get(b) ?? 0) + 1);
  }

  catatTolak(waktuHabis: boolean) {
    if (waktuHabis) this.habis += 1;
    else this.ditolak += 1;
  }

  catatAntre(n: number) {
    if (n > this.antreMaks) this.antreMaks = n;
  }

  /** Tutup jendela: kembalikan ringkasan lalu mulai jendela baru. null = tidak ada lalu lintas. */
  tutup(kondisi: KondisiDb): Record<string, unknown> | null {
    const detik = Math.max(1, (this.kini() - this.mulai) / 1000);
    const n = [...this.per.values()].reduce((s, h) => s + h.n, 0);
    const hasil =
      n === 0 && this.ditolak === 0 && this.habis === 0
        ? null
        : (() => {
            const urut = [...this.lama].sort((a, b) => a - b);
            const pers = (p: number) => (urut.length ? urut[Math.min(urut.length - 1, Math.floor(urut.length * p))] : 0);
            const atas = [...this.per.entries()]
              .sort((a, b) => b[1].n - a[1].n)
              .slice(0, 15)
              .map(([k, h]) => [k, h.n, Math.round(h.ms / h.n), h.gagal]);
            return {
              n,
              per_dtk: Math.round((n / detik) * 10) / 10,
              p50: pers(0.5),
              p95: pers(0.95),
              antre_maks: this.antreMaks,
              waktu_habis: this.habis,
              ditolak: this.ditolak,
              tingkat: kondisi.tingkat,
              jatah_latar: kondisi.jatahLatar,
              atas,
              // 10 bentuk kueri terbanyak: petunjuk titik pemanggil di kode.
              bentuk_atas: [...this.bentuk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
            };
          })();
    this.per = new Map();
    this.bentuk = new Map();
    this.lama = [];
    this.ditolak = 0;
    this.habis = 0;
    this.antreMaks = 0;
    this.mulai = this.kini();
    return hasil;
  }
}

// ------------------------------------------------------------
// Sambungan ke fetch (dipakai lib/supabase)
// ------------------------------------------------------------

const penjaga = new Penjaga();
const pencatat = new Pencatat();
let ringkasanTerakhir: Record<string, unknown> | null = null;
let pencatatJalan = false;

function nyalakanPencatat() {
  if (pencatatJalan) return;
  pencatatJalan = true;
  const t = setInterval(() => {
    const r = pencatat.tutup(penjaga.kondisi());
    if (!r) return;
    ringkasanTerakhir = { ...r, pada: new Date().toISOString() };
    console.log(`[supabase/menit] ${JSON.stringify(r)}`);
  }, 60_000);
  t.unref?.();
}

/** Kondisi database menurut lalu lintas proses ini (tanpa kueri tambahan). */
export function kondisiDb(): KondisiDb {
  return penjaga.kondisi();
}

/** Ringkasan menit terakhir (untuk /api/sehat & Panel Master). */
export function ringkasanSupabase(): Record<string, unknown> | null {
  return ringkasanTerakhir;
}

/**
 * Buat fetch terjaga untuk satu pasang penjaga & pencatat. Produksi
 * memakai satu pasang milik proses (fetchTerjaga di bawah); uji membuat
 * pasangan sendiri dengan batas waktu pendek.
 */
export function buatFetchTerjaga(penjaga: Penjaga, pencatat: Pencatat, saatDipakai?: () => void) {
  return async function fetchDijaga(masukan: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof masukan === "string" ? masukan : masukan instanceof URL ? masukan.href : masukan.url;
    const sasaran = sasaranRest(url);
    if (!sasaran) return fetch(masukan, init);
    saatDipakai?.();

    const { lajur, sumber } = lajurSaatIni();
    const metode = (init?.method ?? (masukan instanceof Request ? masukan.method : "GET")).toUpperCase();
    const kunci = `${lajur === "latar" ? `latar:${sumber || "?"}` : "pengguna"} ${metode} ${sasaran}`;
    pencatat.catatBentuk(bentukKueri(url, metode, sasaran));
    const tenggat = Date.now() + penjaga.batasMs(lajur);

    let lepas: () => void;
    try {
      lepas = await penjaga.ambil(lajur, tenggat);
    } catch (e) {
      pencatat.catatTolak((e as Error).message.includes("waktu tunggu"));
      throw e;
    }
    pencatat.catatAntre(penjaga.kondisi().antre);

    const pengendali = new AbortController();
    let waktuHabis = false;
    const sisa = Math.max(1_000, tenggat - Date.now());
    const timer = setTimeout(() => {
      waktuHabis = true;
      pengendali.abort();
    }, sisa);
    timer.unref?.();
    const sinyalLuar = init?.signal;
    const sinyal = sinyalLuar ? AbortSignal.any([sinyalLuar, pengendali.signal]) : pengendali.signal;

    const mulai = Date.now();
    try {
      const res = await fetch(masukan, { ...init, signal: sinyal });
      const ms = Date.now() - mulai;
      penjaga.catatJawaban(ms);
      pencatat.catat(kunci, ms, res.status >= 500);
      // Timer sengaja dibiarkan: isi jawaban masih dibaca setelah ini, dan
      // pembacaan yang macet pun harus ikut terputus pada tenggatnya.
      return res;
    } catch (e) {
      const ms = Date.now() - mulai;
      if (waktuHabis) {
        penjaga.catatWaktuHabis();
        pencatat.catatTolak(true);
        throw galatPenjaga(`Database tidak menjawab dalam ${Math.round((tenggat - mulai) / 1000)} detik.`);
      }
      // Dibatalkan pemanggil sendiri (.abortSignal): bukan tanda kesehatan.
      if (sinyalLuar?.aborted) throw e;
      // Galat jaringan juga tanda kesehatan: dihitung sebagai jawaban lambat.
      penjaga.catatJawaban(Math.max(ms, AMBANG_LAMBAT_MS));
      pencatat.catat(kunci, ms, true);
      throw e;
    } finally {
      lepas();
    }
  };
}

/**
 * fetch pengganti untuk klien Supabase (lib/supabase). Permintaan non-REST
 * lewat apa adanya; REST dijaga (antre, batas waktu, statistik).
 */
export const fetchTerjaga = buatFetchTerjaga(penjaga, pencatat, nyalakanPencatat);
