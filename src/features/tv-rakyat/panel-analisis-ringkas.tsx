"use client";

// ============================================================
// PanelAnalisisRingkas (29 Sep 2026) — pintu masuk Analisis Video di
// TV Rakyat Nasional: tiga angka 30 hari terakhir + tombol halaman penuh.
// Sengaja tanpa grafik (recharts hanya dimuat di halaman penuhnya).
// ============================================================

import { useEffect, useState } from "react";
import { ChevronRight, LineChart } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { formatAngkaRingkas } from "@/lib/format";
import { getAnalisisVideo, type DataAnalisisVideo } from "@/services";

type Data = Extract<DataAnalisisVideo, { dimuat_pada: string }>;

export function PanelAnalisisRingkas({ onBuka }: { onBuka: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [coba, setCoba] = useState(0);

  useEffect(() => {
    let hidup = true;
    let ulang: ReturnType<typeof setTimeout> | undefined;
    getAnalisisVideo({ rentang: "30" })
      .then((d) => {
        if (!hidup) return;
        if ("dimuat_pada" in d) setData(d);
        // Katalog baru disusun (pertama kali setelah server dinyalakan).
        else if (coba < 10) ulang = setTimeout(() => setCoba((n) => n + 1), 5000);
      })
      .catch(() => {
        // Kartu ringkas: gagal = angka tidak tampil; halaman penuh memberi pesan galatnya.
      });
    return () => {
      hidup = false;
      clearTimeout(ulang);
    };
  }, [coba]);

  const r = data?.ringkas;
  return (
    <GlassCard className="p-4">
      <button type="button" onClick={onBuka} className="btn-tekan block w-full text-left">
        <div className="flex items-start gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{ background: "linear-gradient(135deg, #0EA5E9, #7C3AED)" }}
            aria-hidden="true"
          >
            <LineChart className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-[15px] font-bold text-teks-utama">Analisis Video</p>
            <p className="mt-0.5 text-[11px] text-teks-sekunder">Tren, akun terbaik, platform & jam posting terbaik</p>
          </div>
          <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-teks-sekunder" aria-hidden="true" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {r ? (
            <>
              <Mini label="Video 30 hari" nilai={formatAngkaRingkas(r.video)} />
              <Mini label="Tayangan" nilai={formatAngkaRingkas(r.tayangan)} />
              <Mini label="Rata-rata" nilai={formatAngkaRingkas(r.rata_tayangan)} />
            </>
          ) : (
            [0, 1, 2].map((i) => <GlassSkeleton key={i} className="h-12 rounded-2xl" />)
          )}
        </div>
      </button>
    </GlassCard>
  );
}

function Mini({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="glass-soft min-w-0 rounded-2xl px-2.5 py-2">
      <p className="truncate text-[9.5px] font-semibold tracking-wide text-teks-sekunder uppercase">{label}</p>
      <p className="angka-tab font-heading text-base leading-tight font-extrabold text-teks-utama">{nilai}</p>
    </div>
  );
}
