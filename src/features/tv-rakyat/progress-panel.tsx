"use client";

// ============================================================
// ProgressPanel — progress generate video TV Rakyat.
// Ring progress besar (±13 detik) + 5 tahapan status +
// pembatalan dengan modal konfirmasi kaca.
// prosesVideo() dipanggil SEKALI per sesi (guard useRef).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clapperboard,
  Loader2,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { ProgressRing } from "@/components/progress-ring";
import { prosesVideo } from "@/services";
import { toast } from "@/hooks/use-app-store";
import type { HasilProsesVideo } from "@/types";
import { cn } from "@/lib/utils";

type PayloadProses = {
  link: string;
  judul_overlay?: string;
  highlight?: string;
};

type ProgressPanelProps = {
  payload: PayloadProses;
  onSelesai: (hasil: HasilProsesVideo) => void;
  onBatal: () => void;
};

/** Total durasi simulasi progress (detik) */
const DURASI_TOTAL_DETIK = 13;
/** Interval tick progress (milidetik) */
const INTERVAL_MS = 100;

const TAHAPAN: { nama: string; sampai: number }[] = [
  { nama: "Mengambil video sumber", sampai: 15 },
  { nama: "Membuat judul & caption dengan AI", sampai: 30 },
  { nama: "Mengunggah ke penyimpanan sementara", sampai: 50 },
  { nama: "Merender overlay judul & highlight", sampai: 85 },
  { nama: "Finalisasi video", sampai: 100 },
];

export function ProgressPanel({ payload, onSelesai, onBatal }: ProgressPanelProps) {
  const [persen, setPersen] = useState(0);
  const [hasil, setHasil] = useState<HasilProsesVideo | null>(null);
  const [pesanError, setPesanError] = useState<string | null>(null);
  const [konfirmasiBuka, setKonfirmasiBuka] = useState(false);

  const janjiRef = useRef<Promise<HasilProsesVideo> | null>(null);
  const akumulasiRef = useRef(0);
  const hasilRef = useRef<HasilProsesVideo | null>(null);
  const errorRef = useRef(false);
  const selesaiDipanggilRef = useRef(false);

  // Panggil prosesVideo SEKALI di mount (guard ref), lalu jalankan timer.
  useEffect(() => {
    let aktif = true;

    if (!janjiRef.current) {
      janjiRef.current = prosesVideo(payload);
    }
    janjiRef.current
      .then((h) => {
        if (!aktif) return;
        hasilRef.current = h;
        setHasil(h);
      })
      .catch((err: unknown) => {
        if (!aktif) return;
        errorRef.current = true;
        const pesan = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
        setPesanError(pesan);
        toast("error", "Gagal memproses video", pesan);
      });

    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      if (!aktif || errorRef.current) return;
      // Naik ~0,77 per tick dengan sedikit variasi (total ±13 detik)
      akumulasiRef.current = Math.min(
        100,
        akumulasiRef.current + 0.77 + (Math.random() - 0.5) * 0.16,
      );
      if (akumulasiRef.current >= 100) {
        // Tahan di 99% bila hasil API belum datang
        setPersen(hasilRef.current ? 100 : 99);
      } else {
        setPersen(akumulasiRef.current);
      }
    }, INTERVAL_MS);

    return () => {
      aktif = false;
      clearInterval(timer);
    };
  }, []);

  // Saat 100% & hasil sudah ada → jeda 500ms agar user melihat 100%.
  useEffect(() => {
    if (persen === 100 && hasil && !selesaiDipanggilRef.current) {
      selesaiDipanggilRef.current = true;
      const jeda: ReturnType<typeof setTimeout> = setTimeout(() => {
        onSelesai(hasil);
      }, 500);
      return () => clearTimeout(jeda);
    }
  }, [persen, hasil, onSelesai]);

  function statusTahap(indeks: number): "menunggu" | "berjalan" | "selesai" {
    const batasBawah = indeks === 0 ? 0 : TAHAPAN[indeks - 1].sampai;
    const batasAtas = TAHAPAN[indeks].sampai;
    if (persen >= batasAtas) return "selesai";
    if (persen >= batasBawah) return "berjalan";
    return "menunggu";
  }

  function batalkan() {
    setKonfirmasiBuka(false);
    toast("info", "Proses video dibatalkan");
    onBatal();
  }

  const sisaDetik = Math.max(1, Math.ceil(((100 - persen) / 100) * DURASI_TOTAL_DETIK));

  return (
    <GlassCard className="p-4 sm:p-5">
      {/* Kepala panel */}
      <div className="flex items-center gap-3">
        <span
          className="glass-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pri"
          aria-hidden="true"
        >
          <Clapperboard className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-[15px] font-bold text-teks-utama">
            Sedang Memproses Video
          </h2>
          <p className="truncate font-mono text-[10.5px] text-teks-sekunder">{payload.link}</p>
        </div>
      </div>

      {pesanError ? (
        /* Keadaan gagal */
        <div className="mt-5 flex flex-col items-center rounded-2xl border border-gagal/40 bg-gagal/5 px-4 py-6 text-center">
          <AlertTriangle className="h-9 w-9 text-gagal" />
          <p className="mt-2 font-heading text-sm font-bold text-teks-utama">
            Proses video gagal
          </p>
          <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-teks-sekunder">
            {pesanError}
          </p>
          <button
            type="button"
            onClick={onBatal}
            className="btn-tekan mt-4 rounded-xl border border-pri/40 bg-pri/5 px-5 py-2.5 text-sm font-semibold text-pri"
          >
            Kembali ke Form
          </button>
        </div>
      ) : (
        <>
          {/* Ring progress besar */}
          <div className="mt-6 flex flex-col items-center">
            <ProgressRing value={persen} size={150} strokeWidth={12} color="#DC2626">
              <span className="font-heading text-3xl font-extrabold text-teks-utama angka-tab">
                {Math.round(persen)}
                <span className="text-lg">%</span>
              </span>
            </ProgressRing>
            <p className="mt-2 h-5 text-xs font-medium text-teks-sekunder">
              {persen >= 100 ? "Selesai!" : `Perkiraan selesai ${sisaDetik} detik lagi`}
            </p>
          </div>

          {/* Daftar 5 tahapan */}
          <ol className="mt-5 flex flex-col gap-3">
            {TAHAPAN.map((tahap, i) => {
              const status = statusTahap(i);
              return (
                <li key={tahap.nama} className="flex items-center gap-3">
                  {status === "selesai" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-sukses" />
                  ) : status === "berjalan" ? (
                    <span className="flex h-5 w-5 shrink-0 animate-pulse items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-pri" />
                    </span>
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-teks-sekunder/40" />
                  )}
                  <span
                    className={cn(
                      "text-sm",
                      status === "berjalan"
                        ? "font-semibold text-teks-utama"
                        : status === "selesai"
                          ? "text-teks-utama/80"
                          : "text-teks-sekunder",
                    )}
                  >
                    {tahap.nama}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Tombol batalkan */}
          <button
            type="button"
            onClick={() => setKonfirmasiBuka(true)}
            className="btn-tekan mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-pri/45 bg-pri/5 text-sm font-semibold text-pri"
          >
            <X className="h-4 w-4" />
            Batalkan
          </button>
        </>
      )}

      {/* Modal konfirmasi pembatalan */}
      <AnimatePresence>
        {konfirmasiBuka && (
          <motion.div
            key="konfirmasi-batal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi pembatalan proses"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
              onClick={() => setKonfirmasiBuka(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="glass-strong relative w-full max-w-[340px] rounded-3xl p-5"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-pri/30 bg-pri/15 text-pri"
                  aria-hidden="true"
                >
                  <X className="h-5 w-5" />
                </span>
                <h3 className="font-heading text-base font-bold text-teks-utama">
                  Batalkan Proses?
                </h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-teks-sekunder">
                Video yang sedang diproses akan dibuang.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setKonfirmasiBuka(false)}
                  className="glass btn-tekan h-11 w-full rounded-xl text-sm font-semibold text-teks-utama"
                >
                  Lanjutkan Proses
                </button>
                <button
                  type="button"
                  onClick={batalkan}
                  className="btn-tekan h-11 w-full rounded-xl text-sm font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                    boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
                  }}
                >
                  Ya, Batalkan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
