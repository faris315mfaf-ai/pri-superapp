"use client";

// ============================================================
// LoncengDropdown — lonceng notifikasi dengan PANEL DROPDOWN
// (fix 1.19/4.3b): klik membuka panel di tempat, BUKAN pindah
// halaman. Dipakai di header profil (dan bisa dipakai header lain).
//
// - Badge merah = jumlah belum dibaca (sembunyi bila 0).
// - Panel: maks 400px, scrollable; item belum dibaca berlatar
//   lembut; klik item = tandai dibaca (+ navigasi bila ada target);
//   tombol "Tandai Semua Dibaca"; empty state.
// - Tutup saat klik di luar / Escape.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { useAppStore } from "@/hooks/use-app-store";
import { tandaiNotifikasiDibaca, tandaiSemuaNotifikasiDibaca } from "@/services";
import { cn } from "@/lib/utils";

export function LoncengDropdown({
  onBukaTarget,
  varianTerang = false,
}: {
  /** Navigasi saat item diklik (menerima target layar atau null) */
  onBukaTarget?: (target: string | null) => void;
  /** true = tombol untuk latar gradient gelap (header profil) */
  varianTerang?: boolean;
}) {
  const notifikasi = useAppStore((s) => s.notifikasi);
  const tandaiDibaca = useAppStore((s) => s.tandaiDibaca);
  const tandaiSemua = useAppStore((s) => s.tandaiSemuaDibaca);
  const [buka, setBuka] = useState(false);
  const wadahRef = useRef<HTMLDivElement | null>(null);

  const belumBaca = notifikasi.filter((n) => !n.dibaca).length;

  // Tutup saat klik di luar / Escape.
  useEffect(() => {
    if (!buka) return;
    function klikLuar(e: MouseEvent) {
      if (wadahRef.current && !wadahRef.current.contains(e.target as Node)) {
        setBuka(false);
      }
    }
    function tombol(e: KeyboardEvent) {
      if (e.key === "Escape") setBuka(false);
    }
    document.addEventListener("mousedown", klikLuar);
    document.addEventListener("keydown", tombol);
    return () => {
      document.removeEventListener("mousedown", klikLuar);
      document.removeEventListener("keydown", tombol);
    };
  }, [buka]);

  function klikItem(id: string, target: string | null) {
    tandaiDibaca(id);
    void tandaiNotifikasiDibaca(id).catch(() => {});
    setBuka(false);
    if (target && onBukaTarget) onBukaTarget(target);
  }

  return (
    <div ref={wadahRef} className="relative">
      <button
        type="button"
        onClick={() => setBuka((v) => !v)}
        aria-expanded={buka}
        aria-label={
          belumBaca > 0 ? `Notifikasi — ${belumBaca} belum dibaca` : "Notifikasi"
        }
        className={cn(
          "btn-tekan relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          varianTerang ? "bg-white/20 text-white backdrop-blur-sm" : "glass text-teks-utama",
        )}
      >
        <Bell className="h-[18px] w-[18px]" />
        {belumBaca > 0 && (
          <span
            className="angka-tab absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 4px 10px rgba(220, 38, 38, 0.4)",
            }}
          >
            {belumBaca > 99 ? "99+" : belumBaca}
          </span>
        )}
      </button>

      {buka && (
        <div
          role="dialog"
          aria-label="Panel notifikasi"
          className="glass-strong absolute top-12 right-0 z-[80] w-[320px] max-w-[86vw] overflow-hidden rounded-2xl shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-glass-border px-3.5 py-2.5">
            <p className="text-[12.5px] font-bold text-teks-utama">Notifikasi</p>
            {belumBaca > 0 && (
              <button
                type="button"
                onClick={() => {
                  tandaiSemua();
                  void tandaiSemuaNotifikasiDibaca().catch(() => {});
                }}
                className="btn-tekan flex items-center gap-1 text-[10.5px] font-semibold text-pri"
              >
                <CheckCheck className="h-3 w-3" aria-hidden="true" />
                Tandai Semua Dibaca
              </button>
            )}
          </div>
          <div className="scrollbar-tipis max-h-[400px] overflow-y-auto">
            {notifikasi.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <BellOff className="h-8 w-8 text-teks-sekunder/40" aria-hidden="true" />
                <p className="text-[12px] text-teks-sekunder">Belum ada notifikasi</p>
              </div>
            ) : (
              notifikasi.slice(0, 30).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => klikItem(n.id, n.target)}
                  className={cn(
                    "btn-tekan block w-full px-3.5 py-2.5 text-left transition-colors",
                    !n.dibaca && "bg-pri/[0.06]",
                  )}
                >
                  <p
                    className={cn(
                      "truncate text-[12px] text-teks-utama",
                      !n.dibaca ? "font-bold" : "font-medium",
                    )}
                  >
                    {n.judul}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-teks-sekunder">
                    {n.isi}
                  </p>
                  <p className="mt-0.5 text-[9.5px] text-teks-sekunder/70">
                    {n.waktu_relatif}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
