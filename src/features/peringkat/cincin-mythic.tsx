"use client";

// ============================================================
// Cincin "Mythical" (1 Sep 2026) — badge bercahaya ala peringkat
// Mobile Legends untuk 3 besar leaderboard TV Rakyat:
//   #1 Mythical Immortal (api emas-merah)
//   #2 Mythical Glory    (emas)
//   #3 Mythical Honor    (ungu)
// Cincin gradien BERPUTAR + cahaya berdenyut mengelilingi avatar,
// mengikuti pemiliknya di beranda, modul profil, dan leaderboard.
//
// useTop3Tvr: tiga besar dibaca lewat cache modul bersama (satu
// tembakan untuk semua komponen di layar, disegarkan tiap 60 dtk) —
// itulah "realtime" yang hemat: /api/peringkat-tvr?ringkas=1.
// ============================================================

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { getTop3Tvr, type JuaraTvr } from "@/services";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";

export const TIER_MYTHIC: Record<
  number,
  { nama: string; gradasi: string; cahaya: string; mahkota: string }
> = {
  1: {
    nama: "Mythical Immortal",
    gradasi:
      "conic-gradient(from 0deg, #FDE68A, #F97316, #EF4444, #FACC15, #F97316, #FDE68A)",
    cahaya: "rgba(249, 115, 22, 0.55)",
    mahkota: "#F59E0B",
  },
  2: {
    nama: "Mythical Glory",
    gradasi:
      "conic-gradient(from 0deg, #FEF3C7, #F59E0B, #B45309, #FDE68A, #F59E0B, #FEF3C7)",
    cahaya: "rgba(245, 158, 11, 0.5)",
    mahkota: "#D97706",
  },
  3: {
    nama: "Mythical Honor",
    gradasi:
      "conic-gradient(from 0deg, #EDE9FE, #8B5CF6, #6D28D9, #C4B5FD, #8B5CF6, #EDE9FE)",
    cahaya: "rgba(139, 92, 246, 0.5)",
    mahkota: "#7C3AED",
  },
};

/**
 * Cincin bercahaya mengelilingi avatar. `ukuran` = diameter AVATAR-nya
 * (kotak layout tetap seukuran avatar — cincin & cahaya melebar KELUAR
 * secara dekoratif, jadi header/daftar tidak bergeser). Avatar
 * (FotoBulat/AvatarInisial) berbentuk lingkaran pekat menutup tengah
 * piringan gradien, sehingga yang terlihat tinggal tepinya = cincin.
 */
export function CincinMythic({
  tier,
  ukuran,
  children,
  denganMahkota = true,
}: {
  tier: number;
  ukuran: number;
  children: ReactNode;
  denganMahkota?: boolean;
}) {
  const t = TIER_MYTHIC[tier];
  if (!t) return <>{children}</>;
  const tebal = Math.max(3, Math.round(ukuran * 0.06));
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: ukuran, height: ukuran }}
    >
      {/* Cahaya lembut berdenyut (mewah, bukan norak) */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full blur-md"
        style={{ inset: -(tebal + 5), background: t.gradasi }}
        animate={{ opacity: [0.35, 0.75, 0.35], scale: [1, 1.07, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Piringan gradien BERPUTAR, lebih besar dari avatar → cincin */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: -tebal,
          background: t.gradasi,
          boxShadow: `0 0 ${Math.max(10, ukuran * 0.3)}px ${t.cahaya}`,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      />
      {/* Avatar asli di atas piringan */}
      <span className="relative z-10 inline-flex items-center justify-center">
        {children}
      </span>
      {/* Mahkota kecil bergoyang di puncak cincin */}
      {denganMahkota && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
          style={{ top: -(tebal + Math.max(8, ukuran * 0.18)) }}
          animate={{ y: [0, -2, 0], rotate: [-6, 6, -6] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Crown
            style={{
              width: Math.max(12, ukuran * 0.24),
              height: Math.max(12, ukuran * 0.24),
              color: t.mahkota,
              filter: `drop-shadow(0 0 6px ${t.cahaya})`,
            }}
            fill={t.mahkota}
          />
        </motion.span>
      )}
    </span>
  );
}

/** Chip label badge, mis. "Mythical Immortal". */
export function LabelMythic({ tier, kecil = false }: { tier: number; kecil?: boolean }) {
  const t = TIER_MYTHIC[tier];
  if (!t) return null;
  return (
    <span
      className={
        kecil
          ? "rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-wide text-white uppercase"
          : "rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-white uppercase"
      }
      style={{
        background:
          tier === 3
            ? "linear-gradient(135deg, #8B5CF6, #6D28D9)"
            : tier === 2
              ? "linear-gradient(135deg, #F59E0B, #B45309)"
              : "linear-gradient(135deg, #F97316, #DC2626)",
        boxShadow: `0 4px 14px ${t.cahaya}`,
      }}
    >
      {t.nama}
    </span>
  );
}

// ------------------------------------------------------------
// Tiga besar bersama (cache modul + penyegaran 60 dtk)
// ------------------------------------------------------------
let cacheTop3: { data: JuaraTvr[]; pada: number } | null = null;
let sedangAmbil: Promise<JuaraTvr[]> | null = null;
const TTL_MS = 60_000;
const pendengar = new Set<(d: JuaraTvr[]) => void>();

async function ambilTop3Bersama(paksa = false): Promise<JuaraTvr[]> {
  if (!paksa && cacheTop3 && Date.now() - cacheTop3.pada < TTL_MS) return cacheTop3.data;
  if (!sedangAmbil) {
    sedangAmbil = getTop3Tvr()
      .then((d) => {
        cacheTop3 = { data: d, pada: Date.now() };
        for (const fn of pendengar) fn(d);
        return d;
      })
      .finally(() => {
        sedangAmbil = null;
      });
  }
  return sedangAmbil;
}

/** Tiga besar nasional — dipakai cincin avatar & layar mana pun. */
export function useTop3Tvr(): JuaraTvr[] {
  const [data, setData] = useState<JuaraTvr[]>(cacheTop3?.data ?? []);
  useEffect(() => {
    pendengar.add(setData);
    void ambilTop3Bersama().then((d) => setData(d)).catch(() => {});
    return () => {
      pendengar.delete(setData);
    };
  }, []);
  // "Realtime": disegarkan tiap 60 dtk + saat aplikasi dibuka kembali.
  useSegarOtomatis(() => {
    void ambilTop3Bersama(true).catch(() => {});
  }, 60);
  return data;
}

/**
 * Bungkus avatar SIAPA PUN: bila pemiliknya masuk 3 besar, cincin
 * Mythical menyala; selain itu avatar tampil biasa (tanpa beban).
 */
export function CincinJuara({
  userId,
  ukuran,
  children,
  denganMahkota = true,
}: {
  userId: string | number;
  ukuran: number;
  children: ReactNode;
  denganMahkota?: boolean;
}) {
  const top3 = useTop3Tvr();
  const tier = top3.find((j) => String(j.user_id) === String(userId))?.peringkat;
  if (!tier) return <>{children}</>;
  return (
    <CincinMythic tier={tier} ukuran={ukuran} denganMahkota={denganMahkota}>
      {children}
    </CincinMythic>
  );
}
