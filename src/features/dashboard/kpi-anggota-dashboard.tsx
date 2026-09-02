"use client";

// ============================================================
// KpiAnggotaDashboard (fitur 1.19/3.3.b) — sub-dashboard KPI,
// BACA-SAJA. Dua tab:
//
// 1. KPI HARIAN — target video harian per anggota (kolom
//    app_user.kpi_video, bawaan 5): 6 kartu ringkasan, 4 grafik
//    (tren 7 hari, capaian per divisi, distribusi status, top 10),
//    filter gabungan (tanggal × divisi × status × cari nama),
//    tabel bisa diurutkan + sorot baris, klik baris = detail
//    riwayat 7 hari anggota itu.
// 2. RENCANA BESAR — kpi_tugas (rencana kerja divisi): ringkasan
//    status, filter, tabel dengan SISA WAKTU ke tenggat + sorot
//    baris (expired merah, mepet kuning, selesai hijau).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import { ArrowDownAZ, ArrowUpAZ, ExternalLink, Search, X } from "lucide-react";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, EmptyState, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import {
  getDashboardKpi,
  getDashboardKpiAnggota,
  type KpiDashboardAnggota,
  type KpiDashboardData,
  type LaporanVideo,
} from "@/services";
import { DIVISI } from "@/lib/struktur";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

function tanggalWibSekarang(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** "28/08" untuk sumbu grafik. */
function labelTanggal(t: string): string {
  return `${t.slice(8, 10)}/${t.slice(5, 7)}`;
}

/** Sisa waktu ke tenggat, dihitung dari "hari ini" WIB. */
function sisaWaktu(tenggat: string): { teks: string; hari: number } {
  const hariIni = tanggalWibSekarang();
  const selisih = Math.round(
    (Date.parse(`${tenggat}T00:00:00Z`) - Date.parse(`${hariIni}T00:00:00Z`)) / 86_400_000,
  );
  if (selisih > 0) return { teks: `${selisih} hari lagi`, hari: selisih };
  if (selisih === 0) return { teks: "Hari ini", hari: 0 };
  return { teks: `Lewat ${-selisih} hari`, hari: selisih };
}

const WARNA_PRIORITAS: Record<string, "merah" | "kuning" | "biru" | "hijau"> = {
  kritis: "merah",
  tinggi: "kuning",
  sedang: "biru",
  rendah: "hijau",
};

type KolomSort = "nama" | "divisi" | "jumlah" | "target" | "persen";

/** Kepala kolom tabel yang bisa diklik untuk mengurutkan. */
function KepalaSort({
  kolom,
  label,
  sortKolom,
  sortNaik,
  onKlik,
}: {
  kolom: KolomSort;
  label: string;
  sortKolom: KolomSort;
  sortNaik: boolean;
  onKlik: (kolom: KolomSort) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onKlik(kolom)}
      className="btn-tekan flex items-center gap-1 font-bold whitespace-nowrap"
      aria-label={`Urutkan berdasarkan ${label}`}
    >
      {label}
      {sortKolom === kolom &&
        (sortNaik ? (
          <ArrowUpAZ className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowDownAZ className="h-3 w-3" aria-hidden="true" />
        ))}
    </button>
  );
}

export function KpiAnggotaDashboard() {
  const [data, setData] = useState<KpiDashboardData | null>(null);
  const [gagal, setGagal] = useState(false);
  const [tab, setTab] = useState<"harian" | "rencana">("harian");
  // Filter KPI harian (gabungan AND)
  const [fTanggal, setFTanggal] = useState(tanggalWibSekarang());
  const [fDivisi, setFDivisi] = useState("semua");
  const [fStatus, setFStatus] = useState<"semua" | "tercapai" | "belum" | "bebas">("semua");
  const [cari, setCari] = useState("");
  // Urutan tabel harian
  const [sortKolom, setSortKolom] = useState<KolomSort>("jumlah");
  const [sortNaik, setSortNaik] = useState(false);
  // Filter rencana besar
  const [fStatusRencana, setFStatusRencana] = useState<"semua" | "aktif" | "selesai" | "expired">("semua");
  const [fDivisiRencana, setFDivisiRencana] = useState("semua");
  // Modal detail anggota
  const [detail, setDetail] = useState<KpiDashboardAnggota | null>(null);
  const [riwayatDetail, setRiwayatDetail] = useState<{ tanggal: string; jumlah: number }[] | null>(null);
  // Link video anggota itu (jendela 7 hari) — modal menyaring tanggal terpilih per sosmed.
  const [linksDetail, setLinksDetail] = useState<LaporanVideo[] | null>(null);

  // Reset (setData(null)/setGagal) TIDAK dilakukan di effect — aturan
  // lint rumah melarang setState sinkron dalam effect; reset terjadi
  // di handler ganti tanggal (gantiTanggal) sebelum fTanggal berubah.
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getDashboardKpi(fTanggal);
        if (hidup) setData(hasil);
      } catch (e) {
        if (hidup) {
          setGagal(true);
          toast("error", "Gagal memuat KPI", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, [fTanggal]);

  // Riwayat 7 hari anggota yang sedang dibuka detailnya. Reset
  // riwayatnya dilakukan di handler klik baris, bukan di sini.
  useEffect(() => {
    if (!detail) return;
    let hidup = true;
    void (async () => {
      try {
        const r = await getDashboardKpiAnggota(detail.id, fTanggal);
        // Sementara hanya riwayatnya yang dipakai; daftar link + embed +
        // deteksi link bodong menyusul di rombakan modal detail.
        if (hidup) {
          setRiwayatDetail(r.riwayat);
          setLinksDetail(r.links);
        }
      } catch {
        if (hidup) {
          setRiwayatDetail([]);
          setLinksDetail([]);
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, [detail, fTanggal]);

  function gantiTanggal(t: string) {
    setData(null);
    setGagal(false);
    setFTanggal(t || tanggalWibSekarang());
  }

  function bukaDetail(a: KpiDashboardAnggota) {
    setRiwayatDetail(null);
    setLinksDetail(null);
    setDetail(a);
  }

  const anggota = useMemo(() => data?.anggota ?? [], [data]);

  // --- Ringkasan 6 kartu (dihitung dari SEMUA anggota, bukan hasil filter) ---
  const ringkas = useMemo(() => {
    const total = anggota.length;
    const bebas = anggota.filter((a) => a.dibebaskan).length;
    const tercapai = anggota.filter((a) => a.tercapai && !a.dibebaskan).length;
    const belum = total - tercapai - bebas;
    const video = anggota.reduce((s, a) => s + a.jumlah, 0);
    return {
      total,
      tercapai,
      belum,
      bebas,
      video,
      rata: total > 0 ? Math.round((video / total) * 10) / 10 : 0,
    };
  }, [anggota]);

  // --- Grafik 2: capaian per divisi (stacked bar) ---
  const perDivisi = useMemo(() => {
    const per = new Map<string, { divisi: string; tercapai: number; belum: number }>();
    for (const a of anggota) {
      if (a.dibebaskan) continue;
      const kunci = (a.divisi || "Tanpa divisi").replace(/^Divisi /, "");
      const ada = per.get(kunci) ?? { divisi: kunci, tercapai: 0, belum: 0 };
      if (a.tercapai) ada.tercapai += 1;
      else ada.belum += 1;
      per.set(kunci, ada);
    }
    return Array.from(per.values()).sort(
      (x, y) => y.tercapai + y.belum - (x.tercapai + x.belum),
    );
  }, [anggota]);

  // --- Grafik 3: distribusi status (pie) ---
  const dataPie = useMemo(
    () =>
      [
        { name: "Tercapai", value: ringkas.tercapai, warna: "#10B981" },
        { name: "Belum", value: ringkas.belum, warna: "#DC2626" },
        { name: "Dibebaskan", value: ringkas.bebas, warna: "#F59E0B" },
      ].filter((d) => d.value > 0),
    [ringkas],
  );

  // --- Grafik 4: top 10 penyetor video ---
  const top10 = useMemo(
    () =>
      [...anggota]
        .filter((a) => a.jumlah > 0)
        .sort((x, y) => y.jumlah - x.jumlah)
        .slice(0, 10)
        .map((a) => ({ nama: a.nama.split(" ")[0] || a.nama, jumlah: a.jumlah })),
    [anggota],
  );

  // --- Tabel harian: filter gabungan + urutan ---
  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const daftar = anggota.filter((a) => {
      if (fDivisi !== "semua" && a.divisi !== fDivisi) return false;
      if (fStatus === "tercapai" && (!a.tercapai || a.dibebaskan)) return false;
      if (fStatus === "belum" && (a.tercapai || a.dibebaskan)) return false;
      if (fStatus === "bebas" && !a.dibebaskan) return false;
      if (q && !a.nama.toLowerCase().includes(q)) return false;
      return true;
    });
    const arah = sortNaik ? 1 : -1;
    return daftar.sort((x, y) => {
      switch (sortKolom) {
        case "nama":
          return arah * x.nama.localeCompare(y.nama);
        case "divisi":
          return arah * x.divisi.localeCompare(y.divisi);
        case "target":
          return arah * (x.target - y.target);
        case "persen":
          return (
            arah *
            ((x.persen ?? (100 * x.jumlah) / Math.max(1, x.target)) -
              (y.persen ?? (100 * y.jumlah) / Math.max(1, y.target)))
          );
        default:
          return arah * (x.jumlah - y.jumlah);
      }
    });
  }, [anggota, fDivisi, fStatus, cari, sortKolom, sortNaik]);

  function klikSort(kolom: KolomSort) {
    if (sortKolom === kolom) setSortNaik((v) => !v);
    else {
      setSortKolom(kolom);
      setSortNaik(kolom === "nama" || kolom === "divisi");
    }
  }

  // --- Rencana besar: filter + ringkasan ---
  const rencana = useMemo(() => data?.rencana ?? [], [data]);
  const rencanaTersaring = useMemo(
    () =>
      rencana.filter((k) => {
        if (fStatusRencana !== "semua" && k.status !== fStatusRencana) return false;
        if (fDivisiRencana !== "semua" && k.divisi !== fDivisiRencana) return false;
        return true;
      }),
    [rencana, fStatusRencana, fDivisiRencana],
  );
  const ringkasRencana = useMemo(() => {
    const aktif = rencana.filter((k) => k.status === "aktif");
    return {
      aktif: aktif.length,
      selesai: rencana.filter((k) => k.status === "selesai").length,
      expired: rencana.filter((k) => k.status === "expired").length,
      rataProgress:
        aktif.length > 0
          ? Math.round(aktif.reduce((s, k) => s + k.progress, 0) / aktif.length)
          : 0,
    };
  }, [rencana]);

  if (gagal) {
    return (
      <EmptyState
        ikon={Target}
        judul="KPI gagal dimuat"
        keterangan="Coba buka ulang dashboard ini."
      />
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <GlassSkeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <GlassSkeleton className="h-52 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tab KPI Harian vs Rencana Besar */}
      <div className="flex gap-2">
        {(
          [
            ["harian", "KPI Harian"],
            ["rencana", "Rencana Besar"],
          ] as const
        ).map(([kunci, label]) => (
          <button
            key={kunci}
            type="button"
            onClick={() => setTab(kunci)}
            className={cn(
              "btn-tekan rounded-full px-4 py-2 text-xs font-bold",
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

      {tab === "harian" && (
        <>
          {/* 6 kartu ringkasan */}
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
            {(
              [
                ["Anggota", ringkas.total, "#94A3B8"],
                ["Tercapai", ringkas.tercapai, "#10B981"],
                ["Belum", ringkas.belum, "#DC2626"],
                ["Dibebaskan", ringkas.bebas, "#F59E0B"],
                ["Video Hari Ini", ringkas.video, "#3B82F6"],
                ["Rata-rata", ringkas.rata, "#8B5CF6"],
              ] as const
            ).map(([label, nilai, warna]) => (
              <GlassCard key={label} className="px-2 py-2.5 text-center">
                <p
                  className="angka-tab font-heading text-lg font-extrabold"
                  style={{ color: warna }}
                >
                  {nilai}
                </p>
                <p className="text-[10px] leading-tight font-semibold text-teks-sekunder">
                  {label}
                </p>
              </GlassCard>
            ))}
          </div>

          {/* 4 grafik */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <GlassCard className="p-3">
              <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
                Tren Video 7 Hari
              </p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.tren} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trenKpi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#DC2626" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#DC2626" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="tanggal" tickFormatter={labelTanggal} tick={{ fontSize: 9.5 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(t: string) => labelTanggal(t)}
                      formatter={(v: number) => [`${v} video`, "Total"]}
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="jumlah"
                      stroke="#DC2626"
                      strokeWidth={2}
                      fill="url(#trenKpi)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard className="p-3">
              <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
                Capaian Per Divisi
              </p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perDivisi} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <XAxis
                      dataKey="divisi"
                      tick={{ fontSize: 8.5 }}
                      interval={0}
                      angle={-28}
                      textAnchor="end"
                      height={42}
                    />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(v: number, nama: string) => [
                        `${v} orang`,
                        nama === "tercapai" ? "Tercapai" : "Belum",
                      ]}
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="tercapai" stackId="a" fill="#10B981" />
                    <Bar dataKey="belum" stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard className="p-3">
              <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
                Distribusi Status
              </p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dataPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={34}
                      outerRadius={56}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {dataPie.map((d) => (
                        <Cell key={d.name} fill={d.warna} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, nama: string) => [`${v} orang`, nama]}
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <Legend iconSize={9} formatter={(v: string) => <span style={{ fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard className="p-3">
              <p className="mb-1 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
                Top 10 Penyetor Video
              </p>
              <div className="h-40">
                {top10.length === 0 ? (
                  <p className="pt-12 text-center text-xs text-teks-sekunder">
                    Belum ada video pada tanggal ini.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top10} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <XAxis
                        dataKey="nama"
                        tick={{ fontSize: 8.5 }}
                        interval={0}
                        angle={-28}
                        textAnchor="end"
                        height={42}
                      />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        formatter={(v: number) => [`${v} video`, "Jumlah"]}
                        contentStyle={{ borderRadius: 12, fontSize: 12 }}
                      />
                      <Bar dataKey="jumlah" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </GlassCard>
          </div>

          {/* Filter gabungan */}
          <GlassCard className="flex flex-wrap items-center gap-2 p-2.5">
            <input
              type="date"
              value={fTanggal}
              max={tanggalWibSekarang()}
              onChange={(e) => gantiTanggal(e.target.value)}
              aria-label="Pilih tanggal"
              className="glass-input h-9 rounded-lg px-2.5 text-xs text-teks-utama"
            />
            <select
              value={fDivisi}
              onChange={(e) => setFDivisi(e.target.value)}
              aria-label="Saring divisi"
              className="glass-input h-9 rounded-lg px-2 text-xs text-teks-utama"
            >
              <option value="semua">Semua Divisi</option>
              {DIVISI.map((d) => (
                <option key={d} value={d}>
                  {d.replace(/^Divisi /, "")}
                </option>
              ))}
            </select>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value as typeof fStatus)}
              aria-label="Saring status"
              className="glass-input h-9 rounded-lg px-2 text-xs text-teks-utama"
            >
              <option value="semua">Semua Status</option>
              <option value="tercapai">Tercapai</option>
              <option value="belum">Belum</option>
              <option value="bebas">Dibebaskan</option>
            </select>
            <div className="relative min-w-[140px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-teks-sekunder" />
              <input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari nama..."
                aria-label="Cari nama anggota"
                className="glass-input h-9 w-full rounded-lg pl-8 pr-2.5 text-xs text-teks-utama placeholder:text-teks-sekunder/70"
              />
            </div>
          </GlassCard>

          {/* Tabel bisa diurutkan + sorot baris; klik baris = detail */}
          <GlassCard className="overflow-hidden p-0">
            <div className="scrollbar-tipis overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="border-b border-glass-border text-[10.5px] text-teks-sekunder">
                    <th className="px-3 py-2.5">No</th>
                    <th className="px-2 py-2.5">
                      <KepalaSort kolom="nama" label="Anggota" sortKolom={sortKolom} sortNaik={sortNaik} onKlik={klikSort} />
                    </th>
                    <th className="px-2 py-2.5">
                      <KepalaSort kolom="divisi" label="Divisi" sortKolom={sortKolom} sortNaik={sortNaik} onKlik={klikSort} />
                    </th>
                    <th className="px-2 py-2.5 text-center">
                      <KepalaSort kolom="jumlah" label="Video" sortKolom={sortKolom} sortNaik={sortNaik} onKlik={klikSort} />
                    </th>
                    <th className="px-2 py-2.5 text-center">
                      <KepalaSort kolom="target" label="Target" sortKolom={sortKolom} sortNaik={sortNaik} onKlik={klikSort} />
                    </th>
                    <th className="px-2 py-2.5 text-center">
                      <KepalaSort kolom="persen" label="%" sortKolom={sortKolom} sortNaik={sortNaik} onKlik={klikSort} />
                    </th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tersaring.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-teks-sekunder">
                        Tidak ada anggota yang cocok dengan filter.
                      </td>
                    </tr>
                  ) : (
                    tersaring.map((a, i) => {
                      // Persen KETAT dari server (100% <=> tercapai, 2 Sep 2026);
                      // cadangan hitung kasar bila server lama.
                      const persen =
                        a.persen ??
                        Math.min(999, Math.round((a.jumlah / Math.max(1, a.target)) * 100));
                      return (
                        <tr
                          key={a.id}
                          onClick={() => bukaDetail(a)}
                          className={cn(
                            "cursor-pointer border-b border-glass-border/60 transition-colors last:border-0",
                            // Sorot baris sesuai capaian (spek 3.3.b)
                            a.dibebaskan
                              ? "bg-emas/[0.07]"
                              : a.tercapai
                                ? "bg-sukses/[0.07]"
                                : "hover:bg-pri/[0.04]",
                          )}
                        >
                          <td className="angka-tab px-3 py-2 text-teks-sekunder">{i + 1}</td>
                          <td className="px-2 py-2">
                            <span className="flex items-center gap-2">
                              {a.avatar_url ? (
                                <FotoBulat src={a.avatar_url} ukuran={24} />
                              ) : (
                                <AvatarInisial nama={a.nama} ukuran="sm" />
                              )}
                              <span className="max-w-[140px] truncate font-semibold text-teks-utama">
                                {a.nama}
                              </span>
                            </span>
                          </td>
                          <td className="max-w-[110px] truncate px-2 py-2 text-teks-sekunder">
                            {(a.divisi || "-").replace(/^Divisi /, "")}
                          </td>
                          <td className="angka-tab px-2 py-2 text-center font-bold text-teks-utama">
                            {a.jumlah}
                          </td>
                          <td className="angka-tab px-2 py-2 text-center text-teks-sekunder">
                            {a.target}
                          </td>
                          <td className="angka-tab px-2 py-2 text-center font-semibold text-teks-utama">
                            {persen}%
                          </td>
                          <td className="px-3 py-2">
                            {a.dibebaskan ? (
                              <StatusBadge label={a.dibebaskan} warna="kuning" />
                            ) : a.tercapai ? (
                              <StatusBadge label="tercapai" warna="hijau" />
                            ) : (
                              <StatusBadge label="belum" warna="merah" />
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      )}

      {tab === "rencana" && (
        <>
          {/* Ringkasan rencana besar */}
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["Aktif", ringkasRencana.aktif, "#3B82F6"],
                ["Selesai", ringkasRencana.selesai, "#10B981"],
                ["Expired", ringkasRencana.expired, "#DC2626"],
                ["Progress", `${ringkasRencana.rataProgress}%`, "#8B5CF6"],
              ] as const
            ).map(([label, nilai, warna]) => (
              <GlassCard key={label} className="px-2 py-2.5 text-center">
                <p
                  className="angka-tab font-heading text-lg font-extrabold"
                  style={{ color: warna }}
                >
                  {nilai}
                </p>
                <p className="text-[10px] leading-tight font-semibold text-teks-sekunder">
                  {label}
                </p>
              </GlassCard>
            ))}
          </div>

          {/* Filter rencana */}
          <GlassCard className="flex flex-wrap items-center gap-2 p-2.5">
            <select
              value={fStatusRencana}
              onChange={(e) => setFStatusRencana(e.target.value as typeof fStatusRencana)}
              aria-label="Saring status rencana"
              className="glass-input h-9 rounded-lg px-2 text-xs text-teks-utama"
            >
              <option value="semua">Semua Status</option>
              <option value="aktif">Aktif</option>
              <option value="selesai">Selesai</option>
              <option value="expired">Expired</option>
            </select>
            <select
              value={fDivisiRencana}
              onChange={(e) => setFDivisiRencana(e.target.value)}
              aria-label="Saring divisi rencana"
              className="glass-input h-9 rounded-lg px-2 text-xs text-teks-utama"
            >
              <option value="semua">Semua Divisi</option>
              {DIVISI.map((d) => (
                <option key={d} value={d}>
                  {d.replace(/^Divisi /, "")}
                </option>
              ))}
            </select>
          </GlassCard>

          {/* Daftar rencana + sisa waktu + sorot baris */}
          {rencanaTersaring.length === 0 ? (
            <GlassCard className="p-8 text-center text-xs text-teks-sekunder">
              Tidak ada rencana yang cocok dengan filter.
            </GlassCard>
          ) : (
            <div className="flex flex-col gap-2">
              {rencanaTersaring.map((k) => {
                const sisa = sisaWaktu(k.tenggat);
                return (
                  <GlassCard
                    key={k.id}
                    className={cn(
                      "p-3.5",
                      // Sorot: expired merah, tenggat mepet kuning, selesai hijau
                      k.status === "expired"
                        ? "border-gagal/40 bg-gagal/[0.05]"
                        : k.status === "selesai"
                          ? "bg-sukses/[0.05]"
                          : sisa.hari <= 2
                            ? "bg-emas/[0.06]"
                            : undefined,
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-teks-utama">{k.judul}</p>
                        <p className="mt-0.5 text-[11px] text-teks-sekunder">
                          {(k.divisi || "-").replace(/^Divisi /, "")} · mulai {k.tanggal_mulai} ·
                          tenggat {k.tenggat}
                        </p>
                        {k.target_indikator && (
                          <p className="mt-0.5 truncate text-[11px] text-teks-sekunder">
                            Target: {k.target_indikator}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge
                          label={k.prioritas}
                          warna={WARNA_PRIORITAS[k.prioritas] ?? "biru"}
                        />
                        <span
                          className={cn(
                            "angka-tab text-[10.5px] font-bold",
                            k.status === "selesai"
                              ? "text-sukses"
                              : sisa.hari < 0
                                ? "text-gagal"
                                : sisa.hari <= 2
                                  ? "text-emas"
                                  : "text-teks-sekunder",
                          )}
                        >
                          {k.status === "selesai" ? "Selesai" : sisa.teks}
                        </span>
                      </div>
                    </div>
                    {/* Bilah progress */}
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, k.progress)}%`,
                          background:
                            k.status === "expired"
                              ? "#DC2626"
                              : "linear-gradient(90deg, #DC2626, #F59E0B)",
                        }}
                      />
                    </div>
                    <p className="angka-tab mt-1 text-right text-[10px] text-teks-sekunder">
                      {k.progress}%
                    </p>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal detail per anggota (riwayat 7 hari) */}
      {detail && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md"
          onClick={() => setDetail(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Detail KPI ${detail.nama}`}
            className="glass-strong scrollbar-tipis max-h-[88dvh] w-full max-w-[340px] overflow-y-auto rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              {detail.avatar_url ? (
                <FotoBulat src={detail.avatar_url} ukuran={44} />
              ) : (
                <AvatarInisial nama={detail.nama} ukuran="lg" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-teks-utama">{detail.nama}</p>
                <p className="truncate text-[11px] text-teks-sekunder">
                  {(detail.divisi || "-").replace(/^Divisi /, "")} · target {detail.target}
                  /hari
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Tutup detail"
                className="btn-tekan rounded-full p-1.5 text-teks-sekunder"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["Hari Ini", detail.jumlah],
                  [
                    "7 Hari",
                    (riwayatDetail ?? []).reduce((s, r) => s + r.jumlah, 0),
                  ],
                  [
                    "Rata-rata",
                    riwayatDetail && riwayatDetail.length > 0
                      ? Math.round(
                          ((riwayatDetail ?? []).reduce((s, r) => s + r.jumlah, 0) /
                            riwayatDetail.length) *
                            10,
                        ) / 10
                      : 0,
                  ],
                ] as const
              ).map(([label, nilai]) => (
                <div key={label} className="glass rounded-xl px-1 py-2">
                  <p className="angka-tab font-heading text-base font-extrabold text-teks-utama">
                    {nilai}
                  </p>
                  <p className="text-[9.5px] font-semibold text-teks-sekunder">{label}</p>
                </div>
              ))}
            </div>

            <p className="mt-3 mb-1 text-[10.5px] font-bold tracking-wide text-teks-sekunder uppercase">
              Riwayat 7 Hari
            </p>
            {riwayatDetail === null ? (
              <GlassSkeleton className="h-28 rounded-xl" />
            ) : (
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={riwayatDetail}
                    margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
                  >
                    <XAxis dataKey="tanggal" tickFormatter={labelTanggal} tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9.5 }} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(t: string) => labelTanggal(t)}
                      formatter={(v: number) => [`${v} video`, "Jumlah"]}
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="jumlah" fill="#DC2626" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Video pada tanggal terpilih, per sosmed (2 Sep 2026) */}
            <p className="mt-3 mb-1 text-[10.5px] font-bold tracking-wide text-teks-sekunder uppercase">
              Video {labelTanggal(fTanggal)} per Sosmed
            </p>
            {linksDetail === null ? (
              <GlassSkeleton className="h-20 rounded-xl" />
            ) : (
              <VideoHariIniPerSosmed
                links={linksDetail.filter((l) => l.tanggal_wib === fTanggal)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const URUTAN_SOSMED = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"];

/** Daftar link video satu anggota pada satu tanggal, dikelompokkan per sosmed. */
function VideoHariIniPerSosmed({ links }: { links: LaporanVideo[] }) {
  const per = new Map<string, LaporanVideo[]>();
  for (const l of links) {
    const d = per.get(l.platform) ?? [];
    d.push(l);
    per.set(l.platform, d);
  }
  const platform = URUTAN_SOSMED.filter((p) => per.has(p)).concat(
    [...per.keys()].filter((p) => !URUTAN_SOSMED.includes(p)),
  );
  if (platform.length === 0) {
    return (
      <p className="glass rounded-xl px-3 py-3 text-center text-[11px] text-teks-sekunder">
        Belum ada video yang tercatat pada tanggal ini.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {platform.map((p) => {
        const daftar = per.get(p) ?? [];
        return (
          <div key={p} className="glass rounded-xl p-2.5">
            <div className="flex items-center gap-2">
              <PlatformIcon platform={p} size={13} />
              <p className="text-[11.5px] font-bold text-teks-utama">{labelPlatform(p)}</p>
              <span className="angka-tab ml-auto rounded-full bg-pri/12 px-2 text-[10px] font-bold text-pri">
                {daftar.length} video
              </span>
            </div>
            <div className="mt-1.5 flex flex-col gap-1">
              {daftar.map((l) => (
                <a
                  key={l.id}
                  href={l.url_video}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-tekan flex items-center gap-1.5 rounded-lg bg-black/5 px-2 py-1.5 text-[10.5px] text-teks-utama dark:bg-white/10"
                >
                  <span className="min-w-0 flex-1 truncate">{l.url_video}</span>
                  {l.keyword && (
                    <span className="shrink-0 rounded bg-pri/12 px-1 text-[9px] font-bold text-pri">
                      {l.keyword}
                    </span>
                  )}
                  <ExternalLink className="h-3 w-3 shrink-0 text-teks-sekunder" />
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
