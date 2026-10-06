"use client";

// ============================================================
// BottomNav — navigation bar kaca mengambang, isi menyesuaikan role.
// Tab aktif: pill merah primary dengan animasi slide (layoutId).
// ============================================================

import { useRef, useState } from "react";
import { motion, useAnimate } from "framer-motion";
import { Home, Newspaper, Radio, ShieldCheck, Tv, Clapperboard, MessagesSquare, Bell, User, CalendarDays, LayoutDashboard, Bot } from "lucide-react";
import type { KomponenIkon, Role } from "@/types";
import { cn } from "@/lib/utils";
import { WARNA_DOCK } from "@/components/warna-dock";

export type KunciTab =
  | "beranda"
  | "konten"
  | "qc"
  | "acara"
  | "tv"
  | "tvnas"
  | "tvrku"
  | "dashboard"
  | "asisten"
  | "chat"
  | "notifikasi"
  | "profil";

export const KONFIG_TAB: Record<
  KunciTab,
  { label: string; ikon: KomponenIkon }
> = {
  beranda: { label: "Beranda", ikon: Home },
  konten: { label: "Konten", ikon: Newspaper },
  qc: { label: "HR Center", ikon: ShieldCheck },
  tv: { label: "TV Rakyat Ofc", ikon: Tv },
  // Modul gabungan (12 Sep 2026): angka nasional + seluruh kendali
  // TV Rakyat Official, dipegang jabatan TV Rakyat Nasional.
  tvnas: { label: "TV Nasional", ikon: Radio },
  acara: { label: "Acara", ikon: CalendarDays },
  tvrku: { label: "TVR Saya", ikon: Clapperboard },
  // Modul Dashboard (fitur 1.19/3.3): tampil hanya bila jabatannya
  // diberi akses master — daftar tab dinamis dihitung di page.tsx.
  dashboard: { label: "Dashboard", ikon: LayoutDashboard },
  // Asisten AI (fitur 1.20/3): tampil hanya untuk jabatan yang
  // dinyalakan master di Kelola Akses.
  asisten: { label: "Asisten", ikon: Bot },
  chat: { label: "Chat", ikon: MessagesSquare },
  notifikasi: { label: "Notifikasi", ikon: Bell },
  profil: { label: "Profil", ikon: User },
};

export const TAB_PER_ROLE: Record<Role, KunciTab[]> = {
  // Master melihat semuanya — termasuk modul TV Rakyat, yang justru
  // TIDAK boleh diakses super admin.
  // Modul KONTEN wajib hadir untuk SEMUA peran (fitur 1.20/5): isinya
  // tarikan konten sosmed TV Rakyat hasil Ayrshare/upload-post.
  master: ["beranda", "konten", "qc", "tv", "tvrku", "chat", "profil"],
  // HR Center (qc) hanya untuk Divisi HR (10 Sep 2026) — Ketua Umum tidak
  // lagi membawanya di tab bawaan; page.tsx menambahkannya bila adalahHR().
  super_admin: ["beranda", "konten", "chat", "profil"],
  // superadmin: Dashboard penuh (beranda) + Konten penuh; tab Dashboard
  // ditambahkan dinamis. Tanpa TV Official, chat, robot, suara.
  superadmin: ["beranda", "konten", "profil"],
  admin_hr: ["konten", "qc", "chat", "profil"],
  admin_tv: ["konten", "tv", "chat", "profil"],
  // Ketua & anggota: konten + TVR Saya + chat. Ketua tambahannya ada
  // di hak (membentuk tim), bukan di tab.
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
  /** Desain Apple (6 Okt 2026): pil aktif bernada lembut, bukan gradien merah. */
  apple?: boolean;
  /** Desain baru (7 Okt 2026): Dock bergaya macOS juga di HP & tablet. */
  gayaDock?: boolean;
};

export function BottomNav({ role, tabAktif, onTab, belumBaca = 0, tabs: tabsProp, apple = false, gayaDock = false }: BottomNavProps) {
  const tabs = tabsProp ?? TAB_PER_ROLE[role];
  if (gayaDock) return <DockHp tabs={tabs} tabAktif={tabAktif} onTab={onTab} belumBaca={belumBaca} />;

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
      {/* Bug 1.22.x/2: saat tab banyak (mis. akun HR: 7-8 tab), bar
          digulir mendatar alih-alih menyempit sampai sesak. Tiap tab
          punya lebar minimum; kalau muat, flex-1 membiarkannya melebar
          memenuhi bar. */}
      <div className="glass tanpa-scrollbar pointer-events-auto flex items-center gap-0.5 overflow-x-auto rounded-[1.6rem] px-2 py-2">
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
              data-tur={`nav-${kunci}`}
              className={cn(
                "btn-tekan relative flex min-h-[44px] grow shrink-0 basis-[58px] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5",
                aktif ? (apple ? "text-pri" : "text-white") : "text-teks-sekunder",
              )}
            >
              {aktif && (
                <motion.span
                  layoutId={apple ? "pill-tab-aktif-apple" : "pill-tab-aktif"}
                  className={cn("absolute inset-0 rounded-2xl", apple && "sidebar-apple-pil")}
                  style={
                    apple
                      ? undefined
                      : {
                          background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                          boxShadow: "0 6px 18px rgba(220, 38, 38, 0.4)",
                        }
                  }
                  transition={apple ? { type: "spring", bounce: 0, duration: 0.35 } : { type: "spring", stiffness: 420, damping: 34 }}
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
                  aktif ? (apple ? "text-pri" : "text-white") : "text-teks-sekunder",
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

// ------------------------------------------------------------
// DOCK HP & TABLET (7 Okt 2026, desain baru): ikon aplikasi berwarna
// seperti Dock macOS, titik di bawah ikon aktif, label muncul sesaat saat
// diketuk, ikon memantul seperti aplikasi diluncurkan. Ukuran ikon
// menyesuaikan jumlah tab supaya tetap muat di layar 360 px.
// ------------------------------------------------------------
function DockHp({ tabs, tabAktif, onTab, belumBaca }: { tabs: KunciTab[]; tabAktif: KunciTab; onTab: (t: KunciTab) => void; belumBaca: number }) {
  const ukuran = tabs.length <= 5 ? 50 : tabs.length === 6 ? 45 : 41;
  return (
    <nav
      className="dock-hp pointer-events-none fixed bottom-0 left-1/2 z-50 -translate-x-1/2 lg:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))", ["--ik" as string]: `${ukuran}px` }}
      aria-label="Navigasi utama"
    >
      <div className="glass tanpa-scrollbar pointer-events-auto flex max-w-[calc(100vw-12px)] items-end gap-[clamp(6px,2.4vw,13px)] overflow-x-auto rounded-[26px] px-3 pt-2.5 pb-2">
        {tabs.map((kunci) => (
          <TombolDockHp
            key={kunci}
            kunci={kunci}
            aktif={kunci === tabAktif}
            lencana={kunci === "notifikasi" ? belumBaca : 0}
            onTab={onTab}
          />
        ))}
      </div>
    </nav>
  );
}

function TombolDockHp({ kunci, aktif, lencana, onTab }: { kunci: KunciTab; aktif: boolean; lencana: number; onTab: (t: KunciTab) => void }) {
  const { label, ikon: Ikon } = KONFIG_TAB[kunci];
  const [a, b] = WARNA_DOCK[kunci];
  const [lingkup, animasikan] = useAnimate<HTMLSpanElement>();
  const [labelTampil, setLabelTampil] = useState(false);
  const pewaktu = useRef<ReturnType<typeof setTimeout> | null>(null);

  function ketuk() {
    if (lingkup.current) {
      void animasikan(lingkup.current, { y: [0, -16, 0, -6, 0] }, { duration: 0.72, ease: "easeOut", times: [0, 0.22, 0.48, 0.68, 1] });
    }
    if (typeof navigator !== "undefined" && navigator.vibrate && matchMedia("(pointer: coarse)").matches) navigator.vibrate(8);
    setLabelTampil(true);
    if (pewaktu.current) clearTimeout(pewaktu.current);
    pewaktu.current = setTimeout(() => setLabelTampil(false), 1100);
    onTab(kunci);
  }

  return (
    <button
      type="button"
      onClick={ketuk}
      aria-label={label}
      aria-current={aktif ? "page" : undefined}
      data-tur={`nav-${kunci}`}
      className="group relative flex shrink-0 flex-col items-center [-webkit-tap-highlight-color:transparent]"
    >
      <motion.span
        aria-hidden="true"
        className="dock-hp-label pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 rounded-[9px] px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-teks-utama"
        initial={false}
        animate={{ opacity: labelTampil ? 1 : 0, y: labelTampil ? 0 : 6, scale: labelTampil ? 1 : 0.92, x: "-50%" }}
        transition={{ type: "spring", bounce: 0, duration: 0.32 }}
      >
        {label}
      </motion.span>
      <span ref={lingkup} className="block">
        <motion.span
          className="flex items-center justify-center rounded-[26%] text-white"
          style={{
            width: "var(--ik)",
            height: "var(--ik)",
            background: `linear-gradient(180deg, ${a}, ${b})`,
            boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.5), 0 1px 2px rgba(0,0,0,0.18), 0 5px 12px rgba(0,0,0,0.16)",
          }}
          animate={{ scale: aktif ? 1.06 : 1 }}
          whileTap={{ scale: 0.88, filter: "brightness(0.92)" }}
          transition={{ type: "spring", bounce: 0.25, duration: 0.38 }}
        >
          <Ikon className="h-[52%] w-[52%]" strokeWidth={2} />
        </motion.span>
      </span>
      {lencana > 0 && (
        <span className="absolute -top-1 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold text-white ring-2 ring-white/70 dark:ring-black/50">
          {lencana > 99 ? "99+" : lencana}
        </span>
      )}
      <motion.span
        aria-hidden="true"
        className="mt-[5px] h-1 w-1 rounded-full bg-teks-utama"
        initial={false}
        animate={{ opacity: aktif ? 0.75 : 0, scale: aktif ? 1 : 0 }}
        transition={{ type: "spring", bounce: 0.3, duration: 0.38 }}
      />
    </button>
  );
}
