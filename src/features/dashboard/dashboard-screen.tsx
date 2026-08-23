"use client";

// ============================================================
// DashboardScreen — layar utama super admin PRI SuperApp.
// Header sapaan + lonceng notifikasi, lalu (setelah data
// getDashboard() termuat) KPI, tren kepatuhan, kepatuhan per
// akun, pipeline video, peringkat kader, akses cepat, dan
// aktivitas terbaru — semua dengan animasi FadeInUp bertahap.
// ============================================================

import { useCallback, useEffect, useState } from "react";
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
import { sapaanHari, tanggalIndonesia } from "@/lib/format";
import { APP_TODAY_ISO } from "@/types";
import type { User } from "@/types";
import { KpiCard } from "./kpi-card";
import { TrendChart } from "./trend-chart";
import { KepatuhanAkunCard } from "./kepatuhan-akun-card";
import { PipelineVideoCard } from "./pipeline-video-card";
import { TopKaderCard } from "./top-kader-card";
import { AksesCepatPanel } from "./akses-cepat-panel";
import { AktivitasFeed } from "./aktivitas-feed";

type DashboardScreenProps = {
  user: User;
  onBukaModulQc: () => void;
  onBukaModulTv: () => void;
  onBukaNotifikasi: () => void;
  /** Jumlah notifikasi yang belum dibaca (badge merah lonceng) */
  jumlahBelumBaca: number;
};

export function DashboardScreen({
  user,
  onBukaModulQc,
  onBukaModulTv,
  onBukaNotifikasi,
  jumlahBelumBaca,
}: DashboardScreenProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [pesanError, setPesanError] = useState<string | null>(null);

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

  // Muat data dashboard sekali saat layar dibuka
  useEffect(() => {
    void muatData();
  }, [muatData]);

  // Toast setiap kali pemuatan gagal
  useEffect(() => {
    if (pesanError) {
      toast("error", "Gagal memuat dashboard", pesanError);
    }
  }, [pesanError]);

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
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <AvatarInisial nama={user.nama} ukuran="lg" />

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

      {/* ===== Konten ===== */}
      <div className="mt-5 flex flex-col gap-4">
        {/* Skeleton saat memuat */}
        {memuat && !data && (
          <>
            <div className="grid grid-cols-2 gap-3">
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
          <>
            {/* a) KPI — grid 2×2 */}
            <FadeInUp delay={0}>
              <div className="grid grid-cols-2 gap-3">
                {data.kpi.map((kpi, i) => (
                  <KpiCard key={kpi.id} kpi={kpi} delay={0.06 + i * 0.05} />
                ))}
              </div>
            </FadeInUp>

            {/* b) Tren kepatuhan 7 hari */}
            <FadeInUp delay={0.06}>
              <TrendChart data={data.tren} />
            </FadeInUp>

            {/* c) Kepatuhan per akun wajib */}
            <FadeInUp delay={0.12}>
              <KepatuhanAkunCard data={data.kepatuhanAkun} />
            </FadeInUp>

            {/* d) Status pipeline video TV Rakyat */}
            <FadeInUp delay={0.18}>
              <PipelineVideoCard ringkasan={data.ringkasanVideo} />
            </FadeInUp>

            {/* e) Peringkat kader teraktif */}
            <FadeInUp delay={0.24}>
              <TopKaderCard peringkat={data.peringkat} />
            </FadeInUp>

            {/* f) Akses cepat */}
            <FadeInUp delay={0.3}>
              <AksesCepatPanel onBukaModulQc={onBukaModulQc} onBukaModulTv={onBukaModulTv} />
            </FadeInUp>

            {/* g) Aktivitas terbaru */}
            <FadeInUp delay={0.36}>
              <AktivitasFeed aktivitas={data.aktivitas} />
            </FadeInUp>
          </>
        )}
      </div>
    </div>
  );
}
