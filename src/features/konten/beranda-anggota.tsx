"use client";

// ============================================================
// Panel beranda anggota — dipasang di atas halaman Konten
// (halaman pertama ketua/anggota) supaya tiga hal penting tidak
// pernah terlewat:
//
// 1. PENGUMUMAN terbaru dari atasan (juga dipakai dashboard admin).
// 2. KERJA HARI INI — KPI rencana + pintasan ke Laporan Kerja.
// 3. KPI KOMENTAR — kewajiban komentar di konten 3 akun resmi,
//    dibaca dari rekap QC periode HARI INI sehingga ikut bergerak
//    setiap kali sistem menemukan konten baru (QC berjalan 9x/hari).
// ============================================================

import { useEffect, useState } from "react";
import { ClipboardList, Megaphone, MessageCircle, X } from "lucide-react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/glass-card";
import { FadeInUp } from "@/components/pri-ui";
import { ProgressRing } from "@/components/progress-ring";
import {
  getLaporanKerja,
  getKomentarSaya,
  getPengumuman,
  type KerjaKpi,
  type Pengumuman,
} from "@/services";
import { jamWIB } from "@/lib/format";
import type { User } from "@/types";

function tanggalWibPerangkat(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ------------------------------------------------------------
// Pengumuman terbaru — reusable (beranda anggota & dashboard admin)
// ------------------------------------------------------------

// Kunci penyimpanan lokal id pengumuman yang sudah di-geser-hapus.
// Sengaja per-perangkat (bukan server): menghapus dari beranda hanya
// merapikan tampilan SAYA — pengumumannya sendiri tetap ada untuk
// orang lain dan tetap terbaca di layar Chat.
const KUNCI_TUTUP = "pri-pengumuman-ditutup";

function bacaDitutup(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KUNCI_TUTUP) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function KartuPengumumanTerbaru() {
  const [daftar, setDaftar] = useState<Pengumuman[] | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getPengumuman();
        if (!hidup) return;
        const ditutup = new Set(bacaDitutup());
        setDaftar(hasil.data.filter((p) => !ditutup.has(p.id)).slice(0, 3));
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  function tutup(id: string) {
    // Simpan maksimal 100 id terakhir supaya localStorage tidak menumpuk.
    try {
      const baru = [...bacaDitutup(), id].slice(-100);
      localStorage.setItem(KUNCI_TUTUP, JSON.stringify(baru));
    } catch {
      // localStorage penuh/terblokir: kartunya tetap hilang sesi ini.
    }
    setDaftar((lama) => (lama ?? []).filter((p) => p.id !== id));
  }

  // Tidak ada pengumuman = tidak ada kartu — beranda tidak perlu
  // kotak kosong yang hanya bilang "belum ada apa-apa".
  if (!daftar || daftar.length === 0) return null;

  return (
    <FadeInUp>
      <div className="mt-4 flex flex-col gap-2">
        {daftar.map((p) => (
          <motion.div
            key={p.id}
            layout
            // Geser ke KIRI untuk menghapus dari beranda (ala WhatsApp).
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.6, right: 0.05 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -90) tutup(p.id);
            }}
            exit={{ opacity: 0, x: -160 }}
          >
            <GlassCard className="border-l-4 border-l-[#DC2626] p-3.5">
              <div className="flex items-start gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pri/10 text-pri"
                  aria-hidden="true"
                >
                  <Megaphone className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-teks-utama">{p.judul}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-teks-sekunder">
                    {p.isi}
                  </p>
                  <p className="mt-1 text-[10px] text-teks-sekunder/80">
                    {p.pengirim_nama} · {jamWIB(p.dibuat_pada)} · geser ⟵ untuk menutup
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => tutup(p.id)}
                  aria-label="Tutup pengumuman ini"
                  className="btn-tekan shrink-0 text-teks-sekunder/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </FadeInUp>
  );
}

// ------------------------------------------------------------
// Panel lengkap beranda anggota
// ------------------------------------------------------------

export function BerandaAnggotaPanel({
  user,
  onBukaLaporanKerja,
}: {
  user: User;
  onBukaLaporanKerja?: () => void;
}) {
  const [kpiKerja, setKpiKerja] = useState<KerjaKpi | null>(null);
  const [komentar, setKomentar] = useState<{ total: number; sudah: number } | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      // Dua sumber tidak saling bergantung; kegagalan salah satunya
      // tidak menggugurkan yang lain.
      const [kerja, rekap] = await Promise.allSettled([
        getLaporanKerja(),
        // Dihitung SERVER per pengguna (perbaikan 0/0; /api/rekap?saya=1).
        getKomentarSaya(),
      ]);
      if (!hidup) return;

      if (kerja.status === "fulfilled") setKpiKerja(kerja.value.kpi);

      if (rekap.status === "fulfilled" && rekap.value) {
        setKomentar(rekap.value);
      } else {
        // Gagal dimuat = biarkan "…" — jangan pamer 0/0 palsu.
        setKomentar(null);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [user.nama]);

  const persenKerja =
    kpiKerja && kpiKerja.rencana_total > 0 ? (kpiKerja.kpi_persen ?? 0) : 0;
  const persenKomentar =
    komentar && komentar.total > 0
      ? Math.round((100 * komentar.sudah) / komentar.total)
      : 0;

  return (
    <>
      <KartuPengumumanTerbaru />

      <FadeInUp delay={0.05}>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {/* Kerja hari ini → pintasan Laporan Kerja */}
          <button
            type="button"
            onClick={onBukaLaporanKerja}
            className="btn-tekan text-left"
            aria-label="Buka Laporan Kerja"
          >
            <GlassCard className="flex h-full items-center gap-3 p-3.5">
              <ProgressRing value={persenKerja} size={52} strokeWidth={5}>
                <ClipboardList className="h-4 w-4 text-pri" aria-hidden="true" />
              </ProgressRing>
              <div className="min-w-0">
                <p className="text-xs font-bold text-teks-utama">Kerja Hari Ini</p>
                <p className="angka-tab mt-0.5 font-heading text-base font-extrabold text-teks-utama">
                  {kpiKerja ? `${kpiKerja.rencana_selesai}/${kpiKerja.rencana_total}` : "…"}
                </p>
                <p className="text-[10px] leading-tight text-teks-sekunder">
                  {kpiKerja && kpiKerja.rencana_total === 0
                    ? "Belum ada rencana — ketuk untuk mengisi"
                    : "rencana selesai · ketuk untuk lapor"}
                </p>
              </div>
            </GlassCard>
          </button>

          {/* KPI kewajiban komentar konten */}
          <GlassCard className="flex h-full items-center gap-3 p-3.5">
            <ProgressRing value={persenKomentar} size={52} strokeWidth={5}>
              <MessageCircle className="h-4 w-4 text-pri" aria-hidden="true" />
            </ProgressRing>
            <div className="min-w-0">
              <p className="text-xs font-bold text-teks-utama">Wajib Komentar</p>
              <p className="angka-tab mt-0.5 font-heading text-base font-extrabold text-teks-utama">
                {komentar ? `${komentar.sudah}/${komentar.total}` : "…"}
              </p>
              <p className="text-[10px] leading-tight text-teks-sekunder">
                {komentar && komentar.total === 0
                  ? "Menunggu konten hari ini"
                  : "postingan sudah dikomentari"}
              </p>
            </div>
          </GlassCard>
        </div>
      </FadeInUp>
    </>
  );
}
