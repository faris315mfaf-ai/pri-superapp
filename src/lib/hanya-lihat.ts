// ============================================================
// SUPERUSER = MODE LIHAT (16 Okt 2026). Peran DB "superuser" dilihat sesi
// sebagai master + penanda `superadmin` & `superuser` (lib/sesi keUserPublik):
// ia MELIHAT seluruh aplikasi seperti superadmin, tapi tidak boleh mengubah
// apa pun. Penjaganya satu, di pintu depan (src/proxy.ts): semua permintaan
// /api selain GET/HEAD ditolak, kecuali daftar kecil di bawah — hal yang
// tetap perlu bagi seorang pemirsa (keluar, tandai notifikasi dibaca, push,
// preferensi tampilan, keamanan akunnya sendiri, orientasi wajib).
// /api/autoedit tidak lewat proxy: gateway-nya memeriksa sendiri.
// Murni (tanpa I/O) supaya bisa diuji: tests/uji-hanya-lihat.mts.
// ============================================================

export const PESAN_HANYA_LIHAT = "Akun Superuser hanya bisa melihat — perubahan data tidak diizinkan.";

type Aturan = { metode: readonly string[] | "*"; jalur: RegExp };

const BOLEH: readonly Aturan[] = [
  // Masuk/keluar & sesi
  { metode: "*", jalur: /^\/api\/(login|otp|wajah\/masuk|webauthn\/masuk)(\/|$)/ },
  { metode: ["DELETE"], jalur: /^\/api\/sesi\/?$/ },
  // Notifikasi dibaca & langganan push
  { metode: ["PATCH"], jalur: /^\/api\/notifikasi\/?$/ },
  { metode: "*", jalur: /^\/api\/push\/langganan\/?$/ },
  // Preferensi tampilan (tab tersembunyi, tata letak, latar) — milik akunnya sendiri
  { metode: ["POST"], jalur: /^\/api\/preferensi\/?$/ },
  // Laporan crash klien
  { metode: ["POST"], jalur: /^\/api\/log-klien\/?$/ },
  // Orientasi wajib 2.1 & verifikasi WA (tanpa ini akun tertahan di layar wajib)
  { metode: "*", jalur: /^\/api\/pembaruan-21\/?$/ },
  { metode: ["POST"], jalur: /^\/api\/verifikasi\/wa-nomor(\/|$)/ },
  // Keamanan akun sendiri: sandi, sidik jari/kunci, wajah
  { metode: "*", jalur: /^\/api\/(sandi|webauthn\/daftar|wajah\/daftar)(\/|$)/ },
];

/** true bila permintaan ini boleh dijalankan akun Superuser. */
export function bolehTulisSuperuser(metode: string, jalur: string): boolean {
  const m = metode.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  const p = jalur.split("?")[0] ?? "";
  return BOLEH.some((a) => a.jalur.test(p) && (a.metode === "*" || a.metode.includes(m)));
}
