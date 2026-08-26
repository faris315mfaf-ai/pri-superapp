"use client";

// ============================================================
// KartuKelolaPengguna — pintu masuk panel super admin di beranda.
//
// Menampilkan berapa pendaftar yang menunggu persetujuan. Angka itu
// yang membuat kartunya berguna: tanpa penanda, pendaftar baru bisa
// menunggu berhari-hari tanpa ada yang sadar.
// ============================================================

import { useEffect, useState } from "react";
import { ChevronRight, UserCog } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { getPengguna } from "@/services";

export function KartuKelolaPengguna({ onBuka }: { onBuka: () => void }) {
  const [menunggu, setMenunggu] = useState<number | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const { ringkasan } = await getPengguna();
        if (hidup) setMenunggu(ringkasan.menunggu ?? 0);
      } catch {
        // Gagal memuat bukan alasan menyembunyikan kartunya — pintu
        // masuknya tetap perlu ada, cukup tanpa angka.
        if (hidup) setMenunggu(null);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  const ada = (menunggu ?? 0) > 0;

  return (
    <GlassCard className="p-0">
      <button
        type="button"
        onClick={onBuka}
        className="btn-tekan flex w-full items-center gap-3 p-4 text-left"
        aria-label="Buka kelola pengguna"
      >
        <span
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{
            background: "linear-gradient(135deg, #DC2626, #B91C1C)",
            boxShadow: "0 8px 20px rgba(220, 38, 38, 0.3)",
          }}
        >
          <UserCog className="h-5 w-5" />
          {ada && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emas px-1 text-[10px] font-bold text-slate-900 ring-2 ring-white/70 dark:ring-slate-900/70">
              {menunggu}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="font-heading block text-[15px] font-bold text-teks-utama">
            Kelola Pengguna
          </span>
          <span className="block text-[12px] leading-snug text-teks-sekunder">
            {menunggu === null
              ? "Setujui pendaftar & atur peran"
              : ada
                ? `${menunggu} pendaftar menunggu persetujuan`
                : "Tidak ada pendaftar baru"}
          </span>
        </span>

        <ChevronRight className="h-5 w-5 shrink-0 text-teks-sekunder" />
      </button>
    </GlassCard>
  );
}
