"use client";

// ============================================================
// AnggotaKelengkapanDashboard (fitur 1.19/3.3.e) — sub-dashboard
// kelengkapan Database Anggota, BACA-SAJA:
//
// - Kartu ringkasan: rata-rata kelengkapan %, jumlah 100% lengkap,
//   jumlah minim (≤1 dimensi), total anggota.
// - 3 visual: donut distribusi tingkat kelengkapan, bar per dimensi
//   (berapa orang ✓), corong (funnel) dimensi terurut.
// - TAB PER KATEGORI: Semua / Lengkap / per-dimensi yang BELUM
//   (Belum Login, Belum Sosmed, dst) — memudahkan pengurus menagih.
// - Tabel detail per anggota: ✓/✗ kelima dimensi + persen.
//
// Lima dimensi (spek): login aplikasi (last_login_at), akun sosmed
// tertaut, Google tertaut, email terverifikasi, WA terverifikasi.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Check, Users, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import { getDashboardAnggota, type KelengkapanAnggota } from "@/services";
import { cn } from "@/lib/utils";

const DIMENSI: { kunci: keyof KelengkapanAnggota["dimensi"]; label: string }[] = [
  { kunci: "login", label: "Login" },
  { kunci: "sosmed", label: "Sosmed" },
  { kunci: "google", label: "Google" },
  { kunci: "email", label: "Email" },
  { kunci: "wa", label: "WA" },
];

const WARNA_TINGKAT: Record<string, string> = {
  "Lengkap (5/5)": "#10B981",
  "Hampir (3-4)": "#F59E0B",
  "Minim (1-2)": "#FB923C",
  "Kosong (0)": "#DC2626",
};

type TabKategori = "semua" | "lengkap" | keyof KelengkapanAnggota["dimensi"];

export function AnggotaKelengkapanDashboard() {
  const [data, setData] = useState<KelengkapanAnggota[] | null>(null);
  const [gagal, setGagal] = useState(false);
  const [tab, setTab] = useState<TabKategori>("semua");

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getDashboardAnggota();
        if (hidup) setData(hasil);
      } catch (e) {
        if (hidup) {
          setGagal(true);
          toast("error", "Gagal memuat kelengkapan", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  const anggota = useMemo(() => data ?? [], [data]);

  const ringkas = useMemo(() => {
    const total = anggota.length;
    const lengkap = anggota.filter((a) => a.terpenuhi === 5).length;
    const minim = anggota.filter((a) => a.terpenuhi <= 1).length;
    const rata =
      total > 0 ? Math.round(anggota.reduce((s, a) => s + a.persen, 0) / total) : 0;
    return { total, lengkap, minim, rata };
  }, [anggota]);

  // Donut: distribusi tingkat kelengkapan.
  const dataDonut = useMemo(() => {
    const kelompok = {
      "Lengkap (5/5)": 0,
      "Hampir (3-4)": 0,
      "Minim (1-2)": 0,
      "Kosong (0)": 0,
    };
    for (const a of anggota) {
      if (a.terpenuhi === 5) kelompok["Lengkap (5/5)"] += 1;
      else if (a.terpenuhi >= 3) kelompok["Hampir (3-4)"] += 1;
      else if (a.terpenuhi >= 1) kelompok["Minim (1-2)"] += 1;
      else kelompok["Kosong (0)"] += 1;
    }
    return Object.entries(kelompok)
      .filter(([, n]) => n > 0)
      .map(([name, value]) => ({ name, value }));
  }, [anggota]);

  // Bar per dimensi: berapa orang ✓.
  const dataDimensi = useMemo(
    () =>
      DIMENSI.map((d) => ({
        label: d.label,
        jumlah: anggota.filter((a) => a.dimensi[d.kunci]).length,
      })),
    [anggota],
  );

  // Corong: dimensi diurut dari yang paling banyak terpenuhi — bentuk
  // funnel memperlihatkan di mana anggota "berguguran".
  const dataCorong = useMemo(
    () => [...dataDimensi].sort((a, b) => b.jumlah - a.jumlah),
    [dataDimensi],
  );

  const tersaring = useMemo(() => {
    const daftar = anggota.filter((a) => {
      if (tab === "lengkap") return a.terpenuhi === 5;
      if (tab !== "semua") return !a.dimensi[tab];
      return true;
    });
    // Paling belum lengkap di atas — itulah yang butuh ditagih.
    return daftar.sort((x, y) => x.terpenuhi - y.terpenuhi || x.nama.localeCompare(y.nama));
  }, [anggota, tab]);

  if (gagal) {
    return (
      <EmptyState
        ikon={Users}
        judul="Kelengkapan gagal dimuat"
        keterangan="Coba buka ulang dashboard ini."
      />
    );
  }
  if (data === null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <GlassSkeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <GlassSkeleton className="h-52 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Kartu ringkasan */}
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            ["Rata-rata", `${ringkas.rata}%`, "#3B82F6"],
            ["Lengkap", ringkas.lengkap, "#10B981"],
            ["Minim", ringkas.minim, "#DC2626"],
            ["Anggota", ringkas.total, "#94A3B8"],
          ] as const
        ).map(([label, nilai, warna]) => (
          <GlassCard key={label} className="px-2 py-2.5 text-center">
            <p className="angka-tab font-heading text-lg font-extrabold" style={{ color: warna }}>
              {nilai}
            </p>
            <p className="text-[10px] leading-tight font-semibold text-teks-sekunder">{label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Visual: donut + bar + corong */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <GlassCard className="p-3">
          <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
            Tingkat Kelengkapan
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dataDonut}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={36}
                  outerRadius={56}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {dataDonut.map((d) => (
                    <Cell key={d.name} fill={WARNA_TINGKAT[d.name] ?? "#94A3B8"} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, nama: string) => [`${v} orang`, nama]}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Legend iconSize={9} formatter={(v: string) => <span style={{ fontSize: 10 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
            Terpenuhi Per Dimensi
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataDimensi} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 9.5 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: number) => [`${v} orang`, "Terpenuhi"]}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="jumlah" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      {/* Corong dimensi — bar horizontal menyempit */}
      <GlassCard className="p-3.5">
        <p className="mb-2 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
          Corong Kelengkapan
        </p>
        <div className="flex flex-col items-center gap-1">
          {dataCorong.map((d, i) => {
            const maks = dataCorong[0]?.jumlah || 1;
            const lebar = Math.max(28, Math.round((d.jumlah / maks) * 100));
            return (
              <div
                key={d.label}
                className="flex h-8 items-center justify-between rounded-lg px-3 text-[11px] font-bold text-white"
                style={{
                  width: `${lebar}%`,
                  background: `linear-gradient(135deg, hsl(${140 - i * 28}, 70%, 42%), hsl(${140 - i * 28}, 70%, 34%))`,
                }}
              >
                <span>{d.label}</span>
                <span className="angka-tab">{d.jumlah}</span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Tab kategori */}
      <div className="scrollbar-tipis flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["semua", `Semua ${anggota.length}`],
            ["lengkap", `Lengkap ${ringkas.lengkap}`],
            ...DIMENSI.map((d) => [
              d.kunci,
              `Belum ${d.label} ${anggota.filter((a) => !a.dimensi[d.kunci]).length}`,
            ]),
          ] as [TabKategori, string][]
        ).map(([kunci, label]) => (
          <button
            key={kunci}
            type="button"
            onClick={() => setTab(kunci)}
            className={cn(
              "btn-tekan shrink-0 rounded-full px-3.5 py-2 text-xs font-bold",
              tab === kunci ? "text-white" : "glass text-teks-sekunder",
            )}
            style={
              tab === kunci
                ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                : undefined
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tabel detail ✓/✗ per dimensi */}
      <GlassCard className="overflow-hidden p-0">
        <div className="scrollbar-tipis overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-glass-border text-[10.5px] text-teks-sekunder">
                <th className="px-3 py-2.5">Anggota</th>
                {DIMENSI.map((d) => (
                  <th key={d.kunci} className="px-2 py-2.5 text-center">
                    {d.label}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center">%</th>
              </tr>
            </thead>
            <tbody>
              {tersaring.length === 0 ? (
                <tr>
                  <td
                    colSpan={DIMENSI.length + 2}
                    className="px-3 py-8 text-center text-teks-sekunder"
                  >
                    Tidak ada anggota pada kategori ini.
                  </td>
                </tr>
              ) : (
                tersaring.map((a) => (
                  <tr
                    key={a.id}
                    className={cn(
                      "border-b border-glass-border/60 last:border-0",
                      a.terpenuhi === 5 && "bg-sukses/[0.06]",
                      a.terpenuhi <= 1 && "bg-gagal/[0.05]",
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        {a.avatar_url ? (
                          <FotoBulat src={a.avatar_url} ukuran={24} />
                        ) : (
                          <AvatarInisial nama={a.nama} ukuran="sm" />
                        )}
                        <span className="min-w-0">
                          <span className="block max-w-[150px] truncate font-semibold text-teks-utama">
                            {a.nama}
                          </span>
                          <span className="block max-w-[150px] truncate text-[10px] text-teks-sekunder">
                            {(a.divisi || "-").replace(/^Divisi /, "")}
                          </span>
                        </span>
                      </span>
                    </td>
                    {DIMENSI.map((d) => (
                      <td key={d.kunci} className="px-2 py-2 text-center">
                        {a.dimensi[d.kunci] ? (
                          <Check className="mx-auto h-4 w-4 text-sukses" aria-label="Terpenuhi" />
                        ) : (
                          <X className="mx-auto h-4 w-4 text-gagal/70" aria-label="Belum" />
                        )}
                      </td>
                    ))}
                    <td className="angka-tab px-3 py-2 text-center font-bold text-teks-utama">
                      {a.persen}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
