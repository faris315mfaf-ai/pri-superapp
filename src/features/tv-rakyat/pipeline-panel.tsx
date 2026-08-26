"use client";

// ============================================================
// PipelinePanel — kartu status pipeline video yang dulu tinggal
// di dashboard super admin, dipindah ke modul TV Rakyat official.
// Memuat ringkasannya sendiri dari /api/video-antrian.
// ============================================================

import { useEffect, useState } from "react";
import { GlassSkeleton } from "@/components/pri-ui";
import dynamic from "next/dynamic";
import { getVideoAntrian } from "@/services";

// Donut status memakai recharts — dimuat malas tanpa SSR supaya
// bundle awal aplikasi tidak ikut menanggung pustaka grafiknya.
const PipelineVideoCard = dynamic(
  () =>
    import("@/features/dashboard/pipeline-video-card").then(
      (m) => m.PipelineVideoCard,
    ),
  { ssr: false, loading: () => <GlassSkeleton className="h-28 rounded-2xl" /> },
);

export function PipelinePanel({ muatUlang = 0 }: { muatUlang?: number }) {
  const [ringkasan, setRingkasan] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getVideoAntrian();
        if (hidup) setRingkasan(hasil.ringkasan);
      } catch {
        // Kartunya pelengkap — gagal memuat cukup tampil kosong.
        if (hidup) setRingkasan({});
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  if (ringkasan === null) return <GlassSkeleton className="h-28 rounded-2xl" />;
  return <PipelineVideoCard ringkasan={ringkasan} />;
}
