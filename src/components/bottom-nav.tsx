"use client";

// ============================================================
// BottomNav — navigation bar kaca mengambang, isi menyesuaikan role.
// Tab aktif: pill merah primary dengan animasi slide (layoutId).
// ============================================================

import { motion } from "framer-motion";
import { Home, Newspaper, ShieldCheck, Tv, Clapperboard, MessagesSquare, Bell, User } from "lucide-react";
import type { Role } from "@/types";
import { cn } from "@/lib/utils";

export type KunciTab =
  | "beranda"
  | "konten"
  | "qc"
  | "tv"
  | "tvrku"
  | "chat"
  | "notifikasi"
  | "profil";

export const KONFIG_TAB: Record<
  KunciTab,
  { label: string; ikon: React.ElementType }
> = {
  beranda: { label: "Beranda", ikon: Home },
  konten: { label: "Konten", ikon: Newspaper },
  qc: { label: "QC Konten", ikon: ShieldCheck },
  tv: { label: "TV Rakyat", ikon: Tv },
  tvrku: { label: "TVR Saya", ikon: Clapperboard },
  chat: { label: "Chat", ikon: MessagesSquare },
  notifikasi: { label: "Notifikasi", ikon: Bell },
  profil: { label: "Profil", ikon: User },
};

export const TAB_PER_ROLE: Record<Role, KunciTab[]> = {
  // Master melihat semuanya — termasuk modul TV Rakyat, yang justru
  // TIDAK boleh diakses super admin.
  master: ["beranda", "qc", "tv", "tvrku", "chat", "profil"],
  super_admin: ["beranda", "qc", "chat", "profil"],
  admin_hr: ["qc", "chat", "profil"],
  admin_tv: ["tv", "chat", "profil"],
  // Ketua & anggota: konten + TVR Saya + chat. Ketua tambahannya ada
  // di hak (membentuk tim), bukan di tab.
  // Ketua & anggota kini punya Beranda sendiri sebagai halaman awal.
  ketua: ["beranda", "konten", "tvrku", "chat", "profil"],
  anggota: ["beranda", "konten", "tvrku", "chat", "profil"],
};

type BottomNavProps = {
  role: Role;
  tabAktif: KunciTab;
  onTab: (tab: KunciTab) => void;
  belumBaca?: number;
  /** Daftar tab eksplisit (mis. + "tv" untuk Pimred). Kosong = per peran. */
  tabs?: KunciTab[];
};

export function BottomNav({ role, tabAktif, onTab, belumBaca = 0, tabs: tabsProp }: BottomNavProps) {
  const tabs = tabsProp ?? TAB_PER_ROLE[role];

  return (
    <nav
      className="pointer-events-none fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 px-4 lg:hidden"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      aria-label="Navigasi utama"
    >
      {/* Lapisan buram di belakang navigasi.
          Dipasang selebar layar (bukan cuma selebar pil navigasi) supaya
          konten yang menggulir ke bawah larut perlahan, bukan terpotong
          tajam di tepi pil. Masknya membuat efek buram menguat ke bawah:
          bening di atas, penuh di dekat navigasi. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[calc(100%+2.5rem)]"
        style={{
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 45%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 45%)",
        }}
      />
      <div className="glass pointer-events-auto flex items-center justify-around rounded-[1.6rem] px-2 py-2">
        {tabs.map((kunci) => {
          const { label, ikon: Ikon } = KONFIG_TAB[kunci];
          const aktif = kunci === tabAktif;
          return (
            <button
              key={kunci}
              type="button"
              onClick={() => onTab(kunci)}
              aria-label={label}
              aria-current={aktif ? "page" : undefined}
              className={cn(
                "btn-tekan relative flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5",
                aktif ? "text-white" : "text-teks-sekunder",
              )}
            >
              {aktif && (
                <motion.span
                  layoutId="pill-tab-aktif"
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                    boxShadow: "0 6px 18px rgba(220, 38, 38, 0.4)",
                  }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">
                <Ikon className="h-[22px] w-[22px]" strokeWidth={aktif ? 2.4 : 2} />
                {kunci === "notifikasi" && belumBaca > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-pri px-1 text-[9px] font-bold text-white ring-2 ring-white/60 dark:ring-slate-900/60"
                    aria-label={`${belumBaca} notifikasi belum dibaca`}
                  >
                    {belumBaca > 99 ? "99+" : belumBaca}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "relative text-[10px] font-semibold leading-none",
                  aktif ? "text-white" : "text-teks-sekunder",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
