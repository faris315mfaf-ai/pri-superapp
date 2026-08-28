"use client";

// ============================================================
// AbsensiHariIniScreen — halaman absensi HR Center (spek 1.18/2.4).
//
// 1) Filter gabungan (AND): status × keterlambatan × divisi × zona —
//    tabel langsung menyaring tanpa muat ulang halaman.
// 2) Tabel: No, Nama, Divisi, Zona, Waktu Absen, Status, Telat,
//    dengan lencana warna (telat merah, alfa abu, izin/sakit kuning).
// 3) Dashboard: kartu ringkasan + pie distribusi status + bar per
//    divisi (recharts — pustaka chart yang sudah ada di proyek),
//    interaktif (hover menampilkan detail).
// 4) Telat dihitung dari batas 09:15 WIB (lib/absensi-status —
//    aturan yang sama dengan PDF rekap); Alfa = tidak absen & tanpa
//    izin/sakit disetujui.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import {
  getAbsensi,
  getPengguna,
  getPerizinan,
  getZona,
  type PenggunaAdmin,
  type Zona,
} from "@/services";
import { statusTelat, tepatWaktu } from "@/lib/absensi-status";
import { jamWIB } from "@/lib/format";
import { DIVISI } from "@/lib/struktur";
import { cn } from "@/lib/utils";

// Grafik dimuat malas — recharts besar dan hanya perlu di halaman ini.
const GrafikAbsensi = dynamic(
  () => import("./grafik-absensi").then((m) => m.GrafikAbsensi),
  { ssr: false, loading: () => <GlassSkeleton className="h-48 rounded-2xl" /> },
);

type StatusAbsen = "hadir" | "alfa" | "izin" | "sakit";

export type BarisAbsenHarian = {
  id: string;
  nama: string;
  avatar_url: string;
  divisi: string;
  zona: string;
  waktu: string | null; // ISO absen masuk
  status: StatusAbsen;
  telat: boolean;
  keterangan: string;
};

export function AbsensiHariIniScreen({ onKembali }: { onKembali: () => void }) {
  const [baris, setBaris] = useState<BarisAbsenHarian[] | null>(null);
  const [zonaList, setZonaList] = useState<Zona[]>([]);
  // Filter gabungan (spek: semua bisa dikombinasikan, logika AND)
  const [fStatus, setFStatus] = useState<"semua" | StatusAbsen>("semua");
  const [fTelat, setFTelat] = useState<"semua" | "tepat" | "telat">("semua");
  const [fDivisi, setFDivisi] = useState("semua");
  const [fZona, setFZona] = useState("semua");

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [pengguna, absen, izin, zonaSemua] = await Promise.all([
          getPengguna(),
          getAbsensi(true),
          getPerizinan(true).catch(() => []),
          getZona().catch(() => []),
        ]);
        if (!hidup) return;
        setZonaList(zonaSemua);

        const hariIni = absen.tanggal_hari_ini;
        const masukPer = new Map<string, string>();
        for (const a of absen.data) {
          if (a.tanggal_wib === hariIni && a.jenis === "masuk") {
            masukPer.set(a.user_id, a.waktu);
          }
        }
        const izinPer = new Map<string, string>(
          izin
            .filter((i) => i.tanggal_wib === hariIni && i.status === "disetujui")
            .map((i) => [i.user_id, i.jenis] as [string, string]),
        );
        const namaZonaPer = new Map<string, string>(
          zonaSemua.map((z) => [z.id, z.nama] as [string, string]),
        );

        setBaris(
          pengguna.data
            .filter((u: PenggunaAdmin) => u.status === "aktif")
            .map((u) => {
              const waktu = masukPer.get(u.id) ?? null;
              const jenisIzin = izinPer.get(u.id);
              const status: StatusAbsen = waktu
                ? "hadir"
                : jenisIzin === "sakit"
                  ? "sakit"
                  : jenisIzin
                    ? "izin"
                    : "alfa";
              return {
                id: u.id,
                nama: u.nama,
                avatar_url: u.avatar_url ?? "",
                divisi: u.divisi ?? "",
                zona: u.zona_id ? (namaZonaPer.get(String(u.zona_id)) ?? "") : "",
                waktu,
                status,
                telat: waktu ? !tepatWaktu(waktu) : false,
                keterangan: waktu
                  ? statusTelat(waktu)
                  : status === "alfa"
                    ? "Tanpa keterangan"
                    : `${status === "sakit" ? "Sakit" : "Izin"} (disetujui)`,
              };
            }),
        );
      } catch (e) {
        if (hidup) {
          setBaris([]);
          toast("error", "Gagal memuat absensi", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  // Semua filter AND — real-time tanpa muat ulang (spek 2.4).
  const tersaring = useMemo(
    () =>
      (baris ?? []).filter((b) => {
        if (fStatus !== "semua" && b.status !== fStatus) return false;
        if (fTelat === "tepat" && (b.status !== "hadir" || b.telat)) return false;
        if (fTelat === "telat" && !b.telat) return false;
        if (fDivisi !== "semua" && b.divisi !== fDivisi) return false;
        if (fZona !== "semua" && b.zona !== fZona) return false;
        return true;
      }),
    [baris, fStatus, fTelat, fDivisi, fZona],
  );

  const ringkas = useMemo(() => {
    const semua = baris ?? [];
    return {
      total: semua.length,
      hadir: semua.filter((b) => b.status === "hadir").length,
      alfa: semua.filter((b) => b.status === "alfa").length,
      izin: semua.filter((b) => b.status === "izin").length,
      sakit: semua.filter((b) => b.status === "sakit").length,
    };
  }, [baris]);

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
        <div className="min-w-0">
          <h1 className="font-heading truncate text-xl font-extrabold tracking-tight text-teks-utama">
            Absensi Hari Ini
          </h1>
          <p className="text-xs text-teks-sekunder">
            Batas masuk 09:15 WIB · {tersaring.length} dari {ringkas.total} anggota
          </p>
        </div>
      </header>

      {/* Kartu ringkasan (spek 2.4 bagian 3) */}
      <div className="mt-4 grid grid-cols-5 gap-1.5">
        {(
          [
            ["Total", ringkas.total, "#94A3B8"],
            ["Hadir", ringkas.hadir, "#10B981"],
            ["Alfa", ringkas.alfa, "#DC2626"],
            ["Izin", ringkas.izin, "#F59E0B"],
            ["Sakit", ringkas.sakit, "#FB923C"],
          ] as const
        ).map(([label, nilai, warna]) => (
          <GlassCard key={label} className="px-1 py-2 text-center">
            <p className="angka-tab font-heading text-lg font-extrabold" style={{ color: warna }}>
              {nilai}
            </p>
            <p className="text-[9.5px] font-semibold text-teks-sekunder">{label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Grafik pie + bar (interaktif) */}
      {baris !== null && baris.length > 0 && (
        <div className="mt-3">
          <GrafikAbsensi baris={baris} />
        </div>
      )}

      {/* Filter gabungan (spek 2.4 bagian 1) */}
      <div className="mt-3 flex flex-col gap-2">
        <div className="scrollbar-tipis flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              ["semua", "Semua"],
              ["hadir", "Sudah Absen"],
              ["alfa", "Alfa"],
              ["izin", "Izin"],
              ["sakit", "Sakit"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFStatus(id)}
              aria-pressed={fStatus === id}
              className={cn(
                "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-semibold",
                fStatus === id ? "text-white" : "glass-soft text-teks-sekunder",
              )}
              style={
                fStatus === id
                  ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
          <span className="mx-1 shrink-0 self-center text-teks-sekunder/40">|</span>
          {(
            [
              ["semua", "Semua"],
              ["tepat", "Tepat Waktu"],
              ["telat", "Telat"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={`t-${id}`}
              type="button"
              onClick={() => setFTelat(id)}
              aria-pressed={fTelat === id}
              className={cn(
                "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-semibold",
                fTelat === id ? "text-white" : "glass-soft text-teks-sekunder",
              )}
              style={
                fTelat === id
                  ? { background: "linear-gradient(135deg, #F59E0B, #D97706)" }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select
            value={fDivisi}
            onChange={(e) => setFDivisi(e.target.value)}
            aria-label="Filter divisi"
            className="glass-input h-10 min-w-0 flex-1 rounded-xl px-2.5 text-[12.5px] text-teks-utama outline-none"
          >
            <option value="semua">Semua Divisi</option>
            {DIVISI.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={fZona}
            onChange={(e) => setFZona(e.target.value)}
            aria-label="Filter zona"
            className="glass-input h-10 min-w-0 flex-1 rounded-xl px-2.5 text-[12.5px] text-teks-utama outline-none"
          >
            <option value="semua">Semua Zona</option>
            {zonaList.map((z) => (
              <option key={z.id} value={z.nama}>
                {z.nama}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabel (spek 2.4 bagian 2) */}
      {baris === null ? (
        <GlassSkeleton className="mt-3 h-40 rounded-2xl" />
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {tersaring.map((b, i) => (
            <GlassCard
              key={b.id}
              className={cn(
                "flex items-center gap-2.5 p-2.5",
                b.telat && "border border-gagal/30",
                b.status === "alfa" && "opacity-70",
              )}
            >
              <span className="angka-tab w-6 shrink-0 text-center text-[10.5px] font-bold text-teks-sekunder">
                {i + 1}
              </span>
              {b.avatar_url ? (
                <FotoBulat src={b.avatar_url} ukuran={32} />
              ) : (
                <AvatarInisial nama={b.nama} ukuran={32} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold text-teks-utama">{b.nama}</p>
                <p className="truncate text-[10.5px] text-teks-sekunder">
                  {b.divisi || "Tanpa divisi"}
                  {b.zona && ` · ${b.zona}`}
                  {b.waktu && ` · masuk ${jamWIB(b.waktu)}`}
                </p>
                <p
                  className={cn(
                    "text-[10px] font-semibold",
                    b.telat
                      ? "text-gagal"
                      : b.status === "hadir"
                        ? "text-sukses"
                        : "text-teks-sekunder",
                  )}
                >
                  {b.keterangan}
                </p>
              </div>
              <StatusBadge
                label={b.status === "hadir" ? (b.telat ? "telat" : "hadir") : b.status}
                warna={
                  b.status === "hadir"
                    ? b.telat
                      ? "merah"
                      : "hijau"
                    : b.status === "alfa"
                      ? "merah"
                      : "kuning"
                }
              />
            </GlassCard>
          ))}
          {tersaring.length === 0 && (
            <p className="py-8 text-center text-xs text-teks-sekunder">
              Tidak ada anggota yang cocok dengan kombinasi filter.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
