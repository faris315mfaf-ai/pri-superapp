// ============================================================
// MODE SIMPEL PRI SUPERAPP (4 Sep 2026) — sakelar per PERANGKAT.
//
// Mode simpel = versi sangat ringan aplikasi: halaman /simpel dengan
// tombol-tombol besar (KPI, absen, komen, upload, laporan, postingan,
// pengaturan). Saat menyala, pohon aplikasi utama TIDAK dimuat sama
// sekali — robot melayang, running text, kembang api, tutorial, chat
// realtime, polling notifikasi, dsb. otomatis berhenti karena tidak ada.
//
// Penanda disimpan di localStorage (bukan server): mode ini soal
// kemampuan PERANGKAT, jadi HP lemot bisa simpel sementara laptop tetap
// lengkap. Skrip inline di layout.tsx membaca kunci ini sebelum React
// jalan supaya halaman "/" langsung dialihkan tanpa memuat aplikasi berat.
// ============================================================

export const KUNCI_MODE_SIMPEL = "pri-mode-simpel";
const KUNCI_TOKEN_LOKAL = "pri-token-perangkat";

/** true bila perangkat ini memilih Mode Simpel. */
export function modeSimpelAktif(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KUNCI_MODE_SIMPEL) === "1";
  } catch {
    return false;
  }
}

/** Tandai perangkat ini memakai Mode Simpel (tanpa berpindah halaman). */
export function tandaiModeSimpel(nyala: boolean): void {
  try {
    if (nyala) window.localStorage.setItem(KUNCI_MODE_SIMPEL, "1");
    else window.localStorage.removeItem(KUNCI_MODE_SIMPEL);
  } catch {
    // localStorage terblokir: mode hanya berlaku sampai halaman ditutup.
  }
}

/** Nyalakan Mode Simpel lalu pindah ke /simpel (dipanggil tombol di header modul). */
export function nyalakanModeSimpel(): void {
  tandaiModeSimpel(true);
  window.location.replace("/simpel");
}

/** Matikan Mode Simpel lalu kembali ke aplikasi lengkap. */
export function matikanModeSimpel(): void {
  tandaiModeSimpel(false);
  window.location.replace("/");
}

/** Ada token perangkat tersimpan? (dipakai penjaga alih halaman, bukan pemeriksa sesi). */
export function adaTokenLokal(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage.getItem(KUNCI_TOKEN_LOKAL));
  } catch {
    return false;
  }
}
