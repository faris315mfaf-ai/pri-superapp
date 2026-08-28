"use client";

// ============================================================
// GrafikAbsensi — pie distribusi status + bar per divisi (spek 2.4).
// Recharts (pustaka chart yang sudah dipakai proyek utk TrendChart);
// interaktif: hover menampilkan detail lewat Tooltip.
// ============================================================

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard } from "@/components/glass-card";
import type { BarisAbsenHarian } from "./absensi-hari-ini-screen";

const WARNA_STATUS: Record<string, string> = {
  Hadir: "#10B981",
  Alfa: "#DC2626",
  Izin: "#F59E0B",
  Sakit: "#FB923C",
};

export function GrafikAbsensi({ baris }: { baris: BarisAbsenHarian[] }) {
  const dataPie = useMemo(() => {
    const hitung = { Hadir: 0, Alfa: 0, Izin: 0, Sakit: 0 };
    for (const b of baris) {
      if (b.status === "hadir") hitung.Hadir += 1;
      else if (b.status === "alfa") hitung.Alfa += 1;
      else if (b.status === "izin") hitung.Izin += 1;
      else hitung.Sakit += 1;
    }
    return Object.entries(hitung)
      .filter(([, n]) => n > 0)
      .map(([name, value]) => ({ name, value }));
  }, [baris]);

  const dataBar = useMemo(() => {
    const per = new Map<string, { divisi: string; hadir: number; belum: number }>();
    for (const b of baris) {
      const kunci = (b.divisi || "Tanpa divisi").replace(/^Divisi /, "");
      const ada = per.get(kunci) ?? { divisi: kunci, hadir: 0, belum: 0 };
      if (b.status === "hadir") ada.hadir += 1;
      else ada.belum += 1;
      per.set(kunci, ada);
    }
    return Array.from(per.values()).sort((a, b) => b.hadir + b.belum - (a.hadir + a.belum));
  }, [baris]);

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {/* Pie distribusi status */}
      <GlassCard className="p-3">
        <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
          Distribusi Status
        </p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dataPie}
                dataKey="value"
                nameKey="name"
                innerRadius={38}
                outerRadius={62}
                paddingAngle={2}
                strokeWidth={0}
              >
                {dataPie.map((d) => (
                  <Cell key={d.name} fill={WARNA_STATUS[d.name] ?? "#94A3B8"} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, nama: string) => [`${v} orang`, nama]}
                contentStyle={{ borderRadius: 12, fontSize: 12 }}
              />
              <Legend
                iconSize={9}
                formatter={(v: string) => (
                  <span style={{ fontSize: 11 }}>{v}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Bar absensi per divisi */}
      <GlassCard className="p-3">
        <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
          Absensi Per Divisi
        </p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataBar} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <XAxis
                dataKey="divisi"
                tick={{ fontSize: 8.5 }}
                interval={0}
                angle={-28}
                textAnchor="end"
                height={44}
              />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                formatter={(v: number, nama: string) => [
                  `${v} orang`,
                  nama === "hadir" ? "Hadir" : "Belum absen",
                ]}
                contentStyle={{ borderRadius: 12, fontSize: 12 }}
              />
              <Bar dataKey="hadir" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="belum" stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>
    </div>
  );
}
