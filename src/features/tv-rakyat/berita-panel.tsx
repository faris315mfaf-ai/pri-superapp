"use client";

// ============================================================
// BeritaPanel — panel "Cek Berita Terbaru" modul TV Rakyat.
// Tekan tombol → animasi pemindaian radar 1,5 detik → daftar
// berita Nusantara TV (6 berita) siap diambil link-nya.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Newspaper, Radar, RefreshCw } from "lucide-react";
import { EmptyState, FadeInUp, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { getBeritaTerbaru } from "@/services";
import { toast } from "@/hooks/use-app-store";
import type { Berita } from "@/types";
import { cn } from "@/lib/utils";

type StatusPindai = "idle" | "memindai" | "selesai";

/** Durasi animasi pemindaian radar (milidetik) */
const DURASI_RADAR_MS = 1500;

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

export function BeritaPanel({ onGunakanLink }: { onGunakanLink: (link: string) => void }) {
  const [status, setStatus] = useState<StatusPindai>("idle");
  const [daftar, setDaftar] = useState<Berita[]>([]);
  const aktifRef = useRef(true);

  useEffect(() => {
    aktifRef.current = true;
    return () => {
      aktifRef.current = false;
    };
  }, []);

  async function pindai() {
    if (status === "memindai") return;
    setStatus("memindai");
    try {
      // Radar berjalan minimal 1,5 detik, berjalan bersamaan dengan API
      const [hasil] = await Promise.all([
        getBeritaTerbaru(),
        new Promise<void>((selesai) => setTimeout(selesai, DURASI_RADAR_MS)),
      ]);
      if (!aktifRef.current) return;
      setDaftar(hasil);
      setStatus("selesai");
    } catch (err) {
      if (!aktifRef.current) return;
      setStatus(daftar.length > 0 ? "selesai" : "idle");
      toast(
        "error",
        "Gagal memuat berita",
        err instanceof Error ? err.message : "Coba pindai ulang beberapa saat lagi.",
      );
    }
  }

  const labelTombol =
    status === "memindai"
      ? "Memindai..."
      : status === "selesai"
        ? "Pindai Ulang"
        : "Cek Berita Terbaru dari Nusantara TV";

  return (
    <GlassCard className="p-4 sm:p-5">
      {/* Kepala panel */}
      <div className="flex items-center gap-3">
        <span
          className="glass-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pri"
          aria-hidden="true"
        >
          <Newspaper className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="font-heading text-[15px] font-bold text-teks-utama">
            Cek Berita Terbaru
          </h2>
          <p className="text-[11px] text-teks-sekunder">
            Temukan video berita untuk diproses ulang
          </p>
        </div>
      </div>

      {/* Tombol pindai lebar penuh */}
      <button
        type="button"
        onClick={() => void pindai()}
        disabled={status === "memindai"}
        className={cn(
          "btn-tekan mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl",
          "font-heading text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-70",
        )}
        style={{
          background: "linear-gradient(135deg, #DC2626, #B91C1C)",
          boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
        }}
      >
        {status === "memindai" ? (
          <Radar className="h-4.5 w-4.5 animate-spin" />
        ) : status === "selesai" ? (
          <RefreshCw className="h-4.5 w-4.5" />
        ) : (
          <Radar className="h-4.5 w-4.5" />
        )}
        {labelTombol}
      </button>

      {/* Isi panel menyesuaikan status */}
      <AnimatePresence mode="wait" initial={false}>
        {status === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <EmptyState
              ikon={Newspaper}
              judul="Belum ada berita"
              keterangan="Tekan tombol untuk memindai berita terbaru dari Nusantara TV."
              className="py-6"
            />
          </motion.div>
        )}

        {status === "memindai" && (
          <motion.div
            key="memindai"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {/* Lingkaran radar kaca */}
            <div className="flex flex-col items-center pt-4">
              <div className="relative h-32 w-32">
                <div className="glass absolute inset-0 overflow-hidden rounded-full">
                  <div className="absolute inset-0 rounded-full border border-pri/25" />
                  <div className="absolute inset-[22%] rounded-full border border-pri/20" />
                  <div className="absolute inset-[44%] rounded-full border border-pri/15" />
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "conic-gradient(from 0deg, rgba(220,38,38,0.55), rgba(220,38,38,0.12) 22%, transparent 46%)",
                      animation: "radar-sapu 1.2s linear infinite",
                    }}
                  />
                  <span className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pri shadow-[0_0_12px_rgba(220,38,38,0.9)]" />
                  <span className="absolute top-[30%] left-[64%] h-1.5 w-1.5 animate-ping rounded-full bg-emas" />
                  <span className="absolute top-[62%] left-[33%] h-1.5 w-1.5 animate-ping rounded-full bg-emas [animation-delay:0.6s]" />
                </div>
              </div>
              <p className="mt-3 animate-pulse text-sm font-medium text-teks-sekunder">
                Memindai berita Nusantara TV...
              </p>
            </div>

            {/* Skeleton selama radar berjalan */}
            <div className="mt-4 flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <GlassSkeleton className="h-[72px] w-[72px] shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-2 py-1">
                    <GlassSkeleton className="h-4 w-4/5" />
                    <GlassSkeleton className="h-3 w-2/5" />
                    <GlassSkeleton className="h-3 w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {status === "selesai" && (
          <motion.div
            key="selesai"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mt-4 flex flex-col gap-3"
          >
            {daftar.map((berita, urutan) => (
              <KartuBerita
                key={berita.id}
                berita={berita}
                urutan={urutan}
                onGunakanLink={onGunakanLink}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ------------------------------------------------------------
// KartuBerita — satu kartu berita (kaca tipis)
// ------------------------------------------------------------

function KartuBerita({
  berita,
  urutan,
  onGunakanLink,
}: {
  berita: Berita;
  urutan: number;
  onGunakanLink: (link: string) => void;
}) {
  const [menyalin, setMenyalin] = useState(false);

  async function salin() {
    if (menyalin) return;
    setMenyalin(true);
    const berhasil = await salinTeks(berita.link_video);
    setMenyalin(false);
    if (berhasil) toast("sukses", "Link disalin");
    else toast("error", "Gagal menyalin link");
  }

  function gunakan() {
    onGunakanLink(berita.link_video);
    toast("info", "Link dimasukkan ke form");
  }

  return (
    <FadeInUp delay={Math.min(urutan * 0.06, 0.35)}>
      <div className="glass-soft rounded-2xl p-3">
        <div className="flex gap-3">
          <img
            src={berita.thumbnail_url}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.opacity = "0";
            }}
            className="h-[72px] w-[72px] shrink-0 rounded-xl bg-black/10 object-cover dark:bg-white/10"
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm leading-snug font-semibold text-teks-utama">
              {berita.judul}
            </p>
            <p className="mt-1 text-[11px] text-teks-sekunder">
              {berita.sumber} · {berita.waktu_relatif}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <PlatformIcon platform={berita.platform_asal} size={12} />
              <StatusBadge label={labelPlatform(berita.platform_asal)} warna="netral" />
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="glass-soft flex h-8 min-w-0 flex-1 items-center rounded-lg px-2.5 font-mono text-[10.5px] text-teks-sekunder">
              <span className="truncate">{berita.link_video}</span>
            </span>
            <button
              type="button"
              onClick={() => void salin()}
              aria-label="Salin link video"
              className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-teks-sekunder hover:text-teks-utama"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={gunakan}
            className="btn-tekan flex h-8 w-full items-center justify-center rounded-lg text-[11px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 6px 14px rgba(220, 38, 38, 0.3)",
            }}
          >
            Gunakan Link Ini
          </button>
        </div>
      </div>
    </FadeInUp>
  );
}
