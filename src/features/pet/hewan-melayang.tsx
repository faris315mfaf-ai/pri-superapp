"use client";

// ============================================================
// HewanMelayang (4 Sep 2026) — hewan peliharaan robot (kucing/anjing/kapibara)
// yang ikut menemani di beranda. Bisa diseret; KETUK → menu: "Jalan-jalan"
// (berkeliling layar ke beberapa titik acak sambil berjalan, menghadap arah
// tujuan), pilihan EMOT/ANIMASI (senang, lompat, guling, tidur, jalan), dan
// "Buka Pet Robot". Tampil hanya bila pengguna punya hewan aktif.
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  AnimatePresence,
} from "framer-motion";
import { getPet, type PetState } from "@/services";
import { skinHewanDariKode } from "@/lib/pet-katalog-v5";
import { LABEL_SUASANA_HEWAN, LABEL_TAHAP } from "@/lib/pet";
import { HewanSvg, type GerakHewan } from "./hewan-svg";

const KUNCI_POSISI = "pri-hewan-posisi";
const LEBAR = 96;
const TINGGI = 82;
const TEPI_KANAN = 12;
const TEPI_BAWAH = 210;
const MARGIN = 10;
const SEGAR_MS = 5 * 60_000;

type Posisi = { x: number; y: number };
type Batas = { left: number; right: number; top: number; bottom: number };

/** Hewan diposisikan dari kanan-bawah (robot utama di kiri-bawah, robot Ketum kanan-bawah). */
function batasLayar(): Batas {
  if (typeof window === "undefined")
    return { left: 0, right: 0, top: 0, bottom: 0 };
  return {
    left: -Math.max(0, window.innerWidth - LEBAR - TEPI_KANAN - MARGIN),
    right: 0,
    top: -Math.max(0, window.innerHeight - TEPI_BAWAH - TINGGI - MARGIN),
    bottom: Math.max(0, TEPI_BAWAH - 120),
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
    // abaikan
  }
  return { x: 0, y: 0 };
}
function simpanPosisi(p: Posisi) {
  try {
    localStorage.setItem(KUNCI_POSISI, JSON.stringify(p));
  } catch {
    // abaikan
  }
}

/** Emot/animasi yang bisa diminta pengguna. */
const EMOT: {
  kode: GerakHewan;
  emoji: string;
  label: string;
  durasiMs: number;
}[] = [
  { kode: "senang", emoji: "❤️", label: "Senang", durasiMs: 2400 },
  { kode: "lompat", emoji: "🎉", label: "Lompat", durasiMs: 1900 },
  { kode: "guling", emoji: "😹", label: "Guling", durasiMs: 1300 },
  { kode: "tidur", emoji: "💤", label: "Tidur", durasiMs: 5000 },
  { kode: "jalan", emoji: "🐾", label: "Jalan di tempat", durasiMs: 2600 },
];

export function HewanMelayang({
  onBuka,
  versi = 0,
}: {
  onBuka: () => void;
  versi?: number;
}) {
  const [st, setSt] = useState<PetState | null>(null);
  const [batas, setBatas] = useState<Batas>(batasLayar);
  const [awal] = useState<Posisi>(() => jepit(bacaPosisi(), batasLayar()));
  const [menu, setMenu] = useState(false);
  const [seret, setSeret] = useState(false);
  const [gerak, setGerak] = useState<{
    kode: GerakHewan;
    emoji: string;
    ke: number;
  } | null>(null);
  const [menghadap, setMenghadap] = useState<"kiri" | "kanan">("kiri");
  const [keliling, setKeliling] = useState(false);
  const x = useMotionValue(awal.x);
  const y = useMotionValue(awal.y);
  const timerGerak = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerSeret = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kelilingRef = useRef(false);
  const seretBaruRef = useRef(false);

  useEffect(() => {
    let hidup = true;
    const muat = () =>
      getPet()
        .then((d) => hidup && setSt(d))
        .catch(() => {});
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
      if (timerGerak.current) clearTimeout(timerGerak.current);
      if (timerSeret.current) clearTimeout(timerSeret.current);
      kelilingRef.current = false;
    };
  }, [x, y]);

  const hewan = st?.hewan.aktif ?? null;
  if (!st || !st.ada || !hewan) return null;

  function mainkan(e: (typeof EMOT)[number]) {
    kelilingRef.current = false;
    setKeliling(false);
    if (timerGerak.current) clearTimeout(timerGerak.current);
    setGerak((s) => ({ kode: e.kode, emoji: e.emoji, ke: (s?.ke ?? 0) + 1 }));
    setMenu(false);
    timerGerak.current = setTimeout(() => setGerak(null), e.durasiMs);
  }

  /** Berkeliling layar: 4–6 titik acak berurutan, menghadap arah tujuan, animasi jalan. */
  async function jalanJalan() {
    setMenu(false);
    if (kelilingRef.current) {
      kelilingRef.current = false;
      setKeliling(false);
      setGerak(null);
      return;
    }
    kelilingRef.current = true;
    setKeliling(true);
    const b = batasLayar();
    const jumlah = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < jumlah && kelilingRef.current; i++) {
      const tujuan = {
        x: b.left + Math.random() * (b.right - b.left),
        y: b.top + Math.random() * (b.bottom - b.top),
      };
      const dx = tujuan.x - x.get();
      const dy = tujuan.y - y.get();
      const jarak = Math.hypot(dx, dy);
      // Gambar menghadap kanan; ke kiri = dibalik.
      setMenghadap(dx < 0 ? "kiri" : "kanan");
      setGerak((s) => ({ kode: "jalan", emoji: "🐾", ke: (s?.ke ?? 0) + 1 }));
      const durasi = Math.max(0.8, Math.min(3.2, jarak / 150));
      await Promise.all([
        animate(x, tujuan.x, { duration: durasi, ease: "easeInOut" }).finished,
        animate(y, tujuan.y, { duration: durasi, ease: "easeInOut" }).finished,
      ]);
      if (!kelilingRef.current) break;
      // jeda mengendus
      setGerak((s) => ({ kode: "idle", emoji: "", ke: (s?.ke ?? 0) + 1 }));
      await new Promise((r) => setTimeout(r, 450 + Math.random() * 500));
    }
    if (kelilingRef.current) {
      simpanPosisi(jepit({ x: x.get(), y: y.get() }, b));
      setGerak((s) => ({ kode: "senang", emoji: "❤️", ke: (s?.ke ?? 0) + 1 }));
      timerGerak.current = setTimeout(() => setGerak(null), 2000);
    }
    kelilingRef.current = false;
    setKeliling(false);
  }

  return (
    <motion.div
      drag={!keliling}
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
      whileDrag={{ scale: 1.08 }}
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="fixed right-3 z-[43] flex cursor-grab flex-col items-center active:cursor-grabbing"
      style={{
        x,
        y,
        bottom: TEPI_BAWAH,
        width: LEBAR,
        height: TINGGI,
        touchAction: "none",
      }}
    >
      <AnimatePresence>
        {menu ? (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong absolute -top-2 right-0 z-20 w-[210px] -translate-y-full rounded-2xl p-2 shadow-lg"
            style={{ transformOrigin: "bottom right" }}
          >
            <p className="px-1 text-[11px] font-extrabold text-teks-utama">
              {hewan.nama}{" "}
              <span className="font-semibold text-teks-sekunder">
                · {LABEL_TAHAP[hewan.tahap]}
              </span>
            </p>
            <p className="px-1 text-[10px] text-teks-sekunder">
              {LABEL_SUASANA_HEWAN[hewan.suasana]}
            </p>
            <button
              type="button"
              onClick={() => void jalanJalan()}
              className="btn-tekan mt-1.5 flex h-9 w-full items-center gap-2 rounded-xl px-3 text-[11.5px] font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #F59E0B, #DC2626)",
              }}
            >
              🐾 {keliling ? "Berhenti keliling" : "Jalan-jalan keliling layar"}
            </button>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {EMOT.map((e) => (
                <button
                  key={e.kode}
                  type="button"
                  onClick={() => mainkan(e)}
                  className="btn-tekan flex h-7 items-center gap-1 rounded-full bg-black/5 px-2 text-[10.5px] font-bold text-teks-utama dark:bg-white/10"
                >
                  <span aria-hidden="true">{e.emoji}</span> {e.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onBuka();
              }}
              className="btn-tekan mt-1.5 h-8 w-full rounded-xl bg-black/5 text-[11px] font-bold text-teks-utama dark:bg-white/10"
            >
              Rawat & beri makan →
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {gerak?.emoji ? (
          <motion.span
            key={`e-${gerak.ke}`}
            initial={{ opacity: 0, y: 4, scale: 0.6 }}
            animate={{ opacity: 1, y: -6, scale: 1.1 }}
            exit={{ opacity: 0, y: -14, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 text-[22px] leading-none drop-shadow"
            aria-hidden="true"
          >
            {gerak.emoji}
          </motion.span>
        ) : hewan.suasana === "lapar" && !seret ? (
          <span
            key="lapar"
            className="glass-strong pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-teks-utama shadow"
          >
            🍖 lapar…
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
        aria-label={`${hewan.nama}, ${LABEL_TAHAP[hewan.tahap].toLowerCase()} — ${LABEL_SUASANA_HEWAN[hewan.suasana]}. Ketuk untuk menu.`}
        aria-expanded={menu}
        className="bg-transparent"
      >
        <HewanSvg
          key={gerak?.ke ?? 0}
          jenis={hewan.jenis}
          tahap={hewan.tahap}
          suasana={hewan.suasana}
          gerak={gerak?.kode ?? (seret ? "senang" : undefined)}
          palet={hewan.skin ? skinHewanDariKode(hewan.skin)?.palet : undefined}
          menghadap={menghadap}
          ukuran={LEBAR}
          animasi
        />
      </motion.button>
    </motion.div>
  );
}
