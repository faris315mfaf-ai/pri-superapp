"use client";

// ============================================================
// ToastViewport — toast kaca dari atas layar, bertumpuk rapi.
// Jenis: sukses (hijau), error (merah), info (biru), peringatan (kuning).
// ============================================================

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { useAppStore, type JenisToast } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";

const KONFIG_JENIS: Record<
  JenisToast,
  { ikon: React.ElementType; warna: string; kelasIkon: string }
> = {
  sukses: { ikon: CheckCircle2, warna: "#10B981", kelasIkon: "text-sukses" },
  error: { ikon: XCircle, warna: "#EF4444", kelasIkon: "text-gagal" },
  info: { ikon: Info, warna: "#3B82F6", kelasIkon: "text-info" },
  peringatan: { ikon: AlertTriangle, warna: "#F59E0B", kelasIkon: "text-emas" },
};

export function ToastViewport() {
  const toasts = useAppStore((s) => s.toasts);
  const hapusToast = useAppStore((s) => s.hapusToast);

  return (
    <div
      className="pointer-events-none fixed top-3 left-1/2 z-[90] flex w-full max-w-[440px] -translate-x-1/2 flex-col gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const konfig = KONFIG_JENIS[t.jenis];
          const Ikon = konfig.ikon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="glass-strong pointer-events-auto flex items-start gap-3 rounded-2xl p-3.5"
              style={{ borderLeft: `3px solid ${konfig.warna}` }}
            >
              <Ikon
                className={cn("mt-0.5 h-5 w-5 shrink-0", konfig.kelasIkon)}
                style={{ color: konfig.warna }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-semibold leading-tight text-teks-utama">
                  {t.judul}
                </p>
                {t.isi && (
                  <p className="mt-0.5 text-xs leading-snug text-teks-sekunder">
                    {t.isi}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => hapusToast(t.id)}
                aria-label="Tutup notifikasi"
                className="btn-tekan -mr-1 -mt-1 rounded-full p-1.5 text-teks-sekunder hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
