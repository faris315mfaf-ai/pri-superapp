"use client";

import type { KomponenIkon } from "@/types";
// ============================================================
// Kumpulan komponen kecil design system PRI SuperApp:
// GlassSkeleton, EmptyState, AvatarInisial, ScreenHeader,
// ThemeToggle, StatusBadge, FadeInUp, SectionTitle
// ============================================================

import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, Sun, Moon, Zap } from "lucide-react";
import { nyalakanModeSimpel } from "@/lib/mode-simpel";
import { cn } from "@/lib/utils";
import { inisial, warnaAvatar } from "@/lib/format";
import { useAppStore } from "@/hooks/use-app-store";
import { TombolSegarSistem } from "@/components/tombol-segar-sistem";

// ------------------------------------------------------------
// GlassSkeleton — skeleton kaca dengan efek shimmer
// ------------------------------------------------------------
export function GlassSkeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-kaca", className)} aria-hidden="true" />;
}

// ------------------------------------------------------------
// EmptyState — keadaan kosong: ikon besar + judul + keterangan + aksi
// ------------------------------------------------------------
type EmptyStateProps = {
  ikon: KomponenIkon;
  judul: string;
  keterangan: string;
  labelAksi?: string;
  onAksi?: () => void;
  className?: string;
};

export function EmptyState({
  ikon: Ikon,
  judul,
  keterangan,
  labelAksi,
  onAksi,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{
          background: "linear-gradient(135deg, rgba(220,38,38,0.14), rgba(245,158,11,0.14))",
          border: "1px solid var(--glass-border)",
        }}
        aria-hidden="true"
      >
        <Ikon className="h-8 w-8 text-pri" />
      </div>
      <h3 className="mt-4 font-heading text-base font-bold text-teks-utama">{judul}</h3>
      <p className="mt-1 max-w-[280px] text-sm leading-relaxed text-teks-sekunder">
        {keterangan}
      </p>
      {labelAksi && onAksi && (
        <button
          type="button"
          onClick={onAksi}
          className="btn-tekan mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
          style={{
            background: "linear-gradient(135deg, #DC2626, #B91C1C)",
            boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
          }}
        >
          {labelAksi}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// AvatarInisial — avatar bulat inisial dengan warna dari hash nama
// ------------------------------------------------------------
type AvatarInisialProps = {
  nama: string;
  ukuran?: "sm" | "md" | "lg" | "xl" | number;
  className?: string;
};

const UKURAN: Record<string, number> = { sm: 32, md: 40, lg: 48, xl: 64 };

export function AvatarInisial({ nama, ukuran = "md", className }: AvatarInisialProps) {
  const px = typeof ukuran === "number" ? ukuran : UKURAN[ukuran] ?? 40;
  const [c1, c2] = warnaAvatar(nama);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-heading font-bold text-white shadow-sm",
        className,
      )}
      style={{
        width: px,
        height: px,
        fontSize: px * 0.36,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
      }}
      aria-hidden="true"
    >
      {inisial(nama)}
    </span>
  );
}

// ------------------------------------------------------------
// ScreenHeader — header halaman dengan tombol kembali
// ------------------------------------------------------------
type ScreenHeaderProps = {
  judul: string;
  onKembali?: () => void;
  kanan?: React.ReactNode;
  className?: string;
};

export function ScreenHeader({ judul, onKembali, kanan, className }: ScreenHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 -mx-4 mb-4 flex items-center gap-3 px-4 pb-3 pt-4",
        "bg-gradient-to-b from-[var(--app-bg)] via-[var(--app-bg)] to-transparent",
        className,
      )}
    >
      {onKembali && (
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-teks-utama"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate font-heading text-lg font-bold text-teks-utama">
        {judul}
      </h1>
      {kanan}
    </header>
  );
}

// ------------------------------------------------------------
// ThemeToggle — tombol matahari/bulan dengan animasi rotate
// ------------------------------------------------------------
// Sejak 2 Sep 2026 ThemeToggle juga MEMBAWA tombol refresh sistem di
// sebelah kirinya: ThemeToggle sudah ada di kanan atas hampir semua layar,
// jadi inilah cara termurah agar tombol refresh "tampil tetap di semua
// layar" tanpa mengedit belasan header. Tombolnya sendiri sembunyi bila
// belum login. `tanpaSegar` untuk layar yang tak butuh.
export function ThemeToggle({
  className,
  tanpaSegar = false,
}: {
  className?: string;
  tanpaSegar?: boolean;
}) {
  const tema = useAppStore((s) => s.tema);
  const toggleTema = useAppStore((s) => s.toggleTema);
  const sudahMasuk = useAppStore((s) => Boolean(s.user));
  const gelap = tema === "dark";

  return (
    <>
    {/* MODE SIMPEL (4 Sep 2026): tombol pengaktif ada di kepala SEMUA modul
        (komponen ini dipakai tiap header) — versi ringan di /simpel. */}
    {sudahMasuk && (
      <button
        type="button"
        onClick={nyalakanModeSimpel}
        aria-label="Aktifkan Mode Simpel (versi ringan)"
        title="Mode Simpel — versi ringan & cepat"
        className={cn(
          "glass btn-tekan flex h-10 shrink-0 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-extrabold uppercase tracking-wide text-teks-utama",
          className,
        )}
      >
        <Zap className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
        Simpel
      </button>
    )}
    {!tanpaSegar && <TombolSegarSistem />}
    <button
      type="button"
      onClick={toggleTema}
      aria-label={gelap ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      className={cn(
        "glass btn-tekan relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-teks-utama",
        className,
      )}
    >
      <motion.span
        key={tema}
        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex"
      >
        {gelap ? (
          <Sun className="h-[18px] w-[18px] text-emas" />
        ) : (
          <Moon className="h-[18px] w-[18px] text-pri" />
        )}
      </motion.span>
    </button>
    </>
  );
}

// ------------------------------------------------------------
// StatusBadge — badge status berwarna semantik
// ------------------------------------------------------------
type WarnaBadge = "hijau" | "kuning" | "merah" | "biru" | "netral" | "pri";

const GAYA_BADGE: Record<WarnaBadge, string> = {
  hijau: "bg-sukses/15 text-emerald-600 dark:text-emerald-400 border-sukses/30",
  kuning: "bg-emas/15 text-amber-600 dark:text-amber-400 border-emas/30",
  merah: "bg-gagal/15 text-red-600 dark:text-red-400 border-gagal/30",
  biru: "bg-info/15 text-blue-600 dark:text-blue-400 border-info/30",
  netral:
    "bg-black/5 dark:bg-white/10 text-teks-sekunder border-black/10 dark:border-white/15",
  pri: "bg-pri/15 text-red-600 dark:text-red-400 border-pri/30",
};

export function StatusBadge({
  label,
  warna = "netral",
  berkedip = false,
  className,
}: {
  label: string;
  warna?: WarnaBadge;
  berkedip?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-tight",
        GAYA_BADGE[warna],
        className,
      )}
    >
      {berkedip && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {label}
    </span>
  );
}

// ------------------------------------------------------------
// FadeInUp — wrapper animasi muncul (fade-in-up) dengan delay stagger
// ------------------------------------------------------------
export function FadeInUp({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  // Mode Simpel (MotionConfig reducedMotion="always") & preferensi OS
  // "kurangi gerakan": tanpa animasi masuk sama sekali — isi langsung
  // tampil, tidak ada opacity 0 yang menunggu tick animasi.
  const kurangiGerak = useReducedMotion();
  if (kurangiGerak) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ------------------------------------------------------------
// SectionTitle — judul seksi + aksi opsional di kanan
// ------------------------------------------------------------
export function SectionTitle({
  judul,
  aksi,
  className,
}: {
  judul: string;
  aksi?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-2", className)}>
      <h2 className="font-heading text-[15px] font-bold tracking-tight text-teks-utama">
        {judul}
      </h2>
      {aksi}
    </div>
  );
}
