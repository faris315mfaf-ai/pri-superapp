"use client";

// ============================================================
// PetSapaan (3 Sep 2026) — robot peliharaan seseorang tampil saat profilnya
// dilihat orang lain di chat: muncul melompat, melambaikan lengan kanan, dan
// menyapa lewat gelembung bicara. Data dari /api/pet?user_id=<pemilik>
// (tanpa saldo/inventori). Tidak tampil bila pemilik belum punya robot.
// ============================================================

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getPetPublik, type PetState } from "@/services";
import { LABEL_SUASANA, LABEL_VITALITAS } from "@/lib/pet";
import { RobotSvg } from "./robot-svg";

export function PetSapaan({ userId, namaPemilik }: { userId: string; namaPemilik?: string }) {
  const [st, setSt] = useState<PetState | null>(null);

  useEffect(() => {
    let hidup = true;
    getPetPublik(userId)
      .then((d) => hidup && setSt(d))
      .catch(() => {
        // tidak ada robot / gagal = tidak tampil
      });
    return () => {
      hidup = false;
    };
  }, [userId]);

  if (!st || !st.ada || !st.jenis) return null;
  const pemilik = (namaPemilik || st.pemilik || "").split(" ")[0] || "dia";
  const latar =
    st.jenis === "pria"
      ? "linear-gradient(160deg, rgba(59,130,246,0.18), rgba(17,24,39,0.22))"
      : "linear-gradient(160deg, rgba(236,72,153,0.18), rgba(255,255,255,0.35))";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.2 }}
      className="mt-6 flex items-center gap-3 rounded-2xl p-3"
      style={{ background: latar }}
      aria-label={`Robot peliharaan ${pemilik}: ${st.nama}`}
    >
      <RobotSvg jenis={st.jenis} suasana={st.suasana} vitalitas={st.vitalitas} terpasang={st.terpasang} sparepart={st.sparepart_terpasang} skin={st.skin_terpasang} warna={st.warna_custom} ukuran={92} menyapa />
      <div className="min-w-0 flex-1">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.3 }}
          className="glass-strong relative rounded-2xl px-3 py-2"
        >
          <span className="glass-strong absolute top-4 -left-1.5 h-3 w-3 rotate-45" aria-hidden="true" />
          <p className="text-[12.5px] font-bold text-teks-utama">
            Halo! Aku {st.nama}, robotnya {pemilik} 👋
          </p>
          <p className="mt-0.5 text-[11px] text-teks-sekunder">
            Level {st.level} · {LABEL_SUASANA[st.suasana]} · sedang {LABEL_VITALITAS[st.vitalitas]}.
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
