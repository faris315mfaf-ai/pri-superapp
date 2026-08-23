"use client";

// ============================================================
// TvScreen — komposisi utama modul Otomatisasi Video TV Rakyat.
// Alur: Cek Berita → Kirim Video → Progress Generate →
// Pratinjau → Unggah, plus Riwayat Pemrosesan.
// Komunikasi antar panel lewat state di sini (link terisi,
// fase proses, hasil, refresh riwayat).
// ============================================================

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Tv } from "lucide-react";
import { FadeInUp, ThemeToggle } from "@/components/pri-ui";
import { BeritaPanel } from "./berita-panel";
import { KirimVideoPanel } from "./kirim-video-panel";
import { ProgressPanel } from "./progress-panel";
import { PreviewModal } from "./preview-modal";
import { RiwayatVideo } from "./riwayat-video";
import type { HasilProsesVideo, User } from "@/types";

type FaseTv = "form" | "proses" | "pratinjau";

type PayloadProses = {
  link: string;
  judul_overlay?: string;
  highlight?: string;
};

export function TvScreen({ user: _user }: { user: User }) {
  // Link yang dikirim dari panel Berita ke form KirimVideoPanel
  const [linkTerisi, setLinkTerisi] = useState("");
  // Fase alur utama
  const [fase, setFase] = useState<FaseTv>("form");
  const [payload, setPayload] = useState<PayloadProses | null>(null);
  const [hasil, setHasil] = useState<HasilProsesVideo | null>(null);
  // Pembeda sesi proses (memastikan ProgressPanel mulai baru)
  const [sesiProses, setSesiProses] = useState(0);
  // Naik setelah unggahan selesai → RiwayatVideo memuat ulang
  const [refreshKey, setRefreshKey] = useState(0);

  function mulaiProses(p: PayloadProses) {
    setPayload(p);
    setHasil(null);
    setSesiProses((s) => s + 1);
    setFase("proses");
  }

  function prosesSelesai(h: HasilProsesVideo) {
    setHasil(h);
    setFase("pratinjau");
  }

  function batalkanProses() {
    setFase("form");
    setPayload(null);
  }

  function tutupPratinjau() {
    setFase("form");
    setHasil(null);
  }

  function selesaiUnggah(_jumlahPlatform: number) {
    setFase("form");
    setHasil(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      {/* Header modul */}
      <header className="flex items-start justify-between gap-3 pt-5">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 10px 24px rgba(220, 38, 38, 0.35)",
            }}
            aria-hidden="true"
          >
            <Tv className="h-5.5 w-5.5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
              TV Rakyat
            </h1>
            <p className="text-xs text-teks-sekunder">Otomatisasi video Nusantara TV</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* 1. Panel cek berita */}
      <FadeInUp delay={0.05} className="mt-5">
        <BeritaPanel onGunakanLink={(link) => setLinkTerisi(link)} />
      </FadeInUp>

      {/* 2. Form kirim video ↔ panel progress (bergantian) */}
      <div className="mt-4">
        <AnimatePresence mode="wait" initial={false}>
          {fase === "proses" && payload ? (
            <motion.div
              key={`proses-${sesiProses}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <ProgressPanel
                payload={payload}
                onSelesai={prosesSelesai}
                onBatal={batalkanProses}
              />
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <KirimVideoPanel linkAwal={linkTerisi} onMulaiProses={mulaiProses} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. Riwayat pemrosesan */}
      <FadeInUp delay={0.1} className="mt-4">
        <RiwayatVideo refreshKey={refreshKey} />
      </FadeInUp>

      {/* Modal pratinjau (melayang di atas layar) */}
      <AnimatePresence>
        {fase === "pratinjau" && hasil && (
          <PreviewModal
            key="preview"
            hasil={hasil}
            onTutup={tutupPratinjau}
            onSelesaiUnggah={selesaiUnggah}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
