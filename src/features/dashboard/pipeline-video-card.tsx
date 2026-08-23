"use client";

// ============================================================
// PipelineVideoCard — status pipeline video TV Rakyat.
// Kiri: donut kecil (recharts PieChart) dengan total di tengah.
// Kanan: legenda 4 baris (dot warna + label + jumlah).
// ============================================================

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Clapperboard } from "lucide-react";
import { EmptyState } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";

/** Segmen donut — urutan & warna sesuai spesifikasi desain */
const SEGMENT: { kunci: string; label: string; warna: string }[] = [
  { kunci: "MENUNGGU DOKSLI", label: "Menunggu Doksli", warna: "#F59E0B" },
  { kunci: "SEDANG DIPROSES", label: "Sedang Diproses", warna: "#3B82F6" },
  { kunci: "SUDAH DIPROSES", label: "Sudah Diposting", warna: "#10B981" },
  { kunci: "GAGAL", label: "Gagal", warna: "#EF4444" },
];

type PipelineVideoCardProps = {
  ringkasan: Record<string, number>;
};

export function PipelineVideoCard({ ringkasan }: PipelineVideoCardProps) {
  const segmen = SEGMENT.map((s) => ({ ...s, nilai: ringkasan[s.kunci] ?? 0 }));
  const total = segmen.reduce((jumlah, s) => jumlah + s.nilai, 0);

  return (
    <GlassCard className="p-4">
      <h3 className="font-heading text-[15px] font-bold text-teks-utama">
        Status Pipeline Video TV Rakyat
      </h3>

      {total === 0 ? (
        <EmptyState
          ikon={Clapperboard}
          judul="Belum ada video"
          keterangan="Video yang masuk ke pipeline TV Rakyat akan tampil di sini."
          className="py-6"
        />
      ) : (
        <div className="mt-3 flex items-center gap-4">
          {/* Donut + angka total di tengah (overlay absolut) */}
          <div className="relative h-[110px] w-[110px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segmen}
                  dataKey="nilai"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={32}
                  outerRadius={48}
                  paddingAngle={3}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {segmen.map((s) => (
                    <Cell key={s.kunci} fill={s.warna} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="angka-tab font-heading text-xl leading-none font-extrabold text-teks-utama">
                {total}
              </span>
              <span className="mt-1 text-[9px] font-semibold tracking-widest text-teks-sekunder uppercase">
                video
              </span>
            </div>
          </div>

          {/* Legenda 4 baris */}
          <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
            {segmen.map((s) => (
              <li key={s.kunci} className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.warna, boxShadow: `0 0 8px ${s.warna}66` }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-teks-utama">
                  {s.label}
                </span>
                <span className="angka-tab shrink-0 text-xs font-bold text-teks-utama">
                  {s.nilai}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
