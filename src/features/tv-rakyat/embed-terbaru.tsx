"use client";

// ============================================================
// EmbedTerbaru — galeri 30 postingan terbaru SELURUH sosmed TV
// Rakyat dengan metrik di bawahnya (spek 1.15).
//
// Hemat kuota & ringan: kartu menampilkan THUMBNAIL dulu; iframe
// embed resmi (IG/TikTok/YT/FB — diizinkan frame-src CSP) baru
// dimuat saat kartunya diketuk. Threads/X tanpa embed -> tautan.
// Datanya dari cache server 15 menit (Ayrshare /history).
// ============================================================

import { useEffect, useState } from "react";
import { ExternalLink, Play, RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, FadeInUp, GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { getEmbedTerbaru, type PostinganEmbed } from "@/services";
import { formatAngkaRingkas } from "@/lib/format";
import { urlEmbedDari } from "@/lib/embed-sosmed";
import { Clapperboard } from "lucide-react";

export function EmbedTerbaru() {
  const [daftar, setDaftar] = useState<PostinganEmbed[] | null>(null);
  const [dimuat, setDimuat] = useState<Set<string>>(new Set());
  const [muatUlang, setMuatUlang] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getEmbedTerbaru();
        if (hidup) setDaftar(hasil);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  return (
    <FadeInUp delay={0.06}>
      <div className="mt-5 flex items-center justify-between">
        <SectionTitle judul="Konten Terbaru Sosmed" className="!mt-0" />
        <button
          type="button"
          onClick={() => {
            setDaftar(null);
            setMuatUlang((n) => n + 1);
          }}
          aria-label="Muat ulang konten"
          className="btn-tekan p-1.5 text-teks-sekunder"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {daftar === null ? (
        <GlassSkeleton className="mt-2 h-40 rounded-2xl" />
      ) : daftar.length === 0 ? (
        <GlassCard className="mt-2 p-1">
          <EmptyState
            ikon={Clapperboard}
            judul="Belum Ada Konten"
            keterangan="Postingan terbaru seluruh sosmed TV Rakyat akan tampil di sini."
            className="py-8"
          />
        </GlassCard>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {daftar.map((p) => {
            const kunci = `${p.platform}-${p.id}`;
            const embed = urlEmbedDari(p.platform, p.url);
            const sedangEmbed = dimuat.has(kunci);
            return (
              <GlassCard key={kunci} className="kartu-hover overflow-hidden p-0">
                {/* Media: thumbnail -> ketuk -> iframe embed resmi */}
                {sedangEmbed && embed ? (
                  <iframe
                    src={embed}
                    title={`Embed ${p.platform}`}
                    className="aspect-[4/5] w-full border-0"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (embed) {
                        setDimuat((s) => new Set(s).add(kunci));
                      } else {
                        window.open(p.url, "_blank", "noopener,noreferrer");
                      }
                    }}
                    aria-label={embed ? "Putar video" : "Buka postingan"}
                    className="btn-tekan relative block aspect-[4/5] w-full overflow-hidden"
                  >
                    {p.thumbnail ? (
                      <img
                        src={p.thumbnail}
                        alt={p.teks.slice(0, 60) || "Thumbnail konten"}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-teks-sekunder/10">
                        <Clapperboard className="h-10 w-10 text-teks-sekunder/50" aria-hidden="true" />
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black">
                        {embed ? (
                          <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />
                        ) : (
                          <ExternalLink className="h-5 w-5" aria-hidden="true" />
                        )}
                      </span>
                    </span>
                    <span className="absolute top-2 left-2">
                      <PlatformIcon platform={p.platform} size={18} denganWadah />
                    </span>
                  </button>
                )}

                {/* Metrik: suka, komentar, tayangan, jangkauan, dll. */}
                <div className="p-3">
                  {p.teks && (
                    <p className="line-clamp-2 text-[11.5px] leading-snug text-teks-utama">
                      {p.teks}
                    </p>
                  )}
                  {p.metrik.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {p.metrik.slice(0, 4).map((m) => (
                        <span key={m.label} className="text-[10.5px] text-teks-sekunder">
                          <span className="angka-tab font-extrabold text-teks-utama">
                            {formatAngkaRingkas(m.nilai)}
                          </span>{" "}
                          {m.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[10px] text-teks-sekunder/70">
                      Platform ini tidak membagikan angka per postingan.
                    </p>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </FadeInUp>
  );
}
