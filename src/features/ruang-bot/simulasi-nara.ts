// ============================================================
// SIMULASI NARA (koordinator) — logika murni, 13 Okt 2026.
//
// Nara duduk di mejanya di ruang koordinator. Perilaku (diporting dari mockup):
//  • rapat berlangsung      -> berjalan ke ruang meeting, duduk, pulang bila selesai
//  • usulan disetujui master-> menempel catatan di papan penugasan, mengantar surat
//                              tugas ke bot yang bersangkutan (kertas melayang),
//                              lalu kembali ke mejanya
//  • selain itu             -> berpikir (gelembung bergantian); tanpa API key ia
//                              hanya duduk dan berkata belum bisa berpikir.
// Pemilik state sesungguhnya (usulan, key) adalah server; kelas ini hanya
// MENAMPILKAN lewat setKeadaan / antar / setCatatan.
// ============================================================

import { ikutiJalur, type Badan, type Titik } from "./denah";
import { DENAH_SIM_V1, type DenahNara } from "./denah-sim";
import type { RupaBot } from "./tipe";

export const NAMA_NARA_BAWAAN = "Nara";
export const WARNA_NARA = "#fb7185";
export const RUPA_NARA: RupaBot = {
  kaus: "#2f4b8a",
  bayangan: "#223a70",
  celana: "#23273d",
  kulit: "#d8a47c",
  rambut: "#1d1a24",
  gayaRambut: "pendek",
  kacamata: true,
};

export type KeadaanNara = "meja" | "jalan" | "tempel" | "serah" | "rapat";
type Tujuan = "papan" | "serah" | "rapat" | "meja";

export type TugasAntar = { id: number; botId: string; judul: string };
export type CatatanPapan = Record<string, { id: number; judul: string }[]>;

export type OpsiNara = {
  /** Posisi bot saat ini (undefined = bot sudah tidak ada). */
  posisiBot: (botId: string) => { x: number; y: number } | undefined;
  /** Sampaikan kabar singkat ke bot (gelembung di atas kepalanya). */
  kabar: (botId: string, teks: string) => void;
  /** Rapat sedang berlangsung? */
  rapat: () => boolean;
  /** Mode gerak dikurangi: berpindah seketika. */
  gerakKurang: () => boolean;
  /** Catatan untuk umpan aktivitas (opsional). */
  catat?: (teks: string) => void;
  /** Tata letak (bawaan: denah lama). */
  denah?: DenahNara;
};

const KECEPATAN = 2.6;
const MAKS_CATATAN = 3;
const JEDA_TEMPEL = 1.6;
const DURASI_KERTAS = 1.3;
const JEDA_SESUDAH_SERAH = 1.4;
const JEDA_PIKIR = 5;
const TEKS_PIKIR = ["Memeriksa Antrean ACC…", "Menimbang beban tiap agen…", "Memeriksa kuota harian…", "Membaca umpan aktivitas…", "Menunggu keputusan Pimred"];
export const TEKS_TANPA_KUNCI = "Belum punya API key — belum bisa berpikir";

export type Kertas = { t0: number; dur: number; x0: number; y0: number; x1: number; y1: number };

export class SimulasiNara implements Badan {
  x: number;
  y: number;
  arah: 1 | -1 = 1;
  belakang = false;
  keadaan: KeadaanNara = "meja";
  nama = NAMA_NARA_BAWAAN;
  punyaOtak = true;
  usulanTerbuka = 0;
  kertas: Kertas | null = null;
  /** Waktu animasi Nara (detik); acuan kertas melayang. */
  waktu = 0;

  private teks = "";
  private teksSampai = 0;
  private jalur: Titik[] = [];
  private tujuan: Tujuan = "meja";
  private antrean: TugasAntar[] = [];
  private sedang: TugasAntar | null = null;
  private diketahui = new Set<number>();
  private catatan: CatatanPapan = {};
  private tertunda = new Set<number>();
  private mulai = 0;
  private sudahSerah = false;
  private menganggur = 0;
  private urutPikir = 0;

  private readonly d: DenahNara;

  constructor(private readonly opsi: OpsiNara) {
    this.d = opsi.denah ?? DENAH_SIM_V1.nara;
    this.x = this.d.kursiMeja[0];
    this.y = this.d.kursiMeja[1];
  }

  // ---------- baca ----------

  /** Teks gelembung yang layak ditampilkan ("" = tanpa gelembung). */
  teksTampil(): string {
    if (this.keadaan === "meja" && !this.punyaOtak) return TEKS_TANPA_KUNCI;
    return this.waktu < this.teksSampai ? this.teks : "";
  }

  /** Banyak catatan di papan untuk bot ini (yang masih dalam perjalanan belum dihitung). */
  jumlahCatatan(botId: string): number {
    return Math.min(MAKS_CATATAN, (this.catatan[botId] ?? []).filter((c) => !this.tertunda.has(c.id)).length);
  }

  get bekerjaDiMeja(): boolean {
    return this.keadaan === "meja" && this.punyaOtak;
  }

  /** Jumlah surat tugas yang belum selesai diantar. */
  get sisaAntar(): number {
    return this.antrean.length + (this.sedang ? 1 : 0);
  }

  // ---------- kendali dari luar ----------

  setKeadaan(k: { punyaOtak: boolean; usulanTerbuka: number; nama?: string }): void {
    this.punyaOtak = k.punyaOtak;
    this.usulanTerbuka = Math.max(0, Math.floor(k.usulanTerbuka));
    if (k.nama) this.nama = k.nama;
  }

  /** Papan penugasan: catatan per bot (id usulan disetujui). */
  setCatatan(peta: CatatanPapan): void {
    this.catatan = peta;
  }

  /**
   * Antrekan satu surat tugas. false bila id itu sudah pernah diterima (tidak diputar ulang).
   * Catatan dengan id yang sama di papan disembunyikan sampai Nara menempelnya.
   */
  antar(t: TugasAntar): boolean {
    if (this.diketahui.has(t.id)) return false;
    this.diketahui.add(t.id);
    this.antrean.push(t);
    this.tertunda.add(t.id);
    return true;
  }

  /** Tandai id sebagai sudah dikenal tanpa animasi (usulan lama yang baru terlihat saat layar dibuka). */
  anggapSudahAda(id: number): void {
    this.diketahui.add(id);
  }

  // ---------- maju ----------

  maju(dt: number): void {
    if (!(dt > 0)) return;
    this.waktu += dt;
    switch (this.keadaan) {
      case "meja":
        this.langkahMeja(dt);
        break;
      case "jalan":
        if (ikutiJalur(this, this.jalur, this.opsi.gerakKurang() ? Infinity : KECEPATAN * dt)) this.tiba();
        break;
      case "tempel":
        if (this.waktu - this.mulai > JEDA_TEMPEL) this.selesaiTempel();
        break;
      case "serah":
        this.langkahSerah();
        break;
      case "rapat":
        this.langkahRapat();
        break;
    }
  }

  // ---------- internal ----------

  private bicara(teks: string, detik: number): void {
    this.teks = teks;
    this.teksSampai = this.waktu + detik;
  }

  private jalan(jalur: Titik[], tujuan: Tujuan): void {
    this.jalur = jalur;
    this.tujuan = tujuan;
    this.keadaan = "jalan";
    this.belakang = false;
  }

  private langkahMeja(dt: number): void {
    this.menganggur += dt;
    if (this.antrean.length > 0) {
      this.sedang = this.antrean.shift() ?? null;
      this.bicara("Menempel tugas di papan", 4);
      this.jalan(this.d.mejaKePapan(), "papan");
      return;
    }
    if (this.opsi.rapat()) {
      this.bicara("Menuju ruang meeting", 3);
      this.jalan(this.d.mejaKeRapat(), "rapat");
      return;
    }
    if (this.menganggur > JEDA_PIKIR && this.punyaOtak) {
      this.menganggur = 0;
      this.bicara(
        this.usulanTerbuka > 0 ? `Ada ${this.usulanTerbuka} usulan menunggu Pimred` : TEKS_PIKIR[this.urutPikir++ % TEKS_PIKIR.length],
        3.5,
      );
    }
  }

  private tiba(): void {
    this.jalur = [];
    switch (this.tujuan) {
      case "papan":
        this.keadaan = "tempel";
        this.mulai = this.waktu;
        this.belakang = true;
        break;
      case "serah":
        this.mulaiSerah();
        break;
      case "rapat":
        this.keadaan = "rapat";
        this.belakang = true;
        break;
      default:
        this.keadaan = "meja";
        this.menganggur = 0;
        this.belakang = false;
        this.x = this.d.kursiMeja[0];
        this.y = this.d.kursiMeja[1];
    }
  }

  /** Papan penuh tempelan -> pergi mengantar. */
  private selesaiTempel(): void {
    const t = this.sedang;
    if (!t) {
      this.pulang(this.d.papanKeMeja());
      return;
    }
    this.tertunda.delete(t.id);
    const bot = this.opsi.posisiBot(t.botId);
    if (!bot) {
      this.sedang = null;
      this.pulang(this.d.papanKeMeja());
      return;
    }
    this.bicara("Mengantar surat tugas", 4);
    this.jalan(this.d.papanKeBot(bot), "serah");
  }

  private mulaiSerah(): void {
    const t = this.sedang;
    const bot = t ? this.opsi.posisiBot(t.botId) : undefined;
    this.keadaan = "serah";
    this.mulai = this.waktu;
    this.sudahSerah = false;
    this.belakang = false;
    this.kertas = bot ? { t0: this.waktu, dur: DURASI_KERTAS, x0: this.x, y0: this.y, x1: bot.x, y1: bot.y } : null;
    if (!bot) this.sudahSerah = true;
  }

  private langkahSerah(): void {
    const t = this.sedang;
    if (this.kertas && this.waktu - this.kertas.t0 >= this.kertas.dur) {
      this.kertas = null;
      if (t) {
        this.opsi.kabar(t.botId, `Tugas baru dari ${this.nama}: ${t.judul}`);
        this.opsi.catat?.(`Surat tugas diterima: ${t.judul}`);
      }
      this.sudahSerah = true;
      this.mulai = this.waktu;
    }
    if (this.sudahSerah && !this.kertas && this.waktu - this.mulai > JEDA_SESUDAH_SERAH) {
      this.sedang = null;
      this.sudahSerah = false;
      this.bicara("Kembali ke meja", 3);
      this.jalan(this.d.serahKeMeja([this.x, this.y]), "meja");
    }
  }

  private langkahRapat(): void {
    if (this.antrean.length > 0) {
      // Surat tugas tidak menunggu rapat selesai.
      this.sedang = this.antrean.shift() ?? null;
      this.bicara("Menempel tugas di papan", 4);
      this.jalan(this.d.rapatKePapan(), "papan");
      return;
    }
    if (!this.opsi.rapat()) {
      this.bicara("Rapat selesai", 3);
      this.belakang = false;
      this.jalan(this.d.rapatKeMeja(), "meja");
    }
  }

  /** Pulang ke meja lewat `jalur` (yang sudah berakhir di kursi meja). */
  private pulang(jalur: readonly Titik[]): void {
    this.bicara("Kembali ke meja", 3);
    this.jalan([...jalur], "meja");
  }
}
