"use client";

// ============================================================
// SetelKpiScreen — rencana kerja/tugas tambahan divisi (spek 2.5).
//
// Akses: HR (semua divisi) & Ketua Divisi (divisinya sendiri) —
// dijaga ulang di server. Anggota yang dituju mendapat notifikasi;
// KPI lewat deadline otomatis Expired (dicek malas saat halaman
// dibuka, tanpa cron).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, FadeInUp, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  getKpiTugas,
  getPengguna,
  hapusKpiTugas,
  tambahKpiTugas,
  ubahKpiTugas,
  type KpiTugas,
  type PenggunaAdmin,
} from "@/services";
import { DIVISI } from "@/lib/struktur";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

const WARNA_PRIORITAS: Record<string, "merah" | "kuning" | "biru" | "hijau"> = {
  kritis: "merah",
  tinggi: "kuning",
  sedang: "biru",
  rendah: "hijau",
};

export function SetelKpiScreen({
  user,
  onKembali,
}: {
  user: User;
  onKembali: () => void;
}) {
  const [daftar, setDaftar] = useState<KpiTugas[] | null>(null);
  const [bolehKelola, setBolehKelola] = useState(false);
  const [kelolaSemua, setKelolaSemua] = useState(false);
  const [saring, setSaring] = useState<"semua" | "aktif" | "selesai" | "expired">("aktif");
  const [muatUlang, setMuatUlang] = useState(0);
  const [formBuka, setFormBuka] = useState(false);
  const [progressUntuk, setProgressUntuk] = useState<KpiTugas | null>(null);
  const [sedang, setSedang] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getKpiTugas(saring);
        if (!hidup) return;
        setDaftar(hasil.data);
        setBolehKelola(hasil.boleh_kelola);
        setKelolaSemua(hasil.kelola_semua);
      } catch (e) {
        if (hidup) {
          setDaftar([]);
          toast("error", "Gagal memuat KPI", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang, saring]);

  async function hapus(k: KpiTugas) {
    if (sedang) return;
    setSedang(true);
    try {
      await hapusKpiTugas(k.id);
      toast("sukses", "KPI dihapus");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    } finally {
      setSedang(false);
    }
  }

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <header className="flex items-center gap-3 pt-5">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-xl font-extrabold tracking-tight text-teks-utama">
            Setel KPI
          </h1>
          <p className="text-xs text-teks-sekunder">
            {kelolaSemua ? "Semua divisi" : user.divisi || "Divisi Anda"}
          </p>
        </div>
        {bolehKelola && (
          <button
            type="button"
            onClick={() => setFormBuka(true)}
            className="btn-tekan flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-[12px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Buat KPI
          </button>
        )}
      </header>

      {/* Filter status */}
      <div className="mt-4 flex gap-1.5">
        {(["aktif", "selesai", "expired", "semua"] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => {
              setDaftar(null);
              setSaring(st);
            }}
            aria-pressed={saring === st}
            className={cn(
              "btn-tekan rounded-full px-3.5 py-1.5 text-[12px] font-semibold capitalize",
              saring === st ? "text-white" : "glass-soft text-teks-sekunder",
            )}
            style={
              saring === st
                ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                : undefined
            }
          >
            {st}
          </button>
        ))}
      </div>

      {/* Daftar KPI */}
      {daftar === null ? (
        <GlassSkeleton className="mt-3 h-32 rounded-2xl" />
      ) : daftar.length === 0 ? (
        <GlassCard className="mt-3 p-1">
          <EmptyState
            ikon={TrendingUp}
            judul="Belum Ada KPI"
            keterangan={
              bolehKelola
                ? "Buat rencana kerja/tugas tambahan untuk tim divisi."
                : "KPI dari HR/ketua divisi akan tampil di sini."
            }
            labelAksi={bolehKelola ? "Buat KPI" : undefined}
            onAksi={bolehKelola ? () => setFormBuka(true) : undefined}
            className="py-8"
          />
        </GlassCard>
      ) : (
        <FadeInUp>
          <div className="mt-3 flex flex-col gap-2">
            {daftar.map((k, i) => (
              <GlassCard key={k.id} className="p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="angka-tab mt-0.5 w-5 shrink-0 text-center text-[10.5px] font-bold text-teks-sekunder">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-teks-utama">{k.judul}</p>
                    {k.deskripsi && (
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-teks-sekunder">
                        {k.deskripsi}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge
                        label={k.prioritas}
                        warna={WARNA_PRIORITAS[k.prioritas] ?? "biru"}
                      />
                      <StatusBadge
                        label={k.status}
                        warna={
                          k.status === "aktif"
                            ? "hijau"
                            : k.status === "selesai"
                              ? "biru"
                              : "merah"
                        }
                      />
                      <span className="text-[10.5px] text-teks-sekunder">
                        {kelolaSemua && `${k.divisi} · `}
                        {k.untuk_semua
                          ? "semua anggota"
                          : `${k.target_ids.length} anggota`}{" "}
                        · deadline {k.tenggat}
                      </span>
                    </div>
                    {k.target_indikator && (
                      <p className="mt-1 text-[10.5px] text-teks-sekunder">
                        🎯 {k.target_indikator}
                      </p>
                    )}
                    {/* Progress bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-teks-sekunder/15">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{
                            width: `${k.progress}%`,
                            background:
                              k.progress >= 100
                                ? "linear-gradient(90deg, #10B981, #059669)"
                                : "linear-gradient(90deg, #DC2626, #F59E0B)",
                          }}
                        />
                      </div>
                      <span className="angka-tab shrink-0 text-[11px] font-extrabold text-teks-utama">
                        {k.progress}%
                      </span>
                    </div>
                    {k.catatan_progress && (
                      <p className="mt-1 text-[10.5px] text-teks-sekunder italic">
                        “{k.catatan_progress}”
                      </p>
                    )}
                  </div>
                  {bolehKelola && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setProgressUntuk(k)}
                        aria-label={`Update progress ${k.judul}`}
                        className="glass btn-tekan flex h-7 w-7 items-center justify-center rounded-lg text-teks-utama"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={sedang}
                        onClick={() => void hapus(k)}
                        aria-label={`Hapus ${k.judul}`}
                        className="btn-tekan flex h-7 w-7 items-center justify-center rounded-lg text-gagal/70 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        </FadeInUp>
      )}

      {formBuka && (
        <FormKpi
          kelolaSemua={kelolaSemua}
          divisiKu={user.divisi ?? ""}
          onTutup={() => setFormBuka(false)}
          onTersimpan={() => {
            setFormBuka(false);
            setMuatUlang((n) => n + 1);
          }}
        />
      )}
      {progressUntuk && (
        <ModalProgress
          kpi={progressUntuk}
          onTutup={() => setProgressUntuk(null)}
          onTersimpan={() => {
            setProgressUntuk(null);
            setMuatUlang((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// FormKpi — buat KPI baru (spek 2.5).
// ------------------------------------------------------------

function FormKpi({
  kelolaSemua,
  divisiKu,
  onTutup,
  onTersimpan,
}: {
  kelolaSemua: boolean;
  divisiKu: string;
  onTutup: () => void;
  onTersimpan: () => void;
}) {
  const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [divisi, setDivisi] = useState(kelolaSemua ? "" : divisiKu);
  const [mulai, setMulai] = useState(hariIni);
  const [tenggat, setTenggat] = useState("");
  const [prioritas, setPrioritas] = useState("sedang");
  const [indikator, setIndikator] = useState("");
  const [untukSemua, setUntukSemua] = useState(true);
  const [pilihan, setPilihan] = useState<PenggunaAdmin[]>([]);
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [sedang, setSedang] = useState(false);

  // Kandidat anggota spesifik: dimuat saat mode "anggota spesifik".
  useEffect(() => {
    if (untukSemua || !divisi) return;
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getPengguna();
        if (hidup) {
          setPilihan(
            hasil.data.filter((u) => u.status === "aktif" && u.divisi === divisi),
          );
        }
      } catch {
        if (hidup) setPilihan([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [untukSemua, divisi]);

  const sah =
    judul.trim().length >= 3 &&
    Boolean(divisi) &&
    /^\d{4}-\d{2}-\d{2}$/.test(tenggat) &&
    (untukSemua || terpilih.size > 0);

  async function simpan() {
    if (!sah || sedang) return;
    setSedang(true);
    try {
      await tambahKpiTugas({
        judul: judul.trim(),
        deskripsi: deskripsi.trim(),
        divisi: kelolaSemua ? divisi : undefined,
        tanggal_mulai: mulai,
        tenggat,
        prioritas,
        target_indikator: indikator.trim(),
        untuk_semua: untukSemua,
        target_ids: untukSemua ? undefined : Array.from(terpilih),
      });
      toast("sukses", "KPI tersimpan", "Anggota yang dituju sudah diberi tahu.");
      onTersimpan();
    } catch (e) {
      toast("error", "Gagal menyimpan KPI", e instanceof Error ? e.message : "");
    } finally {
      setSedang(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Buat KPI"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
      <div className="glass-strong scrollbar-tipis relative max-h-[90dvh] w-full max-w-[420px] overflow-y-auto rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-base font-bold text-teks-utama">Buat KPI</h3>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="btn-tekan p-1 text-teks-sekunder"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={judul}
          onChange={(e) => setJudul(e.target.value.slice(0, 120))}
          placeholder="Judul tugas/KPI…"
          className="glass mt-3 h-11 w-full rounded-xl px-3.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />
        <textarea
          value={deskripsi}
          onChange={(e) => setDeskripsi(e.target.value.slice(0, 2000))}
          placeholder="Deskripsi detail…"
          rows={3}
          className="glass mt-2 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />
        {kelolaSemua && (
          <select
            value={divisi}
            onChange={(e) => setDivisi(e.target.value)}
            aria-label="Divisi tujuan"
            className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm text-teks-utama outline-none"
          >
            <option value="">Pilih divisi…</option>
            {DIVISI.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        <div className="mt-2 flex gap-2">
          <label className="min-w-0 flex-1 text-[10.5px] font-semibold text-teks-sekunder">
            Mulai
            <input
              type="date"
              value={mulai}
              onChange={(e) => setMulai(e.target.value)}
              className="glass mt-1 h-10 w-full rounded-xl px-3 text-sm text-teks-utama focus:outline-none"
            />
          </label>
          <label className="min-w-0 flex-1 text-[10.5px] font-semibold text-teks-sekunder">
            Deadline
            <input
              type="date"
              value={tenggat}
              onChange={(e) => setTenggat(e.target.value)}
              className="glass mt-1 h-10 w-full rounded-xl px-3 text-sm text-teks-utama focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-2 flex gap-1.5">
          {(["rendah", "sedang", "tinggi", "kritis"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrioritas(p)}
              aria-pressed={prioritas === p}
              className={cn(
                "btn-tekan flex-1 rounded-xl py-2 text-[11.5px] font-bold capitalize",
                prioritas === p ? "text-white" : "glass-soft text-teks-sekunder",
              )}
              style={
                prioritas === p
                  ? {
                      background:
                        p === "kritis"
                          ? "linear-gradient(135deg, #DC2626, #B91C1C)"
                          : p === "tinggi"
                            ? "linear-gradient(135deg, #F59E0B, #D97706)"
                            : p === "sedang"
                              ? "linear-gradient(135deg, #3B82F6, #2563EB)"
                              : "linear-gradient(135deg, #10B981, #059669)",
                    }
                  : undefined
              }
            >
              {p}
            </button>
          ))}
        </div>
        <input
          value={indikator}
          onChange={(e) => setIndikator(e.target.value.slice(0, 300))}
          placeholder="Target / indikator keberhasilan (opsional)…"
          className="glass mt-2 h-11 w-full rounded-xl px-3.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />

        {/* Ditujukan ke */}
        <div className="mt-2 flex gap-1.5">
          {(
            [
              [true, "Semua Anggota Divisi"],
              [false, "Anggota Spesifik"],
            ] as const
          ).map(([nilai, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setUntukSemua(nilai)}
              aria-pressed={untukSemua === nilai}
              className={cn(
                "btn-tekan flex-1 rounded-xl py-2 text-[11.5px] font-bold",
                untukSemua === nilai ? "text-white" : "glass-soft text-teks-sekunder",
              )}
              style={
                untukSemua === nilai
                  ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
        {!untukSemua && (
          <div className="scrollbar-tipis mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
            {pilihan.length === 0 ? (
              <p className="py-3 text-center text-[11px] text-teks-sekunder">
                {divisi ? "Memuat anggota…" : "Pilih divisinya dulu."}
              </p>
            ) : (
              pilihan.map((u) => (
                <label
                  key={u.id}
                  className="glass-soft flex items-center gap-2.5 rounded-lg px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={terpilih.has(u.id)}
                    onChange={(e) => {
                      setTerpilih((s) => {
                        const b = new Set(s);
                        if (e.target.checked) b.add(u.id);
                        else b.delete(u.id);
                        return b;
                      });
                    }}
                  />
                  <span className="truncate text-[12px] font-semibold text-teks-utama">
                    {u.nama}
                  </span>
                </label>
              ))
            )}
          </div>
        )}

        <button
          type="button"
          disabled={!sah || sedang}
          onClick={() => void simpan()}
          className="btn-tekan mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {sedang ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          )}
          Simpan KPI
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// ModalProgress — update persentase + catatan (spek 2.5).
// ------------------------------------------------------------

function ModalProgress({
  kpi,
  onTutup,
  onTersimpan,
}: {
  kpi: KpiTugas;
  onTutup: () => void;
  onTersimpan: () => void;
}) {
  const [nilai, setNilai] = useState(kpi.progress);
  const [catatan, setCatatan] = useState("");
  const [sedang, setSedang] = useState(false);

  async function simpan() {
    if (sedang) return;
    setSedang(true);
    try {
      await ubahKpiTugas(kpi.id, { progress: nilai, catatan: catatan.trim() });
      toast("sukses", "Progress tersimpan", `${nilai}%${nilai >= 100 ? " — KPI selesai 🎉" : ""}`);
      onTersimpan();
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
    } finally {
      setSedang(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Update progress ${kpi.judul}`}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass-strong relative w-full max-w-[320px] rounded-2xl p-5">
        <p className="text-sm font-bold text-teks-utama">Update Progress</p>
        <p className="mt-0.5 truncate text-[11px] text-teks-sekunder">{kpi.judul}</p>
        <div className="mt-4 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={nilai}
            onChange={(e) => setNilai(Number(e.target.value))}
            aria-label="Persentase progress"
            className="min-w-0 flex-1 accent-[#DC2626]"
          />
          <span className="angka-tab font-heading w-12 text-right text-xl font-extrabold text-teks-utama">
            {nilai}%
          </span>
        </div>
        <textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value.slice(0, 500))}
          placeholder="Catatan progress (opsional)…"
          rows={2}
          className="glass mt-3 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onTutup}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={sedang}
            onClick={() => void simpan()}
            className="btn-tekan flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {sedang ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
