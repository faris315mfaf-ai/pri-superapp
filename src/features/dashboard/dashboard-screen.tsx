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
import { Database } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { KartuKelolaPengguna } from "./kartu-kelola-pengguna";

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
};

export function DashboardScreen({
  user,
  onBukaKelolaPengguna,
  onBukaDatabase,
  onBukaModulQc,
  onBukaModulTv,
  onBukaNotifikasi,
  jumlahBelumBaca,
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

      {/* Pengumuman terbaru — beranda tidak boleh ketinggalan info */}
      <KartuPengumumanTerbaru />

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
          <>
            {/* Angka kepatuhan & tren kini tinggal di modul QC Konten,
                pipeline video di modul TV Rakyat — beranda super admin
                fokus ke pemantauan orang: absensi, rencana, aktivitas. */}

            {/* Database anggota: detail kewajiban/KPI/absen/video per orang.
                Tampil hanya bila perannya diberi fitur "database.detail". */}
            {onBukaDatabase && (
              <FadeInUp delay={0.24}>
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
              </FadeInUp>
            )}

            {/* f) Akses cepat */}
            {onBukaKelolaPengguna && (
              <FadeInUp delay={0.27}>
                <KartuKelolaPengguna onBuka={onBukaKelolaPengguna} />
              </FadeInUp>
            )}

            <FadeInUp delay={0.3}>
              <AksesCepatPanel onBukaModulQc={onBukaModulQc} onBukaModulTv={onBukaModulTv} />
            </FadeInUp>

            {/* g) Pemantauan: insight TVR, absensi, rencana anggota */}
            <SeksiInsightTvr />
            <SeksiAbsensiHarian />
            <SeksiRencanaAnggota />

            {/* Aktivitas terbaru DIHAPUS dari beranda (spek 1.7):
                isinya duplikat layar Notifikasi — daftar yang sama
                kini hanya hidup di lonceng notifikasi. */}
          </>
        )}
      </div>
    </div>
  );
}
