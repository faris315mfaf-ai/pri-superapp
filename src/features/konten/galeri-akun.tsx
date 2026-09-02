"use client";

// ============================================================
// GaleriLingkaran (2 Sep 2026) — pengganti tiga kartu akun Instagram di
// modul Konten. Deretan LINGKARAN kecil 6 x 6 (36 per halaman; lebih
// dari itu ada tombol halaman 1, 2, 3, …): TV Rakyat Official di posisi
// pertama, lalu semua anggota yang sudah menautkan akun TV Rakyat.
// Ketuk lingkaran → pop-up layar penuh berisi SEMUA video yang mereka
// unggah di sosmednya, dibagi segmen (1, 2, 3, …) + filter per sosmed.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Heart, MessageCircle, PlayCircle, Tv, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, EmptyState, GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import {
  getGaleriKonten,
  getVideoGaleri,
  type LingkaranGaleri,
  type VideoGaleri,
} from "@/services";
import { cn } from "@/lib/utils";

/** 6 kolom x 6 baris per halaman lingkaran. */
const PER_HALAMAN = 36;
/** Video per segmen di pop-up. */
const PER_SEGMEN = 24;
const URUTAN_PLATFORM = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"];

function tanggalPendek(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" });
}

/** Deretan tombol nomor (halaman lingkaran / segmen video). */
function TombolNomor({
  total,
  aktif,
  onPilih,
  label,
}: {
  total: number;
  aktif: number;
  onPilih: (n: number) => void;
  label: string;
}) {
  if (total <= 1) return null;
  return (
    <div className="scrollbar-tipis flex items-center gap-1.5 overflow-x-auto py-1" role="group" aria-label={label}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPilih(n)}
          aria-pressed={aktif === n}
          aria-label={`${label} ${n}`}
          className={cn(
            "angka-tab btn-tekan flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-2 text-[12px] font-bold",
            aktif === n ? "text-white" : "glass text-teks-sekunder",
          )}
          style={aktif === n ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Avatar({ akun, ukuran }: { akun: LingkaranGaleri; ukuran: number }) {
  return akun.avatar_url ? (
    <FotoBulat src={akun.avatar_url} ukuran={ukuran} alt={akun.nama} />
  ) : (
    <AvatarInisial nama={akun.nama} ukuran={ukuran} />
  );
}

export function GaleriLingkaran() {
  const versiSegar = useVersiSegar();
  const [data, setData] = useState<{
    official: LingkaranGaleri | null;
    pengguna: LingkaranGaleri[];
  } | null>(null);
  const [halaman, setHalaman] = useState(1);
  const [dibuka, setDibuka] = useState<LingkaranGaleri | null>(null);

  useEffect(() => {
    let hidup = true;
    getGaleriKonten()
      .then((r) => {
        if (hidup) setData(r);
      })
      .catch(() => {
        if (hidup) setData({ official: null, pengguna: [] });
      });
    return () => {
      hidup = false;
    };
  }, [versiSegar]);

  const semua = useMemo(() => {
    if (!data) return [];
    return data.official ? [data.official, ...data.pengguna] : data.pengguna;
  }, [data]);
  const totalHalaman = Math.max(1, Math.ceil(semua.length / PER_HALAMAN));
  const halamanAman = Math.min(halaman, totalHalaman);
  const tampil = semua.slice((halamanAman - 1) * PER_HALAMAN, halamanAman * PER_HALAMAN);

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle judul="Akun TV Rakyat" className="!mt-0" />
        {data && (
          <span className="angka-tab text-[11px] text-teks-sekunder">{semua.length} akun</span>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-teks-sekunder">
        Ketuk lingkaran untuk melihat semua video yang diunggah di sosmednya.
      </p>

      {data === null ? (
        <GlassSkeleton className="mt-3 h-48 rounded-2xl" />
      ) : semua.length === 0 ? (
        <GlassCard className="mt-3 p-2">
          <EmptyState
            ikon={Tv}
            judul="Belum ada akun tertaut"
            keterangan="Akun TV Rakyat anggota akan muncul di sini setelah login upload-post."
            className="py-6"
          />
        </GlassCard>
      ) : (
        <GlassCard className="mt-3 p-3">
          <div className="grid grid-cols-6 gap-x-1.5 gap-y-3">
            {tampil.map((a) => {
              const official = a.kunci === "official";
              const jumlah = Object.keys(a.akun).length;
              return (
                <button
                  key={a.kunci}
                  type="button"
                  onClick={() => setDibuka(a)}
                  className="btn-tekan flex flex-col items-center gap-1"
                  aria-label={`Lihat video ${a.nama}`}
                >
                  <span
                    className={cn(
                      "relative rounded-full p-[2px]",
                      official
                        ? "bg-[linear-gradient(135deg,#F59E0B,#DC2626)]"
                        : "bg-black/10 dark:bg-white/15",
                    )}
                  >
                    <span className="block rounded-full bg-[var(--app-bg)] p-[2px]">
                      <Avatar akun={a} ukuran={40} />
                    </span>
                    <span
                      className="angka-tab absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                      style={{ background: official ? "#DC2626" : "#0F172A" }}
                      aria-hidden="true"
                    >
                      {jumlah}
                    </span>
                  </span>
                  <span className="w-full truncate text-center text-[9.5px] font-semibold leading-tight text-teks-utama">
                    {official ? "TV Rakyat" : a.nama.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2">
            <TombolNomor
              total={totalHalaman}
              aktif={halamanAman}
              onPilih={setHalaman}
              label="Halaman akun"
            />
          </div>
        </GlassCard>
      )}

      <AnimatePresence>
        {dibuka && <PopupVideoAkun akun={dibuka} onTutup={() => setDibuka(null)} />}
      </AnimatePresence>
    </section>
  );
}

// ------------------------------------------------------------
// Pop-up layar penuh: semua video satu akun, filter sosmed + segmen.
// ------------------------------------------------------------

function PopupVideoAkun({ akun, onTutup }: { akun: LingkaranGaleri; onTutup: () => void }) {
  const versiSegar = useVersiSegar();
  const [video, setVideo] = useState<VideoGaleri[] | null>(null);
  const [filter, setFilter] = useState("semua");
  const [segmen, setSegmen] = useState(1);

  useEffect(() => {
    let hidup = true;
    getVideoGaleri(akun.kunci)
      .then((r) => {
        if (hidup) setVideo(r);
      })
      .catch((e) => {
        if (!hidup) return;
        setVideo([]);
        toast("error", "Gagal memuat video", e instanceof Error ? e.message : "");
      });
    return () => {
      hidup = false;
    };
  }, [akun.kunci, versiSegar]);

  const jumlahPer = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of video ?? []) m.set(v.platform, (m.get(v.platform) ?? 0) + 1);
    return m;
  }, [video]);
  const platformAda = URUTAN_PLATFORM.filter((p) => jumlahPer.has(p)).concat(
    [...jumlahPer.keys()].filter((p) => !URUTAN_PLATFORM.includes(p)),
  );

  const tersaring = useMemo(
    () => (video ?? []).filter((v) => filter === "semua" || v.platform === filter),
    [video, filter],
  );
  const totalSegmen = Math.max(1, Math.ceil(tersaring.length / PER_SEGMEN));
  const segmenAman = Math.min(segmen, totalSegmen);
  const tampil = tersaring.slice((segmenAman - 1) * PER_SEGMEN, segmenAman * PER_SEGMEN);

  function pilihFilter(p: string) {
    setFilter(p);
    setSegmen(1);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex flex-col bg-[var(--app-bg)] lg:left-60"
      role="dialog"
      aria-modal="true"
      aria-label={`Video ${akun.nama}`}
    >
      {/* Kepala */}
      <div className="glass-strong flex items-center gap-3 px-4 py-3">
        <Avatar akun={akun} ukuran={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-teks-utama">{akun.nama}</p>
          <p className="text-[11px] text-teks-sekunder">
            {video === null
              ? "Memuat video…"
              : `${video.length} video · ${Object.keys(akun.akun).length} sosmed tertaut`}
          </p>
        </div>
        <button
          type="button"
          onClick={onTutup}
          aria-label="Tutup"
          className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Filter sosmed */}
      <div className="scrollbar-tipis flex gap-2 overflow-x-auto px-4 py-2">
        {[["semua", "Semua", video?.length ?? 0] as const, ...platformAda.map((p) => [p, labelPlatform(p), jumlahPer.get(p) ?? 0] as const)].map(
          ([kunci, label, n]) => (
            <button
              key={kunci}
              type="button"
              onClick={() => pilihFilter(kunci)}
              aria-pressed={filter === kunci}
              className={cn(
                "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                filter === kunci ? "text-white" : "glass text-teks-sekunder",
              )}
              style={filter === kunci ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
            >
              {kunci !== "semua" && <PlatformIcon platform={kunci} size={12} />}
              {label}
              <span className="angka-tab opacity-80">{n}</span>
            </button>
          ),
        )}
      </div>

      {/* Isi */}
      <div className="scrollbar-tipis flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {video === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <GlassSkeleton key={i} className="aspect-[3/4] rounded-2xl" />
            ))}
          </div>
        ) : tersaring.length === 0 ? (
          <EmptyState
            ikon={PlayCircle}
            judul="Belum ada video"
            keterangan={
              filter === "semua"
                ? "Belum ada unggahan yang terbaca dari sosmed akun ini."
                : `Belum ada unggahan di ${labelPlatform(filter)}.`
            }
            className="py-12"
          />
        ) : (
          <>
            <p className="mb-2 text-[10.5px] text-teks-sekunder">
              Segmen {segmenAman} dari {totalSegmen} · {tersaring.length} video
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {tampil.map((v) => (
                <KartuVideo key={v.id} video={v} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Segmen 1, 2, 3, … */}
      {totalSegmen > 1 && (
        <div className="glass-strong px-4 py-2">
          <TombolNomor total={totalSegmen} aktif={segmenAman} onPilih={setSegmen} label="Segmen" />
        </div>
      )}
    </motion.div>
  );
}

function KartuVideo({ video }: { video: VideoGaleri }) {
  const [gagal, setGagal] = useState(false);
  return (
    <article className="glass-soft flex flex-col overflow-hidden rounded-2xl">
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-[3/4] w-full bg-black/10 dark:bg-white/10"
        aria-label="Tonton video"
      >
        {video.thumbnail && !gagal ? (
          // Thumbnail CDN sosmed bisa kedaluwarsa — kegagalan itu wajar,
          // diganti latar gradasi + ikon platform.
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            onError={() => setGagal(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: "linear-gradient(135deg, #7F1D1D, #B45309, #0B1120)" }}
          >
            <PlayCircle className="h-9 w-9 text-white/75" />
          </div>
        )}
        <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
          <PlatformIcon platform={video.platform} size={12} />
        </span>
        {video.waktu && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
            {tanggalPendek(video.waktu)}
          </span>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="line-clamp-2 min-h-[2.6em] text-[11.5px] leading-snug text-teks-utama/90">
          {video.caption || "(tanpa caption)"}
        </p>
        {(video.like !== null || video.komentar !== null) && (
          <div className="flex items-center gap-3 text-[10.5px] text-teks-sekunder">
            {video.like !== null && (
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3 w-3" />
                <span className="angka-tab">{video.like.toLocaleString("id-ID")}</span>
              </span>
            )}
            {video.komentar !== null && (
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                <span className="angka-tab">{video.komentar.toLocaleString("id-ID")}</span>
              </span>
            )}
          </div>
        )}
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-tekan mt-auto flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-[11.5px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Tonton
        </a>
      </div>
    </article>
  );
}
