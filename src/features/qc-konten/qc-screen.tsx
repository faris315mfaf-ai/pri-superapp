"use client";

// ============================================================
// QcScreen — halaman utama Modul QC Konten Sosmed.
// Header periode → tombol Mulai Analisis (checklist beranimasi)
// → ringkasan → filter platform → daftar akun wajib.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  RefreshCw,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  Loader2,
  Circle,
  ChevronRight,
  ScanSearch,
  Clock,
  History,
  Check,
  X,
} from "lucide-react";
import {
  EmptyState,
  FadeInUp,
  GlassSkeleton,
  SectionTitle,
  StatusBadge,
  ThemeToggle,
} from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import { ProgressRing } from "@/components/progress-ring";
import { PlatformIcon } from "@/components/platform-icon";
import {
  getAkunWajib,
  getCakupanAyrshare,
  getAntrianQc,
  getPeriodeList,
  lanjutkanPemeriksaanQc,
  mulaiAnalisisQc,
  pantauAnalisisQc,
  type AkunWajibWithStats,
  type AntrianQc,
  analisisUlangAyrshare,
  type CakupanAyrshare,
} from "@/services";
import { toast } from "@/hooks/use-app-store";
import { RiwayatAnalisisModal } from "./riwayat-analisis-modal";
import { RingkasanQc } from "./ringkasan-qc";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Konstanta & helper
// ------------------------------------------------------------

const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "2026-08-23 17:00-16:00" → "23 Agustus 2026 · 17:00–16:00" */
function labelPeriode(periode: string): string {
  const [tanggal, jam] = periode.split(" ");
  if (!tanggal) return periode;
  const [y, m, d] = tanggal.split("-");
  const namaBulan = BULAN_ID[parseInt(m ?? "1", 10) - 1] ?? "";
  const jamTampil = (jam ?? "").replace("-", "–");
  return `${parseInt(d ?? "0", 10)} ${namaBulan} ${y} · ${jamTampil}`;
}

/**
 * Tahap analisis — MENGIKUTI PROSES NYATA n8n, bukan hitungan waktu.
 *
 * Workflow n8n menulis kode tahapnya ke tabel qc_progres di tiap titik
 * alur (mulai → ambil_postingan → ambil_komentar → simpan → selesai), dan
 * layar ini hanya MEMBACANYA lewat polling. Jadi lamanya tiap tahap di
 * layar = lamanya tahap itu di n8n sungguhan. Tahap terakhir tetap punya
 * bukti ganda: ia baru dicentang setelah notifikasi laporan benar-benar
 * masuk database.
 */
const TAHAP_ANALISIS = [
  { kode: "mulai", label: "Membaca daftar akun wajib" },
  { kode: "ambil_postingan", label: "Memindai postingan (scraping)" },
  { kode: "ambil_komentar", label: "Mengambil & mencocokkan komentar" },
  { kode: "simpan", label: "Menyusun rekap & menyimpan ke database" },
  { kode: "selesai", label: "Laporan akhir dari n8n" },
];

/** kode tahap qc_progres -> posisi di daftar tampilan */
const INDEKS_TAHAP = new Map(TAHAP_ANALISIS.map((t, i) => [t.kode, i]));

/**
 * Batas menunggu laporan sebelum layar berhenti memantau. Analisis harian
 * biasanya hitungan menit, tapi hari yang ramai bisa lebih lama (plafon
 * waktu n8n 30 menit) — lewat batas ini layar cuma berhenti MENUNGGU,
 * pekerjaannya sendiri tetap jalan dan hasilnya muncul sendiri.
 */
const BATAS_ANALISIS_MS = 600_000;

/** Hari ini menurut kalender WIB (bukan kalender server/peramban) */
function hariIniWIB(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

const CHIP_PLATFORM = [
  { id: "semua", label: "Semua", tersedia: true },
  { id: "instagram", label: "Instagram", tersedia: true },
  { id: "tiktok", label: "TikTok", tersedia: true },
  { id: "twitter", label: "X", tersedia: false },
  { id: "facebook", label: "Facebook", tersedia: false },
  { id: "threads", label: "Threads", tersedia: false },
  { id: "youtube", label: "YouTube", tersedia: false },
];

/** Waktu relatif singkat dari timestamp */
function laluSejak(ts: number): string {
  const detik = Math.floor((Date.now() - ts) / 1000);
  if (detik < 30) return "baru saja";
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  return `${Math.floor(menit / 60)} jam lalu`;
}

/** 95000 → "1 mnt 35 dtk" — dipakai penghitung waktu berjalan */
function durasiSingkat(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const menit = Math.floor(total / 60);
  const detik = total % 60;
  return menit > 0 ? `${menit} mnt ${detik} dtk` : `${detik} dtk`;
}

/**
 * Keadaan analisis.
 * "latar" = layar berhenti memantau tapi n8n kemungkinan masih bekerja —
 * dibedakan dari "selesai" supaya layar tidak pernah mengaku selesai
 * padahal laporannya belum pernah datang.
 */
type FaseAnalisis = "diam" | "berjalan" | "selesai" | "latar";

// ------------------------------------------------------------
// Komponen utama
// ------------------------------------------------------------

export function QcScreen({
  onBukaAkun,
  onBukaNotifikasi,
}: {
  onBukaAkun: (akunWajib: string) => void;
  onBukaNotifikasi?: () => void;
}) {
  // Periode
  const [periodeList, setPeriodeList] = useState<string[]>([]);
  const [periodeAktif, setPeriodeAktif] = useState<string>("");
  const [dropdownPeriode, setDropdownPeriode] = useState(false);

  // Data akun
  const [akunList, setAkunList] = useState<AkunWajibWithStats[] | null>(null);
  const [gagalMuat, setGagalMuat] = useState(false);

  // Analisis
  const [fase, setFase] = useState<FaseAnalisis>("diam");
  const [tahap, setTahap] = useState<number>(0);
  const [terakhirAnalisis, setTerakhirAnalisis] = useState<number | null>(null);
  const [mulaiPada, setMulaiPada] = useState<number | null>(null);
  const [sekarang, setSekarang] = useState<number>(() => Date.now());

  const pembatalRef = useRef<AbortController | null>(null);
  const hidupRef = useRef(true);
  // Penjaga klik ganda memakai ref, bukan state: dua ketukan dalam satu
  // tick React masih membaca state lama, jadi keduanya lolos.
  const jalanRef = useRef(false);
  // true setelah webhook n8n benar-benar berhasil dipicu
  const dipicuRef = useRef(false);
  // Kembaran `dipicuRef` dalam bentuk state, khusus untuk menggambar layar.
  // Selama permintaan pemicu masih di jalan, permintaan itu TIDAK bisa
  // dibatalkan (fetch-nya tanpa signal), jadi tombol "Berhenti Memantau"
  // belum boleh muncul — kalau muncul, ia akan berkata "dibatalkan sebelum
  // terkirim" padahal webhook tetap terkirim dan kuota TikHub tetap terpakai.
  const [terpicu, setTerpicu] = useState(false);

  // Filter platform
  const [platform, setPlatform] = useState("semua");

  // Tanggal yang mau dianalisis. Aturan baru: scraping PER HARI, dan
  // harinya bisa dipilih (maksimal hari ini — masa depan ditolak server).
  const [tanggalAnalisis, setTanggalAnalisis] = useState<string>(() => hariIniWIB());

  // Kemajuan pemeriksaan yang dibaca dari DATABASE, bukan dari memori layar.
  // Inilah yang memperbaiki bug lama: dulu status analisis cuma hidup di
  // memori peramban, jadi setelah halaman dimuat ulang layar selalu menulis
  // "Belum Ada Analisis Hari Ini" padahal datanya sudah ada di database.
  const [antrian, setAntrian] = useState<AntrianQc | null>(null);
  // Modal riwayat seluruh analisis (tombol Riwayat di header)
  const [riwayatBuka, setRiwayatBuka] = useState(false);
  const [sedangLanjut, setSedangLanjut] = useState(false);

  const sedangAnalisis = fase === "berjalan";
  // Sumber kebenaran: ADA data di database untuk periode ini. Fase lokal
  // hanya menambah, tidak lagi menentukan sendiri.
  const adaDataTersimpan = Boolean(antrian && antrian.total > 0);
  const sudahAnalisis = fase === "selesai" || fase === "latar" || adaDataTersimpan;

  // Muat data awal
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [list, periode] = await Promise.all([getAkunWajib(), getPeriodeList()]);
        if (!hidup) return;
        setAkunList(list);
        setPeriodeList(periode);
        setPeriodeAktif(periode[0] ?? "");
      } catch {
        if (hidup) {
          setGagalMuat(true);
          toast("error", "Gagal memuat data QC", "Periksa koneksi lalu coba lagi.");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  // Bersihkan timer & pemantauan saat unmount.
  // WAJIB: page.tsx memasang layar QC secara permanen dan hanya
  // menyembunyikannya, jadi polling yang lupa dihentikan akan terus
  // memukul server selamanya.
  useEffect(() => {
    hidupRef.current = true;
    return () => {
      hidupRef.current = false;
      pembatalRef.current?.abort();
    };
  }, []);

  // Penghitung waktu berjalan — hidup hanya selagi menganalisis,
  // jadi ia berhenti sendiri begitu fase berubah.
  useEffect(() => {
    if (fase !== "berjalan") return;
    const detak = setInterval(() => setSekarang(Date.now()), 1000);
    return () => clearInterval(detak);
  }, [fase]);

  // Baca kemajuan antrian dari database. Dijalankan saat tanggal berubah,
  // lalu diulang tiap 8 detik SELAMA masih ada yang menunggu — supaya angka
  // "12 dari 53 diperiksa" bergerak sendiri mengikuti kerja n8n, tanpa
  // pengguna perlu memuat ulang halaman.
  useEffect(() => {
    const periodeTanggal = tanggalAnalisis + " 00:00-23:59";
    let hidup = true;

    async function baca() {
      const hasil = await getAntrianQc(periodeTanggal);
      if (!hidup || !hidupRef.current) return;
      setAntrian(hasil);
      return hasil;
    }

    void baca();

    const detak = setInterval(() => {
      // Berhenti memukul server saat tab tidak terlihat: page.tsx memasang
      // semua layar sekaligus, jadi timer ini tetap hidup walau pengguna
      // sedang berada di tab lain.
      if (document.visibilityState === "hidden") return;
      void baca();
    }, 8000);

    return () => {
      hidup = false;
      clearInterval(detak);
    };
  }, [tanggalAnalisis, fase]);

  /** Lanjutkan pemeriksaan sisa antrian tanpa mendata ulang postingan */
  async function lanjutkanPemeriksaan() {
    if (sedangLanjut) return;
    setSedangLanjut(true);
    try {
      await lanjutkanPemeriksaanQc(tanggalAnalisis + " 00:00-23:59");
      toast(
        "info",
        "Pemeriksaan dilanjutkan",
        "n8n melanjutkan sisa antrian. Angkanya bergerak sendiri di layar ini.",
      );
    } catch (e) {
      toast(
        "error",
        "Gagal melanjutkan",
        e instanceof Error ? e.message : "Coba lagi sebentar.",
      );
    } finally {
      if (hidupRef.current) setSedangLanjut(false);
    }
  }

  // Analisis berbasis Ayrshare — JALUR UTAMA sejak 1.14. Sinkron
  // (tanpa n8n), hasilnya langsung tertulis ke database saat
  // permintaan selesai.
  const [sedangAyrshare, setSedangAyrshare] = useState(false);
  /** Sisa postingan yang masih menunggu diperiksa (untuk pesan tombol) */
  const [sisaAnalisis, setSisaAnalisis] = useState(0);

  /**
   * Cakupan akun: mana yang bisa dibaca Ayrshare, mana yang belum.
   * Dibaca dari server supaya layar mengikuti akun yang BENAR-BENAR
   * tertaut — begitu dpp.pri atau akun Ketua Umum ditautkan, panel ini
   * berubah sendiri tanpa menyentuh kode.
   */
  const [cakupan, setCakupan] = useState<CakupanAyrshare | null>(null);
  useEffect(() => {
    let hidup = true;
    void (async () => {
      const hasil = await getCakupanAyrshare();
      if (hidup) setCakupan(hasil);
    })();
    return () => {
      hidup = false;
    };
  }, []);
  async function jalankanAyrshare() {
    if (sedangAyrshare) return;
    setSedangAyrshare(true);
    try {
      // Analisis dipotong per anggaran waktu di server supaya tidak
      // pernah kena batas waktu fungsi. Di sini putarannya diulang
      // otomatis sampai tuntas — bagi pengurus tetap SATU kali tekan.
      let hasil = await analisisUlangAyrshare();
      let putaran = 1;
      const MAKS_PUTARAN = 12;
      while (hasil.selesai === false && putaran < MAKS_PUTARAN) {
        setSisaAnalisis(hasil.sisa ?? 0);
        const lanjut = await analisisUlangAyrshare();
        // Gabungkan angkanya supaya yang dilaporkan adalah TOTAL
        // seluruh putaran, bukan hanya putaran terakhir.
        hasil = {
          ...lanjut,
          komentar: hasil.komentar + lanjut.komentar,
          comply: hasil.comply + lanjut.comply,
          peringatan: [...(hasil.peringatan ?? []), ...(lanjut.peringatan ?? [])],
        };
        putaran += 1;
      }
      setSisaAnalisis(0);
      // Peringatan pemotongan (bila postingan hari ini melebihi yang
      // bisa dibaca sekali jalan) ditampilkan APA ADANYA — angka yang
      // terpotong diam-diam lebih berbahaya daripada angka yang jujur.
      const adaPeringatan = (hasil.peringatan ?? []).length > 0;
      toast(
        adaPeringatan ? "peringatan" : "sukses",
        adaPeringatan ? "Analisis selesai sebagian" : "Analisis selesai",
        `${hasil.postingan} postingan, ${hasil.komentar} komentar dibaca. Tercakup: ${hasil.akun_tercakup.join(", ")}.` +
          (hasil.akun_terlewat.length > 0
            ? ` Belum tertaut Ayrshare: ${hasil.akun_terlewat.join(", ")}.`
            : "") +
          (adaPeringatan ? ` ${(hasil.peringatan ?? []).join(" ")}` : ""),
      );
      setTerakhirAnalisis(Date.now());
      await muatUlangData();
    } catch (e) {
      toast("error", "Analisis Ayrshare gagal", e instanceof Error ? e.message : "");
    } finally {
      if (hidupRef.current) setSedangAyrshare(false);
    }
  }

  /** Ambil ulang angka QC dari database setelah n8n menulis rekap baru */
  async function muatUlangData() {
    try {
      const [list, periode] = await Promise.all([getAkunWajib(), getPeriodeList()]);
      if (!hidupRef.current) return;
      setAkunList(list);
      setGagalMuat(false);
      setPeriodeList(periode);
      // Periode pilihan admin dihormati; hanya diisi bila memang kosong.
      setPeriodeAktif((p) => p || periode[0] || "");
    } catch {
      if (hidupRef.current) {
        toast(
          "error",
          "Gagal memuat ulang data QC",
          "Angka di layar mungkin belum yang terbaru. Tarik untuk menyegarkan.",
        );
      }
    }
  }

  /**
   * Picu workflow n8n lalu tunggu laporannya benar-benar masuk.
   *
   * Tidak ada animasi palsu di sini: tahap perkiraan boleh maju sendiri,
   * tapi status "selesai" HANYA diberikan kalau notifikasi laporan QC
   * yang lebih baru sudah muncul di database.
   */
  async function mulaiAnalisis() {
    if (jalanRef.current) return;
    jalanRef.current = true;

    const pembatal = new AbortController();
    pembatalRef.current = pembatal;
    dipicuRef.current = false;
    setTerpicu(false);

    setFase("berjalan");
    setTahap(0);
    setMulaiPada(Date.now());
    setSekarang(Date.now());

    try {
      // Penanda laporan LAMA diambil server sebelum webhook dipicu —
      // itulah pembanding yang mencegah laporan run kemarin dikira
      // hasil run sekarang.
      const { penanda: penandaSebelum, progresSebelum } =
        await mulaiAnalisisQc(tanggalAnalisis);
      dipicuRef.current = true;
      if (!hidupRef.current || pembatal.signal.aborted) return;
      setTerpicu(true);

      toast(
        "info",
        "Analisis dimulai",
        `n8n memeriksa postingan & komentar tanggal ${tanggalAnalisis}. ` +
          "Tahapan di panel mengikuti proses n8n secara langsung.",
      );

      const hasil = await pantauAnalisisQc(penandaSebelum, {
        signal: pembatal.signal,
        batasMs: BATAS_ANALISIS_MS,
        progresSebelum,
        // Tahap di layar digerakkan oleh catatan progres yang ditulis n8n
        // sendiri — hanya boleh MAJU, karena hasil poll bisa tiba tak
        // berurutan dan tahap tidak boleh terlihat mundur.
        onProgres: (prg) => {
          if (!hidupRef.current || pembatal.signal.aborted) return;
          const idx = INDEKS_TAHAP.get(prg.tahap);
          if (idx !== undefined) setTahap((lama) => Math.max(lama, idx));
        },
      });
      if (!hidupRef.current || pembatal.signal.aborted) return;

      if (hasil.selesai) {
        setTahap(TAHAP_ANALISIS.length);
        setFase("selesai");
        setTerakhirAnalisis(Date.now());
        await muatUlangData();
        if (!hidupRef.current) return;
        toast(
          "sukses",
          "Analisis selesai",
          hasil.laporan?.isi ?? "Rekap kepatuhan sudah diperbarui.",
        );
      } else {
        // Lewat batas waktu ≠ gagal. Katakan apa adanya.
        setFase("latar");
        await muatUlangData();
        if (!hidupRef.current) return;
        toast(
          "info",
          "Analisis masih berjalan",
          "n8n belum mengirim laporan. Hasilnya akan muncul sendiri — cek lagi beberapa menit lagi.",
        );
      }
    } catch (e) {
      if (!hidupRef.current || pembatal.signal.aborted) return;
      setFase("diam");
      toast(
        "error",
        "Gagal memulai analisis",
        e instanceof Error ? e.message : "Coba lagi beberapa saat lagi.",
      );
    } finally {
      // Hanya bereskan bila run INI masih yang aktif. Kalau admin sudah
      // menekan berhenti lalu memulai run baru, run lama tidak boleh
      // ikut mematikan pewaktu maupun penjaga milik run baru.
      if (pembatalRef.current === pembatal) {
        jalanRef.current = false;
        pembatalRef.current = null;
      }
    }
  }

  /**
   * Berhenti MEMANTAU — bukan membatalkan pekerjaan n8n. Sekali webhook
   * dipicu, workflow tetap jalan sampai tuntas; yang berhenti hanya
   * polling di layar ini.
   */
  function berhentiMemantau() {
    // Bedakan "sudah terpicu" dari "belum sempat terpicu": kalau
    // permintaan pemicu belum berhasil, tidak jujur bilang ada analisis
    // yang sedang berjalan di latar belakang.
    const sudahDipicu = dipicuRef.current;

    pembatalRef.current?.abort();
    pembatalRef.current = null;
    jalanRef.current = false;
    setFase(sudahDipicu ? "latar" : "diam");

    if (sudahDipicu) {
      void muatUlangData();
      toast(
        "info",
        "Berhenti memantau",
        "Analisis tetap berjalan di n8n. Hasilnya akan muncul saat data dimuat ulang nanti.",
      );
    } else {
      toast("info", "Dibatalkan", "Permintaan analisis dibatalkan sebelum terkirim.");
    }
  }

  // Ringkasan agregat dari data services
  const ringkasan = useMemo(() => {
    if (!akunList) return null;
    const totalPostingan = akunList.reduce((a, x) => a + x.total_postingan, 0);
    const patuhPenuh = akunList.reduce((a, x) => a + x.kader_patuh_penuh, 0);
    const totalPasangan = akunList.length * 24;
    return { totalPostingan, patuhPenuh, totalPasangan };
  }, [akunList]);

  const akunTampil = useMemo(() => {
    if (!akunList) return [];
    if (platform === "semua") return akunList;
    return akunList.filter((a) => a.platform === platform);
  }, [akunList, platform]);

  /**
   * Kemajuan yang JUJUR: selagi menunggu, angkanya dibatasi 92% —
   * 100% hanya boleh muncul setelah laporan n8n benar-benar masuk.
   */
  const persenAnalisis =
    fase === "berjalan"
      ? Math.min(92, Math.max(6, Math.round((tahap / TAHAP_ANALISIS.length) * 100)))
      : 100;

  /** Lama analisis berjalan, untuk teks "sudah 1 mnt 20 dtk" */
  const durasiBerjalan = mulaiPada ? sekarang - mulaiPada : 0;

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      {/* Header modul */}
      <header className="flex items-start justify-between gap-3 pt-5">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
            QC Konten Sosmed
          </h1>
          <p className="mt-0.5 text-xs text-teks-sekunder">
            Pantau kepatuhan komentar kader di akun wajib
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRiwayatBuka(true)}
            aria-label="Riwayat analisis"
            className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-xl text-teks-utama"
          >
            <History className="h-4.5 w-4.5" />
          </button>
          <TombolLonceng onBuka={onBukaNotifikasi} />
          <ThemeToggle />
        </div>
      </header>

      {/* Modal riwayat analisis */}
      <AnimatePresence>
        {riwayatBuka && <RiwayatAnalisisModal onTutup={() => setRiwayatBuka(false)} />}
      </AnimatePresence>

      {/* Header periode */}
      <FadeInUp delay={0.05} className="mt-4">
        <GlassCard className="relative p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-heading text-sm font-bold text-teks-utama">
                {periodeAktif ? labelPeriode(periodeAktif) : "Memuat periode..."}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sukses opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sukses" />
                </span>
                <span className="text-[11px] font-medium text-teks-sekunder">
                  {periodeList.length > 0 && periodeAktif === periodeList[0]
                    ? "Periode berjalan"
                    : "Periode selesai"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDropdownPeriode((v) => !v)}
              aria-label="Pilih periode"
              aria-expanded={dropdownPeriode}
              className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
            >
              <CalendarDays className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Dropdown 7 periode terakhir */}
          <AnimatePresence>
            {dropdownPeriode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="scrollbar-tipis mt-3 max-h-56 overflow-y-auto rounded-xl border border-black/5 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.06]">
                  {periodeList.map((p, i) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPeriodeAktif(p);
                        setDropdownPeriode(false);
                        if (p !== periodeAktif) {
                          toast(
                            "info",
                            "Periode diganti",
                            `Menampilkan data ${labelPeriode(p)}`,
                          );
                        }
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                        p === periodeAktif && "font-bold text-pri",
                      )}
                    >
                      <span>{labelPeriode(p)}</span>
                      {i === 0 ? (
                        <StatusBadge label="Berjalan" warna="hijau" />
                      ) : (
                        <StatusBadge label="Selesai" warna="netral" />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </FadeInUp>

      {/* Tombol Mulai Analisis / Panel proses */}
      <FadeInUp delay={0.1} className="mt-4">
        {sedangAnalisis ? (
          <GlassCard className="p-4">
            <div className="flex items-start gap-4">
              <ProgressRing value={persenAnalisis} size={72} strokeWidth={7} color="#DC2626">
                <span className="angka-tab font-heading text-sm font-extrabold text-teks-utama">
                  {persenAnalisis}%
                </span>
              </ProgressRing>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-bold text-teks-utama">
                  Menganalisis kepatuhan...
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
                  Dikerjakan n8n di latar belakang · sudah{" "}
                  <span className="angka-tab">{durasiSingkat(durasiBerjalan)}</span>
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {TAHAP_ANALISIS.map((t, i) => {
                    const selesai = i < tahap;
                    const berjalan = i === tahap;
                    return (
                      <motion.li
                        key={t.kode}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: selesai || berjalan ? 1 : 0.35, x: 0 }}
                        className="flex items-center gap-2 text-xs"
                      >
                        {selesai ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sukses" />
                        ) : berjalan ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-pri" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 shrink-0 text-teks-sekunder/50" />
                        )}
                        <span
                          className={cn(
                            "leading-snug",
                            selesai
                              ? "text-teks-sekunder line-through decoration-sukses/50"
                              : berjalan
                                ? "font-semibold text-teks-utama"
                                : "text-teks-sekunder",
                          )}
                        >
                          {t.label}
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[10px] leading-snug text-teks-sekunder">
                  Tahap di atas mengikuti proses n8n secara langsung — n8n
                  mencatat kemajuannya ke database dan layar ini membacanya.
                </p>
                {terpicu ? (
                  <button
                    type="button"
                    onClick={berhentiMemantau}
                    className="glass btn-tekan mt-2.5 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-teks-sekunder"
                  >
                    <X className="h-3.5 w-3.5" />
                    Berhenti Memantau
                  </button>
                ) : (
                  // Permintaan pemicu belum bisa dibatalkan, jadi jangan
                  // tawarkan tombol yang tidak sanggup menepati janjinya.
                  <p className="mt-2.5 text-[11px] font-semibold text-teks-sekunder">
                    Mengirim permintaan ke n8n...
                  </p>
                )}
              </div>
            </div>
          </GlassCard>
        ) : (
          <div>
            {/* Pilihan tanggal — aturan scraping PER HARI */}
            <GlassCard className="mb-2.5 flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pri/10">
                <CalendarDays className="h-4.5 w-4.5 text-pri" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-teks-sekunder">
                  Tanggal yang dianalisis
                </p>
                <input
                  type="date"
                  value={tanggalAnalisis}
                  max={hariIniWIB()}
                  onChange={(e) => {
                    // Kosong (tombol clear peramban) → kembali ke hari ini,
                    // supaya tombol Analisis tidak pernah mengirim tanggal kosong.
                    setTanggalAnalisis(e.target.value || hariIniWIB());
                  }}
                  className="angka-tab mt-0.5 w-full bg-transparent font-heading text-sm font-bold text-teks-utama outline-none"
                  aria-label="Pilih tanggal yang mau dianalisis"
                />
              </div>
              {tanggalAnalisis !== hariIniWIB() && (
                <button
                  type="button"
                  onClick={() => setTanggalAnalisis(hariIniWIB())}
                  className="glass btn-tekan shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-teks-sekunder"
                >
                  Hari ini
                </button>
              )}
            </GlassCard>
            {/* TOMBOL UTAMA — sejak 1.14 memakai data Ayrshare, bukan
                scraping n8n. Alur kepatuhannya sama persis (tetap
                berbasis KOMENTAR); yang berganti hanya sumber datanya. */}
            <button
              type="button"
              onClick={() => void jalankanAyrshare()}
              disabled={sedangAyrshare || sedangAnalisis}
              className="btn-tekan flex h-13 w-full items-center justify-center gap-2.5 rounded-2xl font-heading text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                boxShadow: "0 10px 24px rgba(220, 38, 38, 0.35)",
                height: "3.25rem",
              }}
            >
              {sedangAyrshare ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : sudahAnalisis ? (
                <RefreshCw className="h-5 w-5" />
              ) : (
                <Zap className="h-5 w-5" />
              )}
              {sedangAyrshare
                ? sisaAnalisis > 0
                  ? `Memeriksa… sisa ${sisaAnalisis} postingan`
                  : "Membaca data Ayrshare…"
                : sudahAnalisis
                  ? "Analisis Ulang"
                  : "Mulai Analisis"}
            </button>

            {/* Cakupan akun — tampil apa adanya mengikuti akun yang
                tertaut di Ayrshare saat ini. */}
            {cakupan && (cakupan.tercakup.length > 0 || cakupan.terlewat.length > 0) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {cakupan.tercakup.map((a) => (
                  <span
                    key={`ada-${a.platform}-${a.username}`}
                    className="inline-flex items-center gap-1 rounded-full bg-sukses/12 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400"
                    title={`Dibaca lewat Ayrshare (${a.platform})`}
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />@{a.username}
                  </span>
                ))}
                {cakupan.terlewat.map((a) => (
                  <span
                    key={`belum-${a.platform}-${a.username}`}
                    className="glass-soft inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-teks-sekunder"
                    title={`Belum tertaut di Ayrshare (${a.platform}) — masih lewat analisis lama`}
                  >
                    @{a.username}
                  </span>
                ))}
              </div>
            )}
            {/* Jujur: run yang belum terbukti selesai tidak boleh
                ditampilkan seolah sudah menghasilkan angka final. */}
            {fase === "latar" && (
              <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-teks-sekunder">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-pri" />
                Analisis masih berjalan di latar belakang. Hasilnya muncul sendiri
                setelah n8n selesai.
              </p>
            )}
            {fase !== "latar" && terakhirAnalisis && (
              <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-teks-sekunder">
                <Clock className="h-3 w-3" />
                Terakhir dianalisis {laluSejak(terakhirAnalisis)}
              </p>
            )}
          </div>
        )}
      </FadeInUp>

      {/* Jalur LAMA (scraping n8n) — kini cadangan, hanya berguna untuk
          akun yang belum tertaut di Ayrshare. Disembunyikan bila semua
          akun wajib sudah tercakup, supaya tidak ada dua tombol yang
          membingungkan. */}
      {(cakupan?.terlewat.length ?? 0) > 0 && (
        <FadeInUp delay={0.11} className="mt-2">
          <button
            type="button"
            onClick={() => void mulaiAnalisis()}
            disabled={sedangAnalisis || sedangAyrshare}
            className="glass btn-tekan flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[13px] font-bold text-teks-utama disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4 text-pri" aria-hidden="true" />
            Analisis akun yang belum tertaut
          </button>
          <p className="mt-1.5 text-center text-[10.5px] leading-snug text-teks-sekunder">
            Untuk {cakupan?.terlewat.map((a) => `@${a.username}`).join(", ")} yang
            belum tertaut di Ayrshare — memakai pemindaian lama.
          </p>
        </FadeInUp>
      )}

      {/* Ringkasan kepatuhan (pindahan dari dashboard): KPI, tren,
          kepatuhan per akun wajib — kini tinggal di rumah datanya. */}
      <RingkasanQc muatUlang={terakhirAnalisis ?? 0} />

      {/* Kemajuan pemeriksaan — angkanya dari DATABASE, jadi tetap benar
          walau aplikasi ditutup lalu dibuka lagi. */}
      {antrian && antrian.total > 0 ? (
        <FadeInUp delay={0.12} className="mt-3">
          <GlassCard className="p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-heading text-sm font-bold text-teks-utama">
                Kemajuan Pemeriksaan
              </p>
              <span className="angka-tab text-xs font-semibold text-teks-sekunder">
                {antrian.selesai}/{antrian.total} postingan
              </span>
            </div>

            {/* Bar kemajuan */}
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.round((antrian.selesai / Math.max(antrian.total, 1)) * 100)}%`,
                  background: "linear-gradient(90deg, #DC2626, #F59E0B)",
                }}
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center">
                <span className="angka-tab font-heading text-base font-extrabold text-sukses">
                  {antrian.selesai}
                </span>
                <span className="text-[10px] text-teks-sekunder">Selesai</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="angka-tab font-heading text-base font-extrabold text-emas">
                  {antrian.menunggu}
                </span>
                <span className="text-[10px] text-teks-sekunder">Menunggu</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="angka-tab font-heading text-base font-extrabold text-gagal">
                  {antrian.gagal}
                </span>
                <span className="text-[10px] text-teks-sekunder">Gagal</span>
              </div>
            </div>

            {/* Cakupan komentar yang tidak lengkap WAJIB terlihat: angka
                kepatuhan yang terlihat rapi padahal datanya tidak lengkap
                adalah kesalahan paling berbahaya di sistem ini. */}
            {antrian.perlu_cek_manual > 0 && (
              <p className="mt-2.5 text-[11px] leading-snug text-teks-sekunder">
                <span className="font-semibold text-emas">
                  {antrian.perlu_cek_manual} postingan
                </span>{" "}
                perlu dicek manual — komentarnya tidak bisa diambil lengkap,
                jadi kader di postingan itu tidak divonis.
              </p>
            )}

            {antrian.menunggu > 0 && (
              <button
                type="button"
                onClick={() => void lanjutkanPemeriksaan()}
                disabled={sedangLanjut || sedangAnalisis}
                className="glass btn-tekan mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-teks-utama disabled:opacity-60"
              >
                {sedangLanjut ? (
                  <Loader2 className="h-4 w-4 animate-spin text-pri" />
                ) : (
                  <RefreshCw className="h-4 w-4 text-pri" />
                )}
                Lanjutkan Pemeriksaan ({antrian.menunggu} tersisa)
              </button>
            )}
          </GlassCard>
        </FadeInUp>
      ) : null}

      {/* Konten hasil */}
      {sudahAnalisis ? (
        <>
          {/* Ringkasan 3 kartu */}
          <FadeInUp delay={0.05} className="mt-5">
            <div className="grid grid-cols-3 gap-2.5">
              <GlassCard className="flex flex-col items-center p-3">
                <span className="angka-tab font-heading text-xl font-extrabold text-teks-utama">
                  {ringkasan?.totalPostingan ?? "–"}
                </span>
                <span className="mt-0.5 text-center text-[10px] leading-tight font-medium text-teks-sekunder">
                  Total Postingan
                </span>
              </GlassCard>
              <GlassCard className="flex flex-col items-center p-3">
                <span className="angka-tab font-heading text-xl font-extrabold text-sukses">
                  {ringkasan ? `${ringkasan.patuhPenuh}/${ringkasan.totalPasangan}` : "–"}
                </span>
                <span className="mt-0.5 text-center text-[10px] leading-tight font-medium text-teks-sekunder">
                  Kader Patuh Penuh
                </span>
              </GlassCard>
              <GlassCard className="flex flex-col items-center p-3">
                <span className="angka-tab font-heading text-xl font-extrabold text-gagal">
                  {ringkasan ? ringkasan.totalPasangan - ringkasan.patuhPenuh : "–"}
                </span>
                <span className="mt-0.5 text-center text-[10px] leading-tight font-medium text-teks-sekunder">
                  Perlu Ditindaklanjuti
                </span>
              </GlassCard>
            </div>
          </FadeInUp>

          {/* Filter chip platform */}
          <FadeInUp delay={0.1} className="mt-5">
            <SectionTitle judul="Daftar Akun Wajib" />
            <div className="tanpa-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {CHIP_PLATFORM.map((chip) => {
                const aktif = platform === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    disabled={!chip.tersedia}
                    onClick={() => setPlatform(chip.id)}
                    aria-pressed={aktif}
                    className={cn(
                      "btn-tekan relative flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
                      aktif
                        ? "border-transparent text-white"
                        : "glass text-teks-sekunder",
                      !chip.tersedia && "cursor-not-allowed opacity-45",
                    )}
                    style={
                      aktif
                        ? {
                            background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                            boxShadow: "0 6px 16px rgba(220, 38, 38, 0.3)",
                          }
                        : undefined
                    }
                  >
                    {chip.id !== "semua" && (
                      <PlatformIcon platform={chip.id} size={13} />
                    )}
                    {chip.label}
                    {!chip.tersedia && (
                      <span className="ml-0.5 rounded-full bg-emas/20 px-1.5 py-px text-[8px] font-bold text-emas">
                        Segera hadir
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </FadeInUp>

          {/* Daftar akun */}
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
            {akunList === null && !gagalMuat ? (
              [0, 1, 2].map((i) => (
                <GlassCard key={i} className="flex items-center gap-4 p-4">
                  <GlassSkeleton className="h-14 w-14 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <GlassSkeleton className="h-4 w-32" />
                    <GlassSkeleton className="h-3 w-44" />
                    <GlassSkeleton className="h-3 w-40" />
                  </div>
                  <GlassSkeleton className="h-[84px] w-[84px] rounded-full" />
                </GlassCard>
              ))
            ) : gagalMuat ? (
              <GlassCard className="md:col-span-2">
                <EmptyState
                  ikon={ScanSearch}
                  judul="Gagal Memuat Data"
                  keterangan="Terjadi kendala saat mengambil daftar akun wajib. Silakan coba lagi."
                  labelAksi="Coba Lagi"
                  onAksi={() => window.location.reload()}
                />
              </GlassCard>
            ) : akunTampil.length === 0 ? (
              <GlassCard className="md:col-span-2">
                <EmptyState
                  ikon={ScanSearch}
                  judul="Belum Ada Akun di Platform Ini"
                  keterangan="Akun wajib untuk platform ini akan segera ditambahkan."
                />
              </GlassCard>
            ) : (
              akunTampil.map((akun, i) => (
                <FadeInUp key={akun.id} delay={0.05 + i * 0.07}>
                  <GlassCard
                    onClick={() => onBukaAkun(akun.akun_wajib)}
                    ariaLabel={`Buka detail akun ${akun.akun_wajib}`}
                    className="p-4"
                  >
                    <div className="flex items-center gap-3.5">
                      {/* Avatar (foto profil hasil scraping) + badge platform */}
                      <div className="relative shrink-0">
                        <AvatarAkunWajib akun={akun} urut={i} />
                        <span className="absolute -right-1 -bottom-1">
                          <PlatformIcon platform={akun.platform} size={13} denganWadah />
                        </span>
                      </div>

                      {/* Info akun */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading text-[15px] font-bold text-teks-utama">
                          @{akun.akun_wajib}
                        </p>
                        <p className="truncate text-xs text-teks-sekunder">
                          {akun.nama_tampilan}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <StatusBadge
                            label={`${akun.total_postingan} postingan`}
                            warna="netral"
                          />
                        </div>
                      </div>

                      {/* Ring kepatuhan */}
                      <div className="flex shrink-0 flex-col items-center">
                        <ProgressRing value={akun.persen} size={84} strokeWidth={8}>
                          <span
                            className="angka-tab font-heading text-lg font-extrabold"
                            style={{
                              color:
                                akun.persen >= 80
                                  ? "#10B981"
                                  : akun.persen >= 50
                                    ? "#F59E0B"
                                    : "#EF4444",
                            }}
                          >
                            {akun.persen}%
                          </span>
                          <span className="text-[8px] font-medium text-teks-sekunder">
                            kepatuhan
                          </span>
                        </ProgressRing>
                      </div>
                    </div>

                    {/* Baris ringkas */}
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-3 dark:border-white/10">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-teks-sekunder">
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-sukses" />
                          {akun.sudah} komentar masuk
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-gagal" />
                          {akun.belum} kader belum lengkap
                        </span>
                      </p>
                      <ChevronRight className="h-4 w-4 shrink-0 text-teks-sekunder" />
                    </div>
                  </GlassCard>
                </FadeInUp>
              ))
            )}
          </div>
        </>
      ) : (
        !sedangAnalisis && (
          <FadeInUp delay={0.15} className="mt-5">
            <GlassCard>
              <EmptyState
                ikon={ScanSearch}
                judul="Belum Ada Analisis Hari Ini"
                keterangan="Tekan tombol Mulai Analisis untuk memeriksa kepatuhan kader."
                labelAksi="Mulai Analisis"
                onAksi={() => void mulaiAnalisis()}
              />
            </GlassCard>
          </FadeInUp>
        )
      )}
    </div>
  );
}

// ------------------------------------------------------------

/**
 * Foto profil akun wajib. Sumbernya kolom avatar_url yang diisi scraper
 * (dipungut dari data postingan, tanpa request tambahan). Bila belum ada
 * atau gagal dimuat — URL avatar CDN bisa kedaluwarsa — jatuh kembali ke
 * lingkaran inisial seperti desain lama, jadi tidak pernah ada kotak kosong.
 */
function AvatarAkunWajib({ akun, urut }: { akun: AkunWajibWithStats; urut: number }) {
  const [gagalGambar, setGagalGambar] = useState(false);

  if (akun.avatar_url && !gagalGambar) {
    return (
      <img
        src={akun.avatar_url}
        alt=""
        loading="lazy"
        onError={() => setGagalGambar(true)}
        className="h-14 w-14 rounded-full object-cover shadow-md"
      />
    );
  }

  return (
    <span
      className="flex h-14 w-14 items-center justify-center rounded-full font-heading text-base font-extrabold text-white shadow-md"
      style={{
        background: `linear-gradient(135deg, ${
          urut === 0 ? "#DC2626, #F59E0B" : urut === 1 ? "#DB2777, #F472B6" : "#B45309, #FBBF24"
        })`,
      }}
      aria-hidden="true"
    >
      {akun.nama_tampilan
        .split(" ")
        .slice(0, 2)
        .map((k) => k[0])
        .join("")}
    </span>
  );
}
