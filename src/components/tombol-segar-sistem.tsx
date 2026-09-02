"use client";

// ============================================================
// TombolSegarSistem (2 Sep 2026) — tombol refresh di KANAN ATAS semua
// layar (dibawa ThemeToggle). Menekannya HANYA menyegarkan DATA:
//   • menaikkan `versiSegar` di store → effect pemuat data yang memakai
//     useVersiSegar() memuat ulang;
//   • menembakkan peristiwa jendela "pri:segarkan" → useSegarOtomatis
//     & pemuat notifikasi menyegarkan seketika.
// Tidak ada reload halaman, tidak pindah layar, posisi gulir tetap.
// Jeda 1,5 dtk antar klik = pengaman kuota bila ditekan bertubi-tubi.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAppStore } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";

export function TombolSegarSistem({ className }: { className?: string }) {
  const user = useAppStore((s) => s.user);
  const segarkanData = useAppStore((s) => s.segarkanData);
  const [berputar, setBerputar] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Belum login = tidak ada data untuk disegarkan.
  if (!user) return null;

  function klik() {
    if (berputar) return;
    setBerputar(true);
    segarkanData();
    timer.current = setTimeout(() => setBerputar(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={klik}
      aria-label="Segarkan data"
      title="Segarkan data (tanpa memuat ulang layar)"
      className={cn(
        "glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-teks-utama",
        className,
      )}
    >
      <RefreshCw className={cn("h-[18px] w-[18px]", berputar && "animate-spin")} />
    </button>
  );
}
