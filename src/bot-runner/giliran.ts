// ============================================================
// RUMAH BOT (runner) — MESIN GILIRAN (13 Okt 2026).
//
// Runner TIDAK menyimpan keadaan penting: semua ada di aplikasi. Tiap bot aktif
// punya satu tugas asinkron sendiri (tidak saling memblokir) yang berputar:
//   ambil_kerja -> jalankan perintah -> lapor -> (diam: tunggu).
// Perintah: diam | panen | buat_video | pantau_job (lihat lib/bot-protokol.ts).
//
// Gagal tertutup: denyut gagal 3 kali berturut-turut ATAU aplikasi menjawab
// jeda_global -> semua bot berhenti bekerja; denyut tetap dicoba dengan backoff.
// Semua ketergantungan (aplikasi, mesin, pemanen, waktu) disuntikkan supaya
// seluruh logika bisa diuji tanpa jaringan.
// ============================================================

import type { JawabanDenyut, PerintahRunner, SumberPanen } from "../lib/bot-protokol";
import { GalatApp, GalatMesin, kodeGagalDariHttp, pesanGalat } from "./galat";
import type { KlienApp } from "./klien-app";
import { deteksiJobBaru, nilaiJob, siapkanHook, type KeadaanMesin, type KlienMesin } from "./klien-mesin";
import { bentukLaporanKandidat, type HasilPanen } from "./pemanen";

/** Batas yang sama dengan BATAS_PROTOKOL di lib/bot-protokol.ts (disalin: tanpa impor nilai). */
const MAKS_SUMBER_PER_PANEN = 10;
const MAKS_NASKAH = 4000;
const GAGAL_DENYUT_BERHENTI = 3;

export type PengaturanGiliran = {
  /** Jeda bot bila perintah "diam" (ms). */
  jedaDiamMs: number;
  /** Lama maksimal satu langkah pantau_job sebelum kembali ke aplikasi (ms). */
  pantauMaksMs: number;
  /** Selang polling stok mesin (ms). */
  pantauSelangMs: number;
  /** Jeda antar-sumber saat panen (ms). */
  jedaAntarSumberMs: number;
  /** Jeda singkat setelah perintah yang mengerjakan sesuatu (ms). */
  jedaSetelahKerjaMs: number;
};

export const PENGATURAN_BAWAAN: PengaturanGiliran = {
  jedaDiamMs: 15_000,
  pantauMaksMs: 60_000,
  pantauSelangMs: 4_000,
  jedaAntarSumberMs: 2_000,
  jedaSetelahKerjaMs: 1_000,
};

export type DepGiliran = {
  app: KlienApp;
  mesin: KlienMesin;
  pemanen: { panen(s: SumberPanen): Promise<HasilPanen> };
  /** Tidur; boleh selesai lebih awal saat runner dihentikan. */
  tidur(ms: number): Promise<void>;
  sekarang(): number;
  log(teks: string): void;
  pengaturan?: Partial<PengaturanGiliran>;
};

/** Keadaan kecil di memori (hilang bila runner restart — tidak apa-apa). */
export type KeadaanGiliran = {
  /** tugas_id -> berapa polling berturut-turut job tidak ada di jobs[] maupun stok[]. */
  hilang: Map<number, number>;
  /** Diisi true saat runner diminta berhenti: langkah panjang berhenti di batas aman. */
  harusBerhenti: () => boolean;
};

export type HasilPerintah = "diam" | "kerja";

function atur(dep: DepGiliran): PengaturanGiliran {
  return { ...PENGATURAN_BAWAAN, ...(dep.pengaturan ?? {}) };
}

/** Laporan best-effort: kegagalan melapor dicatat, tidak melempar. */
async function laporAman(dep: DepGiliran, botId: number, laporan: Parameters<KlienApp["lapor"]>[1]): Promise<boolean> {
  try {
    await dep.app.lapor(botId, laporan);
    return true;
  } catch (e) {
    dep.log(`bot ${botId}: gagal melapor ${laporan.jenis}: ${pesanGalat(e, 160)}`);
    return false;
  }
}

function kodeDanPesan(e: unknown, tahap: string): { kode: ReturnType<typeof kodeGagalDariHttp>; pesan: string } {
  if (e instanceof GalatMesin) return { kode: kodeGagalDariHttp(e.status, e.detail), pesan: `${tahap}: ${e.detail}`.slice(0, 300) };
  return { kode: "lainnya", pesan: `${tahap}: ${pesanGalat(e, 200)}` };
}

// ---- Perintah: panen ----

async function lakukanPanen(botId: number, sumber: SumberPanen[], dep: DepGiliran, ker: KeadaanGiliran): Promise<void> {
  const p = atur(dep);
  const dihentikan = new Set<string>();
  const daftar = sumber.slice(0, MAKS_SUMBER_PER_PANEN);
  for (let i = 0; i < daftar.length; i++) {
    if (ker.harusBerhenti()) return;
    const s = daftar[i];
    const platform = String(s.platform).toLowerCase();
    let hasil: HasilPanen;
    let menjalankan = false;
    if (dihentikan.has(platform)) {
      hasil = { kandidat: [], jenis: "dilewati", galat: "dilewati: platform ini sedang dibatasi pada putaran ini" };
    } else {
      hasil = await dep.pemanen.panen(s);
      menjalankan = hasil.jenis !== "handle_tak_sah" && hasil.jenis !== "dilewati";
      if (hasil.jenis === "dibatasi" || hasil.jenis === "login") {
        dihentikan.add(platform);
        dep.log(`panen ${s.platform}/${s.handle}: ${hasil.galat ?? hasil.jenis}`);
      }
    }
    await laporAman(dep, botId, bentukLaporanKandidat(s.id, hasil.kandidat, hasil.galat));
    // Jeda sopan antar-permintaan bila yt-dlp benar-benar dijalankan.
    if (menjalankan && i < daftar.length - 1) await dep.tidur(p.jedaAntarSumberMs);
  }
}

// ---- Perintah: buat_video ----

async function lakukanBuatVideo(
  botId: number,
  perintah: Extract<PerintahRunner, { perintah: "buat_video" }>,
  dep: DepGiliran,
): Promise<void> {
  const { tugas_id: tugasId, id_pengguna_mesin: idPengguna } = perintah;
  const gagal = (kode: ReturnType<typeof kodeGagalDariHttp>, pesan: string) =>
    laporAman(dep, botId, { jenis: "job_gagal", tugas_id: tugasId, kode, pesan });

  // 1. Hook dari naskah.
  let hook: string;
  try {
    hook = await dep.mesin.buatHook(idPengguna, perintah.naskah.slice(0, MAKS_NASKAH));
  } catch (e) {
    const g = kodeDanPesan(e, "hook");
    await gagal(g.kode === "sumber_ditolak" ? "lainnya" : g.kode, g.pesan);
    return;
  }
  hook = siapkanHook(hook);

  // 2. Keadaan SEBELUM (untuk mengenali job baru dari selisih).
  let sebelum: KeadaanMesin;
  try {
    sebelum = await dep.mesin.ambilKeadaan(idPengguna);
  } catch (e) {
    const g = kodeDanPesan(e, "baca stok");
    await gagal(g.kode, g.pesan);
    return;
  }

  // 3. Buat job. Waktu habis (status 0) ambigu: job mungkin terbentuk -> baca ulang.
  let sesudah: KeadaanMesin;
  try {
    sesudah = await dep.mesin.buatJob(idPengguna, {
      url: perintah.url,
      hook,
      sumber: perintah.sumber_label,
      kategori: perintah.kategori,
    });
  } catch (e) {
    if (e instanceof GalatMesin && e.status === 0) {
      try {
        sesudah = await dep.mesin.ambilKeadaan(idPengguna);
      } catch (e2) {
        const g = kodeDanPesan(e2, "buat job");
        await gagal(g.kode, g.pesan);
        return;
      }
    } else {
      const g = kodeDanPesan(e, "buat job");
      await gagal(g.kode, g.pesan);
      return;
    }
  }

  // 4. Kenali job baru.
  const job = deteksiJobBaru(sebelum, sesudah, hook);
  if (!job) {
    await gagal("hilang", "job baru tidak terdeteksi di mesin setelah dibuat");
    return;
  }
  await laporAman(dep, botId, { jenis: "job_dibuat", tugas_id: tugasId, id_job_mesin: job.job_id, hook });
}

// ---- Perintah: pantau_job ----

async function lakukanPantau(
  botId: number,
  perintah: Extract<PerintahRunner, { perintah: "pantau_job" }>,
  dep: DepGiliran,
  ker: KeadaanGiliran,
): Promise<void> {
  const p = atur(dep);
  const { tugas_id: tugasId, id_pengguna_mesin: idPengguna } = perintah;
  let idJob = perintah.id_job_mesin;
  const hook = perintah.hook;
  if (!idJob && !hook) {
    ker.hilang.delete(tugasId);
    await laporAman(dep, botId, { jenis: "job_gagal", tugas_id: tugasId, kode: "hilang", pesan: "tidak ada id job maupun hook untuk dipantau" });
    return;
  }
  const batas = dep.sekarang() + p.pantauMaksMs;
  let galatBeruntun = 0;
  let idDilaporkan = Boolean(idJob);

  while (dep.sekarang() < batas && !ker.harusBerhenti()) {
    let keadaan: KeadaanMesin;
    try {
      keadaan = await dep.mesin.ambilKeadaan(idPengguna);
      galatBeruntun = 0;
    } catch (e) {
      galatBeruntun++;
      dep.log(`pantau tugas ${tugasId}: mesin tidak terbaca (${galatBeruntun}): ${pesanGalat(e, 120)}`);
      // Galat sementara tidak menjadikan job gagal; kembali ke aplikasi bila terus-menerus.
      if (galatBeruntun >= 3) return;
      await dep.tidur(p.pantauSelangMs);
      continue;
    }
    const n = nilaiJob(keadaan, idJob, hook);
    if (n.jenis === "selesai") {
      ker.hilang.delete(tugasId);
      await laporAman(dep, botId, {
        jenis: "job_selesai",
        tugas_id: tugasId,
        id_stok_mesin: n.idStok,
        durasi_detik: n.durasi === null ? null : Math.round(n.durasi),
        ukuran_byte: n.ukuran === null ? null : Math.round(n.ukuran),
      });
      return;
    }
    if (n.jenis === "gagal") {
      ker.hilang.delete(tugasId);
      await laporAman(dep, botId, { jenis: "job_gagal", tugas_id: tugasId, kode: "job_error", pesan: n.pesan });
      return;
    }
    if (n.jenis === "berjalan") {
      ker.hilang.delete(tugasId);
      if (!idJob) {
        // Job ditemukan lewat hook: laporkan idnya dulu supaya aplikasi mencatat.
        idJob = n.idJob;
      }
      if (!idDilaporkan && hook) {
        idDilaporkan = true;
        await laporAman(dep, botId, { jenis: "job_dibuat", tugas_id: tugasId, id_job_mesin: n.idJob, hook });
      }
    } else {
      // tidak_ada: job gagal HILANG dari jobs[] tanpa muncul di stok[] -> gagal setelah 2 polling berturut-turut.
      const jumlah = (ker.hilang.get(tugasId) ?? 0) + 1;
      ker.hilang.set(tugasId, jumlah);
      if (jumlah >= 2) {
        ker.hilang.delete(tugasId);
        await laporAman(dep, botId, {
          jenis: "job_gagal",
          tugas_id: tugasId,
          kode: "hilang",
          pesan: "job tidak ada di antrean maupun stok mesin (kemungkinan gagal render)",
        });
        return;
      }
    }
    await dep.tidur(p.pantauSelangMs);
  }
}

// ---- Satu langkah satu bot ----

/** Menjalankan satu perintah dari aplikasi. */
export async function jalankanPerintah(botId: number, perintah: PerintahRunner, dep: DepGiliran, ker: KeadaanGiliran): Promise<HasilPerintah> {
  switch (perintah.perintah) {
    case "diam":
      return "diam";
    case "panen":
      await lakukanPanen(botId, perintah.sumber, dep, ker);
      return "kerja";
    case "buat_video":
      await lakukanBuatVideo(botId, perintah, dep);
      return "kerja";
    case "pantau_job":
      await lakukanPantau(botId, perintah, dep, ker);
      return "kerja";
  }
}

/** ambil_kerja lalu jalankan. Galat aplikasi dilempar ke pemanggil. */
export async function langkahBot(botId: number, dep: DepGiliran, ker: KeadaanGiliran): Promise<HasilPerintah> {
  const perintah = await dep.app.ambilKerja(botId);
  if (ker.harusBerhenti()) return "diam";
  return jalankanPerintah(botId, perintah, dep, ker);
}

// ---- Selang denyut ----

/** Selang denyut berikutnya: normal bila sehat; berlipat dua per kegagalan, maksimum 2 menit. */
export function selangDenyutBerikut(gagalBeruntun: number, dasarMs: number): number {
  if (gagalBeruntun <= 0) return dasarMs;
  return Math.min(120_000, dasarMs * 2 ** Math.min(gagalBeruntun, 6));
}

// ---- Penjadwal ----

type EntriBot = { henti: boolean; janji: Promise<void> };

export class Penjadwal {
  private readonly bot = new Map<number, EntriBot>();
  private readonly ker: KeadaanGiliran;
  private dihentikan = false;
  /** Boleh bekerja? false = gagal tertutup (denyut gagal 3x / jeda global). */
  bekerja = false;
  gagalDenyut = 0;
  alasanDiam = "belum denyut";

  constructor(private readonly dep: DepGiliran) {
    this.ker = { hilang: new Map(), harusBerhenti: () => this.dihentikan };
  }

  get jumlahBotBerjalan(): number {
    return this.bot.size;
  }

  private hentikanTugasBot(id: number): void {
    const e = this.bot.get(id);
    if (e) e.henti = true;
  }

  /** Satu denyut. Mengembalikan jawaban (atau null bila gagal). */
  async denyut(): Promise<JawabanDenyut | null> {
    let j: JawabanDenyut;
    try {
      j = await this.dep.app.denyut();
    } catch (e) {
      this.gagalDenyut++;
      this.dep.log(`denyut gagal (${this.gagalDenyut}x): ${pesanGalat(e, 160)}${e instanceof GalatApp && e.status === 401 ? " (periksa BOT_RUNNER_SECRET / jam server)" : ""}`);
      if (this.gagalDenyut >= GAGAL_DENYUT_BERHENTI) this.tutup(`denyut gagal ${this.gagalDenyut}x berturut-turut`);
      return null;
    }
    this.gagalDenyut = 0;
    if (j.jeda_global) {
      this.tutup("jeda global dari aplikasi");
      return j;
    }
    if (!this.bekerja) this.dep.log("denyut pulih: bot boleh bekerja lagi");
    this.bekerja = true;
    this.alasanDiam = "";
    const aktif = new Set(j.bots.filter((b) => b.aktif && !b.jeda).map((b) => b.bot_id));
    for (const id of this.bot.keys()) if (!aktif.has(id)) this.hentikanTugasBot(id);
    for (const id of aktif) {
      const ada = this.bot.get(id);
      // Tugas lama yang baru diminta berhenti (mis. jeda sebentar) dilanjutkan, bukan digandakan.
      if (ada) ada.henti = false;
      else if (!this.dihentikan) this.mulaiTugasBot(id);
    }
    return j;
  }

  /** Gagal tertutup: semua tugas bot diminta berhenti di batas aman. */
  private tutup(alasan: string): void {
    if (this.bekerja || this.alasanDiam !== alasan) this.dep.log(`bot berhenti bekerja: ${alasan}`);
    this.bekerja = false;
    this.alasanDiam = alasan;
    for (const id of this.bot.keys()) this.hentikanTugasBot(id);
  }

  private mulaiTugasBot(id: number): void {
    const entri: EntriBot = { henti: false, janji: Promise.resolve() };
    this.bot.set(id, entri);
    entri.janji = this.putaranBot(id, entri).finally(() => {
      // Hanya hapus bila entri ini masih yang terdaftar.
      if (this.bot.get(id) === entri) this.bot.delete(id);
    });
    this.dep.log(`bot ${id}: mulai bekerja`);
  }

  private async putaranBot(id: number, entri: EntriBot): Promise<void> {
    const p = atur(this.dep);
    while (!entri.henti && !this.dihentikan && this.bekerja) {
      try {
        const hasil = await langkahBot(id, this.dep, this.ker);
        await this.dep.tidur(hasil === "diam" ? p.jedaDiamMs : p.jedaSetelahKerjaMs);
      } catch (e) {
        // Galat aplikasi/jaringan pada satu bot: catat, tunggu, coba lagi (denyut yang memutuskan berhenti).
        this.dep.log(`bot ${id}: ${pesanGalat(e, 160)}`);
        await this.dep.tidur(p.jedaDiamMs);
      }
    }
    this.dep.log(`bot ${id}: berhenti bekerja`);
  }

  /** Minta berhenti dan tunggu langkah yang sedang berjalan (maksimal `tungguMs`). */
  async hentikan(tungguMs = 25_000): Promise<void> {
    this.dihentikan = true;
    this.bekerja = false;
    for (const id of this.bot.keys()) this.hentikanTugasBot(id);
    const semua = Promise.allSettled([...this.bot.values()].map((e) => e.janji));
    let pewaktu: ReturnType<typeof setTimeout> | undefined;
    const habis = new Promise<void>((r) => {
      pewaktu = setTimeout(r, tungguMs);
    });
    await Promise.race([semua, habis]);
    clearTimeout(pewaktu);
  }

  /** Menunggu semua tugas bot yang sedang berjalan selesai (untuk uji). */
  async tungguTugas(): Promise<void> {
    await Promise.allSettled([...this.bot.values()].map((e) => e.janji));
  }
}
