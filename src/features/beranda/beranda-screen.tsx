"use client";

// ============================================================
// BerandaScreen — halaman pertama untuk Ketua & Anggota.
//
// Isinya dipilih super admin lewat matriks izin fitur (kunci
// "beranda.*"), sehingga tiap peran bisa punya beranda yang
// berbeda tanpa perlu rilis aplikasi baru:
//
// - beranda.pengumuman   : kartu pengumuman terbaru dari atasan
// - beranda.kpi_kerja    : rencana kerja hari ini
// - beranda.kpi_komentar : kewajiban komentar di konten resmi
// - beranda.kpi_video    : target 5 laporan video harian
// - beranda.absensi      : status kehadiran hari ini
//
// Kartu yang dimatikan tidak dirender sama sekali — bukan sekadar
// disamarkan, supaya tidak ada data yang tetap diambil diam-diam.
// ============================================================

import { useEffect, useState } from "react";
import {
  CalendarCheck,
  ClipboardList,
  MessageCircle,
  Video,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FadeInUp, StatusBadge, ThemeToggle } from "@/components/pri-ui";
import { ProgressRing } from "@/components/progress-ring";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { useAppStore } from "@/hooks/use-app-store";
import { KartuPengumumanTerbaru } from "@/features/konten/beranda-anggota";
import { KartuUltah } from "@/components/ultah";
import { KartuVideoBaru } from "./kartu-video-baru";
import {
  getAbsensi,
  getLaporanKerja,
  getLaporanVideo,
  getRekapPeriode,
  type KerjaKpi,
} from "@/services";
import { bolehFitur } from "@/lib/fitur";
import { jamWIB, sapaanHari, tanggalIndonesia } from "@/lib/format";
import type { KomponenIkon, User } from "@/types";

function tanggalWibPerangkat(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type KartuAngkaProps = {
  label: string;
  nilai: string;
  keterangan: string;
  persen: number;
  Ikon: KomponenIkon;
  onKlik?: () => void;
};

function KartuAngka({ label, nilai, keterangan, persen, Ikon, onKlik }: KartuAngkaProps) {
  const isi = (
    <GlassCard className="flex h-full items-center gap-3 p-3.5">
      <ProgressRing value={persen} size={52} strokeWidth={5}>
        <Ikon className="h-4 w-4 text-pri" aria-hidden="true" />
      </ProgressRing>
      <div className="min-w-0">
        <p className="text-xs font-bold text-teks-utama">{label}</p>
        <p className="angka-tab mt-0.5 font-heading text-base font-extrabold text-teks-utama">
          {nilai}
        </p>
        <p className="text-[10px] leading-tight text-teks-sekunder">{keterangan}</p>
      </div>
    </GlassCard>
  );

  if (!onKlik) return isi;
  return (
    <button type="button" onClick={onKlik} className="btn-tekan text-left" aria-label={label}>
      {isi}
    </button>
  );
}

export function BerandaScreen({
  user,
  onBukaNotifikasi,
  onBukaLaporanKerja,
  onBukaAbsensi,
  onBukaTvrKu,
}: {
  user: User;
  onBukaNotifikasi?: () => void;
  onBukaLaporanKerja?: () => void;
  onBukaAbsensi?: () => void;
  onBukaTvrKu?: () => void;
}) {
  const izin = useAppStore((s) => s.izinFitur);
  const boleh = (k: Parameters<typeof bolehFitur>[1]) => bolehFitur(izin, k, user.role);

  const [kpiKerja, setKpiKerja] = useState<KerjaKpi | null>(null);
  const [video, setVideo] = useState<{ jumlah: number; target: number } | null>(null);
  const [komentar, setKomentar] = useState<{ total: number; sudah: number } | null>(null);
  const [absen, setAbsen] = useState<{ masuk: string | null; pulang: string | null } | null>(
    null,
  );

  // Hanya mengambil data untuk kartu yang MENYALA. Kartu yang
  // dimatikan tidak boleh diam-diam tetap memanggil server.
  const mauKerja = boleh("beranda.kpi_kerja");
  const mauVideo = boleh("beranda.kpi_video");
  const mauKomentar = boleh("beranda.kpi_komentar");
  const mauAbsen = boleh("beranda.absensi");

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const tugas = await Promise.allSettled([
        mauKerja ? getLaporanKerja() : Promise.resolve(null),
        mauVideo ? getLaporanVideo() : Promise.resolve(null),
        mauAbsen ? getAbsensi(false) : Promise.resolve(null),
        mauKomentar
          ? getRekapPeriode(`${tanggalWibPerangkat()} 00:00-23:59`)
          : Promise.resolve(null),
      ]);
      if (!hidup) return;

      const [kerja, vid, abs, rekap] = tugas;
      if (kerja.status === "fulfilled" && kerja.value) setKpiKerja(kerja.value.kpi);
      if (vid.status === "fulfilled" && vid.value) {
        setVideo({ jumlah: vid.value.data.length, target: vid.value.kpi_target });
      }
      if (abs.status === "fulfilled" && abs.value) {
        const hariIni = abs.value.tanggal_hari_ini;
        const milikku = abs.value.data.filter(
          (a) => a.user_id === user.id && a.tanggal_wib === hariIni,
        );
        setAbsen({
          masuk: milikku.find((a) => a.jenis === "masuk")?.waktu ?? null,
          pulang: milikku.find((a) => a.jenis === "pulang")?.waktu ?? null,
        });
      }
      if (rekap.status === "fulfilled" && rekap.value) {
        const barisku = rekap.value.filter((b) => b.nama_kader === user.nama);
        setKomentar({
          total: barisku.length,
          sudah: barisku.filter((b) => b.sudah_komentar).length,
        });
      }
    })();
    return () => {
      hidup = false;
    };
  }, [user.id, user.nama, mauKerja, mauVideo, mauAbsen, mauKomentar]);

  const persenKerja = kpiKerja && kpiKerja.rencana_total > 0 ? (kpiKerja.kpi_persen ?? 0) : 0;
  const persenVideo = video && video.target > 0
    ? Math.min(100, Math.round((100 * video.jumlah) / video.target))
    : 0;
  const persenKomentar = komentar && komentar.total > 0
    ? Math.round((100 * komentar.sudah) / komentar.total)
    : 0;

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      {/* Sapaan */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-teks-sekunder">{sapaanHari()},</p>
          <h1 className="truncate font-heading text-[22px] leading-tight font-extrabold tracking-tight text-teks-utama">
            {user.nama.split(" ")[0] || user.nama}
          </h1>
          <p className="mt-1 text-[11px] text-teks-sekunder">
            {tanggalIndonesia(`${tanggalWibPerangkat()}T00:00:00+07:00`)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TombolLonceng onBuka={onBukaNotifikasi} />
          <ThemeToggle />
        </div>
      </header>

      {/* Ulang tahun hari ini */}
      <KartuUltah idKu={user.id} />

      {/* Pengumuman */}
      {boleh("beranda.pengumuman") && <KartuPengumumanTerbaru />}

      {/* Status kehadiran */}
      {mauAbsen && (
        <FadeInUp delay={0.04}>
          <button
            type="button"
            onClick={onBukaAbsensi}
            className="btn-tekan mt-4 w-full text-left"
            aria-label="Buka Absensi"
          >
            <GlassCard className="flex items-center gap-3 p-3.5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "#10B9811a", color: "#10B981" }}
                aria-hidden="true"
              >
                <CalendarCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-teks-utama">Kehadiran Hari Ini</p>
                <p className="mt-0.5 text-[11px] text-teks-sekunder">
                  {absen === null
                    ? "Memuat…"
                    : absen.masuk
                      ? `Masuk ${jamWIB(absen.masuk)}${absen.pulang ? ` · Pulang ${jamWIB(absen.pulang)}` : " · belum absen pulang"}`
                      : "Belum absen masuk — ketuk untuk absen"}
                </p>
              </div>
              {absen?.masuk ? (
                <StatusBadge label="hadir" warna="hijau" />
              ) : (
                <StatusBadge label="belum" warna="kuning" />
              )}
            </GlassCard>
          </button>
        </FadeInUp>
      )}

      {/* Kartu-kartu KPI */}
      <FadeInUp delay={0.08}>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {mauKerja && (
            <KartuAngka
              label="Kerja Hari Ini"
              nilai={kpiKerja ? `${kpiKerja.rencana_selesai}/${kpiKerja.rencana_total}` : "…"}
              keterangan={
                kpiKerja && kpiKerja.rencana_total === 0
                  ? "Belum ada rencana — ketuk"
                  : "rencana selesai"
              }
              persen={persenKerja}
              Ikon={ClipboardList}
              onKlik={onBukaLaporanKerja}
            />
          )}
          {mauKomentar && (
            <KartuAngka
              label="Wajib Komentar"
              nilai={komentar ? `${komentar.sudah}/${komentar.total}` : "…"}
              keterangan={
                komentar && komentar.total === 0
                  ? "Menunggu konten hari ini"
                  : "postingan dikomentari"
              }
              persen={persenKomentar}
              Ikon={MessageCircle}
            />
          )}
          {mauVideo && (
            <KartuAngka
              label="Laporan Video"
              nilai={video ? `${video.jumlah}/${video.target}` : "…"}
              keterangan="video dilaporkan"
              persen={persenVideo}
              Ikon={Video}
              onKlik={onBukaTvrKu}
            />
          )}
        </div>
      </FadeInUp>

      {/* Kewajiban komen & share video TV Rakyat terbaru */}
      <KartuVideoBaru />
    </div>
  );
}
