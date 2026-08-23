"use client";

// ============================================================
// PreviewModal — popup pratinjau video setelah proses 100%.
// Bottom sheet slide-up: pemutar 9:16 (simulasi), metadata,
// pilih platform tujuan (switch kaca), lalu unggah satu per
// satu platform atau buang video.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Copy,
  Loader2,
  Pause,
  Play,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import type { HasilProsesVideo } from "@/types";
import { cn } from "@/lib/utils";

type PreviewModalProps = {
  hasil: HasilProsesVideo;
  onTutup: () => void;
  onSelesaiUnggah: (jumlahPlatform: number) => void;
};

type PlatformTujuan = {
  platform: string;
  label: string;
  aktifAwal: boolean;
};

const PLATFORM_TUJUAN: PlatformTujuan[] = [
  { platform: "instagram", label: "Instagram", aktifAwal: true },
  { platform: "tiktok", label: "TikTok", aktifAwal: true },
  { platform: "youtube", label: "YouTube Shorts", aktifAwal: true },
  { platform: "facebook", label: "Facebook", aktifAwal: false },
  { platform: "twitter", label: "Twitter/X", aktifAwal: false },
  { platform: "threads", label: "Threads", aktifAwal: false },
];

/** Durasi simulasi pemutar video (detik) */
const DURASI_VIDEO_DETIK = 25;

/** Salin teks ke clipboard dengan fallback untuk konteks non-secure */
async function salinTeks(teks: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(teks);
      return true;
    }
    const area = document.createElement("textarea");
    area.value = teks;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const berhasil = document.execCommand("copy");
    document.body.removeChild(area);
    return berhasil;
  } catch {
    return false;
  }
}

export function PreviewModal({ hasil, onTutup, onSelesaiUnggah }: PreviewModalProps) {
  // Pemutar simulasi
  const [main, setMain] = useState(false);
  const [posisi, setPosisi] = useState(0);

  // Metadata
  const [captionBuka, setCaptionBuka] = useState(false);
  const [menyalin, setMenyalin] = useState(false);

  // Platform tujuan
  const [aktif, setAktif] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PLATFORM_TUJUAN.map((p) => [p.platform, p.aktifAwal])),
  );

  // Alur unggah
  const [modeUnggah, setModeUnggah] = useState(false);
  const [unggahSelesai, setUnggahSelesai] = useState(0);
  const [konfirmasiBuang, setKonfirmasiBuang] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const platformAktif = useMemo(
    () => PLATFORM_TUJUAN.filter((p) => aktif[p.platform]),
    [aktif],
  );

  // Kunci scroll body selama modal terbuka
  useEffect(() => {
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sebelumnya;
    };
  }, []);

  // Bersihkan seluruh timer saat dilepas
  useEffect(() => {
    return () => {
      timerRef.current.forEach((t) => clearTimeout(t));
      timerRef.current = [];
    };
  }, []);

  // Simulasi pemutar: posisi naik selama status "main"
  useEffect(() => {
    if (!main) return;
    const langkah = 100 / (DURASI_VIDEO_DETIK * 5); // tick 200ms
    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      setPosisi((p) => Math.min(100, p + langkah));
    }, 200);
    return () => clearInterval(timer);
  }, [main]);

  // Berhenti otomatis di akhir video (dijadwalkan lewat timeout
  // agar tidak mengubah state secara sinkron di dalam efek)
  useEffect(() => {
    if (posisi >= 100 && main) {
      const jeda: ReturnType<typeof setTimeout> = setTimeout(() => setMain(false), 0);
      return () => clearTimeout(jeda);
    }
  }, [posisi, main]);

  function toggleMain() {
    if (posisi >= 100) {
      setPosisi(0);
      setMain(true);
      return;
    }
    setMain((v) => !v);
  }

  function gantiAktif(platform: string) {
    if (modeUnggah) return;
    setAktif((sebelumnya) => ({ ...sebelumnya, [platform]: !sebelumnya[platform] }));
  }

  async function salinCaption() {
    if (menyalin) return;
    setMenyalin(true);
    const berhasil = await salinTeks(hasil.caption_asli);
    setMenyalin(false);
    if (berhasil) toast("sukses", "Caption disalin");
    else toast("error", "Gagal menyalin caption");
  }

  function buang() {
    setKonfirmasiBuang(false);
    toast("info", "Video dibuang");
    onTutup();
  }

  function mulaiUnggah() {
    if (modeUnggah) return;
    if (platformAktif.length === 0) {
      toast("peringatan", "Pilih minimal satu platform tujuan");
      return;
    }
    setModeUnggah(true);
    let offset = 0;
    platformAktif.forEach((p, i) => {
      // Jeda 700–1100 ms per platform
      offset += 700 + Math.random() * 400;
      timerRef.current.push(setTimeout(() => setUnggahSelesai(i + 1), offset));
    });
    timerRef.current.push(
      setTimeout(() => {
        toast("sukses", `Video berhasil diunggah ke ${platformAktif.length} platform`);
        onSelesaiUnggah(platformAktif.length);
      }, offset + 650),
    );
  }

  const platformSumber = hasil.jenis === "TIKTOK" ? "tiktok" : "instagram";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau video"
    >
      {/* Latar belakang */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />

      {/* Kartu bottom sheet */}
      <motion.div
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="glass-strong relative mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-[2rem]"
      >
        {/* Handle bar */}
        <div className="flex shrink-0 justify-center pt-2.5 pb-1">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>

        {/* Kepala modal */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2">
          <h2 className="font-heading text-lg font-bold text-teks-utama">
            Video Siap Ditinjau
          </h2>
          <button
            type="button"
            onClick={onTutup}
            disabled={modeUnggah}
            aria-label="Tutup pratinjau"
            className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Konten scrollable */}
        <div className="scrollbar-tipis flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-1 pb-8">
          {/* Pemutar video vertikal 9:16 (simulasi) */}
          <div
            className="relative mx-auto aspect-[9/16] w-[min(100%,calc(46dvh*9/16))] max-h-[46dvh] overflow-hidden rounded-2xl border border-white/10 shadow-xl"
            style={{ background: "linear-gradient(135deg, #7F1D1D, #B45309, #0B1120)" }}
          >
            {/* Overlay judul + platform sumber */}
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
              <p className="max-w-[75%] font-heading text-sm leading-tight font-extrabold tracking-wide text-white uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                {hasil.judul_overlay}
              </p>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/25 bg-black/35 backdrop-blur-md">
                <PlatformIcon platform={platformSumber} size={14} />
              </span>
            </div>

            {/* Tombol play/pause tengah */}
            <button
              type="button"
              onClick={toggleMain}
              aria-label={main ? "Jeda video" : "Putar video"}
              className="btn-tekan absolute inset-0 flex items-center justify-center"
            >
              <span
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white shadow-2xl backdrop-blur-md transition-transform duration-200",
                  main && "scale-90",
                )}
              >
                {main ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 translate-x-0.5" />}
              </span>
            </button>

            {/* Highlight bawah */}
            <p className="absolute inset-x-0 bottom-3 px-3 text-[11px] leading-snug font-medium text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
              {hasil.highlight}
            </p>

            {/* Progress bar tipis */}
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
              <div
                className="h-full bg-white/90 transition-[width] duration-200 ease-linear"
                style={{ width: `${posisi}%` }}
              />
            </div>
          </div>

          {/* Kartu metadata */}
          <div className="glass rounded-2xl p-4">
            <div className="flex flex-col gap-3">
              {/* Judul */}
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
                  Judul
                </p>
                <p className="mt-0.5 font-heading text-[15px] leading-snug font-bold text-teks-utama">
                  {hasil.judul_overlay}
                </p>
              </div>

              {/* Highlight (badge emas) */}
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
                  Highlight
                </p>
                <span className="mt-1 inline-flex max-w-full items-start rounded-xl border border-emas/30 bg-emas/15 px-2.5 py-1.5 text-xs leading-snug font-medium text-amber-700 dark:text-amber-300">
                  {hasil.highlight}
                </span>
              </div>

              {/* Caption (bisa di-expand) */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
                    Caption
                  </p>
                  <button
                    type="button"
                    onClick={() => void salinCaption()}
                    className="btn-tekan inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-pri hover:bg-pri/10"
                  >
                    <Copy className="h-3 w-3" />
                    Salin Caption
                  </button>
                </div>
                <p
                  className={cn(
                    "mt-0.5 text-sm leading-relaxed text-teks-utama/90",
                    !captionBuka && "line-clamp-3",
                  )}
                >
                  {hasil.caption_asli}
                </p>
                <button
                  type="button"
                  onClick={() => setCaptionBuka((v) => !v)}
                  className="mt-1 text-xs font-semibold text-pri underline-offset-4 hover:underline"
                >
                  {captionBuka ? "Sembunyikan" : "Selengkapnya"}
                </button>
              </div>

              {/* Sumber */}
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
                  Sumber
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-teks-sekunder">
                  {hasil.sumber}
                </p>
              </div>
            </div>
          </div>

          {/* Panel platform tujuan */}
          <div className="glass-soft rounded-2xl p-1.5">
            <div className="px-2.5 pt-1.5 pb-0.5">
              <p className="text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
                Platform Tujuan
              </p>
            </div>
            {PLATFORM_TUJUAN.map((p) => (
              <div key={p.platform} className="flex items-center gap-3 px-2 py-1.5">
                <PlatformIcon platform={p.platform} size={16} denganWadah />
                <span className="flex-1 text-sm font-medium text-teks-utama">{p.label}</span>
                <SwitchKaca
                  aktif={aktif[p.platform] ?? false}
                  disabled={modeUnggah}
                  onUbah={() => gantiAktif(p.platform)}
                  label={`Aktifkan unggah ke ${p.label}`}
                />
              </div>
            ))}
          </div>

          {/* Tombol aksi / progress unggah */}
          {modeUnggah ? (
            <div className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teks-sekunder">Mengunggah video…</p>
                <p className="text-xs font-semibold text-teks-utama angka-tab">
                  {unggahSelesai}/{platformAktif.length}
                </p>
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                {platformAktif.map((p, i) => (
                  <div key={p.platform} className="flex items-center gap-3">
                    {i < unggahSelesai ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-sukses" />
                    ) : (
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-pri" />
                    )}
                    <span className="flex-1 text-sm text-teks-utama">{p.label}</span>
                    {i < unggahSelesai && (
                      <span className="text-[11px] font-semibold text-sukses">Terkirim</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${platformAktif.length ? (unggahSelesai / platformAktif.length) * 100 : 0}%`,
                    background: "linear-gradient(90deg, #10B981, #059669)",
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setKonfirmasiBuang(true)}
                className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl border border-pri/45 bg-pri/5 px-2 text-sm font-semibold text-pri"
              >
                <Trash2 className="h-4.5 w-4.5 shrink-0" />
                Buang
              </button>
              <button
                type="button"
                onClick={mulaiUnggah}
                className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl px-2 text-sm leading-tight font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #10B981, #059669)",
                  boxShadow: "0 8px 20px rgba(16, 185, 129, 0.35)",
                }}
              >
                <Rocket className="h-4.5 w-4.5 shrink-0" />
                Unggah ke Semua Sosmed
              </button>
            </div>
          )}
        </div>

        {/* Modal konfirmasi buang */}
        <AnimatePresence>
          {konfirmasiBuang && (
            <motion.div
              key="konfirmasi-buang"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[80] flex items-center justify-center p-6"
              role="dialog"
              aria-modal="true"
              aria-label="Konfirmasi buang video"
            >
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-xl"
                onClick={() => setKonfirmasiBuang(false)}
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
                    <Trash2 className="h-5 w-5" />
                  </span>
                  <h3 className="font-heading text-base font-bold text-teks-utama">
                    Buang Video?
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-teks-sekunder">
                  Yakin membuang video ini? Proses tidak bisa diulang.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setKonfirmasiBuang(false)}
                    className="glass btn-tekan h-11 w-full rounded-xl text-sm font-semibold text-teks-utama"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={buang}
                    className="btn-tekan h-11 w-full rounded-xl text-sm font-bold text-white"
                    style={{
                      background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                      boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
                    }}
                  >
                    Buang
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// SwitchKaca — toggle switch custom (track kaca, knob putih,
// aktif = gradient merah)
// ------------------------------------------------------------

function SwitchKaca({
  aktif,
  disabled,
  onUbah,
  label,
}: {
  aktif: boolean;
  disabled?: boolean;
  onUbah: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aktif}
      aria-label={label}
      disabled={disabled}
      onClick={onUbah}
      className={cn(
        "btn-tekan relative h-7 w-12 shrink-0 rounded-full border disabled:cursor-not-allowed disabled:opacity-60",
        aktif
          ? "border-transparent"
          : "border-black/10 bg-black/5 dark:border-white/15 dark:bg-white/10",
      )}
      style={aktif ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
    >
      <span
        className={cn(
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200",
          aktif ? "left-[calc(100%-1.5rem)]" : "left-1",
        )}
      />
    </button>
  );
}
