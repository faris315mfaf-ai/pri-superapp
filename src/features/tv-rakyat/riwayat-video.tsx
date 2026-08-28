"use client";

// ============================================================
// RiwayatVideo — riwayat pemrosesan video TV Rakyat.
// Filter chip status + daftar video (8 data dari services)
// dengan badge status, platform terunggah, dan aksi.
// ============================================================

import { useEffect, useState } from "react";
import {
  ExternalLink,
  History,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  VideoOff, Share2 } from "lucide-react";
import { EmptyState, FadeInUp, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon } from "@/components/platform-icon";
import { getVideoAntrian, hapusVideoAntrian, unggahVideoSosmed } from "@/services";
import { toast } from "@/hooks/use-app-store";
import { jamWIB, pesanBagikanVideo } from "@/lib/format";
import type { VideoAntrian } from "@/types";
import { cn } from "@/lib/utils";

// "SIAP DITINJAU" adalah status baru dari pipeline n8n: render
// Creatomate sudah selesai tapi video belum diunggah — menunggu
// admin meninjau dan menyetujuinya.
type StatusFilter =
  | "SEMUA"
  | "SUDAH DIPROSES"
  | "SIAP DITINJAU"
  | "SEDANG DIPROSES"
  | "MENUNGGU DOKSLI"
  | "GAGAL";

const CHIP_FILTER: { id: StatusFilter; label: string }[] = [
  { id: "SEMUA", label: "Semua" },
  { id: "SUDAH DIPROSES", label: "Diposting" },
  { id: "SIAP DITINJAU", label: "Siap Ditinjau" },
  { id: "SEDANG DIPROSES", label: "Diproses" },
  { id: "MENUNGGU DOKSLI", label: "Menunggu" },
  { id: "GAGAL", label: "Gagal" },
];

type WarnaBadge = "hijau" | "biru" | "kuning" | "merah" | "netral";

const BADGE_STATUS: Record<string, { label: string; warna: WarnaBadge; berkedip?: boolean }> = {
  "SUDAH DIPROSES": { label: "Sudah Diposting", warna: "hijau" },
  "SIAP DITINJAU": { label: "Siap Ditinjau", warna: "biru" },
  "SEDANG DIPROSES": { label: "Sedang Diproses", warna: "biru", berkedip: true },
  "MENUNGGU DOKSLI": { label: "Menunggu Doksli", warna: "kuning" },
  GAGAL: { label: "Gagal", warna: "merah" },
};

const BULAN_SINGKAT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** "2026-08-23T06:45:00+07:00" → "06.45, 23 Agu" */
function formatJamTanggal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${jamWIB(iso)}, ${d.getDate()} ${BULAN_SINGKAT[d.getMonth()]}`;
}

/** Data riwayat yang tersimpan bersama kunci refreshKey-nya */
type CacheRiwayat = {
  kunci: number;
  data: VideoAntrian[];
  ringkasan: Record<string, number>;
};

export function RiwayatVideo({
  refreshKey,
  onBukaVideo,
  onDataBerubah,
}: {
  refreshKey: number;
  /** Dipanggil setelah video dihapus supaya daftar dimuat ulang */
  onDataBerubah?: () => void;
  /** Dipanggil saat satu baris riwayat diklik — membuka pratinjau */
  onBukaVideo: (video: VideoAntrian) => void;
}) {
  const [cache, setCache] = useState<CacheRiwayat | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("SEMUA");

  // Muat ulang data saat mount dan setiap refreshKey naik.
  // Saat kunci cache tidak cocok → tampil skeleton (sedang memuat).
  useEffect(() => {
    let aktif = true;
    getVideoAntrian()
      .then((respons) => {
        if (!aktif) return;
        setCache({ kunci: refreshKey, data: respons.data, ringkasan: respons.ringkasan });
      })
      .catch((err: unknown) => {
        if (!aktif) return;
        setCache({ kunci: refreshKey, data: [], ringkasan: {} });
        toast(
          "error",
          "Gagal memuat riwayat",
          err instanceof Error ? err.message : "Coba muat ulang beberapa saat lagi.",
        );
      });
    return () => {
      aktif = false;
    };
  }, [refreshKey]);

  const siap = cache !== null && cache.kunci === refreshKey;
  const video: VideoAntrian[] | null = siap ? cache.data : null;
  const jumlahPerStatus: Record<string, number> = siap ? cache.ringkasan : {};

  const terfilter =
    video === null ? [] : video.filter((v) => filter === "SEMUA" || v.status === filter);

  function jumlahChip(id: StatusFilter): number {
    if (video === null) return 0;
    if (id === "SEMUA") return video.length;
    return jumlahPerStatus[id] ?? 0;
  }

  return (
    <GlassCard className="kartu-hover p-4 sm:p-5">
      {/* Kepala panel */}
      <div className="flex items-center gap-3">
        <span
          className="glass-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pri"
          aria-hidden="true"
        >
          <History className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-[15px] font-bold text-teks-utama">
            Riwayat Pemrosesan
          </h2>
          <p className="text-[11px] text-teks-sekunder">
            {video === null ? "Memuat riwayat…" : `${video.length} video tercatat`}
          </p>
        </div>
      </div>

      {/* Filter chip status */}
      <div className="tanpa-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {CHIP_FILTER.map((chip) => {
          const aktifChip = filter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              aria-pressed={aktifChip}
              className={cn(
                "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold",
                aktifChip
                  ? "text-white"
                  : "glass text-teks-sekunder hover:text-teks-utama",
              )}
              style={
                aktifChip
                  ? {
                      background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                      boxShadow: "0 6px 16px rgba(220, 38, 38, 0.3)",
                    }
                  : undefined
              }
            >
              {chip.label}
              <span className={cn("angka-tab", aktifChip ? "text-white/80" : "text-teks-sekunder/70")}>
                {jumlahChip(chip.id)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Isi daftar */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
        {video === null ? (
          // Skeleton loading (4 baris)
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <GlassSkeleton className="h-14 w-14 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2 py-1">
                  <GlassSkeleton className="h-4 w-4/5" />
                  <GlassSkeleton className="h-3 w-2/5" />
                  <GlassSkeleton className="h-5 w-28 rounded-full" />
                </div>
              </div>
            ))}
          </>
        ) : terfilter.length === 0 ? (
          <EmptyState
            ikon={VideoOff}
            judul="Tidak ada video dengan status ini"
            keterangan="Coba pilih filter lain atau proses video baru di atas."
            className="py-8"
          />
        ) : (
          terfilter.map((v, i) => (
            <ItemVideo
              key={v.id}
              video={v}
              urutan={i}
              onBuka={onBukaVideo}
              onDataBerubah={onDataBerubah}
            />
          ))
        )}
      </div>
    </GlassCard>
  );
}

// ------------------------------------------------------------
// ItemVideo — satu baris riwayat video
// ------------------------------------------------------------

function ItemVideo({
  video,
  urutan,
  onBuka,
  onDataBerubah,
}: {
  video: VideoAntrian;
  urutan: number;
  onBuka: (video: VideoAntrian) => void;
  onDataBerubah?: () => void;
}) {
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  const [sedangHapus, setSedangHapus] = useState(false);
  // Sedang mengulang unggahan platform yang gagal (fitur 1.20/9)
  const [mengulang, setMengulang] = useState(false);

  /**
   * Platform yang GAGAL pada percobaan terakhir dan belum pernah
   * sukses — hanya inilah yang dikirim tombol Ulangi. Server punya
   * pagar anti-dobelnya sendiri; saringan ini untuk kejujuran tombol.
   */
  function platformGagal(v: VideoAntrian): { platform: string; pesan: string }[] {
    const hasil = (v.ayrshare_hasil ?? []) as {
      platform?: string;
      status?: string;
      postUrl?: string;
      pesan?: string;
    }[];
    const sukses = new Set(
      hasil
        .filter((h) => h.status !== "error")
        .map((h) => String(h.platform ?? "").toLowerCase()),
    );
    for (const p of v.platform_terunggah ?? []) sukses.add(p.toLowerCase());
    return hasil
      .filter(
        (h) =>
          h.status === "error" &&
          h.platform &&
          !sukses.has(String(h.platform).toLowerCase()),
      )
      .map((h) => ({ platform: String(h.platform), pesan: String(h.pesan ?? "") }));
  }

  async function ulangiGagal(v: VideoAntrian) {
    const gagal = platformGagal(v);
    if (gagal.length === 0 || mengulang) return;
    setMengulang(true);
    try {
      // v.id ADALAH kode pipeline — view memetakan kode AS id.
      const balasan = await unggahVideoSosmed(
        v.id,
        gagal.map((g) => g.platform),
      );
      if (balasan.berhasil > 0) {
        toast(
          "sukses",
          `Berhasil di ${balasan.berhasil} dari ${balasan.total} platform`,
          balasan.berhasil < balasan.total
            ? "Sisanya masih gagal — coba lagi nanti."
            : undefined,
        );
      } else {
        toast("error", "Masih gagal di semua platform", "Periksa akun Ayrshare lalu coba lagi.");
      }
      onDataBerubah?.();
    } catch (e) {
      toast("error", "Gagal mengulang unggahan", e instanceof Error ? e.message : "");
    } finally {
      setMengulang(false);
    }
  }

  // Video yang SUDAH tayang tidak bisa dihapus dari sini: barisnya
  // adalah catatan bahwa unggahan itu benar terjadi, dan menghapusnya
  // tidak akan menurunkan postingannya dari sosmed. Server menolaknya
  // juga — tombolnya disembunyikan supaya tidak memancing salah paham.
  const bolehHapus = video.status !== "SUDAH DIPROSES";

  async function hapus() {
    if (sedangHapus) return;
    setSedangHapus(true);
    try {
      await hapusVideoAntrian(video.id);
      toast("sukses", "Video dihapus dari antrian");
      setKonfirmasiHapus(false);
      onDataBerubah?.();
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
      setSedangHapus(false);
    }
  }
  const badge = BADGE_STATUS[video.status] ?? { label: video.status, warna: "netral" as WarnaBadge };
  const adaVideo = Boolean(video.hasil_render_url);

  return (
    <FadeInUp delay={Math.min(urutan * 0.04, 0.25)}>
      {/* Seluruh baris dapat diklik untuk membuka pratinjau. Memakai div
          ber-role button (bukan <button>) karena di dalamnya masih ada
          tombol lain — tombol di dalam tombol tidak sah di HTML. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onBuka(video)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onBuka(video);
          }
        }}
        aria-label={`Buka pratinjau ${video.judul}`}
        className="glass-soft btn-tekan w-full cursor-pointer rounded-2xl p-3 text-left transition-colors hover:bg-white/50 focus:ring-2 focus:ring-pri/50 focus:outline-none dark:hover:bg-white/10"
      >
        <div className="flex gap-3">
          <div className="relative h-14 w-14 shrink-0">
            <img
              src={video.thumbnail_url}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.opacity = "0";
              }}
              className="h-14 w-14 rounded-xl bg-black/10 object-cover dark:bg-white/10"
            />
            {/* Penanda bahwa baris ini benar-benar punya video yang bisa
                diputar — membedakannya dari yang baru menunggu proses. */}
            {adaVideo && (
              <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/35">
                <Play className="h-5 w-5 translate-x-px text-white drop-shadow" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-1 min-w-0 flex-1 text-sm leading-snug font-semibold text-teks-utama">
                {video.judul}
              </p>
              <StatusBadge
                label={badge.label}
                warna={badge.warna}
                berkedip={badge.berkedip}
                className="shrink-0"
              />
            </div>
            {/* Waktu + penanggung jawab. Nama penggenerate ditampilkan
                supaya setiap video yang tayang punya pemilik yang jelas. */}
            <p className="mt-1 text-[11px] text-teks-sekunder">
              <span className="angka-tab">{formatJamTanggal(video.jam_tanggal)}</span>
              {video.digenerate_oleh && (
                <>
                  {" · oleh "}
                  <span className="font-semibold text-teks-utama/80">
                    {video.digenerate_oleh}
                  </span>
                </>
              )}
            </p>

            {/* Baris platform terunggah + tautan postingan */}
            {video.status === "SUDAH DIPROSES" && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {video.platform_terunggah.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {video.platform_terunggah.map((p) => (
                      <PlatformIcon key={p} platform={p} size={14} />
                    ))}
                  </div>
                )}
                {video.link_instagram && (
                  <button
                    type="button"
                    onClick={(e) => {
                      // Jangan ikut membuka pratinjau — tombol ini punya
                      // tujuan sendiri (membuka postingan di sosmed).
                      e.stopPropagation();
                      window.open(video.link_instagram, "_blank", "noopener,noreferrer");
                    }}
                    className="btn-tekan inline-flex items-center gap-1 text-[11px] font-semibold text-pri"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Lihat Postingan
                  </button>
                )}
                {/* Bagikan semua tautan platform ke WhatsApp (spek 1.18) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const tautan = ((video.ayrshare_hasil ?? []) as {
                      platform?: string;
                      postUrl?: string;
                    }[])
                      .filter((h) => h.platform && h.postUrl)
                      .map((h) => ({
                        platform: String(h.platform),
                        url: String(h.postUrl),
                      }));
                    // Fallback: minimal tautan Instagram lama bila
                    // ayrshare_hasil kosong (video era sebelum 1.15).
                    if (tautan.length === 0 && video.link_instagram) {
                      tautan.push({ platform: "instagram", url: video.link_instagram });
                    }
                    const teks = pesanBagikanVideo(
                      video.judul_overlay || video.judul,
                      tautan,
                    );
                    window.open(
                      `https://wa.me/?text=${encodeURIComponent(teks)}`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                  className="btn-tekan inline-flex items-center gap-1 text-[11px] font-semibold"
                  style={{ color: "#10B981" }}
                >
                  <Share2 className="h-3 w-3" />
                  Bagikan ke WA
                </button>
              </div>
            )}

            {/* Status pipeline per platform + Ulangi (fitur 1.20/9):
                terlihat persis DI MANA video gagal, dan hanya platform
                gagal itu yang dikirim ulang — anti terunggah dua kali. */}
            {(() => {
              const gagal = platformGagal(video);
              if (gagal.length === 0) return null;
              return (
                <div className="mt-2 rounded-xl border border-gagal/30 bg-gagal/[0.05] p-2.5">
                  {gagal.map((g) => (
                    <p
                      key={g.platform}
                      className="flex items-start gap-1.5 text-[10.5px] leading-snug text-teks-utama"
                    >
                      <PlatformIcon platform={g.platform} size={12} />
                      <span className="min-w-0">
                        <b className="capitalize">{g.platform}</b> gagal
                        {g.pesan ? ` — ${g.pesan.slice(0, 90)}` : ""}
                      </span>
                    </p>
                  ))}
                  <button
                    type="button"
                    disabled={mengulang}
                    onClick={(e) => {
                      e.stopPropagation();
                      void ulangiGagal(video);
                    }}
                    className="btn-tekan mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-bold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                  >
                    {mengulang ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Ulangi {gagal.length} platform yang gagal
                  </button>
                </div>
              );
            })()}

            {/* Tombol coba lagi untuk video gagal */}
            {video.status === "GAGAL" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toast("info", "Video dimasukkan kembali ke antrian");
                }}
                className="btn-tekan mt-1.5 inline-flex items-center gap-1 rounded-lg border border-pri/40 bg-pri/5 px-2.5 py-1 text-[11px] font-semibold text-pri"
              >
                <RotateCcw className="h-3 w-3" />
                Coba Lagi
              </button>
            )}

            {/* Hapus dari antrian — tersedia pada semua tahap sebelum tayang */}
            {bolehHapus && (
              <div className="mt-1.5">
                {konfirmasiHapus ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-teks-utama">
                      Hapus video ini?
                    </span>
                    <button
                      type="button"
                      disabled={sedangHapus}
                      onClick={(e) => {
                        e.stopPropagation();
                        void hapus();
                      }}
                      className="btn-tekan inline-flex items-center gap-1 rounded-lg bg-gagal px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      {sedangHapus ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Ya, hapus
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setKonfirmasiHapus(false);
                      }}
                      className="glass btn-tekan rounded-lg px-2.5 py-1 text-[11px] font-semibold text-teks-utama"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setKonfirmasiHapus(true);
                    }}
                    className="btn-tekan inline-flex items-center gap-1 rounded-lg border border-gagal/40 bg-gagal/5 px-2.5 py-1 text-[11px] font-semibold text-gagal"
                  >
                    <Trash2 className="h-3 w-3" />
                    Hapus
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </FadeInUp>
  );
}
