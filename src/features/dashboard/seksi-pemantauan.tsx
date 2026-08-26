"use client";

// ============================================================
// Seksi pemantauan dashboard super admin:
// 1. Insight TV Rakyat — angka profil per sosmed (pemilih 6 platform).
// 2. Laporan absensi harian — status tiap anggota hari ini
//    (masuk / izin / sakit / alfa), digabung dari absensi + perizinan.
// 3. Rencana anggota — KPI rencana harian semua anggota + daftar
//    rencana besar yang sedang berjalan.
// ============================================================

import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-app-store";
import { BarChart3, Eye, Heart, Radar, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FotoBulat } from "@/components/foto-bulat";
import { NavHalaman } from "@/components/nav-halaman";
import { AvatarInisial, FadeInUp, GlassSkeleton, SectionTitle, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { ProgressRing } from "@/components/progress-ring";
import {
  getAbsensi,
  getInsightSosmed,
  getKpiSemua,
  getPengguna,
  getPerizinan,
  getRekapVideoSemua,
  getRencanaBesarSemua,
  type BalasanInsight,
  type KerjaKpiBaris,
  type RencanaBesarBaris,
  setKpiVideo,
} from "@/services";
import { formatAngkaRingkas, jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLATFORM_PILIHAN = [
  { id: "instagram", label: "IG" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YT" },
  { id: "facebook", label: "FB" },
  { id: "threads", label: "Threads" },
  { id: "twitter", label: "X" },
] as const;

// ------------------------------------------------------------
// 1. Insight TV Rakyat per platform
// ------------------------------------------------------------

export function SeksiInsightTvr() {
  const [platform, setPlatform] = useState<string>("instagram");
  const [data, setData] = useState<BalasanInsight | null>(null);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getInsightSosmed(false, platform);
        if (!hidup) return;
        setData(hasil);
      } catch {
        if (hidup) setData(null);
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [platform]);

  const insight = data?.insight ?? null;
  const tertaut = new Set((data?.akun?.platformAktif ?? []).map((p) => p.toLowerCase()));

  return (
    <FadeInUp delay={0.05}>
      <SectionTitle judul="Insight TV Rakyat" className="mt-6" />
      <GlassCard className="p-4">
        {/* Pemilih sosmed */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-tipis">
          {PLATFORM_PILIHAN.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setMemuat(true);
                setPlatform(p.id);
              }}
              className={cn(
                "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold",
                platform === p.id ? "text-white" : "glass-soft text-teks-sekunder",
              )}
              style={
                platform === p.id
                  ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                  : undefined
              }
            >
              <PlatformIcon platform={p.id} size={12} />
              {p.label}
            </button>
          ))}
        </div>

        {memuat ? (
          <GlassSkeleton className="mt-3 h-20 rounded-xl" />
        ) : !insight ? (
          <p className="mt-3 py-4 text-center text-xs leading-relaxed text-teks-sekunder">
            {tertaut.size > 0 && !tertaut.has(platform)
              ? "Akun untuk platform ini belum ditautkan di Ayrshare."
              : "Insight belum tersedia untuk platform ini."}
          </p>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-2.5">
              {insight.fotoProfil ? (
                <img src={insight.fotoProfil} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <BarChart3 className="h-5 w-5 text-pri" aria-hidden="true" />
              )}
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-teks-utama">
                @{insight.username}
              </p>
              {data?.kedaluwarsa && <StatusBadge label="data lama" warna="kuning" />}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {(
                [
                  { label: "Pengikut", nilai: insight.pengikut, Ikon: Users, warna: "#DC2626" },
                  { label: "Tayangan", nilai: insight.tayangan, Ikon: Eye, warna: "#10B981" },
                  { label: "Jangkauan", nilai: insight.jangkauan, Ikon: Radar, warna: "#8B5CF6" },
                  { label: "Suka", nilai: insight.suka, Ikon: Heart, warna: "#EC4899" },
                ] as const
              ).map((m) => (
                <div key={m.label} className="glass-soft rounded-xl px-2 py-2 text-center">
                  <m.Ikon className="mx-auto h-3.5 w-3.5" style={{ color: m.warna }} aria-hidden="true" />
                  <p className="angka-tab mt-1 font-heading text-sm font-extrabold text-teks-utama">
                    {m.nilai === null ? "–" : formatAngkaRingkas(m.nilai)}
                  </p>
                  <p className="text-[9px] text-teks-sekunder">{m.label}</p>
                </div>
              ))}
            </div>
            {insight.diperbarui && (
              <p className="mt-2 text-center text-[10px] text-teks-sekunder/80">
                Diperbarui Ayrshare pukul {jamWIB(insight.diperbarui)} WIB
              </p>
            )}
          </>
        )}
      </GlassCard>
    </FadeInUp>
  );
}

// ------------------------------------------------------------
// 2. Laporan absensi harian semua anggota
// ------------------------------------------------------------

type StatusHarian = {
  id: string;
  nama: string;
  avatar_url: string;
  status: "masuk" | "izin" | "sakit" | "alfa" | "menunggu izin";
  jamMasuk: string | null;
  videoHariIni: number;
};

export function SeksiAbsensiHarian() {
  const [daftar, setDaftar] = useState<StatusHarian[] | null>(null);
  // Ringkas: angka rekap tampil dulu; daftar orangnya dilipat dan
  // berhalaman supaya dashboard tidak memanjang puluhan baris.
  const [terbuka, setTerbuka] = useState(false);
  const [targetPer, setTargetPer] = useState<Map<string, number>>(new Map());
  const [kpiUntuk, setKpiUntuk] = useState<{ id: string; nama: string } | null>(null);
  const [halamanAbsen, setHalamanAbsen] = useState(1);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        // Empat sumber digabung: daftar pengguna (basis), absensi hari
        // ini, perizinan hari ini, dan laporan video (konteks KPI).
        const [pengguna, absensi, izin, video] = await Promise.all([
          getPengguna(),
          getAbsensi(true),
          getPerizinan(true).catch(() => []),
          getRekapVideoSemua().catch(() => null),
        ]);
        if (!hidup) return;

        const hariIni = absensi.tanggal_hari_ini;
        const masukPer = new Map<string, string>();
        for (const a of absensi.data) {
          if (a.tanggal_wib === hariIni && a.jenis === "masuk") masukPer.set(a.user_id, a.waktu);
        }
        const izinPer = new Map(
          izin.filter((i) => i.tanggal_wib === hariIni).map((i) => [i.user_id, i]),
        );
        const videoPer = new Map((video?.data ?? []).map((v) => [v.user_id, v.jumlah]));
        // Target KPI khusus per akun (spek 3.1); tanpa entri = bawaan 5.
        const targetPeta = new Map(
          (video?.target_khusus ?? []).map((t) => [t.user_id, t.kpi]),
        );
        setTargetPer(targetPeta);

        setDaftar(
          pengguna.data
            .filter((u) => u.status === "aktif" && u.aktif)
            .map((u) => {
              const jamMasuk = masukPer.get(u.id) ?? null;
              const iz = izinPer.get(u.id);
              const status: StatusHarian["status"] = jamMasuk
                ? "masuk"
                : iz?.status === "disetujui"
                  ? (iz.jenis as "izin" | "sakit")
                  : iz?.status === "menunggu"
                    ? "menunggu izin"
                    : "alfa";
              return {
                id: u.id,
                nama: u.nama,
                avatar_url: u.avatar_url ?? "",
                status,
                jamMasuk,
                videoHariIni: videoPer.get(u.id) ?? 0,
              };
            }),
        );
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  return (
    <FadeInUp delay={0.08}>
      <SectionTitle judul="Absensi Hari Ini" className="mt-6" />
      {daftar === null ? (
        <GlassSkeleton className="h-24 rounded-2xl" />
      ) : daftar.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-center text-xs text-teks-sekunder">Belum ada data anggota.</p>
        </GlassCard>
      ) : (
        <GlassCard className="p-3">
          {/* Rekap ringkas per status */}
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["masuk", "hijau"],
                ["izin", "biru"],
                ["sakit", "biru"],
                ["menunggu izin", "kuning"],
                ["alfa", "merah"],
              ] as const
            ).map(([st, warna]) => {
              const n = daftar.filter((d) => d.status === st).length;
              if (n === 0) return null;
              return <StatusBadge key={st} label={`${st} ${n}`} warna={warna} />;
            })}
            <button
              type="button"
              onClick={() => setTerbuka((v) => !v)}
              className="ml-auto text-[11px] font-semibold text-pri underline-offset-4 hover:underline"
            >
              {terbuka ? "Sembunyikan daftar" : `Lihat daftar (${daftar.length})`}
            </button>
          </div>
          {terbuka && (
          <div className="mt-2 flex flex-col">
            {daftar
              .slice((halamanAbsen - 1) * 10, halamanAbsen * 10)
              .map((d) => (
              <div key={d.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2">
                {d.avatar_url ? (
                  <FotoBulat src={d.avatar_url} ukuran={32} />
                ) : (
                  <AvatarInisial nama={d.nama} ukuran={32} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-teks-utama">{d.nama}</p>
                  <p className="text-[10px] text-teks-sekunder">
                    {d.jamMasuk ? `masuk ${jamWIB(d.jamMasuk)}` : "belum absen"} ·{" "}
                    {/* KPI per akun bisa disetel HR/QC (spek 3.1) — ketuk
                        untuk mengubah target orang ini. */}
                    <button
                      type="button"
                      onClick={() => setKpiUntuk({ id: d.id, nama: d.nama })}
                      className="btn-tekan font-semibold text-pri underline-offset-2 hover:underline"
                    >
                      video {d.videoHariIni}/{targetPer.get(d.id) ?? 5}
                    </button>
                  </p>
                </div>
                <StatusBadge
                  label={d.status}
                  warna={
                    d.status === "masuk"
                      ? "hijau"
                      : d.status === "alfa"
                        ? "merah"
                        : d.status === "menunggu izin"
                          ? "kuning"
                          : "biru"
                  }
                />
              </div>
            ))}
          </div>
          )}
          {terbuka && (
            <NavHalaman
              total={daftar.length}
              perHalaman={10}
              halaman={halamanAbsen}
              onGanti={setHalamanAbsen}
            />
          )}
        </GlassCard>
      )}

      {/* Modal setel KPI video per akun (spek 3.1) */}
      {kpiUntuk && (
        <ModalKpiVideo
          target={kpiUntuk}
          nilaiAwal={targetPer.get(kpiUntuk.id) ?? 5}
          onTutup={() => setKpiUntuk(null)}
          onTersimpan={(kpiBaru) => {
            setTargetPer((peta) => {
              const b = new Map(peta);
              if (kpiBaru === null) b.delete(kpiUntuk.id);
              else b.set(kpiUntuk.id, kpiBaru);
              return b;
            });
            setKpiUntuk(null);
          }}
        />
      )}
    </FadeInUp>
  );
}

// ------------------------------------------------------------
// ModalKpiVideo — HR/QC/Pengawas menyetel target video harian satu
// akun (spek 3.1). Bawaan 5; bisa diturunkan (mis. akun suspend).
// ------------------------------------------------------------

function ModalKpiVideo({
  target,
  nilaiAwal,
  onTutup,
  onTersimpan,
}: {
  target: { id: string; nama: string };
  nilaiAwal: number;
  onTutup: () => void;
  onTersimpan: (kpi: number | null) => void;
}) {
  const [nilai, setNilai] = useState(nilaiAwal);
  const [sibuk, setSibuk] = useState(false);

  async function simpan(kpi: number | null) {
    if (sibuk) return;
    setSibuk(true);
    try {
      await setKpiVideo(target.id, kpi);
      toast(
        "sukses",
        `KPI ${target.nama.split(" ")[0]} disetel`,
        kpi === null ? "Kembali ke bawaan 5 video/hari." : `${kpi} video per hari.`,
      );
      onTersimpan(kpi);
    } catch (e) {
      toast("error", "Gagal menyimpan KPI", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-8"
      role="dialog"
      aria-modal="true"
      aria-label="Setel KPI video"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass-strong relative w-full max-w-[300px] rounded-2xl p-5 text-center">
        <p className="text-sm font-bold text-teks-utama">Target video {target.nama}</p>
        <p className="mt-0.5 text-[11px] text-teks-sekunder">
          Bawaan 5/hari — turunkan mis. untuk akun yang kena suspend.
        </p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setNilai((n) => Math.max(0, n - 1))}
            aria-label="Kurangi target"
            className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-teks-utama"
          >
            −
          </button>
          <span className="angka-tab font-heading w-12 text-3xl font-extrabold text-teks-utama">
            {nilai}
          </span>
          <button
            type="button"
            onClick={() => setNilai((n) => Math.min(30, n + 1))}
            aria-label="Tambah target"
            className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-teks-utama"
          >
            +
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={sibuk}
            onClick={() => void simpan(null)}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-[12px] font-semibold text-teks-utama disabled:opacity-60"
          >
            Bawaan (5)
          </button>
          <button
            type="button"
            disabled={sibuk}
            onClick={() => void simpan(nilai)}
            className="btn-tekan flex-1 rounded-xl py-2.5 text-[12px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 3. Rencana harian (KPI) + rencana besar semua anggota
// ------------------------------------------------------------

export function SeksiRencanaAnggota() {
  const [kpi, setKpi] = useState<KerjaKpiBaris[] | null>(null);
  const [besar, setBesar] = useState<RencanaBesarBaris[]>([]);
  const [halamanKpi, setHalamanKpi] = useState(1);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [harian, proyek] = await Promise.all([
          getKpiSemua(),
          getRencanaBesarSemua().catch(() => []),
        ]);
        if (!hidup) return;
        setKpi(harian.data);
        setBesar(proyek.filter((b) => b.status !== "selesai").slice(0, 8));
      } catch {
        if (hidup) setKpi([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  return (
    <FadeInUp delay={0.11}>
      <SectionTitle judul="Rencana Kerja Anggota" className="mt-6" />

      {kpi === null ? (
        <GlassSkeleton className="h-20 rounded-2xl" />
      ) : kpi.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-center text-xs leading-relaxed text-teks-sekunder">
            Belum ada anggota yang mengisi rencana harian hari ini.
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {kpi.slice((halamanKpi - 1) * 10, halamanKpi * 10).map((b) => (
            <GlassCard key={b.user_id} className="flex items-center gap-3 p-2.5">
              <AvatarInisial nama={b.nama} ukuran={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-teks-utama">{b.nama}</p>
                <p className="text-[10px] text-teks-sekunder">
                  {b.rencana_selesai}/{b.rencana_total} selesai
                  {b.rencana_belum_lapor > 0 ? ` · ${b.rencana_belum_lapor} belum lapor` : ""}
                </p>
              </div>
              <ProgressRing value={b.kpi_persen ?? 0} size={38} strokeWidth={4}>
                <span className="angka-tab text-[9px] font-bold text-teks-utama">
                  {b.kpi_persen ?? 0}%
                </span>
              </ProgressRing>
            </GlassCard>
          ))}
          <NavHalaman
            total={kpi.length}
            perHalaman={10}
            halaman={halamanKpi}
            onGanti={setHalamanKpi}
          />
        </div>
      )}

      {besar.length > 0 && (
        <>
          <p className="mt-3 mb-1.5 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
            Rencana Besar Berjalan
          </p>
          <div className="flex flex-col gap-2">
            {besar.map((b) => (
              <GlassCard key={b.id} className="p-3">
                <p className="text-[12.5px] font-semibold leading-snug text-teks-utama">
                  {b.deskripsi}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-teks-sekunder">{b.nama}</span>
                  {b.tenggat && (
                    <span className="inline-flex items-center rounded-full border border-emas/30 bg-emas/10 px-2 py-0.5 text-[9.5px] font-bold text-amber-600 dark:text-amber-400">
                      tenggat {b.tenggat}
                    </span>
                  )}
                  {b.nama_penugas && (
                    <span className="text-[10px] text-teks-sekunder">
                      dari {b.nama_penugas}
                    </span>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        </>
      )}
    </FadeInUp>
  );
}
