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
import { Heart, X, ExternalLink } from "lucide-react";
import { AvatarInisial, GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import {
  getPeringkatTvr,
  getProfilMomen,
  sukaProfil,
  type AnggotaTvrNasional,
  type MetrikNasional,
  type ProfilMomen,
} from "@/services";
import { GaleriMomen } from "./galeri-momen";
import { PlatformIcon } from "@/components/platform-icon";
import { VideoEmbedMini } from "@/components/video-embed-mini";
import { KoinChip } from "@/components/koin-chip";
import { formatAngkaRingkas, urlProfilSosmed } from "@/lib/format";
import {
  CincinJuara,
  LabelMythic,
  useTop3Tvr,
} from "@/features/peringkat/cincin-mythic";
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
              {/* Border Mythical ikut tampil saat profil dilihat dari
                  chat (1 Sep 2026) */}
              <CincinJuara userId={userId} ukuran={120}>
                {pemilik?.avatar_url ? (
                  <FotoBulat src={pemilik.avatar_url} ukuran={120} />
                ) : (
                  <AvatarInisial nama={pemilik?.nama ?? namaAwal} ukuran={120} />
                )}
              </CincinJuara>
              <h2 className="mt-4 font-heading text-xl font-extrabold tracking-tight text-teks-utama">
                {pemilik?.nama ?? namaAwal}
              </h2>
              <ChipMythicSaya userId={userId} />
              {pemilik?.nama_panggilan && (
                <p className="text-xs text-teks-sekunder">“{pemilik.nama_panggilan}”</p>
              )}
              {data && <KoinChip saldo={data.koin} className="mt-2.5" />}
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
                    <a
                      key={`${a.platform}-${a.username}`}
                      href={urlProfilSosmed(a.platform, a.username)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="glass-soft btn-tekan flex items-center gap-1.5 rounded-full px-3 py-1.5"
                    >
                      <PlatformIcon platform={a.platform} size={14} />
                      <span className="text-[11.5px] font-bold text-teks-utama">
                        @{a.username}
                      </span>
                      <ExternalLink className="h-3 w-3 text-teks-sekunder" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </>
            )}

            {/* Insight seluruh akun sosmed TV Rakyat miliknya
                (1 Sep 2026 — tampil saat profil dilihat lewat chat) */}
            <InsightTvrPublik userId={userId} />

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

// ------------------------------------------------------------
// Chip badge Mythical di bawah nama (bila pemilik profil juara).
// ------------------------------------------------------------
function ChipMythicSaya({ userId }: { userId: string }) {
  const top3 = useTop3Tvr();
  const tier = top3.find((j) => String(j.user_id) === String(userId))?.peringkat;
  if (!tier) return null;
  return (
    <span className="mt-1.5 inline-block">
      <LabelMythic tier={tier} />
    </span>
  );
}

// ------------------------------------------------------------
// InsightTvrPublik (1 Sep 2026) — data insight SELURUH akun sosmed
// TV Rakyat milik pemilik profil: per platform tampil handle (klik →
// profilnya) + 6 indikator (pengikut, tayangan, jangkauan, suka,
// komentar, dibagikan). Sumber = /api/peringkat-tvr (angka yang sama
// dengan leaderboard — satu sumber kebenaran).
// ------------------------------------------------------------
const LABEL_INDIKATOR_PUBLIK: Record<keyof MetrikNasional, string> = {
  pengikut: "Pengikut",
  tayangan: "Tayangan",
  jangkauan: "Jangkauan",
  suka: "Suka",
  komentar: "Komentar",
  bagikan: "Dibagikan",
};

function InsightTvrPublik({ userId }: { userId: string }) {
  const [anggota, setAnggota] = useState<AnggotaTvrNasional | null | "memuat">("memuat");

  useEffect(() => {
    let hidup = true;
    void getPeringkatTvr()
      .then((r) => {
        if (!hidup) return;
        setAnggota(r.anggota.find((a) => String(a.user_id) === String(userId)) ?? null);
      })
      .catch(() => hidup && setAnggota(null));
    return () => {
      hidup = false;
    };
  }, [userId]);

  if (anggota === "memuat") {
    return <GlassSkeleton className="mt-6 h-24 rounded-2xl" />;
  }
  if (!anggota) return null;
  const platformIsi = Object.keys(anggota.platform).filter(
    (p) => anggota.platform[p] !== null,
  );
  if (platformIsi.length === 0) return null;

  return (
    <>
      <SectionTitle judul="Insight Sosmed TV Rakyat" className="mt-6" />
      <div className="flex flex-col gap-2">
        {platformIsi.map((plat) => {
          const m = anggota.platform[plat];
          if (!m) return null;
          const handle = anggota.akun[plat] ?? "";
          return (
            <div key={plat} className="glass-soft rounded-2xl p-3">
              <div className="flex items-center gap-2">
                <PlatformIcon platform={plat} size={14} denganWadah />
                {handle ? (
                  <a
                    href={urlProfilSosmed(plat, handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-tekan flex min-w-0 items-center gap-1 text-[12px] font-bold text-teks-utama"
                  >
                    <span className="truncate">
                      {handle.includes(" ") ? handle : `@${handle.replace(/^@+/, "")}`}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-teks-sekunder" />
                  </a>
                ) : (
                  <span className="text-[12px] font-bold text-teks-utama">
                    {plat}
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(Object.keys(LABEL_INDIKATOR_PUBLIK) as (keyof MetrikNasional)[]).map(
                  (k) => (
                    <div key={k} className="rounded-lg bg-black/[0.04] px-1.5 py-1.5 text-center dark:bg-white/[0.06]">
                      <p className="angka-tab text-[12.5px] leading-none font-extrabold text-teks-utama">
                        {m[k] === null ? "–" : formatAngkaRingkas(m[k])}
                      </p>
                      <p className="mt-0.5 text-[8.5px] font-semibold text-teks-sekunder">
                        {LABEL_INDIKATOR_PUBLIK[k]}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
