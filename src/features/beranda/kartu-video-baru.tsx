"use client";

// ============================================================
// KartuVideoBaru — kewajiban interaksi atas video TV Rakyat yang
// baru tayang (7 hari terakhir): KOMENTAR di platform + SHARE ke
// grup WhatsApp. Tampil di Beranda anggota.
//
// Tombol Share membuka lembar bagikan WhatsApp dengan teks + link
// video, lalu otomatis dicatat "sudah share". Tombol komentar
// membuka postingannya; setelah berkomentar, anggota menandainya.
// ============================================================

import { useEffect, useState } from "react";
import { Check, Clock, MessageCircle, PlaySquare, Share2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FadeInUp, GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  getInteraksiVideo,
  tandaiInteraksiVideo,
  type VideoInteraksi,
} from "@/services";
import { pesanBagikanVideo } from "@/lib/format";
import { urlEmbedDari } from "@/lib/embed-sosmed";
import { cn } from "@/lib/utils";

/** Jam upload PRESISI (fitur 1.20/7): "17:03:42 WIB · 28/08". */
function jamPresisiWib(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 7 * 3600_000);
  const dua = (n: number) => String(n).padStart(2, "0");
  return `${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())}:${dua(d.getUTCSeconds())} WIB · ${dua(d.getUTCDate())}/${dua(d.getUTCMonth() + 1)}`;
}

/**
 * Tautan pertama yang BISA di-embed, diprioritaskan platform yang
 * pemutarnya paling andal di dalam aplikasi.
 */
function embedTerbaik(v: VideoInteraksi): { src: string; platform: string } | null {
  const urutan = ["instagram", "tiktok", "youtube", "facebook"];
  const tautan = [...v.tautan].sort(
    (a, b) => urutan.indexOf(a.platform) - urutan.indexOf(b.platform),
  );
  for (const t of tautan) {
    const src = urlEmbedDari(t.platform, t.url);
    if (src) return { src, platform: t.platform };
  }
  if (v.link) {
    const src = urlEmbedDari("instagram", v.link);
    if (src) return { src, platform: "instagram" };
  }
  return null;
}

export function KartuVideoBaru() {
  const [daftar, setDaftar] = useState<VideoInteraksi[] | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getInteraksiVideo();
        if (hidup) setDaftar(hasil);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function tandai(kode: string, jenis: "komen" | "share") {
    // Optimis: tombol langsung berubah; server menyimpannya idempoten.
    setDaftar((lama) =>
      (lama ?? []).map((v) =>
        v.kode === kode
          ? { ...v, [jenis === "komen" ? "sudah_komen" : "sudah_share"]: true }
          : v,
      ),
    );
    try {
      await tandaiInteraksiVideo(kode, jenis);
    } catch (e) {
      toast("error", "Gagal menyimpan tanda", e instanceof Error ? e.message : "");
    }
  }

  function bagikan(v: VideoInteraksi) {
    // Kirim SELURUH tautan platform, dikelompokkan per platform.
    // Kalau daftar tautannya kosong (video lama sebelum hasil Ayrshare
    // tersimpan), jatuh ke tautan utama supaya tombolnya tetap berguna.
    const tautan =
      v.tautan.length > 0
        ? v.tautan
        : v.link
          ? [{ platform: "instagram", url: v.link }]
          : [];
    const teks = pesanBagikanVideo(v.judul, tautan);
    // wa.me tanpa nomor membuka pemilih kontak/grup WhatsApp —
    // anggota tinggal memilih grupnya.
    window.open(`https://wa.me/?text=${encodeURIComponent(teks)}`, "_blank");
    void tandai(v.kode, "share");
  }

  if (daftar !== null && daftar.length === 0) return null;

  const belumBeres = (daftar ?? []).filter((v) => !v.sudah_komen || !v.sudah_share).length;

  return (
    <FadeInUp delay={0.1}>
      <GlassCard className="mt-4 p-4">
        <div className="flex items-center gap-2">
          <PlaySquare className="h-4.5 w-4.5 text-pri" aria-hidden="true" />
          <p className="font-heading text-sm font-bold text-teks-utama">
            Video Baru TV Rakyat
          </p>
          {belumBeres > 0 && (
            <span className="angka-tab rounded-full bg-gagal/15 px-2 text-[11px] font-bold text-gagal">
              {belumBeres} tugas
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-teks-sekunder">
          Kewajiban tiap video: beri komentar di platformnya dan bagikan ke grup
          WhatsApp.
        </p>

        <div className="mt-3 flex flex-col gap-2.5">
          {daftar === null ? (
            <GlassSkeleton className="h-16 rounded-xl" />
          ) : (
            daftar.map((v) => {
              const embed = embedTerbaik(v);
              return (
              <div key={v.kode} className="glass-soft rounded-xl p-3">
                {/* Bentuk EMBED tanpa judul (fitur 1.20/7): videonya
                    langsung tampil; identitasnya cukup jam upload
                    yang presisi sampai detik. */}
                {embed ? (
                  <iframe
                    src={embed.src}
                    title="Video TV Rakyat"
                    className="aspect-[4/5] w-full rounded-xl border-0 bg-black/5 dark:bg-white/5"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => v.link && window.open(v.link, "_blank", "noopener,noreferrer")}
                    aria-label="Buka video di platformnya"
                    className="btn-tekan relative block w-full overflow-hidden rounded-xl"
                  >
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt="" className="aspect-video w-full object-cover" />
                    ) : (
                      <span
                        className="flex aspect-video w-full items-center justify-center text-white"
                        style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                        aria-hidden="true"
                      >
                        <PlaySquare className="h-8 w-8" />
                      </span>
                    )}
                  </button>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-teks-sekunder">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  <span className="angka-tab">Diunggah {jamPresisiWib(v.diunggah_pada)}</span>
                </p>
                <div className="mt-2.5 flex gap-2">
                  {/* Komentar: buka postingan, lalu tandai sudah */}
                  {v.sudah_komen ? (
                    <span className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-sukses/12 text-[11.5px] font-bold text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" /> Sudah komentar
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (v.link) window.open(v.link, "_blank");
                        void tandai(v.kode, "komen");
                      }}
                      className="btn-tekan glass flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-bold text-teks-utama"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      {v.link ? "Buka & Komentari" : "Tandai Komentar"}
                    </button>
                  )}
                  {/* Share ke grup WA */}
                  <button
                    type="button"
                    onClick={() => bagikan(v)}
                    disabled={v.sudah_share}
                    className={cn(
                      "btn-tekan flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-bold",
                      v.sudah_share
                        ? "bg-sukses/12 text-emerald-600 dark:text-emerald-400"
                        : "text-white",
                    )}
                    style={
                      v.sudah_share
                        ? undefined
                        : { background: "linear-gradient(135deg, #10B981, #059669)" }
                    }
                  >
                    {v.sudah_share ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Sudah dibagikan
                      </>
                    ) : (
                      <>
                        <Share2 className="h-3.5 w-3.5" /> Bagikan ke WA
                      </>
                    )}
                  </button>
                </div>
              </div>
              );
            })
          )}
        </div>
      </GlassCard>
    </FadeInUp>
  );
}
