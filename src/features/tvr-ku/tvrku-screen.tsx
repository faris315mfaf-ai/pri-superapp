"use client";

// ============================================================
// TvrKuScreen — halaman TV Rakyat MILIK ANGGOTA.
//
// Terpisah dari modul TV Rakyat official yang dikelola tim mandiri.
// Di sini tiap anggota:
// 1. Mendaftarkan akun TV Rakyat pribadinya di 6 platform
//    (IG, TikTok, YouTube Short, Facebook, Threads, X).
// 2. Melaporkan link video yang sudah ia unggah — KPI minimal 5
//    video per hari (dibebaskan bila izin/sakit disetujui).
// 3. Melihat perkembangan: KPI hari ini, rencana kerja hari ini,
//    dan grafik laporan 7 hari terakhir.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clapperboard,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Video,
  Globe,
  X,
  RefreshCw,
  BarChart3,
  Ban,
  Hourglass,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, FadeInUp, GlassSkeleton, SectionTitle, StatusBadge, ThemeToggle } from "@/components/pri-ui";
import { ProgressRing } from "@/components/progress-ring";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { SeksiLipat } from "@/components/seksi-lipat";
import { PermohonanBlokir } from "./permohonan-blokir";
import { TataLetakModul, type SeksiModul } from "@/components/tata-letak-modul";
import { toast } from "@/hooks/use-app-store";
import {
  getAkunTvr,
  getLaporanKerja,
  getLaporanVideo,
  getRiwayatVideo7Hari,
  hapusAkunTvr,
  hapusLaporanVideo,
  tambahAkunTvr,
  tambahLaporanVideo,
  ubahAkunTvr,
  ubahLaporanVideo,
  type AkunTvr,
  type KerjaKpi,
  type LaporanVideo,
  type LaporanPending,
  kirimLaporanBatch,
  getKeywordWajib,
  hubungkanSosmedTvr,
  sinkronSosmedTvr,
} from "@/services";
import { jamWIB, urlProfilSosmed } from "@/lib/format";
import type { KomponenIkon, User } from "@/types";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { PanelTugasSaya } from "./tugas-saya";
import { KirimVideoManual } from "./kirim-video-manual";
import { UnggahSosmedSaya } from "./unggah-sosmed-saya";
import { InsightSayaPanel } from "./insight-saya-panel";
import { cn } from "@/lib/utils";

const PLATFORM_TVR = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YT Short" },
  { id: "facebook", label: "Facebook" },
  { id: "threads", label: "Threads" },
  { id: "twitter", label: "X" },
] as const;

const NAMA_HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// ------------------------------------------------------------
// Modal tambah (akun / laporan) — satu kerangka dipakai dua-duanya
// ------------------------------------------------------------

function ModalTambah({
  judul,
  placeholder,
  ikonKirim: IkonKirim,
  awalPlatform,
  awalNilai,
  onTutup,
  onKirim,
}: {
  judul: string;
  placeholder: string;
  ikonKirim: KomponenIkon;
  /** Terisi = mode edit: kolom dibuka dengan nilai lamanya */
  awalPlatform?: string;
  awalNilai?: string;
  onTutup: () => void;
  onKirim: (platform: string, nilai: string) => Promise<void>;
}) {
  const [platform, setPlatform] = useState<string>(awalPlatform ?? "instagram");
  const [nilai, setNilai] = useState(awalNilai ?? "");
  const [sedangKirim, setSedangKirim] = useState(false);

  async function kirim() {
    if (nilai.trim().length < 2 || sedangKirim) return;
    setSedangKirim(true);
    try {
      await onKirim(platform, nilai.trim());
    } finally {
      setSedangKirim(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onTutup}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
        initial={{ scale: 0.92, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-bold text-teks-utama">{judul}</h3>

        {/* Pemilih platform — 6 pilihan */}
        <div className="mt-3.5 grid grid-cols-3 gap-2">
          {PLATFORM_TVR.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              className={cn(
                "btn-tekan flex flex-col items-center gap-1 rounded-xl border py-2",
                platform === p.id
                  ? "border-pri/50 bg-pri/10"
                  : "glass-soft border-transparent",
              )}
              aria-pressed={platform === p.id}
            >
              <PlatformIcon platform={p.id} size={16} />
              <span className="text-[10px] font-semibold text-teks-utama">{p.label}</span>
            </button>
          ))}
        </div>

        <input
          value={nilai}
          onChange={(e) => setNilai(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void kirim();
          }}
          placeholder={placeholder}
          className="glass mt-3.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onTutup}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void kirim()}
            disabled={nilai.trim().length < 2 || sedangKirim}
            className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
            }}
          >
            {sedangKirim ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <IkonKirim className="h-4 w-4" aria-hidden="true" />
            )}
            Simpan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// ModalWebsite — form KECIL khusus domain situs (spek 3.2).
// Terpisah dari form akun sosmed: hanya satu kolom esensial.
// ------------------------------------------------------------

function ModalWebsite({
  onTutup,
  onKirim,
}: {
  onTutup: () => void;
  onKirim: (domain: string) => Promise<void>;
}) {
  const [nilai, setNilai] = useState("");
  const [sedangKirim, setSedangKirim] = useState(false);

  async function kirim() {
    if (nilai.trim().length < 4 || sedangKirim) return;
    setSedangKirim(true);
    try {
      await onKirim(nilai.trim());
    } finally {
      setSedangKirim(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onTutup}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Daftarkan Website TV Rakyat"
        className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
        initial={{ scale: 0.92, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-bold text-teks-utama">
          Daftarkan Website TV Rakyat
        </h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-teks-sekunder">
          Cukup nama domainnya saja — boleh juga menempel alamat lengkap.
        </p>
        <input
          value={nilai}
          onChange={(e) => setNilai(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void kirim();
          }}
          placeholder="mis. tvrakyat.id"
          className="glass mt-3.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onTutup}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void kirim()}
            disabled={nilai.trim().length < 4 || sedangKirim}
            className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
            }}
          >
            {sedangKirim ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Globe className="h-4 w-4" aria-hidden="true" />
            )}
            Simpan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// ModalLaporanBatch — laporkan video: satu link ATAU banyak sekaligus
// (spek 3.3). "Add" menumpuk link ke daftar; "Simpan" mengirim semua.
// Platform tiap link ditebak server dari alamatnya.
// ------------------------------------------------------------

function ModalLaporanBatch({
  onTutup,
  onSelesai,
}: {
  onTutup: () => void;
  /** Dipanggil setelah tersimpan (jumlah sukses, daftar gagal) */
  onSelesai: (tersimpan: number, gagal: { url: string; alasan: string }[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [link, setLink] = useState("");
  const [antrean, setAntrean] = useState<{ keyword: string; url: string }[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [sedangKirim, setSedangKirim] = useState(false);

  // Keyword wajib yang ditetapkan Pimred (fitur 1.22.x/keyword) — jadi
  // saran & acuan saat anggota melaporkan videonya.
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getKeywordWajib();
        if (hidup) setKeywords(d.data.filter((k) => k.aktif).map((k) => k.keyword));
      } catch {
        // keyword opsional; kegagalan memuat tak menghalangi laporan.
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  function tambahKeDaftar() {
    const url = link.trim();
    if (url.length < 8) {
      toast("peringatan", "Isi link video dulu");
      return;
    }
    if (antrean.some((a) => a.url === url)) {
      toast("info", "Link ini sudah ada di daftar");
      return;
    }
    setAntrean((a) => [...a, { keyword: keyword.trim(), url }]);
    setKeyword("");
    setLink("");
  }

  async function simpan() {
    // Baris yang masih di kolom ketik ikut terhitung — pengguna tidak
    // wajib menekan + dulu untuk satu laporan.
    const semua = [...antrean];
    const sisaUrl = link.trim();
    if (sisaUrl.length >= 8 && !semua.some((a) => a.url === sisaUrl)) {
      semua.push({ keyword: keyword.trim(), url: sisaUrl });
    }
    if (semua.length === 0 || sedangKirim) return;
    setSedangKirim(true);
    try {
      const hasil = await kirimLaporanBatch(semua);
      onSelesai(hasil.tersimpan, hasil.gagal);
    } catch (e) {
      toast("error", "Gagal menyimpan laporan", e instanceof Error ? e.message : "");
    } finally {
      setSedangKirim(false);
    }
  }

  const totalSiap = antrean.length + (link.trim().length >= 8 ? 1 : 0);

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onTutup}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Laporkan Video"
        className="glass-strong w-full max-w-[360px] rounded-2xl p-5"
        initial={{ scale: 0.92, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-bold text-teks-utama">Laporkan Video</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-teks-sekunder">
          Isi <b>keyword</b> (tema yang ditentukan Pimred) di kiri dan{" "}
          <b>link video</b> di kanan, lalu tekan + untuk menumpuk beberapa.
        </p>
        {keywords.length > 0 && (
          <p className="mt-1 text-[10.5px] leading-snug text-teks-sekunder">
            Keyword wajib: <b className="text-teks-utama/80">{keywords.join(", ")}</b>
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <input
            list="daftar-keyword-laporan"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Keyword"
            aria-label="Keyword"
            className="glass w-[38%] min-w-0 rounded-xl px-3 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
          />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                tambahKeDaftar();
              }
            }}
            placeholder="Link video…"
            aria-label="Link video"
            className="glass min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={tambahKeDaftar}
            disabled={link.trim().length < 8}
            aria-label="Tambahkan keyword & link ke daftar"
            className="glass btn-tekan flex items-center justify-center rounded-xl px-3 text-teks-utama disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <datalist id="daftar-keyword-laporan">
          {keywords.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>

        {antrean.length > 0 && (
          <div className="scrollbar-tipis mt-2.5 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
            {antrean.map((item) => (
              <div key={item.url} className="glass-soft flex items-center gap-2 rounded-lg px-2.5 py-1.5">
                {item.keyword ? (
                  <span className="shrink-0 rounded-md bg-pri/12 px-1.5 py-0.5 text-[10px] font-bold text-pri">
                    {item.keyword}
                  </span>
                ) : (
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-teks-sekunder" aria-hidden="true" />
                )}
                <p className="min-w-0 flex-1 truncate text-[11.5px] text-teks-utama">{item.url}</p>
                <button
                  type="button"
                  onClick={() => setAntrean((a) => a.filter((x) => x.url !== item.url))}
                  aria-label="Buang baris ini"
                  className="btn-tekan p-1 text-teks-sekunder"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onTutup}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void simpan()}
            disabled={totalSiap === 0 || sedangKirim}
            className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #10B981, #059669)",
              boxShadow: "0 8px 20px rgba(16, 185, 129, 0.35)",
            }}
          >
            {sedangKirim ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="h-4 w-4" aria-hidden="true" />
            )}
            Simpan{totalSiap > 1 ? ` (${totalSiap})` : ""}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// TvrKuScreen
// ------------------------------------------------------------

export function TvrKuScreen({
  user: _user,
  onBukaNotifikasi,
}: {
  user: User;
  onBukaNotifikasi?: () => void;
}) {
  const [akun, setAkun] = useState<AkunTvr[] | null>(null);
  const [laporan, setLaporan] = useState<LaporanVideo[]>([]);
  const [menunggu, setMenunggu] = useState<LaporanPending[]>([]);
  const [kpiTarget, setKpiTarget] = useState(5);
  const [dibebaskan, setDibebaskan] = useState<string | null>(null);
  const [kpiRencana, setKpiRencana] = useState<KerjaKpi | null>(null);
  const [riwayat7, setRiwayat7] = useState<{ tanggal: string; jumlah: number }[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [muatUlang, setMuatUlang] = useState(0);
  const [modalWebsite, setModalWebsite] = useState(false);
  const [modalLaporan, setModalLaporan] = useState(false);
  const [editAkun, setEditAkun] = useState<AkunTvr | null>(null);
  const [editLaporan, setEditLaporan] = useState<LaporanVideo | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        // Empat sumber tidak saling bergantung — dimuat bersamaan.
        const [a, l, k, r] = await Promise.all([
          getAkunTvr(),
          getLaporanVideo(),
          getLaporanKerja().catch(() => null),
          getRiwayatVideo7Hari().catch(() => null),
        ]);
        if (!hidup) return;
        setAkun(a);
        setLaporan(l.data);
        setMenunggu(l.menunggu ?? []);
        setKpiTarget(l.kpi_target);
        setDibebaskan(l.dibebaskan);
        if (k) setKpiRencana(k.kpi);
        if (r) setRiwayat7(r.data);
      } catch (e) {
        if (hidup) {
          setAkun([]);
          toast("error", "Gagal memuat data", e instanceof Error ? e.message : "");
        }
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  const jumlahHariIni = laporan.length;
  const persenKpi = Math.min(100, Math.round((100 * jumlahHariIni) / kpiTarget));
  const maksGrafik = Math.max(kpiTarget, ...riwayat7.map((r) => r.jumlah), 1);

  // Fungsi tambahAkun manual DIHAPUS (31 Agu 2026) — akun sosmed hanya
  // masuk lewat login upload-post. Penambahan "website" tetap ada
  // (bukan sosmed, tidak lewat penyedia).

  // Penautan sosmed sungguhan (spek 1.17): 1 pengguna = 1 profil penyedia.
  const [sedangHubung, setSedangHubung] = useState(false);
  async function hubungkanSosmed() {
    if (sedangHubung) return;
    setSedangHubung(true);
    try {
      const url = await hubungkanSosmedTvr();
      window.open(url, "_blank", "noopener,noreferrer");
      toast(
        "info",
        "Halaman login sosmed dibuka",
        "Tautkan akunmu di tab baru, lalu kembali & tekan Segarkan.",
      );
    } catch (e) {
      toast("error", "Gagal membuka penautan", e instanceof Error ? e.message : "");
    } finally {
      setSedangHubung(false);
    }
  }

  async function segarkanTautan() {
    if (sedangHubung) return;
    setSedangHubung(true);
    try {
      const hasil = await sinkronSosmedTvr();
      if (hasil.terhubung.length === 0) {
        toast("info", "Belum ada akun tertaut", "Tekan Hubungkan lalu login sosmedmu dulu.");
      } else {
        toast(
          "sukses",
          `${hasil.terhubung.length} akun terhubung`,
          `${hasil.tersinkron} baru ditambahkan ke daftarmu.` +
            (hasil.konflik.length > 0 ? ` Konflik: ${hasil.konflik.join("; ")}` : ""),
        );
      }
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menyegarkan", e instanceof Error ? e.message : "");
    } finally {
      setSedangHubung(false);
    }
  }

  async function tambahWebsite(domain: string) {
    try {
      await tambahAkunTvr("website", domain);
      toast("sukses", "Website terdaftar", domain);
      setModalWebsite(false);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal mendaftarkan website", e instanceof Error ? e.message : "");
    }
  }

  function selesaiBatch(tersimpan: number, gagal: { url: string; alasan: string }[]) {
    if (tersimpan > 0) {
      toast(
        "sukses",
        tersimpan === 1 ? "Laporan dikirim ke HR" : `${tersimpan} laporan dikirim ke HR`,
        gagal.length > 0
          ? `Dihitung KPI setelah ACC HR. ${gagal.length} link gagal — lihat rinciannya.`
          : "Dihitung KPI setelah disetujui Divisi HR.",
      );
    }
    for (const gl of gagal.slice(0, 3)) {
      toast("error", "Link gagal", `${gl.url.slice(0, 40)}… — ${gl.alasan}`);
    }
    if (tersimpan > 0 || gagal.length === 0) setModalLaporan(false);
    setMuatUlang((n) => n + 1);
  }

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 10px 24px rgba(220, 38, 38, 0.35)",
            }}
            aria-hidden="true"
          >
            <Clapperboard className="h-5.5 w-5.5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
              TV Rakyat Saya
            </h1>
            <p className="text-xs text-teks-sekunder">Akun, laporan video, dan KPI Anda</p>
          </div>
        </div>
        <TombolLonceng onBuka={onBukaNotifikasi} />
        <ThemeToggle />
      </header>

      {/* Atur Tata Letak (fitur 1.22.x): semua seksi bisa diseret/
          disembunyikan/dilipat — satu kolom. */}
      <TataLetakModul
        modul="tvrku"
        bungkusSeksi={false}
        seksi={[
        { id: "kpi", judul: "KPI Video Hari Ini", ikon: Video, render: () => (
      <FadeInUp>
        <GlassCard className="flex items-center gap-4 p-4">
          <ProgressRing value={dibebaskan ? 100 : persenKpi} size={72}>
            <span className="font-heading text-base font-extrabold text-teks-utama">
              {dibebaskan ? "✓" : `${jumlahHariIni}/${kpiTarget}`}
            </span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm font-bold text-teks-utama">KPI Video Hari Ini</p>
            <p className="mt-1 text-xs leading-relaxed text-teks-sekunder">
              {dibebaskan
                ? `Kewajiban dibebaskan — status ${dibebaskan} Anda hari ini disetujui.`
                : jumlahHariIni >= kpiTarget
                  ? `Target ${kpiTarget} video tercapai. Kerja bagus!`
                  : `Laporkan ${kpiTarget - jumlahHariIni} video lagi untuk mencapai target harian.`}
            </p>
            {kpiRencana && kpiRencana.rencana_total > 0 && (
              <p className="mt-1.5 text-[11px] text-teks-sekunder">
                Rencana kerja hari ini: {kpiRencana.rencana_selesai}/{kpiRencana.rencana_total}{" "}
                selesai ({kpiRencana.kpi_persen ?? 0}%)
              </p>
            )}
          </div>
        </GlassCard>
      </FadeInUp>
        ) },
        { id: "tugas", judul: "Tugas & Unggah Video", ikon: Clapperboard, render: () => (
      <>
      {/* Tugas link dari Pimred + unggah video tugas (tampil hanya
          bila memang ada tugas — anggota lain tidak terganggu) */}
      <PanelTugasSaya />
      <KirimVideoManual hanyaBilaAdaTugas />
      </>
        ) },
        { id: "grafik", judul: "Laporan 7 Hari Terakhir", ikon: Video, render: () => (
      <FadeInUp delay={0.06}>
        <div className="mt-4">
        <SeksiLipat id="tvrku-grafik" judul="Laporan 7 Hari Terakhir" ikon={Video} bawaanTerbuka>
          <div className="flex h-24 items-end justify-between gap-1.5">
            {riwayat7.map((r) => {
              const capai = r.jumlah >= kpiTarget;
              return (
                <div key={r.tanggal} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="angka-tab text-[10px] font-bold text-teks-utama">
                    {r.jumlah}
                  </span>
                  <div
                    className={cn("w-full max-w-[26px] rounded-t-md", capai ? "bg-sukses" : "bg-pri/60")}
                    style={{ height: `${Math.max(6, (r.jumlah / maksGrafik) * 64)}px` }}
                    aria-hidden="true"
                  />
                  <span className="text-[9px] text-teks-sekunder">
                    {NAMA_HARI_PENDEK[new Date(`${r.tanggal}T00:00:00+07:00`).getDay()]}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[10px] text-teks-sekunder/80">
            Hijau = target {kpiTarget} video tercapai
          </p>
        </SeksiLipat>
        </div>
      </FadeInUp>
        ) },
        { id: "akun", judul: "Akun TV Rakyat Saya", ikon: Link2, render: () => (
      <FadeInUp delay={0.1}>
        {/* Tombol "+ Tambah" DIHAPUS (31 Agu 2026): akun tidak lagi
            diketik manual — semuanya datang otomatis dari akun yang
            Anda LOGIN lewat upload-post. */}
        <div className="mt-5">
          <SectionTitle judul="Akun TV Rakyat Saya" className="!mt-0" />
        </div>

        {/* Penautan sosmed sungguhan (spek 1.17): login akunmu lewat
            halaman penyedia — 1 pengguna = 1 profil. */}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={sedangHubung}
            onClick={() => void hubungkanSosmed()}
            className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
          >
            {sedangHubung ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Hubungkan Sosmed (Login)
          </button>
          <button
            type="button"
            disabled={sedangHubung}
            onClick={() => void segarkanTautan()}
            aria-label="Segarkan akun terhubung"
            className="glass btn-tekan flex items-center justify-center rounded-xl px-3.5 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4 text-teks-utama" aria-hidden="true" />
          </button>
        </div>
        {memuat ? (
          <GlassSkeleton className="mt-2 h-16 rounded-2xl" />
        ) : (akun ?? []).length === 0 ? (
          <GlassCard className="mt-2 p-1">
            <EmptyState
              ikon={Video}
              judul="Belum Ada Akun"
              keterangan="Tekan Hubungkan Sosmed (Login) di atas, lalu login akun TV Rakyat Anda di 6 platform: Instagram, TikTok, YT Short, Facebook, Threads, dan X. Akunnya masuk ke sini otomatis."
              labelAksi="Hubungkan Sosmed (Login)"
              onAksi={() => void hubungkanSosmed()}
              className="py-5"
            />
          </GlassCard>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {(akun ?? []).filter((a) => a.platform !== "website").map((a) => (
              <GlassCard key={a.id} className="flex items-center gap-3 p-3">
                <PlatformIcon platform={a.platform} size={18} denganWadah />
                {/* Username diketik polos; sistem yang merangkai URL-nya
                    sehingga sekali ketuk langsung membuka profilnya. */}
                <a
                  href={urlProfilSosmed(a.platform, a.username)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-tekan min-w-0 flex-1"
                >
                  <p className="truncate text-sm font-bold text-teks-utama">
                    @{a.username}
                    <ExternalLink
                      className="ml-1 inline h-3 w-3 text-teks-sekunder"
                      aria-hidden="true"
                    />
                  </p>
                  <p className="text-[11px] text-teks-sekunder">
                    {labelPlatform(a.platform)}
                    {/* Lencana hasil penautan login sungguhan (1.17) */}
                    {a.terhubung && (
                      <span className="ml-1.5 rounded-full bg-sukses/15 px-1.5 py-0.5 text-[9px] font-bold text-sukses">
                        Terhubung
                      </span>
                    )}
                  </p>
                </a>
                <button
                  type="button"
                  onClick={() => setEditAkun(a)}
                  aria-label={`Perbaiki @${a.username}`}
                  className="btn-tekan p-1.5 text-teks-sekunder/70"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void hapusAkunTvr(a.id)
                      .then(() => setMuatUlang((n) => n + 1))
                      .catch((e) =>
                        toast("error", "Gagal menghapus", e instanceof Error ? e.message : ""),
                      );
                  }}
                  aria-label={`Hapus @${a.username}`}
                  className="btn-tekan p-1.5 text-teks-sekunder/70"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </GlassCard>
            ))}
          </div>
        )}
      </FadeInUp>
        ) },
        { id: "unggah-sosmed", judul: "Unggah ke Sosmed Saya", ikon: Clapperboard, render: () => (
      <FadeInUp delay={0.1}>
        <SectionTitle judul="Unggah ke Sosmed Saya" />
        <div className="mt-2.5">
          <UnggahSosmedSaya />
        </div>
      </FadeInUp>
        ) },
        { id: "insight-saya", judul: "Insight Akun Saya", ikon: BarChart3, render: () => (
      <FadeInUp delay={0.11}>
        <SectionTitle judul="Insight Akun Saya" />
        <div className="mt-2.5">
          <InsightSayaPanel />
        </div>
      </FadeInUp>
        ) },
        { id: "website", judul: "Website TV Rakyat", ikon: Globe, render: () => (
      <FadeInUp delay={0.12}>
        <div className="mt-5 flex items-center justify-between">
          <SectionTitle judul="Website TV Rakyat" className="!mt-0" />
          <button
            type="button"
            onClick={() => setModalWebsite(true)}
            className="btn-tekan flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Tambah
          </button>
        </div>
        {(akun ?? []).filter((a) => a.platform === "website").length === 0 ? (
          <p className="mt-2 text-[11.5px] text-teks-sekunder">
            Belum ada website terdaftar.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {(akun ?? [])
              .filter((a) => a.platform === "website")
              .map((a) => (
                <GlassCard key={a.id} className="flex items-center gap-3 p-3">
                  <PlatformIcon platform="website" size={18} denganWadah />
                  <a
                    href={urlProfilSosmed("website", a.username)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-tekan min-w-0 flex-1"
                  >
                    <p className="truncate text-sm font-bold text-teks-utama">
                      {a.username}
                      <ExternalLink
                        className="ml-1 inline h-3 w-3 text-teks-sekunder"
                        aria-hidden="true"
                      />
                    </p>
                    <p className="text-[11px] text-teks-sekunder">Website</p>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      void hapusAkunTvr(a.id)
                        .then(() => setMuatUlang((n) => n + 1))
                        .catch((e) =>
                          toast("error", "Gagal menghapus", e instanceof Error ? e.message : ""),
                        );
                    }}
                    aria-label={`Hapus ${a.username}`}
                    className="btn-tekan p-1.5 text-teks-sekunder/70"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </GlassCard>
              ))}
          </div>
        )}
      </FadeInUp>
        ) },
        { id: "laporan", judul: "Laporan Video Hari Ini", ikon: Video, render: () => (
      <FadeInUp delay={0.14}>
        <div className="mt-5 flex items-center justify-between md:mt-0">
          <SectionTitle judul="Laporan Video Hari Ini" className="!mt-0" />
          <button
            type="button"
            onClick={() => setModalLaporan(true)}
            className="btn-tekan flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Tambah Laporan
          </button>
        </div>
        {memuat ? (
          <GlassSkeleton className="mt-2 h-16 rounded-2xl" />
        ) : laporan.length === 0 ? (
          <GlassCard className="mt-2 p-1">
            <EmptyState
              ikon={Link2}
              judul="Belum Ada Laporan"
              keterangan={`Unggah lewat aplikasi (otomatis tercatat) atau laporkan linknya di sini — link manual dihitung setelah ACC Divisi HR. Target: ${kpiTarget} video per hari.`}
              labelAksi="Tambah Laporan"
              onAksi={() => setModalLaporan(true)}
              className="py-5"
            />
          </GlassCard>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {laporan.map((l, i) => (
              <GlassCard key={l.id} className="flex items-center gap-3 p-3">
                <span className="angka-tab flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pri/10 text-[11px] font-extrabold text-pri">
                  {i + 1}
                </span>
                <PlatformIcon platform={l.platform} size={15} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-teks-utama">{l.url_video}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-teks-sekunder">
                    {l.keyword && (
                      <span className="rounded bg-pri/12 px-1.5 py-0.5 text-[9px] font-bold text-pri">
                        {l.keyword}
                      </span>
                    )}
                    dilaporkan {jamWIB(l.dibuat_pada)}
                  </p>
                </div>
                <a
                  href={l.url_video}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Buka video"
                  className="btn-tekan p-1.5 text-teks-sekunder"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={() => setEditLaporan(l)}
                  aria-label="Perbaiki laporan"
                  className="btn-tekan p-1.5 text-teks-sekunder/70"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void hapusLaporanVideo(l.id)
                      .then(() => setMuatUlang((n) => n + 1))
                      .catch((e) =>
                        toast("error", "Gagal menghapus", e instanceof Error ? e.message : ""),
                      );
                  }}
                  aria-label="Hapus laporan"
                  className="btn-tekan p-1.5 text-teks-sekunder/70"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </GlassCard>
            ))}
          </div>
        )}
        {menunggu.length > 0 && (
          <div className="mt-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-teks-sekunder">
              <Hourglass className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
              Laporan link menunggu ACC Divisi HR — belum dihitung KPI
            </p>
            <div className="mt-1.5 flex flex-col gap-2">
              {menunggu.map((m) => (
                <GlassCard key={m.id} className="flex items-center gap-3 p-3">
                  <PlatformIcon platform={m.platform} size={15} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-teks-utama">{m.url_video}</p>
                    <p className="mt-0.5 text-[10px] text-teks-sekunder">
                      {m.status === "ditolak"
                        ? `ditolak${m.catatan ? `: ${m.catatan}` : ""}`
                        : `dikirim ${jamWIB(m.dibuat_pada)}`}
                    </p>
                  </div>
                  <StatusBadge
                    label={m.status === "ditolak" ? "ditolak" : "menunggu HR"}
                    warna={m.status === "ditolak" ? "merah" : "kuning"}
                  />
                  {m.status === "menunggu" && (
                    <button
                      type="button"
                      onClick={() => {
                        void hapusLaporanVideo(m.id, true)
                          .then(() => setMuatUlang((n) => n + 1))
                          .catch((e) =>
                            toast("error", "Gagal menarik", e instanceof Error ? e.message : ""),
                          );
                      }}
                      aria-label="Tarik laporan"
                      className="btn-tekan p-1.5 text-teks-sekunder/70"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </GlassCard>
              ))}
            </div>
          </div>
        )}
      </FadeInUp>
        ) },
        { id: "sosmed-terblokir", judul: "Sosmed Terblokir (KPI)", ikon: Ban, render: () => (
      <FadeInUp delay={0.16}>
        <div className="mt-5 md:mt-0">
          <PermohonanBlokir />
        </div>
      </FadeInUp>
        ) },
        ] as SeksiModul[]}
      />

      {/* Modal-modal */}
      <AnimatePresence>
        {/* Modal "Daftarkan Akun TV Rakyat" DIHAPUS (31 Agu 2026):
            penambahan akun manual diganti penuh oleh login upload-post. */}
        {modalWebsite && (
          <ModalWebsite onTutup={() => setModalWebsite(false)} onKirim={tambahWebsite} />
        )}
        {modalLaporan && (
          <ModalLaporanBatch onTutup={() => setModalLaporan(false)} onSelesai={selesaiBatch} />
        )}
        {editAkun && (
          <ModalTambah
            judul="Perbaiki Akun"
            placeholder="Username akun yang benar"
            ikonKirim={Pencil}
            awalPlatform={editAkun.platform}
            awalNilai={editAkun.username}
            onTutup={() => setEditAkun(null)}
            onKirim={async (platform, username) => {
              try {
                await ubahAkunTvr(editAkun.id, platform, username);
                toast("sukses", "Akun diperbaiki");
                setEditAkun(null);
                setMuatUlang((n) => n + 1);
              } catch (e) {
                toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
              }
            }}
          />
        )}
        {editLaporan && (
          <ModalTambah
            judul="Perbaiki Laporan"
            placeholder="Link video yang benar"
            ikonKirim={Pencil}
            awalPlatform={editLaporan.platform}
            awalNilai={editLaporan.url_video}
            onTutup={() => setEditLaporan(null)}
            onKirim={async (platform, url) => {
              try {
                await ubahLaporanVideo(editLaporan.id, platform, url);
                toast("sukses", "Laporan diperbaiki");
                setEditLaporan(null);
                setMuatUlang((n) => n + 1);
              } catch (e) {
                toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
