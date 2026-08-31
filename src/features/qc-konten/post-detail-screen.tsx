"use client";

// ============================================================
// PostDetailScreen — layar paling detail modul QC.
// Thumbnail + caption + statistik + tab Belum/Sudah Komentar
// + pencarian + aksi WhatsApp per kader + Ingatkan Semua.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  ExternalLink,
  Heart,
  MessageCircle,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  AvatarInisial,
  EmptyState,
  FadeInUp,
  GlassSkeleton,
  ScreenHeader,
  StatusBadge,
  ThemeToggle,
 SectionTitle } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import {
  getKader,
  getKomentarByPostingan,
  getPostinganByAkun,
  getRekapPostingan,
} from "@/services";
import { toast } from "@/hooks/use-app-store";
import {
  formatAngkaRingkas,
  linkWhatsApp,
  pesanPengingat,
  warnaKepatuhan,
} from "@/lib/format";
import type { Kader, Komentar, Rekap } from "@/types";
import type { PostinganWithKepatuhan } from "@/services";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "./whatsapp-icon";

type PostDetailScreenProps = {
  idPostingan: string;
  akunWajib: string;
  onKembali: () => void;
};

type BarisBelum = { kader: Kader; rekap: Rekap };
type BarisSudah = { kader: Kader | null; rekap: Rekap; komentar: Komentar | null };

/** "2026-08-23T10:15:00+07:00" → "10:15" */
function jamMenit(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export function PostDetailScreen({
  idPostingan,
  akunWajib,
  onKembali,
}: PostDetailScreenProps) {
  const [postingan, setPostingan] = useState<PostinganWithKepatuhan | null>(null);
  const [rekap, setRekap] = useState<Rekap[] | null>(null);
  const [persen, setPersen] = useState(0);
  const [komentar, setKomentar] = useState<Komentar[]>([]);
  const [kaderList, setKaderList] = useState<Kader[]>([]);

  const [tabAktif, setTabAktif] = useState<"belum" | "sudah">("belum");
  const [cari, setCari] = useState("");
  const [modalIngatkan, setModalIngatkan] = useState(false);

  // Muat semua data paralel
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [daftarPostingan, dataRekap, daftarKomentar, daftarKader] = await Promise.all([
          getPostinganByAkun(akunWajib),
          getRekapPostingan(idPostingan),
          getKomentarByPostingan(idPostingan),
          getKader(),
        ]);
        if (!hidup) return;
        setPostingan(
          daftarPostingan.find((p) => p.id_postingan === idPostingan) ?? null,
        );
        setRekap(dataRekap.rekap);
        setPersen(dataRekap.ringkasan.persen);
        setKomentar(daftarKomentar);
        setKaderList(daftarKader);
      } catch {
        if (hidup) {
          toast("error", "Gagal memuat detail", "Silakan coba lagi.");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, [idPostingan, akunWajib]);

  // Gabungkan rekap + kader + komentar
  const { barisBelum, barisSudah } = useMemo(() => {
    if (!rekap) return { barisBelum: [] as BarisBelum[], barisSudah: [] as BarisSudah[] };
    const cariKader = (nama: string) =>
      kaderList.find((k) => k.nama_kader === nama) ?? null;
    const cariKomentar = (nama: string) =>
      komentar.find((k) => k.nama_kader === nama) ?? null;

    const belum: BarisBelum[] = [];
    const sudah: BarisSudah[] = [];
    for (const r of rekap) {
      if (r.sudah_komentar) {
        sudah.push({ kader: cariKader(r.nama_kader), rekap: r, komentar: cariKomentar(r.nama_kader) });
      } else {
        const kader = cariKader(r.nama_kader);
        if (kader) belum.push({ kader, rekap: r });
      }
    }
    return { barisBelum: belum, barisSudah: sudah };
  }, [rekap, kaderList, komentar]);

  // Filter pencarian
  const q = cari.trim().toLowerCase();
  const belumTampil = q
    ? barisBelum.filter((b) => b.kader.nama_kader.toLowerCase().includes(q))
    : barisBelum;
  const sudahTampil = q
    ? barisSudah.filter(
        (b) => (b.kader?.nama_kader ?? b.rekap.nama_kader).toLowerCase().includes(q),
      )
    : barisSudah;

  const sedangMuat = postingan === null || rekap === null;

  function bukaWhatsApp(kader: Kader) {
    if (!postingan) return;
    const url = linkWhatsApp(
      kader.nomor_wa,
      pesanPengingat(kader.nama_kader, akunWajib, postingan.link_postingan),
    );
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function kirimIngatkanSemua() {
    setModalIngatkan(false);
    toast("sukses", "Pengingat terkirim", `Pengingat WhatsApp dikirim ke ${belumTampil.length} kader`);
  }

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader
        judul="Detail Postingan"
        onKembali={onKembali}
        kanan={<ThemeToggle />}
      />

      {sedangMuat ? (
        <div className="flex flex-col gap-4">
          <GlassSkeleton className="aspect-square w-full rounded-2xl" />
          <GlassSkeleton className="h-4 w-full" />
          <GlassSkeleton className="h-4 w-2/3" />
          <div className="grid grid-cols-3 gap-2.5">
            <GlassSkeleton className="h-16" />
            <GlassSkeleton className="h-16" />
            <GlassSkeleton className="h-16" />
          </div>
          <GlassSkeleton className="h-12 w-full rounded-xl" />
          <GlassSkeleton className="h-52 w-full rounded-2xl" />
        </div>
      ) : !postingan ? (
        <GlassCard>
          <EmptyState
            ikon={Search}
            judul="Postingan Tidak Ditemukan"
            keterangan="Postingan ini mungkin sudah dihapus atau tidak tersedia."
          />
        </GlassCard>
      ) : (
        <>
          {/* Bagian atas: thumbnail + caption + aksi */}
          <FadeInUp>
            <GlassCard className="overflow-hidden p-0">
              <img
                src={postingan.thumbnail_url}
                alt={`Thumbnail postingan ${postingan.id_postingan}`}
                className="aspect-square w-full object-cover"
              />
              <div className="p-4">
                <p className="text-sm leading-relaxed text-teks-utama">
                  {postingan.caption_asli}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    window.open(postingan.link_postingan, "_blank", "noopener,noreferrer")
                  }
                  className="glass btn-tekan mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-teks-utama"
                >
                  <ExternalLink className="h-4 w-4 text-pri" />
                  Buka di Instagram
                </button>
              </div>
            </GlassCard>
          </FadeInUp>

          {/* 3 kartu statistik */}
          <FadeInUp delay={0.06} className="mt-3">
            <div className="grid grid-cols-3 gap-2.5">
              <GlassCard className="flex flex-col items-center gap-1 p-3">
                <Heart className="h-4 w-4 text-pri" />
                <span className="angka-tab font-heading text-base font-extrabold text-teks-utama">
                  {formatAngkaRingkas(postingan.jumlah_like)}
                </span>
                <span className="text-[9px] font-medium text-teks-sekunder">Like</span>
              </GlassCard>
              <GlassCard className="flex flex-col items-center gap-1 p-3">
                <MessageCircle className="h-4 w-4 text-emas" />
                <span className="angka-tab font-heading text-base font-extrabold text-teks-utama">
                  {formatAngkaRingkas(postingan.jumlah_komentar)}
                </span>
                <span className="text-[9px] font-medium text-teks-sekunder">Komentar</span>
              </GlassCard>
              <GlassCard className="flex flex-col items-center gap-1 p-3">
                <span
                  className="angka-tab font-heading text-base font-extrabold"
                  style={{ color: warnaKepatuhan(persen) }}
                >
                  {persen}%
                </span>
                <span className="text-[9px] font-medium text-teks-sekunder">Kepatuhan</span>
              </GlassCard>
            </div>
          </FadeInUp>

          {/* Pencarian + filter */}
          <FadeInUp delay={0.1} className="mt-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-teks-sekunder" />
                <input
                  type="search"
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Cari nama kader..."
                  aria-label="Cari nama kader"
                  className="glass-input h-11 w-full rounded-xl pr-4 pl-10 text-sm text-teks-utama placeholder:text-teks-sekunder/70"
                />
              </div>
              <button
                type="button"
                aria-label="Filter lanjutan"
                onClick={() =>
                  toast("info", "Filter Lanjutan", "Fitur filter lanjutan segera hadir.")
                }
                className="glass btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-teks-utama"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
          </FadeInUp>

          {/* Segmented control 2 tab */}
          <FadeInUp delay={0.12} className="mt-3">
            <div className="glass flex rounded-2xl p-1">
              <button
                type="button"
                onClick={() => setTabAktif("belum")}
                aria-pressed={tabAktif === "belum"}
                className={cn(
                  "btn-tekan relative flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-colors",
                  tabAktif === "belum" ? "text-white" : "text-teks-sekunder",
                )}
              >
                {tabAktif === "belum" && (
                  <motion.span
                    layoutId="segmen-qc"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                      boxShadow: "0 6px 16px rgba(220, 38, 38, 0.3)",
                    }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">Belum Komentar</span>
                <span
                  className={cn(
                    "relative angka-tab rounded-full px-1.5 py-px text-[10px] font-extrabold",
                    tabAktif === "belum"
                      ? "bg-white/25 text-white"
                      : "bg-gagal/15 text-gagal",
                  )}
                >
                  {belumTampil.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTabAktif("sudah")}
                aria-pressed={tabAktif === "sudah"}
                className={cn(
                  "btn-tekan relative flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-colors",
                  tabAktif === "sudah" ? "text-white" : "text-teks-sekunder",
                )}
              >
                {tabAktif === "sudah" && (
                  <motion.span
                    layoutId="segmen-qc"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: "linear-gradient(135deg, #059669, #10B981)",
                      boxShadow: "0 6px 16px rgba(16, 185, 129, 0.3)",
                    }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">Sudah Komentar</span>
                <span
                  className={cn(
                    "relative angka-tab rounded-full px-1.5 py-px text-[10px] font-extrabold",
                    tabAktif === "sudah"
                      ? "bg-white/25 text-white"
                      : "bg-sukses/15 text-sukses",
                  )}
                >
                  {sudahTampil.length}
                </span>
              </button>
            </div>
          </FadeInUp>

          {/* Konten tab */}
          <div className="mt-3">
            <AnimatePresence mode="wait" initial={false}>
              {tabAktif === "belum" ? (
                <motion.div
                  key="belum"
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Tombol Ingatkan Semua */}
                  {belumTampil.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setModalIngatkan(true)}
                      className="btn-tekan mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold text-white"
                      style={{
                        background: "linear-gradient(135deg, #10B981, #059669)",
                        boxShadow: "0 8px 20px rgba(16, 185, 129, 0.35)",
                      }}
                    >
                      <Bell className="h-4.5 w-4.5" />
                      Ingatkan Semua ({belumTampil.length})
                    </button>
                  )}

                  {belumTampil.length === 0 ? (
                    <GlassCard>
                      <EmptyState
                        ikon={CheckCircle2}
                        judul={
                          q
                            ? "Tidak Ada Kader Ditemukan"
                            : "Semua Kader Sudah Komentar"
                        }
                        keterangan={
                          q
                            ? `Tidak ada kader bernama "${cari}" dalam daftar ini.`
                            : "Kepatuhan postingan ini sudah 100%. Kerja bagus!"
                        }
                      />
                    </GlassCard>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {belumTampil.map((b, i) => (
                        <FadeInUp key={b.kader.id} delay={Math.min(i * 0.04, 0.3)}>
                          <GlassCard className="flex items-center gap-3 p-3">
                            <AvatarInisial nama={b.kader.nama_kader} ukuran="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-teks-utama">
                                {b.kader.nama_kader}
                              </p>
                              <p className="truncate text-[11px] text-teks-sekunder">
                                {b.kader.wilayah} · {b.kader.jabatan}
                              </p>
                              <p className="truncate font-mono text-[10px] text-teks-sekunder/80">
                                @{b.kader.ig_username}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => bukaWhatsApp(b.kader)}
                              aria-label={`Kirim pengingat WhatsApp ke ${b.kader.nama_kader}`}
                              className="btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#25D366]/40 text-[#25D366]"
                              style={{
                                background: "rgba(37, 211, 102, 0.12)",
                                boxShadow: "0 4px 12px rgba(37, 211, 102, 0.25)",
                              }}
                            >
                              <WhatsAppIcon size={20} />
                            </button>
                          </GlassCard>
                        </FadeInUp>
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="sudah"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 14 }}
                  transition={{ duration: 0.2 }}
                >
                  {sudahTampil.length === 0 ? (
                    <GlassCard>
                      <EmptyState
                        ikon={MessageCircle}
                        judul="Belum Ada yang Komentar"
                        keterangan="Belum ada kader yang berkomentar di postingan ini."
                      />
                    </GlassCard>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {sudahTampil.map((b, i) => {
                        const nama = b.kader?.nama_kader ?? b.rekap.nama_kader;
                        const username = b.kader?.ig_username ?? b.komentar?.ig_username ?? "";
                        return (
                          <FadeInUp key={b.rekap.id_unik} delay={Math.min(i * 0.04, 0.3)}>
                            <GlassCard className="flex items-start gap-3 p-3">
                              <AvatarInisial nama={nama} ukuran="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-semibold text-teks-utama">
                                    {nama}
                                  </p>
                                  <span className="shrink-0 text-[10px] text-teks-sekunder">
                                    {b.komentar ? `${jamMenit(b.komentar.waktu_komentar)} WIB` : ""}
                                  </span>
                                </div>
                                {username && (
                                  <p className="truncate font-mono text-[10px] text-teks-sekunder/80">
                                    @{username}
                                  </p>
                                )}
                                {b.komentar && (
                                  <div className="glass-soft mt-1.5 rounded-xl rounded-tl-sm px-3 py-2">
                                    <p className="text-xs leading-snug text-teks-utama italic">
                                      “{b.komentar.isi_komentar}”
                                    </p>
                                  </div>
                                )}
                              </div>
                              <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-sukses" />
                            </GlassCard>
                          </FadeInUp>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* SEMUA KOMENTAR MASUK (31 Agu 2026): dibagi dua — komentar
              dari AKUN TERDAFTAR di sistem (tercocok ke kader) vs akun
              yang TIDAK terdaftar. Sumbernya tabel komentar apa adanya. */}
          <FadeInUp delay={0.1} className="mt-5">
            <SectionTitle judul={`Semua Komentar Masuk (${komentar.length})`} />
            {komentar.length === 0 ? (
              <GlassCard className="p-4">
                <p className="text-center text-[12px] text-teks-sekunder">
                  Belum ada komentar terbaca di postingan ini.
                </p>
              </GlassCard>
            ) : (
              <div className="flex flex-col gap-3">
                {(
                  [
                    ["Akun Terdaftar di Sistem", komentar.filter((k) => k.nama_kader)],
                    ["Tidak Terdaftar di Sistem", komentar.filter((k) => !k.nama_kader)],
                  ] as const
                ).map(([judulKelompok, daftar]) => (
                  <GlassCard key={judulKelompok} className="p-3.5">
                    <p className="text-[12px] font-bold text-teks-utama">
                      {judulKelompok}{" "}
                      <span className="angka-tab font-normal text-teks-sekunder">
                        ({daftar.length})
                      </span>
                    </p>
                    {daftar.length === 0 ? (
                      <p className="mt-1.5 text-[11px] text-teks-sekunder">Tidak ada.</p>
                    ) : (
                      <div className="scrollbar-tipis mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                        {daftar.map((k) => (
                          <div
                            key={k.id_komentar}
                            className="glass-soft rounded-xl rounded-tl-sm px-3 py-2"
                          >
                            <p className="text-[11px] font-bold text-teks-utama">
                              {k.nama_kader ? `${k.nama_kader} · ` : ""}
                              <span className="font-mono font-normal text-teks-sekunder">
                                @{k.ig_username}
                              </span>
                            </p>
                            <p className="mt-0.5 text-xs leading-snug text-teks-utama italic">
                              “{k.isi_komentar}”
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassCard>
                ))}
              </div>
            )}
          </FadeInUp>
        </>
      )}

      {/* Modal konfirmasi Ingatkan Semua */}
      <AnimatePresence>
        {modalIngatkan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md"
            onClick={() => setModalIngatkan(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi kirim pengingat"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                >
                  <Bell className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-heading text-base font-bold text-teks-utama">
                    Kirim Pengingat WhatsApp
                  </h3>
                  <p className="mt-1 text-sm leading-snug text-teks-sekunder">
                    Kirim pengingat WhatsApp ke{" "}
                    <span className="font-bold text-teks-utama">{belumTampil.length} kader</span>?
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalIngatkan(false)}
                  className="glass btn-tekan min-h-[44px] rounded-xl text-sm font-semibold text-teks-utama"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={kirimIngatkanSemua}
                  className="btn-tekan min-h-[44px] rounded-xl text-sm font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, #10B981, #059669)",
                    boxShadow: "0 8px 20px rgba(16, 185, 129, 0.35)",
                  }}
                >
                  Kirim
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
