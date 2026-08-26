"use client";

// ============================================================
// InsightDetailScreen — insight RINCI akun TV Rakyat official.
//
// Dibuka dengan mengetuk panel Insight di modul TV Rakyat. Isinya:
// 1. Pemilih 5 platform (Instagram, TikTok, YouTube, Facebook, Threads)
// 2. Ringkasan profil platform terpilih (pengikut, tayangan, dst.)
// 3. Daftar POSTINGAN dengan angkanya masing-masing
//
// Kejujuran data: kekayaan angka per postingan berbeda tiap platform,
// dan yang tidak disediakan API TIDAK ditampilkan sebagai nol. TikTok
// memberi paling banyak; YouTube dan Threads tidak memberi angka per
// konten sama sekali — itu dinyatakan terang-terangan, bukan disamarkan.
// ============================================================

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  ExternalLink,
  Eye,
  Film,
  Heart,
  RefreshCw,
  Radar,
  Users,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, FadeInUp, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import {
  getInsightDetail,
  getInsightSosmed,
  type BalasanInsight,
  type PostinganInsight,
} from "@/services";
import { formatAngkaRingkas, jamWIB, tanggalIndonesia } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLATFORM = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook" },
  { id: "threads", label: "Threads" },
] as const;

/** Platform yang API-nya tidak memberi angka per postingan */
const TANPA_METRIK_POSTINGAN = new Set(["youtube", "threads"]);

export function InsightDetailScreen({ onKembali }: { onKembali: () => void }) {
  const [platform, setPlatform] = useState<string>("instagram");
  const [profil, setProfil] = useState<BalasanInsight | null>(null);
  const [postingan, setPostingan] = useState<PostinganInsight[] | null>(null);
  const [menyegarkan, setMenyegarkan] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      // Kosongkan dulu supaya skeleton muncul saat berganti platform.
      // setState-nya SETELAH await (aturan lint react-hooks proyek ini
      // melarang setState sinkron di badan effect).
      await Promise.resolve();
      if (!hidup) return;
      setProfil(null);
      setPostingan(null);

      // Dua sumber terpisah: ringkasan profil & daftar postingan.
      // Kegagalan salah satunya tidak menggugurkan yang lain.
      const [ringkas, rinci] = await Promise.allSettled([
        getInsightSosmed(false, platform),
        getInsightDetail(platform),
      ]);
      if (!hidup) return;
      setProfil(ringkas.status === "fulfilled" ? ringkas.value : null);
      setPostingan(rinci.status === "fulfilled" ? rinci.value.data : []);
    })();
    return () => {
      hidup = false;
    };
  }, [platform]);

  async function segarkan() {
    if (menyegarkan) return;
    setMenyegarkan(true);
    try {
      const [ringkas, rinci] = await Promise.all([
        getInsightSosmed(true, platform),
        getInsightDetail(platform, true),
      ]);
      setProfil(ringkas);
      setPostingan(rinci.data);
      toast("sukses", "Insight disegarkan");
    } catch (e) {
      toast("error", "Gagal menyegarkan", e instanceof Error ? e.message : "");
    } finally {
      setMenyegarkan(false);
    }
  }

  const i = profil?.insight ?? null;

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-16">
      {/* Kepala */}
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-xl font-extrabold tracking-tight text-teks-utama">
            Insight Rinci
          </h1>
          <p className="text-xs text-teks-sekunder">Akun resmi TV Rakyat</p>
        </div>
        <button
          type="button"
          onClick={() => void segarkan()}
          disabled={menyegarkan}
          aria-label="Segarkan"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", menyegarkan && "animate-spin")} />
        </button>
      </header>

      {/* Pemilih platform */}
      <div className="scrollbar-tipis mt-4 flex gap-2 overflow-x-auto pb-1">
        {PLATFORM.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlatform(p.id)}
            className={cn(
              "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold",
              platform === p.id ? "text-white" : "glass text-teks-sekunder",
            )}
            style={
              platform === p.id
                ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                : undefined
            }
          >
            <PlatformIcon platform={p.id} size={13} />
            {p.label}
          </button>
        ))}
      </div>

      {/* Ringkasan profil */}
      <FadeInUp>
        <GlassCard className="mt-3 p-4">
          {profil === null ? (
            <GlassSkeleton className="h-24 rounded-xl" />
          ) : !i ? (
            <p className="py-4 text-center text-xs leading-relaxed text-teks-sekunder">
              Akun {platform} belum tertaut di Ayrshare.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                {i.fotoProfil ? (
                  <img
                    src={i.fotoProfil}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pri/10">
                    <BarChart3 className="h-5 w-5 text-pri" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-teks-utama">
                    {i.nama || i.username}
                  </p>
                  <p className="truncate text-[11px] text-teks-sekunder">@{i.username}</p>
                </div>
                {profil?.kedaluwarsa && <StatusBadge label="data lama" warna="kuning" />}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {(
                  [
                    { label: "Pengikut", nilai: i.pengikut, Ikon: Users, warna: "#DC2626" },
                    { label: "Tayangan", nilai: i.tayangan, Ikon: Eye, warna: "#10B981" },
                    { label: "Suka", nilai: i.suka, Ikon: Heart, warna: "#EC4899" },
                    { label: "Konten", nilai: i.jumlahMedia, Ikon: Film, warna: "#3B82F6" },
                    { label: "Komentar", nilai: i.komentar, Ikon: BarChart3, warna: "#F59E0B" },
                    { label: "Jangkauan", nilai: i.jangkauan, Ikon: Radar, warna: "#8B5CF6" },
                  ] as const
                ).map((m) => (
                  <div key={m.label} className="glass-soft rounded-xl px-2 py-2 text-center">
                    <m.Ikon
                      className="mx-auto h-3.5 w-3.5"
                      style={{ color: m.warna }}
                      aria-hidden="true"
                    />
                    <p className="angka-tab mt-1 font-heading text-sm font-extrabold text-teks-utama">
                      {m.nilai === null ? "–" : formatAngkaRingkas(m.nilai)}
                    </p>
                    <p className="text-[9px] text-teks-sekunder">{m.label}</p>
                  </div>
                ))}
              </div>

              {i.diperbarui && (
                <p className="mt-2.5 text-center text-[10px] text-teks-sekunder/80">
                  Diperbarui Ayrshare pukul {jamWIB(i.diperbarui)} WIB
                </p>
              )}
            </>
          )}
        </GlassCard>
      </FadeInUp>

      {/* Daftar postingan */}
      <FadeInUp delay={0.06}>
        <div className="mt-5 flex items-center justify-between">
          <h2 className="font-heading text-sm font-bold text-teks-utama">
            Postingan Terbaru
          </h2>
          {postingan && postingan.length > 0 && (
            <span className="text-[11px] text-teks-sekunder">{postingan.length} konten</span>
          )}
        </div>

        {TANPA_METRIK_POSTINGAN.has(platform) && (
          <p className="mt-1.5 rounded-xl border border-emas/30 bg-emas/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
            {platform === "youtube" ? "YouTube" : "Threads"} tidak memberikan angka per
            konten lewat Ayrshare, jadi yang tampil hanya daftar postingannya. Angka
            keseluruhan akun tetap terbaca di ringkasan atas.
          </p>
        )}

        {postingan === null ? (
          <div className="mt-2 flex flex-col gap-2">
            <GlassSkeleton className="h-24 rounded-2xl" />
            <GlassSkeleton className="h-24 rounded-2xl" />
          </div>
        ) : postingan.length === 0 ? (
          <GlassCard className="mt-2 p-1">
            <EmptyState
              ikon={Film}
              judul="Belum Ada Postingan"
              keterangan="Ayrshare belum menemukan konten di akun ini."
              className="py-6"
            />
          </GlassCard>
        ) : (
          <div className="mt-2 flex flex-col gap-2 md:grid md:grid-cols-2 md:items-start">
            {postingan.map((p, idx) => (
              <motion.div
                key={p.id || idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.25), duration: 0.25 }}
              >
                <GlassCard className="p-3">
                  <div className="flex gap-3">
                    {p.thumbnail ? (
                      <img
                        src={p.thumbnail}
                        alt=""
                        loading="lazy"
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-black/10 dark:bg-white/10">
                        <Film className="h-5 w-5 text-teks-sekunder" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[12.5px] leading-snug font-semibold text-teks-utama">
                        {p.teks || "(tanpa keterangan)"}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-[10px] text-teks-sekunder">
                        {p.jenis && (
                          <span className="rounded-full bg-black/5 px-1.5 py-px dark:bg-white/10">
                            {p.jenis}
                          </span>
                        )}
                        {p.waktu ? tanggalIndonesia(p.waktu) : ""}
                      </p>
                    </div>
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Buka postingan"
                        className="btn-tekan h-fit p-1.5 text-teks-sekunder"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  {p.metrik.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {p.metrik.map((m) => (
                        <span
                          key={m.label}
                          className="glass-soft rounded-lg px-2 py-1 text-[10px] font-semibold text-teks-utama"
                        >
                          <span className="text-teks-sekunder">{m.label} </span>
                          <span className="angka-tab">{formatAngkaRingkas(m.nilai)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}
      </FadeInUp>
    </div>
  );
}
