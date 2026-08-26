"use client";

import type { KomponenIkon } from "@/types";
// ============================================================
// AksesCepatPanel — dua tombol kaca besar berdampingan:
// Modul QC Konten (aksen merah) & Otomatisasi TV (aksen emas).
// ============================================================

import { ShieldCheck, Tv } from "lucide-react";
import { SectionTitle } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";

type AksesCepatPanelProps = {
  onBukaModulQc: () => void;
  onBukaModulTv: () => void;
};

type TombolModul = {
  label: string;
  Ikon: KomponenIkon;
  gradien: string;
  bayangan: string;
  onBuka: () => void;
  ariaLabel: string;
};

export function AksesCepatPanel({ onBukaModulQc, onBukaModulTv }: AksesCepatPanelProps) {
  const tombol: TombolModul[] = [
    {
      label: "HR Center",
      Ikon: ShieldCheck,
      gradien: "linear-gradient(135deg, #DC2626, #B91C1C)",
      bayangan: "0 8px 18px rgba(220, 38, 38, 0.35)",
      onBuka: onBukaModulQc,
      ariaLabel: "Buka HR Center",
    },
    {
      label: "Otomatisasi TV",
      Ikon: Tv,
      gradien: "linear-gradient(135deg, #F59E0B, #D97706)",
      bayangan: "0 8px 18px rgba(245, 158, 11, 0.35)",
      onBuka: onBukaModulTv,
      ariaLabel: "Buka Modul Otomatisasi TV",
    },
  ];

  return (
    <section aria-label="Akses cepat">
      <SectionTitle judul="Akses Cepat" />
      <div className="grid grid-cols-2 gap-3">
        {tombol.map((t) => (
          <GlassCard
            key={t.label}
            onClick={t.onBuka}
            ariaLabel={t.ariaLabel}
            className="flex min-h-[84px] flex-col items-center justify-center gap-2.5 px-3 py-4 text-center"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: t.gradien, boxShadow: t.bayangan }}
              aria-hidden="true"
            >
              <t.Ikon className="h-5 w-5 text-white" />
            </span>
            <span className="font-heading text-sm leading-tight font-bold text-teks-utama">
              {t.label}
            </span>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
