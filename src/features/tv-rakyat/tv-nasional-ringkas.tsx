"use client";

// ============================================================
// TV Rakyat Nasional — RINGKAS untuk Superuser (mode lihat, 16 Okt 2026).
// Satu tampilan analisis tanpa fitur lain: tujuh angka gabungan seluruh akun
// TV Rakyat — jumlah video (katalog Analisis Video, semua waktu) dan pengikut,
// tayangan, jangkauan, suka, komentar, dibagikan (Dashboard TV Nasional).
// Hanya membaca: GET /api/tv-nasional/analisis & GET /api/dashboard/tv-nasional.
// ============================================================

import { useEffect, useState } from "react";
import { Eye, Film, Heart, MessageCircle, Radio, Radar, Share2, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FadeInUp, GlassSkeleton, ThemeToggle } from "@/components/pri-ui";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { formatAngkaRingkas } from "@/lib/format";
import { getAnalisisVideo, getTvNasional, type MetrikNasional } from "@/services";

type Angka = { video: number | null; total: MetrikNasional | null };

const KARTU: { kunci: "video" | keyof MetrikNasional; label: string; Ikon: typeof Film; warna: string }[] = [
  { kunci: "video", label: "Jumlah video", Ikon: Film, warna: "#7C3AED" },
  { kunci: "tayangan", label: "Tayangan", Ikon: Eye, warna: "#0A84FF" },
  { kunci: "pengikut", label: "Pengikut total", Ikon: Users, warna: "#DC2626" },
  { kunci: "jangkauan", label: "Jangkauan", Ikon: Radar, warna: "#0EA5E9" },
  { kunci: "suka", label: "Suka", Ikon: Heart, warna: "#E11D48" },
  { kunci: "komentar", label: "Komentar", Ikon: MessageCircle, warna: "#F59E0B" },
  { kunci: "bagikan", label: "Dibagikan", Ikon: Share2, warna: "#10B981" },
];

export function TvNasionalRingkas({ onBukaNotifikasi }: { onBukaNotifikasi: () => void }) {
  const [angka, setAngka] = useState<Angka | null>(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const [nas, ana] = await Promise.allSettled([getTvNasional(), getAnalisisVideo({ rentang: "semua" })]);
      if (!hidup) return;
      const total = nas.status === "fulfilled" ? nas.value.total : null;
      const video = ana.status === "fulfilled" && ana.value.ringkas ? ana.value.ringkas.video : null;
      if (!total && video === null) {
        const e = nas.status === "rejected" ? nas.reason : ana.status === "rejected" ? ana.reason : null;
        setGalat(e instanceof Error ? e.message : "Data belum bisa dimuat.");
      }
      setAngka({ video, total });
    })();
    return () => {
      hidup = false;
    };
  }, []);

  const nilai = (k: (typeof KARTU)[number]["kunci"]): number | null =>
    !angka ? null : k === "video" ? angka.video : (angka.total?.[k] ?? null);

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <header className="flex items-start justify-between gap-3 pt-5">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{ background: "linear-gradient(135deg, #7C3AED, #5B21B6)", boxShadow: "0 10px 24px rgba(124, 58, 237, 0.35)" }}
            aria-hidden="true"
          >
            <Radio className="h-5.5 w-5.5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">TV Rakyat Nasional</h1>
            <p className="text-xs text-teks-sekunder">Analisis video — angka gabungan seluruh akun TV Rakyat</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TombolLonceng onBuka={onBukaNotifikasi} />
          <ThemeToggle />
        </div>
      </header>

      {galat && <p className="mt-4 rounded-xl bg-gagal/10 px-3 py-2 text-[12px] text-gagal">{galat}</p>}

      <FadeInUp delay={0.03} className="mt-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {KARTU.map(({ kunci, label, Ikon, warna }) => {
            const v = nilai(kunci);
            return (
              <GlassCard key={kunci} className="flex min-w-0 flex-col gap-2 rounded-2xl p-4">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-teks-sekunder">
                  <Ikon className="h-4 w-4 shrink-0" style={{ color: warna }} aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </span>
                {angka === null ? (
                  <GlassSkeleton className="h-8 w-24 rounded-lg" />
                ) : (
                  <span className="angka-tab font-heading text-[26px] leading-none font-extrabold text-teks-utama">
                    {v === null ? "–" : formatAngkaRingkas(v)}
                  </span>
                )}
              </GlassCard>
            );
          })}
        </div>
      </FadeInUp>
      <p className="mt-3 text-[11px] text-teks-sekunder">
        Jumlah video dari katalog Analisis Video (semua waktu). Angka lain gabungan akun Official & anggota yang terhubung.
      </p>
    </div>
  );
}
