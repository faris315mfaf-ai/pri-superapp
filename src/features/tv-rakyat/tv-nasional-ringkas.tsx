"use client";

// ============================================================
// TV Rakyat Nasional — RINGKAS untuk Superuser (mode lihat, 16 Okt 2026).
// Satu tampilan analisis tanpa fitur lain:
//   • pilihan periode Hari ini / 1 minggu / 1 bulan / Selamanya;
//   • tujuh angka gabungan seluruh akun TV Rakyat. Jumlah video, tayangan,
//     suka, komentar, dibagikan = SAMA PERSIS dengan layar Analisis Video
//     (katalog video mesin, video yang terbit dalam periode). Pengikut &
//     jangkauan bukan angka per video → dari analitik akun (total, atau
//     kenaikan dalam periode);
//   • jumlah akun sosmed terdaftar di SuperApp + rinciannya per sosmed.
// Hanya membaca: /api/tv-nasional/kenaikan, /api/tv-nasional/video-harian,
// /api/tv-nasional/analisis, /api/dashboard/tv-nasional.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Eye, Film, Heart, MessageCircle, Radar, Radio, Share2, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon } from "@/components/platform-icon";
import { FadeInUp, GlassSkeleton, ThemeToggle } from "@/components/pri-ui";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { formatAngkaRingkas, urlProfilSosmed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getAnalisisVideo, getKenaikanNasional, getTvNasional, type IndikatorNasional, type TvNasional } from "@/services";

const PERIODE = [
  { kunci: "hari_ini", label: "Hari ini" },
  { kunci: "minggu", label: "1 minggu" },
  { kunci: "bulan", label: "1 bulan" },
  { kunci: "semua", label: "Selamanya" },
] as const;
type Periode = (typeof PERIODE)[number]["kunci"];

const KARTU: { kunci: "video" | IndikatorNasional; label: string; Ikon: typeof Film; warna: string }[] = [
  { kunci: "video", label: "Jumlah video", Ikon: Film, warna: "#7C3AED" },
  { kunci: "tayangan", label: "Tayangan", Ikon: Eye, warna: "#0A84FF" },
  { kunci: "pengikut", label: "Pengikut total", Ikon: Users, warna: "#DC2626" },
  { kunci: "jangkauan", label: "Jangkauan", Ikon: Radar, warna: "#0EA5E9" },
  { kunci: "suka", label: "Suka", Ikon: Heart, warna: "#E11D48" },
  { kunci: "komentar", label: "Komentar", Ikon: MessageCircle, warna: "#F59E0B" },
  { kunci: "bagikan", label: "Dibagikan", Ikon: Share2, warna: "#10B981" },
];

const NAMA_PLATFORM: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X (Twitter)",
  x: "X (Twitter)",
};

type Angka = {
  /** Dari katalog Analisis Video (per video). null = belum tersedia. */
  video: { video: number; tayangan: number; suka: number; komentar: number; bagikan: number } | null;
  /** Pengikut & jangkauan dari analitik akun. */
  akun: { pengikut: number | null; jangkauan: number | null } | null;
  /** "13 Agu 2023 – 16 Okt 2026 · 778 akun" seperti layar Analisis Video. */
  keterangan: string;
  menyusun: boolean;
};

const RENTANG_ANALISIS = { hari_ini: "1", minggu: "7", bulan: "30", semua: "semua" } as const;
const tanggalPendek = (t: string) =>
  new Date(`${t}T00:00:00+07:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

export function TvNasionalRingkas({ onBukaNotifikasi }: { onBukaNotifikasi: () => void }) {
  const [periode, setPeriode] = useState<Periode>("semua");
  const [angka, setAngka] = useState<{ periode: Periode; isi: Angka } | null>(null);
  const [galat, setGalat] = useState("");
  const [nasional, setNasional] = useState<TvNasional | null>(null);
  const [buka, setBuka] = useState<string | null>(null);

  // Angka per periode. Katalog Analisis Video bisa sedang disusun (menyusun) → coba lagi sebentar.
  useEffect(() => {
    let hidup = true;
    let ulang: ReturnType<typeof setTimeout> | null = null;
    const muat = async () => {
      const [ana, ken] = await Promise.allSettled([
        getAnalisisVideo({ rentang: RENTANG_ANALISIS[periode] }),
        periode === "semua" ? Promise.resolve(null) : getKenaikanNasional(periode),
      ]);
      if (!hidup) return;
      const a = ana.status === "fulfilled" ? ana.value : null;
      const menyusun = Boolean(a?.menyusun && !a.ringkas);
      const video = a?.ringkas
        ? { video: a.ringkas.video, tayangan: a.ringkas.tayangan, suka: a.ringkas.suka, komentar: a.ringkas.komentar, bagikan: a.ringkas.bagikan }
        : null;
      const keterangan =
        a?.ringkas && "dari" in a
          ? `${a.dari === a.sampai ? tanggalPendek(a.sampai) : `${tanggalPendek(a.dari)} – ${tanggalPendek(a.sampai)}`} · ${a.jumlah_akun.toLocaleString("id-ID")} akun`
          : "";
      const k = ken.status === "fulfilled" ? ken.value : null;
      const akun = k ? { pengikut: k.kenaikan.pengikut, jangkauan: k.kenaikan.jangkauan } : null;
      if (!video && !menyusun && ana.status === "rejected") {
        setGalat(ana.reason instanceof Error ? ana.reason.message : "Data belum bisa dimuat.");
      } else {
        setGalat("");
      }
      setAngka({ periode, isi: { video, akun, keterangan, menyusun } });
      if (menyusun) ulang = setTimeout(() => void muat(), 8000);
    };
    void muat();
    return () => {
      hidup = false;
      if (ulang) clearTimeout(ulang);
    };
  }, [periode]);

  // Akun terdaftar (sekali).
  useEffect(() => {
    let hidup = true;
    getTvNasional()
      .then((d) => hidup && setNasional(d))
      .catch(() => undefined);
    return () => {
      hidup = false;
    };
  }, []);

  /** Akun anggota per sosmed: [{platform, akun:[{handle, nama}]}], urut terbanyak. */
  const perSosmed = useMemo(() => {
    const peta = new Map<string, { handle: string; nama: string }[]>();
    for (const a of nasional?.anggota ?? []) {
      for (const [platform, handle] of Object.entries(a.akun ?? {})) {
        if (!handle) continue;
        const daftar = peta.get(platform) ?? [];
        daftar.push({ handle: handle.replace(/^@/, ""), nama: a.nama });
        peta.set(platform, daftar);
      }
    }
    return [...peta.entries()]
      .map(([platform, akun]) => ({ platform, akun: akun.sort((x, y) => x.handle.localeCompare(y.handle)) }))
      .sort((x, y) => y.akun.length - x.akun.length);
  }, [nasional]);
  const jumlahAkun = nasional?.akun_terhubung?.total ?? perSosmed.reduce((n, s) => n + s.akun.length, 0);
  const jumlahOrang = nasional?.akun_terhubung?.orang ?? nasional?.anggota.length ?? 0;

  const isi = angka && angka.periode === periode ? angka.isi : null;
  const kenaikan = periode !== "semua";
  const nilai = (k: (typeof KARTU)[number]["kunci"]): number | null => {
    if (!isi) return null;
    if (k === "pengikut" || k === "jangkauan") {
      return kenaikan ? (isi.akun?.[k] ?? null) : (nasional?.total[k] ?? null);
    }
    return isi.video ? isi.video[k] : null;
  };
  /** Tanda + hanya untuk angka kenaikan (pengikut & jangkauan di periode selain Selamanya). */
  const plus = (k: (typeof KARTU)[number]["kunci"]) => kenaikan && (k === "pengikut" || k === "jangkauan");

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

      <div role="tablist" aria-label="Periode" className="glass mt-5 grid grid-cols-4 gap-1 rounded-2xl p-1">
        {PERIODE.map((p) => (
          <button
            key={p.kunci}
            type="button"
            role="tab"
            aria-selected={periode === p.kunci}
            onClick={() => setPeriode(p.kunci)}
            className={cn(
              "btn-tekan min-h-10 rounded-xl text-[13px] font-bold",
              periode === p.kunci ? "bg-pri/15 text-pri" : "text-teks-sekunder",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {galat && <p className="mt-3 rounded-xl bg-gagal/10 px-3 py-2 text-[12px] text-gagal">{galat}</p>}

      <FadeInUp delay={0.03} className="mt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {KARTU.map(({ kunci, label, Ikon, warna }) => {
            const v = nilai(kunci);
            return (
              <GlassCard key={kunci} className="flex min-w-0 flex-col gap-2 rounded-2xl p-4">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-teks-sekunder">
                  <Ikon className="h-4 w-4 shrink-0" style={{ color: warna }} aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </span>
                {isi === null || (isi.menyusun && kunci !== "pengikut" && kunci !== "jangkauan") ? (
                  <GlassSkeleton className="h-8 w-24 rounded-lg" />
                ) : (
                  <span className="angka-tab font-heading text-[26px] leading-none font-extrabold text-teks-utama">
                    {v === null ? "–" : `${plus(kunci) && v > 0 ? "+" : ""}${formatAngkaRingkas(v)}`}
                  </span>
                )}
              </GlassCard>
            );
          })}
        </div>
      </FadeInUp>
      <p className="mt-3 text-[11px] leading-relaxed text-teks-sekunder">
        {isi?.keterangan ? <b className="font-semibold text-teks-utama">{isi.keterangan}. </b> : null}
        {isi?.menyusun ? "Katalog video sedang disusun, angka muncul sebentar lagi. " : null}
        Video, tayangan, suka, komentar & dibagikan = angka Analisis Video (video yang terbit dalam periode).
        Pengikut & jangkauan dari analitik akun{kenaikan ? " (kenaikan dalam periode)" : " (total saat ini)"}.
      </p>

      {/* Akun sosmed terdaftar di SuperApp */}
      <FadeInUp delay={0.05} className="mt-6">
        <GlassCard className="rounded-2xl p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-heading text-[15px] font-bold text-teks-utama">Akun sosmed terdaftar</p>
            {nasional ? (
              <p className="text-[12px] text-teks-sekunder">
                <b className="angka-tab text-teks-utama">{jumlahAkun.toLocaleString("id-ID")}</b> akun dari{" "}
                <b className="angka-tab text-teks-utama">{jumlahOrang.toLocaleString("id-ID")}</b> orang
              </p>
            ) : (
              <GlassSkeleton className="h-4 w-40 rounded" />
            )}
          </div>

          {nasional && (
            <div className="mt-3 flex flex-col gap-2">
              {perSosmed.length === 0 ? (
                <p className="text-[12px] text-teks-sekunder">Belum ada akun anggota yang terhubung.</p>
              ) : (
                perSosmed.map(({ platform, akun }) => {
                  const terbuka = buka === platform;
                  const official = nasional.akun_terhubung?.per_platform?.[platform]?.official;
                  return (
                    <div key={platform} className="glass-soft rounded-xl">
                      <button
                        type="button"
                        onClick={() => setBuka(terbuka ? null : platform)}
                        aria-expanded={terbuka}
                        className="btn-tekan flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                      >
                        <PlatformIcon platform={platform} size={18} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-teks-utama">
                          {NAMA_PLATFORM[platform] ?? platform}
                          {official ? <span className="ml-1.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400">+ Official</span> : null}
                        </span>
                        <span className="angka-tab text-[13px] font-bold text-teks-utama">{akun.length.toLocaleString("id-ID")}</span>
                        <ChevronDown className={cn("h-4 w-4 text-teks-sekunder transition-transform", terbuka && "rotate-180")} aria-hidden="true" />
                      </button>
                      {terbuka && (
                        <ul className="scrollbar-tipis max-h-80 overflow-y-auto border-t border-black/5 px-3 py-1.5 dark:border-white/10">
                          {akun.map((a) => (
                            <li key={`${a.handle}-${a.nama}`} className="flex min-w-0 items-center gap-2 py-1.5">
                              <a
                                href={urlProfilSosmed(platform, a.handle)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] font-semibold text-teks-utama"
                              >
                                <span className="truncate">@{a.handle}</span>
                                <ExternalLink className="h-3 w-3 shrink-0 text-teks-sekunder" aria-hidden="true" />
                              </a>
                              <span className="max-w-[45%] truncate text-[11.5px] text-teks-sekunder">{a.nama}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </GlassCard>
      </FadeInUp>
    </div>
  );
}
