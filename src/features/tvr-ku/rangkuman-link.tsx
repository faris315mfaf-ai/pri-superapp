"use client";

// ============================================================
// RangkumanLink (TVR Saya, 3 Sep 2026) — merangkum semua tautan video
// pengguna pada satu tanggal per sosmed ke format laporan WhatsApp:
//   Nama : … / Tanggal : … / INSTAGRAM 1. … 2. … / TIKTOK … / X … / dst.
// + kotak kendala → Generate → Salin / Bagikan ke WhatsApp (pengguna memilih
// grup tujuan di aplikasi WhatsApp-nya sendiri).
// ============================================================

import { useEffect, useState } from "react";
import { Copy, FileText, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { getRangkumanLink, type RangkumanLink as DataRangkuman } from "@/services";
import { tanggalIndonesia } from "@/lib/format";
import { cn } from "@/lib/utils";

const URUTAN: [string, string][] = [
  ["instagram", "INSTAGRAM"],
  ["tiktok", "TIKTOK"],
  ["twitter", "X"],
  ["facebook", "FACEBOOK"],
  ["youtube", "YOUTUBE"],
  ["threads", "THREADS"],
];
const KENDALA_MAKS = 600;

function tanggalWibPerangkat(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Susun teks laporan persis format yang diminta (baris kosong antar bagian). */
export function susunLaporan(d: DataRangkuman, kendala: string): string {
  const baris: string[] = [`Nama : ${d.nama}`, `Tanggal : ${tanggalIndonesia(`${d.tanggal}T00:00:00+07:00`)}`, ""];
  for (const [kunci, judul] of URUTAN) {
    const daftar = d.per_platform[kunci] ?? [];
    baris.push(judul, "");
    if (daftar.length === 0) baris.push("-");
    else daftar.forEach((u, i) => baris.push(`${i + 1}. ${u}`));
    baris.push("");
  }
  baris.push("KENDALA :", kendala.trim() || "-");
  return baris.join("\n");
}

export function RangkumanLink() {
  const [tanggal, setTanggal] = useState(tanggalWibPerangkat);
  const [data, setData] = useState<DataRangkuman | null>(null);
  const [kendala, setKendala] = useState("");
  const [teks, setTeks] = useState("");
  // "Memuat" diturunkan dari state: data belum ada / masih milik tanggal lain.
  const memuat = data === null || data.tanggal !== tanggal;

  useEffect(() => {
    let hidup = true;
    getRangkumanLink(tanggal)
      .then((d) => hidup && setData(d))
      .catch((e) => hidup && toast("error", "Gagal memuat tautan", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, [tanggal]);

  function generate() {
    if (!data) return;
    setTeks(susunLaporan(data, kendala));
    toast("sukses", "Laporan tersusun", "Periksa, lalu Salin atau Bagikan ke WhatsApp.");
  }

  async function salin() {
    try {
      await navigator.clipboard.writeText(teks);
      toast("sukses", "Laporan disalin");
    } catch {
      toast("peringatan", "Tidak bisa menyalin otomatis", "Blok teksnya lalu salin manual.");
    }
  }

  async function bagikan() {
    if (!teks) return;
    // Tautan resmi WhatsApp tanpa nomor → aplikasi WhatsApp membuka pemilih
    // kontak/grup, pengguna memilih grup tujuannya sendiri.
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(teks)}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text: teks });
        return;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // jatuh ke tautan WhatsApp
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const jumlah = data?.jumlah ?? 0;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
          <FileText className="h-4 w-4 text-pri" /> Rangkuman Link Harian
        </p>
        <input
          type="date"
          value={tanggal}
          max={tanggalWibPerangkat()}
          onChange={(e) => {
            if (!e.target.value) return;
            setTeks("");
            setTanggal(e.target.value);
          }}
          aria-label="Tanggal laporan"
          className="glass-input h-9 rounded-lg px-2 text-[12px] text-teks-utama"
        />
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
        Semua tautan video Anda pada tanggal itu dikumpulkan per sosmed (unggahan lewat aplikasi otomatis tercatat,
        laporan manual ikut setelah disetujui HR), lalu disusun jadi laporan siap kirim ke grup WhatsApp.
      </p>

      {/* Ringkasan per platform */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {URUTAN.map(([kunci, judul]) => {
          const n = data?.per_platform[kunci]?.length ?? 0;
          return (
            <div key={kunci} className={cn("glass-soft flex flex-col items-center rounded-xl py-2", n === 0 && "opacity-60")}>
              <PlatformIcon platform={kunci} size={14} />
              <span className="mt-0.5 text-[9.5px] font-bold text-teks-sekunder">{judul}</span>
              <span className="angka-tab text-[14px] font-extrabold text-teks-utama">{memuat ? "…" : n}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-teks-sekunder">
        {memuat ? "Memuat tautan…" : `${jumlah} tautan tercatat`}
        {data && data.menunggu.length > 0 ? ` · ${data.menunggu.length} laporan manual masih menunggu ACC HR (belum masuk rangkuman)` : ""}
      </p>

      <textarea
        value={kendala}
        onChange={(e) => setKendala(e.target.value.slice(0, KENDALA_MAKS))}
        rows={3}
        maxLength={KENDALA_MAKS}
        placeholder="Kendala hari ini (opsional) — mis. akun TikTok kena limit, sinyal lemah…"
        className="glass-input mt-3 w-full rounded-xl px-3 py-2 text-[12.5px] text-teks-utama"
      />
      <button
        type="button"
        onClick={generate}
        disabled={!data || memuat}
        className="btn-tekan mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #7C3AED, #4F46E5)" }}
      >
        {memuat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate laporan
      </button>

      {teks ? (
        <>
          <textarea
            readOnly
            value={teks}
            rows={Math.min(22, teks.split("\n").length + 1)}
            aria-label="Teks laporan"
            className="glass-input mt-3 w-full rounded-xl px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre text-teks-utama"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void salin()}
              className="glass btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-teks-utama"
            >
              <Copy className="h-4 w-4" /> Salin
            </button>
            <button
              type="button"
              onClick={() => void bagikan()}
              className="btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}
            >
              <Send className="h-4 w-4" /> Bagikan ke WhatsApp
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-teks-sekunder">
            <RefreshCw className="h-3 w-3" /> Setelah menekan Bagikan, pilih grup tujuan di WhatsApp Anda.
          </p>
        </>
      ) : null}
    </GlassCard>
  );
}
