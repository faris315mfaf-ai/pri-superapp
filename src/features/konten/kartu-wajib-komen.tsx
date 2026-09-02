"use client";

// ============================================================
// KartuWajibKomen — daftar postingan resmi yang WAJIB dikomentari kader
// hari ini, dengan status komentar yang DIVERIFIKASI dari komentar asli
// (rekap QC), bukan laporan-diri. Sumbernya postingan yang di-scrape
// otomatis dari Ayrshare (+ pipeline n8n). Tampil di modul Konten.
//
// Beda dari KartuVideoBaru: kartu itu laporan-diri untuk video unggahan
// aplikasi; kartu ini kepatuhan komentar terverifikasi untuk SEMUA
// postingan akun wajib (termasuk yang diposting langsung di sosmed).
//
// Refresh (2 Sep 2026): tombol ↻ di kepala kartu memuat ulang daftar
// (mis. setelah berkomentar, untuk melihat statusnya berubah) — juga ikut
// tombol refresh sistem di kanan atas lewat versiSegar.
// ============================================================

import { useEffect, useState } from "react";
import { Check, Clock, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FadeInUp, GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getWajibKomen, type WajibKomenItem } from "@/services";
import { cn } from "@/lib/utils";

const LABEL_PLATFORM: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};

export function KartuWajibKomen() {
  const versiSegar = useVersiSegar();
  const [data, setData] = useState<WajibKomenItem[] | null>(null);
  const [berputar, setBerputar] = useState(false);
  // Postingan yang tombol "Komentari"-nya sudah diklik: tampilkan
  // "menunggu verifikasi" sampai sinkron berikutnya memastikan komentarnya.
  const [diklik, setDiklik] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getWajibKomen();
        if (hidup) setData(hasil.data);
      } catch {
        if (hidup) setData([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [versiSegar]);

  /** Tombol ↻ kartu: muat ulang daftar dengan umpan balik putaran. */
  function segarkan() {
    if (berputar) return;
    setBerputar(true);
    getWajibKomen()
      .then((hasil) => {
        setData(hasil.data);
        // Status sudah diverifikasi ulang — tanda "menunggu" boleh dilepas
        // untuk yang kini tercatat sudah komentar (otomatis lewat sudah_komentar).
      })
      .catch((e) => toast("error", "Gagal menyegarkan", e instanceof Error ? e.message : ""))
      .finally(() => setBerputar(false));
  }

  function buka(item: WajibKomenItem) {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
    setDiklik((lama) => {
      const baru = new Set(lama);
      baru.add(item.id_postingan);
      return baru;
    });
  }

  if (data !== null && data.length === 0) return null;
  const belum = (data ?? []).filter((d) => !d.sudah_komentar).length;

  return (
    <FadeInUp delay={0.12}>
      <GlassCard className="mt-4 p-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4.5 w-4.5 text-pri" aria-hidden="true" />
          <p className="font-heading text-sm font-bold text-teks-utama">
            Wajib Dikomentari Hari Ini
          </p>
          {belum > 0 && (
            <span className="angka-tab rounded-full bg-gagal/15 px-2 text-[11px] font-bold text-gagal">
              {belum} belum
            </span>
          )}
          <button
            type="button"
            onClick={segarkan}
            disabled={berputar}
            aria-label="Segarkan daftar wajib dikomentari"
            title="Segarkan"
            className="glass btn-tekan ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-teks-utama disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", berputar && "animate-spin")} />
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-teks-sekunder">
          Beri komentar di tiap postingan resmi. Status dicek otomatis dari komentar asli
          Anda — tak perlu menandai sendiri. Ketuk ↻ untuk memeriksa ulang.
        </p>

        <div className="scrollbar-tipis mt-3 flex max-h-96 flex-col gap-2 overflow-y-auto">
          {data === null ? (
            <GlassSkeleton className="h-16 rounded-xl" />
          ) : (
            data.map((item) => {
              const menunggu = diklik.has(item.id_postingan) && !item.sudah_komentar;
              return (
                <div
                  key={`${item.platform}-${item.id_postingan}`}
                  className="glass-soft flex items-center gap-3 rounded-xl p-2.5"
                >
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                      aria-hidden="true"
                    >
                      <MessageCircle className="h-6 w-6" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-teks-sekunder">
                      {LABEL_PLATFORM[item.platform] ?? item.platform}
                      {item.akun ? ` · ${item.akun}` : ""}
                    </p>
                    <p className="line-clamp-2 text-[12px] text-teks-utama">
                      {item.caption || "(tanpa caption)"}
                    </p>
                  </div>
                  {item.sudah_komentar ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-sukses/12 px-2 py-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" /> Sudah
                    </span>
                  ) : menunggu ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-black/5 px-2 py-1.5 text-[11px] font-semibold text-teks-sekunder dark:bg-white/10">
                      <Clock className="h-3.5 w-3.5" /> Menunggu
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => buka(item)}
                      className="btn-tekan flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Komentari
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </GlassCard>
    </FadeInUp>
  );
}
