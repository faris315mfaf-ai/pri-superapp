// ============================================================
// Peran tersembunyi & pengurus pusat (10 Sep 2026) — aman server & klien.
//
// Dua akun sistem TIDAK boleh muncul di layar mana pun (roster,
// leaderboard, database anggota, penerima pengumuman, tim, dst.):
//   - master     : pemilik sistem (tersembunyi sejak awal).
//   - superadmin : akun operasional pusat — Dashboard penuh (absensi, KPI
//                  anggota, kepatuhan komen, TV Rakyat, database anggota,
//                  TV Rakyat Nasional) + Konten penuh; TANPA modul TV
//                  Rakyat Official, chat, robot, dan perintah suara.
//
// Dulu tiap query menulis `.neq("role", "master")` sendiri-sendiri (16
// tempat). Sekarang satu konstanta, supaya peran tersembunyi berikutnya
// cukup ditambahkan di sini.
// ============================================================

import { adalahPimred } from "@/lib/jabatan";

export const PERAN_TERSEMBUNYI = ["master", "superadmin"] as const;

/** Nilai untuk `.not("role", "in", PERAN_TERSEMBUNYI_IN)` di supabase-js. */
export const PERAN_TERSEMBUNYI_IN = `(${PERAN_TERSEMBUNYI.join(",")})`;

export function peranTersembunyi(role?: string | null): boolean {
  return (PERAN_TERSEMBUNYI as readonly string[]).includes(role ?? "");
}

export function adalahSuperadmin(u: { role?: string | null; superadmin?: boolean } | null | undefined): boolean {
  return u?.superadmin === true || u?.role === "superadmin";
}

/**
 * Master SESUNGGUHNYA (24 Sep 2026) — bukan superadmin yang dipetakan ke
 * peran master. Dipakai Panel Master & pemberian jabatan Superadmin:
 * dua hal yang hanya boleh dilakukan pemilik sistem.
 */
export function adalahMasterAsli(u: { role?: string | null; superadmin?: boolean } | null | undefined): boolean {
  return u?.role === "master" && u?.superadmin !== true;
}

/**
 * master / super_admin (Ketua Umum) / superadmin — pemegang data lintas
 * anggota (dashboard penuh, kelola laporan KPI, rekap semua anggota).
 */
export function adalahPengurusPusat(u: { role?: string | null } | null | undefined): boolean {
  const r = u?.role ?? "";
  return r === "master" || r === "super_admin" || r === "superadmin";
}

// ------------------------------------------------------------
// MODUL PER AKUN (10 Sep 2026): master membuka/menutup modul saat membuat
// akun di Panel Master. Disimpan di app_user.modul_izin (jsonb):
//   { dashboard: true, qc: false, ... }   true = dibuka, false = ditutup,
//   tidak ada / null = mengikuti peran & jabatan seperti biasa.
// Dipakai page.tsx (tab), dashboard-akses, hr, tv-tim, asisten (server).
// ------------------------------------------------------------
export const MODUL_AKUN = [
  { kunci: "dashboard", label: "Dashboard", keterangan: "Absensi, KPI anggota, kepatuhan komen, TV Rakyat, database, TV Nasional" },
  { kunci: "qc", label: "HR Center", keterangan: "Database anggota, absensi, KPI, kirim pengumuman" },
  { kunci: "tv", label: "TV Rakyat Official", keterangan: "Produksi & unggah video resmi" },
  { kunci: "tvnas", label: "TV Rakyat Nasional", keterangan: "Modul gabungan: angka nasional + seluruh kendali TV Rakyat Official" },
  { kunci: "tvrku", label: "TVR Saya", keterangan: "Akun sosmed pribadi & laporan video" },
  { kunci: "chat", label: "Chat", keterangan: "Percakapan antar anggota" },
  { kunci: "asisten", label: "Asisten AI", keterangan: "Chatbot & perintah suara" },
  { kunci: "acara", label: "Acara", keterangan: "Tanggal penting partai" },
  // Bukan tab (30 Sep 2026): seksi di dalam TVR Saya. Sejak 5 Okt 2026
  // terbuka sendiri bila minimal 5 akun sosmed terhubung; master tetap bisa
  // membuka paksa (true) atau menutup paksa (false) per akun.
  {
    kunci: "autoedit",
    label: "Edit Otomatis (TVR Saya)",
    keterangan: "Template pribadi + edit video otomatis. Ikut peran = terbuka sendiri bila ≥5 akun sosmed terhubung",
    bukanTab: true,
  },
  // Alat video TVR Saya (5 Okt 2026): dibuka untuk SEMUA akun; master bisa
  // menutup per akun (false). Ikut peran = terbuka.
  {
    kunci: "kompres",
    label: "Kompres Video (TVR Saya)",
    keterangan: "Perkecil video (ab-av1 + VMAF), hasil ke Stok Video. Ikut peran = terbuka",
    bukanTab: true,
  },
  {
    kunci: "hapuslatar",
    label: "Hapus Latar Boom (TVR Saya)",
    keterangan: "Buang latar video Boom like share di editor template (rembg). Ikut peran = terbuka",
    bukanTab: true,
  },
  {
    kunci: "blurwm",
    label: "Blur Watermark (TVR Saya)",
    keterangan: "Samarkan area watermark video (blur/mosaik/halus), hasil ke Stok Video. Ikut peran = terbuka",
    bukanTab: true,
  },
] as const;

export type KunciModul = (typeof MODUL_AKUN)[number]["kunci"];
export type ModulIzin = Partial<Record<KunciModul, boolean>>;

const KUNCI_MODUL_SAH = new Set<string>(MODUL_AKUN.map((m) => m.kunci));

/** true = dibuka master, false = ditutup master, undefined = ikut peran. */
export function modulDibuka(
  u: { modul_izin?: unknown } | null | undefined,
  kunci: KunciModul,
): boolean | undefined {
  const izin = u?.modul_izin;
  if (!izin || typeof izin !== "object" || Array.isArray(izin)) return undefined;
  const v = (izin as Record<string, unknown>)[kunci];
  return typeof v === "boolean" ? v : undefined;
}

/**
 * Alat video TVR Saya (Kompres Video, Hapus Latar Boom, Blur Watermark):
 * terbuka untuk semua akun sejak 5 Okt 2026, kecuali master menutupnya per
 * akun (modul_izin = false). Master selalu boleh.
 */
export function bolehAlatVideo(
  u: { role?: string | null; modul_izin?: unknown } | null | undefined,
  kunci: "kompres" | "hapuslatar" | "blurwm",
): boolean {
  if (!u) return false;
  return u.role === "master" || modulDibuka(u, kunci) !== false;
}

/**
 * Pengelola koin (5 Okt 2026): memberi koin per video & me-reset koin orang
 * lain. Pimpinan Redaksi, superadmin, dan master (adalahPimred sudah
 * menganggap master — termasuk superadmin yang di sesi berperan master).
 */
export function bolehKelolaKoin(
  u: { role?: string | null; jabatan?: string | null; superadmin?: boolean } | null | undefined,
): boolean {
  if (!u) return false;
  return adalahSuperadmin(u) || adalahPimred({ role: u.role ?? undefined, jabatan: u.jabatan });
}

/** Akun sosmed terhubung (sehat) minimal untuk membuka Edit Otomatis. */
export const MINIMAL_AKUN_EDIT_OTOMATIS = 5;

/**
 * Edit Otomatis di TVR Saya. Master selalu boleh. Modul per akun dari master
 * menang: dibuka (true) = boleh, ditutup (false) = tidak. Selain itu (ikut
 * peran) terbuka sendiri bila akun sosmed terhubung yang SEHAT — tertaut dan
 * tidak perlu login ulang — minimal MINIMAL_AKUN_EDIT_OTOMATIS (5 Okt 2026).
 * `jumlahTerhubung` belum diketahui (null) = anggap belum memenuhi.
 */
export function bolehEditOtomatisTvr(
  u: { role?: string | null; modul_izin?: unknown } | null | undefined,
  jumlahTerhubung: number | null | undefined,
): boolean {
  if (u?.role === "master") return true;
  const izin = modulDibuka(u, "autoedit");
  if (izin !== undefined) return izin;
  return (jumlahTerhubung ?? 0) >= MINIMAL_AKUN_EDIT_OTOMATIS;
}

/** Saring masukan mentah jadi peta modul yang sah; null bila kosong. */
export function bersihkanModulIzin(mentah: unknown): ModulIzin | null {
  if (!mentah || typeof mentah !== "object" || Array.isArray(mentah)) return null;
  const hasil: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(mentah as Record<string, unknown>)) {
    if (KUNCI_MODUL_SAH.has(k) && typeof v === "boolean") hasil[k] = v;
  }
  return Object.keys(hasil).length > 0 ? (hasil as ModulIzin) : null;
}
