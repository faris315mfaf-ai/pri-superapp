"use client";

// ============================================================
// AnalisisVideoScreen (29 Sep 2026) — halaman penuh di TV Rakyat Nasional.
//
// "Grafik di dalam aplikasi: tren, akun terbaik, platform terbaik, jam
// posting terbaik" (pilihan user). Sumbernya seluruh katalog video akun
// tersambung upload-post (±110 ribu video), diringkas di server
// (lib/analisis-video) — layar ini hanya menerima hasilnya.
//
// Angka (tayangan dst.) hanya dari video yang SUDAH ditarik angkanya;
// cakupannya selalu tampil supaya tidak ada yang mengira "rata-rata
// turun" padahal angkanya belum masuk.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowLeft, BarChart3, Clock, ExternalLink, Flame, Loader2, RefreshCw, Trophy, X } from "lucide-react";
import { ThemeToggle, EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon } from "@/components/platform-icon";
import { formatAngkaRingkas, sejakRingkas } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useIntervalAktif } from "@/hooks/use-tab-aktif";
import { getAnalisisVideo, type DataAnalisisVideo, type RentangAnalisis } from "@/services";

type Data = Extract<DataAnalisisVideo, { dimuat_pada: string }>;
type Akun = Data["akun_teratas"][number];
type Sel = Data["jam"][number];

const LABEL_PLATFORM: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};
const PLATFORM_PILIHAN = ["tiktok", "instagram", "youtube", "facebook", "threads", "twitter"];
const RENTANG: { nilai: RentangAnalisis; label: string }[] = [
  { nilai: "7", label: "7 Hari" },
  { nilai: "30", label: "30 Hari" },
  { nilai: "90", label: "90 Hari" },
  { nilai: "semua", label: "Semua" },
];
const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
/** Baris peta jam: Senin di atas, Minggu di bawah. */
const URUT_HARI = [1, 2, 3, 4, 5, 6, 0];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MIN_SEL = 5;
const UNGU = "#7C3AED";

function persenId(n: number): string {
  return `${n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",")}%`;
}
function tglPendek(t: string): string {
  const d = new Date(`${t}T00:00:00Z`);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`;
}
function blnTahun(t: string): string {
  const d = new Date(`${t}T00:00:00Z`);
  return `${BULAN[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}
function tglPanjang(t: string): string {
  const d = new Date(`${t}T00:00:00Z`);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function jamRentang(jam: number): string {
  const d = (n: number) => String(n % 24).padStart(2, "0");
  return `${d(jam)}.00–${d(jam + 1)}.00`;
}

export function AnalisisVideoScreen({ onKembali }: { onKembali: () => void }) {
  const [rentang, setRentang] = useState<RentangAnalisis>("30");
  const [platform, setPlatform] = useState("");
  const [akun, setAkun] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [menyusun, setMenyusun] = useState(false);
  const [galat, setGalat] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [muat, setMuat] = useState(0);

  useEffect(() => {
    let hidup = true;
    let ulang: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      setMemuat(true);
      setGalat("");
      try {
        const d = await getAnalisisVideo({ rentang, platform: platform || undefined, akun: akun || undefined });
        if (!hidup) return;
        if (!("dimuat_pada" in d)) {
          // Katalog pertama kali disusun (±110 ribu video) — coba lagi sebentar lagi.
          setMenyusun(true);
          ulang = setTimeout(() => setMuat((n) => n + 1), 4000);
          return;
        }
        setData(d);
        setMenyusun(d.menyusun);
        // Hasil lama sementara yang baru disusun di latar → ambil lagi nanti.
        if (d.menyusun) ulang = setTimeout(() => setMuat((n) => n + 1), 20_000);
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat analisis.");
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
      clearTimeout(ulang);
    };
  }, [rentang, platform, akun, muat]);

  // Katalog disusun ulang tiap 30 menit; cek tiap 5 menit selama terbuka.
  useIntervalAktif(() => setMuat((n) => n + 1), 300_000);

  const cocok = data && data.rentang === rentang && data.platform === platform && data.akun === akun;
  const tampil = cocok ? data : null;
  const infoAkun = useMemo(() => {
    if (!akun || !tampil) return null;
    const a = tampil.akun_teratas.find((x) => x.kunci === akun);
    const uid = akun.split("|")[0];
    return { nama: tampil.nama[uid] ?? "", username: a?.username ?? "", platform: akun.split("|")[1] ?? "" };
  }, [akun, tampil]);

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <header className="flex items-center gap-3 pt-5">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-teks-utama">Analisis Video</h1>
          <p className="truncate text-xs text-teks-sekunder">Semua akun upload-post</p>
        </div>
        <button
          type="button"
          onClick={() => setMuat((n) => n + 1)}
          aria-label="Muat ulang"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-teks-utama"
        >
          <RefreshCw className={cn("h-4 w-4", memuat && "animate-spin")} aria-hidden="true" />
        </button>
        <ThemeToggle />
      </header>

      {/* Saringan */}
      <div className="mt-4 grid grid-cols-4 gap-1.5">
        {RENTANG.map((r) => (
          <button
            key={r.nilai}
            type="button"
            onClick={() => setRentang(r.nilai)}
            aria-pressed={rentang === r.nilai}
            className={cn(
              "btn-tekan rounded-full py-1.5 text-[12px] font-bold transition-colors",
              rentang === r.nilai ? "bg-pri text-white" : "glass text-teks-sekunder",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      {!akun && (
        <div className="scrollbar-tipis -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {["", ...PLATFORM_PILIHAN].map((p) => (
            <button
              key={p || "semua"}
              type="button"
              onClick={() => setPlatform(p)}
              aria-pressed={platform === p}
              className={cn(
                "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
                platform === p ? "bg-teks-utama text-white dark:text-slate-900" : "glass text-teks-sekunder",
              )}
            >
              {p && <PlatformIcon platform={p} size={13} />}
              {p ? LABEL_PLATFORM[p] : "Semua platform"}
            </button>
          ))}
        </div>
      )}
      {akun && (
        <div className="glass-soft mt-2 flex items-center gap-2.5 rounded-2xl px-3 py-2">
          <PlatformIcon platform={infoAkun?.platform ?? ""} size={16} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-teks-utama">{infoAkun?.nama || "Akun terpilih"}</p>
            <p className="truncate text-[11px] text-teks-sekunder">
              {infoAkun?.username ? `@${infoAkun.username}` : ""} · {LABEL_PLATFORM[infoAkun?.platform ?? ""] ?? ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAkun("")}
            className="glass btn-tekan flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-teks-utama"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Semua akun
          </button>
        </div>
      )}

      {galat && !tampil && (
        <GlassCard className="mt-4 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-pri">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {galat}
          </p>
          <button
            type="button"
            onClick={() => setMuat((n) => n + 1)}
            className="glass btn-tekan mt-3 rounded-full px-3.5 py-1.5 text-[12px] font-bold text-teks-utama"
          >
            Coba lagi
          </button>
        </GlassCard>
      )}

      {!tampil && !galat && (
        <div className="mt-4 space-y-3">
          {menyusun && (
            <p className="flex items-center gap-2 text-[12px] font-semibold text-teks-sekunder">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Menyusun analisis dari seluruh katalog video… (sekitar setengah menit)
            </p>
          )}
          <GlassSkeleton className="h-28 rounded-3xl" />
          <GlassSkeleton className="h-56 rounded-3xl" />
          <GlassSkeleton className="h-64 rounded-3xl" />
        </div>
      )}

      {tampil && (
        <IsiAnalisis
          d={tampil}
          memperbarui={menyusun}
          onPilihAkun={(k) => {
            setAkun(k);
            setPlatform("");
          }}
          onPilihPlatform={setPlatform}
        />
      )}
    </div>
  );
}

function IsiAnalisis({
  d,
  memperbarui,
  onPilihAkun,
  onPilihPlatform,
}: {
  d: Data;
  memperbarui: boolean;
  onPilihAkun: (kunci: string) => void;
  onPilihPlatform: (p: string) => void;
}) {
  const r = d.ringkas;
  const cakupan = r.video > 0 ? Math.round((r.berangka / r.video) * 100) : 0;
  return (
    <>
      <p className="mt-3 text-[11px] text-teks-sekunder">
        {tglPanjang(d.dari)} – {tglPanjang(d.sampai)} · {formatAngkaRingkas(d.jumlah_akun)} akun
        {memperbarui ? " · memperbarui…" : ` · diperbarui ${sejakRingkas(d.dimuat_pada)}`}
      </p>

      {/* Angka utama */}
      <GlassCard className="mt-2 p-4">
        <div className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-3">
          <Angka label="Video" nilai={formatAngkaRingkas(r.video)} />
          <Angka label="Tayangan" nilai={formatAngkaRingkas(r.tayangan)} tebal />
          <Angka label="Rata-rata / video" nilai={formatAngkaRingkas(r.rata_tayangan)} />
          <Angka label="Median / video" nilai={formatAngkaRingkas(r.median_tayangan)} />
          <Angka label="Interaksi" nilai={formatAngkaRingkas(r.suka + r.komentar + r.bagikan)} />
          <Angka label="Tingkat interaksi" nilai={persenId(r.er)} />
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-teks-sekunder">Video yang sudah ada angkanya</span>
            <span className="angka-tab font-bold text-teks-utama">
              {formatAngkaRingkas(r.berangka)} / {formatAngkaRingkas(r.video)} ({cakupan}%)
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div className="h-full rounded-full bg-pri transition-[width] duration-500" style={{ width: `${cakupan}%` }} />
          </div>
          {cakupan < 90 && r.video > 0 && (
            <p className="mt-1.5 text-[10.5px] text-teks-sekunder">
              Sisanya masih antre ditarik robot. Rata-rata dihitung dari video yang sudah berangka saja.
            </p>
          )}
        </div>
      </GlassCard>

      <KartuTren d={d} />
      {!d.akun && !d.platform && d.per_platform.length > 1 && <KartuPlatform d={d} onPilih={onPilihPlatform} />}
      {!d.akun && <KartuAkun d={d} onPilih={onPilihAkun} />}
      <KartuJam d={d} />
      <KartuVideo d={d} />
    </>
  );
}

function Angka({ label, nilai, tebal }: { label: string; nilai: string; tebal?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10.5px] font-semibold tracking-wide text-teks-sekunder uppercase">{label}</p>
      <p className={cn("angka-tab font-heading leading-tight font-extrabold", tebal ? "text-2xl text-pri" : "text-xl text-teks-utama")}>
        {nilai}
      </p>
    </div>
  );
}

function JudulKartu({ ikon: Ikon, warna, judul, sub }: { ikon: typeof Trophy; warna: string; judul: string; sub: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: warna }} aria-hidden="true">
        <Ikon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h2 className="font-heading text-[15px] font-bold text-teks-utama">{judul}</h2>
        <p className="mt-0.5 text-[11px] text-teks-sekunder">{sub}</p>
      </div>
    </div>
  );
}

type TooltipTrenProps = {
  active?: boolean;
  payload?: { payload?: Data["tren"][number] }[];
  satuan: Data["satuan_tren"];
};
function labelTitik(t: string, satuan: Data["satuan_tren"]): string {
  if (satuan === "bulan") {
    const d = new Date(`${t}T00:00:00Z`);
    return `${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return satuan === "pekan" ? `Pekan ${tglPanjang(t)}` : tglPanjang(t);
}
function TooltipTren({ active, payload, satuan }: TooltipTrenProps) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="glass-strong rounded-xl px-3 py-2">
      <p className="text-[10.5px] font-semibold text-teks-sekunder">{labelTitik(p.t, satuan)}</p>
      <p className="angka-tab font-heading text-sm font-extrabold" style={{ color: UNGU }}>
        {formatAngkaRingkas(p.tayangan)} tayangan
      </p>
      <p className="angka-tab text-[11px] font-semibold text-teks-utama">
        {p.video} video{p.berangka < p.video ? ` (${p.berangka} berangka)` : ""}
      </p>
    </div>
  );
}

function KartuTren({ d }: { d: Data }) {
  const satuan = d.satuan_tren;
  const kosong = d.tren.every((p) => p.video === 0);
  return (
    <GlassCard className="mt-4 p-4">
      <JudulKartu
        ikon={BarChart3}
        warna={`linear-gradient(135deg, ${UNGU}, #5B21B6)`}
        judul="Tren"
        sub={`Tayangan & jumlah video terbit per ${satuan}`}
      />
      {!kosong && (
        <div className="mt-2 flex items-center gap-3 text-[10.5px] font-semibold text-teks-sekunder">
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full" style={{ background: UNGU }} aria-hidden="true" /> Tayangan (skala kiri)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2 rounded-[2px]" style={{ background: "rgba(249, 115, 22, 0.45)" }} aria-hidden="true" /> Jumlah video
          </span>
        </div>
      )}
      {kosong ? (
        <EmptyState ikon={BarChart3} judul="Belum ada video" keterangan="Tidak ada video terbit di rentang ini." className="py-6" />
      ) : (
        <div className="mt-3 -ml-2">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={d.tren} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradAnalisis" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={UNGU} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={UNGU} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="rgba(148, 163, 184, 0.2)" />
              <XAxis
                dataKey="t"
                tickFormatter={satuan === "bulan" ? blnTahun : tglPendek}
                axisLine={false}
                tickLine={false}
                tickMargin={6}
                minTickGap={24}
                tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
              />
              <YAxis
                yAxisId="tayangan"
                tickFormatter={(v: number) => formatAngkaRingkas(v)}
                axisLine={false}
                tickLine={false}
                width={40}
                tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
              />
              {/* Batang jumlah video di sepertiga bawah: skalanya lain dengan
                  tayangan, jadi jangan sampai terbaca sebagai tayangan. */}
              <YAxis yAxisId="video" orientation="right" hide domain={[0, (maks: number) => Math.max(1, maks * 3)]} />
              <Tooltip content={<TooltipTren satuan={satuan} />} cursor={{ fill: "rgba(124, 58, 237, 0.06)" }} />
              <Bar yAxisId="video" dataKey="video" fill="rgba(249, 115, 22, 0.45)" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Area
                yAxisId="tayangan"
                type="monotone"
                dataKey="tayangan"
                stroke={UNGU}
                strokeWidth={2.25}
                fill="url(#gradAnalisis)"
                activeDot={{ r: 4, stroke: "#FFFFFF", strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

function KartuPlatform({ d, onPilih }: { d: Data; onPilih: (p: string) => void }) {
  const maks = Math.max(1, ...d.per_platform.map((p) => p.rata_tayangan));
  const terbaik = [...d.per_platform].filter((p) => p.berangka >= MIN_SEL).sort((a, b) => b.rata_tayangan - a.rata_tayangan)[0];
  return (
    <GlassCard className="mt-4 p-4">
      <JudulKartu
        ikon={Flame}
        warna="linear-gradient(135deg, #F97316, #C2410C)"
        judul="Platform"
        sub={terbaik ? `Rata-rata tayangan tertinggi: ${LABEL_PLATFORM[terbaik.platform] ?? terbaik.platform}` : "Rata-rata tayangan per video"}
      />
      <ul className="mt-3 space-y-2.5">
        {d.per_platform.map((p) => (
          <li key={p.platform}>
            <button type="button" onClick={() => onPilih(p.platform)} className="btn-tekan w-full text-left">
              <div className="flex items-center gap-2">
                <PlatformIcon platform={p.platform} size={15} />
                <span className="flex-1 text-[12.5px] font-bold text-teks-utama">{LABEL_PLATFORM[p.platform] ?? p.platform}</span>
                <span className="angka-tab text-[12.5px] font-extrabold text-teks-utama">{formatAngkaRingkas(p.rata_tayangan)}</span>
                <span className="w-12 text-right text-[10.5px] text-teks-sekunder">/video</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(2, (p.rata_tayangan / maks) * 100)}%`, background: "linear-gradient(90deg, #F97316, #DC2626)" }}
                />
              </div>
              <p className="mt-1 text-[10.5px] text-teks-sekunder">
                {formatAngkaRingkas(p.video)} video · {formatAngkaRingkas(p.tayangan)} tayangan · interaksi {persenId(p.er)}
                {p.berangka < p.video ? ` · ${Math.round((p.berangka / Math.max(1, p.video)) * 100)}% berangka` : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

type UrutAkun = "tayangan" | "video" | "er";
const URUT_AKUN: { nilai: UrutAkun; label: string }[] = [
  { nilai: "tayangan", label: "Tayangan" },
  { nilai: "video", label: "Paling rajin" },
  { nilai: "er", label: "Interaksi" },
];

function KartuAkun({ d, onPilih }: { d: Data; onPilih: (kunci: string) => void }) {
  const [urut, setUrut] = useState<UrutAkun>("tayangan");
  const daftar = useMemo(() => {
    const l = urut === "er" ? d.akun_teratas.filter((a) => a.berangka >= MIN_SEL) : [...d.akun_teratas];
    const nilai = (a: Akun) => (urut === "tayangan" ? a.tayangan : urut === "video" ? a.video : a.er);
    return l.sort((x, y) => nilai(y) - nilai(x) || y.tayangan - x.tayangan).slice(0, 10);
  }, [d.akun_teratas, urut]);
  return (
    <GlassCard className="mt-4 p-4">
      <JudulKartu
        ikon={Trophy}
        warna="linear-gradient(135deg, #EAB308, #CA8A04)"
        judul="Akun Terbaik"
        sub={`10 teratas dari ${formatAngkaRingkas(d.jumlah_akun)} akun · ketuk untuk melihat analisis akun itu`}
      />
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {URUT_AKUN.map((u) => (
          <button
            key={u.nilai}
            type="button"
            onClick={() => setUrut(u.nilai)}
            aria-pressed={urut === u.nilai}
            className={cn(
              "btn-tekan rounded-full py-1.5 text-[11.5px] font-bold transition-colors",
              urut === u.nilai ? "bg-teks-utama text-white dark:text-slate-900" : "glass text-teks-sekunder",
            )}
          >
            {u.label}
          </button>
        ))}
      </div>
      {daftar.length === 0 ? (
        <p className="mt-3 text-[12px] text-teks-sekunder">Belum ada akun dengan cukup data.</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {daftar.map((a, i) => (
            <li key={a.kunci}>
              <button
                type="button"
                onClick={() => onPilih(a.kunci)}
                className="glass-soft btn-tekan flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left"
              >
                <span
                  className={cn(
                    "angka-tab flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                    i === 0 ? "bg-yellow-400 text-black" : i === 1 ? "bg-slate-300 text-black" : i === 2 ? "bg-amber-600 text-white" : "text-teks-sekunder",
                  )}
                >
                  {i + 1}
                </span>
                <PlatformIcon platform={a.platform} size={15} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-teks-utama">{d.nama[a.user_id] || `@${a.username}`}</p>
                  <p className="truncate text-[10.5px] text-teks-sekunder">
                    {a.username ? `@${a.username} · ` : ""}
                    {a.video} video · rata {formatAngkaRingkas(a.rata_tayangan)}
                  </p>
                </div>
                <span className="angka-tab shrink-0 text-[13px] font-extrabold text-teks-utama">
                  {urut === "tayangan" ? formatAngkaRingkas(a.tayangan) : urut === "video" ? a.video : persenId(a.er)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </GlassCard>
  );
}

function KartuJam({ d }: { d: Data }) {
  const [pilih, setPilih] = useState<Sel | null>(null);
  const minSel = d.min_video_sel;
  const peta = useMemo(() => new Map(d.jam.map((s) => [s.hari * 24 + s.jam, s])), [d.jam]);
  // Warna menurut PERINGKAT median (bukan besarnya): satu jam viral tidak
  // membuat sel lain semua tampak sama pucat.
  const peringkat = useMemo(() => {
    const layak = d.jam.filter((s) => s.video >= minSel).sort((a, b) => a.median - b.median);
    const m = new Map<number, number>();
    layak.forEach((s, i) => m.set(s.hari * 24 + s.jam, layak.length > 1 ? i / (layak.length - 1) : 1));
    return m;
  }, [d.jam, minSel]);
  const terbaik = d.jam_terbaik[0];
  const warna = (s: Sel | undefined) => {
    if (!s) return "transparent";
    const r = peringkat.get(s.hari * 24 + s.jam);
    if (r === undefined) return "rgba(148, 163, 184, 0.18)";
    return `rgba(124, 58, 237, ${(0.1 + 0.9 * r * r).toFixed(3)})`;
  };
  return (
    <GlassCard className="mt-4 p-4">
      <JudulKartu
        ikon={Clock}
        warna="linear-gradient(135deg, #0EA5E9, #0369A1)"
        judul="Jam Posting Terbaik"
        sub="Median tayangan menurut hari & jam terbit (WIB)"
      />
      {terbaik ? (
        <div className="glass-soft mt-3 rounded-2xl px-3 py-2.5">
          <p className="text-[12.5px] font-bold text-teks-utama">
            {NAMA_HARI[terbaik.hari]}, pukul {jamRentang(terbaik.jam)}
          </p>
          <p className="text-[11px] text-teks-sekunder">
            median {formatAngkaRingkas(terbaik.median)} tayangan dari {terbaik.video} video
            {d.jam_terbaik.length > 1 &&
              ` · lalu ${d.jam_terbaik
                .slice(1)
                .map((s) => `${HARI_PENDEK[s.hari]} ${String(s.jam).padStart(2, "0")}.00`)
                .join(", ")}`}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-teks-sekunder">Belum cukup video berangka untuk menilai jam (minimal {minSel} video per jam).</p>
      )}
      <div className="mt-3" role="grid" aria-label="Peta jam posting">
        {URUT_HARI.map((h) => (
          <div key={h} className="flex items-center gap-[2px] py-[1px]" role="row">
            <span className="w-7 shrink-0 text-[9.5px] font-semibold text-teks-sekunder">{HARI_PENDEK[h]}</span>
            {Array.from({ length: 24 }, (_, j) => {
              const s = peta.get(h * 24 + j);
              const aktif = pilih?.hari === h && pilih.jam === j;
              return (
                <button
                  key={j}
                  type="button"
                  role="gridcell"
                  disabled={!s}
                  onClick={() => setPilih(s ?? null)}
                  aria-label={s ? `${NAMA_HARI[h]} ${jamRentang(j)}: median ${s.median} tayangan, ${s.video} video` : `${NAMA_HARI[h]} ${jamRentang(j)}: tidak ada video`}
                  className={cn("aspect-square min-w-0 flex-1 rounded-[3px]", !s && "border border-black/5 dark:border-white/5", aktif && "ring-2 ring-pri")}
                  style={{ background: warna(s) }}
                />
              );
            })}
          </div>
        ))}
        <div className="flex gap-[2px] pl-7">
          {Array.from({ length: 24 }, (_, j) => (
            <span key={j} className="min-w-0 flex-1 text-center text-[8.5px] text-teks-sekunder">
              {j % 3 === 0 ? String(j).padStart(2, "0") : ""}
            </span>
          ))}
        </div>
      </div>
      {pilih && (
        <p className="mt-2 text-[11.5px] font-semibold text-teks-utama">
          {NAMA_HARI[pilih.hari]} {jamRentang(pilih.jam)} · median {formatAngkaRingkas(pilih.median)} tayangan · {pilih.video} video
          {pilih.video < minSel ? " (terlalu sedikit untuk dinilai)" : ""}
        </p>
      )}
      <p className="mt-2 text-[10.5px] text-teks-sekunder">
        Makin pekat = median tayangan makin tinggi dibanding jam lain. Abu-abu = kurang dari {minSel} video (terlalu sedikit untuk dinilai).
        {d.jam_tak_pasti > 0 && ` ${formatAngkaRingkas(d.jam_tak_pasti)} video tanpa jam pasti tidak ikut dihitung.`}
      </p>
    </GlassCard>
  );
}

function KartuVideo({ d }: { d: Data }) {
  if (d.video_teratas.length === 0) return null;
  return (
    <GlassCard className="mt-4 p-4">
      <JudulKartu
        ikon={Flame}
        warna="linear-gradient(135deg, #DC2626, #991B1B)"
        judul="Video Teratas"
        sub="Tayangan terbanyak di rentang ini"
      />
      <ol className="mt-3 space-y-2">
        {d.video_teratas.map((v, i) => {
          const det = d.detail[v.kode];
          return (
            <li key={v.kode} className="glass-soft flex gap-2.5 rounded-2xl p-2">
              <Gambar src={det?.thumbnail_url ?? ""} platform={v.platform} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[12px] leading-snug font-bold text-teks-utama">
                  <span className="text-teks-sekunder">{i + 1}. </span>
                  {det?.judul || "(tanpa judul)"}
                </p>
                <p className="mt-0.5 truncate text-[10.5px] text-teks-sekunder">
                  {d.nama[v.user_id] || det?.nama_akun || `@${v.username}`}
                  {v.username ? ` · @${v.username}` : ""} · {tglPendek(v.tanggal)}
                </p>
                <p className="angka-tab mt-0.5 text-[11px] font-semibold text-teks-utama">
                  {formatAngkaRingkas(v.tayangan)} tayangan · {formatAngkaRingkas(v.suka)} suka · {formatAngkaRingkas(v.komentar)} komentar
                </p>
              </div>
              {det?.url && (
                <a
                  href={det.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Buka video"
                  className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full text-teks-utama"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}

/** Gambar mini video; tautan CDN platform bisa kedaluwarsa → jatuh ke ikon. */
function Gambar({ src, platform }: { src: string; platform: string }) {
  const [rusak, setRusak] = useState(false);
  return (
    <div className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
      {src && !rusak ? (
        // Host gambar berubah-ubah (CDN tiap platform) → <img> biasa.
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setRusak(true)} />
      ) : (
        <PlatformIcon platform={platform} size={18} />
      )}
    </div>
  );
}
