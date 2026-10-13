// Kebijakan room chat bot (13 Okt 2026): batas biaya & ukuran. Satu tempat, dipakai murni dan server.
export const KEBIJAKAN_CHAT = {
  /** Karakter maksimal satu pesan master. */
  PESAN_MAKS_KARAKTER: 1000,
  /** Jawaban agen maksimal per satu pesan master (mencegah ledakan biaya token). */
  JAWABAN_MAKS: 3,
  /** Pesan terakhir yang dibaca agen sebagai konteks. */
  KONTEKS_PESAN: 12,
  /** Karakter maksimal satu jawaban agen. */
  BALASAN_MAKS_KARAKTER: 500,
  /** Pesan yang dimuat layar sekali ambil. */
  MUAT_PESAN: 80,
} as const;
