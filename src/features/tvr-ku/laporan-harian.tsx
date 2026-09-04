"use client";

// ============================================================
// LAPORAN UPLOAD HARIAN — Studio PALUGODAM → tab "Laporan Harian" (4 Sep 2026)
//
// List nama yang upload pada satu tanggal, dari laporan_video (otomatis dari
// unggahan + laporan manual disetujui). Teksnya dirender server memakai
// template dari Panel Master, lalu bisa: Salin, Bagikan WhatsApp, Unduh
// Excel (CSV), Unduh PDF.
// ============================================================

import { useEffect, useState } from "react";
import { Copy, Download, FileSpreadsheet, FileText, Loader2, RefreshCw, Share2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { getLaporanHarian, unduhLaporanHarian, type LaporanHarian } from "@/services";
import { cn } from "@/lib/utils";

function tanggalWibHariIni(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function LaporanHarianPanel() {
  const [tanggal, setTanggal] = useState(tanggalWibHariIni);
  const [data, setData] = useState<LaporanHarian | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [sibuk, setSibuk] = useState<"" | "csv" | "pdf">("");
  const [versi, setVersi] = useState(0);

  useEffect(() => {
    let hidup = true;
    getLaporanHarian(tanggal)
      .then((d) => hidup && setData(d))
      .catch((e) => {
        if (!hidup) return;
        setData(null);
        toast("error", "Laporan gagal dimuat", e instanceof Error ? e.message : "");
      })
      .finally(() => hidup && setMemuat(false));
    return () => {
      hidup = false;
    };
  }, [tanggal, versi]);

  async function salin() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.teks);
      toast("sukses", "Laporan disalin", `${data.jumlah_orang} orang · ${data.jumlah_link} link`);
    } catch {
      toast("error", "Gagal menyalin", "Peramban menolak akses papan klip.");
    }
  }

  async function bagikan() {
    if (!data) return;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text: data.teks });
        return;
      }
    } catch {
      // pengguna membatalkan / tidak didukung → jatuh ke WhatsApp web
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(data.teks)}`, "_blank", "noopener,noreferrer");
  }

  async function unduh(format: "csv" | "pdf") {
    if (sibuk) return;
    setSibuk(format);
    try {
      const r = await unduhLaporanHarian(tanggal, format);
      window.open(r.url, "_blank", "noopener,noreferrer");
      toast("sukses", format === "csv" ? "Excel (CSV) siap diunduh" : "PDF siap diunduh", `${r.jumlah_orang} orang · ${r.jumlah_link} link · tautan berlaku 24 jam`);
    } catch (e) {
      toast("error", "Gagal membuat berkas", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-teks-sekunder">Tanggal (WIB)</span>
          <input
            type="date"
            value={tanggal}
            max={tanggalWibHariIni()}
            onChange={(e) => {
              if (!e.target.value) return;
              setMemuat(true);
              setTanggal(e.target.value);
            }}
            className="glass-input mt-1 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setMemuat(true);
            setVersi((v) => v + 1);
          }}
          disabled={memuat}
          aria-label="Muat ulang laporan"
          className="btn-tekan glass flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-teks-utama disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", memuat && "animate-spin")} aria-hidden="true" />
        </button>
      </div>

      {memuat && !data ? (
        <GlassSkeleton className="mt-3 h-40 rounded-2xl" />
      ) : data ? (
        <>
          <div className="mt-3 flex items-center gap-2 text-[11.5px] text-teks-sekunder">
            <span className="rounded-full bg-black/[0.05] px-2 py-0.5 font-bold text-teks-utama dark:bg-white/10">{data.jumlah_orang} orang</span>
            <span className="rounded-full bg-black/[0.05] px-2 py-0.5 font-bold text-teks-utama dark:bg-white/10">{data.jumlah_link} link</span>
            <span className="truncate">{data.tanggal_panjang}</span>
            {data.template_bawaan ? <span className="ml-auto shrink-0 text-[10px]">format bawaan</span> : <span className="ml-auto shrink-0 text-[10px] text-pri">format master</span>}
          </div>

          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-black/[0.04] p-3 font-sans text-[11.5px] leading-relaxed text-teks-utama dark:bg-white/[0.06]">
            {data.teks}
          </pre>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void salin()}
              className="btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Salin laporan
            </button>
            <button
              type="button"
              onClick={() => void bagikan()}
              className="btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Bagikan WhatsApp
            </button>
            <button
              type="button"
              onClick={() => void unduh("csv")}
              disabled={Boolean(sibuk)}
              className="btn-tekan glass flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-teks-utama disabled:opacity-50"
            >
              {sibuk === "csv" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
              Unduh Excel (CSV)
            </button>
            <button
              type="button"
              onClick={() => void unduh("pdf")}
              disabled={Boolean(sibuk)}
              className="btn-tekan glass flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-teks-utama disabled:opacity-50"
            >
              {sibuk === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
              Unduh PDF
            </button>
          </div>
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-[10.5px] text-teks-sekunder">
            <Download className="h-3 w-3" aria-hidden="true" />
            Berkas dibuat di server, tautan unduhan berlaku 24 jam. Format teks diatur master di Panel Master.
          </p>
        </>
      ) : (
        <p className="mt-3 text-center text-[11.5px] text-teks-sekunder">Laporan tidak bisa dimuat.</p>
      )}
    </GlassCard>
  );
}
