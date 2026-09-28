"use client";

// ============================================================
// SeksiUjiBeban (Panel Master, 29 Sep 2026) — uji apakah aplikasi tahan
// dipakai ratusan orang SEKALIGUS. Menirukan N orang membuka aplikasi
// bersamaan lalu memakai fitur terberat, bertahap 25→50→75→100%, dan
// berhenti otomatis bila server mulai lambat. Mesinnya: lib/uji-beban.
// Hanya MEMBACA data; tidak ada pesan, koin, atau laporan yang dibuat.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, Gauge, Loader2, Play, Square, TriangleAlert, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  getUjiBeban,
  hentikanUjiBeban,
  mulaiUjiBeban,
  type DataUjiBeban,
  type StatusUjiBeban,
} from "@/services";
import { jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

const DURASI = [30, 60, 120] as const;

function warnaMs(ms: number): string {
  if (ms >= 5000) return "#DC2626";
  if (ms >= 2000) return "#F59E0B";
  return "#10B981";
}

function Angka({ label, isi, warna }: { label: string; isi: string; warna?: string }) {
  return (
    <div className="glass-soft rounded-xl px-3 py-2">
      <p className="text-[10px] font-semibold text-teks-sekunder">{label}</p>
      <p className="angka-tab font-heading text-[17px] font-extrabold text-teks-utama" style={warna ? { color: warna } : undefined}>
        {isi}
      </p>
    </div>
  );
}

function TabelHasil({ s }: { s: StatusUjiBeban }) {
  const terakhir = s.hasil[s.hasil.length - 1];
  return (
    <>
      <div className="scrollbar-tipis mt-2 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-[11.5px]">
          <thead>
            <tr className="text-teks-sekunder">
              <th className="py-1.5 pr-2 font-semibold">Orang</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Permintaan/dtk</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Biasa (p50)</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Terlambat (p95)</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Galat</th>
              <th className="py-1.5 pr-2 text-right font-semibold">CPU Supabase</th>
              <th className="py-1.5 text-right font-semibold">Hasil</th>
            </tr>
          </thead>
          <tbody className="angka-tab">
            {s.hasil.map((t) => (
              <tr key={t.orang} className="border-t border-black/5 dark:border-white/10">
                <td className="py-1.5 pr-2 font-bold text-teks-utama">{t.orang}</td>
                <td className="py-1.5 pr-2 text-right">{t.per_dtk}</td>
                <td className="py-1.5 pr-2 text-right">{t.p50} ms</td>
                <td className="py-1.5 pr-2 text-right font-semibold" style={{ color: warnaMs(t.p95) }}>
                  {t.p95} ms
                </td>
                <td className="py-1.5 pr-2 text-right">{t.galat}%</td>
                <td className="py-1.5 pr-2 text-right">{t.cpu_supabase == null ? "-" : `${t.cpu_supabase}%`}</td>
                <td className={cn("py-1.5 text-right font-bold", t.aman ? "text-sukses" : "text-gagal")}>{t.aman ? "Aman" : "Berat"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {terakhir && terakhir.lambat_teratas.length > 0 && (
        <p className="mt-2 text-[10.5px] leading-snug text-teks-sekunder">
          Paling lambat di tahap terakhir:{" "}
          {terakhir.lambat_teratas.map(([rute, p95]) => `${rute} (${p95} ms)`).join(", ")}
        </p>
      )}
    </>
  );
}

export function SeksiUjiBeban() {
  const [data, setData] = useState<DataUjiBeban | null>(null);
  const [jumlah, setJumlah] = useState<number | null>(null);
  const [skenario, setSkenario] = useState<"berat" | "normal">("berat");
  const [durasi, setDurasi] = useState<(typeof DURASI)[number]>(60);
  const [konfirmasi, setKonfirmasi] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    try {
      const d = await getUjiBeban();
      setData(d);
      setJumlah((j) => j ?? Math.min(500, Math.max(1, d.akun_aktif)));
    } catch (e) {
      toast("error", "Gagal membaca uji beban", e instanceof Error ? e.message : "");
    }
  }, []);

  useEffect(() => {
    let hidup = true;
    getUjiBeban()
      .then((d) => {
        if (!hidup) return;
        setData(d);
        setJumlah((j) => j ?? Math.min(500, Math.max(1, d.akun_aktif)));
      })
      .catch((e) => hidup && toast("error", "Gagal membaca uji beban", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, []);

  // Selama uji berjalan, angka langsung disegarkan tiap 3 detik.
  const berjalan = Boolean(data?.berjalan);
  useEffect(() => {
    if (!berjalan) return;
    const t = setInterval(() => void muat(), 3000);
    return () => clearInterval(t);
  }, [berjalan, muat]);

  async function mulai() {
    if (sibuk || !jumlah) return;
    setSibuk(true);
    try {
      await mulaiUjiBeban({ jumlah, skenario, durasi, konfirmasi });
      setKonfirmasi("");
      toast("sukses", "Uji beban dimulai", `${jumlah} orang virtual, bertahap.`);
      await muat();
    } catch (e) {
      toast("error", "Uji beban tidak dimulai", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  async function berhenti() {
    setSibuk(true);
    try {
      await hentikanUjiBeban();
      toast("info", "Uji beban dihentikan");
      await muat();
    } catch (e) {
      toast("error", "Gagal menghentikan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  const s = data?.berjalan ?? null;
  const t = data?.terakhir ?? null;
  const pilihanJumlah = data ? [...new Set([50, 100, 200, Math.min(500, data.akun_aktif)])].filter((n) => n > 0).sort((a, b) => a - b) : [];

  return (
    <>
      <SectionTitle judul="Uji Beban (ratusan orang sekaligus)" />
      <GlassCard className="p-4">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
          <Gauge className="h-4 w-4 text-pri" /> Tahankah aplikasi dipakai semua orang bersamaan?
        </p>
        <p className="mt-1 text-[11px] leading-snug text-teks-sekunder">
          Menirukan orang-orang membuka aplikasi <b>bersamaan</b> lalu memakai fitur terberat, bertahap 25% → 50% → 75% →
          100%. Hanya <b>membaca</b> data (tanpa pesan, koin, atau laporan). Berhenti sendiri bila server mulai lambat.
          Tetap membebani server sungguhan — jalankan saat sepi.
        </p>

        {!data ? (
          <GlassSkeleton className="mt-3 h-28 rounded-xl" />
        ) : s ? (
          // ---------- SEDANG BERJALAN ----------
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-pri" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[12px] font-bold text-teks-utama">
                Tahap {s.tahap_ke}/{s.tahap.length} · {s.orang_aktif} orang ·{" "}
                {s.skenario === "berat" ? "fitur terberat" : "pemakaian sehari-hari"}
              </p>
              <button
                type="button"
                onClick={() => void berhenti()}
                disabled={sibuk}
                className="btn-tekan flex h-8 items-center gap-1 rounded-lg bg-gagal/10 px-2.5 text-[11.5px] font-bold text-gagal disabled:opacity-50"
              >
                <Square className="h-3.5 w-3.5" /> Hentikan
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Angka label="Permintaan/dtk" isi={String(s.langsung?.per_dtk ?? "-")} />
              <Angka label="Terlambat (p95)" isi={s.langsung ? `${s.langsung.p95} ms` : "-"} warna={s.langsung ? warnaMs(s.langsung.p95) : undefined} />
              <Angka label="Galat" isi={s.langsung ? `${s.langsung.galat}%` : "-"} />
              <Angka label="CPU Supabase" isi={s.langsung?.cpu_supabase == null ? "…" : `${s.langsung.cpu_supabase}%`} />
              <Angka label="CPU aplikasi" isi={s.langsung?.cpu_aplikasi == null ? "…" : `${s.langsung.cpu_aplikasi}%`} />
              <Angka label="Database" isi={s.langsung?.tingkat_db ?? "-"} />
            </div>
            {s.hasil.length > 0 && <TabelHasil s={s} />}
          </div>
        ) : (
          // ---------- FORMULIR ----------
          <div className="mt-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-teks-utama">
              <Users className="h-3.5 w-3.5 text-pri" /> Jumlah orang (akun aktif: {data.akun_aktif})
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pilihanJumlah.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setJumlah(n)}
                  aria-pressed={jumlah === n}
                  className={cn(
                    "btn-tekan rounded-full px-3 py-1.5 text-[12px] font-bold",
                    jumlah === n ? "bg-pri text-white" : "glass text-teks-utama",
                  )}
                >
                  {n === data.akun_aktif ? `Semua (${n})` : n}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] font-bold text-teks-utama">Skenario</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {(
                [
                  ["berat", "Fitur terberat", "Semua orang terus membuka layar berat"],
                  ["normal", "Sehari-hari", "Pemakaian biasa: detak + sesekali buka layar"],
                ] as const
              ).map(([k, judul, ket]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSkenario(k)}
                  aria-pressed={skenario === k}
                  className={cn("btn-tekan rounded-xl p-2.5 text-left", skenario === k ? "bg-pri/10 ring-1 ring-pri" : "glass")}
                >
                  <span className="block text-[12px] font-bold text-teks-utama">{judul}</span>
                  <span className="block text-[10px] leading-snug text-teks-sekunder">{ket}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] font-bold text-teks-utama">Lama tiap tahap</p>
            <div className="mt-1.5 flex gap-1.5">
              {DURASI.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurasi(d)}
                  aria-pressed={durasi === d}
                  className={cn("btn-tekan rounded-full px-3 py-1.5 text-[12px] font-bold", durasi === d ? "bg-pri text-white" : "glass text-teks-utama")}
                >
                  {d} dtk
                </button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="text-[11px] font-bold text-teks-utama">Ketik UJI untuk memastikan</span>
              <input
                value={konfirmasi}
                onChange={(e) => setKonfirmasi(e.target.value)}
                placeholder="UJI"
                className="glass mt-1.5 h-10 w-full rounded-xl px-3 text-sm font-bold uppercase text-teks-utama placeholder:text-teks-sekunder/50 focus:outline-none"
              />
            </label>
            {data.tingkat_db !== "normal" && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-gagal">
                <TriangleAlert className="h-3.5 w-3.5" /> Database sedang {data.tingkat_db} — uji tidak bisa dimulai sekarang.
              </p>
            )}
            {!data.siap && <p className="mt-2 text-[11px] font-semibold text-gagal">CRON_SECRET belum diatur di server.</p>}
            <button
              type="button"
              onClick={() => void mulai()}
              disabled={sibuk || !data.siap || !jumlah || konfirmasi.trim().toUpperCase() !== "UJI" || data.tingkat_db !== "normal"}
              className="btn-tekan mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-pri text-[12.5px] font-bold text-white disabled:opacity-50"
            >
              {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Mulai uji {jumlah ?? ""} orang · ±{Math.ceil((durasi * 4) / 60)} menit
            </button>
          </div>
        )}
      </GlassCard>

      {/* ---------- HASIL TERAKHIR ---------- */}
      {!s && t && (
        <GlassCard className="mt-2 p-4">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
            <Activity className="h-4 w-4 text-pri" /> Hasil terakhir · {jamWIB(t.mulai)} · {t.target} orang ·{" "}
            {t.skenario === "berat" ? "fitur terberat" : "sehari-hari"}
          </p>
          <p
            className={cn(
              "mt-2 flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold",
              (t.aman_sampai ?? 0) >= t.target ? "bg-sukses/10 text-sukses" : "bg-amber-500/10 text-amber-600",
            )}
          >
            {(t.aman_sampai ?? 0) >= t.target ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
            {(t.aman_sampai ?? 0) > 0
              ? `Aman sampai ${t.aman_sampai} orang sekaligus`
              : `Belum aman bahkan di ${t.hasil[0]?.orang ?? t.target} orang`}
          </p>
          {t.alasan_berhenti && <p className="mt-1.5 text-[11px] text-teks-sekunder">{t.alasan_berhenti}</p>}
          <TabelHasil s={t} />
          <p className="mt-2 text-[10px] leading-snug text-teks-sekunder">
            &quot;Aman&quot; = 95% permintaan selesai di bawah 2 detik dan galat di bawah 2%. Rute khusus pengurus yang
            ditolak untuk akun biasa tidak dihitung galat.
          </p>
        </GlassCard>
      )}
    </>
  );
}
