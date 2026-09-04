"use client";

// ============================================================
// PetMelayang (3 Sep 2026; v4 4 Sep 2026) — robot peliharaan yang melayang di
// beranda, bisa diseret ke mana saja (posisi diingat per perangkat), bergoyang
// pelan, berkedip, dan memberi tanda bila butuh dirawat.
// v4: KETUK → menu kecil: "Buka Pet Robot" + GERAKAN/EMOT yang sudah dibeli
// (joget, dab, salto, …). Gerakan dimainkan lewat kelas animasi CSS pada
// pembungkus robot + gelembung emoji, lalu berhenti sendiri.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, AnimatePresence } from "framer-motion";
import { getPet, type PetState } from "@/services";
import { gerakanDariKode, LABEL_SUASANA, type Gerakan } from "@/lib/pet";
import { RobotSvg } from "./robot-svg";
import { cn } from "@/lib/utils";

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
  if (typeof window === "undefined")
    return { left: 0, right: 0, top: 0, bottom: 0 };
  return {
    left: 0,
    right: Math.max(0, window.innerWidth - LEBAR - TEPI_KIRI - MARGIN),
    top: -Math.max(0, window.innerHeight - TEPI_BAWAH - TINGGI - MARGIN),
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
    const j = JSON.parse(
      localStorage.getItem(KUNCI_POSISI) ?? "null",
    ) as Posisi | null;
    if (j && Number.isFinite(j.x) && Number.isFinite(j.y))
      return { x: j.x, y: j.y };
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
const EMOJI_SUASANA: Record<string, string> = {
  lapar: "🍔",
  lelah: "😴",
  sedih: "🎮",
  kotor: "🧼",
};

export function PetMelayang({
  onBuka,
  versi = 0,
}: {
  onBuka: () => void;
  versi?: number;
}) {
  const [st, setSt] = useState<PetState | null>(null);
  const [batas, setBatas] = useState<Batas>(batasLayar);
  const [awal] = useState<Posisi>(() => jepit(bacaPosisi(), batasLayar()));
  const [seret, setSeret] = useState(false);
  const [menu, setMenu] = useState(false);
  // Gerakan yang sedang dimainkan (kelas CSS + emoji), berhenti sendiri.
  const [gerak, setGerak] = useState<{
    kelas: string;
    emoji: string;
    nama: string;
    ke: number;
  } | null>(null);
  const x = useMotionValue(awal.x);
  const y = useMotionValue(awal.y);
  const timerSeret = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerGerak = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seretBaruRef = useRef(false);

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
      if (timerGerak.current) clearTimeout(timerGerak.current);
    };
  }, [x, y]);

  if (!st || !st.ada || !st.jenis) return null;

  const perlu = PERLU_RAWAT.has(st.suasana);
  const gerakanMilik: Gerakan[] = st.gerakan_dimiliki
    .map((k) => gerakanDariKode(k))
    .filter((g): g is Gerakan => Boolean(g));

  function mainkan(g: Gerakan) {
    if (timerGerak.current) clearTimeout(timerGerak.current);
    // key `ke` naik supaya animasi yang sama bisa diulang berturut-turut.
    setGerak((s) => ({
      kelas: g.kelas,
      emoji: g.emoji,
      nama: g.nama,
      ke: (s?.ke ?? 0) + 1,
    }));
    setMenu(false);
    timerGerak.current = setTimeout(() => setGerak(null), g.durasiMs + 150);
  }

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.12}
      dragConstraints={batas}
      onDragStart={() => {
        if (timerSeret.current) clearTimeout(timerSeret.current);
        seretBaruRef.current = true;
        setSeret(true);
        setMenu(false);
      }}
      onDragEnd={() => {
        simpanPosisi(jepit({ x: x.get(), y: y.get() }, batas));
        timerSeret.current = setTimeout(() => {
          setSeret(false);
          seretBaruRef.current = false;
        }, 400);
      }}
      whileDrag={{ scale: 1.08, rotate: -4 }}
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="fixed bottom-28 left-2.5 z-[44] flex cursor-grab flex-col items-center active:cursor-grabbing"
      style={{ x, y, width: LEBAR, height: TINGGI, touchAction: "none" }}
    >
      {/* Menu ketuk: buka modul + gerakan yang dimiliki */}
      <AnimatePresence>
        {menu ? (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong absolute -top-2 left-0 z-20 w-[196px] -translate-y-full rounded-2xl p-2 shadow-lg"
            style={{ transformOrigin: "bottom left" }}
          >
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onBuka();
              }}
              className="btn-tekan flex h-9 w-full items-center gap-2 rounded-xl bg-pri px-3 text-[11.5px] font-bold text-white"
            >
              🤖 Buka Pet Robot
            </button>
            {gerakanMilik.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {gerakanMilik.map((g) => (
                  <button
                    key={g.kode}
                    type="button"
                    onClick={() => mainkan(g)}
                    title={g.keterangan}
                    className="btn-tekan flex h-7 items-center gap-1 rounded-full bg-black/5 px-2 text-[10.5px] font-bold text-teks-utama dark:bg-white/10"
                  >
                    <span aria-hidden="true">{g.emoji}</span> {g.nama}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 px-1 text-[10px] leading-snug text-teks-sekunder">
                Beli gerakan di Toko → Gerakan supaya robotmu bisa joget, dab,
                salto…
              </p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Gelembung emoji gerakan / status */}
      <AnimatePresence>
        {gerak ? (
          <motion.span
            key={`g-${gerak.ke}`}
            initial={{ opacity: 0, y: 6, scale: 0.6 }}
            animate={{ opacity: 1, y: -8, scale: 1.15 }}
            exit={{ opacity: 0, y: -18, scale: 0.8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 text-[26px] leading-none drop-shadow"
            aria-hidden="true"
          >
            {gerak.emoji}
          </motion.span>
        ) : perlu || seret ? (
          <span
            key="status"
            className="glass-strong pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-teks-utama shadow"
          >
            {seret
              ? "wheee~"
              : `${EMOJI_SUASANA[st.suasana] ?? ""} ${LABEL_SUASANA[st.suasana]}`}
          </span>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        onTap={() => {
          if (seretBaruRef.current) return;
          setMenu((m) => !m);
        }}
        whileTap={{ scale: 0.94 }}
        aria-label={`${st.nama} — ${LABEL_SUASANA[st.suasana]}. Ketuk untuk menu, seret untuk memindahkan.`}
        aria-expanded={menu}
        title={`${st.nama}: ${LABEL_SUASANA[st.suasana]}`}
        className="flex flex-col items-center bg-transparent"
      >
        {/* Pembungkus gerakan: kelas animasi diganti tiap kali dimainkan (key) */}
        <div
          key={gerak?.ke ?? 0}
          className={cn(gerak?.kelas)}
          style={{ willChange: gerak ? "transform" : undefined }}
        >
          <RobotSvg
            jenis={st.jenis}
            suasana={seret || gerak ? "senang" : st.suasana}
            vitalitas={seret || gerak ? "semangat" : st.vitalitas}
            terpasang={st.terpasang}
            sparepart={st.sparepart_terpasang}
            skin={st.skin_terpasang}
            warna={st.warna_custom}
            ukuran={88}
            animasi={!seret}
            menyapa={gerak?.kelas === "pet-gerak-lambai"}
          />
        </div>
      </motion.button>
      {perlu && !gerak ? (
        <span
          className="absolute top-6 right-3 h-3.5 w-3.5 rounded-full bg-pri ring-2 ring-white"
          aria-hidden="true"
        />
      ) : null}
    </motion.div>
  );
}
