"use client";

// ============================================================
// LencanaOnline (12 Sep 2026) — "berapa orang sedang membuka aplikasi",
// ditampilkan di beranda.
//
// Angkanya MENUMPANG DETAK: tiap perangkat yang aplikasinya terbuka sudah
// mengirim detak setiap beberapa detik, dan jawabannya membawa daftar
// siapa saja yang hadir. Jadi lencana ini tidak menambah satu permintaan
// pun ke server — ia hanya menampilkan yang sudah ada di genggaman.
//
// Sengaja tidak muncul saat angkanya nol atau satu: "1 online" yang
// hanya berarti diri sendiri bukan kabar, cuma ramai di layar.
// ============================================================

import { useAppStore } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";

export function LencanaOnline({
  className,
  minimal = 2,
}: {
  className?: string;
  /** Baru ditampilkan mulai sebanyak ini. */
  minimal?: number;
}) {
  const jumlah = useAppStore((st) => st.hadir.length);
  if (jumlah < minimal) return null;

  return (
    <span
      className={cn(
        "glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "text-[11px] font-bold text-teks-utama",
        className,
      )}
      title="Perkiraan orang yang aplikasinya sedang terbuka"
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        {/* Denyut pelan: menandakan angkanya hidup, bukan sekadar tulisan.
            Hanya opacity & scale yang dianimasikan supaya ringan di HP. */}
        <span className="absolute inset-0 animate-ping rounded-full bg-[#10B981] opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10B981]" />
      </span>
      <span className="angka-tab">{jumlah}</span>
      <span className="font-semibold text-teks-sekunder">online</span>
    </span>
  );
}
