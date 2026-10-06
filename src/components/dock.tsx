"use client";

// ============================================================
// Dock (6 Okt 2026) — navigasi ala Dock macOS untuk layar lebar, pilihan
// pengganti SideNav pada desain Apple (lib/desain-apple).
//
// Gerak:
// - MAGNIFIKASI: tiap ikon membaca jarak kursor ke pusatnya (motion value,
//   tanpa render ulang React) lalu ukurannya mengikuti lewat spring. Spring
//   selalu berangkat dari ukuran yang SEDANG tampil, jadi kursor yang
//   bolak-balik tidak pernah membuat ikon melompat (Designing Fluid
//   Interfaces: interruptible, mulai dari nilai presentasi).
// - Ikon tumbuh ke ATAS dari rak yang tingginya tetap — persis macOS.
// - Ketuk: pantulan sekali (umpan balik "membuka"), label melayang di atas
//   ikon saat ditunjuk.
// - prefers-reduced-motion: tanpa magnifikasi & tanpa pantulan.
// ============================================================

import { useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { PanelLeft } from "lucide-react";
import { KONFIG_TAB, TAB_PER_ROLE, type KunciTab } from "@/components/bottom-nav";
import type { KomponenIkon, Role } from "@/types";

/** Ukuran ikon diam & puncak magnifikasi (px), jangkauan pengaruh kursor. */
const UKURAN_DASAR = 50;
const UKURAN_PUNCAK = 82;
const JANGKAUAN = 150;
/** Spring magnifikasi: tanpa pantulan (rasio redaman > 1), responsif. */
const SPRING_UKURAN = { mass: 0.1, stiffness: 210, damping: 13 };

/** Warna ikon ala aplikasi macOS — tiap modul punya identitas sendiri. */
const WARNA: Record<KunciTab, [string, string]> = {
  beranda: ["#2E9BFF", "#0A63E0"],
  konten: ["#FFB340", "#FF7A00"],
  qc: ["#5EE6C9", "#0FA88F"],
  acara: ["#FF6482", "#E0234E"],
  tv: ["#FF6259", "#D7261D"],
  tvnas: ["#7D7AFF", "#4542D6"],
  tvrku: ["#FF4F6D", "#C8102E"],
  dashboard: ["#6BD3FF", "#1A8CFF"],
  asisten: ["#C77DFF", "#7B2CF0"],
  chat: ["#5BE07A", "#24A148"],
  notifikasi: ["#FF6961", "#E5322B"],
  profil: ["#A1A1A6", "#5B5B60"],
};

type DockProps = {
  role: Role;
  tabAktif: KunciTab;
  onTab: (tab: KunciTab) => void;
  belumBaca?: number;
  tabs?: KunciTab[];
  /** Kembali ke navigasi Sidebar. */
  onJadikanSidebar: () => void;
};

export function Dock({ role, tabAktif, onTab, belumBaca = 0, tabs: tabsProp, onJadikanSidebar }: DockProps) {
  const tabs = tabsProp ?? TAB_PER_ROLE[role];
  // Posisi X kursor (clientX); Infinity = kursor di luar Dock → semua ikon diam.
  const kursorX = useMotionValue(Infinity);
  const tenang = useReducedMotion() ?? false;

  return (
    <motion.nav
      aria-label="Navigasi utama (Dock)"
      initial={{ opacity: 0, y: 28, scale: 0.96, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 28, scale: 0.96, filter: "blur(8px)" }}
      transition={{ type: "spring", bounce: 0, duration: 0.45 }}
      // Penengahan lewat motion `x` (bukan kelas translate) supaya tidak
      // bertumpuk dengan transform animasi masuk.
      className="fixed bottom-3 left-1/2 z-50 hidden lg:block"
      style={{ x: "-50%" }}
    >
      <div
        onMouseMove={(e) => kursorX.set(e.clientX)}
        onMouseLeave={() => kursorX.set(Infinity)}
        className="dock-rak flex h-[68px] items-end gap-2.5 px-3 pb-[9px]"
      >
        {tabs.map((kunci) => (
          <IkonDock
            key={kunci}
            kursorX={kursorX}
            tenang={tenang}
            label={KONFIG_TAB[kunci].label}
            ikon={KONFIG_TAB[kunci].ikon}
            warna={WARNA[kunci]}
            aktif={kunci === tabAktif}
            lencana={kunci === "notifikasi" ? belumBaca : 0}
            dataTur={`nav-${kunci}`}
            onPilih={() => onTab(kunci)}
          />
        ))}
        {/* Pemisah seperti di macOS, lalu pengalih kembali ke Sidebar. */}
        <span aria-hidden="true" className="dock-pemisah mb-1 h-[44px] w-px self-end" />
        <IkonDock
          kursorX={kursorX}
          tenang={tenang}
          label="Kembali ke Sidebar"
          ikon={PanelLeft}
          warna={["#E9E9EE", "#C7C7CC"]}
          gelap
          aktif={false}
          lencana={0}
          onPilih={onJadikanSidebar}
        />
      </div>
    </motion.nav>
  );
}

function IkonDock({
  kursorX,
  tenang,
  label,
  ikon: Ikon,
  warna,
  gelap = false,
  aktif,
  lencana,
  dataTur,
  onPilih,
}: {
  kursorX: MotionValue<number>;
  tenang: boolean;
  label: string;
  ikon: KomponenIkon;
  warna: [string, string];
  /** Ikon gelap di atas ubin terang (ubin sistem). */
  gelap?: boolean;
  aktif: boolean;
  lencana: number;
  dataTur?: string;
  onPilih: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [tunjuk, setTunjuk] = useState(false);
  const y = useMotionValue(0);

  // Jarak kursor ke pusat ikon, dihitung dari posisi ikon SAAT INI.
  const jarak = useTransform(kursorX, (x) => {
    const b = ref.current?.getBoundingClientRect();
    if (!b || !Number.isFinite(x)) return JANGKAUAN * 2;
    return x - (b.left + b.width / 2);
  });
  const ukuranTarget = useTransform(
    jarak,
    [-JANGKAUAN, 0, JANGKAUAN],
    tenang ? [UKURAN_DASAR, UKURAN_DASAR, UKURAN_DASAR] : [UKURAN_DASAR, UKURAN_PUNCAK, UKURAN_DASAR],
  );
  const ukuran = useSpring(ukuranTarget, SPRING_UKURAN);
  const sudut = useTransform(ukuran, (u) => u * 0.225); // squircle ≈ 22,5%
  const ikonPx = useTransform(ukuran, (u) => u * 0.5);

  function pilih() {
    onPilih();
    if (!tenang) {
      // Pantulan "membuka" macOS: naik lalu jatuh pelan ke rak.
      void animate(y, [0, -18, 0], { duration: 0.55, times: [0, 0.38, 1], ease: ["easeOut", [0.33, 1.4, 0.6, 1]] });
    }
  }

  return (
    <div className="relative flex flex-col items-center">
      <AnimatePresence>
        {tunjuk && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: 6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ type: "spring", bounce: 0, duration: 0.25 }}
            className="dock-label pointer-events-none absolute bottom-full mb-3 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-medium"
            style={{ transformOrigin: "bottom center" }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      <motion.button
        ref={ref}
        type="button"
        onClick={pilih}
        onMouseEnter={() => setTunjuk(true)}
        onMouseLeave={() => setTunjuk(false)}
        onFocus={() => setTunjuk(true)}
        onBlur={() => setTunjuk(false)}
        aria-label={label}
        aria-current={aktif ? "page" : undefined}
        data-tur={dataTur}
        whileTap={tenang ? undefined : { scale: 0.92 }}
        className="dock-ikon relative flex items-center justify-center outline-none"
        style={{
          width: ukuran,
          height: ukuran,
          borderRadius: sudut,
          y,
          background: `linear-gradient(180deg, ${warna[0]}, ${warna[1]})`,
          color: gelap ? "#3A3A3C" : "#FFFFFF",
        }}
      >
        <motion.span className="flex items-center justify-center" style={{ width: ikonPx, height: ikonPx }}>
          <Ikon className="h-full w-full" strokeWidth={1.9} />
        </motion.span>
        {lencana > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10.5px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
            aria-label={`${lencana} belum dibaca`}
          >
            {lencana > 99 ? "99+" : lencana}
          </span>
        )}
      </motion.button>
      {/* Titik "sedang terbuka" di bawah ikon */}
      <span
        aria-hidden="true"
        className="dock-titik absolute -bottom-[7px] h-[4px] w-[4px] rounded-full transition-opacity duration-300"
        style={{ opacity: aktif ? 1 : 0 }}
      />
    </div>
  );
}
