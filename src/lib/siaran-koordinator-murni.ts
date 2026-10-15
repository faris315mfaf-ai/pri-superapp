// ============================================================
// SIARAN KOORDINATOR KE AKUN ANGGOTA (15 Okt 2026) — bagian MURNI.
//
// Tanpa database/jaringan: aman untuk server DAN klien, dan teruji
// (tests/uji-siaran-koordinator.mts).
//
// Koordinator (master, Ruang Bot → Koordinator → Siaran Anggota) menyiarkan
// SATU video ke akun sosmed anggota yang tertaut di upload-post. Anggota sudah
// menyetujui saat mendaftar (keputusan pemilik), jadi koordinator bertindak
// setingkat superadmin atas akun tertaut. Pagar yang tersisa di sini adalah
// pagar platform & keselamatan: laju kirim bertahap, jam tenang, batas harian
// per akun, konfirmasi untuk siaran besar, dan ulang hanya bila PASTI belum
// terkirim.
// ============================================================

export const MODE_SIARAN = ["bertahap", "serentak", "terjadwal"] as const;
export type ModeSiaran = (typeof MODE_SIARAN)[number];

export const SUMBER_VIDEO_SIARAN = ["acc", "stok_tim", "video_wajib", "unggah"] as const;
export type SumberVideoSiaran = (typeof SUMBER_VIDEO_SIARAN)[number];

export const LABEL_SUMBER_VIDEO: Record<SumberVideoSiaran, string> = {
  acc: "Antrean ACC",
  stok_tim: "Stok Video tim",
  video_wajib: "Bahan Video Wajib",
  unggah: "Unggah baru",
};

export const LABEL_MODE: Record<ModeSiaran, string> = {
  bertahap: "Bertahap",
  serentak: "Serentak",
  terjadwal: "Terjadwal",
};

export const KEBIJAKAN_SIARAN = {
  /** Akun paling banyak dalam satu siaran. */
  MAKS_PENERIMA: 500,
  /** Siaran koordinator paling banyak per akun per hari (WIB). */
  BATAS_HARIAN: 3,
  /** Jeda bawaan antar akun (detik) untuk mode bertahap. */
  JEDA_BAWAAN: 45,
  JEDA_MIN: 20,
  JEDA_MAKS: 600,
  /** Simpangan acak ± detik di sekitar jeda (tidak terlihat seperti mesin). */
  JITTER: 15,
  /** Lebih dari ini wajib mengetik SIARKAN. */
  KONFIRMASI_DI_ATAS: 50,
  /** Jam tenang WIB: [mulai, selesai) — tidak ada kiriman bertahap di rentang ini. */
  JAM_TENANG_MULAI: 22,
  JAM_TENANG_SELESAI: 6,
  /** Variasi caption Nara paling banyak. */
  VARIAN_MAKS: 3,
  /** Mode terjadwal: paling jauh ke depan (hari) — sebelum umur tautan video habis. */
  JADWAL_MAKS_HARI: 5,
  /** Mode terjadwal: paling dekat ke depan (menit). */
  JADWAL_MIN_MENIT: 5,
  CAPTION_MAKS: 2200,
} as const;

/** Kata konfirmasi siaran besar. */
export const KATA_KONFIRMASI = "SIARKAN";

export function adalahMode(x: unknown): x is ModeSiaran {
  return typeof x === "string" && (MODE_SIARAN as readonly string[]).includes(x);
}

export function adalahSumberVideo(x: unknown): x is SumberVideoSiaran {
  return typeof x === "string" && (SUMBER_VIDEO_SIARAN as readonly string[]).includes(x);
}

export function perluKonfirmasi(jumlahAkun: number): boolean {
  return jumlahAkun > KEBIJAKAN_SIARAN.KONFIRMASI_DI_ATAS;
}

export function konfirmasiSah(teks: unknown): boolean {
  return String(teks ?? "").trim().toUpperCase() === KATA_KONFIRMASI;
}

export function jedaSah(detik: unknown): number {
  const n = Math.round(Number(detik));
  if (!Number.isFinite(n)) return KEBIJAKAN_SIARAN.JEDA_BAWAAN;
  return Math.min(KEBIJAKAN_SIARAN.JEDA_MAKS, Math.max(KEBIJAKAN_SIARAN.JEDA_MIN, n));
}

// ------------------------------------------------------------
// Status penerima
// ------------------------------------------------------------

export type StatusPenerima = "siap" | "login_ulang" | "batas_harian" | "tanpa_akun";

export const LABEL_STATUS_PENERIMA: Record<StatusPenerima, string> = {
  siap: "Siap",
  login_ulang: "Perlu login ulang",
  batas_harian: "Batas harian tercapai",
  tanpa_akun: "Belum ada akun tertaut",
};

/**
 * Status satu anggota: platform yang siap = tertaut dikurangi yang perlu login ulang.
 * `siaranHariIni` = siaran koordinator yang sudah dijadwalkan/terkirim ke akun ini hari ini.
 */
export function statusPenerima(p: {
  platform: string[];
  perluUlang: string[];
  siaranHariIni: number;
}): { status: StatusPenerima; platformSiap: string[] } {
  const ulang = new Set(p.perluUlang);
  const platformSiap = [...new Set(p.platform)].filter((x) => !ulang.has(x));
  if (p.platform.length === 0) return { status: "tanpa_akun", platformSiap: [] };
  if (platformSiap.length === 0) return { status: "login_ulang", platformSiap: [] };
  if (p.siaranHariIni >= KEBIJAKAN_SIARAN.BATAS_HARIAN) return { status: "batas_harian", platformSiap };
  return { status: "siap", platformSiap };
}

// ------------------------------------------------------------
// Jadwal kirim per akun
// ------------------------------------------------------------

const MS_WIB = 7 * 3600_000;

/** Jam (0–23) WIB. */
export function jamWib(ms: number): number {
  return new Date(ms + MS_WIB).getUTCHours();
}

export function diJamTenang(ms: number): boolean {
  const j = jamWib(ms);
  const { JAM_TENANG_MULAI: a, JAM_TENANG_SELESAI: b } = KEBIJAKAN_SIARAN;
  return a > b ? j >= a || j < b : j >= a && j < b;
}

/** Bila di jam tenang, maju ke akhir jam tenang berikutnya (06.00 WIB); selain itu apa adanya. */
export function keluarJamTenang(ms: number): number {
  if (!diJamTenang(ms)) return ms;
  const d = new Date(ms + MS_WIB);
  const akhir = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), KEBIJAKAN_SIARAN.JAM_TENANG_SELESAI) - MS_WIB;
  // Setelah tengah malam (00.00–05.59) akhirnya hari yang sama; sebelum tengah malam (22.00–23.59) besok.
  return jamWib(ms) < KEBIJAKAN_SIARAN.JAM_TENANG_SELESAI ? akhir : akhir + 86_400_000;
}

/** PRNG deterministik (mulberry32): jadwal yang sama untuk benih yang sama — bisa diuji. */
export function acak(benih: number): () => number {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Waktu kirim (ms) tiap akun, urut. Serentak: semua di `mulaiMs`. Bertahap/terjadwal:
 * mulai di `mulaiMs` (digeser keluar jam tenang), lalu tiap akun berjarak `jedaDetik` ±
 * JITTER (minimal 5 dtk dari sebelumnya); kiriman yang jatuh di jam tenang digeser ke
 * 06.00 WIB dan sisanya menyusul dari sana.
 */
export function jadwalKirim(p: { jumlah: number; mode: ModeSiaran; mulaiMs: number; jedaDetik: number; benih: number }): number[] {
  const n = Math.max(0, Math.floor(p.jumlah));
  if (n === 0) return [];
  if (p.mode === "serentak") return Array.from({ length: n }, () => p.mulaiMs);
  const jeda = jedaSah(p.jedaDetik) * 1000;
  const goyang = Math.min(KEBIJAKAN_SIARAN.JITTER * 1000, Math.floor(jeda / 3));
  const r = acak(p.benih);
  const hasil: number[] = [];
  let t = keluarJamTenang(p.mulaiMs);
  for (let i = 0; i < n; i += 1) {
    if (i > 0) {
      const simpang = Math.round((r() * 2 - 1) * goyang);
      t = Math.max(hasil[i - 1]! + 5000, t + jeda + simpang);
      t = keluarJamTenang(t);
    }
    hasil.push(t);
  }
  return hasil;
}

/** Perkiraan selesai (ms) = waktu kirim terakhir. */
export function perkiraanSelesai(jadwal: number[]): number | null {
  return jadwal.length ? jadwal[jadwal.length - 1]! : null;
}

// ------------------------------------------------------------
// Ulang, varian, ringkasan
// ------------------------------------------------------------

/** Awalan pesan item yang terputus di tengah panggilan (mungkin sudah terposting). */
export const PESAN_TERPUTUS = "Terputus saat mengirim";

export type ItemUlang = { status: string; pesan: string | null; hasil?: Record<string, unknown> | null };

/**
 * Boleh dikirim ulang otomatis HANYA bila pasti belum terbit: ditolak sebelum diproses,
 * gagal di semua platform menurut balasan, atau tanpa platform. Galat ambigu (timeout/5xx,
 * terputus) mungkin sudah terposting — tidak pernah diulang otomatis.
 */
export function bolehDiulang(item: ItemUlang): boolean {
  if (item.status !== "gagal") return false;
  const pesan = String(item.pesan ?? "");
  if (pesan.startsWith(PESAN_TERPUTUS)) return false;
  const galat = item.hasil && typeof item.hasil === "object" ? (item.hasil as { galat?: unknown }).galat : undefined;
  if (galat === "pasti") return true;
  if (galat === "ambigu") return false;
  return pesan.startsWith("Gagal di semua sosmed") || pesan.startsWith("Profil ini belum menautkan") || pesan.startsWith("Akun anggota");
}

/** Varian caption untuk akun ke-i (berputar); null = pakai caption utama. */
export function pilihVarian(i: number, jumlahVarian: number): number | null {
  // Caption utama ikut bergiliran (null), lalu variasi 0..n-1: 1 variasi pun
  // sudah memberi dua susunan berbeda.
  if (jumlahVarian <= 0) return null;
  const r = i % (jumlahVarian + 1);
  return r === 0 ? null : r - 1;
}

/** Variasi caption yang dipakai: dirapikan, unik, tidak kosong, maks VARIAN_MAKS, maks panjang caption. */
export function rapikanVariasi(daftar: unknown): string[] {
  if (!Array.isArray(daftar)) return [];
  const hasil: string[] = [];
  for (const x of daftar) {
    const s = String(x ?? "").replace(/\r\n/g, "\n").trim().slice(0, KEBIJAKAN_SIARAN.CAPTION_MAKS);
    if (s && !hasil.includes(s)) hasil.push(s);
    if (hasil.length >= KEBIJAKAN_SIARAN.VARIAN_MAKS) break;
  }
  return hasil;
}

export type RingkasItemSiaran = { total: number; terkirim: number; gagal: number; menunggu: number; dibatalkan: number };

export function ringkasItem(item: { status: string }[]): RingkasItemSiaran {
  const n = (s: string[]) => item.filter((i) => s.includes(i.status)).length;
  return {
    total: item.length,
    terkirim: n(["terkirim"]),
    gagal: n(["gagal"]),
    menunggu: n(["menunggu", "diproses"]),
    dibatalkan: n(["dibatalkan"]),
  };
}

// ------------------------------------------------------------
// Variasi caption oleh Nara (LLM koordinator) — prompt & penguraian
// ------------------------------------------------------------

export const SISTEM_VARIASI =
  "Anda redaktur media sosial berbahasa Indonesia. Tulis ulang caption berikut menjadi beberapa variasi " +
  "dengan susunan kalimat berbeda. ATURAN: fakta, angka, nama, tanggal, dan kredit sumber TIDAK BOLEH berubah, " +
  "ditambah, atau dihilangkan; tanpa hashtag baru; tanpa emoji berlebihan; panjang tiap variasi tidak lebih dari " +
  "caption asli + 20%. Jawab HANYA JSON: {\"variasi\": [\"...\", \"...\", \"...\"]}.";

export function promptVariasi(judul: string, caption: string, jumlah: number): string {
  return `Judul video: ${judul.slice(0, 200)}\nJumlah variasi: ${Math.max(1, Math.min(KEBIJAKAN_SIARAN.VARIAN_MAKS, jumlah))}\nCaption asli:\n${caption.slice(0, KEBIJAKAN_SIARAN.CAPTION_MAKS)}`;
}

/** Ambil daftar variasi dari jawaban model (JSON, boleh berbungkus ```); rusak = []. */
export function uraiVariasi(teks: string): string[] {
  const bersih = String(teks ?? "").replace(/```(?:json)?/gi, "").trim();
  const awal = bersih.indexOf("{");
  const akhir = bersih.lastIndexOf("}");
  if (awal < 0 || akhir <= awal) return [];
  try {
    const o = JSON.parse(bersih.slice(awal, akhir + 1)) as { variasi?: unknown };
    return rapikanVariasi(o.variasi);
  } catch {
    return [];
  }
}

/**
 * Pagar fakta terukur: variasi ditolak bila mengubah/menghilangkan ANGKA, singkatan HURUF BESAR
 * (PLN, ESDM, ANTARA), @mention, #hashtag, atau "Sumber: X" dari caption asli; menambah @mention/
 * #hashtag baru; atau jauh lebih panjang. Model bisa keliru — ini menjaga yang bisa diukur.
 */
export function variasiAman(asli: string, varian: string): boolean {
  const angka = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((x) => x.replace(/[.,]/g, "")));
  const angkaV = angka(varian);
  for (const a of angka(asli)) if (!angkaV.has(a)) return false;
  const singkatan = (s: string) => new Set(s.match(/\b[A-Z]{2,}[A-Z0-9]*\b/g) ?? []);
  const singkatanV = singkatan(varian);
  for (const a of singkatan(asli)) if (!singkatanV.has(a)) return false;
  const tanda = (s: string) => new Set((s.match(/[@#][\p{L}\p{N}_.]+/gu) ?? []).map((x) => x.toLowerCase()));
  const tandaA = tanda(asli);
  const tandaV = tanda(varian);
  if (tandaA.size !== tandaV.size || [...tandaA].some((x) => !tandaV.has(x))) return false;
  const sumber = /sumber\s*:\s*([^\n.]+)/i.exec(asli)?.[1]?.trim();
  if (sumber && !varian.toLowerCase().includes(sumber.toLowerCase())) return false;
  return varian.length <= Math.max(asli.length * 1.3, asli.length + 40);
}
