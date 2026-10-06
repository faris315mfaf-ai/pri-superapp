"use client";

// ============================================================
// PemilihLatar (6 Okt 2026) — Profil › Pengaturan › Display, akun uji coba.
// Empat tema: Pagi, Sore, Malam (desain Apple berlatar ilustrasi) dan
// Classic (tampilan asli aplikasi). Malam terkunci selama mode terang
// (aturan pemilik produk); diketuk saat terkunci = pengingat, bukan galat.
// ============================================================

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GambarMiniLatar } from "@/components/latar-apple";
import { useAppStore } from "@/hooks/use-app-store";
import { latarEfektif, useLatarApple, type Latar } from "@/hooks/use-latar-apple";
import { cn } from "@/lib/utils";

const PILIHAN: { id: Latar; nama: string; ket: string }[] = [
  { id: "pagi", nama: "Pagi", ket: "Gunung & danau" },
  { id: "sore", nama: "Sore", ket: "Pantai senja" },
  { id: "malam", nama: "Malam", ket: "Bulan & bintang" },
  { id: "classic", nama: "Classic", ket: "Tampilan asli" },
];

export function PemilihLatar() {
  const [latar, aturLatar] = useLatarApple();
  const gelap = useAppStore((s) => s.tema === "dark");
  const aktif = latarEfektif(latar, gelap);
  const [ingatkan, setIngatkan] = useState(false);

  return (
    <GlassCard className="p-3.5 md:col-span-2">
      <p className="px-0.5 text-sm font-semibold text-teks-utama">Tema tampilan</p>
      <div role="radiogroup" aria-label="Tema tampilan" className="mt-3 grid max-w-[520px] grid-cols-4 gap-2">
        {PILIHAN.map((p) => {
          const terkunci = p.id === "malam" && !gelap;
          const terpilih = p.id === aktif;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={terpilih}
              aria-disabled={terkunci}
              onClick={() => {
                if (terkunci) {
                  setIngatkan(true);
                  return;
                }
                setIngatkan(false);
                aturLatar(p.id);
              }}
              className={cn(
                "btn-tekan flex min-w-0 flex-col gap-1.5 text-left transition-opacity duration-300",
                terkunci ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              )}
            >
              <span
                className="relative block aspect-[3/4] overflow-hidden rounded-xl transition-shadow duration-300"
                style={{
                  boxShadow: terpilih
                    ? "0 0 0 3px #007AFF, 0 8px 20px rgba(0,0,0,0.18)"
                    : "0 0 0 0.5px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.12)",
                }}
              >
                <GambarMiniLatar latar={p.id} />
                {terkunci && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[#1D1D1F]">
                      <Lock className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </span>
                )}
                {terpilih && (
                  <span className="absolute top-1.5 right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#007AFF] text-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                )}
              </span>
              <span className="block px-0.5 text-center">
                <span className="block text-[13px] font-semibold text-teks-utama">{p.nama}</span>
                <span className="block text-[10.5px] leading-tight text-teks-sekunder">
                  {terkunci ? "Mode gelap saja" : p.ket}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p
        className={cn(
          "mt-3 px-0.5 text-[11.5px] leading-snug transition-colors duration-300",
          ingatkan && !gelap ? "font-semibold text-[#B93700] dark:text-[#FF9F0A]" : "text-teks-sekunder",
        )}
      >
        {aktif === "classic"
          ? "Classic: tampilan asli PRI SuperApp. Pilih Pagi, Sore, atau Malam untuk desain baru berlatar ilustrasi."
          : gelap
            ? "Semua tema tersedia. Pagi & Sore diredupkan di mode gelap."
            : "Tema Malam hanya bisa dipilih saat mode gelap — nyalakan Mode Tema di atas."}
      </p>
    </GlassCard>
  );
}
