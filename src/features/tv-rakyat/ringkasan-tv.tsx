"use client";

// ============================================================
// RingkasanTv (7 Okt 2026, tata letak master) — strip angka di puncak
// modul TV Rakyat Official: total, diposting, diproses, menunggu
// doksli, gagal. Sumbernya sama dengan Status Pipeline
// (/api/video-antrian → ringkasan per status, 100 video terakhir).
// ============================================================

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Film, Loader2, type LucideIcon } from "lucide-react";
import { GlassSkeleton } from "@/components/pri-ui";
import { getVideoAntrian } from "@/services";

type Ubin = {
  ikon: LucideIcon;
  warna: string;
  label: string;
  nilai: number;
  ket: string;
  persen?: number;
};

export function RingkasanTv({ muatUlang = 0 }: { muatUlang?: number }) {
  const [ringkasan, setRingkasan] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getVideoAntrian();
        if (hidup) setRingkasan(hasil.ringkasan);
      } catch {
        // Strip pelengkap — gagal memuat cukup tampil nol.
        if (hidup) setRingkasan({});
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  if (ringkasan === null) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <GlassSkeleton key={i} className="h-[104px] rounded-[20px]" />
        ))}
      </div>
    );
  }

  const total = Object.values(ringkasan).reduce((a, b) => a + b, 0);
  const diposting = ringkasan["SUDAH DIPROSES"] ?? 0;
  const persen = total > 0 ? Math.round((diposting * 100) / total) : 0;
  const ubin: Ubin[] = [
    { ikon: Film, warna: "#0A84FF", label: "Video tercatat", nilai: total, ket: "100 video terakhir" },
    { ikon: CheckCircle2, warna: "#30D158", label: "Diposting", nilai: diposting, ket: `${persen}% dari total`, persen },
    { ikon: Loader2, warna: "#5E5CE6", label: "Diproses", nilai: ringkasan["SEDANG DIPROSES"] ?? 0, ket: "Sedang dirender" },
    { ikon: Clock, warna: "#FF9F0A", label: "Menunggu Doksli", nilai: ringkasan["MENUNGGU DOKSLI"] ?? 0, ket: "Menunggu bahan" },
    { ikon: AlertTriangle, warna: "#FF453A", label: "Gagal", nilai: ringkasan["GAGAL"] ?? 0, ket: "Perlu diulangi" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {ubin.map((u) => (
        <div key={u.label} className="glass min-w-0 rounded-[20px] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `color-mix(in srgb, ${u.warna} 18%, transparent)`, color: u.warna }}
              aria-hidden="true"
            >
              <u.ikon className="h-[15px] w-[15px]" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[10.5px] font-bold uppercase tracking-[0.06em] text-teks-sekunder">
              {u.label}
            </span>
          </div>
          <p className="mt-2.5 text-[28px] font-bold leading-none tracking-[-0.03em] text-teks-utama tabular-nums">
            {u.nilai.toLocaleString("id-ID")}
          </p>
          <p className="mt-1 truncate text-xs text-teks-sekunder">{u.ket}</p>
          {u.persen !== undefined && (
            <div className="mt-2.5 h-1 rounded-full bg-teks-sekunder/15" aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${u.persen}%`, background: u.warna }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
