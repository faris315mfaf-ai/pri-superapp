"use client";

// ============================================================
// DashboardScreen — layar utama super admin PRI SuperApp.
// Header sapaan + lonceng notifikasi, lalu (setelah data
// getDashboard() termuat) KPI, tren kepatuhan, kepatuhan per
// akun, pipeline video, peringkat kader, akses cepat, dan
// aktivitas terbaru — semua dengan animasi FadeInUp bertahap.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { JamDigital } from "@/components/jam-digital";
import { AlertTriangle, Bell } from "lucide-react";
import {
  AvatarInisial,
  EmptyState,
  FadeInUp,
  GlassSkeleton,
  ThemeToggle,
} from "@/components/pri-ui";
import { getDashboard } from "@/services";
import type { DashboardData } from "@/services";
import { toast } from "@/hooks/use-app-store";
import {
  SeksiAbsensiHarian,
  SeksiInsightTvr,
  SeksiRencanaAnggota,
} from "./seksi-pemantauan";
import { KartuPengumumanTerbaru } from "@/features/konten/beranda-anggota";
import { sapaanHari, tanggalIndonesia } from "@/lib/format";
import { APP_TODAY_ISO } from "@/types";
import type { User } from "@/types";
import { AksesCepatPanel } from "./akses-cepat-panel";
import { CalendarDays, ClipboardList, Database, Globe2, LayoutGrid, Tv, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { KartuKelolaPengguna } from "./kartu-kelola-pengguna";
import { TataLetakModul, type SeksiModul } from "@/components/tata-letak-modul";
import { KATALOG_DASHBOARD } from "@/lib/dashboard-katalog";
import { IkonSinyal } from "@/components/ikon-sinyal";
import { RingkasanUtama } from "./ringkasan-utama";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { TombolPeringkat } from "@/features/peringkat/tombol-peringkat";
import { CincinJuara } from "@/features/peringkat/cincin-mythic";

type DashboardScreenProps = {
  user: User;
  onBukaModulQc: () => void;
  onBukaModulTv: () => void;
  onBukaNotifikasi: () => void;
  /** Jumlah notifikasi yang belum dibaca (badge merah lonceng) */
  jumlahBelumBaca: number;
  /**
   * Buka panel kelola pengguna. Hanya diisi untuk super admin —
   * peran lain menerima undefined dan kartunya tidak dirender.
   */
  onBukaKelolaPengguna?: () => void;
  onBukaDatabase?: () => void;
  /** Kartu ringkasan (1 Sep 2026): buka absensi & KPI video anggota. */
  onBukaAbsensi?: () => void;
  onBukaKpiVideo?: () => void;
  /** Buka dashboard TV Rakyat Nasional (1 Sep 2026). */
  onBukaTvNasional?: () => void;
  /** Seksi "Semua Dashboard" (1 Sep 2026): kepatuhan & analitik TV. */
  onBukaKepatuhan?: () => void;
  onBukaTvAnalitik?: () => void;
};

export function DashboardScreen({
  user,
  onBukaKelolaPengguna,
  onBukaDatabase,
  onBukaModulQc,
  onBukaModulTv,
  onBukaNotifikasi,
  jumlahBelumBaca,
  onBukaAbsensi,
  onBukaKpiVideo,
  onBukaTvNasional,
  onBukaKepatuhan,
  onBukaTvAnalitik,
}: DashboardScreenProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [pesanError, setPesanError] = useState<string | null>(null);

  // Dipakai tombol "Coba Lagi" (event handler — boleh setState sinkron).
  const muatData = useCallback(async () => {
    setMemuat(true);
    setPesanError(null);
    try {
      const hasil = await getDashboard();
      setData(hasil);
    } catch (err) {
      setData(null);
      setPesanError(
        err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat memuat data.",
      );
    } finally {
      setMemuat(false);
    }
  }, []);

  // Muat data sekali saat layar dibuka. Ditulis inline (bukan memanggil
  // muatData) karena aturan lint react-hooks melarang setState sinkron
  // dari fungsi yang dipanggil effect; di sini semua setState terjadi
  // setelah await, dan penanda `hidup` mencegah setState pasca-unmount.
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getDashboard();
        if (!hidup) return;
        setData(hasil);
        setPesanError(null);
      } catch (err) {
        if (!hidup) return;
        setData(null);
        setPesanError(
          err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat memuat data.",
        );
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  // Toast setiap kali pemuatan gagal
  useEffect(() => {
    if (pesanError) {
      toast("error", "Gagal memuat dashboard", pesanError);
    }
  }, [pesanError]);

  // Penyegaran otomatis (1 Sep 2026): data dashboard ditarik ulang
  // DIAM-DIAM tiap 30 dtk + saat aplikasi dibuka kembali — tanpa
  // menyalakan skeleton (angka lama tetap tampil sampai yang baru tiba).
  useSegarOtomatis(() => {
    void getDashboard()
      .then((hasil) => {
        setData(hasil);
        setPesanError(null);
      })
      .catch(() => {});
  });

  const namaPanggilan = user.nama.split(" ")[0] || user.nama;

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      {/* ===== Header sapaan ===== */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-teks-sekunder">{sapaanHari()},</p>
          <h1 className="truncate font-heading text-[22px] leading-tight font-extrabold tracking-tight text-teks-utama">
            {namaPanggilan}
          </h1>
          <p className="mt-1 text-[11px] text-teks-sekunder">
            {tanggalIndonesia(APP_TODAY_ISO)}
          </p>
          <JamDigital className="mt-0.5 block font-heading text-lg font-extrabold tracking-tight text-teks-utama" />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Avatar — bercincin Mythical bila masuk 3 besar TVR */}
          <CincinJuara userId={user.id} ukuran={48}>
            <AvatarInisial nama={user.nama} ukuran="lg" />
          </CincinJuara>

          {/* Mahkota leaderboard TV Rakyat (kiri lonceng, 1 Sep 2026) */}
          <TombolPeringkat />

          {/* Sinyal latensi server (1 Sep 2026) — pojok kanan atas */}
          <IkonSinyal />

          {/* Tombol lonceng notifikasi + badge belum dibaca */}
          <button
            type="button"
            onClick={onBukaNotifikasi}
            aria-label={
              jumlahBelumBaca > 0
                ? `Buka notifikasi — ${jumlahBelumBaca} belum dibaca`
                : "Buka notifikasi"
            }
            className="glass btn-tekan relative flex h-10 w-10 items-center justify-center rounded-full text-teks-utama"
          >
            <Bell className="h-[18px] w-[18px]" />
            {jumlahBelumBaca > 0 && (
              <span
                className="angka-tab absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                  boxShadow: "0 4px 10px rgba(220, 38, 38, 0.4)",
                }}
              >
                {jumlahBelumBaca > 99 ? "99+" : jumlahBelumBaca}
              </span>
            )}
          </button>

          <ThemeToggle />
        </div>
      </header>

      {/* Pengumuman terbaru — beranda tidak boleh ketinggalan info */}
      <KartuPengumumanTerbaru />

      {/* ===== Ringkasan 4 angka utama (1 Sep 2026) =====
          Selalu di paling atas (di luar tata letak kustom) supaya
          rangkuman kepatuhan-komen/absensi/KPI tidak bisa tersembunyi. */}
      <div className="mt-4">
        <FadeInUp>
          <RingkasanUtama
            onBukaKomen={onBukaModulQc}
            onBukaAbsensi={onBukaAbsensi}
            onBukaKerja={onBukaDatabase}
            onBukaVideo={onBukaKpiVideo}
          />
        </FadeInUp>
      </div>

      {/* ===== Semua Dashboard (1 Sep 2026): seluruh sub-dashboard
          (Absensi, KPI Anggota, Kepatuhan Komen, TV Rakyat, Database
          Anggota, TV Rakyat Nasional) bisa dibuka langsung dari sini.
          Ikon & label mengikuti katalog resmi supaya seragam dengan
          tab Dashboard milik pemegang jabatan. */}
      {(() => {
        const tujuan: Record<string, (() => void) | undefined> = {
          absensi: onBukaAbsensi,
          kpi: onBukaKpiVideo,
          kepatuhan: onBukaKepatuhan,
          tv: onBukaTvAnalitik,
          anggota: onBukaDatabase,
          tvnasional: onBukaTvNasional,
        };
        const daftar = KATALOG_DASHBOARD.filter((d) => tujuan[d.kunci]);
        if (daftar.length === 0) return null;
        return (
          <div className="mt-4">
            <FadeInUp delay={0.05}>
              <p className="mb-2 font-heading text-[13px] font-bold text-teks-utama">
                Semua Dashboard
              </p>
              <div className="grid grid-cols-2 gap-2">
                {daftar.map((d) => (
                  <button
                    key={d.kunci}
                    type="button"
                    onClick={tujuan[d.kunci]}
                    aria-label={`Buka dashboard ${d.label}`}
                    className="btn-tekan text-left"
                  >
                    <GlassCard className="flex h-full items-center gap-2.5 p-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                        aria-hidden="true"
                      >
                        <d.ikon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-bold text-teks-utama">
                          {d.label}
                        </span>
                        <span className="block truncate text-[10px] leading-snug text-teks-sekunder">
                          {d.keterangan}
                        </span>
                      </span>
                    </GlassCard>
                  </button>
                ))}
              </div>
            </FadeInUp>
          </div>
        );
      })()}

      {/* ===== Konten ===== */}
      <div className="mt-5 flex flex-col gap-4">
        {/* Skeleton saat memuat */}
        {memuat && !data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <GlassSkeleton key={i} className="h-[136px] rounded-[1.25rem]" />
              ))}
            </div>
            <GlassSkeleton className="h-[252px] rounded-[1.25rem]" />
          </>
        )}

        {/* Keadaan error + tombol coba lagi */}
        {!memuat && pesanError && (
          <EmptyState
            ikon={AlertTriangle}
            judul="Dashboard gagal dimuat"
            keterangan={pesanError}
            labelAksi="Coba Lagi"
            onAksi={() => void muatData()}
          />
        )}

        {data && (
          // Beranda pengurus kini BISA DIKUSTOMISASI seperti beranda anggota
          // (fitur 1.22.x/bug 1): seret untuk mengurutkan + sembunyikan seksi.
          // bungkusSeksi=false karena tiap seksi sudah punya kepala/kartunya.
          <TataLetakModul
            modul="dashboard"
            bungkusSeksi={false}
            seksi={
              [
                onBukaDatabase && {
                  id: "database",
                  judul: "Database Anggota",
                  ikon: Database,
                  render: () => (
                    <button
                      type="button"
                      onClick={onBukaDatabase}
                      className="btn-tekan w-full text-left"
                      aria-label="Buka Database Anggota"
                    >
                      <GlassCard className="flex items-center gap-3 p-4">
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
                          style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9)" }}
                          aria-hidden="true"
                        >
                          <Database className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-heading text-[15px] font-bold text-teks-utama">
                            Database Anggota
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-snug text-teks-sekunder">
                            Detail per orang: kewajiban komentar, KPI kerja, absensi, laporan video.
                          </span>
                        </span>
                      </GlassCard>
                    </button>
                  ),
                },
                onBukaKelolaPengguna && {
                  id: "kelola",
                  judul: "Kelola Pengguna",
                  ikon: Users,
                  render: () => <KartuKelolaPengguna onBuka={onBukaKelolaPengguna} />,
                },
                // Dashboard TV Rakyat Nasional (1 Sep 2026): statistik
                // gabungan Official + akun pengguna, per sosmed.
                onBukaTvNasional && {
                  id: "tvnasional",
                  judul: "TV Rakyat Nasional",
                  ikon: Globe2,
                  render: () => (
                    <button
                      type="button"
                      onClick={onBukaTvNasional}
                      className="btn-tekan w-full text-left"
                      aria-label="Buka dashboard TV Rakyat Nasional"
                    >
                      <GlassCard className="flex items-center gap-3 p-4">
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
                          style={{ background: "linear-gradient(135deg, #0EA5E9, #1D4ED8)" }}
                          aria-hidden="true"
                        >
                          <Globe2 className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-heading text-[15px] font-bold text-teks-utama">
                            TV Rakyat Nasional
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-snug text-teks-sekunder">
                            Pengikut, tayangan, jangkauan, komentar & bagikan — Official +
                            seluruh akun pengguna, per sosmed + leaderboard.
                          </span>
                        </span>
                      </GlassCard>
                    </button>
                  ),
                },
                {
                  id: "akses-cepat",
                  judul: "Akses Cepat",
                  ikon: LayoutGrid,
                  render: () => (
                    <AksesCepatPanel onBukaModulQc={onBukaModulQc} onBukaModulTv={onBukaModulTv} />
                  ),
                },
                { id: "insight-tvr", judul: "Insight TV Rakyat", ikon: Tv, render: () => <SeksiInsightTvr /> },
                {
                  id: "absensi",
                  judul: "Absensi Hari Ini",
                  ikon: CalendarDays,
                  render: () => <SeksiAbsensiHarian />,
                },
                {
                  id: "rencana",
                  judul: "Rencana Kerja Anggota",
                  ikon: ClipboardList,
                  render: () => <SeksiRencanaAnggota />,
                },
              ].filter(Boolean) as SeksiModul[]
            }
          />
        )}
      </div>
    </div>
  );
}
