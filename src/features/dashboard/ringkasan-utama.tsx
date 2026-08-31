"use client";

// ============================================================
// RingkasanUtama (1 Sep 2026) — 4 kartu angka paling atas
// dashboard: Kepatuhan Komen QC, Absensi hari ini, KPI Kerja,
// dan KPI Video 5x6. Tiap kartu BISA DIKLIK menuju detailnya,
// dan angkanya ikut penyegaran otomatis (30 dtk + saat aplikasi
// dibuka kembali) supaya terasa "se-realtime mungkin".
// ============================================================

import { useEffect, useState } from "react";
import {
  CalendarCheck,
  ClipboardList,
  MessageCircle,
  Video,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { getRingkasUtama, type RingkasUtama } from "@/services";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { warnaKepatuhan } from "@/lib/format";

type Props = {
  onBukaKomen?: () => void;
  onBukaAbsensi?: () => void;
  onBukaKerja?: () => void;
  onBukaVideo?: () => void;
};

export function RingkasanUtama({
  onBukaKomen,
  onBukaAbsensi,
  onBukaKerja,
  onBukaVideo,
}: Props) {
  const [data, setData] = useState<RingkasUtama | null>(null);
  const [gagal, setGagal] = useState(false);

  // Muat pertama + penyegaran otomatis DIAM-DIAM (tanpa skeleton
  // ulang — angka lama tetap tampil sampai angka baru tiba).
  useEffect(() => {
    let hidup = true;
    void getRingkasUtama()
      .then((r) => hidup && setData(r))
      .catch(() => hidup && setGagal(true));
    return () => {
      hidup = false;
    };
  }, []);
  useSegarOtomatis(() => {
    void getRingkasUtama()
      .then((r) => {
        setData(r);
        setGagal(false);
      })
      .catch(() => {});
  });

  // Gagal memuat (mis. jabatan tanpa akses) → jangan tampilkan apa-apa,
  // dashboard lain tetap berjalan normal.
  if (gagal) return null;

  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <GlassSkeleton key={i} className="h-[88px] rounded-2xl" />
        ))}
      </div>
    );
  }

  const kartu = [
    {
      kunci: "komen",
      label: "Kepatuhan Komen",
      angka: `${data.komen.persen}%`,
      warna: warnaKepatuhan(data.komen.persen),
      sub: `${data.komen.kader_aktif}/${data.komen.total_kader} kader aktif komen`,
      Ikon: MessageCircle,
      onKlik: onBukaKomen,
    },
    {
      kunci: "absensi",
      label: "Absensi Hari Ini",
      angka: `${data.absensi.hadir}/${data.absensi.total}`,
      warna: warnaKepatuhan(
        data.absensi.total > 0
          ? Math.round((data.absensi.hadir / data.absensi.total) * 100)
          : 0,
      ),
      sub: "anggota sudah absen masuk",
      Ikon: CalendarCheck,
      onKlik: onBukaAbsensi,
    },
    {
      kunci: "kerja",
      label: "KPI Kerja",
      angka: `${data.kerja.rata}%`,
      warna: warnaKepatuhan(data.kerja.rata),
      sub: `${data.kerja.sudah_lapor}/${data.kerja.total} sudah menyusun rencana`,
      Ikon: ClipboardList,
      onKlik: onBukaKerja,
    },
    {
      kunci: "video",
      label: "KPI Video 5×6",
      angka: String(data.video.video_hari_ini),
      warna: "#8B5CF6",
      sub: `video hari ini · ${data.video.tercapai} anggota capai target`,
      Ikon: Video,
      onKlik: onBukaVideo,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {kartu.map((k) => (
        <button
          key={k.kunci}
          type="button"
          onClick={k.onKlik}
          disabled={!k.onKlik}
          aria-label={`Buka detail ${k.label}`}
          className="btn-tekan text-left disabled:cursor-default"
        >
          <GlassCard className="h-full p-3">
            <div className="flex items-center gap-1.5">
              <k.Ikon className="h-3.5 w-3.5 shrink-0" style={{ color: k.warna }} />
              <span className="truncate text-[10.5px] font-bold tracking-wide text-teks-sekunder uppercase">
                {k.label}
              </span>
            </div>
            <p
              className="angka-tab mt-1.5 font-heading text-[22px] leading-none font-extrabold"
              style={{ color: k.warna }}
            >
              {k.angka}
            </p>
            <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-teks-sekunder">
              {k.sub}
            </p>
          </GlassCard>
        </button>
      ))}
    </div>
  );
}
