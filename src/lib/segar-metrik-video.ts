// ============================================================
// PENYEGAR ANGKA PER VIDEO (25 Sep 2026, dirombak 26 Sep 2026).
// KHUSUS SERVER.
//
// Permintaan user (26 Sep): "tarik semua data video seluruh akun yang
// terhubung (±650 akun) … sebanyak mungkin … se-realtime mungkin: tarik
// dulu seluruh data hari ini, lalu update kemarin, lalu yang lalu-lalu".
//
// Tiga bagian, dipanggil penjadwal VPS tiap 5 menit (/api/cron/metrik-
// video, ±4 menit kerja per putaran):
//
//  1. KATALOG — mengenali SEMUA video akun yang tersambung ke
//     upload-post, disimpan di tvr_video_metrik (satu baris per video,
//     kunci = kode platform+ID). Video baru dicatat dulu sebagai "belum
//     ditarik" (diperbarui_pada = BELUM_DITARIK). Sumbernya:
//       • laporan_video (laporan otomatis & manual, termasuk link pendek
//         yang diurai) — murah, tanpa kuota upload-post;
//       • daftar media tiap akun (/uploadposts/media) — halaman pertama
//         tiap jam (video baru), lalu mundur halaman demi halaman sampai
//         video terlama (isi katalog).
//  2. JALUR CEPAT (±15% tenaga, 29 Sep 2026) — unggahan SuperApp hari ini
//     & kemarin (/post-analytics/{request_id}: semua platform sekaligus)
//     dan seluruh video yang terbit HARI INI (±tiap 20 menit).
//  3. PUTARAN (sisa tenaga, 29 Sep 2026 — alur permintaan user): video
//     yang caption/hashtag/kategorinya memuat KATA KUNCI dulu, lalu video
//     lain; masing-masing dari tanggal unggah TERLAMA ke terbaru; habis →
//     ulang dari awal. Lihat lib/siklus-metrik & lib/kata-kunci-video.
//
// Rem (kuota upload-post dipakai bersama unggahan & rekonsiliasi KPI):
//   • maks METRIK_VIDEO_PER_MENIT permintaan/menit (bawaan 300 sejak
//     29 Sep 2026, dulu 200; paket Business ±2.500+10/profil per 10 menit
//     ≈ ±400/menit berkelanjutan — sisanya untuk unggahan & fitur lain);
//   • maks 40 permintaan per akun sosmed per putaran, akun bergiliran;
//   • header x-ratelimit-remaining menipis / 429 → TUNGGU jendela kuota
//     per menit berganti lalu lanjut (dulu berhenti sampai putaran
//     berikutnya = 5 menit terbuang untuk kuota yang pulih ±20 detik);
//     berhenti & jeda hanya bila pulihnya lama / tak diketahui;
//   • akun yang tokennya rusak / kena batas platform dijeda (bukan
//     ditanya terus-menerus); video yang dihapus dilewati.
//
// Angka yang galat TIDAK menimpa angka bagus sebelumnya.
// ============================================================
import { supabase } from "@/lib/supabase";
import { kolomTabelAda } from "@/lib/kolom-struktur";
import { kodeMetrik } from "@/lib/insight-kategori";
import { akunDariTautan, idVideo, kanonikTautan } from "@/lib/tautan-video";
import { klienCache } from "@/lib/redis";
import { latarHarusBerhenti } from "@/lib/penjaga-supabase";
import { semuaBaris } from "@/lib/semua-baris";
import { adalahTautanPendek, alamatDariPengalihan } from "@/lib/tautan-pendek";
import { analitikPostAsliUp, analitikPostLiveUp, daftarMediaUp, uploadPostSiap } from "@/lib/upload-post";
import { kataKunciCocok, siapkanKataKunci, sidikKataKunci, type KataKunci } from "@/lib/kata-kunci-video";
import { gabungTertunda, jalankanSiklus, persenSiklus, susunUrutan, type CalonRencana } from "@/lib/siklus-metrik";
import {
  BELUM_DITARIK,
  adalahMediaVideo,
  potongAman,
  awalHariWib,
  barisMetrikVideo,
  golonganGalat,
  idPlatformDariUrl,
  jelajahiAntrean,
  kuotaMenipis,
  perluDaftarMedia,
  platformApp,
  platformDidukung,
  selangSeling,
  SELANG_TINGKAT,
  tingkatKesegaran,
  waktuDariLaporan,
  type BarisLama,
  type BatasUp,
  type BlokLive,
  type JawabanLive,
  type KolomTambahan,
  type NamaTingkat,
  type PosisiAntrean,
  type Tingkat,
} from "@/lib/metrik-video-up";
import type { MetrikPost } from "@/lib/metrik-post-up";

type Db = ReturnType<typeof supabase>;

// ------------------------------------------------------------
// Konstanta
// ------------------------------------------------------------

const KUNCI_STATUS = "metrik_video_status";
const KUNCI_LEASE = "metrik_video_lease";
/** Umur lease: sedikit di atas lama satu putaran + panggilan yang masih jalan. */
const UMUR_LEASE_MS = 295_000;
/** Anggaran waktu satu putaran (penjadwal memutus di 280 dtk). */
const ANGGARAN_MS = 225_000;
/** Maks permintaan ke upload-post per menit (bisa diubah lewat env). */
const MAKS_PER_MENIT = Math.max(20, Math.min(600, Number(process.env.METRIK_VIDEO_PER_MENIT) || 300));
/**
 * Permintaan yang berjalan bersamaan. Satu panggilan analitik 3–10 dtk,
 * jadi 12 pekerja mentok di ±170/menit (terukur 29 Sep: 617 permintaan
 * per putaran 217 dtk) — 300/menit butuh ±24 pekerja.
 */
const PARALEL = 24;
/** Bagian jatah satu putaran robot untuk jalur cepat (video hari ini). */
const BAGIAN_JALUR_CEPAT = 0.15;
/** Maks permintaan per akun sosmed per putaran (batas laju platform per akun). */
const MAKS_PER_AKUN_PUTARAN = 40;
/** Unggahan semuda ini belum ditanya: platform masih memproses/menerbitkan. */
const UMUR_MIN_UNGGAHAN_MS = 20 * 60_000;
/** Baris kandidat per kueri tingkat. */
const JENDELA_TINGKAT = 1000;
/** Jendela maksimal per tingkat per putaran (bila banyak yang tersaring). */
const MAKS_JENDELA_TINGKAT = 4;
/** Baris laporan_video yang dikenali per putaran. */
const MAKS_LAPORAN_PUTARAN = 4000;
/** Halaman daftar media pertama (cek video baru) tiap akun sekali per jam. */
const CEK_BARU_MS = 60 * 60_000;
/** Halaman daftar media maksimal per putaran: cek baru & isi katalog. */
const MAKS_HALAMAN_BARU = 80;
const MAKS_HALAMAN_ISI = 60;
/** Isi katalog per akun maksimal sekian halaman (≈ 2.000–4.000 video). */
const MAKS_HALAMAN_AKUN = 40;
/** Katalog akun diulang dari awal seminggu sekali (video lama yang terlewat). */
const ULANG_ISI_MS = 7 * 86_400_000;
/** Ditolak 429 tanpa keterangan kapan pulih → tunggu selama ini. */
const JEDA_TOLAK_MS = 5 * 60_000;
/** Umur peta "kode video → ID media" per akun (dirawat oleh katalog). */
const UMUR_PETA_MEDIA_MS = 7 * 86_400_000;
const JAM = 3600_000;

// ------------------------------------------------------------
// Mode uji kering (dry-run) — baca & tanya sungguhan, TIDAK menulis apa pun.
// ------------------------------------------------------------

let ujiKeringAktif = false;

// ------------------------------------------------------------
// pengaturan_sistem: status & lease
// ------------------------------------------------------------

export type StatusPenyegar = {
  v: 2;
  /** Akhir putaran terakhir (ISO). */
  terakhir: string | null;
  /** Setelah upload-post menolak/kuota menipis: jangan bertanya sampai … */
  jeda_sampai: string | null;
  /** id laporan_video terakhir yang sudah dikenali katalog. */
  kursor_laporan: number;
  /** Ringkasan putaran terakhir. */
  putaran: {
    diminta: number;
    terisi: number;
    galat: number;
    dilewati: number;
    ditemukan: number;
    halaman: number;
    durasi_ms: number;
    /** Kenapa berhenti lebih awal (kuota, database lambat, …). */
    alasan?: string;
    /** Sisa kuota upload-post menit itu (header) saat terakhir dilihat. */
    sisa_kuota?: number | null;
    /** Berapa kali menunggu jendela kuota per menit berganti. */
    ditahan?: number;
  } | null;
  /** Video hari ini yang masih jatuh tempo (tingkat lain kini lewat putaran). */
  menunggu: Record<NamaTingkat, number> | null;
  /** Kemajuan putaran kata kunci → lainnya (29 Sep 2026). */
  siklus?: InfoSiklus | null;
  /** Isi katalog: seluruh video & yang sudah punya angka. */
  katalog: { video: number; berangka: number; akun: number; akun_lengkap: number } | null;
};

export type InfoSiklus = {
  ke: number;
  mulai: string;
  total: number;
  /** Jumlah video kata kunci (di depan urutan). */
  prioritas: number;
  posisi: number;
  persen: number;
  tertunda: number;
  /** Akhir & lama putaran sebelumnya. */
  selesai_lalu: string | null;
  durasi_lalu_jam: number | null;
};

function statusKosong(): StatusPenyegar {
  return { v: 2, terakhir: null, jeda_sampai: null, kursor_laporan: 0, putaran: null, menunggu: null, katalog: null };
}

function bacaStatusTeks(teks: string | null): StatusPenyegar {
  if (!teks) return statusKosong();
  try {
    const o = JSON.parse(teks) as Partial<StatusPenyegar>;
    if (!o || o.v !== 2) return statusKosong();
    return {
      ...statusKosong(),
      ...o,
      v: 2,
      kursor_laporan: Math.max(0, Math.floor(Number(o.kursor_laporan) || 0)),
    };
  } catch {
    return statusKosong();
  }
}

async function bacaNilai(db: Db, kunci: string): Promise<string | null> {
  const { data } = await db.from("pengaturan_sistem").select("nilai").eq("kunci", kunci).maybeSingle();
  return data?.nilai == null ? null : String(data.nilai);
}

async function simpanStatus(db: Db, s: StatusPenyegar): Promise<void> {
  if (ujiKeringAktif) return;
  const { error } = await db
    .from("pengaturan_sistem")
    .upsert({ kunci: KUNCI_STATUS, nilai: JSON.stringify(s) }, { onConflict: "kunci" });
  if (error) console.error("[metrik-video] simpan status:", error.message);
}

/** Keadaan penyegar untuk ditampilkan di panel. */
export async function statusPenyegar(): Promise<StatusPenyegar | null> {
  const teks = await bacaNilai(supabase(), KUNCI_STATUS);
  return teks ? bacaStatusTeks(teks) : null;
}

/** Ambil lease secara atomik; null bila sedang dipegang putaran lain. */
async function ambilLease(db: Db): Promise<string | null> {
  const kini = new Date().toISOString();
  const sampai = new Date(Date.now() + UMUR_LEASE_MS).toISOString();
  await db
    .from("pengaturan_sistem")
    .upsert({ kunci: KUNCI_LEASE, nilai: "" }, { onConflict: "kunci", ignoreDuplicates: true });
  // Menang hanya bila lease kosong ATAU sudah kedaluwarsa (ISO dibanding leksikal).
  const { data } = await db
    .from("pengaturan_sistem")
    .update({ nilai: sampai })
    .eq("kunci", KUNCI_LEASE)
    .lt("nilai", kini)
    .select("kunci");
  return data && data.length > 0 ? sampai : null;
}

async function lepasLease(db: Db, lease: string): Promise<void> {
  await db
    .from("pengaturan_sistem")
    .update({ nilai: "" })
    .eq("kunci", KUNCI_LEASE)
    .eq("nilai", lease)
    .then(
      () => undefined,
      () => undefined,
    );
}

// ------------------------------------------------------------
// Simpanan kerja (Redis; memori bila Redis tidak ada)
// ------------------------------------------------------------
//
// Hal-hal yang bukan data aplikasi tapi harus diingat antar-putaran:
// jeda per akun, kemajuan katalog per akun, video yang baru saja gagal,
// dan kapan unggahan terakhir disegarkan. Hilang (Redis dikosongkan) =
// aman: paling-paling beberapa hal ditanya ulang.

type StatusAkun = { jeda: number; alasan: string };
type KatalogAkun = { baru?: number; cursor?: string | null; selesai?: number; halaman?: number; video?: number; gagal?: number };
type Simpanan = {
  akun: Record<string, StatusAkun>;
  katalog: Record<string, KatalogAkun>;
  /** kode video → jangan ditanya sebelum (ms). */
  gagal: Record<string, number>;
  /** id tvrku_post → terakhir disegarkan (ms). */
  unggah: Record<string, number>;
  /**
   * Posisi terakhir antrean tiap tingkat (29 Sep 2026). Tanpa ini tiap
   * putaran mulai dari depan antrean — dan video yang selalu dilewati
   * (akun dijeda, ID media belum ada) memenuhi 4.000 calon pertama,
   * sehingga video di belakangnya TIDAK PERNAH terjangkau. Terbukti:
   * antrean "lama" urut kode (fb_ < ig_ < th_ < tt_ < yt_) hanya sampai
   * Threads; 27 ribu TikTok & 10 ribu YouTube tak pernah ditarik.
   */
  kursor?: Record<string, { d: string; k: string }>;
};

const KUNCI_SIMPANAN = "mv:simpanan:v1";
let simpananMemori: Simpanan | null = null;

function simpananKosong(): Simpanan {
  return { akun: {}, katalog: {}, gagal: {}, unggah: {} };
}

async function muatSimpanan(): Promise<Simpanan> {
  if (simpananMemori) return simpananMemori;
  const redis = klienCache();
  if (redis) {
    try {
      const r = await redis.get<Simpanan>(KUNCI_SIMPANAN);
      if (r && typeof r === "object" && r.akun && r.katalog && r.gagal && r.unggah) {
        simpananMemori = r;
        return r;
      }
    } catch {
      // Redis bermasalah → mulai dari kosong (aman).
    }
  }
  simpananMemori = simpananKosong();
  return simpananMemori;
}

/** Buang catatan kedaluwarsa supaya simpanan tidak membengkak. */
function rapikanSimpanan(s: Simpanan, kini: number) {
  for (const [k, v] of Object.entries(s.akun)) if (v.jeda <= kini) delete s.akun[k];
  for (const [k, v] of Object.entries(s.gagal)) if (v <= kini) delete s.gagal[k];
  const batasUnggah = kini - 3 * 86_400_000;
  for (const [k, v] of Object.entries(s.unggah)) if (v < batasUnggah) delete s.unggah[k];
}

async function simpanSimpanan(s: Simpanan): Promise<void> {
  simpananMemori = s;
  if (ujiKeringAktif) return;
  const redis = klienCache();
  if (!redis) return;
  try {
    await redis.set(KUNCI_SIMPANAN, s, { ex: 30 * 86_400 });
  } catch {
    // Gagal menyimpan bukan alasan menggagalkan putaran.
  }
}

// ------------------------------------------------------------
// Pengendali kuota & laju
// ------------------------------------------------------------

export class Pengendali {
  private sisa: number;
  readonly tenggat: number;
  berhenti = false;
  alasanBerhenti = "";
  jedaSampai: number | null = null;
  batasTerakhir: BatasUp | null = null;
  diminta = 0;
  /** Berapa kali menunggu jendela kuota per menit berganti. */
  kaliDitahan = 0;
  /** Jatah sementara (jalur cepat); null = tanpa batas tambahan. */
  private batasJatah: number | null = null;
  private pakaiJatah = 0;
  /** Kuota per menit menipis → jangan meminta sebelum (ms). */
  private tahanSampai = 0;
  private readonly saatAmbil?: () => void;
  private readonly lebihMs: number;
  private readonly jarakMs: number;
  private slotBerikut = 0;
  private readonly perAkun = new Map<string, number>();

  constructor(
    maks: number,
    anggaranMs: number,
    opsi: { saatAmbil?: () => void; lebihMs?: number; perMenit?: number } = {},
  ) {
    this.sisa = maks;
    this.tenggat = Date.now() + anggaranMs;
    this.saatAmbil = opsi.saatAmbil;
    this.lebihMs = opsi.lebihMs ?? 30_000;
    this.jarakMs = Math.floor(60_000 / Math.max(1, opsi.perMenit ?? MAKS_PER_MENIT));
  }

  get sisaPermintaan(): number {
    return Math.max(0, this.sisa);
  }

  sisaWaktu(): number {
    return this.tenggat - Date.now();
  }

  /** Masih boleh bekerja (kuota, waktu, jatah, tidak direm)? */
  bolehLanjut(minWaktuMs = 8_000): boolean {
    if (this.batasJatah !== null && this.pakaiJatah >= this.batasJatah) return false;
    return !this.berhenti && this.sisa > 0 && this.sisaWaktu() >= minWaktuMs;
  }

  /** Jalankan `kerja` dengan paling banyak `n` permintaan (jalur cepat). */
  async denganJatah<T>(n: number, kerja: () => Promise<T>): Promise<T> {
    const lama = { batas: this.batasJatah, pakai: this.pakaiJatah };
    this.batasJatah = Math.max(0, Math.floor(n));
    this.pakaiJatah = 0;
    try {
      return await kerja();
    } finally {
      this.batasJatah = lama.batas;
      this.pakaiJatah = lama.pakai;
    }
  }

  /** Jatah akun ini di putaran ini sudah habis? */
  akunPenuh(akun: string | undefined): boolean {
    return Boolean(akun) && (this.perAkun.get(akun!) ?? 0) >= MAKS_PER_AKUN_PUTARAN;
  }

  /**
   * Klaim satu permintaan lalu tunggu gilirannya (laju maks per menit).
   * false = kuota/waktu habis, sedang direm, atau jatah akun habis.
   */
  async izin(minWaktuMs = 8_000, akun?: string): Promise<boolean> {
    if (!this.bolehLanjut(minWaktuMs) || this.akunPenuh(akun)) return false;
    // Database macet saat tugas LATAR berjalan (28 Sep 2026): berhenti
    // untuk putaran ini saja — tanpa jeda panjang (bukan salah upload-post).
    if (latarHarusBerhenti()) {
      this.berhenti = true;
      if (!this.alasanBerhenti) this.alasanBerhenti = "database sedang lambat";
      return false;
    }
    // Kuota per menit ditahan: tunggu jendelanya berganti (bila waktu cukup).
    const tahan = this.tahanSampai - Date.now();
    if (tahan > 0) {
      if (this.sisaWaktu() - tahan < minWaktuMs) return false;
      await new Promise((r) => setTimeout(r, tahan));
      if (!this.bolehLanjut(minWaktuMs) || this.akunPenuh(akun)) return false;
    }
    this.sisa -= 1;
    this.diminta += 1;
    if (this.batasJatah !== null) this.pakaiJatah += 1;
    if (akun) this.perAkun.set(akun, (this.perAkun.get(akun) ?? 0) + 1);
    this.saatAmbil?.();
    const kini = Date.now();
    const slot = Math.max(kini, this.slotBerikut);
    this.slotBerikut = slot + this.jarakMs;
    if (slot > kini) await new Promise((r) => setTimeout(r, slot - kini));
    return !this.berhenti;
  }

  /** Batas waktu satu panggilan: boleh melewati tenggat sedikit (lebihMs). */
  batasPanggilan(maksMs: number): number {
    return Math.max(8_000, Math.min(maksMs, this.sisaWaktu() + this.lebihMs));
  }

  catatBatas(b: BatasUp | undefined | null) {
    if (!b) return;
    this.batasTerakhir = b;
    if (kuotaMenipis(b)) this.tahanAtauRem("kuota upload-post menipis", b.reset_ms);
  }

  /**
   * Kuota menipis / 429: bila jendelanya pulih ≤ 65 dtk lagi dan waktu
   * putaran masih cukup → tunggu lalu lanjut; selain itu berhenti & jeda.
   */
  tahanAtauRem(alasan: string, resetMs: number | null | undefined) {
    const kini = Date.now();
    if (resetMs && resetMs > kini && resetMs - kini <= 65_000 && this.sisaWaktu() - (resetMs - kini) >= 20_000) {
      if (resetMs + 500 > this.tahanSampai) {
        this.tahanSampai = resetMs + 500;
        this.kaliDitahan += 1;
      }
      return;
    }
    this.rem(alasan, resetMs);
  }

  rem(alasan: string, sampaiMs: number | null | undefined) {
    this.berhenti = true;
    if (!this.alasanBerhenti) this.alasanBerhenti = alasan;
    const sampai =
      sampaiMs && sampaiMs > Date.now() ? Math.min(sampaiMs, Date.now() + 30 * 60_000) : Date.now() + JEDA_TOLAK_MS;
    this.jedaSampai = Math.max(this.jedaSampai ?? 0, sampai);
  }

  /** Galat panggilan upload-post: true bila karena kuota (item ditunda). */
  tanganiGalat(e: unknown): boolean {
    const g = e as { status?: number; batas?: BatasUp };
    if (g?.batas) this.batasTerakhir = g.batas;
    if (g?.status === 429) {
      this.tahanAtauRem("upload-post menolak (429)", g.batas?.reset_ms ?? null);
      return true;
    }
    return false;
  }
}

/** Kerjakan antrean dengan PARALEL pekerja sampai habis / direm. */
async function jalankanAntre<T>(items: T[], kerja: (t: T) => Promise<void>, ctrl: Pengendali, minWaktuMs = 8_000): Promise<number> {
  let i = 0;
  let selesai = 0;
  const pekerja = async () => {
    while (i < items.length && ctrl.bolehLanjut(minWaktuMs)) {
      const t = items[i++];
      await kerja(t);
      selesai += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALEL, items.length) }, pekerja));
  return selesai;
}

// ------------------------------------------------------------
// Konteks: kolom opsional, profil & akun tersambung
// ------------------------------------------------------------

type AkunTersambung = { uid: number; platform: string; username: string; profil: string; kunci: string };

type Konteks = {
  kolom: KolomTambahan;
  /** user_id → profile_key upload-post */
  profilPer: Map<number, string>;
  /** "user_id|platform" → username akun tertaut */
  akunUser: Map<string, string>;
  /** "platform|username" → user_id pemilik (akun tersambung) */
  pemilikAkun: Map<string, number>;
  /** "user_id|platform" yang tersambung ke upload-post */
  tersambung: Set<string>;
  /** Seluruh akun tersambung yang punya profil upload-post. */
  akun: AkunTersambung[];
};

async function muatKonteks(db: Db): Promise<Konteks> {
  const [fav, sum, men] = await Promise.all([
    kolomTabelAda("tvr_video_metrik", "favorit"),
    kolomTabelAda("tvr_video_metrik", "sumber"),
    kolomTabelAda("tvr_video_metrik", "mentah"),
  ]);
  type BarisAkun = { user_id: number | string; platform: string; username: string | null; terhubung: boolean | null };
  const [{ data: profil }, akun] = await Promise.all([
    db
      .from("sosmed_profile")
      .select("id, user_id, profile_key")
      .eq("jenis", "pengguna")
      .eq("penyedia", "upload-post")
      .order("id", { ascending: true }),
    semuaBaris<BarisAkun>(
      (dari, sampai) =>
        db
          .from("akun_tvr_user")
          .select("user_id, platform, username, terhubung")
          .eq("aktif", true)
          .order("id", { ascending: true })
          .range(dari, sampai) as unknown as PromiseLike<{ data: BarisAkun[] | null; error: { message: string } | null }>,
      10_000,
    ),
  ]);
  const profilPer = new Map<number, string>();
  for (const p of profil ?? []) {
    const uid = Number(p.user_id);
    if (uid > 0 && p.profile_key && !profilPer.has(uid)) profilPer.set(uid, String(p.profile_key));
  }
  const akunUser = new Map<string, string>();
  const pemilikAkun = new Map<string, number>();
  const tersambung = new Set<string>();
  const daftar = new Map<string, AkunTersambung>();
  for (const a of akun) {
    const uid = Number(a.user_id);
    const pf = platformApp(String(a.platform ?? ""));
    const nama = String(a.username ?? "").replace(/^@/, "").trim();
    if (!uid || !pf) continue;
    const k = `${uid}|${pf}`;
    // Akun yang tersambung didahulukan sebagai nama akun video.
    if (nama && (!akunUser.has(k) || a.terhubung === true)) akunUser.set(k, nama);
    if (a.terhubung === true) {
      tersambung.add(k);
      if (nama) pemilikAkun.set(`${pf}|${nama.toLowerCase()}`, uid);
      const pk = profilPer.get(uid);
      if (pk && platformDidukung(pf) && !daftar.has(k)) daftar.set(k, { uid, platform: pf, username: nama, profil: pk, kunci: k });
    }
  }
  return { kolom: { favorit: fav, sumber: sum, mentah: men }, profilPer, akunUser, pemilikAkun, tersambung, akun: [...daftar.values()] };
}

// ------------------------------------------------------------
// Penulisan tvr_video_metrik
// ------------------------------------------------------------

type DraftBaris = {
  kode: string;
  platform: string;
  url: string;
  metrik: MetrikPost;
  mentah: Record<string, unknown> | null;
  akun_username: string;
  user_id: number | null;
  judul: string;
  waktu_posting: string | null;
};

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

/** Simpan angka (satu baris per kode; draf terakhir menang). Mengembalikan jumlah tersimpan. */
async function tulisDraf(db: Db, draf: DraftBaris[], kolom: KolomTambahan): Promise<number> {
  if (ujiKeringAktif) return 0;
  const perKode = new Map<string, DraftBaris>();
  for (const d of draf) perKode.set(d.kode, d);
  if (perKode.size === 0) return 0;
  const kini = new Date().toISOString();
  let tersimpan = 0;
  for (const bagian of potong([...perKode.values()], 200)) {
    const { data: lama } = await db
      .from("tvr_video_metrik")
      .select("kode, akun_username, nama_akun, judul, url, waktu_posting, user_id")
      .in(
        "kode",
        bagian.map((d) => d.kode),
      );
    const petaLama = new Map<string, BarisLama>();
    for (const l of lama ?? []) petaLama.set(String(l.kode), l as BarisLama);
    const baris = bagian.map((d) => barisMetrikVideo({ ...d, kini, lama: petaLama.get(d.kode) ?? null, kolom }));
    const { error } = await db.from("tvr_video_metrik").upsert(baris, { onConflict: "kode" });
    if (error) {
      console.error("[metrik-video] simpan angka:", error.message);
      continue;
    }
    tersimpan += baris.length;
  }
  return tersimpan;
}

/** Draf dari satu blok "ok". null = alamatnya tidak memuat ID video. */
function drafDariBlok(
  blok: BlokLive,
  o: { kodeDikenal?: string; urlCadangan?: string; user_id: number | null; akun: string; judul: string; waktu: string | null },
): DraftBaris | null {
  if (blok.status !== "ok" || !blok.metrik) return null;
  const mentahUrl = blok.post_url || blok.metrik.post_url || o.urlCadangan || "";
  const kode = o.kodeDikenal ?? (mentahUrl ? kodeMetrik(blok.platform, mentahUrl) : null);
  if (!kode || !mentahUrl) return null;
  // Bentuk kanonik (tanpa ?utm_… dan sejenisnya), sama dengan yang dicatat laporan.
  const url = kanonikTautan(blok.platform, mentahUrl, o.akun || null);
  return {
    kode,
    platform: blok.platform,
    url,
    metrik: blok.metrik,
    mentah: blok.mentah,
    akun_username: o.akun || akunDariTautan(blok.platform, url) || "",
    user_id: o.user_id,
    judul: o.judul,
    waktu_posting: o.waktu,
  };
}

/** Satu video yang dikenali katalog (belum tentu sudah punya angka). */
type BarisKatalog = {
  kode: string;
  platform: string;
  akun_username: string;
  user_id: number;
  url: string;
  judul: string;
  thumbnail_url: string;
  waktu_posting: string | null;
};

/**
 * Masukkan video ke katalog. Yang BARU dicatat sebagai "belum ditarik"
 * (angkanya menyusul); yang sudah ada hanya dilengkapi waktu posting &
 * gambar pratinjaunya — angkanya tidak disentuh.
 */
async function gabungKatalog(db: Db, rows: BarisKatalog[], kolom: KolomTambahan, isiCelah: boolean): Promise<number> {
  const perKode = new Map<string, BarisKatalog>();
  for (const r of rows) if (r.kode && r.url) perKode.set(r.kode, r);
  if (perKode.size === 0) return 0;
  let baruN = 0;
  for (const bagian of potong([...perKode.values()], 200)) {
    const { data: lama, error } = await db
      .from("tvr_video_metrik")
      .select("kode, platform, akun_username, url, waktu_posting, thumbnail_url, user_id")
      .in(
        "kode",
        bagian.map((r) => r.kode),
      );
    if (error) {
      console.error("[metrik-video] baca katalog:", error.message);
      continue;
    }
    const ada = new Map<string, Record<string, unknown>>();
    for (const l of lama ?? []) ada.set(String(l.kode), l as Record<string, unknown>);
    const baru = bagian.filter((r) => !ada.has(r.kode));
    baruN += baru.length;
    if (ujiKeringAktif) continue;
    if (baru.length > 0) {
      const isi = baru.map((r) => {
        const b: Record<string, unknown> = {
          kode: r.kode,
          platform: r.platform,
          akun_username: potongAman(r.akun_username, 120),
          user_id: r.user_id,
          nama_akun: "",
          judul: potongAman(r.judul, 300),
          url: potongAman(r.url, 500),
          thumbnail_url: potongAman(r.thumbnail_url, 1000),
          waktu_posting: r.waktu_posting,
          tayangan: 0,
          suka: 0,
          komentar: 0,
          bagikan: 0,
          diperbarui_pada: BELUM_DITARIK,
        };
        if (kolom.sumber) b.sumber = "upload-post";
        return b;
      });
      const { error: eBaru } = await db.from("tvr_video_metrik").upsert(isi, { onConflict: "kode", ignoreDuplicates: true });
      if (eBaru) {
        // Satu baris rusak menggagalkan seluruh kiriman → ulang per baris,
        // supaya hanya baris itu yang terlewat, bukan 200 video sekaligus.
        let gagal = 0;
        for (const satu of isi) {
          const { error: e1 } = await db.from("tvr_video_metrik").upsert(satu, { onConflict: "kode", ignoreDuplicates: true });
          if (e1) gagal += 1;
        }
        if (gagal > 0) console.error(`[metrik-video] katalog baru: ${gagal} baris gagal —`, eBaru.message);
      }
    }
    if (!isiCelah) continue;
    // Lengkapi yang sudah ada: waktu posting dari daftar media lebih
    // tepat daripada perkiraan dari laporan; gambar pratinjau bila kosong.
    const celah: Record<string, unknown>[] = [];
    for (const r of bagian) {
      const l = ada.get(r.kode);
      if (!l) continue;
      const waktuLama = l.waktu_posting ? String(l.waktu_posting) : null;
      const gantiWaktu = Boolean(r.waktu_posting) && (!waktuLama || Math.abs(Date.parse(waktuLama) - Date.parse(r.waktu_posting!)) > 60_000);
      const gantiGambar = Boolean(r.thumbnail_url) && !String(l.thumbnail_url ?? "");
      const gantiPemilik = l.user_id == null;
      if (!gantiWaktu && !gantiGambar && !gantiPemilik) continue;
      celah.push({
        kode: r.kode,
        platform: String(l.platform ?? r.platform),
        akun_username: String(l.akun_username ?? "") || r.akun_username,
        url: String(l.url ?? "") || r.url,
        waktu_posting: gantiWaktu ? r.waktu_posting : waktuLama,
        thumbnail_url: gantiGambar ? potongAman(r.thumbnail_url, 1000) : String(l.thumbnail_url ?? ""),
        user_id: l.user_id == null ? r.user_id : Number(l.user_id),
      });
    }
    if (celah.length > 0) {
      const { error: eCelah } = await db.from("tvr_video_metrik").upsert(celah, { onConflict: "kode" });
      if (eCelah) {
        let gagal = 0;
        for (const satu of celah) {
          const { error: e1 } = await db.from("tvr_video_metrik").upsert(satu, { onConflict: "kode" });
          if (e1) gagal += 1;
        }
        if (gagal > 0) console.error(`[metrik-video] lengkapi katalog: ${gagal} baris gagal —`, eCelah.message);
      }
    }
  }
  return baruN;
}

// ------------------------------------------------------------
// Peta "kode video → ID media" per akun (Instagram/Threads/Facebook)
// ------------------------------------------------------------

const petaMedia = new Map<string, { sampai: number; peta: Record<string, string> }>();

async function bacaPetaMedia(kunci: string): Promise<Record<string, string> | null> {
  const m = petaMedia.get(kunci);
  if (m && m.sampai > Date.now()) return m.peta;
  const redis = klienCache();
  if (!redis) return null;
  try {
    const r = await redis.get<Record<string, string>>(`mv:media:${kunci}`);
    if (r && typeof r === "object" && !Array.isArray(r)) {
      petaMedia.set(kunci, { sampai: Date.now() + 6 * JAM, peta: r });
      return r;
    }
  } catch {
    // Redis bermasalah → anggap belum ada.
  }
  return null;
}

/** Gabungkan entri baru ke peta akun. */
async function tambahPetaMedia(kunci: string, tambahan: Record<string, string>): Promise<void> {
  if (Object.keys(tambahan).length === 0) return;
  const lama = (await bacaPetaMedia(kunci)) ?? {};
  const peta = { ...lama, ...tambahan };
  if (petaMedia.size > 3000) petaMedia.clear();
  petaMedia.set(kunci, { sampai: Date.now() + 6 * JAM, peta });
  const redis = ujiKeringAktif ? null : klienCache();
  if (!redis) return;
  try {
    await redis.set(`mv:media:${kunci}`, peta, { ex: Math.floor(UMUR_PETA_MEDIA_MS / 1000) });
  } catch {
    // Gagal menyimpan cache bukan alasan menghentikan penyegaran.
  }
}

// ------------------------------------------------------------
// Link pendek (vt.tiktok, share Facebook/Threads, fb.watch) → alamat asli
// ------------------------------------------------------------
//
// Diverifikasi dari server VPS (25–26 Sep 2026): dengan user-agent
// crawler Facebook, ketiganya menjawab 302 ke alamat video yang lengkap
// (FB /reel/<ID> atau story.php?story_fbid=, Threads /@akun/post/<kode>,
// TikTok /@akun/video/<ID>). Peramban biasa ditolak Facebook (400). Hasil
// diingat 30 hari (gagal: 6 jam).

const UA_CRAWLER = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const UA_CADANGAN = "Twitterbot/1.0";
const UMUR_PENDEK_MS = 30 * 86_400_000;
const UMUR_PENDEK_GAGAL_MS = 6 * JAM;
/** Link pendek yang diurai bersamaan (bukan permintaan upload-post). */
const URAI_PARALEL = 10;
const pendekDiingat = new Map<string, { sampai: number; url: string }>();

async function bacaPendek(kunci: string): Promise<string | null | undefined> {
  const m = pendekDiingat.get(kunci);
  if (m && m.sampai > Date.now()) return m.url || null;
  const redis = klienCache();
  if (!redis) return undefined;
  try {
    const r = await redis.get<{ u?: string }>(`mv:pendek:${kunci}`);
    if (r && typeof r === "object" && typeof r.u === "string") {
      pendekDiingat.set(kunci, { sampai: Date.now() + UMUR_PENDEK_GAGAL_MS, url: r.u });
      return r.u || null;
    }
  } catch {
    // Redis bermasalah → urai ulang.
  }
  return undefined;
}

async function simpanPendek(kunci: string, url: string): Promise<void> {
  const umur = url ? UMUR_PENDEK_MS : UMUR_PENDEK_GAGAL_MS;
  if (pendekDiingat.size > 5000) pendekDiingat.clear();
  pendekDiingat.set(kunci, { sampai: Date.now() + Math.min(umur, UMUR_PENDEK_GAGAL_MS), url });
  const redis = ujiKeringAktif ? null : klienCache();
  if (!redis) return;
  try {
    await redis.set(`mv:pendek:${kunci}`, { u: url }, { ex: Math.floor(umur / 1000) });
  } catch {
    // Gagal mengingat bukan alasan menghentikan penyegaran.
  }
}

/** Ikuti pengalihan (maks 4 langkah) sampai ketemu alamat video asli. */
async function ikutiPengalihan(platform: string, url: string, ua: string): Promise<string | null> {
  let kini = url;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(kini, {
      redirect: "manual",
      headers: { "User-Agent": ua, Accept: "text/html" },
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    const lokasi = r.headers.get("location");
    if (lokasi && r.status >= 300 && r.status < 400) {
      await r.body?.cancel().catch(() => undefined);
      const lanjut = new URL(lokasi, kini).toString();
      const asli = alamatDariPengalihan(platform, lanjut);
      if (asli) return asli;
      kini = lanjut;
      continue;
    }
    if (r.status !== 200) {
      await r.body?.cancel().catch(() => undefined);
      return null;
    }
    // Tanpa pengalihan: sebagian halaman memuat alamat aslinya di og:url.
    const teks = (await r.text()).slice(0, 400_000);
    const og =
      /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i.exec(teks)?.[1] ??
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(teks)?.[1] ??
      "";
    return alamatDariPengalihan(platform, og.replace(/&amp;/g, "&"));
  }
  return null;
}

/**
 * Alamat asli sebuah link pendek; null bila tidak bisa diurai. Alamat
 * yang BUKAN link pendek dikembalikan apa adanya.
 */
export async function alamatAsli(platform: string, url: string): Promise<string | null> {
  if (!adalahTautanPendek(platform, url)) return url;
  const kunci = `${platform}|${url.trim().replace(/[?#].*$/, "")}`;
  const ada = await bacaPendek(kunci);
  if (ada !== undefined) return ada;
  let asli: string | null = null;
  try {
    asli = await ikutiPengalihan(platform, url, UA_CRAWLER);
    if (!asli) asli = await ikutiPengalihan(platform, url, UA_CADANGAN);
  } catch {
    asli = null;
  }
  await simpanPendek(kunci, asli ?? "");
  return asli;
}

// ------------------------------------------------------------
// Catatan hasil & galat
// ------------------------------------------------------------

type Catatan = { terisi: number; galat: number; dilewati: number; ditemukan: number; halaman: number };

function catatanKosong(): Catatan {
  return { terisi: 0, galat: 0, dilewati: 0, ditemukan: 0, halaman: 0 };
}

/** Hasil per akun di putaran ini — akun yang terus gagal dijeda. */
type HasilAkun = Map<string, { ok: number; gagal: number; pesan: string }>;

function catatAkun(hasil: HasilAkun, akun: string, ok: boolean, pesan = "") {
  const h = hasil.get(akun) ?? { ok: 0, gagal: 0, pesan: "" };
  if (ok) h.ok += 1;
  else {
    h.gagal += 1;
    if (pesan) h.pesan = pesan;
  }
  hasil.set(akun, h);
}

/**
 * Tindak lanjut galat satu video:
 *   akun  → seluruh akun dijeda 6 jam (token/izin);
 *   batas → akun dijeda 30 menit (batas laju platform);
 *   lain  → video itu saja dilewati sampai selang tingkatnya lewat
 *           (minimal 1 jam, maksimal 24 jam).
 */
function catatGalat(s: Simpanan, hasil: HasilAkun, akun: string, kode: string | null, pesan: string, selangMs: number) {
  const kini = Date.now();
  catatAkun(hasil, akun, false, pesan);
  const jenis = golonganGalat(pesan);
  if (jenis === "akun") {
    s.akun[akun] = { jeda: kini + 6 * JAM, alasan: pesan.slice(0, 160) };
  } else if (jenis === "batas") {
    s.akun[akun] = { jeda: kini + 30 * 60_000, alasan: pesan.slice(0, 160) };
  }
  if (kode) s.gagal[kode] = kini + Math.min(24 * JAM, Math.max(JAM, selangMs * 2));
}

/** Akun yang ≥ 4 kali gagal tanpa satu pun berhasil di putaran ini → jeda 6 jam. */
function jedaAkunGagalBeruntun(s: Simpanan, hasil: HasilAkun) {
  const kini = Date.now();
  for (const [akun, h] of hasil) {
    if (h.ok === 0 && h.gagal >= 4 && !(s.akun[akun]?.jeda > kini)) {
      s.akun[akun] = { jeda: kini + 6 * JAM, alasan: `gagal beruntun: ${h.pesan}`.slice(0, 160) };
    }
  }
}

function akunDijeda(s: Simpanan, akun: string): boolean {
  return (s.akun[akun]?.jeda ?? 0) > Date.now();
}

// ------------------------------------------------------------
// Bagian 2: unggahan SuperApp (request_id → semua platform sekaligus)
// ------------------------------------------------------------

type BarisUnggahan = {
  id: number | string;
  user_id: number | string;
  judul: string | null;
  request_id: string | null;
  jadwal: string | null;
  dibuat_pada: string;
};

const POLA_REQUEST_UP = /^[0-9a-f]{32}$/i;

export type HasilSatuUnggahan = {
  post_id: number;
  profil: string;
  judul: string;
  per_platform: { platform: string; status: string; galat: string; tayangan: number | null; post_url: string }[];
  tersimpan: number;
};

type Bantu = { simpanan: Simpanan; hasilAkun: HasilAkun; petaBaru: Map<string, Record<string, string>> };

/**
 * Tanya SATU unggahan ke upload-post. "tunda" hanya bila ditolak karena
 * kuota; galat lain (dihapus, token kedaluwarsa) = selesai.
 */
async function kerjakanUnggahan(
  p: BarisUnggahan,
  ctx: Konteks,
  ctrl: Pengendali,
  draf: DraftBaris[],
  catat: Catatan,
  bantu: Bantu | null,
  selangMs: number,
): Promise<{ hasil: "selesai" | "tunda"; jawaban?: JawabanLive; galat?: string }> {
  const rid = String(p.request_id ?? "").trim();
  if (!POLA_REQUEST_UP.test(rid)) return { hasil: "selesai" };
  if (p.jadwal && Date.parse(String(p.jadwal)) > Date.now()) return { hasil: "selesai" };
  // Satu unggahan = semua platform sekaligus (biasanya 3–10 dtk; Facebook
  // yang lambat bisa lebih lama) → hanya dimulai bila waktunya lapang.
  if (!(await ctrl.izin(40_000))) return { hasil: "tunda" };
  const uid = Number(p.user_id) || null;
  try {
    const { jawaban, batas } = await analitikPostLiveUp(rid, ctrl.batasPanggilan(45_000));
    ctrl.catatBatas(batas);
    for (const b of jawaban.blok) {
      const akunKunci = `${uid}|${b.platform}`;
      if (b.status === "tidak_terbit") continue;
      if (b.status === "galat") {
        catat.galat += 1;
        if (bantu && uid) catatGalat(bantu.simpanan, bantu.hasilAkun, akunKunci, null, b.galat, selangMs);
        continue;
      }
      const d = drafDariBlok(b, {
        user_id: uid,
        akun: uid ? (ctx.akunUser.get(akunKunci) ?? "") : "",
        judul: jawaban.judul || String(p.judul ?? ""),
        waktu: jawaban.waktu_unggah ?? (p.jadwal ? String(p.jadwal) : String(p.dibuat_pada)),
      });
      if (!d) continue;
      draf.push(d);
      catat.terisi += 1;
      if (bantu && uid) {
        catatAkun(bantu.hasilAkun, akunKunci, true);
        // ID media Instagram/Threads/Facebook dari jawaban ini → peta
        // akunnya, supaya penyegaran per video nanti tidak perlu mencari.
        const profil = ctx.profilPer.get(uid);
        if (profil && b.platform_post_id && perluDaftarMedia(b.platform)) {
          const kunciPeta = `${profil}|${b.platform}`;
          const peta = bantu.petaBaru.get(kunciPeta) ?? {};
          peta[d.kode] = b.platform_post_id;
          bantu.petaBaru.set(kunciPeta, peta);
        }
      }
    }
    if (bantu) bantu.simpanan.unggah[String(p.id)] = Date.now();
    return { hasil: "selesai", jawaban };
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    if (ctrl.tanganiGalat(e)) return { hasil: "tunda", galat: pesan };
    catat.galat += 1;
    // Tanpa jawaban sama sekali: jangan ditanya lagi sebelum selangnya lewat.
    if (bantu) bantu.simpanan.unggah[String(p.id)] = Date.now();
    return { hasil: "selesai", galat: pesan };
  }
}

async function segarkanUnggahan(
  db: Db,
  ctx: Konteks,
  ctrl: Pengendali,
  draf: DraftBaris[],
  catat: Catatan,
  bantu: Bantu,
  tingkat: "hari_ini" | "kemarin",
  simpanBerkala: () => Promise<void>,
) {
  if (!ctrl.bolehLanjut(40_000)) return;
  const kini = Date.now();
  const awal = awalHariWib(kini);
  const dari = tingkat === "hari_ini" ? awal : awal - 86_400_000;
  const sampai = tingkat === "hari_ini" ? kini + 86_400_000 : awal;
  const selang = SELANG_TINGKAT[tingkat];
  const { data, error } = await db
    .from("tvrku_post")
    .select("id, user_id, judul, request_id, jadwal, dibuat_pada")
    .gte("dibuat_pada", new Date(dari).toISOString())
    .lt("dibuat_pada", new Date(sampai).toISOString())
    .not("request_id", "is", null)
    .order("dibuat_pada", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("[metrik-video] baca unggahan:", error.message);
    return;
  }
  const antre = ((data ?? []) as BarisUnggahan[]).filter((p) => {
    if (!POLA_REQUEST_UP.test(String(p.request_id ?? ""))) return false;
    if (p.jadwal && Date.parse(String(p.jadwal)) > kini) return false;
    if (kini - Date.parse(String(p.dibuat_pada)) < UMUR_MIN_UNGGAHAN_MS) return false;
    const terakhir = bantu.simpanan.unggah[String(p.id)] ?? 0;
    return kini - terakhir >= selang;
  });
  // Yang paling lama tidak disegarkan duluan.
  antre.sort((a, b) => (bantu.simpanan.unggah[String(a.id)] ?? 0) - (bantu.simpanan.unggah[String(b.id)] ?? 0));
  await jalankanAntre(
    antre,
    async (p) => {
      await kerjakanUnggahan(p, ctx, ctrl, draf, catat, bantu, selang);
      await simpanBerkala();
    },
    ctrl,
    40_000,
  );
}

// ------------------------------------------------------------
// Bagian 3: per video, urut tingkat (hari ini → kemarin → pekan → lama)
// ------------------------------------------------------------

type ItemVideo = {
  kode: string;
  /** Kode video ASLI (baris link pendek menyimpan alamat aslinya). */
  kodeAsli: string;
  platform: string;
  uid: number;
  profil: string;
  akun: string;
  url: string;
};

type BarisKandidat = { kode: string; platform: string; user_id: number | string | null; url: string; diperbarui_pada: string };

async function kandidatTingkat(db: Db, t: Tingkat, setelah: PosisiAntrean | null): Promise<BarisKandidat[]> {
  let q = db
    .from("tvr_video_metrik")
    .select("kode, platform, user_id, url, diperbarui_pada")
    .not("user_id", "is", null)
    .lt("diperbarui_pada", t.basiSebelum);
  if (t.dari) q = q.gte("waktu_posting", t.dari);
  if (t.sampai) q = t.tanpaWaktu ? q.or(`waktu_posting.lt."${t.sampai}",waktu_posting.is.null`) : q.lt("waktu_posting", t.sampai);
  if (setelah) {
    // Lanjutan (keyset) setelah baris terakhir jendela sebelumnya.
    q = q.or(`diperbarui_pada.gt."${setelah.d}",and(diperbarui_pada.eq."${setelah.d}",kode.gt."${setelah.k}")`);
  }
  const { data, error } = await q
    .order("diperbarui_pada", { ascending: true })
    .order("kode", { ascending: true })
    .limit(JENDELA_TINGKAT);
  if (error) {
    console.error("[metrik-video] kandidat", t.nama, error.message);
    return [];
  }
  return (data ?? []) as BarisKandidat[];
}

async function kerjakanVideo(
  it: ItemVideo,
  ctx: Konteks,
  ctrl: Pengendali,
  draf: DraftBaris[],
  catat: Catatan,
  bantu: Bantu,
  hasilPutaran: Map<string, DraftBaris>,
  selangMs: number,
): Promise<void> {
  // Link pendek yang video aslinya sudah ditarik di putaran ini → salin.
  const sudah = hasilPutaran.get(it.kodeAsli);
  if (sudah) {
    if (it.kode !== it.kodeAsli) draf.push({ ...sudah, kode: it.kode });
    return;
  }
  let ppid: string | null = idPlatformDariUrl(it.platform, idVideo(it.platform, it.url));
  if (!ppid && perluDaftarMedia(it.platform)) {
    const peta = await bacaPetaMedia(`${it.profil}|${it.platform}`);
    ppid = peta?.[it.kodeAsli] ?? null;
  }
  // Facebook: analitiknya menerima ID reel/video/postingan langsung
  // (diverifikasi 26 Sep 2026) walau daftar medianya sering kosong.
  if (!ppid && it.platform === "facebook" && /^fb_\d{6,}$/.test(it.kodeAsli)) ppid = it.kodeAsli.slice(3);
  if (!ppid) {
    // Instagram/Threads butuh ID media dari daftar media akunnya. Katalog
    // akun yang belum lengkap → coba lagi nanti; yang sudah lengkap tapi
    // tidak memuat video ini → video di luar jangkauan (dilewati sehari).
    const k = bantu.simpanan.katalog[`${it.uid}|${it.platform}`];
    bantu.simpanan.gagal[it.kode] = Date.now() + (k?.selesai ? 24 * JAM : 2 * JAM);
    catat.dilewati += 1;
    return;
  }
  if (!(await ctrl.izin(12_000, it.akun))) return;
  try {
    const { jawaban, batas } = await analitikPostAsliUp(
      ppid,
      it.platform,
      it.profil,
      ctrl.batasPanggilan(it.platform === "facebook" ? 20_000 : 30_000),
    );
    ctrl.catatBatas(batas);
    const blok = jawaban.blok.find((b) => b.platform === it.platform) ?? jawaban.blok[0];
    const d = blok
      ? drafDariBlok(blok, {
          kodeDikenal: it.kodeAsli,
          urlCadangan: it.url,
          user_id: it.uid,
          akun: ctx.akunUser.get(it.akun) ?? "",
          judul: jawaban.judul,
          waktu: null,
        })
      : null;
    if (d) {
      draf.push(d);
      if (it.kode !== it.kodeAsli) draf.push({ ...d, kode: it.kode });
      hasilPutaran.set(it.kodeAsli, d);
      catat.terisi += 1;
      catatAkun(bantu.hasilAkun, it.akun, true);
    } else {
      catat.galat += 1;
      catatGalat(bantu.simpanan, bantu.hasilAkun, it.akun, it.kode, blok?.galat || "tanpa angka", selangMs);
    }
  } catch (e) {
    if (ctrl.tanganiGalat(e)) return;
    catat.galat += 1;
    catatGalat(bantu.simpanan, bantu.hasilAkun, it.akun, it.kode, e instanceof Error ? e.message : String(e), selangMs);
  }
}

async function segarkanTingkat(
  db: Db,
  ctx: Konteks,
  ctrl: Pengendali,
  draf: DraftBaris[],
  catat: Catatan,
  bantu: Bantu,
  hasilPutaran: Map<string, DraftBaris>,
  t: Tingkat,
  simpanBerkala: () => Promise<void>,
) {
  // Lanjut dari posisi putaran sebelumnya (lihat jelajahiAntrean).
  const kursor = (bantu.simpanan.kursor ??= {});
  const posisi = await jelajahiAntrean<BarisKandidat>({
    kursor: kursor[t.nama] ?? null,
    ukuran: JENDELA_TINGKAT,
    maksJendela: MAKS_JENDELA_TINGKAT,
    boleh: () => ctrl.bolehLanjut(12_000),
    ambil: (setelah) => kandidatTingkat(db, t, setelah),
    kerjakan: (baris) => kerjakanJendela(baris, ctx, ctrl, draf, catat, bantu, hasilPutaran, t, simpanBerkala),
  });
  if (posisi) kursor[t.nama] = posisi;
  else delete kursor[t.nama];
}

/** Satu jendela kandidat → true bila semuanya sempat dikerjakan. */
async function kerjakanJendela(
  baris: BarisKandidat[],
  ctx: Konteks,
  ctrl: Pengendali,
  draf: DraftBaris[],
  catat: Catatan,
  bantu: Bantu,
  hasilPutaran: Map<string, DraftBaris>,
  t: Tingkat,
  simpanBerkala: () => Promise<void>,
): Promise<boolean> {
  const kini = Date.now();
  const items: ItemVideo[] = [];
  for (const b of baris) {
    const uid = Number(b.user_id);
    const platform = platformApp(String(b.platform ?? ""));
    const profil = ctx.profilPer.get(uid);
    const akun = `${uid}|${platform}`;
    if (!profil || !platformDidukung(platform)) continue;
    if (akunDijeda(bantu.simpanan, akun) || (bantu.simpanan.gagal[b.kode] ?? 0) > kini) continue;
    if (ctrl.akunPenuh(akun)) continue;
    const kodeAsli = kodeMetrik(platform, String(b.url ?? "")) ?? b.kode;
    items.push({ kode: b.kode, kodeAsli, platform, uid, profil, akun, url: String(b.url ?? "") });
  }
  const urut = selangSeling(items, (x) => x.akun, MAKS_PER_AKUN_PUTARAN);
  const dikerjakan = await jalankanAntre(
    urut,
    async (it) => {
      await kerjakanVideo(it, ctx, ctrl, draf, catat, bantu, hasilPutaran, t.selangMs);
      await simpanBerkala();
    },
    ctrl,
    12_000,
  );
  // Waktu putaran habis di tengah jalan (izin laju ditolak pun terhitung
  // "dikerjakan") → belum tuntas: jelajahiAntrean berhenti di sini dan
  // putaran berikutnya lanjut sesudah jendela ini.
  return dikerjakan >= urut.length && ctrl.bolehLanjut(12_000);
}

// ------------------------------------------------------------
// Bagian 4: PUTARAN kata kunci → lainnya, terlama → terbaru (29 Sep 2026)
// ------------------------------------------------------------
// Rencana (urutan kode) disusun sekali per putaran dari katalog; posisi &
// daftar tertunda disimpan di Redis (memori bila Redis tidak ada). Hilang
// = aman: putaran baru dimulai, video yang baru disegarkan tidak ditanya
// ulang karena penyaring "sudah disegarkan sejak putaran dimulai".

type RencanaSiklus = { id: string; ke: number; mulai: string; dibangun: string; sidik: string; prioritas: number; kode: string[] };
type PosisiSiklus = { id: string; i: number; tertunda: string[]; selesai_lalu: string | null; durasi_lalu_ms: number | null };
type BarisSiklus = { kode: string; platform: string; user_id: number | string | null; url: string; diperbarui_pada: string; waktu_posting: string | null };

const KUNCI_RENCANA = "mv:siklus:rencana:v1";
const KUNCI_POSISI = "mv:siklus:posisi:v1";
/** Kode per potongan putaran (2 kueri `in` berisi 150 kode). */
const POTONGAN_SIKLUS = 300;
/** Video galat di putaran: jangan ditanya lagi sebelum … (catatGalat menggandakan). */
const SELANG_GAGAL_SIKLUS = 6 * JAM;
/** Maks tertunda yang dikerjakan di awal satu putaran robot. */
const MAKS_TERTUNDA_SEKALI = 1200;
let rencanaMemori: RencanaSiklus | null = null;
let posisiMemori: PosisiSiklus | null = null;

async function bacaRedis<T>(kunci: string): Promise<T | null> {
  const redis = klienCache();
  if (!redis) return null;
  try {
    return (await redis.get<T>(kunci)) ?? null;
  } catch {
    return null;
  }
}

async function tulisRedis(kunci: string, nilai: unknown): Promise<void> {
  if (ujiKeringAktif) return;
  const redis = klienCache();
  if (!redis) return;
  try {
    await redis.set(kunci, nilai, { ex: 14 * 86_400 });
  } catch {
    // Gagal menyimpan: putaran berikutnya menyusun ulang (aman).
  }
}

async function muatRencana(): Promise<RencanaSiklus | null> {
  if (rencanaMemori) return rencanaMemori;
  const r = await bacaRedis<RencanaSiklus>(KUNCI_RENCANA);
  if (r && Array.isArray(r.kode) && typeof r.id === "string") rencanaMemori = r;
  return rencanaMemori;
}

async function muatPosisi(): Promise<PosisiSiklus | null> {
  if (posisiMemori) return posisiMemori;
  const r = await bacaRedis<PosisiSiklus>(KUNCI_POSISI);
  if (r && typeof r.id === "string" && Array.isArray(r.tertunda)) posisiMemori = r;
  return posisiMemori;
}

async function simpanRencana(r: RencanaSiklus): Promise<void> {
  if (ujiKeringAktif) return;
  rencanaMemori = r;
  await tulisRedis(KUNCI_RENCANA, r);
}

async function simpanPosisi(p: PosisiSiklus): Promise<void> {
  if (ujiKeringAktif) return;
  posisiMemori = p;
  await tulisRedis(KUNCI_POSISI, p);
}

async function bacaKataKunci(db: Db): Promise<KataKunci[]> {
  const { data, error } = await db.from("keyword_wajib").select("keyword").eq("aktif", true).limit(500);
  if (error) {
    console.error("[metrik-video] kata kunci:", error.message);
    return [];
  }
  return siapkanKataKunci((data ?? []).map((k) => String(k.keyword ?? "")));
}

/**
 * Kode video yang KATEGORINYA memuat kata kunci: kategori laporan
 * (laporan_video.keyword — termasuk laporan otomatis unggahan), kategori
 * unggahan SuperApp (tvrku_post.hasil.kategori → tautan per platformnya),
 * dan link yang ditambahkan ke kategori (tvr_kategori_link, sql/50 —
 * belum tentu ada).
 */
export async function kodeBerkategori(db: Db, kunci: KataKunci[]): Promise<Set<string>> {
  const hasil = new Set<string>();
  if (kunci.length === 0) return hasil;
  const tambah = (platform: unknown, url: unknown) => {
    const k = kodeMetrik(String(platform ?? ""), String(url ?? ""));
    if (k) hasil.add(k);
  };
  let setelah = 0;
  for (let n = 0; n < 500; n++) {
    const { data, error } = await db
      .from("laporan_video")
      .select("id, platform, url_video, keyword")
      .not("keyword", "is", null)
      .neq("keyword", "")
      .gt("id", setelah)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) {
      console.error("[metrik-video] kategori laporan:", error.message);
      break;
    }
    const b = data ?? [];
    for (const l of b) if (kataKunciCocok(String(l.keyword ?? ""), kunci)) tambah(l.platform, l.url_video);
    if (b.length < 1000) break;
    setelah = Number(b[b.length - 1].id);
  }
  const idPost: number[] = [];
  let setelahPost = 0;
  for (let n = 0; n < 200; n++) {
    const { data, error } = await db
      .from("tvrku_post")
      .select("id, kategori:hasil->>kategori")
      .not("hasil->>kategori", "is", null)
      .gt("id", setelahPost)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) {
      console.error("[metrik-video] kategori unggahan:", error.message);
      break;
    }
    const b = (data ?? []) as unknown as { id: number; kategori: string | null }[];
    for (const p of b) if (kataKunciCocok(String(p.kategori ?? ""), kunci)) idPost.push(Number(p.id));
    if (b.length < 1000) break;
    setelahPost = Number(b[b.length - 1].id);
  }
  for (const bagian of potong(idPost, 300)) {
    const { data } = await db.from("laporan_video").select("platform, url_video").in("tvrku_post_id", bagian);
    for (const l of data ?? []) tambah(l.platform, l.url_video);
  }
  const { data: link, error: galatLink } = await db.from("tvr_kategori_link").select("platform, url, kategori").limit(20_000);
  if (!galatLink) for (const l of link ?? []) if (kataKunciCocok(String(l.kategori ?? ""), kunci)) tambah(l.platform, l.url);
  return hasil;
}

/** Susun urutan putaran dari seluruh katalog akun tersambung. */
export async function bangunRencana(db: Db, ke: number, mulai: string, kunci: KataKunci[]): Promise<RencanaSiklus> {
  const calon: CalonRencana[] = [];
  let setelah = "";
  for (let n = 0; n < 600; n++) {
    let q = db.from("tvr_video_metrik").select("kode, judul, waktu_posting").not("user_id", "is", null);
    if (setelah) q = q.gt("kode", setelah);
    const { data, error } = await q.order("kode", { ascending: true }).limit(1000);
    if (error) throw new Error(`Gagal membaca katalog untuk putaran: ${error.message}`);
    const b = (data ?? []) as { kode: string; judul: string | null; waktu_posting: string | null }[];
    for (const r of b) {
      const w = r.waktu_posting ? Date.parse(r.waktu_posting) : NaN;
      calon.push({ kode: r.kode, waktuMs: Number.isFinite(w) ? w : null, prioritas: Boolean(kataKunciCocok(r.judul, kunci)) });
    }
    if (b.length < 1000) break;
    setelah = b[b.length - 1].kode;
  }
  const kategori = await kodeBerkategori(db, kunci);
  for (const c of calon) if (!c.prioritas && kategori.has(c.kode)) c.prioritas = true;
  const { kode, prioritas } = susunUrutan(calon);
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ke,
    mulai,
    dibangun: new Date().toISOString(),
    sidik: sidikKataKunci(kunci),
    prioritas,
    kode,
  };
}

async function ambilBarisSiklus(db: Db, kode: string[]): Promise<BarisSiklus[]> {
  const hasil: BarisSiklus[] = [];
  for (const bagian of potong(kode, 150)) {
    const { data, error } = await db
      .from("tvr_video_metrik")
      .select("kode, platform, user_id, url, diperbarui_pada, waktu_posting")
      .in("kode", bagian);
    if (error) throw new Error(`Gagal membaca potongan putaran: ${error.message}`);
    hasil.push(...((data ?? []) as BarisSiklus[]));
  }
  return hasil;
}

function infoSiklus(r: RencanaSiklus, p: PosisiSiklus): InfoSiklus {
  return {
    ke: r.ke,
    mulai: r.mulai,
    total: r.kode.length,
    prioritas: r.prioritas,
    posisi: Math.min(p.i, r.kode.length),
    persen: persenSiklus(p.i, r.kode.length),
    tertunda: p.tertunda.length,
    selesai_lalu: p.selesai_lalu,
    durasi_lalu_jam: p.durasi_lalu_ms == null ? null : Math.round((p.durasi_lalu_ms / JAM) * 10) / 10,
  };
}

/** Keadaan putaran untuk status (tanpa mengubah apa pun). */
async function keadaanSiklus(): Promise<InfoSiklus | null> {
  const [r, p] = await Promise.all([muatRencana(), muatPosisi()]);
  return r && p && p.id === r.id ? infoSiklus(r, p) : null;
}

async function segarkanSiklus(
  db: Db,
  ctx: Konteks,
  ctrl: Pengendali,
  draf: DraftBaris[],
  catat: Catatan,
  bantu: Bantu,
  hasilPutaran: Map<string, DraftBaris>,
  simpanBerkala: () => Promise<void>,
): Promise<void> {
  // Menyusun rencana membaca ±110 ribu baris (±20 dtk) → butuh waktu lapang.
  if (!ctrl.bolehLanjut(60_000)) return;
  const kunci = await bacaKataKunci(db);
  let rencana = await muatRencana();
  let posisi = await muatPosisi();
  const kini = Date.now();
  if (!rencana || !posisi || posisi.id !== rencana.id || posisi.i >= rencana.kode.length) {
    // Putaran baru: pertama kali, simpanan hilang, atau putaran lalu tuntas.
    const tuntas = Boolean(rencana && posisi && posisi.id === rencana.id && posisi.i >= rencana.kode.length);
    const baru = await bangunRencana(db, (rencana?.ke ?? 0) + 1, new Date(kini).toISOString(), kunci);
    posisi = {
      id: baru.id,
      i: 0,
      tertunda: posisi?.tertunda ?? [],
      selesai_lalu: tuntas ? new Date(kini).toISOString() : (posisi?.selesai_lalu ?? null),
      durasi_lalu_ms: tuntas && rencana ? kini - Date.parse(rencana.mulai) : (posisi?.durasi_lalu_ms ?? null),
    };
    rencana = baru;
    await simpanRencana(rencana);
    await simpanPosisi(posisi);
  } else if (rencana.sidik !== sidikKataKunci(kunci)) {
    // Kata kunci berubah: urutan disusun ulang, putarannya (nomor & waktu
    // mulai) tetap — yang sudah disegarkan terlewati sendiri.
    const baru = await bangunRencana(db, rencana.ke, rencana.mulai, kunci);
    posisi = { ...posisi, id: baru.id, i: 0 };
    rencana = baru;
    await simpanRencana(rencana);
    await simpanPosisi(posisi);
  }
  const mulaiMs = Date.parse(rencana.mulai);

  const kerjakan = async (baris: BarisSiklus[]): Promise<string[]> => {
    const kiniK = Date.now();
    const awalHariIni = awalHariWib(kiniK);
    const items: ItemVideo[] = [];
    const belum: string[] = [];
    for (const b of baris) {
      if (b.user_id == null) continue;
      // Sudah disegarkan di putaran ini (atau oleh jalur cepat / tombol).
      if (Date.parse(b.diperbarui_pada) >= mulaiMs) continue;
      // Video hari ini: urusan jalur cepat.
      if (b.waktu_posting && Date.parse(b.waktu_posting) >= awalHariIni) continue;
      const uid = Number(b.user_id);
      const platform = platformApp(String(b.platform ?? ""));
      const profil = ctx.profilPer.get(uid);
      const akun = `${uid}|${platform}`;
      if (!profil || !platformDidukung(platform)) continue;
      if (akunDijeda(bantu.simpanan, akun) || (bantu.simpanan.gagal[b.kode] ?? 0) > kiniK) continue;
      if (ctrl.akunPenuh(akun)) {
        belum.push(b.kode);
        continue;
      }
      const kodeAsli = kodeMetrik(platform, String(b.url ?? "")) ?? b.kode;
      items.push({ kode: b.kode, kodeAsli, platform, uid, profil, akun, url: String(b.url ?? "") });
    }
    const urut = selangSeling(items, (x) => x.akun, MAKS_PER_AKUN_PUTARAN);
    const dipilih = new Set(urut.map((x) => x.kode));
    for (const it of items) if (!dipilih.has(it.kode)) belum.push(it.kode);
    await jalankanAntre(
      urut,
      async (it) => {
        await kerjakanVideo(it, ctx, ctrl, draf, catat, bantu, hasilPutaran, SELANG_GAGAL_SIKLUS);
        await simpanBerkala();
      },
      ctrl,
      12_000,
    );
    // Tidak sempat / ditahan kuota (tanpa hasil & tanpa tanda gagal) → tertunda.
    const kiniS = Date.now();
    for (const it of urut) {
      if (!hasilPutaran.has(it.kodeAsli) && !((bantu.simpanan.gagal[it.kode] ?? 0) > kiniS)) belum.push(it.kode);
    }
    return belum;
  };

  // Tertunda dari putaran robot sebelumnya lebih dulu.
  if (posisi.tertunda.length > 0 && ctrl.bolehLanjut(12_000)) {
    const giliran = posisi.tertunda.slice(0, MAKS_TERTUNDA_SEKALI);
    const peta = new Map((await ambilBarisSiklus(db, giliran)).map((r) => [r.kode, r]));
    const sisa = await kerjakan(giliran.map((k) => peta.get(k)).filter((r): r is BarisSiklus => Boolean(r)));
    posisi.tertunda = gabungTertunda(sisa, posisi.tertunda.slice(giliran.length));
  }

  const hasil = await jalankanSiklus<BarisSiklus>({
    kode: rencana.kode,
    i: posisi.i,
    potongan: POTONGAN_SIKLUS,
    boleh: () => ctrl.bolehLanjut(12_000),
    ambil: (k) => ambilBarisSiklus(db, k),
    kerjakan,
  });
  posisi.i = hasil.i;
  posisi.tertunda = gabungTertunda(posisi.tertunda, hasil.tunda);
  await simpanPosisi(posisi);
}

// ------------------------------------------------------------
// Bagian 1a: katalog dari laporan_video (murah, tanpa kuota upload-post)
// ------------------------------------------------------------

type BarisLaporan = {
  id: number | string;
  user_id: number | string;
  platform: string;
  url_video: string;
  tanggal_wib: string | null;
  dibuat_pada: string | null;
  sumber: string | null;
  tvrku_post_id: number | string | null;
};

/** Pemilik video sebuah laporan (user_id) — 0 bila tidak bisa ditanyakan ke upload-post. */
function pemilikLaporan(l: BarisLaporan, platform: string, url: string, ctx: Konteks): number {
  const pelapor = Number(l.user_id);
  // Laporan otomatis & tautan unggahan berasal dari akun tertaut orang itu sendiri.
  if (l.sumber === "otomatis" || (l.tvrku_post_id != null && Number(l.tvrku_post_id) > 0)) {
    return ctx.profilPer.has(pelapor) ? pelapor : 0;
  }
  const nama = akunDariTautan(platform, url);
  if (nama) return ctx.pemilikAkun.get(`${platform}|${nama.toLowerCase()}`) ?? 0;
  return ctx.tersambung.has(`${pelapor}|${platform}`) && ctx.profilPer.has(pelapor) ? pelapor : 0;
}

async function kenaliDariLaporan(db: Db, ctx: Konteks, status: StatusPenyegar, catat: Catatan, tenggat: number) {
  let kursor = status.kursor_laporan;
  for (let halaman = 0; halaman * 1000 < MAKS_LAPORAN_PUTARAN; halaman++) {
    if (Date.now() > tenggat) break;
    const { data, error } = await db
      .from("laporan_video")
      .select("id, user_id, platform, url_video, tanggal_wib, dibuat_pada, sumber, tvrku_post_id")
      .gt("id", kursor)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) {
      console.error("[metrik-video] baca laporan:", error.message);
      break;
    }
    const baris = (data ?? []) as BarisLaporan[];
    if (baris.length === 0) break;
    // Link pendek diurai dulu (10 bersamaan, diingat 30 hari).
    const asli = new Map<string, string | null>();
    const pendek = baris.filter((l) => adalahTautanPendek(platformApp(String(l.platform ?? "")), String(l.url_video ?? "")));
    let terpotong = -1;
    for (let i = 0; i < pendek.length; i += URAI_PARALEL) {
      if (Date.now() > tenggat) {
        terpotong = Number(pendek[i].id);
        break;
      }
      const kelompok = pendek.slice(i, i + URAI_PARALEL);
      const r = await Promise.all(kelompok.map((l) => alamatAsli(platformApp(String(l.platform ?? "")), String(l.url_video ?? ""))));
      kelompok.forEach((l, j) => asli.set(String(l.id), r[j]));
    }
    const katalog: BarisKatalog[] = [];
    let terakhir = kursor;
    for (const l of baris) {
      if (terpotong >= 0 && Number(l.id) >= terpotong) break;
      terakhir = Number(l.id);
      const platform = platformApp(String(l.platform ?? ""));
      const dilaporkan = String(l.url_video ?? "");
      if (!platformDidukung(platform) || !dilaporkan) continue;
      const pendekIni = adalahTautanPendek(platform, dilaporkan);
      const url = pendekIni ? asli.get(String(l.id)) : dilaporkan;
      if (!url) continue;
      const kode = kodeMetrik(platform, url);
      if (!kode) continue;
      const pemilik = pemilikLaporan(l, platform, url, ctx);
      if (!pemilik) continue;
      const akun = ctx.akunUser.get(`${pemilik}|${platform}`) ?? akunDariTautan(platform, url) ?? "";
      const dasar: BarisKatalog = {
        kode,
        platform,
        akun_username: akun,
        user_id: pemilik,
        url: kanonikTautan(platform, url, akun || null),
        judul: "",
        thumbnail_url: "",
        waktu_posting: waktuDariLaporan(l.tanggal_wib, l.dibuat_pada),
      };
      katalog.push(dasar);
      // Link pendek punya barisnya sendiri (kode link pendek, alamat asli)
      // supaya kartu laporannya langsung ikut berangka.
      const alias = pendekIni ? kodeMetrik(platform, dilaporkan) : null;
      if (alias && alias !== kode) katalog.push({ ...dasar, kode: alias });
    }
    catat.ditemukan += await gabungKatalog(db, katalog, ctx.kolom, false);
    kursor = terakhir;
    status.kursor_laporan = kursor;
    if (terpotong >= 0 || baris.length < 1000) break;
  }
}

// ------------------------------------------------------------
// Bagian 1b: katalog dari daftar media tiap akun
// ------------------------------------------------------------

/** Satu halaman daftar media satu akun → katalog + peta ID media. */
async function kenaliHalamanAkun(
  db: Db,
  a: AkunTersambung,
  cursor: string | null,
  ctx: Konteks,
  ctrl: Pengendali,
  bantu: Bantu,
  catat: Catatan,
): Promise<{ ok: boolean; dicoba: boolean; next: string | null; jumlah: number }> {
  if (!(await ctrl.izin(15_000, a.kunci))) return { ok: false, dicoba: false, next: cursor, jumlah: 0 };
  try {
    const r = await daftarMediaUp(a.profil, a.platform, { limit: 100, cursor, timeoutMs: ctrl.batasPanggilan(25_000) });
    ctrl.catatBatas(r.batas);
    catat.halaman += 1;
    // Sukses membaca daftar TIDAK dihitung "akun sehat": akun X yang
    // daftarnya terbaca tapi analitiknya 401 tetap harus bisa dijeda.
    const katalog: BarisKatalog[] = [];
    const peta: Record<string, string> = {};
    for (const m of r.media) {
      if (!m.permalink || !adalahMediaVideo(a.platform, m.jenis)) continue;
      const kode = kodeMetrik(a.platform, m.permalink);
      if (!kode) continue;
      if (m.id) peta[kode] = m.id;
      katalog.push({
        kode,
        platform: a.platform,
        akun_username: a.username,
        user_id: a.uid,
        url: kanonikTautan(a.platform, m.permalink, a.username || null),
        judul: potongAman(m.caption, 300),
        thumbnail_url: m.thumbnail,
        waktu_posting: m.waktu,
      });
    }
    if (perluDaftarMedia(a.platform)) await tambahPetaMedia(`${a.profil}|${a.platform}`, peta);
    catat.ditemukan += await gabungKatalog(db, katalog, ctx.kolom, true);
    return { ok: true, dicoba: true, next: r.media.length > 0 ? r.next_cursor : null, jumlah: katalog.length };
  } catch (e) {
    if (ctrl.tanganiGalat(e)) return { ok: false, dicoba: false, next: cursor, jumlah: 0 };
    catat.galat += 1;
    catatGalat(bantu.simpanan, bantu.hasilAkun, a.kunci, null, e instanceof Error ? e.message : String(e), JAM);
    return { ok: false, dicoba: true, next: cursor, jumlah: 0 };
  }
}

/** Halaman pertama tiap akun sekali per jam: video yang baru terbit. */
async function kenaliVideoBaru(db: Db, ctx: Konteks, ctrl: Pengendali, bantu: Bantu, catat: Catatan) {
  const kini = Date.now();
  const s = bantu.simpanan;
  const antre = ctx.akun
    .filter((a) => !akunDijeda(s, a.kunci) && kini - (s.katalog[a.kunci]?.baru ?? 0) >= CEK_BARU_MS)
    .sort((x, y) => (s.katalog[x.kunci]?.baru ?? 0) - (s.katalog[y.kunci]?.baru ?? 0))
    .slice(0, MAKS_HALAMAN_BARU);
  await jalankanAntre(
    antre,
    async (a) => {
      const r = await kenaliHalamanAkun(db, a, null, ctx, ctrl, bantu, catat);
      if (r.ok) s.katalog[a.kunci] = { ...(s.katalog[a.kunci] ?? {}), baru: Date.now() };
    },
    ctrl,
    15_000,
  );
}

/** Isi katalog: mundur halaman demi halaman sampai video terlama tiap akun. */
async function isiKatalogAkun(db: Db, ctx: Konteks, ctrl: Pengendali, bantu: Bantu, catat: Catatan) {
  const kini = Date.now();
  const s = bantu.simpanan;
  const perlu = ctx.akun.filter((a) => {
    if (akunDijeda(s, a.kunci)) return false;
    const k = s.katalog[a.kunci];
    return !k?.selesai || kini - k.selesai >= ULANG_ISI_MS;
  });
  // Bergiliran satu halaman per akun, maks MAKS_HALAMAN_ISI per putaran.
  let sisaHalaman = MAKS_HALAMAN_ISI;
  let putar = perlu;
  while (sisaHalaman > 0 && putar.length > 0 && ctrl.bolehLanjut(15_000)) {
    const giliran = putar.slice(0, sisaHalaman);
    sisaHalaman -= giliran.length;
    const lanjut: AkunTersambung[] = [];
    await jalankanAntre(
      giliran,
      async (a) => {
        const k0 = s.katalog[a.kunci] ?? {};
        // Katalog yang sudah lengkap tapi waktunya diulang: mulai dari awal.
        const k: KatalogAkun = k0.selesai ? { baru: k0.baru, cursor: null, halaman: 0, video: 0 } : k0;
        const r = await kenaliHalamanAkun(db, a, k.halaman ? (k.cursor ?? null) : null, ctx, ctrl, bantu, catat);
        if (!r.ok) {
          // Tidak sempat dicoba (kuota/jatah akun) → lanjut putaran depan
          // dari halaman yang sama. Gagal sungguhan 3× → ulang dari awal
          // (cursor upload-post bisa kedaluwarsa).
          if (r.dicoba) {
            const gagal = (k.gagal ?? 0) + 1;
            s.katalog[a.kunci] = gagal >= 3 ? { ...k, cursor: null, halaman: 0, gagal: 0 } : { ...k, gagal };
          }
          return;
        }
        const halaman = (k.halaman ?? 0) + 1;
        const selesai = !r.next || halaman >= MAKS_HALAMAN_AKUN;
        s.katalog[a.kunci] = {
          ...k,
          halaman: selesai ? 0 : halaman,
          cursor: selesai ? null : r.next,
          video: (k.video ?? 0) + r.jumlah,
          selesai: selesai ? Date.now() : undefined,
          gagal: 0,
        };
        if (!selesai) lanjut.push(a);
      },
      ctrl,
      15_000,
    );
    putar = lanjut;
  }
}

// ------------------------------------------------------------
// Putaran (dipanggil cron)
// ------------------------------------------------------------

export type RingkasanPutaran = {
  jalan: boolean;
  alasan?: string;
  diminta: number;
  terisi: number;
  tersimpan: number;
  galat: number;
  dilewati: number;
  ditemukan: number;
  halaman: number;
  jeda_sampai?: string | null;
  sisa_kuota?: number | null;
  menunggu?: Record<NamaTingkat, number> | null;
  durasi_ms: number;
  /** Hanya mode uji kering: baris yang AKAN disimpan. */
  uji?: { baris: DraftBaris[] };
};

async function hitungMenunggu(db: Db, kiniMs: number): Promise<Record<NamaTingkat, number>> {
  const hasil = { hari_ini: 0, kemarin: 0, pekan: 0, lama: 0 } as Record<NamaTingkat, number>;
  // Hanya hari ini (jalur cepat); video lain bergiliran di putaran.
  await Promise.all(
    tingkatKesegaran(kiniMs).slice(0, 1).map(async (t) => {
      let q = db
        .from("tvr_video_metrik")
        .select("kode", { count: "exact", head: true })
        .not("user_id", "is", null)
        .lt("diperbarui_pada", t.basiSebelum);
      if (t.dari) q = q.gte("waktu_posting", t.dari);
      if (t.sampai) q = t.tanpaWaktu ? q.or(`waktu_posting.lt."${t.sampai}",waktu_posting.is.null`) : q.lt("waktu_posting", t.sampai);
      const { count } = await q;
      hasil[t.nama] = count ?? 0;
    }),
  );
  return hasil;
}

async function hitungKatalog(db: Db, ctx: Konteks, s: Simpanan): Promise<StatusPenyegar["katalog"]> {
  const [{ count: video }, { count: belum }] = await Promise.all([
    db.from("tvr_video_metrik").select("kode", { count: "exact", head: true }).not("user_id", "is", null),
    db
      .from("tvr_video_metrik")
      .select("kode", { count: "exact", head: true })
      .not("user_id", "is", null)
      .lt("diperbarui_pada", "2000-01-01T00:00:00Z"),
  ]);
  const lengkap = ctx.akun.filter((a) => Boolean(s.katalog[a.kunci]?.selesai)).length;
  return { video: video ?? 0, berangka: Math.max(0, (video ?? 0) - (belum ?? 0)), akun: ctx.akun.length, akun_lengkap: lengkap };
}

export async function putaranSegarMetrik(
  opsi: { anggaranMs?: number; maksPermintaan?: number; ujiKering?: boolean } = {},
): Promise<RingkasanPutaran> {
  const mulai = Date.now();
  const kosong: RingkasanPutaran = {
    jalan: false,
    diminta: 0,
    terisi: 0,
    tersimpan: 0,
    galat: 0,
    dilewati: 0,
    ditemukan: 0,
    halaman: 0,
    durasi_ms: 0,
  };
  if (!uploadPostSiap()) return { ...kosong, alasan: "upload-post belum tersambung" };
  const kering = opsi.ujiKering === true;
  ujiKeringAktif = kering;
  const db = supabase();
  const lease = kering ? "uji-kering" : await ambilLease(db);
  if (!lease) {
    ujiKeringAktif = false;
    return { ...kosong, alasan: "putaran lain masih berjalan", durasi_ms: Date.now() - mulai };
  }
  const ujiBaris: DraftBaris[] = [];
  try {
    const status = bacaStatusTeks(await bacaNilai(db, KUNCI_STATUS));
    if (status.jeda_sampai && Date.parse(status.jeda_sampai) > Date.now()) {
      return { ...kosong, alasan: "menunggu kuota upload-post pulih", jeda_sampai: status.jeda_sampai, durasi_ms: Date.now() - mulai };
    }
    status.jeda_sampai = null;
    const anggaran = opsi.anggaranMs ?? ANGGARAN_MS;
    const maks = opsi.maksPermintaan ?? Math.floor((MAKS_PER_MENIT * anggaran) / 60_000);
    const [ctx, simpanan] = await Promise.all([muatKonteks(db), muatSimpanan()]);
    rapikanSimpanan(simpanan, Date.now());
    const ctrl = new Pengendali(maks, anggaran);
    const catat = catatanKosong();
    const bantu: Bantu = { simpanan, hasilAkun: new Map(), petaBaru: new Map() };
    const hasilPutaran = new Map<string, DraftBaris>();
    let tersimpanN = 0;
    const draf: DraftBaris[] = [];
    let sedangSimpan = false;
    const simpanDraf = async (paksa: boolean) => {
      if (sedangSimpan || (!paksa && draf.length < 150)) return;
      sedangSimpan = true;
      try {
        const potongan = draf.splice(0, draf.length);
        if (kering) ujiBaris.push(...potongan);
        else tersimpanN += await tulisDraf(db, potongan, ctx.kolom);
      } finally {
        sedangSimpan = false;
      }
    };
    const simpanBerkala = () => simpanDraf(false);
    const [hariIni] = tingkatKesegaran(Date.now());

    // 1a. Video yang baru dilaporkan/tercatat (tanpa kuota upload-post).
    await kenaliDariLaporan(db, ctx, status, catat, Date.now() + 60_000);
    // 2. JALUR CEPAT (±15% jatah, disetujui user 29 Sep 2026): unggahan
    // SuperApp hari ini, seluruh video HARI INI, lalu unggahan kemarin.
    await ctrl.denganJatah(Math.max(20, Math.ceil(maks * BAGIAN_JALUR_CEPAT)), async () => {
      await segarkanUnggahan(db, ctx, ctrl, draf, catat, bantu, "hari_ini", simpanBerkala);
      // Angka unggahan disimpan dulu: video yang baru disegarkan jalur
      // unggahan tidak boleh ikut jatuh tempo lalu ditanya dua kali.
      await simpanDraf(true);
      await segarkanTingkat(db, ctx, ctrl, draf, catat, bantu, hasilPutaran, hariIni, simpanBerkala);
      await segarkanUnggahan(db, ctx, ctrl, draf, catat, bantu, "kemarin", simpanBerkala);
    });
    await simpanDraf(true);
    // 1b. Video baru di daftar media akun (halaman pertama, tiap jam).
    await kenaliVideoBaru(db, ctx, ctrl, bantu, catat);
    // 1c. Isi katalog: video lama tiap akun, halaman demi halaman.
    await isiKatalogAkun(db, ctx, ctrl, bantu, catat);
    await simpanDraf(true);
    // 3. PUTARAN: kata kunci dulu, lalu lainnya — terlama → terbaru.
    await segarkanSiklus(db, ctx, ctrl, draf, catat, bantu, hasilPutaran, simpanBerkala);

    await simpanDraf(true);
    for (const [kunci, peta] of bantu.petaBaru) await tambahPetaMedia(kunci, peta);
    jedaAkunGagalBeruntun(simpanan, bantu.hasilAkun);
    await simpanSimpanan(simpanan);

    if (ctrl.jedaSampai) status.jeda_sampai = new Date(ctrl.jedaSampai).toISOString();
    const [menunggu, katalog, siklus] = await Promise.all([
      hitungMenunggu(db, Date.now()),
      hitungKatalog(db, ctx, simpanan),
      keadaanSiklus(),
    ]);
    status.terakhir = new Date().toISOString();
    status.menunggu = menunggu;
    status.katalog = katalog;
    status.siklus = siklus;
    status.putaran = {
      diminta: ctrl.diminta,
      terisi: catat.terisi,
      galat: catat.galat,
      dilewati: catat.dilewati,
      ditemukan: catat.ditemukan,
      halaman: catat.halaman,
      durasi_ms: Date.now() - mulai,
      alasan: ctrl.alasanBerhenti || undefined,
      sisa_kuota: ctrl.batasTerakhir?.sisa ?? null,
      ditahan: ctrl.kaliDitahan,
    };
    await simpanStatus(db, status);
    return {
      jalan: true,
      alasan: ctrl.alasanBerhenti || undefined,
      diminta: ctrl.diminta,
      terisi: catat.terisi,
      tersimpan: tersimpanN,
      galat: catat.galat,
      dilewati: catat.dilewati,
      ditemukan: catat.ditemukan,
      halaman: catat.halaman,
      jeda_sampai: status.jeda_sampai,
      sisa_kuota: ctrl.batasTerakhir?.sisa ?? null,
      menunggu,
      durasi_ms: Date.now() - mulai,
      uji: kering ? { baris: ujiBaris } : undefined,
    };
  } catch (e) {
    console.error("[metrik-video] putaran:", e);
    return { ...kosong, jalan: true, alasan: e instanceof Error ? e.message : "gagal", durasi_ms: Date.now() - mulai };
  } finally {
    if (!kering) await lepasLease(db, lease);
    ujiKeringAktif = false;
  }
}

// ------------------------------------------------------------
// Tarik SEKARANG (tombol di panel) — satu unggahan / satu kategori
// ------------------------------------------------------------

/** Angka yang lebih muda dari ini tidak ditarik ulang oleh tombol kategori. */
const SEGAR_KATEGORI_MS = 2 * JAM;
/** Maks permintaan satu tekan tombol kategori. */
const MAKS_PER_TEKAN = 40;
/** Rem bersama tombol manual: maks 80 permintaan / 5 menit untuk semua orang. */
const MAKS_MANUAL = 80;
const JENDELA_MANUAL_MS = 5 * 60_000;
const jejakManual: number[] = [];

function jatahManual(n: number): number {
  const kini = Date.now();
  while (jejakManual.length > 0 && kini - jejakManual[0] > JENDELA_MANUAL_MS) jejakManual.shift();
  return Math.max(0, Math.min(n, MAKS_MANUAL - jejakManual.length));
}

function pakaiJatahManual() {
  jejakManual.push(Date.now());
}

/** Tarik angka satu unggahan SuperApp sekarang juga (1 permintaan). */
export async function segarkanSatuUnggahan(postId: number): Promise<HasilSatuUnggahan> {
  if (!uploadPostSiap()) throw Object.assign(new Error("Kunci upload-post belum terpasang."), { status: 503, pesanAman: true });
  const db = supabase();
  const { data: p } = await db
    .from("tvrku_post")
    .select("id, user_id, judul, request_id, jadwal, dibuat_pada")
    .eq("id", postId)
    .maybeSingle();
  if (!p) throw Object.assign(new Error("Unggahan tidak ditemukan."), { status: 404 });
  if (!POLA_REQUEST_UP.test(String(p.request_id ?? ""))) {
    throw Object.assign(new Error("Unggahan ini tidak tercatat di upload-post (tanpa ID permintaan)."), { status: 422 });
  }
  if (p.jadwal && Date.parse(String(p.jadwal)) > Date.now()) {
    throw Object.assign(new Error("Unggahan ini masih terjadwal — angkanya ada setelah tayang."), { status: 409 });
  }
  if (jatahManual(1) < 1) {
    throw Object.assign(
      new Error("Terlalu banyak tarikan manual. Tunggu beberapa menit — angka juga diperbarui otomatis."),
      { status: 429 },
    );
  }
  const [ctx, simpanan] = await Promise.all([muatKonteks(db), muatSimpanan()]);
  const ctrl = new Pengendali(1, 60_000, { saatAmbil: pakaiJatahManual, lebihMs: 15_000 });
  const draf: DraftBaris[] = [];
  const catat = catatanKosong();
  const bantu: Bantu = { simpanan, hasilAkun: new Map(), petaBaru: new Map() };
  const r = await kerjakanUnggahan(p as BarisUnggahan, ctx, ctrl, draf, catat, bantu, 15 * 60_000);
  if (!r.jawaban) {
    if (ctrl.berhenti) {
      throw Object.assign(new Error("upload-post sedang membatasi permintaan. Coba lagi beberapa menit lagi."), {
        status: 429,
      });
    }
    // Pesan upload-post (mis. "No post found") aman & berguna ditampilkan.
    throw Object.assign(new Error(r.galat ? `upload-post: ${r.galat}` : "upload-post tidak menjawab untuk unggahan ini."), {
      status: 502,
      pesanAman: true,
    });
  }
  const jawaban = r.jawaban;
  const tersimpan = await tulisDraf(db, draf, ctx.kolom);
  for (const [kunci, peta] of bantu.petaBaru) await tambahPetaMedia(kunci, peta);
  await simpanSimpanan(simpanan);
  return {
    post_id: postId,
    profil: jawaban.profil,
    judul: jawaban.judul || String(p.judul ?? ""),
    per_platform: jawaban.blok.map((b) => ({
      platform: b.platform,
      status: b.status,
      galat: b.galat,
      tayangan: b.metrik ? (b.metrik.tayangan ?? (b.platform === "twitter" ? b.metrik.impresi : null)) : null,
      post_url: b.post_url,
    })),
    tersimpan,
  };
}

export type HasilSegarKategori = {
  kategori: string;
  /** Video kategori yang bisa ditanyakan ke upload-post (unggahan + akun tersambung). */
  total: number;
  dikerjakan: number;
  terisi: number;
  galat: number;
  /** Masih perlu ditarik setelah panggilan ini; panggil lagi sampai 0. */
  sisa: number;
  /** true = direm kuota; tunggu beberapa menit sebelum menekan lagi. */
  direm: boolean;
  /** Link pendek yang diurai di panggilan ini. */
  diurai: number;
  lama_ms: number;
};

/**
 * Tarik angka SATU KATEGORI sekarang, potong demi potong (tombol di
 * halaman kategori). Memakai jatah manual bersama supaya tombol yang
 * ditekan berulang tidak menghabiskan kuota upload-post.
 */
export async function segarkanKategori(kategori: string, polaIlike: string): Promise<HasilSegarKategori> {
  if (!uploadPostSiap()) throw Object.assign(new Error("Kunci upload-post belum terpasang."), { status: 503, pesanAman: true });
  const mulai = Date.now();
  const db = supabase();
  const [ctx, simpanan] = await Promise.all([muatKonteks(db), muatSimpanan()]);

  const laporan = await semuaBaris<BarisLaporan>(
    (dari, sampai) =>
      db
        .from("laporan_video")
        .select("id, user_id, platform, url_video, tanggal_wib, dibuat_pada, sumber, tvrku_post_id")
        .ilike("keyword", polaIlike)
        .order("id", { ascending: false })
        .range(dari, sampai) as unknown as PromiseLike<{ data: BarisLaporan[] | null; error: { message: string } | null }>,
    20_000,
  );
  // Unggahan kategori ini: hasil.kategori (sejak 25 Sep 2026) + unggahan
  // yang laporannya berkategori ini.
  const idPost = new Set<number>();
  for (const l of laporan) if (l.tvrku_post_id && Number(l.tvrku_post_id) > 0) idPost.add(Number(l.tvrku_post_id));
  const { data: postKategori } = await db.from("tvrku_post").select("id").ilike("hasil->>kategori", polaIlike).limit(1000);
  for (const p of postKategori ?? []) idPost.add(Number(p.id));
  const unggahan: BarisUnggahan[] = [];
  for (const bagian of potong([...idPost], 200)) {
    const { data } = await db.from("tvrku_post").select("id, user_id, judul, request_id, jadwal, dibuat_pada").in("id", bagian);
    for (const p of (data ?? []) as BarisUnggahan[]) if (POLA_REQUEST_UP.test(String(p.request_id ?? ""))) unggahan.push(p);
  }

  // Laporan → katalog (link pendek diurai, pemilik dikenali).
  const asli = new Map<string, string | null>();
  const pendek = laporan.filter((l) => adalahTautanPendek(platformApp(String(l.platform ?? "")), String(l.url_video ?? "")));
  let belumDiurai = 0;
  for (let i = 0; i < pendek.length; i += URAI_PARALEL) {
    if (Date.now() - mulai > 20_000) {
      belumDiurai = pendek.length - i;
      break;
    }
    const kelompok = pendek.slice(i, i + URAI_PARALEL);
    const r = await Promise.all(kelompok.map((l) => alamatAsli(platformApp(String(l.platform ?? "")), String(l.url_video ?? ""))));
    kelompok.forEach((l, j) => asli.set(String(l.id), r[j]));
  }
  const items = new Map<string, ItemVideo>();
  const katalog: BarisKatalog[] = [];
  for (const l of laporan) {
    if (l.tvrku_post_id != null && Number(l.tvrku_post_id) > 0) continue; // lewat jalur unggahan
    const platform = platformApp(String(l.platform ?? ""));
    const dilaporkan = String(l.url_video ?? "");
    if (!platformDidukung(platform) || !dilaporkan) continue;
    const pendekIni = adalahTautanPendek(platform, dilaporkan);
    const url = pendekIni ? asli.get(String(l.id)) : dilaporkan;
    if (!url) continue;
    const kodeAsli = kodeMetrik(platform, url);
    if (!kodeAsli) continue;
    const pemilik = pemilikLaporan(l, platform, url, ctx);
    const profil = pemilik ? ctx.profilPer.get(pemilik) : undefined;
    if (!pemilik || !profil) continue;
    const kode = pendekIni ? (kodeMetrik(platform, dilaporkan) ?? kodeAsli) : kodeAsli;
    const akunUsername = ctx.akunUser.get(`${pemilik}|${platform}`) ?? akunDariTautan(platform, url) ?? "";
    const dasar: BarisKatalog = {
      kode: kodeAsli,
      platform,
      akun_username: akunUsername,
      user_id: pemilik,
      url: kanonikTautan(platform, url, akunUsername || null),
      judul: "",
      thumbnail_url: "",
      waktu_posting: waktuDariLaporan(l.tanggal_wib, l.dibuat_pada),
    };
    katalog.push(dasar);
    if (kode !== kodeAsli) katalog.push({ ...dasar, kode });
    if (!items.has(kode)) items.set(kode, { kode, kodeAsli, platform, uid: pemilik, profil, akun: `${pemilik}|${platform}`, url: dasar.url });
  }
  await gabungKatalog(db, katalog, ctx.kolom, false);

  // Yang angkanya masih segar (< 2 jam), baru gagal, atau akunnya dijeda dilewati.
  const segarPada = new Map<string, number>();
  for (const bagian of potong([...items.keys()], 200)) {
    const { data } = await db.from("tvr_video_metrik").select("kode, diperbarui_pada").in("kode", bagian);
    for (const m of data ?? []) segarPada.set(String(m.kode), Date.parse(String(m.diperbarui_pada ?? "")) || 0);
  }
  const kini = Date.now();
  const antreVideo = [...items.values()].filter(
    (it) =>
      kini - (segarPada.get(it.kode) ?? 0) >= SEGAR_KATEGORI_MS &&
      (simpanan.gagal[it.kode] ?? 0) <= kini &&
      !akunDijeda(simpanan, it.akun),
  );
  const antreUnggahan = unggahan.filter(
    (p) => !(p.jadwal && Date.parse(String(p.jadwal)) > kini) && kini - (simpanan.unggah[String(p.id)] ?? 0) >= SEGAR_KATEGORI_MS,
  );
  const total = unggahan.length + items.size + belumDiurai;
  const perlu = antreUnggahan.length + antreVideo.length + belumDiurai;
  const jatah = jatahManual(MAKS_PER_TEKAN);
  if (perlu > 0 && jatah < 1) {
    return { kategori, total, dikerjakan: 0, terisi: 0, galat: 0, sisa: perlu, direm: true, diurai: asli.size, lama_ms: Date.now() - mulai };
  }
  const ctrl = new Pengendali(jatah, 50_000, { saatAmbil: pakaiJatahManual, lebihMs: 15_000 });
  const draf: DraftBaris[] = [];
  const catat = catatanKosong();
  const bantu: Bantu = { simpanan, hasilAkun: new Map(), petaBaru: new Map() };
  const hasilPutaran = new Map<string, DraftBaris>();
  let dikerjakan = 0;
  dikerjakan += await jalankanAntre(
    antreUnggahan,
    async (p) => {
      await kerjakanUnggahan(p, ctx, ctrl, draf, catat, bantu, JAM);
    },
    ctrl,
    40_000,
  );
  dikerjakan += await jalankanAntre(
    selangSeling(antreVideo, (x) => x.akun),
    async (it) => {
      await kerjakanVideo(it, ctx, ctrl, draf, catat, bantu, hasilPutaran, JAM);
    },
    ctrl,
    12_000,
  );
  await tulisDraf(db, draf, ctx.kolom);
  for (const [kunci, peta] of bantu.petaBaru) await tambahPetaMedia(kunci, peta);
  jedaAkunGagalBeruntun(simpanan, bantu.hasilAkun);
  await simpanSimpanan(simpanan);
  const sisa = Math.max(0, perlu - dikerjakan);
  return {
    kategori,
    total,
    dikerjakan,
    terisi: catat.terisi,
    galat: catat.galat,
    sisa,
    direm: ctrl.berhenti || (sisa > 0 && jatahManual(1) < 1),
    diurai: asli.size,
    lama_ms: Date.now() - mulai,
  };
}
