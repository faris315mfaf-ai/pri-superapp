"use client";

// ============================================================
// PetMelayang (3 Sep 2026) — robot peliharaan yang melayang di beranda,
// bisa diseret ke mana saja (posisi diingat per perangkat), bergoyang
// pelan, berkedip, dan memberi tanda bila butuh dirawat. Ketuk → buka
// modul Pet Robot. Hanya tampil bila pengguna sudah mengadopsi robot
// (pemanggil menyaring peran master).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue } from "framer-motion";
import { getPet, type PetState } from "@/services";
import { LABEL_SUASANA } from "@/lib/pet";
import { RobotSvg } from "./robot-svg";

const KUNCI_POSISI = "pri-pet-posisi";
const LEBAR = 104;
const TINGGI = 128;
/** Posisi bawaan: kiri bawah (robot Ketum ada di kanan bawah). */
const TEPI_KIRI = 10;
const TEPI_BAWAH = 112;
const MARGIN = 10;
const SEGAR_MS = 5 * 60_000;

type Posisi = { x: number; y: number };
type Batas = { left: number; right: number; top: number; bottom: number };

function batasLayar(): Batas {
  if (typeof window === "undefined") return { left: 0, right: 0, top: 0, bottom: 0 };
  return {
    left: 0,
    right: Math.max(0, window.innerWidth - LEBAR - TEPI_KIRI - MARGIN),
    top: -Math.max(0, window.innerHeight - TEPI_BAWAH - TINGGI - MARGIN),
    bottom: Math.max(0, TEPI_BAWAH - MARGIN),
  };
}

function jepit(p: Posisi, b: Batas): Posisi {
  return { x: Math.min(b.right, Math.max(b.left, p.x)), y: Math.min(b.bottom, Math.max(b.top, p.y)) };
}

function bacaPosisi(): Posisi {
  try {
    const j = JSON.parse(localStorage.getItem(KUNCI_POSISI) ?? "null") as Posisi | null;
    if (j && Number.isFinite(j.x) && Number.isFinite(j.y)) return { x: j.x, y: j.y };
  } catch {
    // penyimpanan tak tersedia — mulai dari posisi bawaan
  }
  return { x: 0, y: 0 };
}

function simpanPosisi(p: Posisi) {
  try {
    localStorage.setItem(KUNCI_POSISI, JSON.stringify(p));
  } catch {
    // posisi hanya kenyamanan
  }
}

const PERLU_RAWAT = new Set(["lapar", "lelah", "sedih", "kotor"]);
const EMOJI_SUASANA: Record<string, string> = { lapar: "🍔", lelah: "😴", sedih: "🎮", kotor: "🧼" };

export function PetMelayang({ onBuka, versi = 0 }: { onBuka: () => void; versi?: number }) {
  const [st, setSt] = useState<PetState | null>(null);
  const [batas, setBatas] = useState<Batas>(batasLayar);
  const [awal] = useState<Posisi>(() => jepit(bacaPosisi(), batasLayar()));
  const [seret, setSeret] = useState(false);
  const x = useMotionValue(awal.x);
  const y = useMotionValue(awal.y);
  const timerSeret = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Muat state robot; segarkan berkala + saat `versi` berubah (setelah dirawat).
  useEffect(() => {
    let hidup = true;
    const muat = () =>
      getPet()
        .then((d) => hidup && setSt(d))
        .catch(() => {
          // gagal = robot tidak tampil dulu
        });
    void muat();
    const t = setInterval(() => void muat(), SEGAR_MS);
    return () => {
      hidup = false;
      clearInterval(t);
    };
  }, [versi]);

  useEffect(() => {
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
      if (timerSeret.current) clearTimeout(timerSeret.current);
    };
  }, [x, y]);

  if (!st || !st.ada || !st.jenis) return null;

  const perlu = PERLU_RAWAT.has(st.suasana);

  return (
    <motion.button
      type="button"
      onTap={onBuka}
      drag
      dragMomentum={false}
      dragElastic={0.12}
      dragConstraints={batas}
      onDragStart={() => {
        if (timerSeret.current) clearTimeout(timerSeret.current);
        setSeret(true);
      }}
      onDragEnd={() => {
        simpanPosisi(jepit({ x: x.get(), y: y.get() }, batas));
        timerSeret.current = setTimeout(() => setSeret(false), 500);
      }}
      whileDrag={{ scale: 1.08, rotate: -4 }}
      whileTap={{ scale: 0.94 }}
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      aria-label={`${st.nama} — ${LABEL_SUASANA[st.suasana]}. Ketuk untuk merawat, seret untuk memindahkan.`}
      title={`${st.nama}: ${LABEL_SUASANA[st.suasana]}`}
      className="fixed bottom-28 left-2.5 z-[44] flex cursor-grab flex-col items-center active:cursor-grabbing"
      style={{ x, y, width: LEBAR, height: TINGGI, touchAction: "none" }}
    >
      {/* Gelembung status (hanya bila butuh perhatian / sedang diseret) */}
      {perlu || seret ? (
        <span className="glass-strong pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-teks-utama shadow">
          {seret ? "wheee~" : `${EMOJI_SUASANA[st.suasana] ?? ""} ${LABEL_SUASANA[st.suasana]}`}
        </span>
      ) : null}
      <RobotSvg
        jenis={st.jenis}
        suasana={seret ? "senang" : st.suasana}
        vitalitas={seret ? "semangat" : st.vitalitas}
        terpasang={st.terpasang}
        sparepart={st.sparepart_terpasang}
        skin={st.skin_terpasang}
        warna={st.warna_custom}
        ukuran={88}
        animasi={!seret}
      />
      {perlu ? <span className="absolute top-6 right-3 h-3.5 w-3.5 rounded-full bg-pri ring-2 ring-white" aria-hidden="true" /> : null}
    </motion.button>
  );
}
