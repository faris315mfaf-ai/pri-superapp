"use client";

// ============================================================
// TvAnalitikDashboard (fitur 1.19/3.3.d) — sub-dashboard analitik
// TV Rakyat, BACA-SAJA:
//
// - 6 kartu ringkasan (produksi, terunggah, post sukses/gagal,
//   interaksi, produser aktif) dengan filter periode 7/30/90 hari.
// - 4 grafik: tren produksi vs unggahan (area), posting per platform
//   (bar susun sukses/gagal), distribusi status pipeline (pie),
//   interaksi harian (area).
// - Video populer: peringkat interaksi dalam aplikasi, badge 🏆🥈🥉.
// - Performa per platform: kartu per platform + SPARKLINE unggahan.
// - Aktivitas terkini: umpan kejadian, disegarkan tiap 30 detik.
//
// Semua angka berasal dari pipeline video_antrian + interaksi_video
// yang nyata — tidak ada metrik tebak-tebakan.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Clapperboard } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { TvAnggotaPanel } from "./tv-anggota-panel";
import { toast } from "@/hooks/use-app-store";
import {
  getDashboardTv,
  getDashboardTvAktivitas,
  type TvDashboardData,
} from "@/services";
import { cn } from "@/lib/utils";

function labelTanggal(t: string): string {
  return `${t.slice(8, 10)}/${t.slice(5, 7)}`;
}

/** "5 mnt lalu" dari ISO — cukup kasar untuk umpan aktivitas. */
function waktuRelatif(iso: string): string {
  const selisih = Date.now() - Date.parse(iso);
  if (!Number.isFinite(selisih) || selisih < 0) return "baru saja";
  const menit = Math.floor(selisih / 60_000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} mnt lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

const WARNA_STATUS = ["#10B981", "#F59E0B", "#3B82F6", "#DC2626", "#8B5CF6", "#94A3B8"];
const BADGE_JUARA = ["🏆", "🥈", "🥉"];

export function TvAnalitikDashboard() {
  const [data, setData] = useState<TvDashboardData | null>(null);
  const [gagal, setGagal] = useState(false);
  const [hari, setHari] = useState<7 | 30 | 90>(7);
  const [aktivitas, setAktivitas] = useState<TvDashboardData["aktivitas"] | null>(null);
  // Penanda denyut terakhir supaya pengguna tahu umpannya hidup.
  const [terakhirSegar, setTerakhirSegar] = useState<number | null>(null);
  const gagalPolling = useRef(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getDashboardTv(hari);
        if (hidup) {
          setData(hasil);
          setAktivitas(hasil.aktivitas);
          setTerakhirSegar(Date.now());
        }
      } catch (e) {
        if (hidup) {
          setGagal(true);
          toast("error", "Gagal memuat analitik TV", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, [hari]);

  // Aktivitas terkini disegarkan tiap 30 detik (spek 3.3.d) — hanya
  // umpan kecilnya, bukan seluruh dashboard; berhenti saat tab
  // peramban disembunyikan supaya hemat kuota.
  useEffect(() => {
    let hidup = true;
    const detak = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void (async () => {
        try {
          const baru = await getDashboardTvAktivitas();
          if (hidup) {
            setAktivitas(baru);
            setTerakhirSegar(Date.now());
            gagalPolling.current = 0;
          }
        } catch {
          // Gangguan sesaat dibiarkan; percobaan berikutnya menyusul.
          gagalPolling.current += 1;
        }
      })();
    }, 30_000);
    return () => {
      hidup = false;
      clearInterval(detak);
    };
  }, []);

  function gantiHari(h: 7 | 30 | 90) {
    setData(null);
    setGagal(false);
    setHari(h);
  }

  const dataStatus = useMemo(
    () => (data?.status ?? []).map((s, i) => ({ ...s, warna: WARNA_STATUS[i % WARNA_STATUS.length] })),
    [data],
  );

  if (gagal) {
    return (
      <EmptyState
        ikon={Clapperboard}
        judul="Analitik TV gagal dimuat"
        keterangan="Coba buka ulang dashboard ini."
      />
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <GlassSkeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <GlassSkeleton className="h-52 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter periode */}
      <div className="flex gap-2">
        {([7, 30, 90] as const).map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => gantiHari(h)}
            className={cn(
              "btn-tekan rounded-full px-4 py-2 text-xs font-bold",
              hari === h ? "text-white" : "glass text-teks-sekunder",
            )}
            style={
              hari === h
                ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                : undefined
            }
          >
            {h} Hari
          </button>
        ))}
      </div>

      {/* 6 kartu ringkasan */}
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {(
          [
            ["Video Dibuat", data.ringkasan.produksi, "#3B82F6"],
            ["Terunggah", data.ringkasan.terunggah, "#10B981"],
            ["Post Sukses", data.ringkasan.post_sukses, "#10B981"],
            ["Post Gagal", data.ringkasan.post_gagal, "#DC2626"],
            ["Interaksi", data.ringkasan.interaksi, "#F59E0B"],
            ["Produser", data.ringkasan.produser, "#8B5CF6"],
          ] as const
        ).map(([label, nilai, warna]) => (
          <GlassCard key={label} className="px-2 py-2.5 text-center">
            <p className="angka-tab font-heading text-lg font-extrabold" style={{ color: warna }}>
              {nilai}
            </p>
            <p className="text-[10px] leading-tight font-semibold text-teks-sekunder">{label}</p>
          </GlassCard>
        ))}
      </div>

      {/* 4 grafik */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <GlassCard className="p-3">
          <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
            Produksi vs Unggahan
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.tren} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="trenProduksi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="trenUnggah" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="tanggal"
                  tickFormatter={labelTanggal}
                  tick={{ fontSize: 9 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(t: string) => labelTanggal(t)}
                  formatter={(v: number, nama: string) => [
                    `${v} video`,
                    nama === "produksi" ? "Dibuat" : "Terunggah",
                  ]}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="produksi" stroke="#3B82F6" strokeWidth={2} fill="url(#trenProduksi)" />
                <Area type="monotone" dataKey="unggah" stroke="#10B981" strokeWidth={2} fill="url(#trenUnggah)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
            Posting Per Platform
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.per_platform} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="platform" tick={{ fontSize: 9.5 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: number, nama: string) => [
                    `${v} post`,
                    nama === "sukses" ? "Sukses" : "Gagal",
                  ]}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="sukses" stackId="a" fill="#10B981" />
                <Bar dataKey="gagal" stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
            Status Pipeline
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dataStatus}
                  dataKey="jumlah"
                  nameKey="nama"
                  innerRadius={34}
                  outerRadius={56}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {dataStatus.map((d) => (
                    <Cell key={d.nama} fill={d.warna} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, nama: string) => [`${v} video`, nama]}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Legend iconSize={9} formatter={(v: string) => <span style={{ fontSize: 10 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
            Interaksi Harian
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.interaksi_harian}
                margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="trenInteraksi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="tanggal"
                  tickFormatter={labelTanggal}
                  tick={{ fontSize: 9 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(t: string) => labelTanggal(t)}
                  formatter={(v: number) => [`${v} interaksi`, "Komen + share"]}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="jumlah" stroke="#F59E0B" strokeWidth={2} fill="url(#trenInteraksi)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      {/* Video populer — badge juara utk 3 teratas */}
      <GlassCard className="p-3.5">
        <p className="mb-2 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
          Video Populer (Interaksi Aplikasi)
        </p>
        {data.populer.length === 0 ? (
          <p className="py-4 text-center text-xs text-teks-sekunder">
            Belum ada video terunggah pada periode ini.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.populer.map((v, i) => (
              <div
                key={v.kode}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-2 py-1.5",
                  i === 0 && "bg-emas/[0.08]",
                )}
              >
                <span className="w-7 shrink-0 text-center text-base" aria-hidden="true">
                  {BADGE_JUARA[i] ?? (
                    <span className="angka-tab text-[11px] font-bold text-teks-sekunder">
                      {i + 1}
                    </span>
                  )}
                </span>
                {v.thumbnail_url ? (
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pri/10 text-pri">
                    <Clapperboard className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-teks-utama">{v.judul}</p>
                  <p className="text-[10px] text-teks-sekunder">
                    {v.platform} platform · {v.komen} komen · {v.share} share
                  </p>
                </div>
                <span className="angka-tab shrink-0 rounded-full bg-pri/10 px-2 py-0.5 text-[10.5px] font-extrabold text-pri">
                  {v.skor}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Performa per platform + sparkline */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {data.per_platform.map((p) => (
          <GlassCard key={p.platform} className="p-3">
            <div className="flex items-center gap-2">
              <PlatformIcon platform={p.platform} className="h-4 w-4" />
              <p className="flex-1 text-xs font-bold text-teks-utama capitalize">{p.platform}</p>
              <span className="angka-tab text-[11px] font-bold text-sukses">{p.sukses} sukses</span>
              {p.gagal > 0 && (
                <span className="angka-tab text-[11px] font-bold text-gagal">{p.gagal} gagal</span>
              )}
            </div>
            <div className="mt-1.5 h-12">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={p.sparkline} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`spark-${p.platform}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#DC2626" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#DC2626" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    labelFormatter={() => ""}
                    formatter={(v: number) => [`${v} post`, ""]}
                    contentStyle={{ borderRadius: 10, fontSize: 11 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="jumlah"
                    stroke="#DC2626"
                    strokeWidth={1.5}
                    fill={`url(#spark-${p.platform})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Aktivitas terkini — auto-refresh 30 detik */}
      <GlassCard className="p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
            Aktivitas Terkini
          </p>
          <span className="flex items-center gap-1.5 text-[10px] text-teks-sekunder">
            <Activity className="h-3 w-3 text-sukses" aria-hidden="true" />
            {terakhirSegar ? `segar ${waktuRelatif(new Date(terakhirSegar).toISOString())}` : "memuat"}
            · tiap 30 dtk
          </span>
        </div>
        {(aktivitas ?? []).length === 0 ? (
          <p className="py-4 text-center text-xs text-teks-sekunder">Belum ada aktivitas.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {(aktivitas ?? []).map((a, i) => (
              <div
                key={`${a.waktu}-${i}`}
                className="flex items-start gap-2 border-b border-glass-border/50 py-1.5 last:border-0"
              >
                <span
                  className={cn(
                    "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                    a.jenis === "unggah"
                      ? "bg-sukses"
                      : a.jenis === "komen"
                        ? "bg-emas"
                        : a.jenis === "share"
                          ? "bg-blue-500"
                          : "bg-teks-sekunder/50",
                  )}
                  aria-hidden="true"
                />
                <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-teks-utama">
                  {a.teks}
                </p>
                <span className="angka-tab shrink-0 text-[9.5px] text-teks-sekunder">
                  {waktuRelatif(a.waktu)}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Pengendali akun TV Rakyat ANGGOTA (upload-post) + gabungan
          insight Official+anggota (rombakan TVR Saya, 31 Agu 2026). */}
      <p className="mt-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
        Akun TV Rakyat Anggota
      </p>
      <TvAnggotaPanel />
    </div>
  );
}
