// ============================================================
// BOT REDAKSI — validator sumber & daftar blokir (13 Okt 2026).
//
// Fungsi MURNI (tanpa DB/jaringan/React) yang dipakai bersama oleh server
// (/api/bot/sumber) dan klien (form Sumber & Kuota), jadi aturannya tidak
// pernah berbeda di dua tempat.
//
// Mengapa handle diperketat: handle akhirnya dipakai runner untuk menyusun
// tautan akun yang diberikan ke yt-dlp. Handle yang diawali "-" bisa dibaca
// sebagai OPSI argumen, "/" atau ".." bisa membelokkan jalur, dan spasi bisa
// memecah argumen. Karena itu hanya karakter aman yang lolos, dan pengguna
// diminta memasukkan HANDLE saja, bukan tautan penuh.
//
// Bentuk simpan (kanonik), supaya UNIQUE(bot_id, platform, handle) benar-benar
// menangkap duplikat:
//   • Instagram / TikTok : tanpa "@", huruf kecil   ("@NTV" -> "ntv")
//   • YouTube            : "@nama" huruf kecil, atau ID kanal "UC…" (24 karakter,
//                          huruf besar-kecil dipertahankan karena ID peka huruf)
// ============================================================

export type PlatformSumber = "Instagram" | "TikTok" | "YouTube";
export type KategoriSumber = "NEWS" | "HIBURAN" | "SHOWBIZ";

export const PLATFORM_SUMBER: readonly PlatformSumber[] = ["Instagram", "TikTok", "YouTube"];
export const KATEGORI_SUMBER: readonly KategoriSumber[] = ["NEWS", "HIBURAN", "SHOWBIZ"];

export const HANDLE_MIN = 2;
export const HANDLE_MAKS = 64;
export const BLOKIR_MIN = 2;
export const BLOKIR_MAKS = 80;
/** Pagar jumlah, supaya tabel dan perintah panen tidak membengkak tanpa batas. */
export const SUMBER_MAKS_PER_BOT = 50;
export const BLOKIR_MAKS_JUMLAH = 200;

export type KodeGalatSumber =
  | "platform_tak_dikenal"
  | "handle_bukan_teks"
  | "handle_kosong"
  | "handle_url"
  | "handle_pendek"
  | "handle_panjang"
  | "handle_awalan_minus"
  | "handle_karakter"
  | "handle_titik_ganda"
  | "handle_at_salah"
  | "kategori_tak_dikenal"
  | "blokir_bukan_teks"
  | "blokir_pendek"
  | "blokir_panjang"
  | "blokir_karakter_kontrol";

export type HasilSumber =
  | { ok: true; platform: PlatformSumber; handle: string }
  | { ok: false; kode: KodeGalatSumber };

const PESAN_GALAT: Record<KodeGalatSumber, string> = {
  platform_tak_dikenal: "Platform harus Instagram, TikTok, atau YouTube.",
  handle_bukan_teks: "Isi nama akun sumber.",
  handle_kosong: "Isi nama akun sumber.",
  handle_url: "Masukkan handle akunnya saja (contoh: @ntv), bukan tautan penuh.",
  handle_pendek: `Handle minimal ${HANDLE_MIN} karakter.`,
  handle_panjang: `Handle maksimal ${HANDLE_MAKS} karakter.`,
  handle_awalan_minus: "Handle tidak boleh diawali tanda minus (-).",
  handle_karakter: "Handle hanya boleh berisi huruf, angka, titik, garis bawah, dan strip (tanpa spasi atau garis miring).",
  handle_titik_ganda: "Handle tidak boleh memuat dua titik berurutan (..).",
  handle_at_salah: "Tanda @ hanya boleh satu dan harus di awal handle.",
  kategori_tak_dikenal: "Kategori harus NEWS, HIBURAN, atau SHOWBIZ.",
  blokir_bukan_teks: "Isi kata kunci atau akun yang diblokir.",
  blokir_pendek: `Kata blokir minimal ${BLOKIR_MIN} karakter.`,
  blokir_panjang: `Kata blokir maksimal ${BLOKIR_MAKS} karakter.`,
  blokir_karakter_kontrol: "Kata blokir tidak boleh memuat karakter kontrol.",
};

export function pesanGalatSumber(kode: KodeGalatSumber): string {
  return PESAN_GALAT[kode];
}

/** ID kanal YouTube: "UC" + 22 karakter [A-Za-z0-9_-] (total 24). */
const ID_KANAL_YOUTUBE = /^UC[A-Za-z0-9_-]{22}$/;
/** Karakter yang lolos: huruf, angka, titik, garis bawah, strip, dan "@" (hanya di awal). */
const KARAKTER_HANDLE = /^[A-Za-z0-9._@-]+$/;
/** Tanda tautan penuh / domain platform yang ditempel utuh. */
const TANDA_URL = /(:\/\/|\/|^www\.|(^|\.)(instagram|tiktok|youtube)\.com(\.|$)|(^|\.)youtu\.be$)/i;

export function normalkanPlatform(mentah: unknown): PlatformSumber | null {
  if (typeof mentah !== "string") return null;
  const k = mentah.trim().toLowerCase();
  if (k === "instagram" || k === "ig") return "Instagram";
  if (k === "tiktok" || k === "tt") return "TikTok";
  if (k === "youtube" || k === "yt") return "YouTube";
  return null;
}

export function normalkanKategori(mentah: unknown): KategoriSumber | null {
  if (typeof mentah !== "string") return null;
  const k = mentah.trim().toUpperCase();
  return (KATEGORI_SUMBER as readonly string[]).includes(k) ? (k as KategoriSumber) : null;
}

/**
 * Rapikan & periksa satu sumber. Hasil `handle` adalah bentuk simpan kanonik
 * (lihat catatan di kepala berkas). Tidak pernah melempar.
 */
export function normalkanSumber(masukan: { platform: unknown; handle: unknown }): HasilSumber {
  const platform = normalkanPlatform(masukan.platform);
  if (!platform) return { ok: false, kode: "platform_tak_dikenal" };
  if (typeof masukan.handle !== "string") return { ok: false, kode: "handle_bukan_teks" };

  const mentah = masukan.handle.trim();
  if (mentah.length === 0) return { ok: false, kode: "handle_kosong" };
  // URL diperiksa lebih dulu agar pesannya membantu ("tempel tautan" lebih umum dari salah ketik).
  if (TANDA_URL.test(mentah)) return { ok: false, kode: "handle_url" };
  if (mentah.length < HANDLE_MIN) return { ok: false, kode: "handle_pendek" };
  if (mentah.length > HANDLE_MAKS) return { ok: false, kode: "handle_panjang" };
  const badan = mentah.startsWith("@") ? mentah.slice(1) : mentah;
  // Awalan "-" (juga setelah "@") bisa terbaca sebagai opsi argumen oleh alat unduh.
  // Diperiksa sebelum karakter lain supaya "--exec=x" mendapat pesan yang tepat.
  if (badan.startsWith("-")) return { ok: false, kode: "handle_awalan_minus" };
  if (!KARAKTER_HANDLE.test(mentah)) return { ok: false, kode: "handle_karakter" };
  // "@" hanya sah satu kali di posisi pertama.
  if (mentah.indexOf("@", 1) !== -1) return { ok: false, kode: "handle_at_salah" };
  if (mentah.includes("..")) return { ok: false, kode: "handle_titik_ganda" };
  if (badan.length === 0) return { ok: false, kode: "handle_pendek" };

  if (platform === "YouTube") {
    if (ID_KANAL_YOUTUBE.test(badan) && !mentah.startsWith("@")) return { ok: true, platform, handle: badan };
    return { ok: true, platform, handle: `@${badan.toLowerCase()}` };
  }
  return { ok: true, platform, handle: badan.toLowerCase() };
}

/** Handle untuk ditampilkan: "ntv" -> "@ntv"; "@nama" dan ID kanal "UC…" apa adanya. */
export function tampilkanHandle(platform: string, handle: string): string {
  if (handle.startsWith("@")) return handle;
  if (platform === "YouTube" && ID_KANAL_YOUTUBE.test(handle)) return handle;
  return `@${handle}`;
}

/** Kata blokir: rapikan spasi berlebih lalu periksa panjang dan karakter kontrol. */
export function normalkanBlokir(mentah: unknown): { ok: true; kata: string } | { ok: false; kode: KodeGalatSumber } {
  if (typeof mentah !== "string") return { ok: false, kode: "blokir_bukan_teks" };
  // Spasi/tab/baris baru diratakan dulu; sisa karakter kontrol (NUL, ESC, dll.) ditolak.
  const kata = mentah.replace(/\s+/g, " ").trim();
  if (/[\u0000-\u001f\u007f]/.test(kata)) return { ok: false, kode: "blokir_karakter_kontrol" };
  if (kata.length < BLOKIR_MIN) return { ok: false, kode: "blokir_pendek" };
  if (kata.length > BLOKIR_MAKS) return { ok: false, kode: "blokir_panjang" };
  return { ok: true, kata };
}

/**
 * Kata blokir pertama yang cocok dengan handle (substring, tanpa membedakan
 * huruf besar-kecil), atau null. "@" diabaikan di kedua sisi supaya blokir
 * "@spam" tetap menjaring handle tersimpan "spam" (tanpa "@") dan sebaliknya.
 */
export function cocokBlokir(handle: string, blokir: readonly string[]): string | null {
  const bentuk = (s: string) => s.trim().toLowerCase().replace(/^@/, "");
  const h = bentuk(handle);
  if (h.length === 0) return null;
  for (const kata of blokir) {
    const k = bentuk(kata);
    if (k.length === 0) continue;
    if (h.includes(k)) return kata;
  }
  return null;
}

/** Sama persis tanpa membedakan huruf besar-kecil (dipakai cek duplikat daftar blokir). */
export function samaTanpaHuruf(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
