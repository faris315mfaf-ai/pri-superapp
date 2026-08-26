// ============================================================
// Modul per-divisi (spek 1.14 bagian 1.5).
//
// Semua akun punya tab dasar yang sama; tiap divisi mendapat SATU
// modul tambahan. Menambah divisi bermodul baru pada update
// berikutnya cukup MENAMBAH SATU BARIS di daftar ini — jangan
// menulis if-else divisi di tempat lain.
// ============================================================

import type { KunciTab } from "@/components/bottom-nav";

export const MODUL_DIVISI: { divisi: string; tab: KunciTab; label: string }[] = [
  // Divisi QC → HR Center (nama baru "QC Konten")
  { divisi: "Divisi Admin Medsos & QC Konten", tab: "qc", label: "HR Center" },
  // Divisi TV Rakyat → TV Rakyat Ofc (nama baru "TV Rakyat Official")
  { divisi: "Divisi TV Rakyat", tab: "tv", label: "TV Rakyat Ofc" },
  // Divisi Acara → modul Acara (tanggal penting partai)
  { divisi: "Divisi Acara", tab: "acara", label: "Acara" },
];

/** Tab modul tambahan untuk sebuah divisi (null bila tidak ada). */
export function modulUntukDivisi(divisi: string | null | undefined): KunciTab | null {
  const d = (divisi ?? "").trim();
  if (!d) return null;
  return MODUL_DIVISI.find((m) => m.divisi === d)?.tab ?? null;
}
