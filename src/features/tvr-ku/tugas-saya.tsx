"use client";

// ============================================================
// PanelTugasSaya — tugas link dari Pimpinan Redaksi yang menempel
// di profil anggota ini. Ditampilkan di TVR Saya.
//
// Alur bagi anggota: buka link → buat videonya → unggah lewat kartu
// "Kirim Video" di bawah sambil MEMILIH tugas ini → tunggu ACC →
// begitu diposting, status di sini otomatis SELESAI.
// ============================================================

import { useEffect, useState } from "react";
import { ClipboardList, ExternalLink } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FadeInUp, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { getTugasLink, type TugasLink } from "@/services";
import { tanggalIndonesia } from "@/lib/format";

const LABEL: Record<string, { label: string; warna: "hijau" | "kuning" | "netral" }> = {
  baru: { label: "harus dikerjakan", warna: "kuning" },
  dikerjakan: { label: "menunggu tayang", warna: "kuning" },
  selesai: { label: "selesai ✓", warna: "hijau" },
  batal: { label: "dibatalkan", warna: "netral" },
};

export function PanelTugasSaya({ muatUlang = 0 }: { muatUlang?: number }) {
  const [daftar, setDaftar] = useState<TugasLink[] | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getTugasLink();
        if (hidup) setDaftar(hasil);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  // Panel hanya muncul bila memang pernah ada tugas — anggota tanpa
  // tugas tidak perlu melihat kartu kosong.
  if (daftar !== null && daftar.length === 0) return null;

  const aktif = (daftar ?? []).filter((t) => t.status === "baru" || t.status === "dikerjakan");
  const riwayat = (daftar ?? []).filter((t) => t.status === "selesai" || t.status === "batal");

  return (
    <FadeInUp delay={0.08}>
      <GlassCard className="mt-4 p-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4.5 w-4.5 text-pri" aria-hidden="true" />
          <p className="font-heading text-sm font-bold text-teks-utama">Tugas dari Pimred</p>
          {aktif.length > 0 && (
            <span className="angka-tab rounded-full bg-gagal/15 px-2 text-[11px] font-bold text-gagal">
              {aktif.length}
            </span>
          )}
        </div>
        {aktif.length > 0 && (
          <p className="mt-1 text-[11px] leading-snug text-teks-sekunder">
            Buat videonya, lalu unggah lewat kartu Kirim Video di bawah sambil
            memilih tugasnya. Kewajiban gugur otomatis begitu videonya tayang.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2">
          {daftar === null ? (
            <GlassSkeleton className="h-14 rounded-xl" />
          ) : (
            [...aktif, ...riwayat.slice(0, 3)].map((t) => {
              const st = LABEL[t.status] ?? LABEL.baru;
              return (
                <div key={t.id} className="glass-soft flex items-center gap-3 rounded-xl p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-teks-utama">
                      {t.judul || t.url}
                    </p>
                    <p className="mt-0.5 text-[11px] text-teks-sekunder">
                      Dari {t.nama_pemberi} · {tanggalIndonesia(t.dibuat_pada)}
                    </p>
                  </div>
                  <StatusBadge label={st.label} warna={st.warna} />
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Buka link tugas"
                    className="btn-tekan text-teks-sekunder"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              );
            })
          )}
        </div>
      </GlassCard>
    </FadeInUp>
  );
}
