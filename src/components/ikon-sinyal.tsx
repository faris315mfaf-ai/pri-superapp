"use client";

// ============================================================
// IkonSinyal (1 Sep 2026) — indikator LATENSI di pojok kanan atas.
//
// Mengukur bolak-balik ke /api/ping (endpoint termurah: tanpa auth,
// tanpa database) saat layar dibuka lalu tiap 30 detik selagi tampak.
// Empat batang ala sinyal HP + angka milidetik:
//   <400 ms  hijau (4 batang)   — lancar
//   <1000 ms kuning (3 batang)  — mulai padat
//   <2500 ms oranye (2 batang)  — berat
//   ≥2500 / gagal merah (1)     — bermasalah
// Gunanya: SEMUA orang (termasuk Ketum) bisa melihat lebih dini bila
// platform mulai melambat — sebelum jadi keluhan.
// ============================================================

import { useEffect, useState } from "react";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";

const TINGGI_BATANG = [4, 7, 10, 13];

function nilaiTampilan(ms: number | null): {
  batang: number;
  warna: string;
  label: string;
} {
  if (ms === null) return { batang: 0, warna: "#9CA3AF", label: "…" };
  if (ms < 0) return { batang: 1, warna: "#DC2626", label: "putus" };
  if (ms < 400) return { batang: 4, warna: "#16A34A", label: `${ms}ms` };
  if (ms < 1000) return { batang: 3, warna: "#CA8A04", label: `${ms}ms` };
  if (ms < 2500) return { batang: 2, warna: "#EA580C", label: `${ms}ms` };
  return { batang: 1, warna: "#DC2626", label: `${(ms / 1000).toFixed(1)}s` };
}

export function IkonSinyal() {
  const [ms, setMs] = useState<number | null>(null);

  // setState hanya terjadi di dalam .then/.catch (asinkron) — aman dari
  // aturan react-hooks/set-state-in-effect.
  function ukur() {
    const t0 = performance.now();
    fetch("/api/ping", { cache: "no-store" })
      .then((r) => setMs(r.ok ? Math.round(performance.now() - t0) : -1))
      .catch(() => setMs(-1));
  }

  useEffect(() => {
    ukur();
  }, []);
  useSegarOtomatis(ukur, 30);

  const t = nilaiTampilan(ms);
  return (
    <span
      className="glass flex h-10 shrink-0 items-center gap-1 rounded-xl px-2"
      title={`Latensi server: ${t.label}`}
      aria-label={`Latensi server ${t.label}`}
    >
      <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
        {TINGGI_BATANG.map((h, i) => (
          <rect
            key={i}
            x={i * 4}
            y={14 - h}
            width="3"
            height={h}
            rx="1"
            fill={i < t.batang ? t.warna : "rgba(120,120,120,0.35)"}
          />
        ))}
      </svg>
      <span
        className="angka-tab text-[9px] leading-none font-bold"
        style={{ color: t.warna }}
      >
        {t.label}
      </span>
    </span>
  );
}
