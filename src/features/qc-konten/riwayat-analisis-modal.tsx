"use client";

// ============================================================
// RiwayatAnalisisModal — daftar seluruh analisis QC yang pernah
// dijalankan, satu baris per periode (dibuka dari tombol Riwayat
// di layar QC). Sumber: view v_app_qc_antrian lewat
// /api/analisis?riwayat=1 — jadi yang tampil adalah keadaan
// database sebenarnya, bukan catatan di memori peramban.
// ============================================================

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, History, X } from "lucide-react";
import { EmptyState, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { ProgressRing } from "@/components/progress-ring";
import { getRiwayatAnalisis, type AntrianQc } from "@/services";
import { jamWIB, tanggalIndonesia } from "@/lib/format";

/** "2026-08-24 00:00-23:59" → "Senin, 24 Agustus 2026" */
function labelPeriode(periode: string): string {
  const tanggal = periode.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(tanggal)
    ? tanggalIndonesia(`${tanggal}T00:00:00+07:00`)
    : periode;
}

export function RiwayatAnalisisModal({ onTutup }: { onTutup: () => void }) {
  const [daftar, setDaftar] = useState<AntrianQc[] | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getRiwayatAnalisis();
        if (hidup) setDaftar(hasil);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  // Tombol Escape menutup modal
  useEffect(() => {
    function tangani(e: KeyboardEvent) {
      if (e.key === "Escape") onTutup();
    }
    window.addEventListener("keydown", tangani);
    return () => window.removeEventListener("keydown", tangani);
  }, [onTutup]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Riwayat analisis QC"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
      <motion.div
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="glass-strong relative mx-auto flex max-h-[85dvh] w-full max-w-[480px] flex-col rounded-t-[2rem]"
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-1">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className="glass-soft flex h-9 w-9 items-center justify-center rounded-xl text-pri"
              aria-hidden="true"
            >
              <History className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="font-heading text-base font-bold text-teks-utama">
                Riwayat Analisis
              </h2>
              <p className="text-[11px] text-teks-sekunder">
                Semua pemeriksaan yang pernah dijalankan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup riwayat"
            className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-tipis flex-1 overflow-y-auto px-5 pb-8">
          {daftar === null ? (
            <div className="flex flex-col gap-2.5">
              {[0, 1, 2].map((i) => (
                <GlassSkeleton key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : daftar.length === 0 ? (
            <EmptyState
              ikon={History}
              judul="Belum Ada Riwayat"
              keterangan="Analisis yang dijalankan akan tercatat di sini per tanggal."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {daftar.map((r) => {
                const persen = r.total > 0 ? Math.round((100 * r.selesai) / r.total) : 0;
                return (
                  <div key={r.periode} className="glass-soft rounded-2xl p-3.5">
                    <div className="flex items-center gap-3">
                      <ProgressRing value={persen} size={46} strokeWidth={5}>
                        <span className="angka-tab text-[10px] font-bold text-teks-utama">
                          {persen}%
                        </span>
                      </ProgressRing>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-teks-utama">
                          {labelPeriode(r.periode)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-teks-sekunder">
                          {r.selesai}/{r.total} postingan diperiksa
                          {r.terakhir_diperiksa
                            ? ` · terakhir ${jamWIB(r.terakhir_diperiksa)}`
                            : ""}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {r.menunggu > 0 && (
                            <StatusBadge label={`${r.menunggu} menunggu`} warna="kuning" />
                          )}
                          {r.gagal > 0 && (
                            <StatusBadge label={`${r.gagal} gagal`} warna="merah" />
                          )}
                          {r.perlu_cek_manual > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emas/30 bg-emas/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-3 w-3" />
                              {r.perlu_cek_manual} cek manual
                            </span>
                          )}
                          {r.menunggu === 0 && r.gagal === 0 && (
                            <StatusBadge label="tuntas" warna="hijau" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
