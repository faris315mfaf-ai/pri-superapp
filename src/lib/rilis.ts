// ============================================================
// RILIS 2.1 (7 Okt 2026) — tampilan baru untuk SEMUA akun + verifikasi
// ulang akun + tutorial wajib sekali. Aman server & klien.
//
// Sebelum RILIS_21_PADA hanya akun uji coba Faris (#4, #176) yang
// mendapatkannya (master sudah memakai desain baru sejak 6 Okt). Begitu
// jam rilis lewat, aplikasi yang sedang terbuka memuat ulang sendiri
// (page.tsx) dan seluruh pengguna langsung masuk alur pembaruan.
//
// Jam dibandingkan dengan JAM SERVER (selisih dicatat sekali saat aplikasi
// dibuka, lihat catatJamServer) — jam HP pengguna bisa salah.
// ============================================================

import { peranTersembunyi } from "@/lib/peran";

/**
 * 7 Oktober 2026 pukul 12.30 WIB. Semula 15.00; dimajukan pemilik setelah
 * uji akun faris (#176) lulus pukul 12.25 — berlaku begitu ter-deploy.
 */
export const RILIS_21_PADA = Date.parse("2026-10-07T12:30:00+07:00");

/** #4 farismfaf dan #176 faris — mendapat 2.1 lebih dulu untuk uji coba. */
const AKUN_UJI_COBA_21 = new Set(["4", "176"]);

type AkunRilis = {
  id?: string | number | null;
  role?: string | null;
  superadmin?: boolean;
  verifikasi_21_pada?: string | null;
  tutorial_21_pada?: string | null;
} | null | undefined;

let selisihJamServer = 0;

/** Catat selisih jam perangkat vs server dari header Date sebuah respons. */
export function catatJamServer(headerDate: string | null | undefined): void {
  const server = Date.parse(headerDate ?? "");
  if (Number.isFinite(server)) selisihJamServer = server - Date.now();
}

/** Waktu sekarang menurut server (perkiraan, ±1 detik). */
export function kiniServer(): number {
  return Date.now() + selisihJamServer;
}

export function akunUjiCoba21(u: AkunRilis): boolean {
  return u?.id != null && AKUN_UJI_COBA_21.has(String(u.id));
}

/** Jam rilis 2.1 untuk semua akun sudah lewat? */
export function rilis21Umum(kini = kiniServer()): boolean {
  return kini >= RILIS_21_PADA;
}

/** Akun ini sudah mendapat 2.1 (uji coba lebih dulu, lainnya sejak jam rilis). */
export function rilis21Untuk(u: AkunRilis, kini = kiniServer()): boolean {
  return akunUjiCoba21(u) || rilis21Umum(kini);
}

/** Akun yang dibebaskan dari verifikasi & tutorial 2.1: master dan superadmin. */
export function bebasPembaruan21(u: AkunRilis): boolean {
  return u?.superadmin === true || peranTersembunyi(u?.role);
}

/** Masih harus menjalani alur pembaruan 2.1 (verifikasi / tutorial)? */
export function wajibPembaruan21(u: AkunRilis, kini = kiniServer()): boolean {
  if (!u || bebasPembaruan21(u) || !rilis21Untuk(u, kini)) return false;
  return !u.verifikasi_21_pada || !u.tutorial_21_pada;
}
