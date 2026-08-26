"use client";

// ============================================================
// KpiCard — kartu KPI kaca kecil: ikon dalam lingkaran kaca
// lembut (aksen berbeda per kartu), angka besar, label, dan
// indikator tren dengan semantik "membaik" (hijau/sukses).
// ============================================================

import { motion } from "framer-motion";
import {
  Activity,
  Eye,
  MessageCircleOff,
  Target,
  TrendingDown,
  TrendingUp,
  Video,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import type { KomponenIkon, KpiItem } from "@/types";
import { cn } from "@/lib/utils";

/** Aksen warna ikon yang tersedia (satu per kartu, semuanya berbeda) */
type Aksen = "pri" | "emas" | "sukses" | "info";

const AKSEN: Record<Aksen, { kelasIkon: string; hex: string }> = {
  pri: { kelasIkon: "text-pri", hex: "#DC2626" },
  emas: { kelasIkon: "text-emas", hex: "#F59E0B" },
  sukses: { kelasIkon: "text-sukses", hex: "#10B981" },
  info: { kelasIkon: "text-info", hex: "#3B82F6" },
};

/** Pilih ikon + warna aksen berdasarkan label KPI */
function gayaKpi(label: string): { Ikon: KomponenIkon; aksen: Aksen } {
  const l = label.toLowerCase();
  if (l.includes("kepatuhan")) return { Ikon: Target, aksen: "pri" };
  if (l.includes("postingan")) return { Ikon: Eye, aksen: "emas" };
  if (l.includes("belum")) return { Ikon: MessageCircleOff, aksen: "info" };
  if (l.includes("video")) return { Ikon: Video, aksen: "sukses" };
  return { Ikon: Activity, aksen: "pri" };
}

type KpiCardProps = {
  kpi: KpiItem;
  /** Delay animasi kemunculan (detik) */
  delay?: number;
};

export function KpiCard({ kpi, delay = 0 }: KpiCardProps) {
  const { Ikon, aksen } = gayaKpi(kpi.label);
  const gaya = AKSEN[aksen];

  // "Kader Belum Komentar": TURUN = membaik. KPI lain: NAIK = membaik.
  const membaik = kpi.label.toLowerCase().includes("belum")
    ? kpi.arah === "turun"
    : kpi.arah === "naik";
  const IkonTren = kpi.arah === "naik" ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard className="flex h-full flex-col p-3.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: `${gaya.hex}1F`, border: `1px solid ${gaya.hex}40` }}
          aria-hidden="true"
        >
          <Ikon className={cn("h-4.5 w-4.5", gaya.kelasIkon)} />
        </span>

        <p className="angka-tab mt-2.5 font-heading text-2xl leading-none font-extrabold text-teks-utama">
          {kpi.nilai}
        </p>
        <p className="mt-1.5 text-[11px] leading-tight text-teks-sekunder">{kpi.label}</p>

        <p
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-bold",
            membaik ? "text-sukses" : "text-gagal",
          )}
        >
          <IkonTren className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="angka-tab">
            {kpi.arah === "naik" ? "+" : "-"}
            {kpi.delta}
            {kpi.satuan_delta}
          </span>
        </p>
      </GlassCard>
    </motion.div>
  );
}
