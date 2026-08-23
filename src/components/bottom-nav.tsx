"use client";

// ============================================================
// BottomNav — navigation bar kaca mengambang, isi menyesuaikan role.
// Tab aktif: pill merah primary dengan animasi slide (layoutId).
// ============================================================

import { motion } from "framer-motion";
import { Home, ShieldCheck, Tv, Bell, User } from "lucide-react";
import type { Role } from "@/types";
import { cn } from "@/lib/utils";

export type KunciTab = "beranda" | "qc" | "tv" | "notifikasi" | "profil";

const KONFIG_TAB: Record<
  KunciTab,
  { label: string; ikon: React.ElementType }
> = {
  beranda: { label: "Beranda", ikon: Home },
  qc: { label: "QC Konten", ikon: ShieldCheck },
  tv: { label: "TV Rakyat", ikon: Tv },
  notifikasi: { label: "Notifikasi", ikon: Bell },
  profil: { label: "Profil", ikon: User },
};

const TAB_PER_ROLE: Record<Role, KunciTab[]> = {
  super_admin: ["beranda", "qc", "tv", "notifikasi", "profil"],
  admin_hr: ["qc", "notifikasi", "profil"],
  admin_tv: ["tv", "notifikasi", "profil"],
};

type BottomNavProps = {
  role: Role;
  tabAktif: KunciTab;
  onTab: (tab: KunciTab) => void;
  belumBaca?: number;
};

export function BottomNav({ role, tabAktif, onTab, belumBaca = 0 }: BottomNavProps) {
  const tabs = TAB_PER_ROLE[role];

  return (
    <nav
      className="pointer-events-none fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 px-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      aria-label="Navigasi utama"
    >
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
