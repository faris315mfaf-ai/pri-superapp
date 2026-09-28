"use client";

// ============================================================
// TvNasionalScreen (12–13 Sep 2026) — modul TV Rakyat Nasional.
//
// HANYA DASHBOARD. Kendali produksi (video wajib, unggah, kategori,
// pengaturan) tetap di modul TV Rakyat Official — tempat tim itu bekerja
// sehari-hari. Menaruh salinan kendali yang sama di dua modul membuat
// orang tidak pernah yakin mana yang "resmi", dan setiap perbaikan
// harus dikerjakan dua kali.
//
// Empat panel + satu halaman penuh:
//   • KENAIKAN nasional — hari ini, kemarin, sepekan, sebulan.
//   • VIDEO PER AKUN (26 Sep 2026) — seluruh video yang terbit pada
//     satu tanggal di akun tersambung, disaring per akun/platform.
//   • Insight per kategori (ringkas) → tombol "Halaman penuh" membuka
//     layar kartu embed per sosial media, tarik data upload-post, dan
//     tambah link batch.
//   • Dashboard nasional yang sudah ada — dipakai ulang apa adanya.
//   • ANALISIS VIDEO (29 Sep 2026) — kartu ringkas → halaman penuh berisi
//     tren, platform, akun terbaik, jam posting terbaik, video teratas.
// ============================================================

import { useState } from "react";
import dynamic from "next/dynamic";
import { Radio } from "lucide-react";
import { FadeInUp, ThemeToggle } from "@/components/pri-ui";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { TvNasionalDashboard } from "@/features/dashboard/tv-nasional-dashboard";
import { InsightKategoriScreen } from "./insight-kategori-screen";
import { PanelInsightKategori } from "./panel-insight-kategori";
import { PanelKenaikanNasional } from "./panel-kenaikan-nasional";
import { PanelVideoHarian } from "./panel-video-harian";
import { PanelAnalisisRingkas } from "./panel-analisis-ringkas";

// Halaman analisis membawa recharts — dimuat hanya saat dibuka.
const AnalisisVideoScreen = dynamic(() => import("./analisis-video-screen").then((m) => m.AnalisisVideoScreen), {
  ssr: false,
  loading: () => <div className="kolom-aplikasi px-4 pt-5 text-[12px] text-teks-sekunder">Memuat analisis…</div>,
});

export function TvNasionalScreen({
  onBukaNotifikasi,
}: {
  onBukaNotifikasi?: () => void;
}) {
  // Halaman penuh insight kategori — menutupi layar ini, bukan layar
  // terpisah di navigasi: kembalinya ke tempat yang sama persis.
  const [halamanKategori, setHalamanKategori] = useState<string | null>(null);
  const [halamanAnalisis, setHalamanAnalisis] = useState(false);

  if (halamanAnalisis) {
    return <AnalisisVideoScreen onKembali={() => setHalamanAnalisis(false)} />;
  }

  if (halamanKategori !== null) {
    return (
      <InsightKategoriScreen
        kategoriAwal={halamanKategori}
        onKembali={() => setHalamanKategori(null)}
      />
    );
  }

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <header className="flex items-start justify-between gap-3 pt-5">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{
              background: "linear-gradient(135deg, #7C3AED, #5B21B6)",
              boxShadow: "0 10px 24px rgba(124, 58, 237, 0.35)",
            }}
            aria-hidden="true"
          >
            <Radio className="h-5.5 w-5.5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
              TV Rakyat Nasional
            </h1>
            <p className="text-xs text-teks-sekunder">
              Angka gabungan seluruh akun TV Rakyat
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TombolLonceng onBuka={onBukaNotifikasi} />
          <ThemeToggle />
        </div>
      </header>

      <FadeInUp delay={0.03} className="mt-5">
        <PanelKenaikanNasional />
      </FadeInUp>

      <FadeInUp delay={0.04} className="mt-4">
        <PanelAnalisisRingkas onBuka={() => setHalamanAnalisis(true)} />
      </FadeInUp>

      <FadeInUp delay={0.045} className="mt-4">
        <PanelVideoHarian />
      </FadeInUp>

      <FadeInUp delay={0.06} className="mt-4">
        <PanelInsightKategori onBukaHalaman={(k) => setHalamanKategori(k)} />
      </FadeInUp>

      <FadeInUp delay={0.09} className="mt-4">
        <TvNasionalDashboard />
      </FadeInUp>
    </div>
  );
}
