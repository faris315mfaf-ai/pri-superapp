"use client";

// ============================================================
// Kartu "Server Auto Edit" di Beranda master (5 Okt 2026).
//
// Kondisi VPS mesin (KVM 8, 72.61.143.158): kapasitas disk media video
// (stok, template, unggahan) dengan peringatan bila hampir penuh, antrean &
// beban render, serta akun yang paling banyak memakai penyimpanan. Disegarkan
// tiap menit selama layar terlihat.
// ============================================================

import { useCallback, useState } from "react";
import { AlertTriangle, Cpu, HardDrive, Loader2, RotateCcw, Server, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { getStatusMesinAutoEdit, type StatusMesinAutoEdit } from "@/services";
import { cn } from "@/lib/utils";

function ukuran(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB` : `${Math.round(mb)} MB`;
}

function Bilah({ persen, kelas }: { persen: number; kelas?: string }) {
  return (
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" aria-hidden="true">
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", kelas)}
        style={{ width: `${Math.max(1.5, Math.min(100, persen))}%` }}
      />
    </div>
  );
}

export function KartuServerAutoEdit() {
  const [data, setData] = useState<StatusMesinAutoEdit | null>(null);
  const [galat, setGalat] = useState("");
  const [memuat, setMemuat] = useState(false);

  const muat = useCallback(() => {
    setMemuat(true);
    getStatusMesinAutoEdit()
      .then((d) => {
        setData(d);
        setGalat("");
      })
      .catch((e) => setGalat(e instanceof Error ? e.message : "Server Auto Edit tidak bisa dihubungi."))
      .finally(() => setMemuat(false));
  }, []);
  useSegarOtomatis(muat, 60);

  if (!data) {
    return (
      <GlassCard className="flex items-center gap-2 p-4">
        {galat ? (
          <>
            <AlertTriangle className="h-4 w-4 shrink-0 text-gagal" />
            <p className="min-w-0 flex-1 text-[12px] text-teks-utama">{galat}</p>
            <button type="button" onClick={muat} className="glass btn-tekan rounded-lg p-1.5" aria-label="Coba lagi">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-teks-sekunder" />
            <p className="text-[12px] text-teks-sekunder">Memeriksa server Auto Edit…</p>
          </>
        )}
      </GlassCard>
    );
  }

  const { disk, render, beban } = data;
  const persenDisk = disk.total_mb > 0 ? (100 * disk.dipakai_mb) / disk.total_mb : 0;
  const warnaDisk = persenDisk >= 90 ? "bg-gagal" : persenDisk >= 80 ? "bg-amber-500" : "bg-sukses";
  const persenCpu = beban.cpu > 0 ? Math.min(100, (100 * beban.load1) / beban.cpu) : 0;
  const ramDipakai = beban.ram_total_mb - beban.ram_sisa_mb;
  const persenRam = beban.ram_total_mb > 0 ? (100 * ramDipakai) / beban.ram_total_mb : 0;
  const maksPakai = Math.max(1, ...data.pemakaian.map((p) => p.mb));

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #0EA5E9, #2563EB)" }}
          aria-hidden="true"
        >
          <Server className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[14px] font-bold text-teks-utama">Server Auto Edit</p>
          <p className="text-[10.5px] text-teks-sekunder">
            VPS KVM 8 · diperbarui{" "}
            {new Date(data.waktu * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          type="button"
          onClick={muat}
          disabled={memuat}
          aria-label="Segarkan"
          className="glass btn-tekan rounded-lg p-1.5 text-teks-sekunder disabled:opacity-50"
        >
          <RotateCcw className={cn("h-3.5 w-3.5", memuat && "animate-spin")} />
        </button>
      </div>

      {/* Disk media video */}
      <div className="mt-3">
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-teks-utama">
          <HardDrive className="h-3.5 w-3.5 text-pri" /> Disk video
          <span className="ml-auto font-normal text-teks-sekunder">
            {ukuran(disk.dipakai_mb)} / {ukuran(disk.total_mb)} · sisa {ukuran(disk.sisa_mb)}
          </span>
        </p>
        <Bilah persen={persenDisk} kelas={warnaDisk} />
        {persenDisk >= 80 && (
          <p className="mt-1.5 flex gap-1.5 rounded-lg bg-amber-500/10 p-2 text-[11px] text-teks-utama">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            Disk video {Math.round(persenDisk)}% terpakai. Bila penuh, unggahan & render baru berhenti — kurangi kuota
            atau perbesar disk media.
          </p>
        )}
      </div>

      {/* Render & beban */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <Angka label="dirender" nilai={`${render.berjalan}/${render.slot}`} />
        <Angka label="mengantre" nilai={String(render.antre)} />
        <Angka
          label="worker"
          nilai={render.worker_aktif ? "Hidup" : "Mati"}
          kelas={render.worker_aktif ? "text-sukses" : "text-gagal"}
        />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-3">
        <div>
          <p className="flex items-center gap-1 text-[10.5px] text-teks-sekunder">
            <Cpu className="h-3 w-3" /> CPU {Math.round(persenCpu)}% ({beban.cpu} core)
          </p>
          <Bilah persen={persenCpu} kelas={persenCpu >= 90 ? "bg-gagal" : persenCpu >= 70 ? "bg-amber-500" : "bg-sky-500"} />
        </div>
        <div>
          <p className="text-[10.5px] text-teks-sekunder">
            RAM {ukuran(ramDipakai)} / {ukuran(beban.ram_total_mb)}
          </p>
          <Bilah persen={persenRam} kelas={persenRam >= 90 ? "bg-gagal" : "bg-sky-500"} />
        </div>
      </div>

      {/* Pemakaian per akun */}
      {data.pemakaian.length > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-teks-utama">
            <Users className="h-3.5 w-3.5 text-pri" /> Pemakaian terbanyak
            <span className="ml-auto font-normal text-teks-sekunder">{data.jumlah_pemilik} akun</span>
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {data.pemakaian.map((p) => (
              <li key={p.pemilik}>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate text-teks-utama">{p.nama}</span>
                  <span className="shrink-0 text-teks-sekunder">
                    {ukuran(p.mb)}
                    {p.batas_mb > 0 && ` / ${ukuran(p.batas_mb)}`}
                  </span>
                </div>
                <Bilah
                  persen={(100 * p.mb) / maksPakai}
                  kelas={p.batas_mb > 0 && p.mb >= p.batas_mb * 0.9 ? "bg-amber-500" : "bg-pri"}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}

function Angka({ label, nilai, kelas }: { label: string; nilai: string; kelas?: string }) {
  return (
    <div className="glass-soft rounded-xl px-1.5 py-2">
      <p className={cn("text-[14px] font-extrabold text-teks-utama", kelas)}>{nilai}</p>
      <p className="text-[9.5px] text-teks-sekunder">{label}</p>
    </div>
  );
}
