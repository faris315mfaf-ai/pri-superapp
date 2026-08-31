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
import { AnimatePresence, motion } from "framer-motion";
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
  getAntrianQc,
  getRingkasPlatformQc,
  setAmbangTindak,
  type AkunWajibWithStats,
  type AntrianQc,
  type KaderTindakLanjut,
  type RingkasPlatformQc,
} from "@/services";
import { periodeSaatIni, periodeUntukTanggalPilih } from "@/lib/periode-qc";
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
  // PERIODE TERPILIH — jantung fitur Riwayat: semua data layar mengikuti
  // label periode ini. Bawaan = jendela QC yang SEDANG berjalan
  // (17:00→16:59 WIB, lib/periode-qc). Diubah lewat pemilih tanggal ATAU
  // dengan mengeklik entri riwayat (memakai label PERSIS entri itu, jadi
  // data berlabel lama 00:00-23:59 pun tetap terbuka).
  const [periodePilih, setPeriodePilih] = useState<string>(() => periodeSaatIni());
  const tanggalPilih = periodePilih.slice(0, 10);
  const hariIni = periodePilih === periodeSaatIni();

  // Data akun wajib + statistik untuk periode terpilih
  const [akunList, setAkunList] = useState<AkunWajibWithStats[] | null>(null);
  const [gagalMuat, setGagalMuat] = useState(false);

  // Kemajuan pemeriksaan dari DATABASE (view v_app_qc_antrian) — sumber
  // kebenaran "ada data atau belum" untuk periode terpilih.
  const [antrian, setAntrian] = useState<AntrianQc | null>(null);

  // Modal riwayat seluruh analisis (tombol Riwayat di header)
  const [riwayatBuka, setRiwayatBuka] = useState(false);

  // Ringkasan PER PLATFORM + daftar tindak lanjut (< ambang) — rombakan
  // 31 Agu 2026 (pengganti 3 kartu lama yang menghitung 24 kader mati).
  const [ringkasPlat, setRingkasPlat] = useState<{
    ambang: number;
    per_platform: RingkasPlatformQc[];
    tindak_lanjut: KaderTindakLanjut[];
  } | null>(null);
  const [modalTindak, setModalTindak] = useState(false);
  const [ambangEdit, setAmbangEdit] = useState("");
  const [simpanAmbang, setSimpanAmbang] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const r = await getRingkasPlatformQc(periodePilih);
        if (hidup) {
          setRingkasPlat(r);
          setAmbangEdit(String(r.ambang));
        }
      } catch {
        if (hidup) setRingkasPlat({ ambang: 70, per_platform: [], tindak_lanjut: [] });
      }
    })();
    return () => {
      hidup = false;
    };
  }, [periodePilih]);

  // Filter platform
  const [platform, setPlatform] = useState("semua");

  /** Ganti tanggal terpilih + kosongkan data lama (skeleton muncul). */
  function gantiTanggal(t: string) {
    setAkunList(null);
    setGagalMuat(false);
    setRingkasPlat(null);
    const tanggal = t || hariIniWIB();
    // Hari ini = jendela berjalan (label bisa milik kemarin bila belum
    // 17:00); tanggal lain memakai label sesuai era aturannya.
    setPeriodePilih(
      tanggal === hariIniWIB() ? periodeSaatIni() : periodeUntukTanggalPilih(tanggal),
    );
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
    // FOKUS TV RAKYAT dulu (permintaan 31 Agu 2026): hanya akun resmi
    // TV Rakyat (semua platform yang tertaut, otomatis bertambah lewat
    // daftar-otomatis mesin analisis). dpp.pri & akun Ketum menyusul
    // begitu tersambung.
    const tvSaja = akunList.filter(
      (a) => (a.nama_tampilan ?? "").toLowerCase() === "tv rakyat",
    );
    const dasar = tvSaja.length > 0 ? tvSaja : akunList;
    if (platform === "semua") return dasar;
    return dasar.filter((a) => a.platform === platform);
  }, [akunList, platform]);

  /** Dipanggil saat entri riwayat diklik — pindah ke periode entri itu
   *  memakai LABEL PERSIS entri (data lama 00:00-23:59 tetap terbuka). */
  function pilihDariRiwayat(periode: string) {
    if (periode === periodePilih) return;
    setAkunList(null);
    setGagalMuat(false);
    setRingkasPlat(null);
    setPeriodePilih(periode);
    toast("info", "Riwayat dibuka", `Menampilkan data ${labelTanggal(periode.slice(0, 10))}.`);
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
            batas={5}
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
          {/* Ringkasan PER SOSIAL MEDIA (rombakan 31 Agu 2026): jumlah
              postingan dipisah per platform, dan "kader patuh penuh"
              dihitung per platform (100% di platform itu saja). */}
          <FadeInUp delay={0.05} className="mt-5">
            <GlassCard className="p-3.5">
              <p className="text-[12.5px] font-bold text-teks-utama">
                Ringkasan Per Sosial Media
              </p>
              {ringkasPlat === null ? (
                <GlassSkeleton className="mt-2 h-20 rounded-xl" />
              ) : ringkasPlat.per_platform.length === 0 ? (
                <p className="mt-2 text-[11.5px] text-teks-sekunder">
                  Belum ada postingan pada periode ini.
                </p>
              ) : (
                <div className="mt-2 flex flex-col gap-1.5">
                  {ringkasPlat.per_platform.map((p) => (
                    <div
                      key={p.platform}
                      className="glass-soft flex items-center gap-2.5 rounded-xl px-2.5 py-2"
                    >
                      <PlatformIcon platform={p.platform} size={15} denganWadah />
                      <span className="min-w-0 flex-1 text-[12px] font-bold text-teks-utama capitalize">
                        {p.platform === "twitter" ? "X" : p.platform}
                      </span>
                      <span className="angka-tab text-[11px] font-semibold text-teks-sekunder">
                        {p.postingan} postingan
                      </span>
                      <span
                        className={cn(
                          "angka-tab shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold",
                          p.patuh_penuh > 0
                            ? "bg-sukses/15 text-sukses"
                            : "bg-black/5 text-teks-sekunder dark:bg-white/10",
                        )}
                        title="Kader yang 100% patuh di platform ini"
                      >
                        {p.patuh_penuh}/{p.total_kader} patuh
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Perlu ditindaklanjuti — DIKLIK: daftar kader < ambang + WA */}
            <button
              type="button"
              onClick={() => setModalTindak(true)}
              className="btn-tekan mt-2.5 w-full"
              aria-label="Buka daftar kader yang perlu ditindaklanjuti"
            >
              <GlassCard className="flex items-center gap-3 p-3.5">
                <span className="angka-tab font-heading text-2xl font-extrabold text-gagal">
                  {ringkasPlat?.tindak_lanjut.length ?? "–"}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[12.5px] font-bold text-teks-utama">
                    Perlu Ditindaklanjuti
                  </span>
                  <span className="block text-[10.5px] text-teks-sekunder">
                    Kader di bawah {ringkasPlat?.ambang ?? 70}% — ketuk untuk daftar &
                    tombol WhatsApp
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-teks-sekunder" />
              </GlassCard>
            </button>
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

                      {/* Info akun. Ayrshare memberi NAMA TAMPILAN (bukan
                          @handle) untuk FB/Threads/YouTube — jangan
                          merender "@tv rakyat | medianya rakyat". */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading text-[15px] font-bold text-teks-utama">
                          {akun.akun_wajib.includes(" ")
                            ? akun.akun_wajib
                            : `@${akun.akun_wajib}`}
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
                        {/* Kejujuran kesegaran data (permintaan 31 Agu):
                            kapan postingan akun ini terakhir di-update. */}
                        <p className="mt-1 text-[10px] text-teks-sekunder">
                          {akun.update_terakhir
                            ? `Update terakhir ${new Date(akun.update_terakhir).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB`
                            : "Belum ada postingan pada jendela ini"}
                        </p>
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

      {/* MODAL Perlu Ditindaklanjuti (31 Agu 2026): kader < ambang +
          tombol WhatsApp langsung; ambangnya bisa disetel HR. */}
      <AnimatePresence>
        {modalTindak && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => setModalTindak(false)}
            />
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="glass relative max-h-[82dvh] w-full max-w-md overflow-y-auto rounded-t-3xl p-4 sm:rounded-3xl"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-teks-utama">Perlu Ditindaklanjuti</p>
                <button
                  type="button"
                  onClick={() => setModalTindak(false)}
                  aria-label="Tutup"
                  className="glass btn-tekan rounded-lg p-1.5 text-teks-utama"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Ambang bisa disetel HR (10-100%) */}
              <div className="glass-soft mt-2.5 flex items-center gap-2 rounded-xl p-2.5">
                <p className="min-w-0 flex-1 text-[11.5px] text-teks-sekunder">
                  Tampilkan kader di bawah
                </p>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={ambangEdit}
                  onChange={(e) => setAmbangEdit(e.target.value)}
                  aria-label="Ambang persen tindak lanjut"
                  className="glass-input h-9 w-16 shrink-0 rounded-lg text-center text-[13px] font-bold text-teks-utama"
                />
                <span className="text-[11px] text-teks-sekunder">%</span>
                <button
                  type="button"
                  disabled={simpanAmbang}
                  onClick={() => {
                    const n = Math.round(Number(ambangEdit));
                    if (!Number.isFinite(n) || n < 10 || n > 100) {
                      toast("peringatan", "Ambang harus 10-100%");
                      return;
                    }
                    setSimpanAmbang(true);
                    void setAmbangTindak(n)
                      .then(async () => {
                        toast("sukses", `Ambang jadi ${n}%`);
                        const r = await getRingkasPlatformQc(periodePilih);
                        setRingkasPlat(r);
                      })
                      .catch((e: unknown) =>
                        toast("error", "Gagal", e instanceof Error ? e.message : ""),
                      )
                      .finally(() => setSimpanAmbang(false));
                  }}
                  className="glass btn-tekan shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-teks-utama disabled:opacity-50"
                >
                  Simpan
                </button>
              </div>

              <div className="mt-2.5 flex flex-col gap-1.5">
                {(ringkasPlat?.tindak_lanjut ?? []).length === 0 ? (
                  <p className="py-6 text-center text-[12px] text-teks-sekunder">
                    Tidak ada — semua kader di atas ambang. 👏
                  </p>
                ) : (
                  (ringkasPlat?.tindak_lanjut ?? []).map((k) => (
                    <div
                      key={k.nama_kader}
                      className="glass-soft flex items-center gap-2.5 rounded-xl px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-teks-utama">
                          {k.nama_kader}
                        </p>
                        <p className="text-[10px] text-teks-sekunder">
                          {k.sudah}/{k.total} kewajiban
                        </p>
                      </div>
                      <span
                        className="angka-tab shrink-0 text-[11px] font-extrabold"
                        style={{
                          color: `hsl(${Math.round((k.persen / 100) * 120)} 75% 42%)`,
                        }}
                      >
                        {k.persen}%
                      </span>
                      {k.nomor_wa ? (
                        <a
                          href={`https://wa.me/${k.nomor_wa.replace(/\D/g, "")}?text=${encodeURIComponent(
                            `Halo ${k.nama_kader}, kepatuhan komentar Anda hari ini baru ${k.persen}% (${k.sudah}/${k.total}). Mohon segera lengkapi komentar di postingan TV Rakyat ya. Terima kasih 🙏`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-tekan shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white"
                          style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                        >
                          WA
                        </a>
                      ) : (
                        <span className="shrink-0 text-[10px] text-teks-sekunder">
                          tanpa nomor
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

  // Prioritas: thumbnail POSTINGAN TERBARU periode ini (data Ayrshare,
  // permintaan 31 Agu 2026) → avatar profil → inisial.
  const gambar = akun.thumbnail_terbaru || akun.avatar_url;
  if (gambar && !gagalGambar) {
    return (
      <img
        src={gambar}
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
