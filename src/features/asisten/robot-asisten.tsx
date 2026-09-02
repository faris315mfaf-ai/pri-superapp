"use client";

// ============================================================
// RobotAsisten (fitur 1 Sep 2026) — maskot robot lucu Ketua Umum.
//
// Dua bagian:
//   1. RobotWajah   — SVG robot dengan mode animasi (mengambang,
//      kedip, senyum, bicara, diam saat menyambung, KAGET saat
//      diseret). Dipakai kecil (tombol melayang) dan besar
//      (pengganti bola biru di layar suara).
//   2. RobotMelayang — tombol melayang: BISA DISERET ke mana saja
//      (2 Sep 2026); posisinya diingat per perangkat. Saat diseret ia
//      kaget (mata membelalak, mulut "o", gemetar, keringat) lalu
//      tenang lagi. Ketuk (tanpa seret) → tersenyum → buka mode suara.
//
// Semua animasi framer-motion transform/opacity (ramah GPU), tanpa
// CSS global baru; id gradien memakai useId agar dua robot di satu
// halaman tidak saling bertukar warna.
// ============================================================

import { useEffect, useId, useRef, useState } from "react";
import { motion, useMotionValue } from "framer-motion";

export type ModeRobot = "dengar" | "diam" | "senyum" | "bicara" | "kaget";

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
  const kaget = mode === "kaget";

  return (
    <motion.svg
      viewBox="0 0 120 120"
      width={ukuran}
      height={ukuran}
      role="img"
      aria-label="Robot asisten"
      // Mengambang pelan — BERHENTI saat "diam" (sedang menyambung);
      // GEMETAR saat kaget (diseret).
      animate={
        diam
          ? { y: 0, x: 0, rotate: 0 }
          : kaget
            ? { y: 0, x: [0, -4, 4, -3, 3, 0], rotate: [0, -7, 7, -5, 5, 0] }
            : { y: [0, -5, 0], x: 0, rotate: 0 }
      }
      transition={
        diam
          ? { duration: 0.2 }
          : kaget
            ? { duration: 0.42, repeat: Infinity, ease: "easeInOut" }
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

      {/* Antena + ujung menyala (berdenyut saat aktif, merah saat kaget) */}
      <rect x="57.5" y="10" width="5" height="14" rx="2.5" fill={`url(#${idBadan})`} />
      <motion.circle
        cx="60"
        cy="9"
        r="5"
        fill={kaget ? "#F43F5E" : "#F59E0B"}
        animate={diam ? { opacity: 0.35 } : kaget ? { opacity: [1, 0.4, 1] } : { opacity: [0.5, 1, 0.5] }}
        transition={
          diam ? { duration: 0.2 } : kaget ? { duration: 0.3, repeat: Infinity } : { duration: 1.4, repeat: Infinity }
        }
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
          lengkung bahagia (^ ^) saat tersenyum; MEMBELALAK saat kaget. */}
      {kaget ? (
        <>
          {[46, 74].map((x) => (
            <g key={x}>
              <circle cx={x} cy="59" r="9.5" fill="#7DF9FF" />
              <circle cx={x} cy="59" r="4.5" fill="#0F0D2A" />
              <circle cx={x + 2} cy="56" r="1.6" fill="#FFFFFF" />
            </g>
          ))}
        </>
      ) : senyum ? (
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
          "o" bulat saat kaget, dan saat bicara tingginya bergerak. */}
      {kaget ? (
        <ellipse cx="60" cy="77" rx="5.5" ry="6.5" fill="#7DF9FF" />
      ) : senyum ? (
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

      {/* Tetes keringat kaget — jatuh berulang di pelipis kanan */}
      {kaget && (
        <motion.path
          d="M96 40 q5 7 0 12 q-5 -5 0 -12"
          fill="#7DF9FF"
          animate={{ y: [0, 8], opacity: [1, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: "easeIn" }}
        />
      )}
    </motion.svg>
  );
}

// ------------------------------------------------------------
// Tombol robot melayang — bisa diseret, posisi diingat.
// ------------------------------------------------------------

const KUNCI_POSISI = "pri-robot-posisi";
/** Diameter tombol (px) — sama dengan h-[68px]/w-[68px] di className. */
const UKURAN = 68;
/** Jarak tepi bawaan: right-3 (12px) & bottom-28 (112px). */
const TEPI_KANAN = 12;
const TEPI_BAWAH = 112;
const MARGIN = 12;

type Posisi = { x: number; y: number };
type Batas = { left: number; right: number; top: number; bottom: number };

/** Sejauh mana robot boleh digeser dari posisi bawaannya (pojok kanan bawah). */
function batasLayar(): Batas {
  if (typeof window === "undefined") return { left: 0, right: 0, top: 0, bottom: 0 };
  return {
    left: -Math.max(0, window.innerWidth - UKURAN - TEPI_KANAN - MARGIN),
    right: 0,
    top: -Math.max(0, window.innerHeight - TEPI_BAWAH - UKURAN - MARGIN),
    bottom: Math.max(0, TEPI_BAWAH - MARGIN),
  };
}

function jepit(p: Posisi, b: Batas): Posisi {
  return {
    x: Math.min(b.right, Math.max(b.left, p.x)),
    y: Math.min(b.bottom, Math.max(b.top, p.y)),
  };
}

function bacaPosisi(): Posisi {
  try {
    const j = JSON.parse(localStorage.getItem(KUNCI_POSISI) ?? "null") as Posisi | null;
    if (j && Number.isFinite(j.x) && Number.isFinite(j.y)) return { x: j.x, y: j.y };
  } catch {
    // localStorage terblokir / rusak — mulai dari pojok bawaan.
  }
  return { x: 0, y: 0 };
}

function simpanPosisi(p: Posisi) {
  try {
    localStorage.setItem(KUNCI_POSISI, JSON.stringify(p));
  } catch {
    // Tidak apa-apa — posisi hanya kenyamanan.
  }
}

/**
 * Tombol robot melayang. Ketuk → robot tersenyum sebentar → onBuka()
 * (membuka mode suara asisten). Seret → robot kaget → posisi baru
 * diingat. Ditampilkan hanya untuk Ketua Umum / master (disaring
 * pemanggil).
 */
export function RobotMelayang({ onBuka }: { onBuka: () => void }) {
  const [senyum, setSenyum] = useState(false);
  const [kaget, setKaget] = useState(false);
  const [batas, setBatas] = useState<Batas>(batasLayar);
  // Posisi awal dari sesi lalu, dijepit ke ukuran layar sekarang.
  const [awal] = useState<Posisi>(() => jepit(bacaPosisi(), batasLayar()));
  const x = useMotionValue(awal.x);
  const y = useMotionValue(awal.y);
  const timerKaget = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerSenyum = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Layar diputar / jendela diubah → batas seret ikut berubah dan
    // posisi tersimpan dijepit lagi supaya robot tidak "hilang" di luar layar.
    function saatUkur() {
      const b = batasLayar();
      setBatas(b);
      const p = jepit({ x: x.get(), y: y.get() }, b);
      x.set(p.x);
      y.set(p.y);
    }
    window.addEventListener("resize", saatUkur);
    return () => {
      window.removeEventListener("resize", saatUkur);
      if (timerKaget.current) clearTimeout(timerKaget.current);
      if (timerSenyum.current) clearTimeout(timerSenyum.current);
    };
  }, [x, y]);

  function ketuk() {
    if (senyum) return;
    setSenyum(true);
    // Beri waktu senyumnya terlihat dulu — baru buka mode suara.
    timerSenyum.current = setTimeout(() => {
      setSenyum(false);
      onBuka();
    }, 550);
  }

  function mulaiSeret() {
    if (timerKaget.current) clearTimeout(timerKaget.current);
    setKaget(true);
  }

  function selesaiSeret() {
    simpanPosisi(jepit({ x: x.get(), y: y.get() }, batas));
    // Tenang lagi sesaat setelah dilepas.
    timerKaget.current = setTimeout(() => setKaget(false), 700);
  }

  return (
    <motion.button
      type="button"
      // onTap (bukan onClick): framer-motion tidak memicu tap bila jari
      // sempat menyeret — jadi seret tidak ikut membuka mode suara.
      onTap={ketuk}
      drag
      dragMomentum={false}
      dragElastic={0.15}
      dragConstraints={batas}
      onDragStart={mulaiSeret}
      onDragEnd={selesaiSeret}
      whileDrag={{ scale: 1.08 }}
      aria-label="Buka Asisten AI (mode suara) — bisa diseret ke posisi lain"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.92 }}
      className="fixed right-3 bottom-28 z-[45] flex h-[68px] w-[68px] cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
      style={{
        x,
        y,
        touchAction: "none",
        background:
          "radial-gradient(circle at 30% 25%, rgba(196,181,253,0.45), rgba(79,70,229,0.25))",
        boxShadow:
          "0 8px 26px rgba(109, 40, 217, 0.35), inset 0 0 0 1.5px rgba(255,255,255,0.35)",
        backdropFilter: "blur(8px)",
      }}
    >
      <RobotWajah mode={senyum ? "senyum" : kaget ? "kaget" : "dengar"} ukuran={54} />
    </motion.button>
  );
}
