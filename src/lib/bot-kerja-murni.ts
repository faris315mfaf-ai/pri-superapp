// ============================================================
// BOT REDAKSI — logika MURNI pekerjaan bot (13 Okt 2026).
//
// Dipisah dari lib/bot-kerja.ts (yang menyentuh DB) supaya seluruh aturan
// bisa diuji tanpa jaringan/env: validasi badan permintaan runner, pemetaan
// kode gagal → tindakan, penentuan sumber yang perlu dipanen, penyaringan
// kandidat masuk, penyaringan permintaan Video Wajib, dan waktu WIB.
// TIDAK BOLEH mengimpor supabase atau modul yang membaca env.
// ============================================================

import { BATAS_PROTOKOL, type KandidatMasuk, type KodeGagal, type LaporanRunner, type PermintaanRunner, type SumberPanen } from "@/lib/bot-protokol";
import { kunciKanonik } from "@/lib/bot-kunci";
import { klaimBasi } from "@/lib/bot-mesin";
import { buatNaskah } from "@/lib/bot-pilih";
import type { TahapBotDb } from "@/lib/bot-tipe";

// ---- Konstanta ----

export const KERJA = {
  /** Tugas yang baru dibuat dikunci sekian detik (runner diberi waktu melapor `job_dibuat`). */
  KUNCI_DETIK: 90,
  /** Sumber dipanen lagi bila terakhir_ambil lebih tua dari ini. */
  PANEN_ULANG_MENIT: 30,
  /** Percobaan memilih kandidat per giliran (tabrakan manusia / kalah klaim). */
  MAKS_PERCOBAAN_PILIH: 5,
  /** Kandidat bebas yang dimuat per giliran. */
  MAKS_KANDIDAT_DIMUAT: 200,
  /** Permintaan Video Wajib yang dipertimbangkan per giliran. */
  MAKS_PERMINTAAN_WAJIB: 50,
} as const;

/** Ambang teks tersimpan. */
const MAKS_JUDUL = 500;
const MAKS_CAPTION = 5000;

// ---- Galat dengan status HTTP (pesan ringkas, aman dilihat runner) ----

export class GalatLaporan extends Error {
  status: number;
  constructor(pesan: string, status: number) {
    super(pesan);
    this.status = status;
  }
}

// ---- Waktu WIB ----

const MS_HARI = 24 * 3600_000;
const OFFSET_WIB_MS = 7 * 3600_000;

/** Menit sejak tengah malam WIB untuk sebuah epoch ms. */
export function menitWibDari(ms: number): number {
  const w = (((ms + OFFSET_WIB_MS) % MS_HARI) + MS_HARI) % MS_HARI;
  return Math.floor(w / 60_000);
}

/** Tanggal "YYYY-MM-DD" menurut WIB untuk sebuah epoch ms. */
export function hariIniWib(ms: number): string {
  return new Date(ms + OFFSET_WIB_MS).toISOString().slice(0, 10);
}

// ---- Kode gagal → tindakan ----

export type TindakanGagal = {
  /** Penghalang konfigurasi (bukan salah bot/videonya). */
  penghalang: boolean;
  /** Menambah hitungan gagal_beruntun bot. */
  tambahGagalBeruntun: boolean;
  /** Klaim kandidat dilepas agar bisa dipakai lagi setelah penghalang dibereskan. */
  lepasKlaim: boolean;
};

const KODE_PENGHALANG: readonly KodeGagal[] = ["template_belum_ada", "kuota_penuh", "antrean_penuh", "stok_penuh"];
const KODE_SAH: readonly KodeGagal[] = [...KODE_PENGHALANG, "sumber_ditolak", "job_error", "hilang", "lainnya"];

export function adalahKodeGagal(v: unknown): v is KodeGagal {
  return typeof v === "string" && (KODE_SAH as readonly string[]).includes(v);
}

/**
 * Penghalang konfigurasi: tidak menambah gagal_beruntun (kalau tidak, bot
 * mati sendiri karena templatenya belum dibuat) dan klaim dilepas.
 * Selain itu video "terbakar": hitungan naik, klaim dipertahankan (tak dipakai ulang).
 */
export function petaKodeGagal(kode: KodeGagal): TindakanGagal {
  const penghalang = KODE_PENGHALANG.includes(kode);
  return { penghalang, tambahGagalBeruntun: !penghalang, lepasKlaim: penghalang };
}

const TEKS_PENGHALANG: Record<string, string> = {
  template_belum_ada: "akun bot belum punya template video — buat dan tetapkan template dulu",
  kuota_penuh: "kuota penyimpanan mesin penuh — kosongkan Stok Video bot",
  antrean_penuh: "antrean render mesin penuh — tunggu antrean berkurang",
  stok_penuh: "Stok Video bot penuh — hapus atau pakai video lama",
};

export function teksPenghalang(kode: KodeGagal): string {
  return TEKS_PENGHALANG[kode] ?? "penghalang konfigurasi";
}

// ---- Validasi badan permintaan runner ----

export type HasilValidasi = { ok: true; permintaan: PermintaanRunner } | { ok: false; pesan: string };

const salah = (pesan: string): HasilValidasi => ({ ok: false, pesan });

const adalahObjek = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Bilangan bulat positif yang aman. */
const idPositif = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const angkaNolAtauLebih = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const teksPanjang = (v: unknown, min: number, maks: number): v is string => typeof v === "string" && v.length >= min && v.length <= maks;
const TAHAP_LOG: readonly TahapBotDb[] = ["cari", "edit", "posting", "istirahat"];

/** Angka >= 0, null, atau undefined bila bentuknya salah. */
function angkaAtauNull(v: unknown): number | null | undefined {
  if (v === null) return null;
  return angkaNolAtauLebih(v) ? v : undefined;
}

function validasiKandidatMasuk(v: unknown): KandidatMasuk | null {
  if (!adalahObjek(v)) return null;
  const url = v.url;
  const judul = v.judul;
  const caption = v.caption;
  const waktu = v.waktu_terbit;
  const durasi = angkaAtauNull(v.durasi_detik);
  const tayangan = angkaAtauNull(v.tayangan);
  if (!teksPanjang(url, 1, 2048)) return null;
  if (typeof judul !== "string" || typeof caption !== "string") return null;
  if (durasi === undefined || tayangan === undefined) return null;
  if (waktu !== null && typeof waktu !== "string") return null;
  return { url, judul, caption, durasi_detik: durasi, tayangan, waktu_terbit: waktu };
}

function validasiLaporan(v: unknown): { ok: true; laporan: LaporanRunner } | { ok: false; pesan: string } {
  if (!adalahObjek(v)) return { ok: false, pesan: "laporan tidak sah." };
  const jenis = v.jenis;
  const tugasId = v.tugas_id;
  switch (jenis) {
    case "kandidat": {
      const sumberId = v.sumber_id;
      const mentah = v.kandidat;
      const galat = v.galat;
      if (!idPositif(sumberId)) return { ok: false, pesan: "sumber_id tidak sah." };
      if (!Array.isArray(mentah)) return { ok: false, pesan: "kandidat harus berupa larik." };
      if (mentah.length > BATAS_PROTOKOL.MAKS_KANDIDAT_PER_LAPORAN) return { ok: false, pesan: "kandidat terlalu banyak." };
      const daftar: KandidatMasuk[] = [];
      for (const k of mentah as unknown[]) {
        const sah = validasiKandidatMasuk(k);
        if (!sah) return { ok: false, pesan: "bentuk kandidat tidak sah." };
        daftar.push(sah);
      }
      if (galat !== undefined && typeof galat !== "string") return { ok: false, pesan: "galat harus teks." };
      const laporan: LaporanRunner = { jenis: "kandidat", sumber_id: sumberId, kandidat: daftar };
      if (typeof galat === "string") laporan.galat = galat.slice(0, 1000);
      return { ok: true, laporan };
    }
    case "job_dibuat": {
      const idJob = v.id_job_mesin;
      const hook = v.hook;
      if (!idPositif(tugasId)) return { ok: false, pesan: "tugas_id tidak sah." };
      if (!teksPanjang(idJob, 1, 200)) return { ok: false, pesan: "id_job_mesin tidak sah." };
      if (!teksPanjang(hook, 1, 500)) return { ok: false, pesan: "hook tidak sah." };
      return { ok: true, laporan: { jenis: "job_dibuat", tugas_id: tugasId, id_job_mesin: idJob, hook } };
    }
    case "job_selesai": {
      const idStok = v.id_stok_mesin;
      const durasi = angkaAtauNull(v.durasi_detik);
      const ukuran = angkaAtauNull(v.ukuran_byte);
      if (!idPositif(tugasId)) return { ok: false, pesan: "tugas_id tidak sah." };
      if (!teksPanjang(idStok, 1, 200)) return { ok: false, pesan: "id_stok_mesin tidak sah." };
      if (durasi === undefined) return { ok: false, pesan: "durasi_detik tidak sah." };
      if (ukuran === undefined) return { ok: false, pesan: "ukuran_byte tidak sah." };
      return { ok: true, laporan: { jenis: "job_selesai", tugas_id: tugasId, id_stok_mesin: idStok, durasi_detik: durasi, ukuran_byte: ukuran } };
    }
    case "job_gagal": {
      const kode = v.kode;
      const pesan = v.pesan;
      if (!idPositif(tugasId)) return { ok: false, pesan: "tugas_id tidak sah." };
      if (!adalahKodeGagal(kode)) return { ok: false, pesan: "kode tidak dikenal." };
      if (typeof pesan !== "string" || pesan.length > 4000) return { ok: false, pesan: "pesan tidak sah." };
      return { ok: true, laporan: { jenis: "job_gagal", tugas_id: tugasId, kode, pesan: pesan.slice(0, 1000) } };
    }
    case "log": {
      const tahap = v.tahap;
      const teks = v.teks;
      if (typeof tahap !== "string" || !(TAHAP_LOG as readonly string[]).includes(tahap)) return { ok: false, pesan: "tahap tidak dikenal." };
      if (typeof teks !== "string" || teks.trim() === "" || teks.length > 4000) return { ok: false, pesan: "teks tidak sah." };
      return { ok: true, laporan: { jenis: "log", tahap: tahap as TahapBotDb, teks: teks.slice(0, 1000) } };
    }
    default:
      return { ok: false, pesan: "jenis laporan tidak dikenal." };
  }
}

/** Validasi ketat badan JSON dari runner. Bentuk salah → {ok:false} (route menjawab 400). */
export function validasiPermintaanRunner(isi: unknown): HasilValidasi {
  if (!adalahObjek(isi)) return salah("Badan harus berupa objek JSON.");
  const aksi = isi.aksi;
  const botId = isi.bot_id;
  switch (aksi) {
    case "denyut": {
      const versi = isi.versi;
      if (versi !== undefined && typeof versi !== "string") return salah("versi harus teks.");
      return { ok: true, permintaan: typeof versi === "string" ? { aksi: "denyut", versi: versi.slice(0, 40) } : { aksi: "denyut" } };
    }
    case "ambil_kerja": {
      if (!idPositif(botId)) return salah("bot_id tidak sah.");
      return { ok: true, permintaan: { aksi: "ambil_kerja", bot_id: botId } };
    }
    case "lapor": {
      if (!idPositif(botId)) return salah("bot_id tidak sah.");
      const l = validasiLaporan(isi.laporan);
      if (!l.ok) return salah(l.pesan);
      return { ok: true, permintaan: { aksi: "lapor", bot_id: botId, laporan: l.laporan } };
    }
    default:
      return salah("aksi tidak dikenal.");
  }
}

// ---- Kandidat masuk → baris bot_kandidat ----

export type BarisKandidatBaru = {
  kunci_kanonik: string;
  sumber_id: number;
  url: string;
  judul: string;
  caption: string;
  durasi_detik: number | null;
  tayangan: number | null;
  waktu_terbit: string | null;
};

const potong = (s: string, maks: number): string => {
  let h = s.length > maks ? s.slice(0, maks) : s;
  const akhir = h.charCodeAt(h.length - 1);
  if (h !== s && akhir >= 0xd800 && akhir <= 0xdbff) h = h.slice(0, -1);
  return h;
};

/**
 * Normalkan kandidat masuk: URL tanpa kunci kanonik DIBUANG; duplikat dalam satu
 * laporan dibuang; teks dipotong; angka dibulatkan; waktu_terbit tak sah → null.
 */
export function saringKandidatMasuk(kandidat: readonly KandidatMasuk[], sumberId: number): { baris: BarisKandidatBaru[]; dibuang: number } {
  const lihat = new Set<string>();
  const baris: BarisKandidatBaru[] = [];
  for (const k of kandidat) {
    const kunci = kunciKanonik(k.url);
    if (!kunci || lihat.has(kunci.kunci)) continue;
    lihat.add(kunci.kunci);
    const t = k.waktu_terbit ? Date.parse(k.waktu_terbit) : NaN;
    baris.push({
      kunci_kanonik: kunci.kunci,
      sumber_id: sumberId,
      url: k.url.trim(),
      judul: potong(k.judul.trim(), MAKS_JUDUL),
      caption: potong(k.caption.trim(), MAKS_CAPTION),
      durasi_detik: k.durasi_detik === null ? null : Math.min(2_000_000_000, Math.round(k.durasi_detik)),
      tayangan: k.tayangan === null ? null : Math.min(Number.MAX_SAFE_INTEGER, Math.floor(k.tayangan)),
      waktu_terbit: Number.isFinite(t) ? new Date(t).toISOString() : null,
    });
  }
  return { baris, dibuang: kandidat.length - baris.length };
}

// ---- Panen ----

export type SumberAktif = { id: number; platform: string; handle: string; terakhir_ambil: string | null };

/** Sumber perlu dipanen bila belum pernah, atau terakhir diambil > PANEN_ULANG_MENIT lalu (tanggal rusak = perlu). */
export function sumberPerluPanen(terakhirAmbil: string | null, sekarangMs: number): boolean {
  if (!terakhirAmbil) return true;
  const t = Date.parse(terakhirAmbil);
  if (!Number.isFinite(t)) return true;
  return sekarangMs - t > KERJA.PANEN_ULANG_MENIT * 60_000;
}

/** Sumber yang akan dipanen: yang belum pernah dulu, lalu yang paling lama; maks MAKS_SUMBER_PER_PANEN. */
export function pilihSumberPanen(sumber: readonly SumberAktif[], sekarangMs: number): SumberPanen[] {
  const perlu = sumber.filter((s) => sumberPerluPanen(s.terakhir_ambil, sekarangMs));
  const waktu = (s: SumberAktif): number => {
    const t = s.terakhir_ambil ? Date.parse(s.terakhir_ambil) : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };
  perlu.sort((a, b) => {
    const wa = waktu(a);
    const wb = waktu(b);
    if (wa !== wb) return wa < wb ? -1 : 1;
    return a.id - b.id;
  });
  return perlu.slice(0, BATAS_PROTOKOL.MAKS_SUMBER_PER_PANEN).map((s) => ({ id: s.id, platform: s.platform, handle: s.handle }));
}

// ---- Tabrakan dengan sistem lain ----

/**
 * Pola ilike (potongan) untuk mencari id video di kolom URL sistem lain.
 * "_" adalah wildcard LIKE dan sering muncul di id IG/YouTube, jadi di-escape.
 */
export function polaCariId(id: string): string {
  return `%${id.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

/**
 * Dari URL hasil pencarian ilike, apakah ada yang SUNGGUH video yang sama?
 * (ilike hanya penyaring kasar; "_" adalah wildcard, id bisa muncul di tempat lain.)
 */
export function adaTabrakan(urlDb: readonly (string | null | undefined)[], kunci: string): boolean {
  for (const u of urlDb) {
    if (typeof u !== "string" || u === "") continue;
    if (kunciKanonik(u)?.kunci === kunci) return true;
  }
  return false;
}

// ---- Video Wajib ----

export type BarisVideoWajib = {
  id: number;
  judul: string | null;
  keterangan: string | null;
  link_doksli: string | null;
  kategori: string | null;
  /** "YYYY-MM-DD" atau null. */
  batas_waktu: string | null;
  dibuat_pada: string | null;
  sumber_video?: string | null;
};

export type PermintaanWajib = {
  id: number;
  judul: string;
  keterangan: string;
  link_doksli: string;
  kunci: string;
  naskah: string;
  /** Kategori badge mesin (huruf besar). */
  kategori: string;
  batas_waktu: string | null;
  dibuat_pada: string;
  sumber_video: string;
};

/** Kategori badge video: teks bebas Pimred dirapikan; kosong → NEWS. */
export function kategoriMesin(mentah: string | null | undefined): string {
  const k = String(mentah ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return k === "" ? "NEWS" : potong(k, 30);
}

/**
 * Permintaan yang layak diambil bot: batas_waktu kosong atau >= hari ini WIB,
 * link_doksli lolos kunciKanonik, naskah (judul+keterangan) tak kosong, belum
 * pernah diambil (id tak ada di `sudahDiambil`). Urut batas_waktu naik (kosong
 * terakhir), lalu dibuat_pada naik, lalu id naik.
 */
export function saringPermintaanWajib(baris: readonly BarisVideoWajib[], sudahDiambil: ReadonlySet<number>, hariIni: string): PermintaanWajib[] {
  const hasil: PermintaanWajib[] = [];
  for (const b of baris) {
    if (sudahDiambil.has(Number(b.id))) continue;
    if (b.batas_waktu && b.batas_waktu.slice(0, 10) < hariIni) continue;
    const link = String(b.link_doksli ?? "").trim();
    if (link === "") continue;
    const kunci = kunciKanonik(link);
    if (!kunci) continue;
    const naskah = buatNaskah(b.judul, b.keterangan);
    if (naskah === null) continue;
    hasil.push({
      id: Number(b.id),
      judul: String(b.judul ?? "").trim(),
      keterangan: String(b.keterangan ?? "").trim(),
      link_doksli: link,
      kunci: kunci.kunci,
      naskah,
      kategori: kategoriMesin(b.kategori),
      batas_waktu: b.batas_waktu ? b.batas_waktu.slice(0, 10) : null,
      dibuat_pada: String(b.dibuat_pada ?? ""),
      sumber_video: String(b.sumber_video ?? "").trim(),
    });
  }
  hasil.sort((a, b) => {
    if (a.batas_waktu !== b.batas_waktu) {
      if (a.batas_waktu === null) return 1;
      if (b.batas_waktu === null) return -1;
      return a.batas_waktu < b.batas_waktu ? -1 : 1;
    }
    if (a.dibuat_pada !== b.dibuat_pada) return a.dibuat_pada < b.dibuat_pada ? -1 : 1;
    return a.id - b.id;
  });
  return hasil;
}

// ---- Klaim basi ----

export type KlaimKandidat = { id: number; diklaim_pada: string | null };

/**
 * Klaim yang boleh dilepas: basi menurut klaimBasi DAN kandidatnya tidak pernah
 * jadi tugas. (Kandidat yang sudah menjadi tugas — termasuk yang "terbakar" —
 * tak pernah dilepas lewat jalur ini.)
 */
export function pilihKlaimBasi(klaim: readonly KlaimKandidat[], idDenganTugas: ReadonlySet<number>, sekarangMs: number): number[] {
  const hasil: number[] = [];
  for (const k of klaim) {
    if (idDenganTugas.has(k.id)) continue;
    const t = k.diklaim_pada ? Date.parse(k.diklaim_pada) : NaN;
    // Klaim tanpa waktu valid dianggap basi (tidak mungkin dipulihkan lagi).
    if (!Number.isFinite(t) || klaimBasi(t, sekarangMs)) hasil.push(k.id);
  }
  return hasil;
}
