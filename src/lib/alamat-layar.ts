// ============================================================
// ALAMAT PER LAYAR (16 Okt 2026) — logika MURNI pemetaan URL <-> layar aplikasi.
//
// Aplikasi tetap satu cangkang (src/app/page.tsx; src/app/[layar]/page.tsx memakai
// cangkang yang sama) dan tiap layar tetap dimuat hanya saat dibuka. Yang
// ditambahkan: alamat sendiri per layar, supaya muat ulang tetap di layar itu,
// link bisa dibagikan (pri-superapp.com/tvrsaya), dan riwayat peramban jelas.
//
// Hanya TAB (diperiksa izin peran oleh tabEfektif di cangkang) dan sub-layar
// PRIBADI yang aman dibuka siapa pun yang masuk. Sub-layar khusus pengurus
// (panel master, audit, kelola bot, ...) tidak punya alamat sendiri — URL-nya
// tetap alamat tab induknya, jadi mengetik alamat tidak membuka layar pengurus.
// ============================================================

import type { KunciTab } from "@/components/bottom-nav";

/** Alamat tiap tab ("" = akar "/"). */
export const ALAMAT_TAB: Record<KunciTab, string> = {
  beranda: "",
  konten: "konten",
  qc: "hr-center",
  acara: "acara",
  tv: "tv-rakyat",
  tvnas: "tv-nasional",
  tvrku: "tvrsaya",
  ruangbot: "ruangbot",
  dashboard: "dashboard",
  asisten: "asisten",
  chat: "chat",
  notifikasi: "notifikasi",
  profil: "profil",
};

/** Sub-layar pribadi tanpa parameter yang boleh dibuka lewat alamat. */
export const ALAMAT_SUB_LAYAR = {
  absensi: "absensi",
  "laporan-kerja": "laporan-kerja",
  "pengumuman-daftar": "pengumuman",
  "leaderboard-komen": "peringkat-komentar",
} as const;
export type SubLayarBeralamat = keyof typeof ALAMAT_SUB_LAYAR;

/** Alamat lama/alias yang diterima (diarahkan ke alamat bakunya). */
const ALIAS: Record<string, string> = {
  "tvr-saya": "tvrsaya",
  tvrku: "tvrsaya",
  "ruang-bot": "ruangbot",
  qc: "hr-center",
  hr: "hr-center",
  tv: "tv-rakyat",
  tvnas: "tv-nasional",
  beranda: "",
};

export type PosisiAlamat = { tab: KunciTab | null; subLayar: SubLayarBeralamat | null };

/** Segmen pertama path yang bersih (huruf kecil, tanpa garis miring), atau null bila lebih dari satu segmen. */
function segmen(pathname: string): string | null {
  const bagian = String(pathname || "/")
    .split("?")[0]!
    .split("#")[0]!
    .split("/")
    .filter(Boolean);
  if (bagian.length > 1) return null;
  let s = (bagian[0] ?? "").toLowerCase();
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }
  return ALIAS[s] ?? s;
}

/** Layar yang dimaksud sebuah alamat; null = alamat tidak dikenal (pakai posisi bawaan). */
export function posisiDariPath(pathname: string): PosisiAlamat | null {
  const s = segmen(pathname);
  if (s === null) return null;
  for (const [tab, alamat] of Object.entries(ALAMAT_TAB) as [KunciTab, string][]) {
    if (alamat === s) return { tab, subLayar: null };
  }
  for (const [nama, alamat] of Object.entries(ALAMAT_SUB_LAYAR) as [SubLayarBeralamat, string][]) {
    if (alamat === s) return { tab: null, subLayar: nama };
  }
  return null;
}

/** Alamat untuk posisi aplikasi: sub-layar beralamat menang, selain itu alamat tab. */
export function pathDariPosisi(tab: KunciTab, subLayar: string | null | undefined): string {
  if (subLayar && subLayar in ALAMAT_SUB_LAYAR) return `/${ALAMAT_SUB_LAYAR[subLayar as SubLayarBeralamat]}`;
  return `/${ALAMAT_TAB[tab] ?? ""}`;
}

/** Path saat ini berbeda dari yang semestinya (abaikan garis miring penutup & huruf besar). */
export function perluGantiPath(sekarang: string, semestinya: string): boolean {
  const rapi = (p: string) => (p.replace(/\/+$/, "") || "/").toLowerCase();
  return rapi(sekarang) !== rapi(semestinya);
}
