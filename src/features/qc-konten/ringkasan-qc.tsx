"use client";

// ============================================================
// RingkasanQc — angka kepatuhan yang dulu tinggal di dashboard
// super admin, dipindah ke modul QC Konten (tempat asalnya data):
// - 3 kartu KPI: tingkat kepatuhan, postingan dipantau, kader
//   belum komentar
// - Tren kepatuhan 7 periode
// - Kepatuhan per akun wajib
//
// Memuat sendiri dari /api/dashboard supaya layar QC tidak perlu
// menggandeng state dashboard.
// ============================================================

import { useEffect, useState } from "react";
import { FadeInUp, GlassSkeleton } from "@/components/pri-ui";
import { getDashboard, type DashboardData } from "@/services";
import dynamic from "next/dynamic";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { KepatuhanAkunCard } from "@/features/dashboard/kepatuhan-akun-card";

// TrendChart menggandeng recharts (±100KB+) — dimuat MALAS tanpa SSR
// supaya tidak membebani bundle awal; tampilannya sama persis begitu
// termuat, hanya kerangkanya yang tampil sekejap.
const TrendChart = dynamic(
  () => import("@/features/dashboard/trend-chart").then((m) => m.TrendChart),
  { ssr: false, loading: () => <GlassSkeleton className="h-[252px] rounded-2xl" /> },
);

export function RingkasanQc({ muatUlang = 0 }: { muatUlang?: number }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getDashboard();
        if (hidup) setData(hasil);
      } catch {
        if (hidup) setGagal(true);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  // Gagal memuat ringkasan tidak boleh mengganggu fungsi utama QC.
  if (gagal) return null;

  if (data === null) {
    return <GlassSkeleton className="mt-4 h-40 rounded-2xl" />;
  }

  // Kartu "Video Diproses" (kpi-4) memang tidak ikut — itu urusan TV.
  const kpiQc = data.kpi.filter((k) => k.id !== "kpi-4");

  return (
    <div className="mt-4 flex flex-col gap-4">
      <FadeInUp>
        <div className="grid grid-cols-3 gap-2.5">
          {kpiQc.map((kpi, i) => (
            <KpiCard key={kpi.id} kpi={kpi} delay={0.04 + i * 0.04} />
          ))}
        </div>
      </FadeInUp>
      <FadeInUp delay={0.06}>
        <TrendChart data={data.tren} />
      </FadeInUp>
      <FadeInUp delay={0.1}>
        <KepatuhanAkunCard data={data.kepatuhanAkun} />
      </FadeInUp>
    </div>
  );
}
