"use client";

// ============================================================
// KirimVideoPanel — panel "Kirim Video untuk Diproses".
// Input link TikTok/Instagram dengan validasi langsung +
// dua kolom opsional (judul overlay & highlight).
// ============================================================

import { useEffect, useState } from "react";
import { CheckCircle2, Link2, Send, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { cn } from "@/lib/utils";

type PayloadProses = {
  link: string;
  judul_overlay?: string;
  highlight?: string;
};

type KirimVideoPanelProps = {
  /** Link yang diisi otomatis dari panel Berita */
  linkAwal: string;
  onMulaiProses: (payload: PayloadProses) => void;
};

/** Link valid bila host-nya tiktok.com / instagram.com (termasuk subdomain) */
function linkValid(link: string): boolean {
  const t = link.trim();
  if (!t) return false;
  try {
    const url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return (
      /(^|\.)tiktok\.com$/.test(url.hostname) ||
      /(^|\.)instagram\.com$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export function KirimVideoPanel({ linkAwal, onMulaiProses }: KirimVideoPanelProps) {
  const [link, setLink] = useState(linkAwal);
  const [judul, setJudul] = useState("");
  const [highlight, setHighlight] = useState("");

  // Sinkronkan input saat link dikirim dari panel Berita
  // (berjalan saat prop linkAwal berubah; di mount nilainya sama)
  useEffect(() => {
    setLink(linkAwal);
  }, [linkAwal]);

  const teks = link.trim();
  const terisi = teks.length > 0;
  const sah = linkValid(teks);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sah) return;
    onMulaiProses({
      link: /^https?:\/\//i.test(teks) ? teks : `https://${teks}`,
      judul_overlay: judul.trim() || undefined,
      highlight: highlight.trim() || undefined,
    });
  }

  return (
    <GlassCard className="p-4 sm:p-5">
      {/* Kepala panel */}
      <div className="flex items-center gap-3">
        <span
          className="glass-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pri"
          aria-hidden="true"
        >
          <Send className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="font-heading text-[15px] font-bold text-teks-utama">
            Kirim Video untuk Diproses
          </h2>
          <p className="text-[11px] text-teks-sekunder">
            Video akan diberi judul overlay otomatis oleh AI
          </p>
        </div>
      </div>

      <form className="mt-4 flex flex-col" onSubmit={submit} noValidate>
        {/* Link video sumber */}
        <div>
          <label
            htmlFor="link-video"
            className="mb-1.5 block text-xs font-semibold text-teks-sekunder"
          >
            Link Video Asli (Doksli)
          </label>
          <div className="relative">
            <Link2 className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-teks-sekunder" />
            <input
              id="link-video"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.tiktok.com/@... atau https://www.instagram.com/reel/..."
              aria-invalid={terisi && !sah}
              className={cn(
                "glass-input h-12 w-full rounded-xl pr-11 pl-11 text-sm text-teks-utama placeholder:text-teks-sekunder/70",
                terisi && sah && "border-sukses/60",
                terisi && !sah && "border-gagal/60",
              )}
            />
            {terisi && sah && (
              <CheckCircle2 className="pointer-events-none absolute top-1/2 right-3.5 h-4.5 w-4.5 -translate-y-1/2 text-sukses" />
            )}
          </div>
          {terisi && !sah && (
            <p className="mt-1.5 text-xs font-medium text-gagal">
              Masukkan link TikTok atau Instagram yang valid
            </p>
          )}
        </div>

        {/* Dua kolom opsional */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="judul-overlay"
              className="mb-1.5 block text-xs font-semibold text-teks-sekunder"
            >
              Judul Overlay
            </label>
            <input
              id="judul-overlay"
              type="text"
              maxLength={60}
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="Opsional"
              className="glass-input h-11 w-full rounded-xl px-3.5 text-sm text-teks-utama placeholder:text-teks-sekunder/70"
            />
          </div>
          <div>
            <label
              htmlFor="highlight"
              className="mb-1.5 block text-xs font-semibold text-teks-sekunder"
            >
              Highlight
            </label>
            <input
              id="highlight"
              type="text"
              maxLength={80}
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              placeholder="Opsional"
              className="glass-input h-11 w-full rounded-xl px-3.5 text-sm text-teks-utama placeholder:text-teks-sekunder/70"
            />
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-teks-sekunder">
          Kosongkan agar AI yang membuatkan otomatis
        </p>

        {/* Tombol proses */}
        <button
          type="submit"
          disabled={!sah}
          className={cn(
            "btn-tekan mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl",
            "font-heading text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40",
          )}
          style={{
            background: "linear-gradient(135deg, #DC2626, #B91C1C)",
            boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
          }}
        >
          <Sparkles className="h-4.5 w-4.5" />
          Proses Video
        </button>
      </form>
    </GlassCard>
  );
}
