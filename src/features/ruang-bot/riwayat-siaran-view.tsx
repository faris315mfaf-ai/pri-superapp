"use client";

// ============================================================
// RiwayatSiaranView (15 Okt 2026) — Ruang Bot → Koordinator → Riwayat Siaran (master, mode nyata).
//
// Pantau siaran koordinator ke akun anggota: daftar siaran (terbaru dulu), lalu detail satu siaran —
// status, kemajuan, ubin Terkirim/Menunggu/Gagal/Dibatalkan, kendali (Jeda/Lanjutkan, Ulangi yang
// gagal, Batalkan yang belum terkirim), dan tabel per akun.
//
// Disegarkan tiap 10 detik selama ada siaran menunggu/berjalan (lewat useSegarOtomatis: berhenti saat
// tab tersembunyi). Muatan bernomor (respons basi dibuang); satu aksi berjalan sekaligus; unmount aman.
// "Ulangi yang gagal" hanya mengulang item yang PASTI belum terbit (boleh_ulang dari server).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, RefreshCw, RotateCcw, Search, XCircle } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { getRiwayatSiaranKoordinator, kendaliSiaranKoordinator, type AksiSiaran, type SiaranRiwayat } from "@/services";
import { LABEL_MODE, LABEL_SUMBER_VIDEO, adalahMode, adalahSumberVideo } from "@/lib/siaran-koordinator-murni";
import { cn } from "@/lib/utils";

type ItemSiaran = SiaranRiwayat["item"][number];
type Saring = "semua" | "terkirim" | "menunggu" | "gagal";

const RENDER_PER = 100;
const JEDA_SEGAR_DETIK = 10;
/** Tanpa siaran aktif, penyegaran berkala cukup sesekali. */
const SEGAR_DIAM_MS = 60_000;
const JUDUL_BAGIAN = "m-0 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder";
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const SARING: [Saring, string][] = [
  ["semua", "Semua"],
  ["terkirim", "Terkirim"],
  ["menunggu", "Menunggu"],
  ["gagal", "Gagal"],
];
const JUDUL_AKSI: Record<AksiSiaran, string> = {
  jeda: "Siaran dijeda",
  lanjut: "Siaran dilanjutkan",
  batal: "Siaran dibatalkan",
  ulang_gagal: "Kirim ulang yang gagal",
};
const KELAS_LENCANA = {
  hijau: "bg-sukses/15 text-emerald-700 dark:text-emerald-400",
  kuning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  merah: "bg-gagal/15 text-red-700 dark:text-red-400",
  biru: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  abu: "bg-black/10 text-teks-sekunder dark:bg-white/10",
} as const;

const dua = (n: number) => String(n).padStart(2, "0");

/** "16 Okt, 08.00 WIB" (atau "08.00 WIB" bila hari ini). */
function teksWib(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms + 7 * 3600_000);
  const k = new Date(Date.now() + 7 * 3600_000);
  const jam = `${dua(d.getUTCHours())}.${dua(d.getUTCMinutes())} WIB`;
  const hariIni = d.getUTCFullYear() === k.getUTCFullYear() && d.getUTCMonth() === k.getUTCMonth() && d.getUTCDate() === k.getUTCDate();
  return hariIni ? jam : `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}, ${jam}`;
}

const aktif = (s: SiaranRiwayat) => s.status === "menunggu" || s.status === "berjalan";

function lencanaSiaran(s: SiaranRiwayat): { teks: string; kelas: string } {
  if (s.status === "dibatalkan") return { teks: "Dibatalkan", kelas: KELAS_LENCANA.merah };
  if (s.status === "selesai") return { teks: "Selesai", kelas: KELAS_LENCANA.abu };
  if (s.dijeda) return { teks: "Dijeda", kelas: KELAS_LENCANA.kuning };
  if (s.status === "berjalan") return { teks: "Berjalan", kelas: KELAS_LENCANA.hijau };
  if (s.status === "menunggu") return { teks: s.mode === "terjadwal" ? "Terjadwal" : "Menunggu mulai", kelas: KELAS_LENCANA.biru };
  return { teks: s.status || "—", kelas: KELAS_LENCANA.abu };
}

function lencanaItem(i: ItemSiaran): { teks: string; kelas: string } {
  switch (i.status) {
    case "terkirim":
      return { teks: "Terkirim", kelas: KELAS_LENCANA.hijau };
    case "gagal":
      return { teks: "Gagal", kelas: KELAS_LENCANA.merah };
    case "dibatalkan":
      return { teks: "Dibatalkan", kelas: KELAS_LENCANA.abu };
    case "diproses":
      return { teks: "Sedang dikirim", kelas: KELAS_LENCANA.biru };
    case "menunggu":
      return { teks: "Menunggu", kelas: KELAS_LENCANA.kuning };
    default:
      return { teks: i.status || "—", kelas: KELAS_LENCANA.abu };
  }
}

function cocokSaring(i: ItemSiaran, s: Saring): boolean {
  if (s === "semua") return true;
  if (s === "menunggu") return i.status === "menunggu" || i.status === "diproses";
  return i.status === s;
}

function keteranganItem(i: ItemSiaran): string {
  const bagian: string[] = [];
  if (i.pesan) bagian.push(i.pesan);
  else if (i.status === "terkirim") bagian.push(i.selesai_pada ? `Terkirim ${teksWib(i.selesai_pada)}` : "Terkirim");
  else if (i.status === "diproses") bagian.push("Sedang dikirim ke upload-post");
  if (i.status === "gagal") bagian.push(i.boleh_ulang ? "bisa diulang" : "periksa manual — mungkin sudah terposting");
  if (i.varian != null) bagian.push(`variasi ${String.fromCharCode(65 + i.varian)}`);
  return bagian.join(" · ") || "—";
}

export function RiwayatSiaranView() {
  const [daftar, setDaftar] = useState<SiaranRiwayat[] | null>(null);
  const [galat, setGalat] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [pilihId, setPilihId] = useState<string | null>(null);
  const [saring, setSaring] = useState<Saring>("semua");
  const [cari, setCari] = useState("");
  const [batasTampil, setBatasTampil] = useState(RENDER_PER);
  const [sibuk, setSibuk] = useState<AksiSiaran | null>(null);
  const [yakinBatal, setYakinBatal] = useState(false);
  const nomor = useRef(0);
  const hidup = useRef(true);
  const sibukRef = useRef<AksiSiaran | null>(null);
  const terakhirMuat = useRef(0);

  const muat = useCallback(async () => {
    const ini = ++nomor.current;
    terakhirMuat.current = Date.now();
    setMemuat(true);
    try {
      const d = await getRiwayatSiaranKoordinator();
      // Hasil basi, atau tiba saat aksi berjalan, dibuang agar tidak menimpa keadaan terbaru.
      if (ini !== nomor.current || !hidup.current || sibukRef.current) return;
      setDaftar(d);
      setGalat("");
    } catch (e) {
      if (ini !== nomor.current || !hidup.current) return;
      setGalat(e instanceof Error ? e.message : "Gagal memuat riwayat siaran.");
    } finally {
      if (ini === nomor.current && hidup.current) setMemuat(false);
    }
  }, []);

  useEffect(() => {
    hidup.current = true;
    return () => {
      hidup.current = false;
    };
  }, []);
  // Muatan awal (ditunda satu tick: tanpa setState sinkron di effect).
  useEffect(() => {
    void Promise.resolve().then(muat);
  }, [muat]);

  const adaAktif = (daftar ?? []).some(aktif);
  useSegarOtomatis(() => {
    if (adaAktif || Date.now() - terakhirMuat.current > SEGAR_DIAM_MS) void muat();
  }, JEDA_SEGAR_DETIK);

  const kendali = useCallback(
    async (id: string, aksi: AksiSiaran) => {
      if (sibukRef.current) return;
      sibukRef.current = aksi;
      setSibuk(aksi);
      setYakinBatal(false);
      try {
        const r = await kendaliSiaranKoordinator(id, aksi);
        toast(r.ok ? "sukses" : "peringatan", JUDUL_AKSI[aksi], r.pesan);
      } catch (e) {
        toast("error", "Aksi gagal", e instanceof Error ? e.message : "");
      } finally {
        sibukRef.current = null;
        if (hidup.current) setSibuk(null);
        void muat();
      }
    },
    [muat],
  );

  function pilih(id: string) {
    setPilihId(id);
    setSaring("semua");
    setCari("");
    setBatasTampil(RENDER_PER);
    setYakinBatal(false);
  }

  if (daftar === null) {
    return galat ? (
      <GlassCard className="p-6 text-center text-sm text-teks-sekunder">
        Riwayat siaran gagal dimuat: {galat}{" "}
        <button type="button" onClick={() => void muat()} className="btn-tekan font-bold text-pri underline">
          Coba lagi
        </button>
      </GlassCard>
    ) : (
      <GlassSkeleton className="h-64 rounded-2xl" />
    );
  }

  if (daftar.length === 0) {
    return (
      <GlassCard className="p-6 text-center">
        <p className="m-0 text-sm font-bold text-teks-utama">Belum ada siaran koordinator.</p>
        <p className="m-0 mt-1 text-[12.5px] text-teks-sekunder">Siaran yang Anda buat di tab Siaran Anggota akan muncul di sini beserta status tiap akun.</p>
      </GlassCard>
    );
  }

  const s = daftar.find((x) => x.id === pilihId) ?? daftar[0]!;
  const lencana = lencanaSiaran(s);
  const berakhir = s.status === "selesai" || s.status === "dibatalkan";
  const nUlang = s.item.filter((i) => i.boleh_ulang).length;
  const total = s.ringkas.total;
  const persen = total > 0 ? Math.round((s.ringkas.terkirim / total) * 100) : 0;
  const q = cari.trim().toLowerCase();
  const hitung: Record<Saring, number> = {
    semua: s.item.length,
    terkirim: s.item.filter((i) => cocokSaring(i, "terkirim")).length,
    menunggu: s.item.filter((i) => cocokSaring(i, "menunggu")).length,
    gagal: s.item.filter((i) => cocokSaring(i, "gagal")).length,
  };
  const baris = s.item.filter((i) => cocokSaring(i, saring) && (!q || i.nama.toLowerCase().includes(q)));
  const labelMode = adalahMode(s.mode) ? LABEL_MODE[s.mode] : s.mode || "—";
  const labelSumber = adalahSumberVideo(s.sumber_video) ? LABEL_SUMBER_VIDEO[s.sumber_video] : "";
  const meta = [
    `Siaran #${s.id}`,
    s.kategori ? `${s.kategori}${s.perintah_id ? ` (Video Wajib #${s.perintah_id})` : ""}` : s.perintah_id ? `Video Wajib #${s.perintah_id}` : "",
    `${labelMode.toLowerCase()}${s.mode !== "serentak" && s.jeda_detik > 0 ? `, jeda ±${s.jeda_detik} dtk` : ""}`,
    labelSumber ? `video dari ${labelSumber}` : "",
    `dibuat ${teksWib(s.dibuat_pada)}`,
    s.tampil_ruang ? "tampil di Ruang Bot" : "",
  ].filter(Boolean);
  const ketMenunggu = s.dijeda && !berakhir ? "dijeda" : s.berikutnya ? `berikutnya ${teksWib(s.berikutnya)}` : "";

  const ubin = [
    { label: "Terkirim", nilai: s.ringkas.terkirim, ket: total ? `${persen}% dari ${total} akun` : "", warna: "text-emerald-700 dark:text-emerald-400" },
    { label: "Menunggu giliran", nilai: s.ringkas.menunggu, ket: ketMenunggu, warna: "text-teks-utama" },
    { label: "Gagal", nilai: s.ringkas.gagal, ket: s.ringkas.gagal ? `${nUlang} bisa diulang` : "", warna: s.ringkas.gagal ? "text-red-600 dark:text-red-400" : "text-teks-utama" },
    { label: "Dibatalkan", nilai: s.ringkas.dibatalkan, ket: "", warna: "text-teks-utama" },
  ];

  return (
    <div className="grid gap-3.5 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Daftar siaran */}
      <aside className="min-w-0" aria-label="Daftar siaran">
        <GlassCard className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className={JUDUL_BAGIAN}>Siaran terakhir</h2>
            <button
              type="button"
              onClick={() => void muat()}
              disabled={memuat}
              aria-label="Muat ulang riwayat siaran"
              className="btn-tekan flex h-9 w-9 items-center justify-center rounded-lg text-teks-sekunder disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", memuat && "animate-spin")} />
            </button>
          </div>
          {galat && <p className="m-0 mb-2 text-[11px] text-red-600 dark:text-red-400">Pembaruan terakhir gagal: {galat}</p>}
          <ul className="m-0 flex list-none gap-1.5 overflow-x-auto p-0 pb-1 lg:max-h-[640px] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0">
            {daftar.map((x) => {
              const l = lencanaSiaran(x);
              const kini = x.id === s.id;
              return (
                <li key={x.id} className="w-[220px] shrink-0 lg:w-auto">
                  <button
                    type="button"
                    onClick={() => pilih(x.id)}
                    aria-current={kini ? "true" : undefined}
                    className={cn("btn-tekan w-full rounded-xl border px-3 py-2 text-left", kini ? "border-2 border-pri/70 bg-pri/[0.06]" : "border-glass-border")}
                  >
                    <span className="block truncate text-[12.5px] font-bold text-teks-utama">{x.judul || `Siaran #${x.id}`}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-teks-sekunder">
                      <span className={cn("rounded-full px-2 py-px font-bold", l.kelas)}>{l.teks}</span>
                      <span className="tabular-nums">
                        {x.ringkas.terkirim}/{x.ringkas.total}
                      </span>
                      <span>· {teksWib(x.dibuat_pada)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </GlassCard>
      </aside>

      {/* Detail siaran */}
      <section className="min-w-0 space-y-3" aria-label={`Detail siaran ${s.judul}`}>
        <GlassCard className="p-3.5 sm:p-4">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 break-words font-heading text-[17px] font-bold leading-snug text-teks-utama">{s.judul || `Siaran #${s.id}`}</h2>
              <p className="m-0 mt-0.5 text-[11.5px] leading-relaxed text-teks-sekunder">{meta.join(" · ")}</p>
              {s.platforms.length > 0 && (
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label={`Platform: ${s.platforms.map(labelPlatform).join(", ")}`}>
                  {s.platforms.map((p) => (
                    <span key={p} title={labelPlatform(p)} className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-glass-border">
                      <PlatformIcon platform={p} size={13} />
                    </span>
                  ))}
                </span>
              )}
            </div>
            <span className={cn("shrink-0 rounded-full px-3 py-1 text-[12px] font-extrabold", lencana.kelas)}>{lencana.teks}</span>
          </div>

          <div className="mt-3 flex items-center gap-2.5">
            <div
              className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
              role="progressbar"
              aria-label="Kemajuan siaran"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={s.ringkas.terkirim}
            >
              <div className="h-full rounded-full bg-sukses transition-[width] duration-500" style={{ width: `${persen}%` }} />
            </div>
            <span className="shrink-0 text-[12px] font-bold tabular-nums text-teks-utama">
              {s.ringkas.terkirim} / {total} akun
            </span>
          </div>

          {(!berakhir || s.ringkas.gagal > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!berakhir && (
                <button
                  type="button"
                  onClick={() => void kendali(s.id, s.dijeda ? "lanjut" : "jeda")}
                  disabled={!!sibuk}
                  className="btn-tekan inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-glass-border px-3.5 text-[12.5px] font-bold text-teks-utama disabled:opacity-50 sm:min-h-10"
                >
                  {sibuk === "jeda" || sibuk === "lanjut" ? <Loader2 className="h-4 w-4 animate-spin" /> : s.dijeda ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {s.dijeda ? "Lanjutkan" : "Jeda siaran"}
                </button>
              )}
              {s.ringkas.gagal > 0 && s.status !== "dibatalkan" && (
                <button
                  type="button"
                  onClick={() => void kendali(s.id, "ulang_gagal")}
                  disabled={!!sibuk || nUlang === 0}
                  title={nUlang === 0 ? "Semua yang gagal mungkin sudah terposting — periksa manual" : undefined}
                  className="btn-tekan inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-glass-border px-3.5 text-[12.5px] font-bold text-teks-utama disabled:opacity-50 sm:min-h-10"
                >
                  {sibuk === "ulang_gagal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Ulangi yang gagal ({nUlang})
                </button>
              )}
              {!berakhir &&
                s.ringkas.menunggu > 0 &&
                (yakinBatal ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void kendali(s.id, "batal")}
                      disabled={!!sibuk}
                      className="btn-tekan inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-gagal px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50 sm:min-h-10"
                    >
                      {sibuk === "batal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Ya, batalkan {s.ringkas.menunggu} akun
                    </button>
                    <button
                      type="button"
                      onClick={() => setYakinBatal(false)}
                      disabled={!!sibuk}
                      className="btn-tekan min-h-11 rounded-xl px-3 text-[12.5px] font-bold text-teks-sekunder disabled:opacity-50 sm:min-h-10"
                    >
                      Tidak
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setYakinBatal(true)}
                    disabled={!!sibuk}
                    className="btn-tekan inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gagal/50 px-3.5 text-[12.5px] font-bold text-red-600 disabled:opacity-50 dark:text-red-400 sm:min-h-10"
                  >
                    <XCircle className="h-4 w-4" /> Batalkan yang belum terkirim
                  </button>
                ))}
            </div>
          )}
          {yakinBatal && !berakhir && (
            <p role="status" className="m-0 mt-2 text-[11.5px] leading-relaxed text-teks-sekunder">
              {s.ringkas.menunggu} akun yang belum terkirim akan dibatalkan dan siaran berakhir. Yang sedang dikirim tetap selesai.
            </p>
          )}
          <p className="m-0 mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">Yang sudah terbit tidak bisa ditarik dari sini; pemiliknya bisa menghapus di sosmednya.</p>
        </GlassCard>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {ubin.map((u) => (
            <GlassCard key={u.label} className="min-w-0 p-3">
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-teks-sekunder">{u.label}</span>
              <span className={cn("block font-heading text-[24px] font-extrabold leading-tight tabular-nums", u.warna)}>{u.nilai}</span>
              {u.ket && <span className="block break-words text-[10.5px] text-teks-sekunder">{u.ket}</span>}
            </GlassCard>
          ))}
        </div>

        <GlassCard className="p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={cn(JUDUL_BAGIAN, "mr-auto")}>Per akun</h2>
            <div role="group" aria-label="Saring status" className="flex flex-wrap gap-1.5">
              {SARING.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={saring === k}
                  onClick={() => {
                    setSaring(k);
                    setBatasTampil(RENDER_PER);
                  }}
                  className={cn(
                    "btn-tekan min-h-9 rounded-full border px-3 text-[12px] font-bold",
                    saring === k ? "border-teks-utama bg-teks-utama text-white dark:text-black" : "border-glass-border text-teks-sekunder",
                  )}
                >
                  {label} <span className="tabular-nums opacity-70">{hitung[k]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="relative mt-2.5">
            <label htmlFor="rs-cari" className="sr-only">
              Cari nama anggota
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teks-sekunder" aria-hidden="true" />
            <input
              id="rs-cari"
              value={cari}
              onChange={(e) => {
                setCari(e.target.value);
                setBatasTampil(RENDER_PER);
              }}
              placeholder="Cari nama anggota"
              className="glass-input h-11 w-full rounded-xl pl-9 pr-3 text-base text-teks-utama sm:text-[13px]"
            />
          </div>

          {baris.length === 0 ? (
            <p className="m-0 mt-3 rounded-xl border border-dashed border-glass-border p-4 text-center text-[12.5px] text-teks-sekunder">
              {s.item.length === 0 ? "Siaran ini tidak punya daftar akun." : "Tidak ada akun yang cocok dengan saringan ini."}
            </p>
          ) : (
            <>
              <div className="mt-3 overflow-x-auto rounded-xl border border-glass-border">
                <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="bg-black/[0.03] text-[10.5px] uppercase tracking-[0.06em] text-teks-sekunder dark:bg-white/[0.04]">
                      <th scope="col" className="px-3 py-2 font-bold">Anggota</th>
                      <th scope="col" className="px-2 py-2 font-bold">Giliran</th>
                      <th scope="col" className="px-2 py-2 font-bold">Platform</th>
                      <th scope="col" className="px-2 py-2 font-bold">Status</th>
                      <th scope="col" className="px-2 py-2 font-bold">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baris.slice(0, batasTampil).map((i) => {
                      const l = lencanaItem(i);
                      const gagalAmbigu = i.status === "gagal" && !i.boleh_ulang;
                      return (
                        <tr key={i.id} className={cn("border-t border-glass-border align-top", i.status === "dibatalkan" && "text-teks-sekunder opacity-75")}>
                          <td className="max-w-[200px] px-3 py-2">
                            <span className="block truncate font-bold text-teks-utama">{i.nama || (i.user_id ? `Akun #${i.user_id}` : "—")}</span>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 tabular-nums">{teksWib(i.jadwal_kirim)}</td>
                          <td className="px-2 py-2">
                            <span className="flex flex-wrap gap-1">
                              {i.platforms.map((p) => (
                                <span key={p} title={labelPlatform(p)} className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-glass-border">
                                  <PlatformIcon platform={p} size={13} />
                                  <span className="sr-only">{labelPlatform(p)}</span>
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold", l.kelas)}>{l.teks}</span>
                          </td>
                          <td className={cn("min-w-[200px] break-words px-2 py-2 leading-relaxed", gagalAmbigu ? "text-red-600 dark:text-red-400" : "text-teks-sekunder")}>
                            {keteranganItem(i)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {baris.length > batasTampil && (
                <button
                  type="button"
                  onClick={() => setBatasTampil((n) => n + RENDER_PER)}
                  className="btn-tekan mt-2 min-h-10 w-full rounded-xl border border-glass-border text-[12px] font-bold text-teks-utama"
                >
                  Tampilkan lebih banyak ({baris.length - batasTampil} lagi)
                </button>
              )}
            </>
          )}
          <p className="m-0 mt-2.5 text-[10.5px] leading-relaxed text-teks-sekunder">
            {adaAktif ? `Status dicek ulang tiap ${JEDA_SEGAR_DETIK} detik selama ada siaran berjalan. ` : ""}
            “Ulangi yang gagal” hanya mengirim ulang akun yang pasti belum terposting; sisanya perlu diperiksa manual di sosmed anggota.
            {s.perintah_id ? ` Posting yang terbit terhitung pada perintah #${s.perintah_id} (Pantau Video Wajib & Insight).` : ""}
          </p>
        </GlassCard>
      </section>
    </div>
  );
}
