"use client";

// ============================================================
// TvNasionalDashboard (1 Sep 2026) — dashboard "TV Rakyat Nasional".
// Statistik gabungan TV Rakyat OFFICIAL (induk) + TV Rakyat PENGGUNA
// (akun pribadi anggota) yang dipisah per 6 sosial media dengan 6
// indikator: pengikut, tayangan, jangkauan, suka, komentar, bagikan —
// plus leaderboard anggota per sosmed yang bisa difilter per indikator.
// Angka ikut penyegaran otomatis (30 dtk + saat aplikasi dibuka lagi).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Crown, RefreshCw, Trophy } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, EmptyState, FadeInUp, GlassSkeleton } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon } from "@/components/platform-icon";
import { getTvNasional, type MetrikNasional, type TvNasional } from "@/services";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { formatAngkaRingkas } from "@/lib/format";
import { cn } from "@/lib/utils";

const LABEL_INDIKATOR: Record<keyof MetrikNasional, string> = {
  pengikut: "Pengikut",
  tayangan: "Tayangan",
  jangkauan: "Jangkauan",
  suka: "Suka",
  komentar: "Komentar",
  bagikan: "Dibagikan",
};

const LABEL_PLATFORM: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};

/** null = platform tidak menyediakan angkanya — tampil strip, bukan 0 palsu. */
function angka(v: number | null): string {
  return v === null ? "–" : formatAngkaRingkas(v);
}

export function TvNasionalDashboard() {
  const [data, setData] = useState<TvNasional | null>(null);
  const [gagal, setGagal] = useState<string | null>(null);
  const [platformPilih, setPlatformPilih] = useState("instagram");
  const [indikatorPilih, setIndikatorPilih] = useState<keyof MetrikNasional>("pengikut");

  useEffect(() => {
    let hidup = true;
    void getTvNasional()
      .then((r) => hidup && setData(r))
      .catch((e) => hidup && setGagal(e instanceof Error ? e.message : "Gagal memuat."));
    return () => {
      hidup = false;
    };
  }, []);
  // Penyegaran diam-diam — angka lama tetap tampil sampai yang baru tiba.
  useSegarOtomatis(() => {
    void getTvNasional()
      .then((r) => {
        setData(r);
        setGagal(null);
      })
      .catch(() => {});
  });

  // Leaderboard: anggota yang PUNYA angka indikator terpilih di platform
  // terpilih, urut menurun. Dihitung di klien — datanya kecil.
  const peringkat = useMemo(() => {
    if (!data) return [];
    return data.anggota
      .map((a) => ({ ...a, nilai: a.platform[platformPilih]?.[indikatorPilih] ?? null }))
      .filter((a): a is typeof a & { nilai: number } => a.nilai !== null)
      .sort((x, y) => y.nilai - x.nilai);
  }, [data, platformPilih, indikatorPilih]);

  if (gagal && !data) {
    return (
      <GlassCard>
        <EmptyState ikon={AlertTriangle} judul="Gagal memuat" keterangan={gagal} />
      </GlassCard>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <GlassSkeleton className="h-40 rounded-2xl" />
        <GlassSkeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const WARNA_JUARA = [
    "linear-gradient(135deg, #F59E0B, #B45309)", // emas
    "linear-gradient(135deg, #9CA3AF, #6B7280)", // perak
    "linear-gradient(135deg, #B45309, #92400E)", // perunggu
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ===== Total nasional (Official + seluruh pengguna, 6 sosmed) ===== */}
      <FadeInUp>
        <GlassCard className="p-4">
          <p className="font-heading text-[15px] font-bold text-teks-utama">
            Total Nasional
          </p>
          <p className="mt-0.5 text-[11px] text-teks-sekunder">
            Gabungan TV Rakyat Official + {data.cakupan.profil_terbaca} akun pengguna,
            seluruh sosial media
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(Object.keys(LABEL_INDIKATOR) as (keyof MetrikNasional)[]).map((k) => (
              <div key={k} className="glass-soft rounded-xl p-2.5 text-center">
                <p className="angka-tab font-heading text-[17px] leading-none font-extrabold text-teks-utama">
                  {angka(data.total[k])}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">
                  {LABEL_INDIKATOR[k]}
                </p>
              </div>
            ))}
          </div>
        </GlassCard>
      </FadeInUp>

      {/* ===== Rincian per sosial media: Official / Pengguna / Total ===== */}
      <FadeInUp delay={0.05}>
        <div className="flex flex-col gap-3">
          {data.platforms.map((plat) => {
            const b = data.per_platform[plat];
            if (!b) return null;
            return (
              <GlassCard key={plat} className="p-4">
                <div className="flex items-center gap-2">
                  <PlatformIcon platform={plat} size={16} denganWadah />
                  <p className="font-heading text-[14px] font-bold text-teks-utama">
                    {LABEL_PLATFORM[plat] ?? plat}
                  </p>
                  <span className="ml-auto text-[10.5px] text-teks-sekunder">
                    {b.official ? "Official ✓" : "Official –"} · {b.akun_terbaca} akun pengguna
                  </span>
                </div>
                <div className="mt-2.5 overflow-x-auto">
                  <table className="w-full min-w-[380px] text-[11.5px]">
                    <thead>
                      <tr className="text-left text-[10px] tracking-wide text-teks-sekunder uppercase">
                        <th className="py-1 pr-2 font-semibold">Indikator</th>
                        <th className="angka-tab py-1 pr-2 text-right font-semibold">Official</th>
                        <th className="angka-tab py-1 pr-2 text-right font-semibold">Pengguna</th>
                        <th className="angka-tab py-1 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Object.keys(LABEL_INDIKATOR) as (keyof MetrikNasional)[]).map((k) => (
                        <tr key={k} className="border-t border-black/5 dark:border-white/10">
                          <td className="py-1.5 pr-2 text-teks-sekunder">
                            {LABEL_INDIKATOR[k]}
                          </td>
                          <td className="angka-tab py-1.5 pr-2 text-right text-teks-utama">
                            {angka(b.official ? b.official[k] : null)}
                          </td>
                          <td className="angka-tab py-1.5 pr-2 text-right text-teks-utama">
                            {angka(b.pengguna[k])}
                          </td>
                          <td className="angka-tab py-1.5 text-right font-bold text-teks-utama">
                            {angka(b.total[k])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </FadeInUp>

      {/* ===== Leaderboard pengguna per sosmed per indikator ===== */}
      <FadeInUp delay={0.1}>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <p className="font-heading text-[15px] font-bold text-teks-utama">
              Leaderboard Pengguna
            </p>
          </div>

          {/* Filter platform (bisa digulir ke samping) */}
          <div className="tanpa-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4">
            {data.platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatformPilih(p)}
                aria-pressed={platformPilih === p}
                className={cn(
                  "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                  platformPilih === p ? "text-white" : "glass text-teks-sekunder",
                )}
                style={
                  platformPilih === p
                    ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                    : undefined
                }
              >
                <PlatformIcon platform={p} size={12} />
                {LABEL_PLATFORM[p] ?? p}
              </button>
            ))}
          </div>

          {/* Filter indikator */}
          <div className="tanpa-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
            {(Object.keys(LABEL_INDIKATOR) as (keyof MetrikNasional)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setIndikatorPilih(k)}
                aria-pressed={indikatorPilih === k}
                className={cn(
                  "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                  indikatorPilih === k ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
                )}
              >
                {LABEL_INDIKATOR[k]}
              </button>
            ))}
          </div>

          {/* Daftar peringkat */}
          {peringkat.length === 0 ? (
            <p className="mt-3 text-[12px] leading-relaxed text-teks-sekunder">
              Belum ada akun pengguna dengan data {LABEL_INDIKATOR[indikatorPilih]} di{" "}
              {LABEL_PLATFORM[platformPilih]}. Data terisi setelah anggota menautkan akun
              dan insight-nya terbaca.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-1.5">
              {peringkat.map((a, i) => (
                <div
                  key={a.user_id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-2.5 py-2",
                    i < 3 ? "text-white" : "glass-soft",
                  )}
                  style={i < 3 ? { background: WARNA_JUARA[i] } : undefined}
                >
                  <span
                    className={cn(
                      "angka-tab w-6 shrink-0 text-center text-[12px] font-extrabold",
                      i < 3 ? "text-white" : "text-teks-sekunder",
                    )}
                  >
                    {i + 1}
                  </span>
                  {a.avatar_url ? (
                    <FotoBulat src={a.avatar_url} ukuran={30} />
                  ) : (
                    <AvatarInisial nama={a.nama} ukuran={30} />
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[12.5px] font-semibold",
                      i < 3 ? "text-white" : "text-teks-utama",
                    )}
                  >
                    {a.nama}
                  </span>
                  {i === 0 && <Crown className="h-4 w-4 shrink-0 text-amber-200" />}
                  <span
                    className={cn(
                      "angka-tab shrink-0 text-[13px] font-extrabold",
                      i < 3 ? "text-white" : "text-teks-utama",
                    )}
                  >
                    {formatAngkaRingkas(a.nilai)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </FadeInUp>

      {/* ===== Cakupan data (jujur soal kesegaran) ===== */}
      <p className="flex items-start gap-1.5 px-1 text-[10.5px] leading-relaxed text-teks-sekunder">
        <RefreshCw className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          Terbaca: {data.cakupan.profil_terbaca}/{data.cakupan.profil_total} profil pengguna ·{" "}
          {data.cakupan.official_terbaca}/6 sosmed Official. {data.cakupan.catatan}
        </span>
      </p>
    </div>
  );
}
