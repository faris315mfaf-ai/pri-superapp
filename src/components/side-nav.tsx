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
import { PanelBottom } from "lucide-react";
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
  /**
   * Desain Apple (6 Okt 2026, lib/desain-apple): sidebar mengambang ala
   * macOS + tombol pengalih ke Dock.
   */
  apple?: boolean;
  onJadikanDock?: () => void;
};

export function SideNav({ role, tabAktif, onTab, belumBaca = 0, tabs: tabsProp, apple = false, onJadikanDock }: SideNavProps) {
  const tabs = tabsProp ?? TAB_PER_ROLE[role];

  return (
    <aside
      className={cn(
        "fixed z-30 hidden w-60 flex-col lg:flex",
        apple
          ? "sidebar-apple inset-y-3 left-3 rounded-[22px] px-3 py-5"
          : "glass inset-y-0 left-0 rounded-none px-4 py-6",
      )}
      style={apple ? undefined : { borderRight: "1px solid var(--glass-border)" }}
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
      <nav className={cn("mt-7 flex flex-col", apple ? "gap-0.5" : "gap-1.5")}>
        {tabs.map((kunci) => {
          const { label, ikon: Ikon } = KONFIG_TAB[kunci];
          const aktif = kunci === tabAktif;
          return (
            <button
              key={kunci}
              type="button"
              onClick={() => onTab(kunci)}
              aria-current={aktif ? "page" : undefined}
              data-tur={`nav-${kunci}`}
              className={cn(
                "btn-tekan relative flex items-center gap-3 text-left",
                apple
                  ? cn(
                      "sidebar-apple-item rounded-[10px] px-3 py-2",
                      aktif ? "text-teks-utama" : "text-teks-utama/80 hover:text-teks-utama",
                    )
                  : cn("rounded-xl px-3.5 py-2.5", aktif ? "text-white" : "text-teks-sekunder hover:text-teks-utama"),
              )}
            >
              {aktif && (
                <motion.span
                  layoutId={apple ? "pill-nav-samping-apple" : "pill-nav-samping"}
                  className={cn("absolute inset-0", apple ? "sidebar-apple-pil rounded-[10px]" : "rounded-xl")}
                  style={
                    apple
                      ? undefined
                      : {
                          background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                          boxShadow: "0 6px 18px rgba(220, 38, 38, 0.35)",
                        }
                  }
                  // Desain Apple: redaman kritis (tanpa pantulan), respons ±0,35 dtk.
                  transition={apple ? { type: "spring", bounce: 0, duration: 0.35 } : { type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className={cn("relative", apple && aktif && "text-pri")}>
                <Ikon className={apple ? "h-[18px] w-[18px]" : "h-[20px] w-[20px]"} strokeWidth={apple ? (aktif ? 2.2 : 1.8) : aktif ? 2.4 : 2} />
                {kunci === "notifikasi" && belumBaca > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-pri px-1 text-[9px] font-bold text-white ring-2 ring-white/60 dark:ring-slate-900/60"
                    aria-label={`${belumBaca} notifikasi belum dibaca`}
                  >
                    {belumBaca > 99 ? "99+" : belumBaca}
                  </span>
                )}
              </span>
              <span className={cn("relative text-sm", apple ? (aktif ? "font-semibold" : "font-medium") : "font-semibold")}>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {apple && onJadikanDock && (
        <button
          type="button"
          onClick={onJadikanDock}
          className="btn-tekan sidebar-apple-item mb-3 flex items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm font-medium text-teks-utama/80 hover:text-teks-utama"
        >
          <PanelBottom className="h-[18px] w-[18px]" strokeWidth={1.8} />
          Jadikan Dock
        </button>
      )}

      <p className="px-2 text-[10px] text-teks-sekunder/70">
        PRI SuperApp {VERSI_TAMPIL} · © 2026 Partai Rakyat Indonesia
      </p>
    </aside>
  );
}
