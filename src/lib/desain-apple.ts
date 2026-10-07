// ============================================================
// DESAIN APPLE (6 Okt 2026) — uji coba tampilan khusus akun Faris,
// diperluas ke seluruh akun MASTER (7 Okt 2026), lalu ke SEMUA akun sejak
// rilis 2.1 (7 Okt 2026 15.00 WIB, lib/rilis).
//
// Akun ini boleh memilih tema Pagi/Sore/Malam ala Apple (material kaca,
// tipografi sistem, warna & bayangan macOS — globals.css
// `html[data-desain="apple"]`) atau Classic, serta navigasi Sidebar ↔ Dock
// macOS di layar lebar. Akun lain tidak berubah sama sekali.
// ============================================================

import type { Latar } from "@/hooks/use-latar-apple";
import { rilis21Umum, rilis21Untuk } from "@/lib/rilis";

type AkunDesain = { id?: string | number | null; role?: string | null } | null | undefined;

/** #4 farismfaf (Master Shifu) dan #176 faris (M. Faris ahlul). */
const AKUN_UJI_COBA = new Set(["4", "176"]);

function akunUjiCoba(u: AkunDesain): boolean {
  return u?.id != null && AKUN_UJI_COBA.has(String(u.id));
}

export function bolehDesainApple(u: AkunDesain): boolean {
  return akunUjiCoba(u) || u?.role === "master" || rilis21Untuk(u);
}

/**
 * DESAIN BARU (7 Okt 2026, dari mockup lokal): latar hidup (harimau per
 * tema), Dock di HP/tablet, animasi pegas, Beranda baru dengan dompet
 * Token Merah Putih, TVR Saya bersegmen. Hanya tampilan — bukan pemberian
 * izin. Akun uji coba Faris (#4, #176) + seluruh akun master.
 */
export function desainBaru(u: AkunDesain): boolean {
  return akunUjiCoba(u) || u?.role === "master" || rilis21Untuk(u);
}

/**
 * Tema bila pengguna belum pernah memilih: akun uji coba langsung Pagi
 * (sudah terbiasa), master lain mulai dari Classic — tampilan yang mereka
 * kenal — dan memilih sendiri di Profil.
 */
export function latarBawaan(u: AkunDesain): Latar {
  // Sejak rilis 2.1 semua anggota mulai dari Pagi (tutorial memperkenalkan
  // keempat tema); master tetap Classic sampai memilih sendiri.
  return akunUjiCoba(u) || (rilis21Umum() && u?.role !== "master") ? "pagi" : "classic";
}

/**
 * Tata letak LEBAR (7 Okt 2026): modul tampil sebagai dasbor berkolom di
 * tablet & PC (TV Official, Beranda, TVR Saya, Konten, Chat terbagi,
 * Profil dua kolom, panel notifikasi). Akun master + akun uji coba Faris.
 */
export function tataLebar(u: AkunDesain): boolean {
  return u?.role === "master" || akunUjiCoba(u) || rilis21Untuk(u);
}

export type ModeNav = "sidebar" | "dock";
