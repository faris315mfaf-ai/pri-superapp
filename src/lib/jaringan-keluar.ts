// ============================================================
// JARINGAN KELUAR (29 Sep 2026) — tahan banting saat jalur IPv4 VPS rusak.
//
// Insiden 29 Sep 2026 (jam sibuk): pengguna merasakan "database lag",
// padahal Supabase sehat (CPU 32%, antrean pool 0). Diukur dari VPS:
// ±60% sambungan TCP IPv4 baru ke tujuan MANA PUN (Supabase, 1.1.1.1,
// 8.8.8.8, upload-post) gagal dan hilangnya sudah di lompatan pertama
// jaringan Hostinger; IPv6 100% lancar; dari luar VPS 100% lancar.
// Supabase hanya ber-IPv4 → tiap sambungan baru berpeluang menggantung
// 10 detik (batas bawaan undici) — itulah p95 ±10,5 dtk di log.
//
// Selama jaringannya belum dibereskan penyedia, aplikasi mengurangi
// dampaknya:
//   • sambungan dipakai ulang lebih lama (lebih jarang membuka baru);
//   • batas membuka sambungan 3 dtk (bukan 10) lalu COBA LAGI — aman
//     karena permintaannya belum terkirim sama sekali;
//   • sambungan yang putus di tengah hanya diulang untuk GET/HEAD.
// ============================================================

export type JenisGalatJaringan = "sambung" | "putus";

/** Galat sebelum permintaan terkirim (aman diulang untuk metode apa pun). */
const GALAT_SAMBUNG = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
  "EHOSTDOWN",
  "EAI_AGAIN",
  "ENOTFOUND",
]);
/** Galat yang bisa terjadi setelah permintaan terkirim (ulang hanya GET/HEAD). */
const GALAT_PUTUS = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CLOSED"]);

/** Kode galat jaringan dari galat fetch (termasuk `cause` bertingkat). */
export function kodeGalat(e: unknown): string {
  let x: unknown = e;
  for (let i = 0; i < 4 && x && typeof x === "object"; i++) {
    const kode = (x as { code?: unknown }).code;
    if (typeof kode === "string" && kode) return kode;
    x = (x as { cause?: unknown }).cause;
  }
  return "";
}

export function jenisGalatJaringan(e: unknown): JenisGalatJaringan | null {
  const k = kodeGalat(e);
  if (GALAT_SAMBUNG.has(k)) return "sambung";
  if (GALAT_PUTUS.has(k)) return "putus";
  return null;
}

/** Boleh diulang? Gagal tersambung = selalu; putus di tengah = hanya baca. */
export function bolehUlangJaringan(metode: string, jenis: JenisGalatJaringan | null): boolean {
  if (!jenis) return false;
  if (jenis === "sambung") return true;
  const m = metode.toUpperCase();
  return m === "GET" || m === "HEAD";
}

/** Jeda sebelum percobaan ke-(i+1). */
export const JEDA_ULANG_MS = [150, 400] as const;

/** Setelan dispatcher undici global (dipasang di instrumentation). */
export const SETELAN_SAMBUNGAN = {
  /** Batas membuka sambungan (bawaan undici 10 dtk). */
  connectTimeoutMs: 3_000,
  /** Sambungan diam dipertahankan selama ini (bawaan undici 4 dtk). */
  keepAliveTimeoutMs: 30_000,
  /** Batas atas keep-alive yang diminta server. */
  keepAliveMaxTimeoutMs: 120_000,
} as const;
