// ============================================================
// TUGAS BOT di TVR Saya akun bot (2F, 13 Okt 2026) — fungsi MURNI.
//
// Tanpa React/DOM/jaringan supaya bisa diuji (tests/uji-tugas-bot.mts):
// label tahap tugas, alasan bot belum bisa mulai, status kandidat, format
// tenggat/durasi/angka, pemotongan URL, dan pengurutan daftar.
// Bentuk data: lib/bot-tipe.ts (bagian "Tugas Bot").
// ============================================================

import type {
  KandidatBotRingkas,
  ModeBotDb,
  PermintaanWajibRingkas,
  StatusKandidatBot,
  TugasBotRingkas,
} from "@/lib/bot-tipe";

/** Warna chip — sama dengan StatusBadge (components/pri-ui). */
export type WarnaChip = "hijau" | "kuning" | "merah" | "biru" | "netral" | "pri";

/** Batas jumlah baris yang ditampilkan. */
export const MAKS_KANDIDAT_TAMPIL = 20;
export const MAKS_TUGAS_TAMPIL = 10;
/** Panjang tampilan URL dan galat sebelum dipotong. */
export const MAKS_URL_TAMPIL = 46;
export const MAKS_GALAT_TAMPIL = 140;

// ---------- Tahap tugas ----------

const LABEL_TAHAP: Record<string, string> = {
  cari: "Mencari",
  pilih: "Memilih",
  unduh: "Mengunduh",
  edit: "Membuat video",
  siap_ditinjau: "Siap ditinjau",
  menunggu_acc: "Menunggu ACC",
  disetujui: "Disetujui",
  posting: "Memposting",
  selesai: "Selesai",
  gagal: "Gagal",
};

/** Label Indonesia sebuah tahap tugas; tahap tak dikenal → "Diproses". */
export function labelTahap(tahap: string | null | undefined): string {
  if (typeof tahap !== "string" || !Object.prototype.hasOwnProperty.call(LABEL_TAHAP, tahap)) return "Diproses";
  return LABEL_TAHAP[tahap];
}

/** Warna chip tahap: hijau = selesai/disetujui, kuning = perlu manusia, merah = gagal, biru = berjalan. */
export function warnaTahap(tahap: string | null | undefined): WarnaChip {
  switch (tahap) {
    case "selesai":
    case "disetujui":
      return "hijau";
    case "siap_ditinjau":
    case "menunggu_acc":
      return "kuning";
    case "gagal":
      return "merah";
    case "cari":
    case "pilih":
    case "unduh":
    case "edit":
    case "posting":
      return "biru";
    default:
      return "netral";
  }
}

// ---------- Alasan bot belum bisa mulai ----------

/** Rentang jam aktif bot ("HH:MM" WIB) — untuk melengkapi alasan di_luar_jam. */
export type JamAktif = { mulai: string; selesai: string };

const JAM_SAH = /^[0-2]\d:[0-5]\d$/;

/**
 * Penjelasan Indonesia untuk kode `alasan_tutup` (AlasanDiam lib/bot-mesin).
 * Kode kosong → "" ; kode tak dikenal → teks umum (jangan pernah menampilkan kode mentah).
 */
export function labelAlasanTutup(kode: string | null | undefined, jam?: JamAktif | null): string {
  if (kode === null || kode === undefined || kode === "") return "";
  switch (kode) {
    case "nonaktif":
      return "Bot ini sedang dinonaktifkan oleh master.";
    case "jeda_global":
      return "Semua bot sedang dijeda oleh master.";
    case "jeda_bot":
      return "Bot ini sedang dijeda oleh master.";
    case "gagal_beruntun":
      return "Bot berhenti sementara karena gagal beberapa kali berturut-turut. Master perlu memeriksanya.";
    case "di_luar_jam": {
      const rentang = jam && JAM_SAH.test(jam.mulai) && JAM_SAH.test(jam.selesai) ? ` (${jam.mulai}–${jam.selesai} WIB)` : "";
      return `Sekarang di luar jam aktif bot${rentang}.`;
    }
    case "kuota_habis":
      return "Kuota video bot hari ini sudah habis. Bot lanjut lagi besok.";
    case "terkunci":
      return "Bot sedang mengerjakan tugas lain. Tunggu sampai selesai.";
    case "menunggu_manusia":
      return "Ada video bot yang menunggu ditinjau atau di-ACC. Selesaikan itu dulu.";
    default:
      return "Bot belum bisa memulai tugas baru saat ini.";
  }
}

// ---------- Mode, kuota, jeda ----------

export function labelMode(mode: ModeBotDb | string | null | undefined): string {
  if (mode === "otomatis") return "Otomatis";
  if (mode === "acc") return "Perlu ACC";
  return "Tidak diketahui";
}

/** "2/3 hari ini". Angka rusak (negatif/NaN) dirapikan jadi 0. */
export function teksKuota(postHariIni: number, kuotaHarian: number): string {
  const rapi = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  return `${rapi(postHariIni)}/${rapi(kuotaHarian)} hari ini`;
}

/** Persen kuota terpakai 0..100 (kuota 0 → 0 supaya tidak membagi nol). */
export function persenKuota(postHariIni: number, kuotaHarian: number): number {
  const p = Number.isFinite(postHariIni) && postHariIni > 0 ? postHariIni : 0;
  const k = Number.isFinite(kuotaHarian) && kuotaHarian > 0 ? kuotaHarian : 0;
  if (k === 0) return 0;
  return Math.min(100, Math.round((p / k) * 100));
}

/** Status jeda gabungan: jeda global lebih dulu disebut karena berlaku untuk semua bot. */
export function labelJeda(jedaBot: boolean, jedaGlobal: boolean): { jeda: boolean; label: string } {
  if (jedaGlobal) return { jeda: true, label: "Dijeda (semua bot)" };
  if (jedaBot) return { jeda: true, label: "Dijeda (bot ini)" };
  return { jeda: false, label: "Berjalan" };
}

// ---------- Status kandidat ----------

const LABEL_KANDIDAT: Record<StatusKandidatBot, string> = {
  bebas: "Bebas",
  diklaim_saya: "Diklaim bot ini",
  diklaim_lain: "Diklaim bot lain",
  bentrok: "Bentrok dengan video yang sudah dipakai",
};

export function labelStatusKandidat(status: StatusKandidatBot | string | null | undefined): string {
  if (typeof status === "string" && Object.prototype.hasOwnProperty.call(LABEL_KANDIDAT, status)) {
    return LABEL_KANDIDAT[status as StatusKandidatBot];
  }
  return "Tidak diketahui";
}

export function warnaStatusKandidat(status: StatusKandidatBot | string | null | undefined): WarnaChip {
  switch (status) {
    case "bebas":
      return "hijau";
    case "diklaim_saya":
      return "biru";
    case "diklaim_lain":
      return "netral";
    case "bentrok":
      return "merah";
    default:
      return "netral";
  }
}

/** Urutan tampil kandidat: milik bot ini, bebas, diklaim lain, bentrok. */
const BOBOT_KANDIDAT: Record<string, number> = { diklaim_saya: 0, bebas: 1, diklaim_lain: 2, bentrok: 3 };

// ---------- Permintaan Video Wajib ----------

export function labelStatusPermintaan(status: PermintaanWajibRingkas["status"] | string): string {
  return status === "diambil_saya" ? "Diambil bot ini" : "Terbuka";
}

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Pecah "YYYY-MM-DD" sah (termasuk 29 Feb kabisat) menjadi angka; selain itu null. */
function uraiTanggal(s: string | null | undefined): { t: number; b: number; h: number } | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const t = Number(m[1]);
  const b = Number(m[2]);
  const h = Number(m[3]);
  const d = new Date(Date.UTC(t, b - 1, h));
  if (d.getUTCFullYear() !== t || d.getUTCMonth() !== b - 1 || d.getUTCDate() !== h) return null;
  return { t, b, h };
}

/** "Tenggat 17 Okt" atau "Tanpa tenggat" (null, kosong, atau tanggal rusak). */
export function formatTenggat(batas: string | null | undefined): string {
  const p = uraiTanggal(batas);
  if (!p) return "Tanpa tenggat";
  return `Tenggat ${p.h} ${NAMA_BULAN[p.b - 1]}`;
}

/** Selisih hari (tenggat − hariIni), keduanya "YYYY-MM-DD"; null bila salah satunya tak sah. */
export function selisihHari(batas: string | null | undefined, hariIni: string): number | null {
  const a = uraiTanggal(batas);
  const b = uraiTanggal(hariIni);
  if (!a || !b) return null;
  return Math.round((Date.UTC(a.t, a.b - 1, a.h) - Date.UTC(b.t, b.b - 1, b.h)) / 86_400_000);
}

/** Tenggat hari ini atau besok (atau sudah lewat) → perlu perhatian. */
export function tenggatMendesak(batas: string | null | undefined, hariIni: string): boolean {
  const s = selisihHari(batas, hariIni);
  return s !== null && s <= 1;
}

/** Hari ini menurut WIB sebagai "YYYY-MM-DD" (WIB = UTC+7, tanpa DST). */
export function hariIniWib(sekarangMs: number = Date.now()): string {
  return new Date(sekarangMs + 7 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Urutan permintaan: yang sudah diambil bot ini di depan, lalu tenggat terdekat
 * (tanpa tenggat paling akhir), lalu id kecil dulu. Mengembalikan salinan.
 */
export function urutkanPermintaan(daftar: readonly PermintaanWajibRingkas[]): PermintaanWajibRingkas[] {
  return [...daftar].sort((a, b) => {
    const sa = a.status === "diambil_saya" ? 0 : 1;
    const sb = b.status === "diambil_saya" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const ta = uraiTanggal(a.batas_waktu) ? a.batas_waktu! : "9999-99-99";
    const tb = uraiTanggal(b.batas_waktu) ? b.batas_waktu! : "9999-99-99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.id - b.id;
  });
}

/**
 * Tombol "Ambil sekarang" aktif bila permintaan masih terbuka dan bot boleh mulai.
 * Permintaan yang sudah diambil bot ini tidak bisa diambil lagi.
 */
export function bisaAmbilPermintaan(p: Pick<PermintaanWajibRingkas, "status">, botBisaMulai: boolean): boolean {
  return p.status === "terbuka" && botBisaMulai;
}

// ---------- Kandidat ----------

/** Host tanpa "www." / "m." dari URL; null bila bukan URL http(s) yang sah. */
function hostDari(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^(www|m|vm|vt)\./, "");
  } catch {
    return null;
  }
}

/** Platform kanonik dari URL ("Instagram" | "TikTok" | "YouTube"); null bila tak dikenal. */
export function platformDariUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const host = hostDari(url);
  if (!host) return null;
  const cocok = (dom: string) => host === dom || host.endsWith(`.${dom}`);
  if (cocok("instagram.com") || host === "instagr.am") return "Instagram";
  if (cocok("tiktok.com")) return "TikTok";
  if (cocok("youtube.com") || host === "youtu.be") return "YouTube";
  return null;
}

/**
 * URL yang aman dijadikan tautan: hanya http/https (tolak javascript:, data:, dll.).
 * Mengembalikan URL yang sudah dirapikan, atau null.
 */
export function urlAman(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Platform yang punya ikon khusus (lainnya memakai ikon umum). */
export function platformPunyaIkon(platform: string): boolean {
  return ["instagram", "tiktok", "youtube", "facebook", "twitter", "threads"].includes(platform.trim().toLowerCase());
}

/** Platform untuk ditampilkan: dari data server, cadangan dari URL, terakhir "Sosmed". */
export function platformTampil(platform: string | null | undefined, url: string | null | undefined): string {
  const p = typeof platform === "string" ? platform.trim() : "";
  if (p) return p;
  return platformDariUrl(url) ?? "Sosmed";
}

/**
 * URL ringkas untuk tampilan: tanpa skema dan "www.", tanpa "/" penutup, dipotong
 * dengan "…" bila melebihi `maks`. Bukan URL → teks dipotong apa adanya.
 */
export function potongUrl(url: string | null | undefined, maks: number = MAKS_URL_TAMPIL): string {
  if (typeof url !== "string") return "";
  const batas = Math.max(4, Math.floor(maks));
  let s = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  if (s.length <= batas) return s;
  s = s.slice(0, batas - 1).replace(/[\s/?&#=.-]+$/, "");
  return `${s}…`;
}

/** Durasi "0:45", "1:05", "1:02:03"; null/negatif/bukan angka → "—". */
export function formatDurasi(detik: number | null | undefined): string {
  if (typeof detik !== "number" || !Number.isFinite(detik) || detik < 0) return "—";
  const total = Math.round(detik);
  const j = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dua = (n: number) => String(n).padStart(2, "0");
  return j > 0 ? `${j}:${dua(m)}:${dua(s)}` : `${m}:${dua(s)}`;
}

/** Angka ringkas ala Indonesia: 950, "1,2 rb", "3,4 jt", "1 M"; null/rusak → "—". */
export function formatAngkaRingkas(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  const lipat = (nilai: number, satuan: string) => {
    const bulat = Math.round(nilai * 10) / 10;
    return `${String(bulat).replace(".", ",")} ${satuan}`;
  };
  if (n < 1000) return String(Math.floor(n));
  if (n < 1_000_000) return lipat(n / 1000, "rb");
  if (n < 1_000_000_000) return lipat(n / 1_000_000, "jt");
  return lipat(n / 1_000_000_000, "M");
}

/**
 * Kandidat untuk ditampilkan: milik bot ini, bebas, diklaim lain, bentrok; di dalam
 * kelompok yang terbit terbaru dulu (tanpa waktu terbit di akhir), lalu id besar dulu.
 * Dipotong maksimal `maks` (20). Mengembalikan salinan.
 */
export function urutkanKandidat(
  daftar: readonly KandidatBotRingkas[],
  maks: number = MAKS_KANDIDAT_TAMPIL,
): KandidatBotRingkas[] {
  const waktu = (k: KandidatBotRingkas) => {
    const ms = k.waktu_terbit ? Date.parse(k.waktu_terbit) : NaN;
    return Number.isFinite(ms) ? ms : -Infinity;
  };
  return [...daftar]
    .sort((a, b) => {
      const ba = Object.prototype.hasOwnProperty.call(BOBOT_KANDIDAT, a.status) ? BOBOT_KANDIDAT[a.status] : 9;
      const bb = Object.prototype.hasOwnProperty.call(BOBOT_KANDIDAT, b.status) ? BOBOT_KANDIDAT[b.status] : 9;
      if (ba !== bb) return ba - bb;
      const wa = waktu(a);
      const wb = waktu(b);
      if (wa !== wb) return wa > wb ? -1 : 1;
      return b.id - a.id;
    })
    .slice(0, Math.max(0, Math.floor(maks)));
}

// ---------- Tugas bot ----------

/** `maks` (10) tugas terbaru: dibuat terbaru dulu, lalu id besar dulu. Salinan. */
export function tugasTerbaru(daftar: readonly TugasBotRingkas[], maks: number = MAKS_TUGAS_TAMPIL): TugasBotRingkas[] {
  const waktu = (t: TugasBotRingkas) => {
    const ms = Date.parse(t.dibuat_pada);
    return Number.isFinite(ms) ? ms : -Infinity;
  };
  return [...daftar]
    .sort((a, b) => {
      const wa = waktu(a);
      const wb = waktu(b);
      if (wa !== wb) return wa > wb ? -1 : 1;
      return b.id - a.id;
    })
    .slice(0, Math.max(0, Math.floor(maks)));
}

/** Galat ringkas satu baris: spasi/baris baru diratakan, dipotong dengan "…". */
export function ringkasGalat(galat: string | null | undefined, maks: number = MAKS_GALAT_TAMPIL): string {
  if (typeof galat !== "string") return "";
  const rapi = galat.replace(/\s+/g, " ").trim();
  const batas = Math.max(2, Math.floor(maks));
  return rapi.length <= batas ? rapi : `${rapi.slice(0, batas - 1).trimEnd()}…`;
}

/** Judul tampil: kosong → cadangan supaya baris tidak hampa. */
export function judulTampil(judul: string | null | undefined, cadangan = "(tanpa judul)"): string {
  const j = typeof judul === "string" ? judul.replace(/\s+/g, " ").trim() : "";
  return j || cadangan;
}
