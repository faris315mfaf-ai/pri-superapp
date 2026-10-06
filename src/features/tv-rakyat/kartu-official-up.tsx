"use client";

// ============================================================
// KartuOfficialUp (7 Okt 2026) — meminta tim TV Rakyat Official menautkan
// akun sosmed resmi ke upload-post. Selama belum ada akun tertaut, kartu
// tampil mencolok di modul; sesudahnya jadi baris ringkas berisi platform
// yang tertaut (+ peringatan login ulang). Konten Official di modul Konten
// otomatis memakai profil ini.
// ============================================================

import { useEffect, useState } from "react";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getOfficialUp, tautkanOfficialUp } from "@/services";

const PLATFORM = ["instagram", "tiktok", "youtube", "facebook", "threads"];

export function KartuOfficialUp() {
  const versiSegar = useVersiSegar();
  const [data, setData] = useState<{ akun: Record<string, string>; perlu_ulang: string[] } | null>(null);
  const [membuka, setMembuka] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    // Saat pengguna kembali dari halaman penautan, status disegarkan.
    const muat = () =>
      getOfficialUp()
        .then((r) => {
          if (hidup) setData(r);
        })
        .catch(() => {});
    void muat();
    const saatKembali = () => {
      if (document.visibilityState === "visible") void muat();
    };
    document.addEventListener("visibilitychange", saatKembali);
    return () => {
      hidup = false;
      document.removeEventListener("visibilitychange", saatKembali);
    };
  }, [versiSegar]);

  async function tautkan(platform?: string) {
    setMembuka(platform ?? "semua");
    // Jendela dibuka SEBELUM menunggu server supaya tidak diblokir peramban.
    const jendela = window.open("", "_blank");
    try {
      const url = await tautkanOfficialUp(platform);
      if (jendela) jendela.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      jendela?.close();
      toast("error", "Gagal membuka penautan", e instanceof Error ? e.message : "");
    } finally {
      setMembuka(null);
    }
  }

  if (!data) return null;
  const tertaut = PLATFORM.filter((p) => data.akun[p]);
  const belum = tertaut.length === 0;

  return (
    <GlassCard className={belum ? "rounded-[24px] p-4 ring-2 ring-pri/40" : "rounded-[24px] px-4 py-3"}>
      {belum ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pri/12 text-pri">
            <Link2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-teks-utama">Tim TV Rakyat Official: tautkan akun resmi ke upload-post</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-teks-sekunder">
              Login akun Instagram, TikTok, YouTube, Facebook (Page), dan Threads milik TV Rakyat Official di halaman
              penautan. Setelah tertaut, konten Official terbaru tampil otomatis di modul Konten.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void tautkan()}
            disabled={membuka !== null}
            className="btn-tekan flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {membuka ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Tautkan sekarang
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-teks-sekunder">Akun Official di upload-post:</span>
          {PLATFORM.map((p) => {
            const ada = Boolean(data.akun[p]);
            const ulang = data.perlu_ulang.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => (!ada || ulang ? void tautkan(p) : undefined)}
                title={ada ? `@${data.akun[p]}${ulang ? " — perlu login ulang" : ""}` : `Tautkan ${labelPlatform(p)}`}
                className={
                  ulang
                    ? "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11.5px] font-semibold text-amber-700 dark:text-amber-400"
                    : ada
                      ? "inline-flex cursor-default items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-400"
                      : "btn-tekan inline-flex items-center gap-1 rounded-full border border-dashed border-teks-sekunder/40 px-2.5 py-1 text-[11.5px] font-semibold text-teks-sekunder"
                }
              >
                <PlatformIcon platform={p} size={12} />
                {ulang ? <AlertTriangle className="h-3 w-3" /> : ada ? `@${data.akun[p]}` : "+ tautkan"}
              </button>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
