"use client";

// ============================================================
// ProfilPublikModal — profil orang lain ala ML (spek 4.3).
//
// Dibuka dari header chat (ketuk nama lawan bicara). Menampilkan foto
// besar, jabatan/divisi, galeri Momen Terbaik miliknya, dan tombol
// LIKE PROFIL (toggle, 1 like per orang) — "skor" popularitas ringan.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, X } from "lucide-react";
import { AvatarInisial, GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import { getProfilMomen, sukaProfil, type ProfilMomen } from "@/services";
import { GaleriMomen } from "./galeri-momen";
import { PlatformIcon } from "@/components/platform-icon";
import { VideoEmbedMini } from "@/components/video-embed-mini";
import { cn } from "@/lib/utils";

export function ProfilPublikModal({
  userId,
  namaAwal,
  onTutup,
}: {
  userId: string;
  /** Nama untuk judul selagi data dimuat */
  namaAwal: string;
  onTutup: () => void;
}) {
  const [data, setData] = useState<ProfilMomen | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);
  const [sedangSuka, setSedangSuka] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getProfilMomen(userId);
        if (hidup) setData(hasil);
      } catch {
        if (hidup) setData(null);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [userId, muatUlang]);

  async function toggleSukaProfil() {
    if (sedangSuka) return;
    setSedangSuka(true);
    try {
      await sukaProfil(userId);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menyukai profil", e instanceof Error ? e.message : "");
    } finally {
      setSedangSuka(false);
    }
  }

  const pemilik = data?.pemilik;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[90] flex flex-col justify-end"
        role="dialog"
        aria-modal="true"
        aria-label={`Profil ${pemilik?.nama ?? namaAwal}`}
      >
        <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
        <motion.div
          initial={{ y: "102%" }}
          animate={{ y: 0 }}
          exit={{ y: "102%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="glass-strong relative mx-auto flex max-h-[92dvh] w-full max-w-[520px] flex-col rounded-t-[2rem] px-5 pt-3 pb-8"
        >
          <div className="mb-3 flex shrink-0 justify-center">
            <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup profil"
            className="glass btn-tekan absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="scrollbar-tipis min-h-0 flex-1 overflow-y-auto">
            {/* Hero ala ML: foto besar + badge + skor suka */}
            <div className="flex flex-col items-center pt-2 text-center">
              {pemilik?.avatar_url ? (
                <FotoBulat src={pemilik.avatar_url} ukuran={120} />
              ) : (
                <AvatarInisial nama={pemilik?.nama ?? namaAwal} ukuran={120} />
              )}
              <h2 className="mt-3 font-heading text-xl font-extrabold tracking-tight text-teks-utama">
                {pemilik?.nama ?? namaAwal}
              </h2>
              {pemilik?.nama_panggilan && (
                <p className="text-xs text-teks-sekunder">“{pemilik.nama_panggilan}”</p>
              )}
              {(pemilik?.jabatan || pemilik?.divisi) && (
                <p className="mt-1.5 text-[11.5px] font-medium text-teks-sekunder">
                  {[pemilik?.jabatan, pemilik?.divisi].filter(Boolean).join(" · ")}
                </p>
              )}

              {/* Like profil (spek 4.3): toggle + skor */}
              <button
                type="button"
                disabled={sedangSuka || data === null}
                onClick={() => void toggleSukaProfil()}
                className={cn(
                  "btn-tekan mt-3.5 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold",
                  data?.ku_suka_profil ? "text-white" : "glass text-teks-utama",
                )}
                style={
                  data?.ku_suka_profil
                    ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                    : undefined
                }
              >
                <Heart
                  className="h-4 w-4"
                  style={data?.ku_suka_profil ? { fill: "currentColor" } : undefined}
                  aria-hidden="true"
                />
                <span className="angka-tab">{data?.suka_profil ?? 0}</span>
                {data?.ku_suka_profil ? "Disukai" : "Sukai Profil"}
              </button>
            </div>

            {/* Akun TV Rakyat yang dipegang (spek 1.15) */}
            {data && data.akun_tvr.length > 0 && (
              <>
                <SectionTitle judul="Akun TV Rakyat" className="mt-6" />
                <div className="flex flex-wrap gap-1.5">
                  {data.akun_tvr.map((a) => (
                    <span
                      key={`${a.platform}-${a.username}`}
                      className="glass-soft flex items-center gap-1.5 rounded-full px-3 py-1.5"
                    >
                      <PlatformIcon platform={a.platform} size={14} />
                      <span className="text-[11.5px] font-bold text-teks-utama">
                        @{a.username}
                      </span>
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Video yang diupload HARI INI (spek 1.15) */}
            {data && data.video_hari_ini.length > 0 && (
              <>
                <SectionTitle
                  judul={`Video Hari Ini (${data.video_hari_ini.length})`}
                  className="mt-6"
                />
                <VideoEmbedMini video={data.video_hari_ini} />
              </>
            )}

            {/* Momen Terbaik miliknya */}
            <SectionTitle judul="Momen Terbaik PRI" className="mt-6" />
            {data === null ? (
              <GlassSkeleton className="h-24 rounded-2xl" />
            ) : data.foto.length === 0 ? (
              <p className="py-4 text-center text-xs text-teks-sekunder">
                Belum ada foto momen.
              </p>
            ) : (
              <GaleriMomen
                foto={data.foto}
                milikSendiri={false}
                onBerubah={() => setMuatUlang((n) => n + 1)}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
