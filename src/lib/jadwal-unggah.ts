// ============================================================
// ATURAN WAKTU JADWAL UNGGAH (15 Sep 2026)
//
// Dipakai peramban (agar tombol tidak menjanjikan yang pasti ditolak)
// DAN server (penentu sebenarnya), supaya keduanya tidak pernah berbeda
// pendapat. Murni: tidak menyentuh jaringan maupun database.
//
// BATAS 7 HARI YANG DULU BERLAKU BUKAN PILIHAN, MELAINKAN FISIKA.
// Bila videonya diserahkan lewat tautan bertanda tangan (R2), tautan itu
// TIDAK BISA dibuat berumur lebih dari 7 hari — aturan SigV4, bukan
// kebijakan kita. Menjadwalkan lebih jauh berarti tautannya sudah mati
// saat waktunya tiba: video gagal terbit tanpa ada yang salah ketik.
//
// Jalur penyimpanan lain (bucket publik, Cloudinary, tautan milik
// sendiri) tidak punya batas itu, jadi di sana jadwalnya dibuka.
// ============================================================

/** Paling cepat 5 menit dari sekarang — memberi ruang proses unggah. */
export const JADWAL_MIN_MENIT = 5;

/** Umur maksimum tautan bertanda tangan (aturan SigV4), dalam hari. */
export const JADWAL_MAKS_HARI_TANDA_TANGAN = 7;

/**
 * Pagar jauh untuk jalur tanpa tanda tangan. BUKAN pembatas kebijakan:
 * ia menangkap salah ketik tahun (2126) dan menjaga agar berkas videonya
 * tidak ditahan di penyimpanan selama puluhan tahun — penyapu media
 * membuang berkas 2 jam SETELAH tayang, jadi jadwal yang keliru jauh
 * berarti berkasnya tidak pernah tersapu.
 */
export const JADWAL_MAKS_HARI = 365;

export type PeriksaJadwal =
  | { sah: true; iso: string }
  | { sah: false; pesan: string };

export function batasJadwalHari(pakaiTandaTangan: boolean): number {
  return pakaiTandaTangan ? JADWAL_MAKS_HARI_TANDA_TANGAN : JADWAL_MAKS_HARI;
}

/**
 * @param masukan     waktu dari layar (ISO atau apa pun yang bisa dibaca Date)
 * @param pakaiTandaTangan videonya diserahkan lewat tautan bertanda tangan
 * @param sekarangMs  disuntikkan saat pengujian
 */
export function periksaJadwal(
  masukan: string,
  pakaiTandaTangan = false,
  sekarangMs: number = Date.now(),
): PeriksaJadwal {
  const t = Date.parse(masukan ?? "");
  if (!Number.isFinite(t)) return { sah: false, pesan: "Waktu jadwal tidak terbaca." };

  // Toleransi 1 menit: jam perangkat pengguna sering meleset sedikit dari
  // jam server, dan menolak jadwal yang "kurang 20 detik" hanya bikin
  // orang mengulang-ulang tanpa tahu apa salahnya.
  if (t < sekarangMs + (JADWAL_MIN_MENIT - 1) * 60_000) {
    return { sah: false, pesan: `Jadwal minimal ${JADWAL_MIN_MENIT} menit dari sekarang.` };
  }

  const maksHari = batasJadwalHari(pakaiTandaTangan);
  if (t > sekarangMs + maksHari * 86_400_000) {
    return {
      sah: false,
      pesan: pakaiTandaTangan
        ? `Jadwal maksimal ${maksHari} hari ke depan untuk video yang diunggah ke penyimpanan bertanda tangan — tautan videonya tidak bisa dibuat berumur lebih dari itu.`
        : `Jadwal maksimal ${maksHari} hari ke depan. Periksa lagi tanggalnya.`,
    };
  }

  return { sah: true, iso: new Date(t).toISOString() };
}
