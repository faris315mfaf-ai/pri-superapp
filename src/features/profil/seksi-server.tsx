"use client";

// ============================================================
// SeksiServer (Panel Master, 3 Sep 2026) — pemakaian SERVER Supabase
// (CPU, RAM, disk, ukuran database, beban) dan TOKEN AI (DeepSeek / Gemini:
// hari ini, 7 hari, 30 hari) + saldo DeepSeek. Sumber: /api/master/server
// (endpoint metrik resmi Supabase + tabel ai_pemakaian).
// ============================================================

import { useEffect, useState } from "react";
import { Activity, Cpu, Database, HardDrive, Loader2, MemoryStick, RefreshCw, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { getServerMaster, type ServerMaster } from "@/services";
import { jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

function gb(b: number | null | undefined): string {
  if (b == null) return "-";
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.round(b / 1024)} KB`;
}
function ribuan(n: number): string {
  return n.toLocaleString("id-ID");
}
function warnaPersen(p: number | null | undefined): string {
  if (p == null) return "#9CA3AF";
  if (p >= 90) return "#DC2626";
  if (p >= 70) return "#F59E0B";
  return "#10B981";
}

function Meter({ label, persen, isi, Ikon }: { label: string; persen: number | null; isi: string; Ikon: typeof Cpu }) {
  return (
    <div className="glass-soft rounded-xl p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-teks-utama">
        <Ikon className="h-3.5 w-3.5 text-pri" /> {label}
      </p>
      <p className="angka-tab mt-1 font-heading text-[20px] font-extrabold" style={{ color: warnaPersen(persen) }}>
        {persen == null ? "-" : `${persen}%`}
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, persen ?? 0)}%`, background: warnaPersen(persen) }} />
      </div>
      <p className="mt-1 text-[10px] text-teks-sekunder">{isi}</p>
    </div>
  );
}

export function SeksiServer() {
  const [data, setData] = useState<ServerMaster | null>(null);
  const [memuat, setMemuat] = useState(false);

  function muat() {
    setMemuat(true);
    getServerMaster()
      .then(setData)
      .catch((e) => toast("error", "Gagal membaca pemakaian server", e instanceof Error ? e.message : ""))
      .finally(() => setMemuat(false));
  }
  useEffect(() => {
    let hidup = true;
    getServerMaster()
      .then((d) => hidup && setData(d))
      .catch((e) => hidup && toast("error", "Gagal membaca pemakaian server", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, []);

  const s = data?.server ?? null;
  const rentang: [string, ServerMaster["ai"]["hari_ini"]][] = data
    ? [
        ["Hari ini", data.ai.hari_ini],
        ["7 hari", data.ai.tujuh_hari],
        ["30 hari", data.ai.tiga_puluh_hari],
      ]
    : [];

  return (
    <>
      <div className="mt-6 flex items-center justify-between">
        <SectionTitle judul="Pemakaian Server & Token AI" className="!mt-0" />
        <button
          type="button"
          onClick={muat}
          disabled={memuat}
          aria-label="Segarkan"
          className="btn-tekan p-1.5 text-teks-sekunder disabled:opacity-50"
        >
          {memuat ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>
      <GlassCard className="p-4">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
          <Activity className="h-4 w-4 text-pri" /> Server database Supabase
        </p>
        {!data ? (
          <GlassSkeleton className="mt-3 h-28 rounded-xl" />
        ) : !s ? (
          <p className="mt-2 text-[11.5px] text-gagal">Metrik tidak terbaca: {data.galat_server ?? "-"}</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Meter label="CPU" persen={s.cpu_persen} isi={`${s.cpu_inti} inti · beban ${s.beban_1m ?? "-"} / ${s.beban_5m ?? "-"} / ${s.beban_15m ?? "-"}`} Ikon={Cpu} />
              <Meter label="RAM" persen={s.ram_persen} isi={`${gb(s.ram_terpakai)} dari ${gb(s.ram_total)}`} Ikon={MemoryStick} />
              <Meter label="Disk" persen={s.disk_persen} isi={`${gb(s.disk_terpakai)} dari ${gb(s.disk_total)}`} Ikon={HardDrive} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-teks-sekunder">
              <Database className="h-3.5 w-3.5" /> Ukuran database: <b className="text-teks-utama">{gb(s.db_ukuran)}</b> · dibaca{" "}
              {jamWIB(s.diambil_pada)} (CPU = rata-rata 3 detik terakhir)
            </p>
          </>
        )}
      </GlassCard>

      <GlassCard className="mt-2 p-4">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
          <Sparkles className="h-4 w-4 text-pri" /> Token AI (DeepSeek & Gemini)
        </p>
        {!data ? (
          <GlassSkeleton className="mt-3 h-20 rounded-xl" />
        ) : (
          <>
            <div className="scrollbar-tipis mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[11.5px]">
                <thead>
                  <tr className="text-teks-sekunder">
                    <th className="py-1.5 pr-2 font-semibold">Rentang</th>
                    <th className="py-1.5 pr-2 font-semibold">Penyedia</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Panggilan</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Token masuk</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Token keluar</th>
                    <th className="py-1.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rentang.flatMap(([label, baris]) =>
                    baris.length === 0
                      ? [
                          <tr key={label} className="border-t border-glass-border">
                            <td className="py-1.5 pr-2 font-semibold text-teks-utama">{label}</td>
                            <td className="py-1.5 text-teks-sekunder" colSpan={5}>
                              belum ada pemakaian tercatat
                            </td>
                          </tr>,
                        ]
                      : baris.map((r, i) => (
                          <tr key={`${label}-${r.penyedia}`} className="border-t border-glass-border">
                            <td className="py-1.5 pr-2 font-semibold text-teks-utama">{i === 0 ? label : ""}</td>
                            <td className="py-1.5 pr-2 capitalize text-teks-utama">{r.penyedia}</td>
                            <td className="angka-tab py-1.5 pr-2 text-right">{ribuan(r.panggilan)}</td>
                            <td className="angka-tab py-1.5 pr-2 text-right">{ribuan(r.token_masuk)}</td>
                            <td className="angka-tab py-1.5 pr-2 text-right">{ribuan(r.token_keluar)}</td>
                            <td className="angka-tab py-1.5 text-right font-bold text-teks-utama">{ribuan(r.token_total)}</td>
                          </tr>
                        )),
                  )}
                </tbody>
              </table>
            </div>
            <p className={cn("mt-2 text-[11px]", data.deepseek.siap ? "text-teks-sekunder" : "text-gagal")}>
              {data.deepseek.siap
                ? `Saldo DeepSeek: ${data.deepseek.saldo ?? "-"}${data.deepseek.tersedia === false ? " (tidak tersedia)" : ""}`
                : "DeepSeek belum diatur (DEEPSEEK_API_KEY)."}{" "}
              Pencatatan token dimulai 3 Sep 2026 — pemakaian sebelum itu tidak tercatat.
            </p>
          </>
        )}
      </GlassCard>
    </>
  );
}
