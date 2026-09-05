"use client";

// ============================================================
// PushBannerStack — simulasi push notification Android.
// Banner meluncur turun dari atas, bisa diklik untuk navigasi.
// ============================================================

import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/hooks/use-app-store";

type PushBannerStackProps = {
  /** Dipanggil saat banner diklik dengan target navigasinya */
  onTarget: (target: "qc" | "tv" | "dashboard" | "notifikasi" | "tvrku" | null) => void;
};

function LogoPriMini() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-md"
      style={{ background: "linear-gradient(135deg, #DC2626, #F59E0B)" }}
      aria-hidden="true"
    >
      PRI
    </span>
  );
}

export function PushBannerStack({ onTarget }: PushBannerStackProps) {
  const pushBanners = useAppStore((s) => s.pushBanners);
  const hapusPushBanner = useAppStore((s) => s.hapusPushBanner);

  return (
    <div className="pointer-events-none fixed top-0 left-1/2 z-[80] flex w-full max-w-[480px] -translate-x-1/2 flex-col gap-2 px-3 pt-3">
      <AnimatePresence>
        {pushBanners.map((b) => (
          <motion.button
            key={b.id}
            type="button"
            layout
            initial={{ opacity: 0, y: -80, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -70, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="glass-strong pointer-events-auto flex items-start gap-3 rounded-2xl p-3.5 text-left btn-tekan"
            onClick={() => {
              onTarget(b.target);
              hapusPushBanner(b.id);
            }}
            aria-label={`Notifikasi: ${b.judul}`}
          >
            <LogoPriMini />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-teks-sekunder">
                  PRI SuperApp
                </span>
                <span className="text-[11px] text-teks-sekunder">{b.waktu}</span>
              </div>
              <p className="mt-0.5 font-heading text-sm font-bold leading-tight text-teks-utama">
                {b.judul}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-teks-sekunder">
                {b.isi}
              </p>
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
