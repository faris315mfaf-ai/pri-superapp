"use client";

// ============================================================
// Riwayat TV Rakyat Official (7 Okt 2026) — menggantikan Status Pipeline,
// Riwayat Pemrosesan, dan Log. Tombol "Riwayat" di kepala modul membuka
// lembar samping: tiap video menampilkan siapa yang mengedit, mengirim,
// dan memposting, plus hasil per platform. Di sebelahnya ikon lonceng
// merah muncul bila ada video yang GAGAL tayang (perlu diposting ulang /
// manual) — hilang setelah berhasil diulang atau ditandai "sudah manual".
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BellRing, CheckCircle2, Clock, ExternalLink, History, Loader2, PlayCircle, RotateCcw, X } from "lucide-react";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { toast } from "@/hooks/use-app-store";
import { jamWIB } from "@/lib/format";
import { hrefAman } from "@/lib/href-aman";
import { cn } from "@/lib/utils";
import { getRiwayatTv, tandaiGagalDitangani, type RiwayatTv } from "@/services";
import type { VideoAntrian } from "@/types";

type Saring = "semua" | "gagal";

export function TombolRiwayatTv({
  onBukaVideo,
  bolehTandai,
  muatUlang = 0,
}: {
  /** Buka video di pratinjau unggah (untuk mengulang posting). */
  onBukaVideo: (v: VideoAntrian) => void;
  /** Boleh menandai "sudah diposting manual" (hak unggah Official). */
  bolehTandai: boolean;
  /** Naik setiap ada unggahan baru → hitung ulang lencana. */
  muatUlang?: number;
}) {
  const versiSegar = useVersiSegar();
  const [jumlahGagal, setJumlahGagal] = useState(0);
  const [buka, setBuka] = useState<Saring | null>(null);
  const [detak, setDetak] = useState(0);

  // Lencana: dicek saat masuk, saat ada unggahan, dan tiap 2 menit.
  useEffect(() => {
    let hidup = true;
    getRiwayatTv({ saring: "gagal" })
      .then((r) => {
        if (hidup) setJumlahGagal(r.perlu_manual);
      })
      .catch(() => {});
    const id = window.setInterval(() => setDetak((d) => d + 1), 120_000);
    return () => {
      hidup = false;
      window.clearInterval(id);
    };
  }, [versiSegar, muatUlang, detak]);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setBuka("semua")}
          className="glass btn-tekan flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-teks-utama"
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Riwayat
        </button>
        {jumlahGagal > 0 && (
          <button
            type="button"
            onClick={() => setBuka("gagal")}
            aria-label={`${jumlahGagal} video gagal diposting — perlu posting manual`}
            title="Ada video gagal diposting — perlu posting manual"
            className="btn-tekan relative flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15 text-red-600 ring-1 ring-red-500/30 dark:text-red-400"
          >
            <BellRing className="h-4 w-4" aria-hidden="true" />
            <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {jumlahGagal > 99 ? "99+" : jumlahGagal}
            </span>
          </button>
        )}
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {buka && (
              <LembarRiwayat
                saringAwal={buka}
                jumlahGagal={jumlahGagal}
                bolehTandai={bolehTandai}
                onTutup={() => setBuka(null)}
                onBukaVideo={(v) => {
                  setBuka(null);
                  onBukaVideo(v);
                }}
                onBerubah={() => setDetak((d) => d + 1)}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function LembarRiwayat({
  saringAwal,
  jumlahGagal,
  bolehTandai,
  onTutup,
  onBukaVideo,
  onBerubah,
}: {
  saringAwal: Saring;
  jumlahGagal: number;
  bolehTandai: boolean;
  onTutup: () => void;
  onBukaVideo: (v: VideoAntrian) => void;
  onBerubah: () => void;
}) {
  const [saring, setSaring] = useState<Saring>(saringAwal);
  const [data, setData] = useState<RiwayatTv[] | null>(null);
  const [halaman, setHalaman] = useState(1);
  const [adaLagi, setAdaLagi] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [menandai, setMenandai] = useState<string | null>(null);
  const [galat, setGalat] = useState("");

  const muat = useCallback(async (s: Saring, hal: number) => {
    setMemuat(true);
    try {
      const r = await getRiwayatTv({ halaman: hal, ...(s === "gagal" ? { saring: "gagal" as const } : {}) });
      setData((lama) => (hal === 1 ? r.data : [...(lama ?? []), ...r.data]));
      setAdaLagi(r.ada_lagi);
      setHalaman(hal);
      setGalat("");
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Riwayat gagal dimuat.");
      setData((lama) => lama ?? []);
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => muat(saring, 1));
  }, [saring, muat]);

  useEffect(() => {
    const tutup = (e: KeyboardEvent) => e.key === "Escape" && onTutup();
    window.addEventListener("keydown", tutup);
    return () => window.removeEventListener("keydown", tutup);
  }, [onTutup]);

  async function tandai(v: RiwayatTv) {
    setMenandai(v.id);
    try {
      await tandaiGagalDitangani(v.id);
      toast("sukses", "Ditandai sudah diposting manual");
      onBerubah();
      await muat(saring, 1);
    } catch (e) {
      toast("error", "Gagal menandai", e instanceof Error ? e.message : "");
    } finally {
      setMenandai(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <motion.button
        type="button"
        aria-label="Tutup riwayat"
        onClick={onTutup}
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.aside
        role="dialog"
        aria-label="Riwayat video TV Rakyat Official"
        className="relative flex h-full w-full max-w-[520px] flex-col rounded-l-[28px] bg-[#f4f6fa]/95 shadow-2xl backdrop-blur-xl dark:bg-neutral-900/95"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      >
        <div className="flex items-center gap-3 px-5 pt-5">
          <History className="h-5 w-5 text-pri" aria-hidden="true" />
          <h2 className="flex-1 font-heading text-lg font-bold tracking-tight text-teks-utama">Riwayat Video Official</h2>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="btn-tekan flex h-9 w-9 items-center justify-center rounded-full bg-teks-utama/[0.07] text-teks-utama"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-5 mt-3 grid grid-cols-2 gap-1 rounded-xl bg-teks-utama/[0.06] p-1">
          {(["semua", "gagal"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSaring(s)}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-colors",
                saring === s ? "bg-white text-teks-utama shadow-sm dark:bg-white/15" : "text-teks-sekunder",
              )}
            >
              {s === "semua" ? "Semua video" : "Perlu posting manual"}
              {s === "gagal" && jumlahGagal > 0 && (
                <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{jumlahGagal}</span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          {data === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-teks-sekunder" />
            </div>
          ) : data.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-teks-utama/[0.05] p-6 text-center text-sm text-teks-sekunder">
              {galat || (saring === "gagal" ? "Tidak ada video gagal. Semua aman ✅" : "Belum ada video.")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.map((v) => (
                <BarisRiwayat
                  key={v.id}
                  v={v}
                  bolehTandai={bolehTandai}
                  menandai={menandai === v.id}
                  onBuka={() => onBukaVideo(v)}
                  onTandai={() => void tandai(v)}
                />
              ))}
            </ul>
          )}
          {saring === "semua" && adaLagi && (
            <button
              type="button"
              onClick={() => void muat("semua", halaman + 1)}
              disabled={memuat}
              className="btn-tekan mx-auto mt-4 flex h-10 items-center gap-2 rounded-xl bg-teks-utama/[0.07] px-5 text-[13px] font-semibold text-teks-utama disabled:opacity-60"
            >
              {memuat && <Loader2 className="h-4 w-4 animate-spin" />}
              Muat lebih banyak
            </button>
          )}
        </div>
      </motion.aside>
    </div>
  );
}

const LENCANA: Record<RiwayatTv["hasil_akhir"], { teks: string; kelas: string }> = {
  berhasil: { teks: "Berhasil", kelas: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  sebagian: { teks: "Sebagian gagal", kelas: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  gagal: { teks: "Gagal", kelas: "bg-red-500/15 text-red-700 dark:text-red-400" },
  belum: { teks: "Belum diposting", kelas: "bg-teks-utama/[0.07] text-teks-sekunder" },
};

function BarisRiwayat({
  v,
  bolehTandai,
  menandai,
  onBuka,
  onTandai,
}: {
  v: RiwayatTv;
  bolehTandai: boolean;
  menandai: boolean;
  onBuka: () => void;
  onTandai: () => void;
}) {
  const [gambarRusak, setGambarRusak] = useState(false);
  const lencana = LENCANA[v.hasil_akhir];
  const gagal = v.platform.filter((p) => !p.berhasil);
  return (
    <li
      className={cn(
        "rounded-2xl bg-white/55 p-3 ring-1 ring-black/5 dark:bg-white/[0.06] dark:ring-white/10",
        v.perlu_manual && "ring-2 ring-red-500/40",
      )}
    >
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBuka}
          aria-label="Buka video"
          className="relative h-[76px] w-[58px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-700 to-slate-900"
        >
          {v.thumbnail_url && !gambarRusak ? (
            <img src={v.thumbnail_url} alt="" loading="lazy" onError={() => setGambarRusak(true)} className="h-full w-full object-cover" />
          ) : (
            <PlayCircle className="absolute inset-0 m-auto h-6 w-6 text-white/70" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="line-clamp-2 flex-1 text-[13px] leading-snug font-semibold text-teks-utama">
              {v.judul_overlay || v.judul || v.id}
            </p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold", lencana.kelas)}>
              {v.hasil_akhir === "belum" ? v.status.toLowerCase() : lencana.teks}
            </span>
          </div>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11.5px] text-teks-sekunder">
            <dt>Diedit</dt>
            <dd className="truncate font-medium text-teks-utama">{v.diedit_oleh || "—"}</dd>
            <dt>Dikirim</dt>
            <dd className="truncate">
              <span className="font-medium text-teks-utama">{v.diupload_oleh || "—"}</span> · {jamWIB(v.jam_tanggal)}
            </dd>
            <dt>Diposting</dt>
            <dd className="truncate">
              {v.diposting_oleh || v.diunggah_pada ? (
                <>
                  <span className="font-medium text-teks-utama">{v.diposting_oleh || "—"}</span>
                  {v.diunggah_pada && <> · {jamWIB(v.diunggah_pada)}</>}
                </>
              ) : (
                "belum"
              )}
            </dd>
          </dl>
        </div>
      </div>

      {v.platform.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {v.platform.map((p) =>
            p.berhasil && p.url ? (
              <a
                key={p.platform}
                href={hrefAman(p.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
              >
                <PlatformIcon platform={p.platform} size={12} />
                <CheckCircle2 className="h-3 w-3" />
                <ExternalLink className="h-2.5 w-2.5 opacity-70" />
              </a>
            ) : (
              <span
                key={p.platform}
                title={p.pesan || undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                  p.berhasil ? "bg-sky-500/12 text-sky-700 dark:text-sky-400" : "bg-red-500/12 text-red-700 dark:text-red-400",
                )}
              >
                <PlatformIcon platform={p.platform} size={12} />
                {p.berhasil ? <Clock className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              </span>
            ),
          )}
        </div>
      )}

      {gagal.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-red-700 dark:text-red-400">
          {gagal.map((p) => (
            <li key={p.platform} className="line-clamp-2">
              <b>{labelPlatform(p.platform)}:</b> {p.pesan || "gagal diposting"}
            </li>
          ))}
        </ul>
      )}

      {v.perlu_manual ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBuka}
            className="btn-tekan flex h-8 items-center gap-1.5 rounded-lg bg-pri px-3 text-[12px] font-bold text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Buka & posting ulang
          </button>
          {bolehTandai && (
            <button
              type="button"
              onClick={onTandai}
              disabled={menandai}
              className="btn-tekan flex h-8 items-center gap-1.5 rounded-lg bg-teks-utama/[0.07] px-3 text-[12px] font-semibold text-teks-utama disabled:opacity-60"
            >
              {menandai ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Sudah diposting manual
            </button>
          )}
        </div>
      ) : (
        v.ditangani_oleh && (
          <p className="mt-2 text-[11px] text-teks-sekunder">Diposting manual · ditandai {v.ditangani_oleh}</p>
        )
      )}
    </li>
  );
}
