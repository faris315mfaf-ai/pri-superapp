"use client";

// ============================================================
// QcScreen — halaman utama Modul QC Konten Sosmed (HR Center).
//
// ROMBAKAN 31 Agu 2026 (permintaan user):
// - Deteksi komentar kini SEPENUHNYA OTOMATIS (sinkron Ayrshare tiap
//   ±30 menit — lihat lib/sinkron-konten-tv). Seluruh mesin analisis
//   n8n DILEPAS dari layar ini: tombol Mulai Analisis, panel tahap,
//   analisis akun belum tertaut, dan antrian n8n tidak ditampilkan lagi.
// - "Periode Berjalan" (yang dulu hanya label tanpa efek) DIGANTI
//   fitur RIWAYAT: pilih tanggal, atau klik salah satu entri riwayat
//   pembaruan — SELURUH data layar berpindah ke periode itu.
// - Seksi Tingkat/Tren/Per-Akun-Wajib disembunyikan (tetap ada di
//   komponen RingkasanQc bila kelak dibutuhkan lagi).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronRight,
  History,
  ScanSearch,
  UsersRound,
  TrendingUp,
  UserCog,
  Megaphone,
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
  getAntrianQc,
  type AkunWajibWithStats,
  type AntrianQc,
} from "@/services";
import { toast } from "@/hooks/use-app-store";
import { RiwayatAnalisisModal } from "./riwayat-analisis-modal";
import { KepatuhanKaderPanel } from "./kepatuhan-kader-panel";
import { RiwayatUpdateKomentar } from "./riwayat-update-komentar";
import { TataLetakModul, type SeksiModul } from "@/components/tata-letak-modul";
import { SeksiLipat } from "@/components/seksi-lipat";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Konstanta & helper
// ------------------------------------------------------------

const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "2026-08-31" → "31 Agustus 2026" */
function labelTanggal(tanggal: string): string {
  const [y, m, d] = tanggal.split("-");
  const namaBulan = BULAN_ID[parseInt(m ?? "1", 10) - 1] ?? "";
  return `${parseInt(d ?? "0", 10)} ${namaBulan} ${y}`;
}

/** Hari ini menurut kalender WIB (bukan kalender server/peramban) */
function hariIniWIB(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// QC multi-platform (fitur 1.22.x/2): X, Threads, YouTube kini aktif.
// Facebook tetap nonaktif — pengomentar Facebook hanya punya nama
// tampilan, bukan @username yang bisa dicocokkan ke kader.
const CHIP_PLATFORM = [
  { id: "semua", label: "Semua", tersedia: true },
  { id: "instagram", label: "Instagram", tersedia: true },
  { id: "tiktok", label: "TikTok", tersedia: true },
  { id: "twitter", label: "X", tersedia: true },
  { id: "threads", label: "Threads", tersedia: true },
  { id: "youtube", label: "YouTube", tersedia: true },
  { id: "facebook", label: "Facebook", tersedia: false },
];

// ------------------------------------------------------------
// Komponen utama
// ------------------------------------------------------------

export function QcScreen({
  onBukaAkun,
  onBukaNotifikasi,
  onBukaHalaman,
  bolehHR = false,
}: {
  onBukaAkun: (akunWajib: string) => void;
  onBukaNotifikasi?: () => void;
  /** Buka halaman HR Center (tabel-anggota / absensi-hari-ini / setel-kpi
   *  serta kelola-pengguna / pengumuman untuk orang HR) */
  onBukaHalaman?: (nama: string) => void;
  /** Orang HR (peran admin_hr / Divisi HR) — memunculkan menu Kelola
   *  Pengguna & Kirim Pengumuman (fitur 1.22.x/1). */
  bolehHR?: boolean;
}) {
  // TANGGAL TERPILIH — jantung fitur Riwayat: semua data layar mengikuti
  // tanggal ini. Bawaan hari ini (WIB). Diubah lewat pemilih tanggal
  // ATAU dengan mengeklik entri riwayat pembaruan.
  const [tanggalPilih, setTanggalPilih] = useState<string>(() => hariIniWIB());
  const periodePilih = `${tanggalPilih} 00:00-23:59`;
  const hariIni = tanggalPilih === hariIniWIB();

  // Data akun wajib + statistik untuk periode terpilih
  const [akunList, setAkunList] = useState<AkunWajibWithStats[] | null>(null);
  const [gagalMuat, setGagalMuat] = useState(false);

  // Kemajuan pemeriksaan dari DATABASE (view v_app_qc_antrian) — sumber
  // kebenaran "ada data atau belum" untuk periode terpilih.
  const [antrian, setAntrian] = useState<AntrianQc | null>(null);

  // Modal riwayat seluruh analisis (tombol Riwayat di header)
  const [riwayatBuka, setRiwayatBuka] = useState(false);

  // Filter platform
  const [platform, setPlatform] = useState("semua");

  /** Ganti tanggal terpilih + kosongkan data lama (skeleton muncul). */
  function gantiTanggal(t: string) {
    setAkunList(null);
    setGagalMuat(false);
    setTanggalPilih(t || hariIniWIB());
  }

  // Muat data akun tiap tanggal berganti.
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const list = await getAkunWajib(periodePilih);
        if (hidup) setAkunList(list);
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
  }, [periodePilih]);

  // Baca kemajuan dari database; untuk HARI INI diulang tiap 30 detik —
  // deteksi otomatis berjalan di latar (sinkron Ayrshare), jadi angka di
  // layar ikut bergerak sendiri tanpa tombol apa pun.
  useEffect(() => {
    let hidup = true;

    async function baca() {
      const hasil = await getAntrianQc(periodePilih);
      if (hidup) setAntrian(hasil);
    }
    void baca();

    if (!hariIni) return () => { hidup = false; };
    const detak = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void baca();
    }, 30_000);
    return () => {
      hidup = false;
      clearInterval(detak);
    };
  }, [periodePilih, hariIni]);

  const adaData = Boolean(antrian && antrian.total > 0);

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

  /** Dipanggil saat entri riwayat diklik — pindah ke periode entri itu. */
  function pilihDariRiwayat(periode: string) {
    const tanggal = periode.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return;
    if (tanggal !== tanggalPilih) {
      gantiTanggal(tanggal);
      toast("info", "Riwayat dibuka", `Menampilkan data ${labelTanggal(tanggal)}.`);
    }
  }

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      {/* Header modul */}
      <header className="flex items-start justify-between gap-3 pt-5">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
            HR Center
          </h1>
          <p className="mt-0.5 text-xs text-teks-sekunder">
            Kepatuhan komentar kader — deteksi berjalan otomatis
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

      {/* Menu halaman HR Center (spek 1.18: 2.2 / 2.4 / 2.5) + Kelola
          Pengguna & Kirim Pengumuman untuk orang HR (fitur 1.22.x/1). */}
      {onBukaHalaman && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(
            [
              ["tabel-anggota", "Database Anggota", UsersRound, true],
              ["absensi-hari-ini", "Absensi Hari Ini", CalendarDays, true],
              ["setel-kpi", "Setel KPI", TrendingUp, true],
              ["kelola-pengguna", "Kelola Pengguna", UserCog, bolehHR],
              ["pengumuman", "Kirim Pengumuman", Megaphone, bolehHR],
            ] as const
          )
            .filter(([, , , tampil]) => tampil)
            .map(([id, label, Ikon]) => (
              <button
                key={id}
                type="button"
                onClick={() => onBukaHalaman(id)}
                className="glass btn-tekan flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3"
              >
                <Ikon className="h-5 w-5 text-pri" aria-hidden="true" />
                <span className="text-center text-[10.5px] leading-tight font-bold text-teks-utama">
                  {label}
                </span>
              </button>
            ))}
        </div>
      )}

      {/* Atur Tata Letak (fitur 1.22.x): seret/sembunyikan/lipat tiap seksi.
          Seksi Mulai Analisis / Akun Belum Tertaut / Tingkat / Tren /
          Per-Akun-Wajib DISEMBUNYIKAN (rombakan 31 Agu 2026). */}
      <div className="mt-4">
      <TataLetakModul
        modul="qc"
        bungkusSeksi={false}
        seksi={[
        { id: "riwayat", judul: "1 · Riwayat", ikon: History, render: () => (
      <SeksiLipat
        id="hr-riwayat"
        judul="1 · Riwayat"
        ikon={History}
        keterangan="Pilih tanggal / klik pembaruan untuk melihat data lampau"
        bawaanTerbuka
      >
      <FadeInUp delay={0.05}>
        {/* Pemilih tanggal — mengganti "Periode Berjalan" lama yang cuma
            label. Memilih tanggal mengganti SELURUH data layar. */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pri/10">
              <CalendarDays className="h-4.5 w-4.5 text-pri" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-teks-sekunder">
                Menampilkan data tanggal
              </p>
              <input
                type="date"
                value={tanggalPilih}
                max={hariIniWIB()}
                onChange={(e) => gantiTanggal(e.target.value)}
                className="angka-tab mt-0.5 w-full bg-transparent font-heading text-sm font-bold text-teks-utama outline-none"
                aria-label="Pilih tanggal riwayat"
              />
            </div>
            {hariIni ? (
              <StatusBadge label="Hari ini" warna="hijau" />
            ) : (
              <button
                type="button"
                onClick={() => gantiTanggal(hariIniWIB())}
                className="glass btn-tekan shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-teks-sekunder"
              >
                Kembali ke hari ini
              </button>
            )}
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] leading-snug text-teks-sekunder">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sukses opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sukses" />
            </span>
            Deteksi komentar berjalan otomatis ±30 menit sekali — tanpa tombol,
            tanpa n8n. Klik entri di bawah untuk membuka data pembaruan itu.
          </p>
        </GlassCard>

        {/* Riwayat pembaruan — DIKLIK = layar pindah ke periode itu. */}
        <div className="mt-3">
          <RiwayatUpdateKomentar
            onPilih={pilihDariRiwayat}
            periodeAktif={periodePilih}
          />
        </div>
      </FadeInUp>
      </SeksiLipat>
        ) },
        { id: "siapa", judul: "2 · Siapa Sudah & Belum Komen", ikon: Check, render: () => (
      <SeksiLipat
        id="hr-siapa"
        judul="2 · Siapa Sudah & Belum Komen"
        ikon={Check}
        keterangan="Filter sudah/belum, platform, & cari nama"
      >
        <KepatuhanKaderPanel periode={periodePilih} />
      </SeksiLipat>
        ) },
        { id: "hasil", judul: "3 · Riwayat Analisis Lengkap", ikon: ScanSearch, render: () => (
      <SeksiLipat id="hr-hasil" judul="3 · Riwayat Analisis Lengkap" ikon={ScanSearch}>
        <p className="text-[12px] leading-relaxed text-teks-sekunder">
          Catatan seluruh analisis yang pernah berjalan (termasuk pembaruan
          otomatis) tersedia di riwayat lengkap.
        </p>
        <button
          type="button"
          onClick={() => setRiwayatBuka(true)}
          className="btn-tekan mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Buka Riwayat Analisis
        </button>
      </SeksiLipat>
        ) },
        ] as SeksiModul[]}
      />
      </div>

      {/* Kemajuan pemeriksaan periode terpilih — angkanya dari DATABASE.
          Tombol "Lanjutkan" (n8n) DIHAPUS: deteksi jalan sendiri. */}
      {antrian && antrian.total > 0 ? (
        <FadeInUp delay={0.12} className="mt-3">
          <GlassCard className="p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-heading text-sm font-bold text-teks-utama">
                Kemajuan Pemeriksaan {hariIni ? "" : `· ${labelTanggal(tanggalPilih)}`}
              </p>
              <span className="angka-tab text-xs font-semibold text-teks-sekunder">
                {antrian.selesai}/{antrian.total} postingan
              </span>
            </div>

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
            {hariIni && antrian.menunggu > 0 && (
              <p className="mt-2 text-[10.5px] text-teks-sekunder">
                Sisa antrian diperiksa otomatis pada pembaruan berikutnya
                (±30 menit) — tidak perlu menekan apa pun.
              </p>
            )}
          </GlassCard>
        </FadeInUp>
      ) : null}

      {/* Konten hasil */}
      {adaData || (akunList !== null && (ringkasan?.totalPostingan ?? 0) > 0) ? (
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
        akunList !== null && (
          <FadeInUp delay={0.15} className="mt-5">
            <GlassCard>
              <EmptyState
                ikon={ScanSearch}
                judul={
                  hariIni
                    ? "Belum Ada Data Hari Ini"
                    : `Tidak Ada Data ${labelTanggal(tanggalPilih)}`
                }
                keterangan={
                  hariIni
                    ? "Deteksi komentar berjalan otomatis ±30 menit sekali — data muncul sendiri begitu ada postingan baru. Tidak ada tombol yang perlu ditekan."
                    : "Tidak ada rekap tersimpan untuk tanggal ini. Pilih tanggal lain di seksi Riwayat."
                }
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
