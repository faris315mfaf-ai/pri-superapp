// ============================================================
// SIMULASI RUANG BOT — logika murni (tanpa React / DOM).
//
// Diporting dari mockup docs/mockups/pri-ruang-bot.html: satu gedung empat
// ruang (kerja, meeting, koordinator, kamar tidur), jalur jalan lewat pintu
// sekat kaca, mesin status bot (jalan / kerja / antre), kuota harian, jeda
// darurat, dan jam simulasi. Tata letak ada di denah.ts; koordinator (Nara)
// di simulasi-nara.ts. Koordinat memakai GRID isometrik (0..16).
//
// DUA MODE:
//  • contoh (bawaan) — tiap bot bergantian Pencarian -> Edit -> Posting ->
//    Istirahat. Meja hanya berkursi satu, sehingga bot lain antre di tengah.
//  • nyata (`diam`)  — tanpa siklus palsu: tempat bot ditentukan data server
//    (setSasaran: meja tugas yang sedang berjalan, atau sofa). Perpindahan
//    tetap berjalan kaki lewat pintu.
// Di kedua mode: bot TANPA API key tidur di kamar tidur; saat rapat, bot
// berkunci berkumpul di ruang meeting.
//
// Deterministik bila `acak` diberikan (dipakai hanya untuk memilih judul).
// Pemilik state sesungguhnya (kuota, hasil, log, mode, jeda) adalah cangkang
// layar; kelas ini hanya MEMBACA lewat setter & ambilMode, lalu MELAPOR
// lewat callback onLog / onPosting / onStatus.
// ============================================================

import { JUDUL_CONTOH, URUTAN_TAHAP } from "./data-contoh";
import {
  KAPASITAS,
  STASIUN,
  TEMPAT_ANTRE,
  TITIK_TENGAH,
  ikutiJalur,
  jalanKeluar,
  jalanMasuk,
  titikKursi,
  type Titik,
} from "./denah";
import { SimulasiNara } from "./simulasi-nara";
import type { BotContoh, LogItem, ModeBot, StatusHidup, TahapBot, TempatBot } from "./tipe";

// Dipakai ulang oleh penggambar & tampilan.
export { STASIUN, TITIK_TENGAH } from "./denah";
export type { Stasiun } from "./denah";

/** Lama tiap tahap dalam detik waktu-simulasi (sebelum dikali kecepatan). */
export const DURASI_TAHAP: Record<TahapBot, number> = { cari: 9, edit: 11, posting: 7, istirahat: 6 };

/** Kecepatan jalan (grid per detik). */
const KECEPATAN_JALAN = 2.6;
/** Jam simulasi berjalan 12x lebih cepat dari detik animasi. */
const SKALA_JAM = 12;
/** Jam awal simulasi: 09:05. */
const JAM_AWAL = 9 * 3600 + 5 * 60;
/** Selang minimal (detik NYATA) antar panggilan onStatus. */
const SELANG_STATUS = 1;
/** Langkah maksimum per sub-langkah simulasi (detik), supaya lonjakan dt tetap akurat. */
const LANGKAH_MAKS = 0.25;
const MAKS_LOG_TEKS = 140;
/** Lama kabar dari Nara tampil di atas kepala bot (detik animasi). */
const DURASI_KABAR = 5;

const TEKS_DIAM = "Menunggu tugas";
const TEKS_TIDUR = "Zzz… belum punya API key";
const TEKS_RAPAT = "Rapat bersama Pimred & Nara";

// ---------- tipe ----------

type KeadaanInternal = "jalan" | "kerja" | "antre";

/** Tempat yang dituju bot pada mode nyata: meja tahap kerja atau sofa. */
export type Sasaran = { tempat: TahapBot; teks: string };

export type BotHidup = {
  readonly id: string;
  readonly indeks: number;
  /** Posisi pada grid isometrik (pecahan). */
  x: number;
  y: number;
  /** Tahap sekarang / tujuan (selalu terisi). "istirahat" saat di ruang meeting / kamar tidur. */
  tahap: TahapBot;
  /** Tempat sekarang / tujuan, termasuk ruang meeting dan kamar tidur. */
  tempat: TempatBot;
  keadaan: StatusHidup["keadaan"];
  /** Teks bubble; kosong = tidak ada bubble. */
  teks: string;
  /** Judul tugas yang sedang dikerjakan. */
  judul: string;
  /** 1 = menghadap kanan layar, -1 = kiri. */
  arah: 1 | -1;
  /** Berjalan menjauh dari penonton. */
  belakang: boolean;
  kuota: number;
  /** Berhenti beristirahat karena kuota harian habis. */
  habisKuota: boolean;
  /** Punya API key. false = tidur di kamar tidur. */
  punyaOtak: boolean;
};

type BotSim = BotHidup & {
  keadaanDalam: KeadaanInternal;
  jalur: Titik[];
  tujuan: { tahap: TempatBot; idx: number } | null;
  kursi: { tahap: TempatBot; idx: number } | null;
  mulaiKerja: number;
  lamaAntre: number;
  berikutnya: TahapBot;
  terakhirPesan: string;
  nama: string;
  platform: string;
  sasaran: Sasaran;
  kabar: string;
  kabarSampai: number;
};

export type OpsiSimulasi = {
  kuotaAwal: Record<string, number>;
  maksKuota: number;
  /** Pembangkit acak 0..1. Bawaan Math.random; beri benih tetap agar deterministik. */
  acak?: () => number;
  /** Mode terbaru sebuah bot (dibaca tiap kali dibutuhkan, tidak disalin). */
  ambilMode?: (botId: string) => ModeBot;
  onLog?: (item: LogItem) => void;
  onPosting?: (botId: string, judul: string) => void;
  onStatus?: (peta: Record<string, StatusHidup>) => void;
  /**
   * Mode data nyata: tanpa siklus tahap, tanpa posting palsu. Tempat bot mengikuti
   * setSasaran (bawaan: sofa dengan teks "Menunggu tugas"); jam mengikuti jam WIB sebenarnya.
   */
  diam?: boolean;
  /** Sasaran awal (mode nyata) supaya bot langsung duduk di tempatnya saat layar dibuka. */
  sasaranAwal?: Record<string, Sasaran>;
};

/** Detik sejak tengah malam menurut WIB (UTC+7) — jam nyata, bukan jam simulasi. */
function detikWibNyata(): number {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

/** "HH:MM" dari detik sejak tengah malam. */
export function formatJam(detik: number): string {
  const s = Math.floor(detik);
  const j = Math.floor(s / 3600) % 24;
  const m = Math.floor(s / 60) % 60;
  return `${String(j).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const tahapDari = (tempat: TempatBot): TahapBot => (tempat === "rapat" || tempat === "tidur" ? "istirahat" : tempat);

// ---------- kelas simulasi ----------

export class SimulasiBot {
  readonly bots: BotHidup[];
  /** Koordinator (Nara): seorang pejalan di dunia yang sama. */
  readonly nara: SimulasiNara;
  onLog?: (item: LogItem) => void;
  onPosting?: (botId: string, judul: string) => void;
  onStatus?: (peta: Record<string, StatusHidup>) => void;

  private readonly dalam: BotSim[];
  private readonly acak: () => number;
  private readonly diam: boolean;
  private ambilModeFn: (botId: string) => ModeBot;
  /** Penghuni tiap kursi/kasur: id bot atau null. */
  private readonly penghuni: Record<TempatBot, (string | null)[]>;
  private maks: number;
  private detikJam = JAM_AWAL;
  /** Waktu simulasi berjalan (dt sudah dikali kecepatan); acuan lama kerja. */
  private waktu = 0;
  private jeda = false;
  private rapatNyala = false;
  private gerakKurang = false;
  private kotorStatus = true;
  private sejakStatus = SELANG_STATUS;

  constructor(bots: BotContoh[], opsi: OpsiSimulasi) {
    this.acak = opsi.acak ?? Math.random;
    this.diam = !!opsi.diam;
    this.maks = Math.max(0, Math.floor(opsi.maksKuota));
    this.onLog = opsi.onLog;
    this.onPosting = opsi.onPosting;
    this.onStatus = opsi.onStatus;
    const daftarMode = new Map(bots.map((b) => [b.id, b.mode] as const));
    this.ambilModeFn = opsi.ambilMode ?? ((id) => daftarMode.get(id) ?? "acc");
    this.penghuni = {
      cari: [null],
      edit: [null],
      posting: [null],
      istirahat: [null, null],
      rapat: Array.from({ length: KAPASITAS.rapat }, () => null),
      tidur: Array.from({ length: KAPASITAS.tidur }, () => null),
    };
    const awal: TahapBot[] = ["cari", "edit", "posting"];
    this.dalam = bots.map((b, i): BotSim => {
      const tempat = this.tempatAntre(i);
      return {
        id: b.id,
        indeks: i,
        nama: b.nama,
        platform: b.platform,
        x: tempat[0],
        y: tempat[1],
        tahap: "istirahat",
        tempat: "istirahat",
        keadaan: "menunggu",
        keadaanDalam: "antre",
        teks: "",
        judul: JUDUL_CONTOH[i % JUDUL_CONTOH.length],
        arah: 1,
        belakang: false,
        kuota: Math.max(0, Math.floor(opsi.kuotaAwal[b.id] ?? 0)),
        habisKuota: false,
        punyaOtak: b.punyaOtak !== false,
        jalur: [],
        tujuan: null,
        kursi: null,
        mulaiKerja: 0,
        lamaAntre: -i * 1.6,
        berikutnya: awal[i % awal.length],
        terakhirPesan: "",
        sasaran: opsi.sasaranAwal?.[b.id] ?? { tempat: "istirahat", teks: TEKS_DIAM },
        kabar: "",
        kabarSampai: 0,
      };
    });
    this.bots = this.dalam;
    this.nara = new SimulasiNara({
      posisiBot: (id) => {
        const b = this.dalam.find((x) => x.id === id);
        return b ? { x: b.x, y: b.y } : undefined;
      },
      kabar: (id, teks) => this.kabarKe(id, teks, DURASI_KABAR),
      rapat: () => this.rapatNyala,
      gerakKurang: () => this.gerakKurang,
    });
    if (this.diam) {
      this.detikJam = detikWibNyata();
      this.dalam.forEach((b, i) => this.letakkanAwal(b, i));
    }
  }

  // ---------- baca ----------

  get jamSimulasi(): number {
    return this.detikJam;
  }

  get sedangJeda(): boolean {
    return this.jeda;
  }

  get rapat(): boolean {
    return this.rapatNyala;
  }

  /** Apakah ada bot di kursi pertama stasiun ini (untuk layar monitor menyala). */
  terisi(tahap: TahapBot): boolean {
    return this.penghuni[tahap].some((p) => p !== null);
  }

  /** Bot yang sudah terbaring di kasur ke-`idx` (bukan yang masih berjalan menuju kasur); null bila kosong. */
  tidurDi(idx: number): BotHidup | null {
    const id = this.penghuni.tidur[idx];
    if (!id) return null;
    const b = this.dalam.find((x) => x.id === id);
    return b && b.keadaanDalam === "kerja" && b.kursi?.tahap === "tidur" && b.kursi.idx === idx ? b : null;
  }

  /** true bila bot ini sudah terbaring di kasur (digambar bersama kasurnya, bukan sebagai orang berdiri). */
  terbaring(b: BotHidup): boolean {
    return this.penghuni.tidur.some((id, i) => id === b.id && this.tidurDi(i)?.id === b.id);
  }

  /** Peta status hidup semua bot (salinan baru, aman diteruskan ke luar). */
  statusHidup(): Record<string, StatusHidup> {
    const peta: Record<string, StatusHidup> = {};
    for (const b of this.dalam) {
      peta[b.id] = {
        tahap: b.keadaanDalam === "kerja" && b.tempat !== "rapat" && b.tempat !== "tidur" ? b.tahap : null,
        keadaan: b.keadaan,
        teks: b.teks,
        judul: b.judul,
      };
    }
    return peta;
  }

  /** Teks bubble yang layak ditampilkan (istirahat saat jeda/kuota habis = tanpa bubble). */
  teksTampil(b: BotHidup): string {
    const bs = b as BotSim;
    if (bs.kabar && this.waktu < bs.kabarSampai) return bs.kabar;
    if (b.tempat === "tidur" || b.tempat === "rapat") return b.teks;
    // Mode data nyata: bubble hanya untuk keadaan penting (Dijeda / tugas). "Menunggu tugas"
    // sudah tampil di kartu bot; tiga bubble sama di ruangan hanya menumpuk.
    if (this.diam) return b.teks === TEKS_DIAM ? "" : b.teks;
    if (b.keadaan === "bekerja" && b.tahap === "istirahat" && (this.jeda || b.habisKuota)) return "";
    return b.teks;
  }

  // ---------- kendali dari luar ----------

  /**
   * Pasang ulang pembaca mode & callback laporan (dipanggil pemilik state tiap
   * kali props-nya berganti). Simulasi sendiri tidak dibuat ulang.
   */
  hubungkan(h: Pick<OpsiSimulasi, "ambilMode" | "onLog" | "onPosting" | "onStatus">): void {
    if (h.ambilMode) this.ambilModeFn = h.ambilMode;
    this.onLog = h.onLog;
    this.onPosting = h.onPosting;
    this.onStatus = h.onStatus;
  }

  /**
   * Mode nyata: tempat & teks tiap bot menurut data server (mis. meja edit dengan teks
   * "Mengedit: judul", atau sofa "Dijeda"). Bot yang tidak disebut kembali ke sofa.
   * Bot yang sedang duduk di tempat lain akan berjalan ke sana.
   */
  setSasaran(peta: Record<string, Sasaran>): void {
    if (!this.diam) return;
    for (const b of this.dalam) {
      const baru = peta[b.id] ?? { tempat: "istirahat" as const, teks: TEKS_DIAM };
      if (b.sasaran.tempat === baru.tempat && b.sasaran.teks === baru.teks) continue;
      b.sasaran = baru;
      this.kotorStatus = true;
    }
  }

  /** API key terpasang/dicabut: bot bangun dan bekerja, atau berjalan ke kamar tidur. */
  setPunyaOtak(botId: string, ada: boolean): void {
    const b = this.dalam.find((x) => x.id === botId);
    if (!b || b.punyaOtak === ada) return;
    b.punyaOtak = ada;
    this.kotorStatus = true;
  }

  /** Panggil / bubarkan rapat: bot berkunci (dan Nara) berkumpul di ruang meeting. */
  setRapat(nilai: boolean): void {
    if (this.rapatNyala === nilai) return;
    this.rapatNyala = nilai;
    this.kotorStatus = true;
  }

  /** Kabar singkat di atas kepala bot selama `detik` detik animasi. */
  kabarKe(botId: string, teks: string, detik: number): void {
    const b = this.dalam.find((x) => x.id === botId);
    if (!b) return;
    b.kabar = teks;
    b.kabarSampai = this.waktu + detik;
  }

  setJeda(nilai: boolean): void {
    if (this.jeda === nilai) return;
    this.jeda = nilai;
    if (!nilai) {
      // Lanjut: bot yang menunggu di sofa karena jeda boleh langsung bangun.
      for (const b of this.dalam) {
        if (b.keadaanDalam === "kerja" && b.tempat === "istirahat" && !b.habisKuota) {
          b.mulaiKerja = this.waktu - DURASI_TAHAP.istirahat;
        }
      }
    }
    this.kotorStatus = true;
  }

  setMaksKuota(n: number): void {
    this.maks = Math.max(0, Math.floor(n));
    this.selarasKuota();
  }

  setKuota(botId: string, n: number): void {
    const b = this.dalam.find((x) => x.id === botId);
    if (!b) return;
    b.kuota = Math.max(0, Math.floor(n));
    this.selarasKuota();
  }

  /** Atur ulang kuota semua bot (hari baru). Posisi & kegiatan tidak berubah. */
  hariBaru(): void {
    for (const b of this.dalam) b.kuota = 0;
    this.selarasKuota();
  }

  /** Mode gerak dikurangi: bot berpindah seketika (tanpa jalan panjang). */
  setGerakKurang(nilai: boolean): void {
    this.gerakKurang = nilai;
  }

  // ---------- maju ----------

  /**
   * Majukan simulasi. `dtDetik` = detik animasi (sudah dikali kecepatan);
   * `dtNyata` = detik jam dinding, hanya untuk membatasi seringnya onStatus.
   */
  maju(dtDetik: number, dtNyata: number = dtDetik): void {
    if (!(dtDetik > 0)) return;
    let sisa = dtDetik;
    while (sisa > 0) {
      const dt = Math.min(LANGKAH_MAKS, sisa);
      sisa -= dt;
      this.waktu += dt;
      if (!this.diam) this.detikJam += dt * SKALA_JAM;
      for (const b of this.dalam) this.langkahBot(b, dt);
      this.nara.maju(dt);
    }
    // Mode nyata: jam dinding mengikuti jam WIB sebenarnya, bukan jam simulasi.
    if (this.diam) this.detikJam = detikWibNyata();
    this.sejakStatus += Math.max(0, dtNyata);
    if (this.kotorStatus && this.sejakStatus >= SELANG_STATUS) {
      this.sejakStatus = 0;
      this.kotorStatus = false;
      this.onStatus?.(this.statusHidup());
    }
  }

  // ---------- internal ----------

  /** Mode nyata: letakkan bot langsung di tempatnya (tanpa jalan) saat layar dibuka. */
  private letakkanAwal(b: BotSim, i: number): void {
    const s = this.pilihTempat(b);
    const idx = this.cariKursiKosong(s, b);
    b.terakhirPesan = "";
    if (idx >= 0) {
      const t = titikKursi(s, idx);
      b.x = t[0];
      b.y = t[1];
      b.tempat = s;
      b.tahap = tahapDari(s);
      b.kursi = { tahap: s, idx };
      this.penghuni[s][idx] = b.id;
      b.teks = this.teksDi(b, s);
      b.terakhirPesan = b.teks;
      b.mulaiKerja = this.waktu;
      this.set(b, "kerja");
    } else {
      const t = this.tempatAntre(i);
      b.x = t[0];
      b.y = t[1];
      b.tempat = "istirahat";
      b.tahap = "istirahat";
      b.teks = b.sasaran.teks;
      this.set(b, "antre");
    }
  }

  private tempatAntre(i: number): Titik {
    const dasar = TEMPAT_ANTRE[i % TEMPAT_ANTRE.length];
    const lapis = Math.floor(i / TEMPAT_ANTRE.length);
    return [dasar[0] + lapis * 0.5, dasar[1] + lapis * 0.35];
  }

  /** Bot yang sedang istirahat karena kuota boleh bangun bila kuota sudah longgar. */
  private selarasKuota(): void {
    for (const b of this.dalam) {
      if (b.habisKuota && b.kuota < this.maks) b.habisKuota = false;
    }
    this.kotorStatus = true;
  }

  private catat(b: BotSim, tahap: TahapBot, teks: string): void {
    if (this.diam) return; // mode nyata: umpan aktivitas datang dari server
    this.onLog?.({ waktu: formatJam(this.detikJam), botId: b.id, tahap, teks: teks.slice(0, MAKS_LOG_TEKS) });
  }

  private set(b: BotSim, keadaan: KeadaanInternal): void {
    b.keadaanDalam = keadaan;
    b.keadaan = keadaan === "kerja" ? "bekerja" : keadaan === "jalan" ? "berjalan" : "menunggu";
    this.kotorStatus = true;
  }

  private ubahTeks(b: BotSim, teks: string): void {
    if (b.teks !== teks) {
      b.teks = teks;
      this.kotorStatus = true;
    }
  }

  private langkahJalan(b: BotSim, dt: number): boolean {
    return ikutiJalur(b, b.jalur, this.gerakKurang ? Infinity : KECEPATAN_JALAN * dt);
  }

  private lepasKursi(b: BotSim): void {
    if (b.kursi) {
      this.penghuni[b.kursi.tahap][b.kursi.idx] = null;
      b.kursi = null;
    }
  }

  /**
   * Kursi kosong di tempat itu. Kasur & kursi rapat bersifat tetap: bot ke-i memakai nomor i
   * bila kosong (supaya tiap agen punya kasurnya sendiri), kalau tidak yang pertama kosong.
   */
  private cariKursiKosong(tempat: TempatBot, b: BotSim): number {
    const o = this.penghuni[tempat];
    if ((tempat === "tidur" || tempat === "rapat") && b.indeks < o.length && (o[b.indeks] === null || o[b.indeks] === b.id)) {
      return b.indeks;
    }
    return o.findIndex((p) => p === null || p === b.id);
  }

  /** Teks status di tempat itu. */
  private teksDi(b: BotSim, tempat: TempatBot): string {
    if (tempat === "tidur") return TEKS_TIDUR;
    if (tempat === "rapat") return b.indeks === 0 ? TEKS_RAPAT : "";
    return this.diam ? b.sasaran.teks : "";
  }

  private keKursi(b: BotSim, tempat: TempatBot, idx: number): void {
    const titik: Titik[] = [];
    if (b.kursi) titik.push(...jalanKeluar(b.kursi.tahap, b.kursi.idx));
    this.lepasKursi(b);
    titik.push(TITIK_TENGAH, ...jalanMasuk(tempat, idx));
    this.penghuni[tempat][idx] = b.id;
    b.tujuan = { tahap: tempat, idx };
    b.jalur = titik;
    this.set(b, "jalan");
    b.tempat = tempat;
    b.tahap = tahapDari(tempat);
    b.teks = "";
    b.terakhirPesan = "";
  }

  private keAntre(b: BotSim, alasan: string): void {
    const titik: Titik[] = [];
    if (b.kursi) titik.push(...jalanKeluar(b.kursi.tahap, b.kursi.idx));
    this.lepasKursi(b);
    titik.push(TITIK_TENGAH, this.tempatAntre(b.indeks));
    b.jalur = titik;
    b.tujuan = null;
    this.set(b, "jalan");
    b.tempat = "istirahat";
    b.tahap = "istirahat";
    b.teks = this.diam ? b.sasaran.teks : `Antre: ${alasan}`;
    b.terakhirPesan = b.teks;
  }

  /**
   * Ke mana bot ini seharusnya pergi sekarang. Urutan: tanpa API key -> kamar tidur;
   * rapat -> ruang meeting; mode nyata -> sasaran dari server; mode contoh -> tahap
   * berikutnya (atau sofa bila dijeda / kuota habis).
   */
  private pilihTempat(b: BotSim): TempatBot {
    if (!b.punyaOtak) return "tidur";
    if (this.rapatNyala) return "rapat";
    if (this.diam) return b.sasaran.tempat;
    let s: TahapBot = this.jeda ? "istirahat" : b.berikutnya;
    if (s === "cari" && b.kuota >= this.maks) {
      s = "istirahat";
      b.habisKuota = true;
    }
    return s;
  }

  private cobaBerikut(b: BotSim): void {
    let s = this.pilihTempat(b);
    let idx = this.cariKursiKosong(s, b);
    // Sofa penuh oleh bot yang kuotanya habis: bot ini tidak perlu ikut menunggu
    // selamanya, langsung lanjut ke pencarian bila kuotanya masih ada.
    if (idx < 0 && s === "istirahat" && !this.diam && !this.jeda && !b.habisKuota && b.kuota < this.maks && b.punyaOtak && !this.rapatNyala) {
      s = "cari";
      idx = this.cariKursiKosong(s, b);
    }
    if (idx < 0) {
      const nama = s === "tidur" ? "kamar tidur" : s === "rapat" ? "ruang meeting" : STASIUN[s].nama.toLowerCase();
      if (b.keadaanDalam === "jalan" && !b.tujuan) return;
      if (b.keadaanDalam === "antre" && !b.kursi) {
        this.ubahTeks(b, this.diam && s === "istirahat" ? b.sasaran.teks : `Antre ${nama}`);
        return;
      }
      this.keAntre(b, nama);
      return;
    }
    if (s === "cari" && !this.diam) {
      b.judul = JUDUL_CONTOH[Math.min(JUDUL_CONTOH.length - 1, Math.floor(this.acak() * JUDUL_CONTOH.length))];
    }
    this.keKursi(b, s, idx);
  }

  /** Teks status menurut kemajuan p (0..1) dan apakah penting dicatat di umpan. */
  private pesan(b: BotSim, p: number): [string, boolean] {
    switch (b.tahap) {
      case "cari":
        if (p < 0.25) return ["Membuka @ntv & akun sumber…", true];
        if (p < 0.55) return ["Memindai 14 postingan terbaru", false];
        if (p < 0.85) return ["Menimbang kandidat…", true];
        return [`Terpilih: ${b.judul}`, true];
      case "edit": {
        if (p < 0.18) return ["Mengunduh video sumber…", true];
        if (p < 0.34) return ["Menulis hook (DeepSeek)…", true];
        if (p < 0.94) {
          const pc = Math.round(((p - 0.34) / 0.6) * 10) * 10;
          return [`Render template: ${pc}%`, pc === 50];
        }
        return ["Render selesai · masuk stok", true];
      }
      case "posting":
        if (p < 0.3) return ["Mengisi caption + kredit sumber", true];
        if (p < 0.55) return ["Cek kuota & pagar dobel", false];
        if (p < 0.9) {
          return [this.ambilModeFn(b.id) === "otomatis" ? `Memposting ke ${b.platform}…` : "Mengirim ke antrean ACC…", true];
        }
        return ["Selesai ✓", true];
      default:
        if (b.habisKuota) return ["Kuota harian tercapai — istirahat", false];
        if (this.jeda) return ["Dijeda oleh Pimred", false];
        return ["Ngopi dulu…", false];
    }
  }

  private selesai(b: BotSim): void {
    const tuntas = b.tahap;
    if (tuntas === "posting") {
      b.kuota += 1;
      this.kotorStatus = true;
      this.onPosting?.(b.id, b.judul);
    }
    b.berikutnya = URUTAN_TAHAP[(URUTAN_TAHAP.indexOf(tuntas) + 1) % URUTAN_TAHAP.length];
    this.cobaBerikut(b);
  }

  /** Bot di kamar tidur / ruang meeting: tinggal selama alasannya masih ada, lalu kembali bekerja. */
  private langkahTinggal(b: BotSim, tempat: "tidur" | "rapat"): void {
    const tetap = tempat === "tidur" ? !b.punyaOtak : b.punyaOtak && this.rapatNyala;
    if (!tetap) {
      b.berikutnya = "cari";
      b.habisKuota = false;
      this.catat(b, "istirahat", tempat === "tidur" ? "Bangun: API key terpasang" : "Rapat selesai");
      this.cobaBerikut(b);
      return;
    }
    const teks = this.teksDi(b, tempat);
    if (teks !== b.terakhirPesan) {
      b.terakhirPesan = teks;
      this.ubahTeks(b, teks);
      this.catat(b, "istirahat", tempat === "tidur" ? "Tidur: belum punya API key" : "Masuk ruang meeting");
    }
  }

  /** Mode nyata, sedang duduk di meja/sofa: pindah bila sasaran berubah, selain itu ikuti teksnya. */
  private langkahNyata(b: BotSim): void {
    const s = this.pilihTempat(b);
    if (b.kursi && s !== b.kursi.tahap) {
      this.cobaBerikut(b);
      return;
    }
    this.ubahTeks(b, b.sasaran.teks);
  }

  private langkahBot(b: BotSim, dt: number): void {
    if (b.keadaanDalam === "jalan") {
      if (this.langkahJalan(b, dt)) {
        if (b.tujuan) {
          this.set(b, "kerja");
          b.mulaiKerja = this.waktu;
          b.kursi = b.tujuan;
          b.tujuan = null;
          b.terakhirPesan = "";
        } else {
          this.set(b, "antre");
          b.lamaAntre = 0;
        }
      }
    } else if (b.keadaanDalam === "kerja") {
      const di = b.kursi?.tahap ?? b.tempat;
      if (di === "tidur" || di === "rapat") {
        this.langkahTinggal(b, di);
        return;
      }
      // Alasan baru untuk pergi: tidak punya key, atau rapat dimulai.
      if (!b.punyaOtak || this.rapatNyala) {
        this.catat(b, b.tahap, !b.punyaOtak ? "API key dicabut — kembali tidur" : "Rapat dipanggil — menuju ruang meeting");
        this.cobaBerikut(b);
        return;
      }
      if (this.diam) {
        this.langkahNyata(b);
        return;
      }
      if (this.jeda && b.tahap !== "istirahat") {
        this.catat(b, b.tahap, "Dijeda — kembali ke sofa");
        b.berikutnya = "istirahat";
        this.cobaBerikut(b);
        return;
      }
      const p = (this.waktu - b.mulaiKerja) / DURASI_TAHAP[b.tahap];
      const [teks, penting] = this.pesan(b, Math.min(p, 0.999));
      if (teks !== b.terakhirPesan) {
        b.terakhirPesan = teks;
        this.ubahTeks(b, teks);
        if (penting) this.catat(b, b.tahap, teks);
      }
      if (p >= 1 && !(b.tahap === "istirahat" && (this.jeda || b.habisKuota))) this.selesai(b);
    } else {
      b.lamaAntre += dt;
      if (b.lamaAntre > 0.6) {
        b.lamaAntre = 0;
        this.cobaBerikut(b);
      }
    }
  }
}
