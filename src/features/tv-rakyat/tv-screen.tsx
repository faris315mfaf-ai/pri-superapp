"use client";

// ============================================================
// TvScreen — komposisi utama modul Otomatisasi Video TV Rakyat.
// Alur: Cek Berita → Kirim Video → Progress Generate →
// Pratinjau → Unggah, plus Riwayat Pemrosesan.
// Komunikasi antar panel lewat state di sini (link terisi,
// fase proses, hasil, refresh riwayat).
// ============================================================

import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Tv, Send, Clapperboard, ListChecks, Settings, Tag, CalendarClock, Film, Wand2 } from "lucide-react";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { FadeInUp, SegmenJudul, ThemeToggle } from "@/components/pri-ui";
import { PanelTugasLink } from "./tugas-link-panel";
import { HasilScrapingPanel } from "./hasil-scraping-panel";
import { ModalPengaturanTv } from "./modal-pengaturan-tv";
import { KelolaKeywordPanel } from "./kelola-keyword-panel";
import { TataLetakModul, type SeksiModul } from "@/components/tata-letak-modul";
import { KirimVideoPanel } from "./kirim-video-panel";
import { ProgressPanel } from "./progress-panel";
import { PreviewModal } from "./preview-modal";
import { TombolRiwayatTv } from "./riwayat-tv";
import { KartuOfficialUp } from "./kartu-official-up";
import { IndikatorHadir, PanelTimLangsung, useTvLangsung } from "./tim-langsung";
import { PERISTIWA_AUTOEDIT_SEGAR } from "@/features/tvr-ku/edit-otomatis-tvr";
import { SeksiLipat } from "@/components/seksi-lipat";
import { useAppStore } from "@/hooks/use-app-store";
import type { Berita, HasilProsesVideo, User, VideoAntrian } from "@/types";
import { adalahPimred } from "@/lib/jabatan";
import { PanelVideoWajib } from "./panel-video-wajib";
import { PanelJadwalTayang } from "./panel-jadwal-tayang";
import { EditOtomatisTvr } from "@/features/tvr-ku/edit-otomatis-tvr";
import { StokVideoTvr, segarkanStokTvr } from "@/features/tvr-ku/stok-video-tvr";
import { KonteksTimAutoEdit } from "@/features/auto-edit/tim";
import { kirimStokTimKeOfficial } from "@/services";
import { useKolomWadah, type JumlahKolom } from "@/hooks/use-kolom-wadah";
import { RingkasanTv } from "./ringkasan-tv";
import { KartuKeywordWajib } from "./kartu-keyword-wajib";

type FaseTv = "form" | "proses" | "pratinjau";

// ------------------------------------------------------------
// TATA LETAK MASTER (7 Okt 2026): akun ber-peran master melihat modul
// ini sebagai dasbor yang memenuhi layar — strip ringkasan, Keyword
// Wajib di puncak, lalu bento berkolom sesuai lebar wadah. Akun lain
// tetap memakai susunan TataLetakModul satu kolom seperti sebelumnya.
// "video-wajib" bukan seksi TataLetakModul (dulu selalu di atas).
// ------------------------------------------------------------
// 7 Okt 2026: Sumber Berita, Log, Status Pipeline, Riwayat Pemrosesan, dan
// Konten Terbaru Sosmed DIHAPUS — jejak video kini di tombol "Riwayat"
// (kepala modul) beserta lonceng video gagal posting.
// Stok Video Tim (beserta tombol Riwayat) selalu PALING ATAS, selebar modul —
// tidak ikut bento.
const BENTO_MASTER: Record<JumlahKolom, string[][]> = {
  3: [["edit-otomatis-tim"], ["video-wajib"], ["tim-langsung"]],
  2: [["edit-otomatis-tim", "video-wajib"], ["tim-langsung"]],
  1: [["tim-langsung", "video-wajib", "edit-otomatis-tim"]],
};
/** Seksi pendukung di bawah bento ("Akses cepat"), dua kolom di layar lebar. */
const AKSES_MASTER = ["jadwal-tayang", "hasil-scraping", "bagi-tugas", "buat-video"];

type PayloadProses = {
  link: string;
  video_asli?: string;
  judul_overlay?: string;
  highlight?: string;
  sumber_akun?: string;
  caption_sumber?: string;
};

// ------------------------------------------------------------
// SEKSI YANG DISEMBUNYIKAN (12 Sep 2026, permintaan langsung).
//
// Kodenya sengaja dibiarkan: menyembunyikan lewat sakelar berarti
// menyalakannya lagi cukup mengubah satu kata di sini. Menghapusnya
// berarti menggali riwayat git kalau suatu hari dibutuhkan lagi.
// Bertipe boolean (bukan literal) supaya `x && {...}` tidak dibaca lint
// sebagai ekspresi tetap.
// ------------------------------------------------------------
const TAMPIL: Record<"hasilScraping" | "bagiTugas" | "buatVideo", boolean> = {
  hasilScraping: false,
  bagiTugas: false,
  buatVideo: false,
};

export function TvScreen({
  user,
  onBukaNotifikasi,
  tanpaHeader = false,
}: {
  user: User;
  onBukaNotifikasi?: () => void;
  /** Sembunyikan kepala modul — untuk layar lain yang menanam layar ini
   *  di bawah kepalanya sendiri. */
  tanpaHeader?: boolean;
}) {
  // Pimpinan Redaksi (dan master): berhak menyetujui/menolak video.
  const pimred = adalahPimred(user);
  // Wewenang TV per-orang (fitur 1.22.x/bug 3): anggota yang DITUNJUK
  // Pimred dengan boleh_acc/boleh_upload memperoleh hak setara Pimred
  // untuk aksi itu. Yang BELUM ditunjuk (mis. anggota Divisi TV Rakyat
  // biasa) hanya melihat Riwayat — form buat/upload video disembunyikan.
  const wewenang = useAppStore((s) => s.wewenangTv);
  const bolehProses = pimred || wewenang.proses;
  const bolehUpload = pimred || wewenang.upload;
  // Edit Otomatis & Stok Video Tim: tim TV (wewenang proses) + super admin.
  // Gerbang /api/autoedit menegakkan aturan yang sama (identitasTim).
  const bolehAutoEditTim = bolehProses || user.role === "super_admin";
  const bolehAcc = pimred || wewenang.acc;
  const tataMaster = user.role === "master";
  // MODUL BERSAMA (7 Okt 2026): tim melihat aksi satu sama lain seketika —
  // siaran Realtime memuat ulang panel, kehadiran, aktivitas & obrolan tim.
  const bolehRuang = bolehAutoEditTim || bolehUpload || bolehAcc;
  const wadahBentoRef = useRef<HTMLDivElement>(null);
  const kolomBento = useKolomWadah(wadahBentoRef);

  // Video sumber dari panel Berita (panel itu dihapus 7 Okt 2026); tetap
  // dibaca seksi Buat Video / Bagi Tugas yang sedang disembunyikan.
  const [videoSumber] = useState<Berita | null>(null);
  // Link berita yang "Dipakai" dari panel Hasil Scraping → mengisi Bagi
  // Tugas (fitur 1.22.x/5-bug). sinyalBukaTugas dinaikkan agar seksi
  // Bagi Tugas otomatis terbuka & tergulir ke layar.
  const [linkPakai, setLinkPakai] = useState<string>("");
  const [sinyalBukaTugas, setSinyalBukaTugas] = useState(0);
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
  // Pengaturan khusus TV Rakyat Official — di balik tombol gerigi
  // (12 Sep 2026), bukan lagi panel besar di tengah alur kerja.
  const [pengaturanBuka, setPengaturanBuka] = useState(false);

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

  const langsung = useTvLangsung({
    userId: String(user.id),
    aktif: bolehRuang,
    onBerubah: () => {
      setRefreshKey((k) => k + 1);
      segarkanStokTvr();
      window.dispatchEvent(new Event(PERISTIWA_AUTOEDIT_SEGAR));
    },
  });

  // Riwayat (7 Okt 2026): siapa mengedit/mengirim/memposting + lonceng
  // video yang gagal diposting — di dalam seksi Stok Video Tim.
  const tombolRiwayat = (
    <TombolRiwayatTv onBukaVideo={bukaDariRiwayat} bolehTandai={bolehUpload} muatUlang={refreshKey} />
  );

  const kepala = (
    <>
      {/* Header modul */}
      {!tanpaHeader && (
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
          {bolehRuang && (
            <div className="hidden sm:block">
              <IndikatorHadir langsung={langsung} />
            </div>
          )}
          {/* Gerigi: pengaturan yang jarang disentuh, disimpan di balik
              satu tombol supaya alur produksi tetap lapang. */}
          {pimred && (
            <button
              type="button"
              onClick={() => setPengaturanBuka(true)}
              aria-label="Pengaturan TV Rakyat Official"
              className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <TombolLonceng onBuka={onBukaNotifikasi} />
          <ThemeToggle />
        </div>
      </header>
      )}
    </>
  );

  // Minta tim menautkan akun resmi ke upload-post (konten Official).
  const kartuOfficial = bolehUpload && (
    <div className="mt-3">
      <KartuOfficialUp />
    </div>
  );

  const daftarSeksi = [
    bolehUpload && { id: "jadwal-tayang", judul: "Menunggu Jadwal Tayang", ikon: CalendarClock, render: () => (
        <SeksiLipat
          id="jadwal-tayang"
          judul="Menunggu Jadwal Tayang"
          ikon={CalendarClock}
          keterangan="Video yang dijadwalkan tayang otomatis"
        >
          <PanelJadwalTayang />
        </SeksiLipat>
    ) },
    pimred && { id: "kelola-keyword", judul: "Keyword Wajib Laporan", ikon: Tag, render: () => (
        <SeksiLipat
          id="kelola-keyword"
          judul="Keyword Wajib Laporan"
          ikon={Tag}
          keterangan="Tema wajib video yang harus diangkat semua anggota"
        >
          <KelolaKeywordPanel />
        </SeksiLipat>
    ) },
    pimred && TAMPIL.hasilScraping && { id: "hasil-scraping", judul: "Hasil Scraping Berita", ikon: ListChecks, render: () => (
        <SeksiLipat
          id="hasil-scraping"
          judul="Hasil Scraping Berita"
          ikon={ListChecks}
          keterangan="Pantau status tiap video & penanggung jawabnya"
        >
          <HasilScrapingPanel
            muatUlang={refreshKey}
            onPakai={(item) => {
              // "Pakai" → isi Bagi Tugas dengan link berita ini lalu
              // buka seksinya supaya Pimred tinggal memilih anggota.
              setLinkPakai(item.link ?? "");
              setSinyalBukaTugas((n) => n + 1);
            }}
          />
        </SeksiLipat>
    ) },
    pimred && TAMPIL.bagiTugas && { id: "bagi-tugas", judul: "Bagi Tugas ke Anggota", ikon: Send, render: () => (
        <SeksiLipat
          id="bagi-tugas"
          judul="Bagi Tugas ke Anggota"
          ikon={Send}
          keterangan="Kirim link video ke anggota tim"
          bukaSinyal={sinyalBukaTugas}
        >
          <PanelTugasLink linkAwal={linkPakai || videoSumber?.link_video} />
        </SeksiLipat>
    ) },
    bolehProses && TAMPIL.buatVideo && { id: "buat-video", judul: "Buat Video", ikon: Clapperboard, render: () => (
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
    ) },
    // Edit Otomatis & Stok Video TIM (5 Okt 2026): satu template & satu
    // stok (5 GB) bersama seluruh tim TV Rakyat Official. Komponennya
    // sama dengan TVR Saya; penanda tim "tv" membuat gerbang memakai
    // akun tim, bukan akun pribadi.
    bolehAutoEditTim && { id: "edit-otomatis-tim", judul: "Edit Otomatis Tim", ikon: Wand2, render: () => (
      <SeksiLipat
        id="tv-edit-otomatis-tim"
        judul="Edit Otomatis Tim"
        ikon={Wand2}
        keterangan="Template bersama tim + edit video otomatis"
        bawaanTerbuka
      >
        <KonteksTimAutoEdit.Provider value="tv">
          <EditOtomatisTvr />
        </KonteksTimAutoEdit.Provider>
      </SeksiLipat>
    ) },
    bolehAutoEditTim && { id: "stok-video-tim", judul: "Stok Video Tim", ikon: Film, render: () => (
      <SeksiLipat
        id="tv-stok-video-tim"
        judul="Stok Video Tim"
        ikon={Film}
        keterangan="Video jadi milik tim (maks 5 GB, terhapus otomatis 2 hari)"
        bawaanTerbuka
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] text-teks-sekunder">Jejak edit & posting ke akun Official</span>
          {tombolRiwayat}
        </div>
        <KonteksTimAutoEdit.Provider value="tv">
          <StokVideoTvr
            onKirimOfficial={
              bolehUpload
                ? async (item) => {
                    // Disalin ke antrean Official lalu langsung dibuka di
                    // pratinjau unggah (platform, caption, jadwal).
                    const v = await kirimStokTimKeOfficial(item.id, item.judul);
                    bukaDariRiwayat(v);
                    setRefreshKey((k) => k + 1);
                  }
                : undefined
            }
          />
        </KonteksTimAutoEdit.Provider>
      </SeksiLipat>
    ) },
  ].filter(Boolean) as SeksiModul[];
  // Stok Video Tim dipasang terpisah di paling atas; sisanya mengikuti tata letak.
  const seksiStok = daftarSeksi.find((s) => s.id === "stok-video-tim");
  const seksiLain = daftarSeksi.filter((s) => s.id !== "stok-video-tim");
  const stokAtas = seksiStok && (
    <div id="tv-stok-video-tim" className="mt-5 min-w-0 scroll-mt-4">
      {seksiStok.render()}
    </div>
  );

  const lapisan = (
    <>
      {/* Pengaturan khusus TV Rakyat Official (tombol gerigi). */}
      {pengaturanBuka && <ModalPengaturanTv onTutup={() => setPengaturanBuka(false)} />}

      {/* Modal pratinjau (melayang di atas layar) */}
      <AnimatePresence>
        {fase === "pratinjau" && hasil && (
          <PreviewModal
            key="preview"
            hasil={hasil}
            // Kontrol aksi (setujui/unggah) muncul untuk yang ditunjuk acc
            // ATAU upload; server menegakkan aksi spesifik per endpoint.
            bolehSetujui={bolehAcc || bolehUpload}
            modeTinjau={dariRiwayat}
            sudahDiunggah={sudahDiunggah}
            linkPostingan={linkPostingan}
            onTutup={tutupPratinjau}
            onSelesaiUnggah={selesaiUnggah}
          />
        )}
      </AnimatePresence>
    </>
  );

  if (tataMaster) {
    const perId = new Map(daftarSeksi.map((s) => [s.id, s]));
    const tampilkan = (id: string): ReactNode => {
      if (id === "video-wajib") return <PanelVideoWajib key={id} />;
      if (id === "tim-langsung") return bolehRuang ? <PanelTimLangsung key={id} langsung={langsung} /> : null;
      const s = perId.get(id);
      return s ? (
        <div key={id} id={`tv-${id}`} className="min-w-0 scroll-mt-4">
          {s.render()}
        </div>
      ) : null;
    };
    const akses = AKSES_MASTER.filter((id) => perId.has(id));
    return (
      <div className={tanpaHeader ? "" : "kolom-aplikasi kolom-lebar px-4 pb-32"}>
        {kepala}
        {stokAtas}
        {kartuOfficial}
        <div ref={wadahBentoRef} className="mt-5 flex flex-col gap-3">
          {bolehProses && (
            <FadeInUp delay={0.02}>
              <RingkasanTv muatUlang={refreshKey} />
            </FadeInUp>
          )}
          {pimred && (
            <FadeInUp delay={0.04}>
              <KartuKeywordWajib />
            </FadeInUp>
          )}
          {/* Bento menunggu lebar wadah terukur supaya panel tidak
              dipasang dua kali (satu kolom lalu pindah). */}
          {kolomBento && (
            <div
              className="grid items-start gap-3"
              style={{ gridTemplateColumns: `repeat(${BENTO_MASTER[kolomBento].length}, minmax(0, 1fr))` }}
            >
              {BENTO_MASTER[kolomBento].map((ids) => (
                <div key={ids.join()} className="flex min-w-0 flex-col gap-3">
                  {ids.map(tampilkan)}
                </div>
              ))}
            </div>
          )}
          {kolomBento && akses.length > 0 && (
            <>
              <SegmenJudul label="Akses cepat" />
              <div className="grid items-start gap-3 md:grid-cols-2">{akses.map(tampilkan)}</div>
            </>
          )}
        </div>
        {lapisan}
      </div>
    );
  }

  return (
    <div className={tanpaHeader ? "" : "kolom-aplikasi px-4 pb-32"}>
      {kepala}
      {stokAtas}
      {kartuOfficial}
      {bolehRuang && (
        <div className="mt-3">
          <PanelTimLangsung langsung={langsung} />
        </div>
      )}

      {/* Video wajib (12 Sep 2026): perintah video untuk seluruh anggota,
          DIKELOLA dari sini — di modul tempat tim TV Rakyat Official
          bekerja sehari-hari, bukan di modul dashboard. */}
      <FadeInUp delay={0.03} className="mt-5">
        <PanelVideoWajib />
      </FadeInUp>


      {/*
        Tata letak dua bagian yang jelas, bukan tumpukan panel acak:
        - KIRI (PC): SUMBER — cek berita & bagi tugas link.
        - KANAN (PC): PRODUKSI — buat video, upload manual, pipeline,
          riwayat. Di HP keduanya menumpuk satu kolom secara wajar.
        Tiap bagian diberi judul supaya alurnya terbaca.
      */}
      {/* Desktop (fix 4.1): Sumber lebih ramping, Produksi lebih lega,
          jarak antar kolom proporsional. */}
      {/* Atur Tata Letak (fitur 1.22.x): semua seksi bisa diseret/
          disembunyikan/dilipat — satu kolom. */}
      <div className="mt-6">
      <TataLetakModul
        modul="tv"
        bungkusSeksi={false}
        seksi={seksiLain}
      />
      </div>

      {lapisan}
    </div>
  );
}
