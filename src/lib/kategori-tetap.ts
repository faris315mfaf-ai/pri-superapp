// ============================================================
// KATEGORI TETAP (12 Sep 2026)
//
// Kategori yang selalu ada, apa pun isi tabel keyword_wajib. Tinggal di
// kode, bukan di database: tidak bisa terhapus, tidak ikut hilang kalau
// tabelnya dikosongkan, dan tidak perlu dipasang ulang di server baru.
//
// "Video Sendiri" = video buatan anggota di luar perintah/tema mana pun.
// Tanpa kategori ini, anggota yang membuat video atas inisiatifnya
// sendiri terpaksa memilih tema yang tidak cocok — dan pengelompokannya
// jadi keliru sejak awal.
//
// Dipakai server (/api/tv/keyword) DAN klien, jadi berkas ini tidak
// boleh mengimpor apa pun yang khusus server.
// ============================================================

export const KATEGORI_TETAP = ["Video Sendiri"] as const;

const AWALAN_ID = "tetap:";

export const kategoriTetap = {
  /** id sintetis, supaya bentuknya seragam dengan baris database. */
  id(nama: string): string {
    return AWALAN_ID + nama.toLowerCase().replace(/\s+/g, "-");
  },
  /** true bila id ini milik kategori tetap (bukan baris database). */
  adalahId(id: string): boolean {
    return id.startsWith(AWALAN_ID);
  },
  /** true bila nama ini (tanpa peduli huruf besar/kecil) kategori tetap. */
  adalah(nama: string): boolean {
    const n = nama.trim().toLowerCase();
    return KATEGORI_TETAP.some((k) => k.toLowerCase() === n);
  },
};
