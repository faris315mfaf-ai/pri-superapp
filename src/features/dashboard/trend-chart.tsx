"use client";

// ============================================================
// TrendChart — tren kepatuhan 7 hari (AreaChart recharts).
// Gradient merah, tooltip kaca kustom, dan titik akhir
// ditekankan dengan ReferenceDot + label nilai.
// ============================================================

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";
import { EmptyState } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";

type TrendChartProps = {
  data: { hari: string; nilai: number }[];
};

type TooltipTrenProps = {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string;
};

/** Tooltip kaca kecil: nama hari + nilai persen */
function TooltipTren({ active, payload, label }: TooltipTrenProps) {
  if (!active || !payload || payload.length === 0) return null;
  const nilai = payload[0]?.value;
  return (
    <div
      className="glass-strong rounded-xl px-3 py-1.5 text-center"
      style={{ borderColor: "rgba(220, 38, 38, 0.3)" }}
    >
      <p className="text-[10px] font-semibold tracking-wide text-teks-sekunder uppercase">
        {label}
      </p>
      <p className="angka-tab font-heading text-sm font-extrabold text-pri">{nilai}%</p>
    </div>
  );
}

export function TrendChart({ data }: TrendChartProps) {
  const titikAkhir = data[data.length - 1];

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-[15px] font-bold text-teks-utama">
            Tren Kepatuhan 7 Hari
          </h3>
          <p className="mt-0.5 text-[11px] text-teks-sekunder">
            Persentase kader yang patuh berkomentar
          </p>
        </div>
        {titikAkhir && (
          <div className="shrink-0 text-right">
            <p className="angka-tab font-heading text-2xl leading-none font-extrabold text-pri">
              {titikAkhir.nilai}%
            </p>
            <p className="mt-1 text-[10px] font-semibold tracking-wide text-teks-sekunder uppercase">
              Hari ini
            </p>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <EmptyState
          ikon={Activity}
          judul="Belum ada data tren"
          keterangan="Data tren kepatuhan 7 hari terakhir akan tampil di sini."
          className="py-6"
        />
      ) : (
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data} margin={{ top: 24, right: 20, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradTren" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#DC2626" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#DC2626" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 6"
                stroke="rgba(148, 163, 184, 0.2)"
              />
              <XAxis
                dataKey="hari"
                axisLine={false}
                tickLine={false}
                tickMargin={6}
                tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
              />
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                content={<TooltipTren />}
                cursor={{ stroke: "rgba(220, 38, 38, 0.2)", strokeWidth: 1.5 }}
              />
              <Area
                type="monotone"
                dataKey="nilai"
                stroke="#DC2626"
                strokeWidth={2.5}
                fill="url(#gradTren)"
                activeDot={{ r: 5, stroke: "#FFFFFF", strokeWidth: 2 }}
              />
              {titikAkhir && (
                <ReferenceDot
                  x={titikAkhir.hari}
                  y={titikAkhir.nilai}
                  r={6}
                  fill="#DC2626"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  isFront
                  label={{
                    value: `${titikAkhir.nilai}%`,
                    position: "top",
                    fill: "#DC2626",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}
