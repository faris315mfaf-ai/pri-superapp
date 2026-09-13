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
// Tiga panel + satu halaman penuh:
//   • KENAIKAN nasional — hari ini, kemarin, sepekan, sebulan.
//   • Insight per kategori (ringkas) → tombol "Halaman penuh" membuka
//     layar kartu embed per sosial media, tarik data Chocodata, dan
//     tambah link batch.
//   • Dashboard nasional yang sudah ada — dipakai ulang apa adanya.
// ============================================================

import { useState } from "react";
import { Radio } from "lucide-react";
import { FadeInUp, ThemeToggle } from "@/components/pri-ui";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { TvNasionalDashboard } from "@/features/dashboard/tv-nasional-dashboard";
import { InsightKategoriScreen } from "./insight-kategori-screen";
import { PanelInsightKategori } from "./panel-insight-kategori";
import { PanelKenaikanNasional } from "./panel-kenaikan-nasional";

export function TvNasionalScreen({
  onBukaNotifikasi,
}: {
  onBukaNotifikasi?: () => void;
}) {
  // Halaman penuh insight kategori — menutupi layar ini, bukan layar
  // terpisah di navigasi: kembalinya ke tempat yang sama persis.
  const [halamanKategori, setHalamanKategori] = useState<string | null>(null);

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

      <FadeInUp delay={0.06} className="mt-4">
        <PanelInsightKategori onBukaHalaman={(k) => setHalamanKategori(k)} />
      </FadeInUp>

      <FadeInUp delay={0.09} className="mt-4">
        <TvNasionalDashboard />
      </FadeInUp>
    </div>
  );
}
