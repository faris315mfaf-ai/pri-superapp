"use client";

// ============================================================
// NotifikasiScreen — tab utama pusat notifikasi.
// Pengelompokan Hari Ini / Kemarin / Lebih Lama, titik belum
// dibaca, swipe-ke-kiri untuk hapus, dan tandai semua dibaca.
// Data dikelola store global (dimuat page.tsx via getNotifikasi).
// ============================================================

import { useEffect, useRef } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  ArrowLeft,
  BellOff,
  CheckCheck,
  Settings2,
  ShieldCheck,
  Trash2,
  Video,
} from "lucide-react";
import {
  EmptyState,
  FadeInUp,
  GlassSkeleton,
  SectionTitle,
  ThemeToggle,
} from "@/components/pri-ui";
import { toast, useAppStore } from "@/hooks/use-app-store";
import type { KomponenIkon, NotifikasiItem } from "@/types";

// ------------------------------------------------------------
// Tipe & konstanta
// ------------------------------------------------------------

type TargetLayar = "qc" | "tv" | "dashboard" | null;

type NotifikasiScreenProps = {
  onTarget: (target: TargetLayar) => void;
  /** Kembali ke layar sebelumnya (notifikasi kini sub-layar) */
  onKembali?: () => void;
};

const KONFIG_KATEGORI: Record<string, { ikon: KomponenIkon; warna: string }> = {
  QC: { ikon: ShieldCheck, warna: "#DC2626" },
  VIDEO: { ikon: Video, warna: "#F59E0B" },
  SISTEM: { ikon: Settings2, warna: "#10B981" },
  // Kategori dari pengirim kabar server (penugasan, perizinan, rilis)
  info: { ikon: Settings2, warna: "#3B82F6" },
  sukses: { ikon: ShieldCheck, warna: "#10B981" },
  peringatan: { ikon: Video, warna: "#F59E0B" },
};

/**
 * Konfigurasi kategori dengan CADANGAN WAJIB.
 *
 * Pelajaran mahal 25 Agu 2026: satu baris notifikasi berkategori
 * "info" (yang belum terdaftar di peta) membuat lookup ini undefined,
 * `.ikon`-nya melempar TypeError, dan karena semua layar tab dipasang
 * bersamaan di page.tsx, SELURUH aplikasi ikut runtuh — setiap
 * pengguna hanya melihat "This page couldn't load". Data dari server
 * tidak boleh pernah dianggap pasti dikenal.
 */
function konfigKategori(kategori: string) {
  return KONFIG_KATEGORI[kategori] ?? { ikon: Settings2, warna: "#94A3B8" };
}

const SEKSI: { kelompok: NotifikasiItem["kelompok"]; judul: string }[] = [
  { kelompok: "HARI_INI", judul: "Hari Ini" },
  { kelompok: "KEMARIN", judul: "Kemarin" },
  { kelompok: "LEBIH_LAMA", judul: "Lebih Lama" },
];

/** Penanda modul: data notifikasi pernah terisi (bertahan lintas remount tab) */
let sudahAdaDataNotifikasi = false;

/** Target "notifikasi" berarti tetap di layar ini → null */
function targetLayar(target: NotifikasiItem["target"]): TargetLayar {
  return target === "qc" || target === "tv" || target === "dashboard"
    ? target
    : null;
}

// ------------------------------------------------------------
// BarisNotifikasi — kartu kaca dengan swipe-ke-kiri untuk hapus
// ------------------------------------------------------------

type BarisNotifikasiProps = {
  item: NotifikasiItem;
  onTarget: (target: TargetLayar) => void;
};

function BarisNotifikasi({ item, onTarget }: BarisNotifikasiProps) {
  const tandaiDibaca = useAppStore((s) => s.tandaiDibaca);
  const hapusNotifikasi = useAppStore((s) => s.hapusNotifikasi);

  const refBaris = useRef<HTMLButtonElement>(null);
  const sedangHapus = useRef(false);
  const x = useMotionValue(0);
  const opasitasAksi = useTransform(x, [-16, -56], [0, 1]);

  const kategori = konfigKategori(item.kategori);
  const IkonKategori = kategori.ikon;

  async function prosesHapus() {
    if (sedangHapus.current) return;
    sedangHapus.current = true;
    const lebar = refBaris.current?.offsetWidth ?? 400;
    // Luncurkan keluar ke kiri, lalu hapus dari store
    await animate(x, -(lebar + 60), { duration: 0.24, ease: "easeIn" });
    hapusNotifikasi(item.id);
    toast("sukses", "Notifikasi dihapus");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        height: 0,
        marginBottom: 0,
        transition: { duration: 0.18 },
      }}
      className="mb-2.5"
    >
      <div className="relative overflow-hidden rounded-2xl">
        {/* Aksi hapus merah di belakang baris — terungkap saat swipe kiri */}
        <motion.button
          type="button"
          style={{ opacity: opasitasAksi }}
          onClick={() => void prosesHapus()}
          aria-label="Hapus notifikasi"
          tabIndex={-1}
          className="absolute inset-y-0 right-0 z-0 flex w-[120px] flex-col items-center justify-center gap-0.5 rounded-2xl bg-gagal text-white"
        >
          <Trash2 className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] font-semibold">Hapus</span>
        </motion.button>

        {/* Kartu kaca — bisa di-swipe dan diklik */}
        <motion.button
          ref={refBaris}
          type="button"
          drag="x"
          dragConstraints={{ left: -120, right: 0 }}
          dragElastic={0.08}
          dragMomentum={false}
          style={{ x }}
          whileTap={{ scale: 0.985 }}
          onDragEnd={(_, info) => {
            if (info.offset.x < -80 || info.velocity.x < -500) {
              void prosesHapus();
            } else {
              void animate(x, 0, {
                type: "spring",
                stiffness: 400,
                damping: 35,
              });
            }
          }}
          onClick={() => {
            // Bedakan tap vs drag: offset kecil berarti tap biasa
            if (Math.abs(x.get()) > 6) return;
            tandaiDibaca(item.id);
            onTarget(targetLayar(item.target));
          }}
          aria-label={`Notifikasi: ${item.judul}, ${item.waktu_relatif}${
            item.dibaca ? "" : ", belum dibaca"
          }`}
          className="glass relative z-10 flex w-full items-start gap-3 rounded-2xl px-3.5 py-3 text-left"
        >
          {/* Titik biru belum dibaca */}
          <span className="mt-[9px] flex w-2 shrink-0 justify-center" aria-hidden="true">
            {!item.dibaca && (
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: "#3B82F6",
                  boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.22)",
                }}
              />
            )}
          </span>

          {/* Ikon kategori dalam lingkaran kaca lembut */}
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
            style={{
              backgroundColor: `${kategori.warna}1a`,
              borderColor: `${kategori.warna}38`,
              color: kategori.warna,
            }}
            aria-hidden="true"
          >
            <IkonKategori className="h-4.5 w-4.5" />
          </span>

          {/* Judul, isi, dan waktu relatif */}
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-heading text-sm font-bold text-teks-utama">
                {item.judul}
              </span>
              <span className="shrink-0 text-[11px] text-teks-sekunder">
                {item.waktu_relatif}
              </span>
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-teks-sekunder line-clamp-2">
              {item.isi}
            </span>
          </span>
        </motion.button>
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// NotifikasiScreen
// ------------------------------------------------------------

export function NotifikasiScreen({ onTarget, onKembali }: NotifikasiScreenProps) {
  const notifikasi = useAppStore((s) => s.notifikasi);
  const tandaiSemuaDibaca = useAppStore((s) => s.tandaiSemuaDibaca);
  // Penanda dari page.tsx: pemuatan pertama sudah selesai (sukses ATAU
  // gagal). Dulu skeleton menunggu daftar TERISI — bila notifikasi
  // memang kosong, layar "loading terus" selamanya.
  const notifikasiSiap = useAppStore((s) => s.notifikasiSiap);

  const adaBelumDibaca = notifikasi.some((n) => !n.dibaca);
  const sedangMemuat = notifikasi.length === 0 && !notifikasiSiap;

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      {/* Header tab utama — tanpa tombol kembali */}
      <header className="sticky top-0 z-30 -mx-4 bg-gradient-to-b from-[var(--app-bg)] via-[var(--app-bg)] to-transparent px-4 pb-2 pt-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {onKembali && (
              <button
                type="button"
                onClick={onKembali}
                aria-label="Kembali"
                className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-teks-utama"
              >
                <ArrowLeft className="h-4.5 w-4.5" />
              </button>
            )}
            <h1 className="font-heading truncate text-2xl font-extrabold tracking-tight text-teks-utama">
              Notifikasi
            </h1>
          </div>
          <ThemeToggle />
        </div>
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            disabled={!adaBelumDibaca}
            onClick={() => {
              tandaiSemuaDibaca();
              toast("sukses", "Semua notifikasi ditandai dibaca");
            }}
            aria-label="Tandai semua notifikasi dibaca"
            className="glass btn-tekan flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-teks-utama disabled:cursor-not-allowed disabled:opacity-45"
          >
            <CheckCheck className="h-3.5 w-3.5 text-pri" aria-hidden="true" />
            Tandai semua dibaca
          </button>
        </div>
      </header>

      {/* Skeleton saat data belum dimuat page.tsx */}
      {sedangMemuat ? (
        <div className="flex flex-col gap-2.5" role="status" aria-label="Memuat notifikasi">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl p-3.5">
              <GlassSkeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <GlassSkeleton className="h-3.5 w-2/3 rounded-full" />
                <GlassSkeleton className="h-3 w-5/6 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : notifikasi.length === 0 ? (
        <EmptyState
          ikon={BellOff}
          judul="Tidak Ada Notifikasi"
          keterangan="Notifikasi baru akan muncul di sini."
          className="mt-12"
        />
      ) : (
        SEKSI.map(({ kelompok, judul }, idx) => {
          const isiSeksi = notifikasi.filter((n) => n.kelompok === kelompok);
          if (isiSeksi.length === 0) return null;
          return (
            <FadeInUp key={kelompok} delay={idx * 0.06} className="mb-5">
              <SectionTitle judul={judul} />
              <AnimatePresence>
                {isiSeksi.map((item) => (
                  <BarisNotifikasi key={item.id} item={item} onTarget={onTarget} />
                ))}
              </AnimatePresence>
            </FadeInUp>
          );
        })
      )}
    </div>
  );
}
