"use client";

// ============================================================
// LaporanKerjaScreen — rencana pagi, laporan sore, KPI harian.
//
// Alur untuk anggota:
// 1. Pagi: tulis butir-butir rencana kerja hari ini.
// 2. Sepanjang hari: pekerjaan dadakan dicatat sebagai
//    "aktivitas tambahan" (tidak mengurangi KPI).
// 3. Sore: tiap butir rencana dilaporkan Selesai / Tidak Selesai
//    beserta catatan. KPI = rencana selesai ÷ total rencana.
//
// Untuk HR (admin_hr / super_admin / master) ada mode "Tim":
// ringkasan KPI semua anggota per tanggal, bisa dibuka per orang.
// Rencana hanya bisa ditambah untuk HARI INI (dikunci juga di
// server) — menulis "rencana" setelah hasilnya ketahuan adalah
// celah yang sengaja ditutup.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import {
  AvatarInisial,
  EmptyState,
  FadeInUp,
  GlassSkeleton,
  ScreenHeader,
  SectionTitle,
  StatusBadge,
} from "@/components/pri-ui";
import { ProgressRing } from "@/components/progress-ring";
import { toast } from "@/hooks/use-app-store";
import {
  getKpiSemua,
  getLaporanKerja,
  hapusKerjaItem,
  laporkanKerjaItem,
  tambahAktivitasKerja,
  tambahRencanaKerja,
  type KerjaItem,
  type KerjaKpi,
  type KerjaKpiBaris,
} from "@/services";
import { jamWIB, tanggalIndonesia } from "@/lib/format";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

const PERAN_HR = new Set(["admin_hr", "super_admin", "master"]);

/** Tanggal WIB hari ini menurut jam perangkat — hanya nilai awal;
 *  nilai resmi selalu ikut balasan server (hari_ini). */
function tanggalWibPerangkat(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function geserTanggal(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------
// Modal lapor realisasi satu butir
// ------------------------------------------------------------

type ModalLaporProps = {
  item: KerjaItem;
  onTutup: () => void;
  onTersimpan: (baru: KerjaItem) => void;
};

function ModalLapor({ item, onTutup, onTersimpan }: ModalLaporProps) {
  const [status, setStatus] = useState<"selesai" | "tidak_selesai">(
    item.status === "tidak_selesai" ? "tidak_selesai" : "selesai",
  );
  const [catatan, setCatatan] = useState(item.catatan_realisasi ?? "");
  const [sedangSimpan, setSedangSimpan] = useState(false);

  async function simpan() {
    if (sedangSimpan) return;
    setSedangSimpan(true);
    try {
      const baru = await laporkanKerjaItem({ id: item.id, status, catatan });
      toast("sukses", "Laporan tersimpan");
      onTersimpan(baru);
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
      setSedangSimpan(false);
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
        aria-label="Laporkan realisasi"
        className="glass-strong w-full max-w-[320px] rounded-2xl p-5"
        initial={{ scale: 0.92, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-bold text-teks-utama">Laporkan Realisasi</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-teks-sekunder">{item.deskripsi}</p>

        <div className="mt-4 flex gap-2">
          {(
            [
              { kunci: "selesai", label: "Selesai", Ikon: Check, warna: "#10B981" },
              { kunci: "tidak_selesai", label: "Tidak Selesai", Ikon: X, warna: "#EF4444" },
            ] as const
          ).map(({ kunci, label, Ikon, warna }) => (
            <button
              key={kunci}
              type="button"
              onClick={() => setStatus(kunci)}
              className={cn(
                "btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold",
                status === kunci ? "text-white" : "glass text-teks-sekunder",
              )}
              style={
                status === kunci
                  ? { background: warna, borderColor: warna }
                  : { borderColor: "transparent" }
              }
            >
              <Ikon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={
            status === "selesai"
              ? "Catatan hasil (opsional)…"
              : "Kenapa tidak selesai? (disarankan diisi)"
          }
          className="glass mt-3 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
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
            onClick={() => void simpan()}
            disabled={sedangSimpan}
            className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
            }}
          >
            {sedangSimpan && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Simpan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// Satu butir kerja
// ------------------------------------------------------------

function BarisItem({
  item,
  bolehAksi,
  onLapor,
  onHapus,
}: {
  item: KerjaItem;
  bolehAksi: boolean;
  onLapor: () => void;
  onHapus?: () => void;
}) {
  const badge =
    item.status === "selesai" ? (
      <StatusBadge label="selesai" warna="hijau" />
    ) : item.status === "tidak_selesai" ? (
      <StatusBadge label="tidak selesai" warna="merah" />
    ) : (
      <StatusBadge label="belum lapor" warna="netral" />
    );

  return (
    <GlassCard className="p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-teks-utama">{item.deskripsi}</p>
          {item.catatan_realisasi && (
            <p className="mt-1 text-xs leading-relaxed text-teks-sekunder">
              {item.catatan_realisasi}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {badge}
            {item.nama_penugas && (
              <span className="inline-flex items-center rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                Tugas dari {item.nama_penugas}
              </span>
            )}
            {item.tenggat && (
              <span className="inline-flex items-center rounded-full border border-emas/30 bg-emas/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                tenggat {item.tenggat}
              </span>
            )}
            <span className="text-[10px] text-teks-sekunder/80">
              ditulis {jamWIB(item.dibuat_pada)}
              {item.dilaporkan_pada ? ` · dilaporkan ${jamWIB(item.dilaporkan_pada)}` : ""}
            </span>
          </div>
        </div>
        {bolehAksi && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={onLapor}
              className="btn-tekan rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              {item.status === "direncanakan" ? "Lapor" : "Ubah"}
            </button>
            {onHapus && item.status === "direncanakan" && (
              <button
                type="button"
                onClick={onHapus}
                className="btn-tekan p-1 text-teks-sekunder/70"
                aria-label="Hapus butir rencana"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ------------------------------------------------------------
// LaporanKerjaScreen
// ------------------------------------------------------------

type LaporanKerjaScreenProps = {
  user: User;
  onKembali: () => void;
};

export function LaporanKerjaScreen({ user, onKembali }: LaporanKerjaScreenProps) {
  const bolehLihatTim = PERAN_HR.has(user.role);
  const [modeTim, setModeTim] = useState(false);

  const [tanggal, setTanggal] = useState(tanggalWibPerangkat());
  // Harian = KPI per tanggal; Besar = proyek lintas hari bertenggat.
  const [kategori, setKategori] = useState<"harian" | "besar">("harian");
  const [tenggatBaru, setTenggatBaru] = useState("");
  const [hariIni, setHariIni] = useState(tanggalWibPerangkat());
  const [memuat, setMemuat] = useState(true);

  // Mode pribadi (atau detail satu anggota di mode tim)
  const [items, setItems] = useState<KerjaItem[]>([]);

  // Mode tim
  const [kpiTim, setKpiTim] = useState<KerjaKpiBaris[]>([]);
  const [detailTim, setDetailTim] = useState<{ userId: string; nama: string } | null>(null);

  const [inputRencana, setInputRencana] = useState("");
  const [inputTambahan, setInputTambahan] = useState("");
  const [sedangTambah, setSedangTambah] = useState(false);
  const [itemDilapor, setItemDilapor] = useState<KerjaItem | null>(null);

  // Muat data tiap kali tanggal/mode berubah. setState hanya setelah
  // await (aturan lint react-hooks proyek ini); penanda `hidup`
  // mencegah setState setelah layar ditutup.
  useEffect(() => {
    let hidup = true;
    void (async () => {
      await Promise.resolve();
      if (!hidup) return;
      setMemuat(true);
      try {
        if (modeTim && !detailTim) {
          const hasil = await getKpiSemua(tanggal);
          if (!hidup) return;
          setKpiTim(hasil.data);
        } else {
          const hasil = await getLaporanKerja(tanggal, detailTim?.userId, kategori);
          if (!hidup) return;
          setItems(hasil.data);
          setHariIni(hasil.hari_ini);
        }
      } catch (e) {
        if (hidup) {
          toast("error", "Gagal memuat laporan", e instanceof Error ? e.message : "");
        }
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [tanggal, modeTim, detailTim, kategori]);

  // KPI dihitung dari butir yang ada di layar — selalu segar setelah
  // tambah/lapor/hapus, tanpa perlu memuat ulang dari server.
  const rencanaSemua = items.filter((i) => i.jenis === "rencana");
  const kpi: KerjaKpi = {
    rencana_total: rencanaSemua.length,
    rencana_selesai: rencanaSemua.filter((i) => i.status === "selesai").length,
    rencana_gagal: rencanaSemua.filter((i) => i.status === "tidak_selesai").length,
    rencana_belum_lapor: rencanaSemua.filter((i) => i.status === "direncanakan").length,
    tambahan_total: items.filter((i) => i.jenis === "tambahan").length,
    kpi_persen:
      rencanaSemua.length === 0
        ? null
        : Math.round(
            (100 * rencanaSemua.filter((i) => i.status === "selesai").length) /
              rencanaSemua.length,
          ),
  };

  const iniHariIni = tanggal === hariIni;
  const bolehEdit = !modeTim && (kategori === "besar" || iniHariIni);
  const rencana = items.filter((i) => i.jenis === "rencana");
  const tambahan = items.filter((i) => i.jenis === "tambahan");

  async function tambahRencana() {
    const teks = inputRencana.trim();
    if (teks.length < 3 || sedangTambah) return;
    setSedangTambah(true);
    try {
      const baru = await tambahRencanaKerja(
        [teks],
        kategori,
        kategori === "besar" && tenggatBaru ? tenggatBaru : undefined,
      );
      setItems((d) => [...d, ...baru]);
      setInputRencana("");
    } catch (e) {
      toast("error", "Gagal menambah rencana", e instanceof Error ? e.message : "");
    } finally {
      setSedangTambah(false);
    }
  }

  async function tambahTambahan() {
    const teks = inputTambahan.trim();
    if (teks.length < 3 || sedangTambah) return;
    setSedangTambah(true);
    try {
      const baru = await tambahAktivitasKerja(teks);
      setItems((d) => [...d, baru]);
      setInputTambahan("");
    } catch (e) {
      toast("error", "Gagal mencatat aktivitas", e instanceof Error ? e.message : "");
    } finally {
      setSedangTambah(false);
    }
  }

  async function hapusItem(id: string) {
    try {
      await hapusKerjaItem(id);
      setItems((d) => d.filter((i) => i.id !== id));
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    }
  }

  const judulLayar = detailTim ? detailTim.nama : "Laporan Kerja";

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-16">
      <ScreenHeader
        judul={judulLayar}
        onKembali={detailTim ? () => setDetailTim(null) : onKembali}
      />

      {/* Navigasi tanggal */}
      <FadeInUp>
        <GlassCard className="flex items-center justify-between p-2.5">
          <button
            type="button"
            onClick={() => setTanggal((t) => geserTanggal(t, -1))}
            className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full"
            aria-label="Hari sebelumnya"
          >
            <ChevronLeft className="h-4 w-4 text-teks-utama" aria-hidden="true" />
          </button>
          <div className="text-center">
            <p className="text-sm font-bold text-teks-utama">
              {tanggalIndonesia(`${tanggal}T00:00:00+07:00`)}
            </p>
            {iniHariIni && <p className="text-[10px] font-semibold text-pri">Hari ini</p>}
          </div>
          <button
            type="button"
            onClick={() => setTanggal((t) => geserTanggal(t, 1))}
            disabled={tanggal >= hariIni}
            className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40"
            aria-label="Hari berikutnya"
          >
            <ChevronRight className="h-4 w-4 text-teks-utama" aria-hidden="true" />
          </button>
        </GlassCard>
      </FadeInUp>

      {/* Saklar kategori: harian (KPI) vs rencana besar (proyek) */}
      {!detailTim && (
        <FadeInUp delay={0.02}>
          <div className="mt-3 flex gap-2">
            {(
              [
                { kunci: "harian", label: "Rencana Harian" },
                { kunci: "besar", label: "Rencana Besar" },
              ] as const
            ).map((k) => (
              <button
                key={k.kunci}
                type="button"
                onClick={() => setKategori(k.kunci)}
                className={cn(
                  "btn-tekan flex-1 rounded-full px-3 py-2 text-xs font-bold",
                  kategori === k.kunci ? "text-white" : "glass text-teks-sekunder",
                )}
                style={
                  kategori === k.kunci
                    ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                    : undefined
                }
              >
                {k.label}
              </button>
            ))}
          </div>
        </FadeInUp>
      )}

      {/* Saklar HR: laporan saya / tim */}
      {bolehLihatTim && !detailTim && (
        <FadeInUp delay={0.04}>
          <div className="mt-3 flex gap-2">
            {[
              { kunci: false, label: "Laporan Saya" },
              { kunci: true, label: "Tim (HR)" },
            ].map((s) => (
              <button
                key={String(s.kunci)}
                type="button"
                onClick={() => setModeTim(s.kunci)}
                className={cn(
                  "btn-tekan flex-1 rounded-full px-3 py-2 text-xs font-bold",
                  modeTim === s.kunci ? "text-white" : "glass text-teks-sekunder",
                )}
                style={
                  modeTim === s.kunci
                    ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                    : undefined
                }
              >
                {s.kunci && <Users className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                {s.label}
              </button>
            ))}
          </div>
        </FadeInUp>
      )}

      {/* ===== MODE TIM (ringkasan KPI semua anggota) ===== */}
      {modeTim && !detailTim ? (
        <FadeInUp delay={0.08}>
          <SectionTitle judul="KPI Anggota" className="mt-5" />
          {memuat ? (
            <div className="flex flex-col gap-2">
              <GlassSkeleton className="h-16 rounded-2xl" />
              <GlassSkeleton className="h-16 rounded-2xl" />
            </div>
          ) : kpiTim.length === 0 ? (
            <EmptyState
              ikon={ClipboardList}
              judul="Belum Ada Laporan"
              keterangan="Belum ada anggota yang mengisi rencana kerja pada tanggal ini."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {kpiTim.map((b) => (
                <button
                  key={b.user_id}
                  type="button"
                  onClick={() => setDetailTim({ userId: b.user_id, nama: b.nama })}
                  className="btn-tekan text-left"
                >
                  <GlassCard className="flex items-center gap-3 p-3.5">
                    <AvatarInisial nama={b.nama} ukuran={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-teks-utama">{b.nama}</p>
                      <p className="mt-0.5 text-[11px] text-teks-sekunder">
                        {b.rencana_selesai}/{b.rencana_total} rencana selesai
                        {b.tambahan_total > 0 ? ` · +${b.tambahan_total} tambahan` : ""}
                        {b.rencana_belum_lapor > 0 ? ` · ${b.rencana_belum_lapor} belum lapor` : ""}
                      </p>
                    </div>
                    <ProgressRing value={b.kpi_persen ?? 0} size={44} strokeWidth={5}>
                      <span className="text-[10px] font-bold text-teks-utama">
                        {b.kpi_persen ?? 0}%
                      </span>
                    </ProgressRing>
                  </GlassCard>
                </button>
              ))}
            </div>
          )}
        </FadeInUp>
      ) : (
        <>
          {/* ===== MODE PRIBADI / DETAIL ANGGOTA ===== */}

          {/* Ring KPI */}
          <FadeInUp delay={0.08}>
            <GlassCard className="mt-4 flex items-center gap-4 p-4">
              <ProgressRing value={kpi?.kpi_persen ?? 0} size={72}>
                <span className="font-heading text-base font-extrabold text-teks-utama">
                  {kpi?.kpi_persen ?? 0}%
                </span>
              </ProgressRing>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-bold text-teks-utama">
                  {kategori === "besar" ? "Progres Rencana Besar" : "KPI Harian"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-teks-sekunder">
                  {kpi && kpi.rencana_total > 0
                    ? `${kpi.rencana_selesai} dari ${kpi.rencana_total} rencana selesai` +
                      (kpi.rencana_belum_lapor > 0
                        ? ` · ${kpi.rencana_belum_lapor} belum dilaporkan`
                        : "") +
                      (kpi.tambahan_total > 0 ? ` · ${kpi.tambahan_total} aktivitas tambahan` : "")
                    : "Belum ada rencana kerja pada tanggal ini."}
                </p>
              </div>
            </GlassCard>
          </FadeInUp>

          {/* Di PC: rencana dan aktivitas tambahan berdampingan */}
          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">

          {/* Rencana kerja */}
          <FadeInUp delay={0.12}>
            <SectionTitle
              judul={kategori === "besar" ? "Rencana Besar" : "Rencana Kerja"}
              className="mt-5"
            />
            {bolehEdit && (
              <div className="mb-2.5 flex gap-2">
                <input
                  value={inputRencana}
                  onChange={(e) => setInputRencana(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void tambahRencana();
                  }}
                  maxLength={500}
                  placeholder={
                    kategori === "besar"
                      ? "Tulis rencana besar / proyek…"
                      : "Tulis rencana kerja hari ini…"
                  }
                  className="glass min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
                />
                {kategori === "besar" && (
                  <input
                    type="date"
                    value={tenggatBaru}
                    onChange={(e) => setTenggatBaru(e.target.value)}
                    aria-label="Tenggat rencana besar"
                    className="glass w-[130px] shrink-0 rounded-xl px-2.5 py-2.5 text-xs text-teks-utama focus:outline-none"
                  />
                )}
                <button
                  type="button"
                  onClick={() => void tambahRencana()}
                  disabled={inputRencana.trim().length < 3 || sedangTambah}
                  className="btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                  aria-label="Tambah rencana"
                >
                  {sedangTambah ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            )}
            {memuat ? (
              <GlassSkeleton className="h-20 rounded-2xl" />
            ) : rencana.length === 0 ? (
              <EmptyState
                ikon={ClipboardList}
                judul="Belum Ada Rencana"
                keterangan={
                  bolehEdit
                    ? "Isi rencana kerja Anda pagi ini, lalu laporkan realisasinya sore hari."
                    : "Tidak ada rencana kerja pada tanggal ini."
                }
              />
            ) : (
              <div className="flex flex-col gap-2">
                {rencana.map((item) => (
                  <BarisItem
                    key={item.id}
                    item={item}
                    bolehAksi={bolehEdit}
                    onLapor={() => setItemDilapor(item)}
                    onHapus={() => void hapusItem(item.id)}
                  />
                ))}
              </div>
            )}
          </FadeInUp>

          {/* Aktivitas tambahan — konsep harian, tak berlaku utk proyek */}
          {kategori === "harian" && (
          <FadeInUp delay={0.16}>
            <SectionTitle judul="Aktivitas di Luar Rencana" className="mt-6" />
            {bolehEdit && (
              <div className="mb-2.5 flex gap-2">
                <input
                  value={inputTambahan}
                  onChange={(e) => setInputTambahan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void tambahTambahan();
                  }}
                  maxLength={500}
                  placeholder="Pekerjaan dadakan yang dikerjakan…"
                  className="glass min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void tambahTambahan()}
                  disabled={inputTambahan.trim().length < 3 || sedangTambah}
                  className="btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
                  aria-label="Catat aktivitas tambahan"
                >
                  <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
                </button>
              </div>
            )}
            {tambahan.length === 0 ? (
              <p className="px-1 text-xs leading-relaxed text-teks-sekunder">
                {bolehEdit
                  ? "Ada pekerjaan mendadak di luar rencana? Catat di sini — dihitung sebagai nilai tambah, tidak mengurangi KPI."
                  : "Tidak ada aktivitas tambahan."}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {tambahan.map((item) => (
                  <BarisItem
                    key={item.id}
                    item={item}
                    bolehAksi={bolehEdit}
                    onLapor={() => setItemDilapor(item)}
                  />
                ))}
              </div>
            )}
          </FadeInUp>
          )}

          </div>
        </>
      )}

      <AnimatePresence>
        {itemDilapor && (
          <ModalLapor
            item={itemDilapor}
            onTutup={() => setItemDilapor(null)}
            onTersimpan={(baru) => {
              setItems((d) => d.map((i) => (i.id === baru.id ? baru : i)));
              setItemDilapor(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
