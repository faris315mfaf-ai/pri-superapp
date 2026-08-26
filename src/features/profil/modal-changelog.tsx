"use client";

// ============================================================
// ModalChangelog — layar "Apa yang Baru" (spek 1.4).
//
// Muncul otomatis SEKALI setelah aplikasi ter-update (dipicu dari
// page.tsx lewat penanda localStorage), dan bisa dibuka manual dari
// Pengaturan kapan saja.
// ============================================================

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { CHANGELOG } from "@/lib/changelog";
import { VERSI_APLIKASI } from "@/lib/versi";

export function ModalChangelog({ onTutup }: { onTutup: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[90] flex flex-col justify-end"
        role="dialog"
        aria-modal="true"
        aria-label="Apa yang baru"
      >
        <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
        <motion.div
          initial={{ y: "102%" }}
          animate={{ y: 0 }}
          exit={{ y: "102%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="glass-strong relative mx-auto flex max-h-[85dvh] w-full max-w-[440px] flex-col rounded-t-[2rem] px-5 pt-3 pb-8"
        >
          <div className="mb-3 flex shrink-0 justify-center">
            <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              aria-hidden="true"
            >
              <Sparkles className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-heading text-lg font-bold text-teks-utama">Apa yang Baru</h2>
              <p className="text-[11px] text-teks-sekunder">
                Versi terpasang: v{VERSI_APLIKASI}
              </p>
            </div>
            <button
              type="button"
              onClick={onTutup}
              aria-label="Tutup"
              className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="scrollbar-tipis mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-1">
            {CHANGELOG.map((rilis, i) => (
              <div key={rilis.versi} className={i === 0 ? "" : "opacity-75"}>
                <div className="flex items-baseline gap-2">
                  <p className="font-heading text-sm font-extrabold text-teks-utama">
                    v{rilis.versi}
                  </p>
                  {i === 0 && (
                    <span className="rounded-full bg-pri/15 px-2 py-0.5 text-[9.5px] font-bold text-pri">
                      TERBARU
                    </span>
                  )}
                  <span className="ml-auto text-[10.5px] text-teks-sekunder">{rilis.tanggal}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] font-semibold text-teks-sekunder">
                  {rilis.judul}
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {rilis.poin.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-teks-utama">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-pri" aria-hidden="true" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
