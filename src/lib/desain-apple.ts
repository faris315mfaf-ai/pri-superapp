// ============================================================
// DESAIN APPLE (6 Okt 2026) — uji coba tampilan khusus akun Faris,
// diperluas ke seluruh akun MASTER (7 Okt 2026).
//
// Akun ini boleh memilih tema Pagi/Sore/Malam ala Apple (material kaca,
// tipografi sistem, warna & bayangan macOS — globals.css
// `html[data-desain="apple"]`) atau Classic, serta navigasi Sidebar ↔ Dock
// macOS di layar lebar. Akun lain tidak berubah sama sekali.
// ============================================================

import type { Latar } from "@/hooks/use-latar-apple";

type AkunDesain = { id?: string | number | null; role?: string | null } | null | undefined;

/** #4 farismfaf (Master Shifu) dan #176 faris (M. Faris ahlul). */
const AKUN_UJI_COBA = new Set(["4", "176"]);

function akunUjiCoba(u: AkunDesain): boolean {
  return u?.id != null && AKUN_UJI_COBA.has(String(u.id));
}

export function bolehDesainApple(u: AkunDesain): boolean {
  return akunUjiCoba(u) || u?.role === "master";
}

/**
 * Tema bila pengguna belum pernah memilih: akun uji coba langsung Pagi
 * (sudah terbiasa), master lain mulai dari Classic — tampilan yang mereka
 * kenal — dan memilih sendiri di Profil.
 */
export function latarBawaan(u: AkunDesain): Latar {
  return akunUjiCoba(u) ? "pagi" : "classic";
}

/**
 * Tata letak LEBAR (7 Okt 2026): modul tampil sebagai dasbor berkolom di
 * tablet & PC (TV Official, Beranda, TVR Saya, Konten, Chat terbagi,
 * Profil dua kolom, panel notifikasi). Khusus akun master.
 */
export function tataLebar(u: { role?: string | null } | null | undefined): boolean {
  return u?.role === "master";
}

export type ModeNav = "sidebar" | "dock";
