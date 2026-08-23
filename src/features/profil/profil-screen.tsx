"use client";

// ============================================================
// ProfilScreen — tab utama profil pengguna & pengaturan.
// Kartu profil dengan badge peran, daftar pengaturan kaca,
// modal tentang aplikasi, dan konfirmasi keluar.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Globe,
  Info,
  LogOut,
  MessageCircle,
  Moon,
  ShieldCheck,
  Sun,
  Tv,
  Zap,
} from "lucide-react";
import {
  AvatarInisial,
  FadeInUp,
  SectionTitle,
  StatusBadge,
  ThemeToggle,
} from "@/components/pri-ui";
import { toast, useAppStore } from "@/hooks/use-app-store";
import type { Role, User } from "@/types";
import { cn } from "@/lib/utils";
import { SwitchKaca } from "./switch-kaca";

// ------------------------------------------------------------
// Tipe & konstanta
// ------------------------------------------------------------

type ProfilScreenProps = {
  user: User;
  onLogout: () => void;
};

const KONFIG_ROLE: Record<
  Role,
  {
    label: string;
    ikon: React.ElementType;
    latar: string;
    tepi: string;
    kelasTeks: string;
    warnaIkon: string;
  }
> = {
  super_admin: {
    label: "Super Admin",
    ikon: Zap,
    latar: "linear-gradient(135deg, rgba(220,38,38,0.16), rgba(245,158,11,0.22))",
    tepi: "rgba(220, 38, 38, 0.32)",
    kelasTeks: "text-pri",
    warnaIkon: "#DC2626",
  },
  admin_hr: {
    label: "Admin HR",
    ikon: ShieldCheck,
    latar: "linear-gradient(135deg, rgba(245,158,11,0.20), rgba(217,119,6,0.14))",
    tepi: "rgba(245, 158, 11, 0.38)",
    kelasTeks: "text-emas",
    warnaIkon: "#F59E0B",
  },
  admin_tv: {
    label: "Admin TV",
    ikon: Tv,
    latar: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.14))",
    tepi: "rgba(16, 185, 129, 0.34)",
    kelasTeks: "text-sukses",
    warnaIkon: "#10B981",
  },
};

// ------------------------------------------------------------
// ModalKaca — modal kaca reusable (Escape / klik backdrop tutup)
// ------------------------------------------------------------

type ModalKacaProps = {
  terbuka: boolean;
  onTutup: () => void;
  labelAria: string;
  children: React.ReactNode;
};

function ModalKaca({ terbuka, onTutup, labelAria, children }: ModalKacaProps) {
  // Tombol Escape menutup modal
  useEffect(() => {
    if (!terbuka) return;
    function tanganiEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onTutup();
    }
    window.addEventListener("keydown", tanganiEscape);
    return () => window.removeEventListener("keydown", tanganiEscape);
  }, [terbuka, onTutup]);

  // Kunci scroll body selama modal terbuka
  useEffect(() => {
    if (!terbuka) return;
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sebelumnya;
    };
  }, [terbuka]);

  return (
    <AnimatePresence>
      {terbuka && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onTutup}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={labelAria}
            className="glass-strong w-full max-w-[320px] rounded-2xl p-5"
            initial={{ scale: 0.9, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------
// BarisPengaturan — baris kartu kaca tipis daftar pengaturan
// ------------------------------------------------------------

type BarisPengaturanProps = {
  ikon: React.ElementType;
  warnaIkon: string;
  label: string;
  kanan?: React.ReactNode;
  onClick?: () => void;
  merah?: boolean;
  redup?: boolean;
};

function BarisPengaturan({
  ikon: Ikon,
  warnaIkon,
  label,
  kanan,
  onClick,
  merah = false,
  redup = false,
}: BarisPengaturanProps) {
  const isi = (
    <>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
        style={{
          backgroundColor: `${warnaIkon}1a`,
          borderColor: `${warnaIkon}38`,
          color: warnaIkon,
        }}
        aria-hidden="true"
      >
        <Ikon className="h-4.5 w-4.5" />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 text-sm font-semibold",
          merah ? "text-gagal" : "text-teks-utama",
        )}
      >
        {label}
      </span>
      {kanan}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "glass flex min-h-[54px] w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left",
          redup ? "cursor-default opacity-70" : "btn-tekan cursor-pointer",
        )}
      >
        {isi}
      </button>
    );
  }

  return (
    <div className="glass flex min-h-[54px] w-full items-center gap-3 rounded-2xl px-4 py-2.5">
      {isi}
    </div>
  );
}

// ------------------------------------------------------------
// ProfilScreen
// ------------------------------------------------------------

export function ProfilScreen({ user, onLogout }: ProfilScreenProps) {
  const tema = useAppStore((s) => s.tema);
  const toggleTema = useAppStore((s) => s.toggleTema);

  const [pushAktif, setPushAktif] = useState(true);
  const [waAktif, setWaAktif] = useState(true);
  const [modalTentang, setModalTentang] = useState(false);
  const [modalKeluar, setModalKeluar] = useState(false);

  const gelap = tema === "dark";
  const peran = KONFIG_ROLE[user.role];
  const IkonPeran = peran.ikon;
  const IkonTema = gelap ? Moon : Sun;
  const warnaIkonTema = gelap ? "#94A3B8" : "#F59E0B";

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      {/* Header tab utama — tanpa tombol kembali */}
      <header className="sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between gap-3 bg-gradient-to-b from-[var(--app-bg)] via-[var(--app-bg)] to-transparent px-4 pb-3 pt-1">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
          Profil
        </h1>
        <ThemeToggle />
      </header>

      {/* Kartu profil kaca */}
      <FadeInUp>
        <div className="glass rounded-[1.25rem] px-5 py-6">
          <div className="flex flex-col items-center text-center">
            <AvatarInisial nama={user.nama} ukuran={72} />
            <h2 className="mt-3.5 font-heading text-xl font-extrabold tracking-tight text-teks-utama">
              {user.nama}
            </h2>
            <p className="mt-1 text-xs text-teks-sekunder">{user.email}</p>
            <span
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold"
              style={{ background: peran.latar, borderColor: peran.tepi }}
            >
              <IkonPeran
                className="h-3.5 w-3.5"
                style={{ color: peran.warnaIkon }}
                aria-hidden="true"
              />
              <span className={peran.kelasTeks}>{peran.label}</span>
            </span>
            <p className="mt-2.5 text-[11px] font-medium text-teks-sekunder">
              {user.jabatan}
            </p>
          </div>
        </div>
      </FadeInUp>

      {/* Daftar pengaturan */}
      <FadeInUp delay={0.08}>
        <SectionTitle judul="Pengaturan" className="mt-6" />
        <div className="flex flex-col gap-2">
          {/* 1. Mode Tema — sinkron dengan store global */}
          <BarisPengaturan
            ikon={IkonTema}
            warnaIkon={warnaIkonTema}
            label="Mode Tema"
            kanan={
              <SwitchKaca aktif={gelap} onUbah={toggleTema} labelAria="Mode gelap" />
            }
          />

          {/* 2. Notifikasi Push */}
          <BarisPengaturan
            ikon={Bell}
            warnaIkon="#DC2626"
            label="Notifikasi Push"
            kanan={
              <SwitchKaca
                aktif={pushAktif}
                onUbah={() => {
                  const baru = !pushAktif;
                  setPushAktif(baru);
                  if (!baru) toast("info", "Notifikasi push dimatikan");
                }}
                labelAria="Notifikasi push"
              />
            }
          />

          {/* 3. Notifikasi WhatsApp */}
          <BarisPengaturan
            ikon={MessageCircle}
            warnaIkon="#10B981"
            label="Notifikasi WhatsApp"
            kanan={
              <SwitchKaca
                aktif={waAktif}
                onUbah={() => setWaAktif((v) => !v)}
                labelAria="Notifikasi WhatsApp"
              />
            }
          />

          {/* 4. Bahasa — belum bisa diubah */}
          <BarisPengaturan
            ikon={Globe}
            warnaIkon="#F59E0B"
            label="Bahasa"
            onClick={() => toast("info", "Bahasa lain segera hadir")}
            redup
            kanan={
              <span className="flex items-center gap-2">
                <span className="text-xs font-medium text-teks-sekunder">Indonesia</span>
                <StatusBadge label="nonaktif" warna="netral" />
              </span>
            }
          />

          {/* 5. Tentang Aplikasi */}
          <BarisPengaturan
            ikon={Info}
            warnaIkon="#DC2626"
            label="Tentang Aplikasi"
            onClick={() => setModalTentang(true)}
            kanan={
              <span className="text-xs font-medium text-teks-sekunder">Versi 1.0.0</span>
            }
          />

          {/* 6. Keluar */}
          <BarisPengaturan
            ikon={LogOut}
            warnaIkon="#EF4444"
            label="Keluar"
            merah
            onClick={() => setModalKeluar(true)}
          />
        </div>
      </FadeInUp>

      {/* Tanda bawah aplikasi */}
      <FadeInUp delay={0.16}>
        <p className="mt-8 text-center text-[11px] text-teks-sekunder/70">
          PRI SuperApp · © 2026 Partai Rakyat Indonesia
        </p>
      </FadeInUp>

      {/* Modal Tentang Aplikasi */}
      <ModalKaca
        terbuka={modalTentang}
        onTutup={() => setModalTentang(false)}
        labelAria="Tentang aplikasi"
      >
        <div className="flex flex-col items-center text-center">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full font-heading text-sm font-extrabold tracking-tight text-white"
            style={{
              background: "linear-gradient(135deg, #DC2626 20%, #F59E0B 100%)",
              boxShadow: "0 10px 24px rgba(220, 38, 38, 0.35)",
            }}
            aria-hidden="true"
          >
            PRI
          </span>
          <h3 className="mt-3.5 font-heading text-base font-bold text-teks-utama">
            PRI SuperApp v1.0.0
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-teks-sekunder">
            Pusat Kendali Digital Partai Rakyat Indonesia
          </p>
          <div
            className="my-3.5 h-px w-full"
            style={{ background: "var(--glass-border)" }}
            aria-hidden="true"
          />
          <p className="text-[11px] leading-relaxed text-teks-sekunder">
            Dikembangkan oleh Tim Digital DPP Partai Rakyat Indonesia untuk
            memantau kepatuhan komentar kader dan mengelola siaran TV Rakyat.
          </p>
          <p className="mt-2 text-[11px] text-teks-sekunder/80">
            © 2026 Partai Rakyat Indonesia
          </p>
          <button
            type="button"
            onClick={() => setModalTentang(false)}
            className="glass btn-tekan mt-4 w-full rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Tutup
          </button>
        </div>
      </ModalKaca>

      {/* Modal Konfirmasi Keluar */}
      <ModalKaca
        terbuka={modalKeluar}
        onTutup={() => setModalKeluar(false)}
        labelAria="Konfirmasi keluar"
      >
        <div className="flex flex-col items-center text-center">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full border"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.14)",
              borderColor: "rgba(239, 68, 68, 0.30)",
              color: "#EF4444",
            }}
            aria-hidden="true"
          >
            <LogOut className="h-5 w-5" />
          </span>
          <h3 className="mt-3.5 font-heading text-base font-bold text-teks-utama">
            Keluar dari PRI SuperApp?
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-teks-sekunder">
            Anda akan kembali ke halaman masuk.
          </p>
          <div className="mt-5 flex w-full gap-2.5">
            <button
              type="button"
              onClick={() => setModalKeluar(false)}
              className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                setModalKeluar(false);
                onLogout();
              }}
              className="btn-tekan flex-1 rounded-xl py-2.5 font-heading text-sm font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
              }}
            >
              Ya, Keluar
            </button>
          </div>
        </div>
      </ModalKaca>
    </div>
  );
}
