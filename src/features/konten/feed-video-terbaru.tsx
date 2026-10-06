"use client";

// ============================================================
// Feed "Video terbaru TV Rakyat" + ringkasan 24 jam (7 Okt 2026) — modul
// Konten untuk semua pengguna. Sumber: katalog upload-post
// (/api/konten/terbaru ← tvr_video_metrik), bukan Ayrshare.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Eye, Film, Heart, Loader2, MessageCircle, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { formatAngkaRingkas } from "@/lib/format";
import { hrefAman } from "@/lib/href-aman";
import { getKontenTerbaru, type RingkasanKonten24j, type VideoKontenTerbaru } from "@/services";

const waktuRelatif = (iso: string | null) => {
  if (!iso) return "";
  const menit = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (menit < 60) return `${menit} mnt`;
  const jam = Math.round(menit / 60);
  if (jam < 24) return `${jam} jam`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
};

/** Data feed bersama (strip ringkasan & grid memakai satu tarikan). */
export function useKontenTerbaru(aktif = true) {
  const versi = useVersiSegar();
  const [data, setData] = useState<VideoKontenTerbaru[] | null>(null);
  const [ringkasan, setRingkasan] = useState<RingkasanKonten24j | null>(null);
  const [halaman, setHalaman] = useState(1);
  const [adaLagi, setAdaLagi] = useState(false);
  const [memuatLagi, setMemuatLagi] = useState(false);
  const [galat, setGalat] = useState(false);

  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    getKontenTerbaru(1)
      .then((r) => {
        if (!hidup) return;
        setData(r.data);
        setRingkasan(r.ringkasan ?? null);
        setAdaLagi(r.ada_lagi);
        setHalaman(1);
        setGalat(false);
      })
      .catch(() => {
        if (hidup) {
          setData((d) => d ?? []);
          setGalat(true);
        }
      });
    return () => {
      hidup = false;
    };
  }, [versi, aktif]);

  const muatLagi = useCallback(async () => {
    if (memuatLagi) return;
    setMemuatLagi(true);
    try {
      const r = await getKontenTerbaru(halaman + 1);
      setData((d) => {
        const ada = new Set((d ?? []).map((v) => v.id));
        return [...(d ?? []), ...r.data.filter((v) => !ada.has(v.id))];
      });
      setAdaLagi(r.ada_lagi);
      setHalaman((h) => h + 1);
    } catch {
      setGalat(true);
    } finally {
      setMemuatLagi(false);
    }
  }, [halaman, memuatLagi]);

  return { data, ringkasan, adaLagi, memuatLagi, muatLagi, galat };
}

export function RingkasanKonten({ ringkasan }: { ringkasan: RingkasanKonten24j | null | undefined }) {
  const ubin: [typeof Film, string, number | undefined, string][] = [
    [Film, "Video 24 jam", ringkasan?.video, "#FF2D55"],
    [Eye, "Tayangan 24 jam", ringkasan?.tayangan, "#0A84FF"],
    [Heart, "Suka 24 jam", ringkasan?.suka, "#FF3B30"],
    [Users, "Akun aktif", ringkasan?.akun, "#34C759"],
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      {ubin.map(([Ikon, label, nilai, warna]) => (
        <GlassCard key={label} className="min-w-0 rounded-[20px] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${warna} 16%, transparent)`, color: warna }}>
              <Ikon className="h-[15px] w-[15px]" />
            </span>
            <span className="min-w-0 truncate text-[10.5px] font-bold tracking-[0.06em] text-teks-sekunder uppercase">{label}</span>
          </div>
          <p className="angka-tab mt-2.5 text-[26px] leading-none font-bold tracking-[-0.03em] text-teks-utama">
            {nilai === undefined ? "—" : formatAngkaRingkas(nilai)}
          </p>
        </GlassCard>
      ))}
    </div>
  );
}

export function FeedVideoTerbaru({ feed }: { feed: ReturnType<typeof useKontenTerbaru> }) {
  const { data, adaLagi, memuatLagi, muatLagi, galat } = feed;
  return (
    <GlassCard className="rounded-[24px] p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-heading text-[17px] font-bold tracking-tight text-teks-utama">Video terbaru TV Rakyat</h2>
        <span className="text-[11px] text-teks-sekunder">dari seluruh akun anggota</span>
      </div>
      {data === null ? (
        <div className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {Array.from({ length: 8 }, (_, i) => <GlassSkeleton key={i} className="aspect-[4/5] rounded-2xl" />)}
        </div>
      ) : data.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-teks-utama/[0.05] p-5 text-center text-sm text-teks-sekunder">
          {galat ? "Video terbaru gagal dimuat. Coba lagi sebentar." : "Belum ada video tercatat."}
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {data.map((v) => <KartuVideo key={v.id} v={v} />)}
          </div>
          {adaLagi && (
            <button
              type="button"
              onClick={() => void muatLagi()}
              disabled={memuatLagi}
              className="btn-tekan mx-auto mt-4 flex h-10 items-center gap-2 rounded-xl bg-teks-utama/[0.07] px-5 text-[13px] font-semibold text-teks-utama disabled:opacity-60"
            >
              {memuatLagi && <Loader2 className="h-4 w-4 animate-spin" />}
              Muat lebih banyak
            </button>
          )}
        </>
      )}
    </GlassCard>
  );
}

function KartuVideo({ v }: { v: VideoKontenTerbaru }) {
  const [gambarRusak, setGambarRusak] = useState(false);
  return (
    <a
      href={hrefAman(v.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-tekan group flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white/50 shadow-sm ring-1 ring-black/5 transition-transform hover:-translate-y-0.5 dark:bg-white/[0.06] dark:ring-white/10"
    >
      <span className="relative block aspect-[4/5] overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900">
        {v.thumbnail && !gambarRusak && (
          <img
            src={v.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setGambarRusak(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        )}
        <span className="absolute top-2 left-2 rounded-lg bg-white/90 p-1 shadow-sm"><PlatformIcon platform={v.platform} size={14} /></span>
        <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10.5px] font-bold text-white">
          <Eye className="h-3 w-3" />{formatAngkaRingkas(v.tayangan)}
        </span>
      </span>
      <span className="flex flex-col gap-1.5 p-2.5">
        <span className="flex items-center gap-1.5">
          {v.akun.avatar_url ? (
            <img src={v.akun.avatar_url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
          ) : (
            <AvatarInisial nama={v.akun.nama || v.akun.username} ukuran={20} />
          )}
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-teks-utama">{v.akun.nama || `@${v.akun.username}`}</span>
          <span className="shrink-0 text-[10.5px] text-teks-sekunder">{waktuRelatif(v.waktu)}</span>
        </span>
        {v.judul && <span className="line-clamp-2 text-[12px] leading-snug text-teks-utama/85">{v.judul}</span>}
        <span className="flex items-center gap-3 text-[10.5px] text-teks-sekunder">
          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{formatAngkaRingkas(v.suka)}</span>
          <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatAngkaRingkas(v.komentar)}</span>
        </span>
      </span>
    </a>
  );
}
