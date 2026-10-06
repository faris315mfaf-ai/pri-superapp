"use client";

// ============================================================
// KoinChip — saldo koin gamifikasi dengan ikon KMP (spek 1.16).
// Tampil di profil (di bawah nama anggota) dan popup profil.
// ============================================================

import { formatAngkaRingkas } from "@/lib/format";
import { useAppStore } from "@/hooks/use-app-store";
import { desainBaru } from "@/lib/desain-apple";

export function KoinChip({ saldo, className }: { saldo: number; className?: string }) {
  // Desain baru (7 Okt 2026): koin tampil sebagai Token Merah Putih (TMP).
  const tmp = useAppStore((s) => desainBaru(s.user));
  if (tmp) {
    return (
      <span className={"glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 " + (className ?? "")} title={`${saldo} TMP`} aria-label={`Saldo ${saldo} Token Merah Putih`}>
        <span aria-hidden="true" className="relative inline-flex h-5 w-5 overflow-hidden rounded-full ring-1 ring-black/10">
          <span className="absolute inset-x-0 top-0 h-1/2 bg-[#E11D2E]" />
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-white" />
        </span>
        <span className="angka-tab text-sm font-extrabold text-teks-utama">{formatAngkaRingkas(saldo)}</span>
        <span className="text-[10.5px] font-semibold text-teks-sekunder">TMP</span>
      </span>
    );
  }
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
