"use client";

// ============================================================
// RiwayatVideo — riwayat pemrosesan video TV Rakyat.
// Filter chip status + daftar video (8 data dari services)
// dengan badge status, platform terunggah, dan aksi.
// ============================================================

import { useEffect, useState } from "react";
import { ExternalLink, History, RotateCcw, VideoOff } from "lucide-react";
import { EmptyState, FadeInUp, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon } from "@/components/platform-icon";
import { getVideoAntrian } from "@/services";
import { toast } from "@/hooks/use-app-store";
import { jamWIB } from "@/lib/format";
import type { VideoAntrian } from "@/types";
import { cn } from "@/lib/utils";

type StatusFilter =
  | "SEMUA"
  | "SUDAH DIPROSES"
  | "SEDANG DIPROSES"
  | "MENUNGGU DOKSLI"
  | "GAGAL";

const CHIP_FILTER: { id: StatusFilter; label: string }[] = [
  { id: "SEMUA", label: "Semua" },
  { id: "SUDAH DIPROSES", label: "Diposting" },
  { id: "SEDANG DIPROSES", label: "Diproses" },
  { id: "MENUNGGU DOKSLI", label: "Menunggu" },
  { id: "GAGAL", label: "Gagal" },
];

type WarnaBadge = "hijau" | "biru" | "kuning" | "merah" | "netral";

const BADGE_STATUS: Record<string, { label: string; warna: WarnaBadge; berkedip?: boolean }> = {
  "SUDAH DIPROSES": { label: "Sudah Diposting", warna: "hijau" },
  "SEDANG DIPROSES": { label: "Sedang Diproses", warna: "biru", berkedip: true },
  "MENUNGGU DOKSLI": { label: "Menunggu Doksli", warna: "kuning" },
  GAGAL: { label: "Gagal", warna: "merah" },
};

const BULAN_SINGKAT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** "2026-08-23T06:45:00+07:00" → "06.45, 23 Agu" */
function formatJamTanggal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${jamWIB(iso)}, ${d.getDate()} ${BULAN_SINGKAT[d.getMonth()]}`;
}

/** Data riwayat yang tersimpan bersama kunci refreshKey-nya */
type CacheRiwayat = {
  kunci: number;
  data: VideoAntrian[];
  ringkasan: Record<string, number>;
};

export function RiwayatVideo({ refreshKey }: { refreshKey: number }) {
  const [cache, setCache] = useState<CacheRiwayat | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("SEMUA");

  // Muat ulang data saat mount dan setiap refreshKey naik.
  // Saat kunci cache tidak cocok → tampil skeleton (sedang memuat).
  useEffect(() => {
    let aktif = true;
    getVideoAntrian()
      .then((respons) => {
        if (!aktif) return;
        setCache({ kunci: refreshKey, data: respons.data, ringkasan: respons.ringkasan });
      })
      .catch((err: unknown) => {
        if (!aktif) return;
        setCache({ kunci: refreshKey, data: [], ringkasan: {} });
        toast(
          "error",
          "Gagal memuat riwayat",
          err instanceof Error ? err.message : "Coba muat ulang beberapa saat lagi.",
        );
      });
    return () => {
      aktif = false;
    };
  }, [refreshKey]);

  const siap = cache !== null && cache.kunci === refreshKey;
  const video: VideoAntrian[] | null = siap ? cache.data : null;
  const jumlahPerStatus: Record<string, number> = siap ? cache.ringkasan : {};

  const terfilter =
    video === null ? [] : video.filter((v) => filter === "SEMUA" || v.status === filter);

  function jumlahChip(id: StatusFilter): number {
    if (video === null) return 0;
    if (id === "SEMUA") return video.length;
    return jumlahPerStatus[id] ?? 0;
  }

  return (
    <GlassCard className="p-4 sm:p-5">
      {/* Kepala panel */}
      <div className="flex items-center gap-3">
        <span
          className="glass-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pri"
          aria-hidden="true"
        >
          <History className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-[15px] font-bold text-teks-utama">
            Riwayat Pemrosesan
          </h2>
          <p className="text-[11px] text-teks-sekunder">
            {video === null ? "Memuat riwayat…" : `${video.length} video tercatat`}
          </p>
        </div>
      </div>

      {/* Filter chip status */}
      <div className="tanpa-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {CHIP_FILTER.map((chip) => {
          const aktifChip = filter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              aria-pressed={aktifChip}
              className={cn(
                "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold",
                aktifChip
                  ? "text-white"
                  : "glass text-teks-sekunder hover:text-teks-utama",
              )}
              style={
                aktifChip
                  ? {
                      background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                      boxShadow: "0 6px 16px rgba(220, 38, 38, 0.3)",
                    }
                  : undefined
              }
            >
              {chip.label}
              <span className={cn("angka-tab", aktifChip ? "text-white/80" : "text-teks-sekunder/70")}>
                {jumlahChip(chip.id)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Isi daftar */}
      <div className="mt-4 flex flex-col gap-3">
        {video === null ? (
          // Skeleton loading (4 baris)
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <GlassSkeleton className="h-14 w-14 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2 py-1">
                  <GlassSkeleton className="h-4 w-4/5" />
                  <GlassSkeleton className="h-3 w-2/5" />
                  <GlassSkeleton className="h-5 w-28 rounded-full" />
                </div>
              </div>
            ))}
          </>
        ) : terfilter.length === 0 ? (
          <EmptyState
            ikon={VideoOff}
            judul="Tidak ada video dengan status ini"
            keterangan="Coba pilih filter lain atau proses video baru di atas."
            className="py-8"
          />
        ) : (
          terfilter.map((v, i) => <ItemVideo key={v.id} video={v} urutan={i} />)
        )}
      </div>
    </GlassCard>
  );
}

// ------------------------------------------------------------
// ItemVideo — satu baris riwayat video
// ------------------------------------------------------------

function ItemVideo({ video, urutan }: { video: VideoAntrian; urutan: number }) {
  const badge = BADGE_STATUS[video.status] ?? { label: video.status, warna: "netral" as WarnaBadge };

  return (
    <FadeInUp delay={Math.min(urutan * 0.04, 0.25)}>
      <div className="glass-soft rounded-2xl p-3">
        <div className="flex gap-3">
          <img
            src={video.thumbnail_url}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.opacity = "0";
            }}
            className="h-14 w-14 shrink-0 rounded-xl bg-black/10 object-cover dark:bg-white/10"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-1 min-w-0 flex-1 text-sm leading-snug font-semibold text-teks-utama">
                {video.judul}
              </p>
              <StatusBadge
                label={badge.label}
                warna={badge.warna}
                berkedip={badge.berkedip}
                className="shrink-0"
              />
            </div>
            <p className="mt-1 text-[11px] text-teks-sekunder angka-tab">
              {formatJamTanggal(video.jam_tanggal)}
            </p>

            {/* Baris platform terunggah + tautan postingan */}
            {video.status === "SUDAH DIPROSES" && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {video.platform_terunggah.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {video.platform_terunggah.map((p) => (
                      <PlatformIcon key={p} platform={p} size={14} />
                    ))}
                  </div>
                )}
                {video.link_instagram && (
                  <button
                    type="button"
                    onClick={() =>
                      window.open(video.link_instagram, "_blank", "noopener,noreferrer")
                    }
                    className="btn-tekan inline-flex items-center gap-1 text-[11px] font-semibold text-pri"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Lihat Postingan
                  </button>
                )}
              </div>
            )}

            {/* Tombol coba lagi untuk video gagal */}
            {video.status === "GAGAL" && (
              <button
                type="button"
                onClick={() => toast("info", "Video dimasukkan kembali ke antrian")}
                className="btn-tekan mt-1.5 inline-flex items-center gap-1 rounded-lg border border-pri/40 bg-pri/5 px-2.5 py-1 text-[11px] font-semibold text-pri"
              >
                <RotateCcw className="h-3 w-3" />
                Coba Lagi
              </button>
            )}
          </div>
        </div>
      </div>
    </FadeInUp>
  );
}
