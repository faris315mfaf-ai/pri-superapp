"use client";

// ============================================================
// SideNav — navigasi samping untuk layar lebar (≥1024px).
//
// Di HP navigasi ada di bawah (BottomNav); di PC pola itu terasa
// janggal — jempol bukan lagi alat tunjuknya. Maka pada layar
// lebar navigasi pindah ke rel kiri yang selalu terlihat, dan
// BottomNav disembunyikan. Keduanya membaca konfigurasi tab yang
// SAMA dari bottom-nav.tsx supaya daftar menu per peran tidak
// pernah berbeda antara dua bentuk navigasi.
// ============================================================

import { motion } from "framer-motion";
import { LogoPri } from "@/components/logo-pri";
import { KONFIG_TAB, TAB_PER_ROLE, type KunciTab } from "@/components/bottom-nav";
import { VERSI_TAMPIL } from "@/lib/versi";
import type { Role } from "@/types";
import { cn } from "@/lib/utils";

type SideNavProps = {
  role: Role;
  tabAktif: KunciTab;
  onTab: (tab: KunciTab) => void;
  belumBaca?: number;
  /** Daftar tab eksplisit (mis. + "tv" untuk Pimred). Kosong = per peran. */
  tabs?: KunciTab[];
};

export function SideNav({ role, tabAktif, onTab, belumBaca = 0, tabs: tabsProp }: SideNavProps) {
  const tabs = tabsProp ?? TAB_PER_ROLE[role];

  return (
    <aside
      className="glass fixed inset-y-0 left-0 z-30 hidden w-60 flex-col rounded-none px-4 py-6 lg:flex"
      style={{ borderRight: "1px solid var(--glass-border)" }}
      aria-label="Navigasi utama"
    >
      {/* Merek aplikasi */}
      <div className="flex items-center gap-3 px-2">
        <LogoPri ukuran={38} dekoratif />
        <div className="min-w-0">
          <p className="font-heading text-[15px] font-extrabold leading-tight text-teks-utama">
            PRI SuperApp
          </p>
          <p className="text-[10px] text-teks-sekunder">Pusat Kendali Digital</p>
        </div>
      </div>

      {/* Daftar menu */}
      <nav className="mt-7 flex flex-col gap-1.5">
        {tabs.map((kunci) => {
          const { label, ikon: Ikon } = KONFIG_TAB[kunci];
          const aktif = kunci === tabAktif;
          return (
            <button
              key={kunci}
              type="button"
              onClick={() => onTab(kunci)}
              aria-current={aktif ? "page" : undefined}
              className={cn(
                "btn-tekan relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left",
                aktif ? "text-white" : "text-teks-sekunder hover:text-teks-utama",
              )}
            >
              {aktif && (
                <motion.span
                  layoutId="pill-nav-samping"
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                    boxShadow: "0 6px 18px rgba(220, 38, 38, 0.35)",
                  }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">
                <Ikon className="h-[20px] w-[20px]" strokeWidth={aktif ? 2.4 : 2} />
                {kunci === "notifikasi" && belumBaca > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-pri px-1 text-[9px] font-bold text-white ring-2 ring-white/60 dark:ring-slate-900/60"
                    aria-label={`${belumBaca} notifikasi belum dibaca`}
                  >
                    {belumBaca > 99 ? "99+" : belumBaca}
                  </span>
                )}
              </span>
              <span className="relative text-sm font-semibold">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <p className="px-2 text-[10px] text-teks-sekunder/70">
        PRI SuperApp {VERSI_TAMPIL} · © 2026 Partai Rakyat Indonesia
      </p>
    </aside>
  );
}
