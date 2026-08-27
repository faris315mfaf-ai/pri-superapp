"use client";

// ============================================================
// KoinChip — saldo koin gamifikasi dengan ikon KMP (spek 1.16).
// Tampil di profil (di bawah nama anggota) dan popup profil.
// ============================================================

import { formatAngkaRingkas } from "@/lib/format";

export function KoinChip({ saldo, className }: { saldo: number; className?: string }) {
  return (
    <span
      className={
        "glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 " +
        (className ?? "")
      }
      title={`${saldo} koin`}
      aria-label={`Saldo ${saldo} koin`}
    >
      {/* Ikon koin resmi dari public/KMP.svg (permintaan user) */}
      <img src="/KMP.svg" alt="" aria-hidden="true" className="h-5 w-5" />
      <span className="angka-tab text-sm font-extrabold text-teks-utama">
        {formatAngkaRingkas(saldo)}
      </span>
      <span className="text-[10.5px] font-semibold text-teks-sekunder">Koin</span>
    </span>
  );
}
