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
import { Tv, Newspaper, Send, Clapperboard } from "lucide-react";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { FadeInUp, ThemeToggle } from "@/components/pri-ui";
import { BeritaPanel } from "./berita-panel";
import { InsightPanel } from "./insight-panel";
import { InsightDetailScreen } from "./insight-detail-screen";
import { KirimVideoManual } from "@/features/tvr-ku/kirim-video-manual";
import { PanelTugasLink } from "./tugas-link-panel";
import { PipelinePanel } from "./pipeline-panel";
import { KirimVideoPanel } from "./kirim-video-panel";
import { ProgressPanel } from "./progress-panel";
import { PreviewModal } from "./preview-modal";
import { RiwayatVideo } from "./riwayat-video";
import { KelolaTimPanel } from "./kelola-tim-panel";
import { SeksiLipat } from "@/components/seksi-lipat";
import { EmbedTerbaru } from "./embed-terbaru";
import { SectionTitle } from "@/components/pri-ui";
import type { Berita, HasilProsesVideo, User, VideoAntrian } from "@/types";
import { adalahPimred } from "@/lib/jabatan";

type FaseTv = "form" | "proses" | "pratinjau";

type PayloadProses = {
  link: string;
  video_asli?: string;
  judul_overlay?: string;
  highlight?: string;
  sumber_akun?: string;
  caption_sumber?: string;
};

export function TvScreen({
  user,
  onBukaNotifikasi,
}: {
  user: User;
  onBukaNotifikasi?: () => void;
}) {
  // Pimpinan Redaksi (dan master): berhak menyetujui/menolak video.
  const pimred = adalahPimred(user);

  // Video sumber yang dipilih admin untuk direplikasi (dari panel Berita).
  // Link-nya TIDAK disalin ke form doksli — doksli tetap dicari & diisi
  // admin sendiri; ini cuma penanda video mana yang sedang dikerjakan.
  const [videoSumber, setVideoSumber] = useState<Berita | null>(null);
  // Fase alur utama
  const [fase, setFase] = useState<FaseTv>("form");
  const [payload, setPayload] = useState<PayloadProses | null>(null);
  const [hasil, setHasil] = useState<HasilProsesVideo | null>(null);
  // Pratinjau dibuka dari riwayat (bukan dari proses yang baru selesai).
  // Bedanya: video yang sudah diposting tidak menawarkan unggah lagi.
  const [dariRiwayat, setDariRiwayat] = useState(false);
  const [sudahDiunggah, setSudahDiunggah] = useState(false);
  const [linkPostingan, setLinkPostingan] = useState("");
  // Pembeda sesi proses (memastikan ProgressPanel mulai baru)
  const [sesiProses, setSesiProses] = useState(0);
  // Naik setelah unggahan selesai → RiwayatVideo memuat ulang
  const [refreshKey, setRefreshKey] = useState(0);
  // Layar insight rinci (per postingan) — dibuka dari panel Insight
  const [insightRinci, setInsightRinci] = useState(false);

  function mulaiProses(p: PayloadProses) {
    setPayload(p);
    setHasil(null);
    setSesiProses((s) => s + 1);
    setFase("proses");
  }

  function prosesSelesai(h: HasilProsesVideo) {
    setHasil(h);
    setDariRiwayat(false);
    setSudahDiunggah(false);
    setLinkPostingan("");
    setFase("pratinjau");
  }

  function batalkanProses() {
    setFase("form");
    setPayload(null);
  }

  function tutupPratinjau() {
    setFase("form");
    setHasil(null);
    setDariRiwayat(false);
  }

  /**
   * Buka pratinjau dari daftar riwayat.
   *
   * Baris riwayat sudah membawa semua yang dibutuhkan pratinjau, jadi
   * modal bisa langsung tampil tanpa permintaan tambahan ke server.
   * Video yang belum selesai diproses tetap boleh dibuka — modalnya
   * menampilkan judul & caption apa adanya dan menjelaskan bahwa
   * videonya belum tersedia, alih-alih baris yang diam saat diklik.
   */
  function bukaDariRiwayat(v: VideoAntrian) {
    setHasil({
      judul_overlay: v.judul_overlay || v.judul || "",
      highlight: v.highlight || "",
      caption_asli: v.caption_asli || "",
      caption_platform: v.caption_platform ?? null,
      persetujuan: v.persetujuan ?? "menunggu",
      persetujuan_oleh: v.persetujuan_oleh ?? null,
      sumber_upload: v.sumber_upload ?? "workflow",
      diupload_oleh: v.diupload_oleh ?? null,
      sumber: v.link || v.video_asli || "",
      jenis: v.jenis === "TIKTOK" ? "TIKTOK" : "INSTAGRAM",
      kode: v.id,
      hasil_render_url: v.hasil_render_url || "",
      thumbnail_url: v.thumbnail_url || "",
    });
    setDariRiwayat(true);
    setSudahDiunggah(v.status === "SUDAH DIPROSES");
    setLinkPostingan(v.link_instagram || "");
    setFase("pratinjau");
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
            {/* Sumber beritanya bukan cuma Nusantara TV (ada Indozone &
                Lambe Turah juga), jadi subjudulnya dibuat netral. */}
            <p className="text-xs text-teks-sekunder">Otomatisasi video TV Rakyat</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TombolLonceng onBuka={onBukaNotifikasi} />
          <ThemeToggle />
        </div>
      </header>

      {/* Insight profil sosmed — angka asli dari Ayrshare */}
      <FadeInUp delay={0.03} className="mt-5">
        <InsightPanel onBukaRinci={() => setInsightRinci(true)} />
      </FadeInUp>

      {/* ── Kelola tim (khusus Pimred): tanpa dua kolom, lebar penuh ── */}
      {pimred && <KelolaTimPanel />}

      {/*
        Tata letak dua bagian yang jelas, bukan tumpukan panel acak:
        - KIRI (PC): SUMBER — cek berita & bagi tugas link.
        - KANAN (PC): PRODUKSI — buat video, upload manual, pipeline,
          riwayat. Di HP keduanya menumpuk satu kolom secara wajar.
        Tiap bagian diberi judul supaya alurnya terbaca.
      */}
      {/* Desktop (fix 4.1): Sumber lebih ramping, Produksi lebih lega,
          jarak antar kolom proporsional. */}
      <div className="mt-6 lg:grid lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-8">
        {/* ── Bagian KIRI: Sumber ── */}
        <section className="flex flex-col gap-4">
          <SeksiLipat
            id="sumber-berita"
            judul="Sumber Berita"
            ikon={Newspaper}
            keterangan="Cek berita terbaru & pilih bahan video"
          >
            <BeritaPanel
              onPilihVideo={setVideoSumber}
              idTerpilih={videoSumber?.id ?? null}
            />
          </SeksiLipat>

          {/* Distribusi tugas link ke anggota — khusus Pimred. Link video
              yang dipilih di panel Berita otomatis terisi. */}
          {pimred && (
            <SeksiLipat
              id="bagi-tugas"
              judul="Bagi Tugas ke Anggota"
              ikon={Send}
              keterangan="Kirim link video ke anggota tim"
            >
              <PanelTugasLink linkAwal={videoSumber?.link_video} />
            </SeksiLipat>
          )}
        </section>

        {/* ── Bagian KANAN: Produksi ── */}
        <section className="mt-6 flex flex-col gap-4 lg:mt-0">
          <SeksiLipat
            id="buat-video"
            judul="Buat Video"
            ikon={Clapperboard}
            keterangan="Proses video dari sumber berita"
          >
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
                  <KirimVideoPanel
                    videoSumber={videoSumber}
                    onMulaiProses={mulaiProses}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </SeksiLipat>

          {/* Upload video manual (hasil edit sendiri) — antrean ACC Pimred */}
          <div>
            <SectionTitle judul="Upload Manual" />
            <KirimVideoManual />
          </div>

          {/* Status pipeline (pindahan dari dashboard super admin) */}
          <div>
            <SectionTitle judul="Status Pipeline" />
            <FadeInUp delay={0.08}>
              <PipelinePanel muatUlang={refreshKey} />
            </FadeInUp>
          </div>

          {/* Riwayat pemrosesan */}
          <div>
            <SectionTitle judul="Riwayat" />
            <FadeInUp delay={0.1}>
              <RiwayatVideo
                refreshKey={refreshKey}
                onBukaVideo={bukaDariRiwayat}
                onDataBerubah={() => setRefreshKey((k) => k + 1)}
              />
            </FadeInUp>
          </div>
        </section>
      </div>

      {/* Galeri 30 konten terbaru seluruh sosmed + metrik (spek 1.15) */}
      <EmbedTerbaru />

      {/* Layar insight rinci — menutupi layar TV Rakyat */}
      <AnimatePresence>
        {insightRinci && (
          <motion.div
            key="insight-rinci"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="fixed inset-0 z-[55] overflow-y-auto overscroll-contain bg-[var(--app-bg)] lg:left-60"
          >
            <InsightDetailScreen onKembali={() => setInsightRinci(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal pratinjau (melayang di atas layar) */}
      <AnimatePresence>
        {fase === "pratinjau" && hasil && (
          <PreviewModal
            key="preview"
            hasil={hasil}
            bolehSetujui={pimred}
            modeTinjau={dariRiwayat}
            sudahDiunggah={sudahDiunggah}
            linkPostingan={linkPostingan}
            onTutup={tutupPratinjau}
            onSelesaiUnggah={selesaiUnggah}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
