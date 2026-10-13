// ============================================================
// SIMULASI RUANG BOT — logika murni (tanpa React / DOM).
//
// Diporting dari mockup docs/mockups/pri-ruang-bot.html: stasiun kerja,
// jalur jalan, mesin status bot (jalan / kerja / antre), kuota harian,
// jeda darurat, dan jam simulasi. Koordinat memakai GRID isometrik
// (0..10); kanvas yang menerjemahkannya ke piksel.
//
// Tiap bot bergantian: Pencarian -> Edit -> Posting -> Istirahat. Meja
// hanya berkursi satu, sehingga bot lain antre di tengah ruangan.
//
// Deterministik bila `acak` diberikan (dipakai hanya untuk memilih judul).
// Pemilik state sesungguhnya (kuota, hasil, log, mode, jeda) adalah cangkang
// layar; kelas ini hanya MEMBACA lewat setter & ambilMode, lalu MELAPOR
// lewat callback onLog / onPosting / onStatus.
// ============================================================

import { JUDUL_CONTOH, URUTAN_TAHAP } from "./data-contoh";
import type { BotContoh, LogItem, ModeBot, StatusHidup, TahapBot } from "./tipe";

// ---------- tata letak ruangan (grid isometrik) ----------

export type Stasiun = {
  nama: string;
  /** Meja: [gx, gy, lebar, dalam]. Sofa tidak punya meja. */
  meja?: [number, number, number, number];
  kursi: [number, number][];
  /** Titik keluar dari kursi menuju tengah ruangan. */
  keluar: [number, number];
  monitor?: [number, number][];
  lampu?: [number, number];
  /** Posisi pil label di lantai. */
  label: [number, number];
};

export const STASIUN: Record<TahapBot, Stasiun> = {
  cari: { nama: "MEJA PENCARIAN", meja: [1, 2, 2.6, 1], kursi: [[3.0, 1.5]], keluar: [4.4, 1.5], monitor: [[1.2, 2.3], [1.85, 2.3]], lampu: [2.5, 2.2], label: [2.3, 3.7] },
  edit: { nama: "MEJA EDIT", meja: [6, 2, 2.6, 1], kursi: [[6.6, 1.5]], keluar: [5.4, 1.5], monitor: [[7.3, 2.3], [7.95, 2.3]], lampu: [8.25, 2.2], label: [7.3, 3.7] },
  posting: { nama: "MEJA POSTING", meja: [2.2, 5.8, 1, 2.6], kursi: [[1.6, 7.6]], keluar: [1.6, 5.0], monitor: [[2.45, 6.1], [2.45, 6.85]], lampu: [2.7, 8.05], label: [3.75, 7.3] },
  istirahat: { nama: "SOFA ISTIRAHAT", kursi: [[7.9, 8.2], [8.9, 8.2]], keluar: [6.0, 8.1], label: [8.2, 9.55] },
};

/** Titik temu di tengah ruangan; semua jalan lewat sini. */
export const TITIK_TENGAH: [number, number] = [5, 5];
/** Tempat bot menunggu giliran (satu per bot, bergilir). */
const TEMPAT_ANTRE: [number, number][] = [[4.3, 4.7], [5.7, 4.7], [5.0, 6.1]];

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

// ---------- tipe ----------

type KeadaanInternal = "jalan" | "kerja" | "antre";

export type BotHidup = {
  readonly id: string;
  readonly indeks: number;
  /** Posisi pada grid isometrik (pecahan). */
  x: number;
  y: number;
  /** Tahap sekarang / tujuan (selalu terisi). */
  tahap: TahapBot;
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
};

type BotSim = BotHidup & {
  keadaanDalam: KeadaanInternal;
  jalur: [number, number][];
  tujuan: { tahap: TahapBot; idx: number } | null;
  kursi: { tahap: TahapBot; idx: number } | null;
  mulaiKerja: number;
  lamaAntre: number;
  berikutnya: TahapBot;
  terakhirPesan: string;
  nama: string;
  platform: string;
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
   * Mode DIAM (data nyata): tanpa siklus tahap, tanpa posting palsu. Bot duduk
   * di sofa (yang tak kebagian kursi menunggu di tengah ruangan) dengan teks
   * "Menunggu tugas", dan jam mengikuti jam WIB sebenarnya.
   */
  diam?: boolean;
};

/** Detik sejak tengah malam menurut WIB (UTC+7) — jam nyata, bukan jam simulasi. */
function detikWibNyata(): number {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

const TEKS_DIAM = "Menunggu tugas";

/** "HH:MM" dari detik sejak tengah malam. */
export function formatJam(detik: number): string {
  const s = Math.floor(detik);
  const j = Math.floor(s / 3600) % 24;
  const m = Math.floor(s / 60) % 60;
  return `${String(j).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------- kelas simulasi ----------

export class SimulasiBot {
  readonly bots: BotHidup[];
  onLog?: (item: LogItem) => void;
  onPosting?: (botId: string, judul: string) => void;
  onStatus?: (peta: Record<string, StatusHidup>) => void;

  private readonly dalam: BotSim[];
  private readonly acak: () => number;
  private readonly diam: boolean;
  private ambilModeFn: (botId: string) => ModeBot;
  /** Penghuni tiap kursi: id bot atau null. */
  private readonly penghuni: Record<TahapBot, (string | null)[]>;
  private maks: number;
  private detikJam = JAM_AWAL;
  /** Waktu simulasi berjalan (dt sudah dikali kecepatan); acuan lama kerja. */
  private waktu = 0;
  private jeda = false;
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
        keadaan: "menunggu",
        keadaanDalam: "antre",
        teks: "",
        judul: JUDUL_CONTOH[i % JUDUL_CONTOH.length],
        arah: 1,
        belakang: false,
        kuota: Math.max(0, Math.floor(opsi.kuotaAwal[b.id] ?? 0)),
        habisKuota: false,
        jalur: [],
        tujuan: null,
        kursi: null,
        mulaiKerja: 0,
        lamaAntre: -i * 1.6,
        berikutnya: awal[i % awal.length],
        terakhirPesan: "",
      };
    });
    this.bots = this.dalam;
    if (this.diam) {
      this.detikJam = detikWibNyata();
      this.dalam.forEach((b, i) => this.letakkanDiam(b, i));
    }
  }

  // ---------- baca ----------

  get jamSimulasi(): number {
    return this.detikJam;
  }

  get sedangJeda(): boolean {
    return this.jeda;
  }

  /** Apakah ada bot di kursi pertama stasiun ini (untuk layar monitor menyala). */
  terisi(tahap: TahapBot): boolean {
    return this.penghuni[tahap].some((p) => p !== null);
  }

  /** Peta status hidup semua bot (salinan baru, aman diteruskan ke luar). */
  statusHidup(): Record<string, StatusHidup> {
    const peta: Record<string, StatusHidup> = {};
    for (const b of this.dalam) {
      peta[b.id] = {
        tahap: b.keadaanDalam === "kerja" ? b.tahap : null,
        keadaan: b.keadaan,
        teks: b.teks,
        judul: b.judul,
      };
    }
    return peta;
  }

  /** Teks bubble yang layak ditampilkan (istirahat saat jeda/kuota habis = tanpa bubble). */
  teksTampil(b: BotHidup): string {
    // Mode data nyata: bubble hanya untuk keadaan penting (Dijeda). "Menunggu tugas"
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

  /** Mode diam: ubah teks status per bot (mis. "Dijeda" / "Menunggu tugas"). */
  setTeksDiam(peta: Record<string, string>): void {
    if (!this.diam) return;
    for (const b of this.dalam) {
      const teks = peta[b.id] ?? TEKS_DIAM;
      if (b.teks !== teks) {
        b.teks = teks;
        this.kotorStatus = true;
      }
    }
  }

  setJeda(nilai: boolean): void {
    if (this.jeda === nilai) return;
    this.jeda = nilai;
    if (!nilai) {
      // Lanjut: bot yang menunggu di sofa karena jeda boleh langsung bangun.
      for (const b of this.dalam) {
        if (b.keadaanDalam === "kerja" && b.tahap === "istirahat" && !b.habisKuota) {
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
    if (this.diam) {
      // Tidak ada gerak/siklus: hanya jam WIB nyata + laporan status berkala.
      this.detikJam = detikWibNyata();
      this.sejakStatus += Math.max(0, dtNyata);
      if (this.kotorStatus && this.sejakStatus >= SELANG_STATUS) {
        this.sejakStatus = 0;
        this.kotorStatus = false;
        this.onStatus?.(this.statusHidup());
      }
      return;
    }
    let sisa = dtDetik;
    while (sisa > 0) {
      const dt = Math.min(LANGKAH_MAKS, sisa);
      sisa -= dt;
      this.waktu += dt;
      this.detikJam += dt * SKALA_JAM;
      for (const b of this.dalam) this.langkahBot(b, dt);
    }
    this.sejakStatus += Math.max(0, dtNyata);
    if (this.kotorStatus && this.sejakStatus >= SELANG_STATUS) {
      this.sejakStatus = 0;
      this.kotorStatus = false;
      this.onStatus?.(this.statusHidup());
    }
  }

  // ---------- internal ----------

  /** Mode diam: dudukkan bot ke kursi sofa; yang tak kebagian menunggu di tengah ruangan. */
  private letakkanDiam(b: BotSim, i: number): void {
    const kursi = STASIUN.istirahat.kursi;
    b.teks = TEKS_DIAM;
    b.terakhirPesan = TEKS_DIAM;
    if (i < kursi.length) {
      b.x = kursi[i][0];
      b.y = kursi[i][1];
      b.tahap = "istirahat";
      b.kursi = { tahap: "istirahat", idx: i };
      this.penghuni.istirahat[i] = b.id;
      this.set(b, "kerja");
    } else {
      const t = this.tempatAntre(i - kursi.length);
      b.x = t[0];
      b.y = t[1];
      b.tahap = "istirahat";
      this.set(b, "antre");
    }
  }

  private tempatAntre(i: number): [number, number] {
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
    let d = this.gerakKurang ? Infinity : KECEPATAN_JALAN * dt;
    while (d > 0 && b.jalur.length > 0) {
      const [tx, ty] = b.jalur[0];
      const dx = tx - b.x;
      const dy = ty - b.y;
      const L = Math.hypot(dx, dy);
      if (L <= d) {
        b.x = tx;
        b.y = ty;
        b.jalur.shift();
        d -= L;
      } else {
        b.x += (dx / L) * d;
        b.y += (dy / L) * d;
        b.arah = dx - dy > 0 ? 1 : dx - dy < 0 ? -1 : b.arah;
        b.belakang = dx + dy < 0;
        d = 0;
      }
    }
    return b.jalur.length === 0;
  }

  private lepasKursi(b: BotSim): void {
    if (b.kursi) {
      this.penghuni[b.kursi.tahap][b.kursi.idx] = null;
      b.kursi = null;
    }
  }

  private cariKursiKosong(tahap: TahapBot): number {
    return this.penghuni[tahap].findIndex((p) => p === null);
  }

  private keKursi(b: BotSim, tahap: TahapBot, idx: number): void {
    const S = STASIUN[tahap];
    const titik: [number, number][] = [];
    if (b.kursi) titik.push(STASIUN[b.kursi.tahap].keluar);
    this.lepasKursi(b);
    titik.push(TITIK_TENGAH, S.keluar, S.kursi[idx]);
    this.penghuni[tahap][idx] = b.id;
    b.tujuan = { tahap, idx };
    b.jalur = titik;
    this.set(b, "jalan");
    b.tahap = tahap;
    b.teks = "";
    b.terakhirPesan = "";
  }

  private keAntre(b: BotSim, alasan: string): void {
    const titik: [number, number][] = [];
    if (b.kursi) titik.push(STASIUN[b.kursi.tahap].keluar);
    this.lepasKursi(b);
    titik.push(TITIK_TENGAH, this.tempatAntre(b.indeks));
    b.jalur = titik;
    b.tujuan = null;
    this.set(b, "jalan");
    b.teks = `Antre: ${alasan}`;
    b.terakhirPesan = b.teks;
  }

  private cobaBerikut(b: BotSim): void {
    let s: TahapBot = this.jeda ? "istirahat" : b.berikutnya;
    if (s === "cari" && b.kuota >= this.maks) {
      s = "istirahat";
      b.habisKuota = true;
    }
    let idx = this.cariKursiKosong(s);
    // Sofa penuh oleh bot yang kuotanya habis: bot ini tidak perlu ikut menunggu
    // selamanya, langsung lanjut ke pencarian bila kuotanya masih ada.
    if (idx < 0 && s === "istirahat" && !this.jeda && !b.habisKuota && b.kuota < this.maks) {
      s = "cari";
      idx = this.cariKursiKosong(s);
    }
    if (idx < 0) {
      if (b.keadaanDalam === "jalan" && !b.tujuan) return;
      if (b.keadaanDalam === "antre" && !b.kursi) {
        this.ubahTeks(b, `Antre ${STASIUN[s].nama.toLowerCase()}`);
        return;
      }
      this.keAntre(b, STASIUN[s].nama.toLowerCase());
      return;
    }
    if (s === "cari") {
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
