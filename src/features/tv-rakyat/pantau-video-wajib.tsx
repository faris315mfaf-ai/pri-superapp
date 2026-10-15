"use client";

// ============================================================
// PantauVideoWajib (15 Okt 2026) — lembar "Pantau kepatuhan".
//
// Satu perintah video wajib, satu tanggal (WIB): berapa akun yang sudah
// memposting ke SEMUA platform yang tertaut di akunnya, di wilayah mana
// yang tertinggal, dan siapa yang masih perlu dikejar.
//
// Komponen memuat datanya sendiri. Ganti tanggal = muat ulang; respons
// basi (tanggal sudah berganti lagi sebelum jawaban tiba) dibuang lewat
// penanda `hidup` pada efek.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, BellRing, CalendarDays, Loader2, RefreshCw, Search, X } from "lucide-react";
import { GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import {
  getPantauVideoWajib,
  ingatkanVideoWajib,
  type PantauVideoWajib as DataPantau,
} from "@/services";
import {
  LABEL_PLATFORM_WAJIB,
  SINGKATAN_PLATFORM_WAJIB,
  persenBulat,
  teksPola,
  type BarisPantauWajib,
  type StatusKepatuhan,
} from "@/lib/video-wajib-perintah";
import { cn } from "@/lib/utils";

const WARNA_HIJAU = "#16A34A";
const WARNA_KUNING = "#D97706";
const WARNA_MERAH = "#DC2626";
const HALAMAN = 50;

/** Hijau ≥50%, kuning 40–49%, merah <40%. */
function warnaPersen(persen: number): string {
  if (persen >= 50) return WARNA_HIJAU;
  if (persen >= 40) return WARNA_KUNING;
  return WARNA_MERAH;
}

const GAYA_STATUS: Record<StatusKepatuhan, { label: string; warna: string }> = {
  selesai: { label: "Selesai", warna: WARNA_HIJAU },
  sebagian: { label: "Sebagian", warna: WARNA_KUNING },
  belum: { label: "Belum", warna: WARNA_MERAH },
};

type FilterStatus = "semua" | StatusKepatuhan;

const DAFTAR_FILTER: { nilai: FilterStatus; label: string }[] = [
  { nilai: "semua", label: "Semua" },
  { nilai: "belum", label: "Belum" },
  { nilai: "sebagian", label: "Sebagian" },
  { nilai: "selesai", label: "Selesai" },
];

/** 'YYYY-MM-DD' → 'DD/MM' */
function tanggalPendek(t: string): string {
  const [, b, h] = t.split("-");
  return b && h ? `${h}/${b}` : t;
}

/** 'YYYY-MM-DD' → '15 Okt 2026' */
function tanggalPanjang(t: string): string {
  const [y, b, h] = t.split("-");
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const nb = Number(b);
  if (!y || !h || nb < 1 || nb > 12) return t;
  return `${Number(h)} ${bulan[nb - 1]} ${y}`;
}

function Batang({
  persen,
  warna,
  label,
}: {
  persen: number;
  warna: string;
  label: string;
}) {
  const p = Math.max(0, Math.min(100, persen));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      className="h-2.5 w-full overflow-hidden rounded-full bg-teks-sekunder/15"
    >
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${p}%`, background: warna }}
      />
    </div>
  );
}

function BarisAkun({ b }: { b: BarisPantauWajib }) {
  const st = GAYA_STATUS[b.status];
  return (
    <li className="glass-soft flex items-center gap-2 rounded-xl px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-bold text-teks-utama">{b.nama}</p>
        <p className="truncate text-[10.5px] text-teks-sekunder">{b.wilayah}</p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        {b.rinci.map((r) => {
          const nama = LABEL_PLATFORM_WAJIB[r.platform] ?? r.platform;
          return (
            <span
              key={r.platform}
              title={`${nama}: ${r.sudah ? "sudah" : "belum"}`}
              className={cn(
                "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[10.5px] font-extrabold",
                !r.sudah && "bg-teks-sekunder/15 text-teks-sekunder",
              )}
              style={r.sudah ? { background: "rgba(22,163,74,0.18)", color: WARNA_HIJAU } : undefined}
            >
              {SINGKATAN_PLATFORM_WAJIB[r.platform] ?? r.platform.slice(0, 1).toUpperCase()}
            </span>
          );
        })}
      </div>
      <span
        className="w-[68px] shrink-0 rounded-full px-2 py-0.5 text-center text-[10.5px] font-extrabold"
        style={{ background: `${st.warna}26`, color: st.warna }}
      >
        {st.label}
      </span>
    </li>
  );
}

type Props = {
  perintahId: string;
  judul: string;
  kategori: string;
  onTutup: () => void;
};

export function PantauVideoWajib({ perintahId, judul, kategori, onTutup }: Props) {
  // undefined = hari ini (biar server yang menentukan "hari ini" WIB).
  const [tanggalMinta, setTanggalMinta] = useState<string | undefined>(undefined);
  const [ulang, setUlang] = useState(0);
  const [data, setData] = useState<DataPantau | null>(null);
  const [galat, setGalat] = useState<{ kunci: string; pesan: string } | null>(null);
  const [kunciSelesai, setKunciSelesai] = useState("");
  const [mengingatkan, setMengingatkan] = useState(false);

  const [filter, setFilter] = useState<FilterStatus>("semua");
  const [cari, setCari] = useState("");
  const [tampil, setTampil] = useState(HALAMAN);

  const tombolTutup = useRef<HTMLButtonElement>(null);

  const kunci = `${tanggalMinta ?? ""}#${ulang}`;

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getPantauVideoWajib(perintahId, tanggalMinta);
        if (!hidup) return;
        setData(d);
        setGalat(null);
        setKunciSelesai(kunci);
      } catch (e) {
        if (!hidup) return;
        setGalat({ kunci, pesan: e instanceof Error ? e.message : "Gagal memuat data pantau." });
        setKunciSelesai(kunci);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [perintahId, tanggalMinta, kunci]);

  // Fokus awal ke tombol tutup, Escape menutup, latar tidak ikut bergulir.
  useEffect(() => {
    tombolTutup.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onTutup();
    }
    document.addEventListener("keydown", onKey);
    const overflowAwal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowAwal;
    };
  }, [onTutup]);

  const memuat = kunciSelesai !== kunci;
  const galatTampil = !memuat && galat !== null && galat.kunci === kunci ? galat.pesan : null;

  function pilihTanggal(t: string | undefined) {
    if (t === tanggalMinta) return;
    setTanggalMinta(t);
    setTampil(HALAMAN);
  }

  const daftarTersaring = useMemo(() => {
    if (!data) return [];
    const q = cari.trim().toLowerCase();
    return data.daftar.filter(
      (b) =>
        (filter === "semua" || b.status === filter) &&
        (q === "" || b.nama.toLowerCase().includes(q)),
    );
  }, [data, filter, cari]);

  async function ingatkan() {
    setMengingatkan(true);
    try {
      const r = await ingatkanVideoWajib(perintahId);
      if (r.dikirim > 0) {
        toast("sukses", `Pengingat terkirim ke ${r.dikirim} anggota`);
      } else {
        toast("peringatan", r.pesan || "Tidak ada anggota yang perlu diingatkan");
      }
    } catch (e) {
      toast("error", "Gagal mengirim pengingat", e instanceof Error ? e.message : "");
    } finally {
      setMengingatkan(false);
    }
  }

  const adalahHariIni = data !== null && data.tanggal === data.hari_ini;
  const perluDikejar = data ? data.ringkas.belum + data.ringkas.sebagian : 0;
  const bolehIngatkan = !!data && data.siap && adalahHariIni && perluDikejar > 0 && !memuat;
  const alasanNonaktif = !data
    ? ""
    : !adalahHariIni
      ? "Pengingat hanya untuk hari ini."
      : perluDikejar === 0
        ? "Semua akun sudah selesai."
        : "";

  // Tanggal yang sedang (atau akan) ditampilkan, untuk menyorot tab.
  const tanggalAktif = tanggalMinta ?? data?.hari_ini ?? "";
  const tabHariIni = data !== null && tanggalAktif === data.hari_ini;
  const tabKemarin = data !== null && tanggalAktif === data.kemarin;
  const tabPilihan = data !== null && !tabHariIni && !tabKemarin;
  const kemarinAdaData = data ? data.kemarin >= data.terbit : false;

  const kelasTab =
    "btn-tekan flex h-9 min-w-0 flex-1 items-center justify-center rounded-[10px] px-2 text-[12px] font-bold disabled:opacity-40";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pantau kepatuhan video wajib"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        onClick={onTutup}
        aria-hidden="true"
      />

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="relative flex max-h-[90dvh] border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#111827] w-full max-w-[640px] min-w-0 flex-col overflow-hidden rounded-t-[2rem] sm:rounded-[2rem]"
      >
        {/* Kepala */}
        <div className="flex shrink-0 items-start gap-3 px-4 pb-2 pt-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-[15px] font-bold text-teks-utama">Pantau kepatuhan</h2>
            <p className="mt-0.5 line-clamp-2 text-[12px] font-semibold text-teks-utama">{judul}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {kategori && (
                <span className="glass rounded-full px-2 py-0.5 text-[10px] font-bold text-teks-utama">
                  {kategori}
                </span>
              )}
              {data && (
                <span className="text-[11px] text-teks-sekunder">{teksPola(data.perintah)}</span>
              )}
            </div>
          </div>
          <button
            ref={tombolTutup}
            type="button"
            onClick={onTutup}
            aria-label="Tutup lembar pantau"
            className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-teks-utama"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Tab tanggal */}
        <div className="shrink-0 px-4 pb-2 sm:px-5">
          <div
            role="group"
            aria-label="Pilih tanggal"
            className="glass-soft flex gap-1 rounded-xl p-1"
          >
            <button
              type="button"
              aria-pressed={tabHariIni}
              disabled={!data}
              onClick={() => pilihTanggal(undefined)}
              className={cn(kelasTab, tabHariIni ? "glass text-teks-utama" : "text-teks-sekunder")}
            >
              Hari ini
            </button>
            <button
              type="button"
              aria-pressed={tabKemarin}
              disabled={!data || !kemarinAdaData}
              onClick={() => data && pilihTanggal(data.kemarin)}
              className={cn(kelasTab, tabKemarin ? "glass text-teks-utama" : "text-teks-sekunder")}
            >
              Kemarin
            </button>
            <label
              className={cn(
                kelasTab,
                "relative cursor-pointer gap-1.5",
                tabPilihan ? "glass text-teks-utama" : "text-teks-sekunder",
                !data && "pointer-events-none opacity-40",
              )}
            >
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {tabPilihan ? tanggalPanjang(tanggalAktif) : "Pilih tanggal"}
              </span>
              <input
                type="date"
                aria-label="Pilih tanggal lain"
                value={tanggalAktif}
                min={data?.terbit || undefined}
                max={data?.hari_ini || undefined}
                disabled={!data}
                onChange={(e) => {
                  const t = e.target.value;
                  if (!t || !data) return;
                  if (t > data.hari_ini || t < data.terbit) return;
                  pilihTanggal(t === data.hari_ini ? undefined : t);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        {/* Isi */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 sm:px-5"
          aria-busy={memuat}
        >
          {data === null && galatTampil === null ? (
            <div className="flex flex-col gap-3 pt-1" aria-label="Memuat data pantau">
              <div className="grid grid-cols-3 gap-2">
                <GlassSkeleton className="h-16 w-full rounded-xl" />
                <GlassSkeleton className="h-16 w-full rounded-xl" />
                <GlassSkeleton className="h-16 w-full rounded-xl" />
              </div>
              <GlassSkeleton className="h-28 w-full rounded-xl" />
              <GlassSkeleton className="h-28 w-full rounded-xl" />
              <GlassSkeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : galatTampil !== null ? (
            <div className="glass-soft mt-1 flex flex-col items-center gap-2 rounded-xl p-5 text-center">
              <AlertTriangle className="h-6 w-6" style={{ color: WARNA_MERAH }} aria-hidden="true" />
              <p className="text-[13px] font-bold text-teks-utama">Data pantau gagal dimuat</p>
              <p className="text-[11.5px] text-teks-sekunder">{galatTampil}</p>
              <button
                type="button"
                onClick={() => setUlang((n) => n + 1)}
                className="glass btn-tekan mt-1 flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold text-teks-utama"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Coba lagi
              </button>
            </div>
          ) : data ? (
            <div className={cn("flex flex-col gap-4 pt-1 transition-opacity", memuat && "opacity-50")}>
              {!data.siap && (
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] leading-relaxed"
                  style={{ background: "rgba(217,119,6,0.16)", color: WARNA_KUNING }}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Fitur pantau belum aktif di database (sql/76 belum dijalankan) — angka di bawah
                    belum bermakna.
                  </span>
                </p>
              )}
              {data.siap && !data.perintah.wajib_posting && (
                <p className="rounded-xl bg-teks-sekunder/10 px-3 py-2 text-[11.5px] text-teks-sekunder">
                  Perintah ini tidak bertanda &ldquo;wajib posting&rdquo;, jadi kepatuhan tidak
                  dihitung.
                </p>
              )}

              {/* Ubin angka */}
              <div className="grid grid-cols-3 gap-2">
                <div className="glass-soft rounded-xl p-2.5 text-center">
                  <p
                    className="font-heading text-[18px] font-extrabold leading-none"
                    style={{ color: WARNA_HIJAU }}
                  >
                    {data.ringkas.selesai}
                    <span className="text-[12px] font-bold text-teks-sekunder">
                      /{data.ringkas.akun}
                    </span>
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">
                    Sudah selesai · {data.ringkas.persen}%
                  </p>
                </div>
                <div className="glass-soft rounded-xl p-2.5 text-center">
                  <p
                    className="font-heading text-[18px] font-extrabold leading-none"
                    style={{ color: WARNA_KUNING }}
                  >
                    {data.ringkas.sebagian}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">Sebagian</p>
                </div>
                <div className="glass-soft rounded-xl p-2.5 text-center">
                  <p
                    className="font-heading text-[18px] font-extrabold leading-none"
                    style={{ color: WARNA_MERAH }}
                  >
                    {data.ringkas.belum}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">Belum</p>
                </div>
              </div>
              <p className="-mt-2 text-[11px] leading-relaxed text-teks-sekunder">
                <b className="text-teks-utama">{data.ringkas.persen}%</b> akun sudah memposting ke
                semua platform yang tersambung di akunnya
                {adalahHariIni ? " hari ini" : ` pada ${tanggalPanjang(data.tanggal)}`}.
              </p>

              {/* Per platform */}
              <section aria-label="Per platform">
                <h3 className="mb-2 font-heading text-[13px] font-bold text-teks-utama">
                  Per platform
                </h3>
                {data.ringkas.per_platform.length === 0 ? (
                  <p className="text-[11.5px] text-teks-sekunder">Belum ada platform tertaut.</p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {data.ringkas.per_platform.map((p) => {
                      const persen = persenBulat(p.sudah, p.wajib);
                      const nama = LABEL_PLATFORM_WAJIB[p.platform] ?? p.platform;
                      return (
                        <li key={p.platform} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2 text-[12px]">
                            <span className="flex min-w-0 items-center gap-1.5 font-bold text-teks-utama">
                              <PlatformIcon platform={p.platform} size={14} />
                              <span className="truncate">{nama}</span>
                            </span>
                            <span className="shrink-0 text-teks-sekunder">
                              {p.sudah}/{p.wajib} · {persen}%
                            </span>
                          </div>
                          <Batang persen={persen} warna={warnaPersen(persen)} label={nama} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Per wilayah */}
              <section aria-label="Per wilayah">
                <h3 className="font-heading text-[13px] font-bold text-teks-utama">Per wilayah</h3>
                <p className="mb-2 text-[10.5px] text-teks-sekunder">
                  Yang paling tertinggal di atas.
                </p>
                {data.ringkas.per_wilayah.length === 0 ? (
                  <p className="text-[11.5px] text-teks-sekunder">Belum ada data wilayah.</p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {data.ringkas.per_wilayah.map((w) => (
                      <li key={w.nama} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="min-w-0 truncate font-bold text-teks-utama">
                            {w.nama}
                          </span>
                          <span className="shrink-0 text-teks-sekunder">
                            {w.selesai}/{w.akun} · {w.persen}%
                          </span>
                        </div>
                        <Batang persen={w.persen} warna={warnaPersen(w.persen)} label={w.nama} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* 7 hari */}
              <section aria-label="Tujuh hari terakhir">
                <h3 className="mb-2 font-heading text-[13px] font-bold text-teks-utama">
                  7 hari terakhir (akun selesai)
                </h3>
                {data.tujuh_hari.length === 0 ? (
                  <p className="text-[11.5px] text-teks-sekunder">Belum ada riwayat.</p>
                ) : (
                  <div
                    className="grid items-end gap-1.5"
                    style={{
                      gridTemplateColumns: `repeat(${data.tujuh_hari.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {data.tujuh_hari.map((h) => {
                      const aktif = h.tanggal === data.tanggal;
                      return (
                        <button
                          key={h.tanggal}
                          type="button"
                          onClick={() =>
                            pilihTanggal(h.tanggal === data.hari_ini ? undefined : h.tanggal)
                          }
                          title={`${tanggalPanjang(h.tanggal)}: ${h.selesai}/${h.akun} selesai (${h.persen}%)`}
                          aria-label={`${tanggalPanjang(h.tanggal)}: ${h.selesai} dari ${h.akun} akun selesai, ${h.persen} persen`}
                          aria-pressed={aktif}
                          className={cn(
                            "btn-tekan flex min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 pb-1 pt-1",
                            aktif && "bg-teks-sekunder/15 ring-1 ring-teks-sekunder/40",
                          )}
                        >
                          <span className="text-[10px] font-bold text-teks-utama">{h.persen}%</span>
                          <span className="flex h-20 w-full items-end" aria-hidden="true">
                            <span
                              className="w-full rounded-t-md transition-[height] duration-300 ease-out"
                              style={{
                                height: `${Math.max(2, Math.min(100, h.persen))}%`,
                                background: warnaPersen(h.persen),
                                opacity: aktif ? 1 : 0.7,
                              }}
                            />
                          </span>
                          <span
                            className={cn(
                              "text-[10px]",
                              aktif ? "font-bold text-teks-utama" : "text-teks-sekunder",
                            )}
                          >
                            {tanggalPendek(h.tanggal)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Daftar akun */}
              <section aria-label="Daftar akun" className="flex flex-col gap-2">
                <h3 className="font-heading text-[13px] font-bold text-teks-utama">
                  Akun{" "}
                  <span className="font-medium text-teks-sekunder">
                    ({daftarTersaring.length} dari {data.daftar.length})
                  </span>
                </h3>
                <div role="group" aria-label="Saring status" className="flex flex-wrap gap-1.5">
                  {DAFTAR_FILTER.map((f) => {
                    const jumlah =
                      f.nilai === "semua"
                        ? data.daftar.length
                        : data.daftar.filter((b) => b.status === f.nilai).length;
                    return (
                      <button
                        key={f.nilai}
                        type="button"
                        aria-pressed={filter === f.nilai}
                        onClick={() => {
                          setFilter(f.nilai);
                          setTampil(HALAMAN);
                        }}
                        className={cn(
                          "btn-tekan h-8 rounded-full px-3 text-[11.5px] font-bold",
                          filter === f.nilai
                            ? "bg-pri text-white"
                            : "glass text-teks-utama",
                        )}
                      >
                        {f.label} ({jumlah})
                      </button>
                    );
                  })}
                </div>
                <label className="glass-input flex h-10 items-center gap-2 rounded-xl px-3">
                  <Search className="h-4 w-4 shrink-0 text-teks-sekunder" aria-hidden="true" />
                  <input
                    type="search"
                    value={cari}
                    onChange={(e) => {
                      setCari(e.target.value);
                      setTampil(HALAMAN);
                    }}
                    placeholder="Cari nama anggota"
                    aria-label="Cari nama anggota"
                    className="min-w-0 flex-1 bg-transparent text-sm text-teks-utama outline-none placeholder:text-teks-sekunder"
                  />
                </label>

                {daftarTersaring.length === 0 ? (
                  <p className="py-3 text-center text-[11.5px] text-teks-sekunder">
                    {data.daftar.length === 0
                      ? "Belum ada akun dengan platform tertaut."
                      : "Tidak ada akun yang cocok."}
                  </p>
                ) : (
                  <>
                    <ul className="flex flex-col gap-1.5">
                      {daftarTersaring.slice(0, tampil).map((b) => (
                        <BarisAkun key={b.user_id} b={b} />
                      ))}
                    </ul>
                    {daftarTersaring.length > tampil && (
                      <button
                        type="button"
                        onClick={() => setTampil((n) => n + HALAMAN)}
                        className="glass btn-tekan h-10 rounded-xl text-[12px] font-bold text-teks-utama"
                      >
                        Tampilkan lebih banyak ({daftarTersaring.length - tampil} lagi)
                      </button>
                    )}
                  </>
                )}
                <p className="text-[10.5px] leading-relaxed text-teks-sekunder">
                  Huruf: T TikTok · I Instagram · Y YouTube · F Facebook · H Threads · X X.
                  Hijau = sudah posting, abu = belum.
                </p>
              </section>
            </div>
          ) : null}
        </div>

        {/* Kaki: tombol ingatkan */}
        <div className="shrink-0 border-t border-glass-border px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => void ingatkan()}
            disabled={!bolehIngatkan || mengingatkan}
            className="btn-tekan flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {mengingatkan ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <BellRing className="h-4 w-4" aria-hidden="true" />
            )}
            {mengingatkan
              ? "Mengirim pengingat…"
              : `Ingatkan yang belum${data && perluDikejar > 0 ? ` (${perluDikejar})` : ""}`}
          </button>
          {alasanNonaktif && (
            <p className="mt-1.5 text-center text-[10.5px] text-teks-sekunder">{alasanNonaktif}</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
