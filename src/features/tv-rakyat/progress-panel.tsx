"use client";

// ============================================================
// ProgressPanel — kemajuan proses video TV Rakyat.
//
// PENTING: panel ini TIDAK lagi menyimulasikan progress. Angka
// persen dan tahap yang berjalan dibaca dari Supabase, tempat
// workflow n8n "TV Rakyat - Proses Video" menuliskan posisinya
// setiap kali selesai satu tahap. Jadi yang dilihat admin adalah
// kemajuan sesungguhnya, bukan animasi yang menebak-nebak.
//
// prosesVideo() dipanggil SEKALI per sesi (guard useRef), lalu
// kodenya dipakai untuk menanyakan kemajuan tiap 2 detik.
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
import { prosesVideo, pantauVideo } from "@/services";
import { toast } from "@/hooks/use-app-store";
import { TAHAP_VIDEO, type HasilProsesVideo, type KemajuanVideo } from "@/types";
import { cn } from "@/lib/utils";

type PayloadProses = {
  link: string;
  video_asli?: string;
  judul_overlay?: string;
  highlight?: string;
  sumber_akun?: string;
  caption_sumber?: string;
};

type ProgressPanelProps = {
  payload: PayloadProses;
  onSelesai: (hasil: HasilProsesVideo) => void;
  onBatal: () => void;
};

/** Jeda antar pengecekan kemajuan ke server (milidetik) */
const INTERVAL_PANTAU_MS = 2000;

/**
 * Batas aman menunggu. n8n sendiri berhenti di sekitar 5 menit
 * (batas eksekusi instance), jadi 6 menit sudah pasti melewatinya.
 */
const BATAS_TUNGGU_MS = 6 * 60 * 1000;

const TAHAPAN = TAHAP_VIDEO;

export function ProgressPanel({ payload, onSelesai, onBatal }: ProgressPanelProps) {
  const [persen, setPersen] = useState(0);
  const [tahapAktif, setTahapAktif] = useState(0);
  const [hasil, setHasil] = useState<HasilProsesVideo | null>(null);
  const [pesanError, setPesanError] = useState<string | null>(null);
  const [konfirmasiBuka, setKonfirmasiBuka] = useState(false);

  const janjiRef = useRef<Promise<{ kode: string }> | null>(null);
  const selesaiDipanggilRef = useRef(false);

  // Mulai proses SEKALI, lalu pantau kemajuannya sampai selesai/gagal.
  useEffect(() => {
    let aktif = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const mulaiPadaMs = Date.now();

    function gagal(pesan: string) {
      if (!aktif) return;
      setPesanError(pesan);
      toast("error", "Gagal memproses video", pesan);
    }

    function terapkan(k: KemajuanVideo) {
      setPersen(k.persen ?? 0);
      setTahapAktif(k.tahap ?? 0);

      if (k.status === "GAGAL") {
        gagal(k.pesan_error || "Proses video gagal di n8n");
        return true;
      }

      // n8n menandai SIAP DITINJAU begitu render Creatomate selesai.
      if (k.status === "SIAP DITINJAU" || k.persen >= 100) {
        setHasil({
          judul_overlay: k.judul_overlay || k.judul || "",
          highlight: k.highlight || "",
          caption_asli: k.caption_asli || "",
          sumber: k.link || k.video_asli || "",
          jenis: k.jenis === "TIKTOK" ? "TIKTOK" : "INSTAGRAM",
          kode: k.id,
          hasil_render_url: k.hasil_render_url || "",
          thumbnail_url: k.thumbnail_url || "",
        });
        return true;
      }
      return false;
    }

    function pantauBerulang(kode: string) {
      if (!aktif) return;

      if (Date.now() - mulaiPadaMs > BATAS_TUNGGU_MS) {
        gagal(
          "Proses video melebihi batas waktu tunggu. Cek riwayat di bawah — video mungkin tetap selesai beberapa saat lagi.",
        );
        return;
      }

      pantauVideo(kode)
        .then((k) => {
          if (!aktif) return;
          const berhenti = terapkan(k);
          if (!berhenti) {
            timer = setTimeout(() => pantauBerulang(kode), INTERVAL_PANTAU_MS);
          }
        })
        .catch(() => {
          // Sekali gagal menanyakan bukan berarti prosesnya gagal —
          // bisa jadi jaringan sekejap terputus. Coba lagi.
          if (!aktif) return;
          timer = setTimeout(() => pantauBerulang(kode), INTERVAL_PANTAU_MS);
        });
    }

    if (!janjiRef.current) {
      janjiRef.current = prosesVideo(payload);
    }
    janjiRef.current
      .then((r) => {
        if (!aktif) return;
        pantauBerulang(r.kode);
      })
      .catch((err: unknown) => {
        gagal(
          err instanceof Error ? err.message : "Terjadi kesalahan tak terduga",
        );
      });

    return () => {
      aktif = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Saat hasil sudah ada → jeda 500ms agar user melihat 100%.
  useEffect(() => {
    if (hasil && !selesaiDipanggilRef.current) {
      selesaiDipanggilRef.current = true;
      const jeda: ReturnType<typeof setTimeout> = setTimeout(() => {
        onSelesai(hasil);
      }, 500);
      return () => clearTimeout(jeda);
    }
  }, [hasil, onSelesai]);

  /**
   * Status tiap tahap dibaca dari nomor tahap n8n, bukan dari persen.
   * Nomor tahap lebih jujur: kalau n8n masih di tahap 4, tahap 4
   * ditandai berjalan walaupun persennya belum bergerak.
   */
  function statusTahap(indeks: number): "menunggu" | "berjalan" | "selesai" {
    const nomor = indeks + 1;
    if (tahapAktif > nomor) return "selesai";
    if (tahapAktif === nomor) return persen >= 100 ? "selesai" : "berjalan";
    return "menunggu";
  }

  function batalkan() {
    setKonfirmasiBuka(false);
    toast("info", "Proses video dibatalkan");
    onBatal();
  }

  /** Nama tahap yang sedang dikerjakan n8n (untuk teks di bawah ring) */
  const namaTahapAktif =
    tahapAktif >= 1 && tahapAktif <= TAHAPAN.length
      ? TAHAPAN[tahapAktif - 1].nama
      : "Menghubungi otomatisasi";

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
            {/* Menampilkan tahap yang BENAR-BENAR sedang dikerjakan n8n.
                Dulu di sini ada hitung mundur detik, tapi itu tebakan —
                lama proses tergantung Apify, DeepSeek, dan Creatomate. */}
            <p className="mt-2 h-5 text-xs font-medium text-teks-sekunder">
              {persen >= 100 ? "Selesai!" : namaTahapAktif}
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
