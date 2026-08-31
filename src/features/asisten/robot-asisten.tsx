"use client";

// ============================================================
// RobotAsisten (fitur 1 Sep 2026) — maskot robot lucu Ketua Umum.
//
// Dua bagian:
//   1. RobotWajah   — SVG robot dengan mode animasi (mengambang,
//      kedip, senyum, bicara, diam saat menyambung). Dipakai kecil
//      (tombol melayang) dan besar (pengganti bola biru di layar
//      suara).
//   2. RobotMelayang — tombol melayang di pojok layar: robot
//      mengambang + berkedip; saat diklik ia TERSENYUM dulu baru
//      membuka mode suara asisten.
//
// Semua animasi framer-motion transform/opacity (ramah GPU), tanpa
// CSS global baru; id gradien memakai useId agar dua robot di satu
// halaman tidak saling bertukar warna.
// ============================================================

import { useId, useState } from "react";
import { motion } from "framer-motion";

export type ModeRobot = "dengar" | "diam" | "senyum" | "bicara";

export function RobotWajah({
  mode = "dengar",
  ukuran = 64,
}: {
  mode?: ModeRobot;
  ukuran?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const idBadan = `rb-${uid}`;
  const idKaca = `rk-${uid}`;
  const diam = mode === "diam";
  const senyum = mode === "senyum";
  const bicara = mode === "bicara";

  return (
    <motion.svg
      viewBox="0 0 120 120"
      width={ukuran}
      height={ukuran}
      role="img"
      aria-label="Robot asisten"
      // Mengambang pelan — BERHENTI saat "diam" (sedang menyambung).
      animate={diam ? { y: 0 } : { y: [0, -5, 0] }}
      transition={
        diam
          ? { duration: 0.2 }
          : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
      }
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={idBadan} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="55%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id={idKaca} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E1B4B" />
          <stop offset="100%" stopColor="#0F0D2A" />
        </linearGradient>
      </defs>

      {/* Antena + ujung menyala (berdenyut saat aktif) */}
      <rect x="57.5" y="10" width="5" height="14" rx="2.5" fill={`url(#${idBadan})`} />
      <motion.circle
        cx="60"
        cy="9"
        r="5"
        fill="#F59E0B"
        animate={diam ? { opacity: 0.35 } : { opacity: [0.5, 1, 0.5] }}
        transition={diam ? { duration: 0.2 } : { duration: 1.4, repeat: Infinity }}
      />

      {/* Telinga kiri-kanan */}
      <rect x="8" y="52" width="10" height="22" rx="5" fill={`url(#${idBadan})`} />
      <rect x="102" y="52" width="10" height="22" rx="5" fill={`url(#${idBadan})`} />

      {/* Kepala */}
      <rect
        x="18"
        y="24"
        width="84"
        height="78"
        rx="26"
        fill={`url(#${idBadan})`}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.5"
      />
      {/* Layar wajah */}
      <rect x="27" y="36" width="66" height="54" rx="18" fill={`url(#${idKaca})`} />

      {/* Mata — berkedip berkala; meredup saat "diam"; membentuk
          lengkung bahagia (^ ^) saat tersenyum. */}
      {senyum ? (
        <>
          <path
            d="M40 62 Q46 54 52 62"
            stroke="#7DF9FF"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M68 62 Q74 54 80 62"
            stroke="#7DF9FF"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        <>
          {[46, 74].map((x) => (
            <motion.ellipse
              key={x}
              cx={x}
              cy="59"
              rx="6.5"
              ry="8"
              fill={diam ? "#4C5A9C" : "#7DF9FF"}
              animate={diam ? { scaleY: 0.9 } : { scaleY: [1, 1, 0.12, 1] }}
              transition={
                diam
                  ? { duration: 0.2 }
                  : {
                      duration: 0.5,
                      times: [0, 0.7, 0.85, 1],
                      repeat: Infinity,
                      repeatDelay: 3.2,
                    }
              }
              style={{ originX: "50%", originY: "50%" }}
            />
          ))}
        </>
      )}

      {/* Mulut — garis kecil (dengar), senyum lebar (senyum/bicara),
          dan saat bicara tingginya bergerak seperti sedang mengobrol. */}
      {senyum ? (
        <path
          d="M46 72 Q60 84 74 72"
          stroke="#7DF9FF"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
      ) : bicara ? (
        <motion.rect
          x="48"
          y="70"
          width="24"
          height="9"
          rx="4.5"
          fill="#7DF9FF"
          animate={{ scaleY: [0.35, 1, 0.5, 0.9, 0.35] }}
          transition={{ duration: 0.55, repeat: Infinity, ease: "easeInOut" }}
          style={{ originX: "50%", originY: "50%" }}
        />
      ) : (
        <rect
          x="52"
          y="73"
          width="16"
          height="4.5"
          rx="2.25"
          fill={diam ? "#4C5A9C" : "#7DF9FF"}
        />
      )}

      {/* Pipi merona — muncul saat senyum */}
      {senyum && (
        <>
          <circle cx="36" cy="70" r="4.5" fill="#F472B6" opacity="0.7" />
          <circle cx="84" cy="70" r="4.5" fill="#F472B6" opacity="0.7" />
        </>
      )}
    </motion.svg>
  );
}

/**
 * Tombol robot melayang. Diklik → robot tersenyum sebentar → onBuka()
 * (membuka mode suara asisten). Ditampilkan hanya untuk Ketua Umum /
 * master (disaring pemanggil).
 */
export function RobotMelayang({ onBuka }: { onBuka: () => void }) {
  const [senyum, setSenyum] = useState(false);

  function klik() {
    if (senyum) return;
    setSenyum(true);
    // Beri waktu senyumnya terlihat dulu — baru buka mode suara.
    setTimeout(() => {
      setSenyum(false);
      onBuka();
    }, 550);
  }

  return (
    <motion.button
      type="button"
      onClick={klik}
      aria-label="Buka Asisten AI (mode suara)"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.92 }}
      className="fixed right-3 bottom-28 z-[45] flex h-[68px] w-[68px] items-center justify-center rounded-full"
      style={{
        background:
          "radial-gradient(circle at 30% 25%, rgba(196,181,253,0.45), rgba(79,70,229,0.25))",
        boxShadow:
          "0 8px 26px rgba(109, 40, 217, 0.35), inset 0 0 0 1.5px rgba(255,255,255,0.35)",
        backdropFilter: "blur(8px)",
      }}
    >
      <RobotWajah mode={senyum ? "senyum" : "dengar"} ukuran={54} />
    </motion.button>
  );
}
