"use client";

// ============================================================
// TvNasionalScreen (12 Sep 2026) — modul TV Rakyat Nasional.
//
// Satu modul, dua hal yang selama ini terpisah:
//   • ANGKA NASIONAL: kenaikan gabungan seluruh akun yang terdaftar.
//   • SELURUH KENDALI TV RAKYAT OFFICIAL: layar yang sama persis, bukan
//     salinan yang lama-lama berbeda sendiri.
//
// Layar Official sengaja DIPAKAI ULANG, bukan ditiru. Menyalin isinya
// berarti setiap perbaikan di kemudian hari harus dikerjakan dua kali —
// dan cepat atau lambat salah satunya terlewat.
// ============================================================

import { Radio } from "lucide-react";
import { FadeInUp, ThemeToggle } from "@/components/pri-ui";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { PanelKenaikanNasional } from "./panel-kenaikan-nasional";
import { PanelVideoWajib } from "./panel-video-wajib";
import { TvScreen } from "./tv-screen";
import type { User } from "@/types";

export function TvNasionalScreen({
  user,
  onBukaNotifikasi,
}: {
  user: User;
  onBukaNotifikasi?: () => void;
}) {
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
              Angka nasional + seluruh kendali TV Rakyat Official
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TombolLonceng onBuka={onBukaNotifikasi} />
          <ThemeToggle />
        </div>
      </header>

      {/* Video wajib paling atas: perintah kerja mendahului laporan. */}
      <FadeInUp delay={0.02} className="mt-5">
        <PanelVideoWajib />
      </FadeInUp>

      <FadeInUp delay={0.05} className="mt-3">
        <PanelKenaikanNasional />
      </FadeInUp>

      {/* Seluruh isi modul TV Rakyat Official, apa adanya. */}
      <div className="mt-2">
        <TvScreen user={user} onBukaNotifikasi={onBukaNotifikasi} tanpaHeader />
      </div>
    </div>
  );
}
