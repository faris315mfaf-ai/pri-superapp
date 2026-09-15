// ============================================================
// APAKAH KEGAGALAN INI LAYAK DIULANG? (15 Sep 2026)
//
// Penjelasan galat dalam Bahasa Indonesia sudah ditangani `solusiGagal`
// di lib/batas-caption — berkas ini TIDAK menerjemahkan ulang, supaya
// tidak lahir dua sumber kebenaran yang bisa menjawab berbeda.
//
// Yang ditambahkan di sini cuma satu keputusan yang belum ada di mana
// pun: apakah menekan tombol "Ulangi" sekarang masuk akal. Tanpa itu,
// admin mengulang unggahan yang ditolak karena kuota berkali-kali —
// membakar panggilan API untuk kepastian gagal, dan menyangka tombolnya
// rusak padahal platformnya memang sedang menolak.
//
// Murni: tidak menyentuh jaringan maupun database.
// ============================================================

import { solusiGagal } from "@/lib/batas-caption";

export type JenisGalat =
  /** Batas/kuota platform. Mengulang SEKARANG pasti ditolak lagi. */
  | "kuota"
  /** Gangguan sesaat (jaringan, server platform). Mengulang masuk akal. */
  | "sementara"
  /** Ada yang harus DIPERBAIKI dulu. Mengulang apa adanya percuma. */
  | "perbaiki-dulu"
  /** Tidak dikenali — boleh diulang sekali, siapa tahu hanya sesaat. */
  | "tak-dikenal";

/**
 * Golongkan pesan galat. Urutannya sengaja: yang paling khusus dulu,
 * karena satu kalimat bisa memuat beberapa kata kunci sekaligus
 * (mis. "limit" muncul di pesan kuota YouTube maupun di pesan panjang
 * caption).
 */
export function jenisGalat(pesan: string): JenisGalat {
  const m = (pesan ?? "").toLowerCase();
  if (!m.trim()) return "tak-dikenal";
  const ada = (...kata: string[]) => kata.some((k) => m.includes(k));

  if (ada("exceeded the number of videos", "uploadlimitexceeded", "upload limit", "quota", "kuota", "rate limit", "too many", "limit exceeded", "daily limit", "daily posting cap", "posting cap", "per day", "harian", "429")) {
    return "kuota";
  }
  // Bentuk "15/15" bersama kata batas: jatah harian platform yang habis.
  // Tanpa ini, pesan seperti "Daily limit 15/15" lolos ke "tak dikenal"
  // dan tombol Ulangi mengajak mencoba sesuatu yang pasti ditolak lagi.
  if (/(\d{1,4})\s*\/\s*(\d{1,4})/.test(m) && ada("limit", "quota", "kuota", "batas", "daily", "max")) {
    return "kuota";
  }
  if (
    ada(
      "token", "expired", "kedaluwarsa", "unauthorized", "401", "invalid_grant",
      "not connected", "no account", "belum ditautkan", "reconnect", "re-auth",
      "permission", "403", "forbidden", "scope",
      "duplicate", "already", "identical", "sudah tayang",
      "too long", "character", "karakter", "caption", "title",
      "format", "codec", "resolution", "aspect", "duration", "too short", "too large", "size",
      "copyright", "music",
      "inbox", "pending review",
    )
  ) {
    return "perbaiki-dulu";
  }
  if (ada("timeout", "timed out", "network", "econn", "socket", "temporar", "try again", "502", "503", "500", "server error", "gateway")) {
    return "sementara";
  }
  return "tak-dikenal";
}

export type BacaGalat = {
  jenis: JenisGalat;
  /** Ringkas, Bahasa Indonesia — dari solusiGagal. */
  ringkas: string;
  /** Apa yang harus dilakukan — dari solusiGagal. */
  solusi: string;
  /** false = menekan "Ulangi" sekarang hampir pasti sia-sia. */
  bolehUlang: boolean;
};

/** Keterangan lengkap satu kegagalan: penjelasan + keputusan ulang. */
export function bacaGalat(platform: string, pesan: string): BacaGalat {
  const jenis = jenisGalat(pesan);
  const { ringkas, solusi } = solusiGagal(platform, pesan ?? "");
  return {
    jenis,
    ringkas,
    solusi,
    // Hanya gangguan sesaat dan galat tak dikenal yang layak diulang.
    // Kuota dan "perbaiki dulu" akan menghasilkan penolakan yang sama.
    bolehUlang: jenis === "sementara" || jenis === "tak-dikenal",
  };
}

/**
 * Keputusan untuk SEKUMPULAN kegagalan — dipakai tombol "Ulangi".
 *
 * Mengulang tetap layak bila MASIH ADA satu saja platform yang mungkin
 * tertolong; satu platform yang kena kuota tidak boleh mengunci platform
 * lain yang cuma tersandung gangguan sesaat.
 */
export function layakDiulang(
  gagal: { platform: string; pesan: string }[],
): { bolehUlang: boolean; jumlahLayak: number; alasan: string } {
  const baca = gagal.map((g) => bacaGalat(g.platform, g.pesan));
  const layak = baca.filter((b) => b.bolehUlang);
  if (layak.length > 0) return { bolehUlang: true, jumlahLayak: layak.length, alasan: "" };
  const adaKuota = baca.some((b) => b.jenis === "kuota");
  return {
    bolehUlang: false,
    jumlahLayak: 0,
    alasan: adaKuota
      ? "Semua kegagalannya karena batas platform — mengulang sekarang akan ditolak lagi."
      : "Semua kegagalannya perlu diperbaiki dulu; mengulang apa adanya akan gagal lagi.",
  };
}
