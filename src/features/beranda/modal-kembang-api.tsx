"use client";

// ============================================================
// ModalKembangApi (3 Sep 2026) — setelah periode direset (jam 19.00), pada
// pembukaan aplikasi pertama berikutnya tampil animasi meriah: kembang api
// (canvas, partikel ringan) + podium 3 komentator terbanyak postingan
// TV Rakyat Official pada periode yang baru selesai. Tampil SEKALI per
// periode per perangkat (localStorage `pri-juara-dilihat:<userId>`).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PartyPopper } from "lucide-react";
import { useAppStore } from "@/hooks/use-app-store";
import { AvatarInisial } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { getJuaraKomen, type HasilJuaraKomen } from "@/services";
import { tanggalIndonesia } from "@/lib/format";

const WARNA = [
  "#F59E0B",
  "#DC2626",
  "#10B981",
  "#3B82F6",
  "#EC4899",
  "#FFFFFF",
  "#FDE68A",
];
const DURASI_LEDAKAN_MS = 9000;

function kunciDilihat(userId: string): string {
  return `pri-juara-dilihat:${userId}`;
}

type Partikel = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hidup: number;
  warna: string;
  r: number;
};

/** Kembang api canvas: hanya partikel lingkaran + jejak pudar; berhenti sendiri. */
function jalankanKembangApi(kanvas: HTMLCanvasElement): () => void {
  const ctx = kanvas.getContext("2d");
  if (!ctx) return () => {};
  const kurangiGerak =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let lebar = 0;
  let tinggi = 0;
  const ukur = () => {
    lebar = kanvas.clientWidth;
    tinggi = kanvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    kanvas.width = Math.floor(lebar * dpr);
    kanvas.height = Math.floor(tinggi * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  ukur();
  window.addEventListener("resize", ukur);

  const partikel: Partikel[] = [];
  const mulai = performance.now();
  let terakhirLedak = 0;
  let rafId = 0;
  let berjalan = true;

  const ledak = () => {
    const x = lebar * (0.15 + Math.random() * 0.7);
    const y = tinggi * (0.12 + Math.random() * 0.35);
    const warna = WARNA[Math.floor(Math.random() * WARNA.length)];
    const n = kurangiGerak ? 18 : 70;
    for (let i = 0; i < n; i++) {
      const sudut = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const laju = 1.5 + Math.random() * 3.2;
      partikel.push({
        x,
        y,
        vx: Math.cos(sudut) * laju,
        vy: Math.sin(sudut) * laju,
        hidup: 1,
        warna,
        r: 1.5 + Math.random() * 1.8,
      });
    }
  };

  const gambar = (kini: number) => {
    if (!berjalan) return;
    // Jejak pudar: latar gelap tembus pandang, bukan clearRect.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, 0, lebar, tinggi);
    ctx.globalCompositeOperation = "lighter";
    if (
      kini - mulai < DURASI_LEDAKAN_MS &&
      kini - terakhirLedak > (kurangiGerak ? 1400 : 650)
    ) {
      ledak();
      terakhirLedak = kini;
    }
    for (let i = partikel.length - 1; i >= 0; i--) {
      const p = partikel[i];
      p.vy += 0.045;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.hidup -= 0.012;
      if (p.hidup <= 0) {
        partikel.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.hidup);
      ctx.fillStyle = p.warna;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Selesai: tak ada ledakan baru & partikel habis → berhenti menggambar.
    if (kini - mulai >= DURASI_LEDAKAN_MS && partikel.length === 0) {
      berjalan = false;
      return;
    }
    rafId = requestAnimationFrame(gambar);
  };
  rafId = requestAnimationFrame(gambar);
  return () => {
    berjalan = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", ukur);
  };
}

export function ModalKembangApi() {
  const user = useAppStore((s) => s.user);
  const userId = user?.id ?? "";
  const [data, setData] = useState<HasilJuaraKomen | null>(null);
  const [tampil, setTampil] = useState(false);
  const kanvasRef = useRef<HTMLCanvasElement>(null);

  // Cek sekali setelah aplikasi aktif: periode baru & belum pernah dilihat?
  useEffect(() => {
    if (!userId) return;
    let hidup = true;
    const t = setTimeout(() => {
      getJuaraKomen()
        .then((d) => {
          if (!hidup || !d.periode || d.juara.length === 0) return;
          let terakhir: string | null = null;
          try {
            terakhir = window.localStorage.getItem(kunciDilihat(userId));
          } catch {
            terakhir = null;
          }
          if (terakhir === d.periode) return;
          setData(d);
          setTampil(true);
        })
        .catch(() => {
          // tidak ada data juara = tidak ada perayaan
        });
    }, 1200);
    return () => {
      hidup = false;
      clearTimeout(t);
    };
  }, [userId]);

  useEffect(() => {
    if (!tampil || !kanvasRef.current) return;
    return jalankanKembangApi(kanvasRef.current);
  }, [tampil]);

  function tutup() {
    if (userId && data?.periode) {
      try {
        window.localStorage.setItem(kunciDilihat(userId), data.periode);
      } catch {
        // penyimpanan peramban tidak tersedia — perayaan bisa tampil lagi, tidak apa-apa
      }
    }
    setTampil(false);
  }

  const urutanPodium = data
    ? [2, 1, 3]
        .map((p) => data.juara.find((j) => j.peringkat === p))
        .filter(Boolean)
    : [];

  return (
    <AnimatePresence>
      {tampil && data && data.tanggal ? (
        <motion.div
          key="kembang-api"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Perayaan reset periode dan juara komentar"
        >
          <canvas
            ref={kanvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{
              duration: 0.35,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.15,
            }}
            className="glass-strong relative w-full max-w-md rounded-3xl p-5 text-center shadow-2xl"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/20 text-amber-500">
              <PartyPopper className="h-8 w-8" />
            </span>
            <p className="mt-2 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
              Periode baru dimulai · reset 19.00 WIB
            </p>
            <p className="mt-1 font-heading text-[19px] font-extrabold text-teks-utama">
              Selamat kepada juara komentar!
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-teks-sekunder">
              Top 3 kepatuhan komentar postingan TV Rakyat Official periode{" "}
              <b className="text-teks-utama">
                {tanggalIndonesia(`${data.tanggal}T00:00:00+07:00`)}
              </b>{" "}
              (19.00–18.59 WIB).
            </p>

            <div className="mt-4 flex items-end justify-center gap-2">
              {urutanPodium.map((j) => {
                if (!j) return null;
                const tinggi =
                  j.peringkat === 1 ? 92 : j.peringkat === 2 ? 68 : 52;
                const medali =
                  j.peringkat === 1 ? "🥇" : j.peringkat === 2 ? "🥈" : "🥉";
                return (
                  <motion.div
                    key={j.peringkat}
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      delay: 0.35 + j.peringkat * 0.15,
                      duration: 0.4,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="flex w-[30%] flex-col items-center"
                  >
                    <span className="text-[22px] leading-none">{medali}</span>
                    <div className="mt-1">
                      {j.avatar_url ? (
                        <FotoBulat
                          src={j.avatar_url}
                          ukuran={j.peringkat === 1 ? 56 : 44}
                        />
                      ) : (
                        <AvatarInisial
                          nama={j.nama}
                          ukuran={j.peringkat === 1 ? 56 : 44}
                        />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-center text-[11.5px] font-bold leading-tight text-teks-utama">
                      {j.nama}
                    </p>
                    <p className="text-[10.5px] text-teks-sekunder">
                      <span className="font-bold text-teks-utama">
                        {j.persen}%
                      </span>{" "}
                      patuh · {j.total_komentar} komentar
                    </p>
                    <div
                      className="mt-1.5 w-full rounded-t-xl"
                      style={{
                        height: tinggi,
                        background:
                          j.peringkat === 1
                            ? "linear-gradient(180deg, #F59E0B, #B45309)"
                            : j.peringkat === 2
                              ? "linear-gradient(180deg, #CBD5E1, #64748B)"
                              : "linear-gradient(180deg, #F97316, #9A3412)",
                      }}
                    />
                  </motion.div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={tutup}
              className="btn-tekan mt-4 h-11 w-full rounded-xl text-[13px] font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              }}
            >
              Selamat! Lanjut ke beranda
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
