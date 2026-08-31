"use client";

// ============================================================
// AccountDetailScreen — detail akun wajib.
// Header statistik + daftar viewcard postingan hari itu.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Heart, MessageCircle, EyeOff } from "lucide-react";
import {
  AvatarInisial,
  EmptyState,
  FadeInUp,
  GlassSkeleton,
  ScreenHeader,
  StatusBadge,
  ThemeToggle,
} from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon } from "@/components/platform-icon";
import {
  getAkunWajib,
  getPostinganByAkun,
  type AkunWajibWithStats,
  type PostinganWithKepatuhan,
} from "@/services";
import { toast } from "@/hooks/use-app-store";
import { formatAngkaRingkas, warnaKepatuhan } from "@/lib/format";
import { periodeSaatIni } from "@/lib/periode-qc";

type AccountDetailScreenProps = {
  akunWajib: string;
  /** Label periode QC yang sedang dilihat (dari layar QC). Kosong = periode berjalan. */
  periode?: string;
  onKembali: () => void;
  onBukaPostingan: (idPostingan: string) => void;
};

/**
 * Thumbnail postingan dengan cadangan: URL CDN TikTok/IG cepat kedaluwarsa,
 * jadi saat gambar gagal dimuat tampilkan latar gradien + ikon platform —
 * bukan teks alt yang berantakan seperti bug sebelumnya.
 * Dipakai juga oleh PostDetailScreen (ekspor).
 */
export function ThumbnailPostingan({
  url,
  platform,
  className = "h-36 w-full",
}: {
  url: string;
  platform: string;
  className?: string;
}) {
  const [gagal, setGagal] = useState(false);
  if (!url || gagal) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-pri/25 via-black/10 to-black/30 dark:from-pri/20 dark:via-white/5 dark:to-black/40 ${className}`}
      >
        <PlatformIcon platform={platform} size={34} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt="Thumbnail postingan"
      loading="lazy"
      onError={() => setGagal(true)}
      className={`object-cover ${className}`}
    />
  );
}

/** "2026-08-23T09:42:00+07:00" → "09:42" */
function jamMenit(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export function AccountDetailScreen({
  akunWajib,
  periode,
  onKembali,
  onBukaPostingan,
}: AccountDetailScreenProps) {
  const [akun, setAkun] = useState<AkunWajibWithStats | null>(null);
  const [postingan, setPostingan] = useState<PostinganWithKepatuhan[] | null>(null);
  // SELALU kunci ke satu periode. Dulu layar ini menarik SEMUA postingan
  // sepanjang masa (242 baris) → statistik jadi kacau + rekap terpotong
  // di batas 1000 baris PostgREST → tampil "0% kepatuhan" palsu.
  const periodeAktif = periode || periodeSaatIni();

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [daftarAkun, daftarPostingan] = await Promise.all([
          getAkunWajib(periodeAktif),
          getPostinganByAkun(akunWajib, periodeAktif),
        ]);
        if (!hidup) return;
        setAkun(daftarAkun.find((a) => a.akun_wajib === akunWajib) ?? null);
        setPostingan(daftarPostingan);
      } catch {
        if (hidup) {
          toast("error", "Gagal memuat postingan", "Silakan coba lagi.");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, [akunWajib, periodeAktif]);

  const statistik = useMemo(() => {
    if (!postingan || postingan.length === 0) return null;
    // Penyebut = jumlah kader NYATA di rekap tiap postingan (sudah+belum),
    // BUKAN angka 24 hardcoded sisa desain dummy lama (roster asli ±151).
    const totalKomentarKader = postingan.reduce((a, p) => a + p.sudah_komentar_kader, 0);
    const dinilai = postingan.filter(
      (p) => p.sudah_komentar_kader + p.belum_komentar_kader > 0,
    );
    const rataKepatuhan =
      dinilai.length === 0
        ? null
        : Math.round(
            dinilai.reduce((a, p) => {
              const total = p.sudah_komentar_kader + p.belum_komentar_kader;
              return a + (p.sudah_komentar_kader / total) * 100;
            }, 0) / dinilai.length,
          );
    return { totalKomentarKader, rataKepatuhan };
  }, [postingan]);

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader
        judul={akunWajib.includes(" ") ? akunWajib : `@${akunWajib}`}
        onKembali={onKembali}
        kanan={<ThemeToggle />}
      />

      {/* Header akun */}
      <FadeInUp>
        <GlassCard className="p-5">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <AvatarInisial nama={akun?.nama_tampilan ?? akunWajib} ukuran={72} />
              <span className="absolute -right-1 -bottom-1">
                <PlatformIcon platform={akun?.platform ?? "instagram"} size={14} denganWadah />
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-heading text-lg font-extrabold text-teks-utama">
                {/* Akun hasil tarik Ayrshare (FB/Threads/YT) memakai NAMA
                    TAMPILAN berspasi — jangan ditempeli "@" seolah username. */}
                {akunWajib.includes(" ") ? akunWajib : `@${akunWajib}`}
              </h2>
              <p className="truncate text-xs text-teks-sekunder">
                {akun?.nama_tampilan ?? "Memuat..."}
              </p>
              <div className="mt-2">
                <StatusBadge
                  label={`${postingan?.length ?? akun?.total_postingan ?? 0} postingan periode ini`}
                  warna="pri"
                />
              </div>
            </div>
          </div>

          {/* Statistik ringkas 3 kolom */}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-black/5 pt-4 dark:border-white/10">
            <div className="flex flex-col items-center">
              <span className="angka-tab font-heading text-lg font-extrabold text-teks-utama">
                {postingan?.length ?? "–"}
              </span>
              <span className="text-[10px] font-medium text-teks-sekunder">Postingan</span>
            </div>
            <div className="flex flex-col items-center">
              <span
                className="angka-tab font-heading text-lg font-extrabold"
                style={{ color: warnaKepatuhan(statistik?.rataKepatuhan ?? 0) }}
              >
                {statistik?.rataKepatuhan != null ? `${statistik.rataKepatuhan}%` : "–"}
              </span>
              <span className="text-[10px] font-medium text-teks-sekunder">
                Rata-rata Kepatuhan
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="angka-tab font-heading text-lg font-extrabold text-teks-utama">
                {statistik ? formatAngkaRingkas(statistik.totalKomentarKader) : "–"}
              </span>
              <span className="text-[10px] font-medium text-teks-sekunder">
                Komentar Kader
              </span>
            </div>
          </div>
        </GlassCard>
      </FadeInUp>

      {/* Daftar postingan */}
      <div className="mt-5 flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-heading text-[15px] font-bold text-teks-utama">
            Postingan Periode Ini
          </h3>
          {/* Transparan soal jendela data yang sedang ditampilkan. */}
          <span className="angka-tab shrink-0 text-[10.5px] text-teks-sekunder">
            {periodeAktif}
          </span>
        </div>

        {postingan === null ? (
          [0, 1, 2].map((i) => (
            <GlassCard key={i} className="overflow-hidden p-0">
              <GlassSkeleton className="h-36 w-full rounded-none" />
              <div className="space-y-2 p-4">
                <GlassSkeleton className="h-3.5 w-full" />
                <GlassSkeleton className="h-3.5 w-2/3" />
                <GlassSkeleton className="h-2.5 w-1/2" />
              </div>
            </GlassCard>
          ))
        ) : postingan.length === 0 ? (
          <GlassCard>
            <EmptyState
              ikon={EyeOff}
              judul="Belum Ada Postingan"
              keterangan="Akun ini belum memiliki postingan pada periode yang dipilih."
            />
          </GlassCard>
        ) : (
          postingan.map((p, i) => {
            // Penyebut riil = jumlah baris rekap postingan ini (roster kader
            // yang dinilai, ±151 orang) — bukan angka 24 hardcoded.
            const totalKader = p.sudah_komentar_kader + p.belum_komentar_kader;
            const persen =
              totalKader > 0
                ? Math.round((p.sudah_komentar_kader / totalKader) * 100)
                : 0;
            const lengkap = totalKader > 0 && p.belum_komentar_kader === 0;
            const belumDiperiksa = totalKader === 0;
            return (
              <FadeInUp key={p.id_postingan} delay={0.04 + i * 0.06}>
                <GlassCard
                  onClick={() => onBukaPostingan(p.id_postingan)}
                  ariaLabel={`Buka detail postingan ${p.id_postingan}`}
                  className="overflow-hidden p-0"
                >
                  {/* Thumbnail + badge status */}
                  <div className="relative">
                    <ThumbnailPostingan url={p.thumbnail_url} platform={p.platform} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                    <div className="absolute top-3 right-3">
                      {belumDiperiksa ? (
                        <StatusBadge label="Belum Diperiksa" warna="kuning" />
                      ) : lengkap ? (
                        <StatusBadge label="Lengkap" warna="hijau" />
                      ) : (
                        <StatusBadge
                          label="Perlu Tindak Lanjut"
                          warna={persen >= 50 ? "kuning" : "merah"}
                        />
                      )}
                    </div>
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                      <PlatformIcon platform={p.platform} size={11} />
                      Diposting {jamMenit(p.waktu_posting)} WIB
                    </div>
                  </div>

                  {/* Isi kartu */}
                  <div className="p-4">
                    <p className="line-clamp-2 text-sm leading-snug text-teks-utama">
                      {p.caption_asli}
                    </p>

                    {/* Statistik mini */}
                    <div className="mt-2.5 flex items-center gap-4 text-xs text-teks-sekunder">
                      <span className="flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5 text-pri" />
                        <span className="angka-tab">{formatAngkaRingkas(p.jumlah_like)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5 text-teks-sekunder" />
                        <span className="angka-tab">{formatAngkaRingkas(p.jumlah_komentar)}</span>
                      </span>
                    </div>

                    {/* Progress kepatuhan postingan */}
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between text-[11px]">
                        <span className="text-teks-sekunder">
                          {belumDiperiksa ? (
                            "Komentar belum diperiksa sinkron"
                          ) : (
                            <>
                              <span className="angka-tab font-bold text-teks-utama">
                                {p.sudah_komentar_kader}
                              </span>{" "}
                              dari {totalKader} kader sudah komentar
                            </>
                          )}
                        </span>
                        <span
                          className="angka-tab font-bold"
                          style={{ color: warnaKepatuhan(persen) }}
                        >
                          {belumDiperiksa ? "–" : `${persen}%`}
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${persen}%` }}
                          transition={{
                            delay: 0.2 + i * 0.06,
                            duration: 0.9,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="h-full rounded-full"
                          style={{
                            background: `linear-gradient(90deg, ${warnaKepatuhan(
                              persen,
                            )}, ${warnaKepatuhan(persen)}CC)`,
                            boxShadow: `0 0 10px ${warnaKepatuhan(persen)}66`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-teks-sekunder">
                        Lihat Detail
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </GlassCard>
              </FadeInUp>
            );
          })
        )}
      </div>
    </div>
  );
}
