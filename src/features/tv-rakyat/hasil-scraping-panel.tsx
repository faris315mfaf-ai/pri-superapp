"use client";

// ============================================================
// HasilScrapingPanel (fitur 1.22.x/5-bug) — daftar SELURUH hasil
// scraping berita + STATUS tiap item: baru → ditugaskan → video
// dibuat → tayang, beserta PENANGGUNG JAWAB. Bawaan menampilkan
// video HARI INI (sejak 00:00 WIB); toggle "Semua" membuka arsip.
// Maksimal 10 per layar + nomor halaman. Tombol "Pakai" (+) pada
// item yang belum ditugaskan → membuka Bagi Tugas terisi.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ImageOff, Plus, RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { getHasilScraping, type HasilScraping } from "@/services";
import { toast } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";

type WarnaBadge = "hijau" | "biru" | "kuning" | "merah" | "netral";
const BADGE: Record<HasilScraping["tahap"], { label: string; warna: WarnaBadge }> = {
  baru: { label: "Belum dipakai", warna: "netral" },
  ditugaskan: { label: "Ditugaskan", warna: "kuning" },
  video_dibuat: { label: "Video dibuat", warna: "biru" },
  tayang: { label: "Sudah tayang", warna: "hijau" },
};

/** Awal hari ini menurut WIB, dalam epoch ms. */
function awalHariIniWib(): number {
  const wib = new Date(Date.now() + 7 * 3600_000);
  wib.setUTCHours(0, 0, 0, 0);
  return wib.getTime() - 7 * 3600_000;
}

const PER_HAL = 10;

export function HasilScrapingPanel({
  onPakai,
  muatUlang = 0,
}: {
  /** Item yang dipilih untuk dijadikan tugas (membuka Bagi Tugas terisi). */
  onPakai?: (item: HasilScraping) => void;
  muatUlang?: number;
}) {
  const [data, setData] = useState<HasilScraping[] | null>(null);
  const [hanyaHariIni, setHanyaHariIni] = useState(true);
  const [halaman, setHalaman] = useState(1);
  const [memuat, setMemuat] = useState(false);

  async function muat() {
    setMemuat(true);
    try {
      setData(await getHasilScraping());
    } catch (e) {
      setData([]);
      toast("error", "Gagal memuat hasil", e instanceof Error ? e.message : "");
    } finally {
      setMemuat(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => void muat(), 0);
    return () => clearTimeout(id);
  }, [muatUlang]);

  const terfilter = useMemo(() => {
    const list = data ?? [];
    if (!hanyaHariIni) return list;
    const batas = awalHariIniWib();
    return list.filter((b) => new Date(b.waktu_terbit).getTime() >= batas);
  }, [data, hanyaHariIni]);

  const totalHal = Math.max(1, Math.ceil(terfilter.length / PER_HAL));
  const halAman = Math.min(halaman, totalHal);
  const tampil = terfilter.slice((halAman - 1) * PER_HAL, halAman * PER_HAL);

  return (
    <div>
      {/* Toggle hari ini / semua + segarkan */}
      <div className="mb-2.5 flex items-center gap-2">
        {(
          [
            [true, "Hari Ini"],
            [false, "Semua"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setHanyaHariIni(v);
              setHalaman(1);
            }}
            aria-pressed={hanyaHariIni === v}
            className={cn(
              "btn-tekan rounded-full px-3.5 py-1.5 text-xs font-semibold",
              hanyaHariIni === v ? "text-white" : "glass text-teks-sekunder",
            )}
            style={hanyaHariIni === v ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void muat()}
          disabled={memuat}
          aria-label="Segarkan hasil scraping"
          className="glass btn-tekan ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-teks-sekunder disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", memuat && "animate-spin")} />
        </button>
      </div>

      {data === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <GlassSkeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : tampil.length === 0 ? (
        <EmptyState
          ikon={ImageOff}
          judul={hanyaHariIni ? "Belum ada hasil hari ini" : "Belum ada hasil scraping"}
          keterangan="Hasil scraping akun sumber berita akan muncul di sini."
          className="py-8"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {tampil.map((b) => (
            <GlassCard key={b.kode} className="flex items-center gap-3 p-2.5">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black/10 dark:bg-white/10">
                {b.thumbnail_url ? (
                  <img
                    src={b.thumbnail_url}
                    alt=""
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.opacity = "0")}
                    className="h-14 w-14 object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-teks-sekunder/40">
                    <ImageOff className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                )}
                <span className="absolute bottom-0.5 left-0.5">
                  <PlatformIcon platform={b.platform} size={12} denganWadah />
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[13px] font-semibold text-teks-utama">{b.judul}</p>
                <p className="truncate text-[11px] text-teks-sekunder">
                  {b.sumber} · @{b.sumber_akun}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge label={BADGE[b.tahap].label} warna={BADGE[b.tahap].warna} />
                  {b.penanggung && (
                    <span className="text-[10.5px] text-teks-sekunder">
                      PJ: <b className="text-teks-utama/80">{b.penanggung}</b>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <a
                  href={b.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Buka postingan asli"
                  className="btn-tekan p-1 text-teks-sekunder"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
                {b.tahap === "baru" && onPakai && (
                  <button
                    type="button"
                    onClick={() => onPakai(b)}
                    className="btn-tekan flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Pakai
                  </button>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {totalHal > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {Array.from({ length: totalHal }).map((_, i) => {
            const n = i + 1;
            const aktif = n === halAman;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setHalaman(n)}
                aria-current={aktif ? "page" : undefined}
                className={cn(
                  "btn-tekan angka-tab flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[12.5px] font-bold",
                  aktif ? "text-white" : "glass text-teks-sekunder",
                )}
                style={aktif ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
              >
                {n}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
