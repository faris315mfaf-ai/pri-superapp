"use client";

// ============================================================
// InsightPanel — angka profil sosmed TV Rakyat dari Ayrshare.
//
// Soal "realtime": Ayrshare menyegarkan angka menurut jadwalnya
// sendiri (sekitar 10 menit sekali), bukan setiap kali dibuka.
// Karena itu panel ini menampilkan waktu pembaruan apa adanya dan
// menyegarkan otomatis mengikuti jadwal Ayrshare — mengaku
// "detik-per-detik" hanya akan membuat admin salah menyimpulkan
// kalau angkanya tidak bergerak.
// ============================================================

import { useEffect, useState } from "react";
import type { KomponenIkon } from "@/types";
import { motion } from "framer-motion";
import {
  BarChart3,
  ChevronRight,
  Eye,
  Heart,
  Images,
  MessageCircle,
  RefreshCw,
  Radar,
  Users,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { getInsightSosmed, type BalasanInsight } from "@/services";
import { formatAngkaRingkas, jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Selang periksa ulang di layar; server tetap menahan panggilan ke
 *  Ayrshare sampai jadwal segarnya lewat, jadi ini tidak boros kuota. */
const SELANG_MS = 60_000;

type Metrik = {
  kunci: keyof Pick<
    NonNullable<BalasanInsight["insight"]>,
    "pengikut" | "jumlahMedia" | "suka" | "komentar" | "jangkauan" | "tayangan"
  >;
  label: string;
  ikon: KomponenIkon;
  warna: string;
};

const METRIK: Metrik[] = [
  { kunci: "pengikut", label: "Pengikut", ikon: Users, warna: "#DC2626" },
  { kunci: "jumlahMedia", label: "Postingan", ikon: Images, warna: "#3B82F6" },
  { kunci: "jangkauan", label: "Jangkauan", ikon: Radar, warna: "#8B5CF6" },
  { kunci: "tayangan", label: "Tayangan", ikon: Eye, warna: "#10B981" },
  { kunci: "suka", label: "Suka", ikon: Heart, warna: "#EC4899" },
  { kunci: "komentar", label: "Komentar", ikon: MessageCircle, warna: "#F59E0B" },
];

export function InsightPanel({ onBukaRinci }: { onBukaRinci?: () => void }) {
  const [data, setData] = useState<BalasanInsight | null>(null);
  const [gagal, setGagal] = useState("");
  const [menyegarkan, setMenyegarkan] = useState(false);

  // Muat + periksa berkala. setState hanya setelah await (aturan lint
  // react-hooks proyek ini); `hidup` mencegah setState pasca-unmount.
  useEffect(() => {
    let hidup = true;

    async function baca() {
      // Jangan bekerja saat tab tersembunyi — semua layar tab tetap
      // terpasang di page.tsx, jadi timer ini hidup walau tak terlihat.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const hasil = await getInsightSosmed();
        if (!hidup) return;
        setData(hasil);
        setGagal("");
      } catch (e) {
        if (!hidup) return;
        setGagal(e instanceof Error ? e.message : "Gagal memuat insight.");
      }
    }

    void baca();
    const detak = setInterval(() => void baca(), SELANG_MS);
    return () => {
      hidup = false;
      clearInterval(detak);
    };
  }, []);

  async function segarkanSekarang() {
    if (menyegarkan) return;
    setMenyegarkan(true);
    try {
      const hasil = await getInsightSosmed(true);
      setData(hasil);
      setGagal("");
      toast("sukses", "Insight disegarkan");
    } catch (e) {
      toast("error", "Gagal menyegarkan", e instanceof Error ? e.message : "");
    } finally {
      setMenyegarkan(false);
    }
  }

  const insight = data?.insight ?? null;

  return (
    <GlassCard className="p-4 sm:p-5">
      {/* Kepala panel */}
      <div className="flex items-center gap-3">
        <span
          className="glass-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pri"
          aria-hidden="true"
        >
          <BarChart3 className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-[15px] font-bold text-teks-utama">
            Insight Profil
          </h2>
          <p className="text-[11px] text-teks-sekunder">
            {insight?.username ? `@${insight.username}` : "Data dari Ayrshare"}
          </p>
        </div>
        {onBukaRinci && (
          <button
            type="button"
            onClick={onBukaRinci}
            aria-label="Lihat insight rinci per postingan"
            className="glass btn-tekan flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-pri"
          >
            Rinci
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => void segarkanSekarang()}
          disabled={menyegarkan || data?.siap === false}
          aria-label="Segarkan insight"
          className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-teks-utama disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", menyegarkan && "animate-spin")} />
        </button>
      </div>

      {/* Isi panel */}
      {data === null && !gagal ? (
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <GlassSkeleton key={i} className="h-[70px] rounded-xl" />
          ))}
        </div>
      ) : data?.siap === false ? (
        <EmptyState
          ikon={BarChart3}
          judul="Ayrshare Belum Tersambung"
          keterangan={data.pesan ?? "Kunci API Ayrshare belum diatur."}
          className="py-6"
        />
      ) : gagal && !insight ? (
        <EmptyState
          ikon={BarChart3}
          judul="Insight Tidak Bisa Dimuat"
          keterangan={gagal}
          labelAksi="Coba Lagi"
          onAksi={() => void segarkanSekarang()}
          className="py-6"
        />
      ) : !insight ? (
        <EmptyState
          ikon={BarChart3}
          judul="Belum Ada Akun Tertaut"
          keterangan="Tautkan akun sosmed di dasbor Ayrshare supaya angkanya muncul di sini."
          className="py-6"
        />
      ) : (
        <>
          {/* Identitas akun */}
          <div className="mt-4 flex items-center gap-3">
            {insight.fotoProfil ? (
              <img
                src={insight.fotoProfil}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                aria-hidden="true"
              >
                <Users className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-teks-utama">
                {insight.nama || insight.username}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-teks-sekunder">
                <PlatformIcon platform={insight.platform} size={12} />
                @{insight.username}
              </p>
            </div>
            {data?.kedaluwarsa && <StatusBadge label="data lama" warna="kuning" />}
          </div>

          {/* Angka-angka */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {METRIK.map((m, i) => {
              const nilai = insight[m.kunci];
              return (
                <motion.div
                  key={m.kunci}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.2), duration: 0.25 }}
                  className="glass-soft rounded-xl px-2.5 py-2.5"
                >
                  <m.ikon
                    className="h-3.5 w-3.5"
                    style={{ color: m.warna }}
                    aria-hidden="true"
                  />
                  <p className="angka-tab mt-1.5 font-heading text-[17px] leading-none font-extrabold text-teks-utama">
                    {nilai === null ? "–" : formatAngkaRingkas(nilai)}
                  </p>
                  <p className="mt-1 text-[10px] leading-tight text-teks-sekunder">{m.label}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Waktu pembaruan — disebut apa adanya, bukan diklaim realtime */}
          <p className="mt-3 text-center text-[10.5px] leading-relaxed text-teks-sekunder/80">
            {insight.diperbarui
              ? `Diperbarui Ayrshare pukul ${jamWIB(insight.diperbarui)} WIB`
              : "Waktu pembaruan tidak diketahui"}
            {insight.berikutnya ? ` · berikutnya sekitar ${jamWIB(insight.berikutnya)}` : ""}
          </p>

          {insight.catatan.length > 0 && (
            <p className="mt-1.5 text-center text-[10px] leading-relaxed text-teks-sekunder/70">
              {insight.catatan[0]}
            </p>
          )}
        </>
      )}
    </GlassCard>
  );
}
