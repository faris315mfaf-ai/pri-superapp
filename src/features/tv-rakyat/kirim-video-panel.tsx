"use client";

// ============================================================
// KirimVideoPanel — panel "Kirim Video untuk Diproses".
//
// Kolom link di sini adalah LINK DOKSLI (video asli tanpa
// watermark) yang DICARI DAN DIISI SENDIRI oleh admin. Panel
// Berita di atas hanya menandai video mana yang akan direplikasi;
// linknya sengaja tidak disalin ke sini, karena yang dibutuhkan
// pipeline adalah doksli-nya, bukan link postingan aslinya.
// ============================================================

import { useState } from "react";
import { CheckCircle2, Film, Link2, Send, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon } from "@/components/platform-icon";
import type { Berita } from "@/types";
import { cn } from "@/lib/utils";

type PayloadProses = {
  link: string;
  video_asli?: string;
  judul_overlay?: string;
  highlight?: string;
  sumber_akun?: string;
  caption_sumber?: string;
};

type KirimVideoPanelProps = {
  /** Video sumber yang dipilih di panel Berita (boleh null) */
  videoSumber: Berita | null;
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

export function KirimVideoPanel({ videoSumber, onMulaiProses }: KirimVideoPanelProps) {
  const [link, setLink] = useState("");
  const [judul, setJudul] = useState("");
  const [highlight, setHighlight] = useState("");

  const teks = link.trim();
  const terisi = teks.length > 0;
  const sah = linkValid(teks);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sah) return;
    const doksli = /^https?:\/\//i.test(teks) ? teks : `https://${teks}`;
    onMulaiProses({
      // `link` = postingan sumber yang direplikasi (kalau ada),
      // `video_asli` = doksli yang benar-benar diunduh & dirender.
      link: videoSumber?.link_video || doksli,
      video_asli: doksli,
      judul_overlay: judul.trim() || undefined,
      highlight: highlight.trim() || undefined,
      sumber_akun: videoSumber?.sumber_akun || undefined,
      caption_sumber: videoSumber?.ringkasan || undefined,
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

      {/* Video sumber yang sedang direplikasi — muncul hanya bila admin
          sudah memilih satu di panel Berita di atas. Ini yang memberi
          konteks "doksli untuk video yang mana". */}
      {videoSumber && (
        <div className="glass-soft mt-4 flex items-start gap-2.5 rounded-xl p-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-pri"
            aria-hidden="true"
          >
            <Film className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold tracking-wide text-teks-sekunder uppercase">
              Video yang direplikasi
            </p>
            <p className="line-clamp-2 text-xs leading-snug font-semibold text-teks-utama">
              {videoSumber.judul}
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <PlatformIcon platform={videoSumber.platform_asal} size={11} />
              <span className="text-[10.5px] text-teks-sekunder">
                {videoSumber.sumber} · {videoSumber.waktu_relatif}
              </span>
            </div>
          </div>
        </div>
      )}

      <form className="mt-4 flex flex-col" onSubmit={submit} noValidate>
        {/* Link doksli — dicari & diisi admin sendiri */}
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
