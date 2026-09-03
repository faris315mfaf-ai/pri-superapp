"use client";

// ============================================================
// TurPemandu (3 Sep 2026) — tutorial interaktif "daftar akun media
// sosial → cek Kepatuhan Komen". Bagian yang harus diketuk DISOROT;
// sisanya diburamkan & digelapkan (lapisan backdrop-blur dengan lubang
// clip-path yang bergerak halus mengikuti target). Kartu penjelasan
// menempel di dekat target. Tur maju sendiri saat pengguna benar-benar
// mengetuk bagian itu; kalau target hilang (jendela ditutup, dsb.), tur
// mundur ke langkah terdekat yang masih terlihat.
//
// Mulai otomatis SEKALI untuk pengguna yang belum punya akun terdaftar;
// bisa dimulai lagi kapan saja dari Profil → "Tutorial daftar akun".
// Status selesai/lewati disimpan di localStorage per pengguna.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, GraduationCap, X } from "lucide-react";
import { useAppStore } from "@/hooks/use-app-store";
import { getAkunSosmed } from "@/services";
import {
  elemenTur,
  LANGKAH_TUR,
  mulaiTur,
  PERISTIWA_TUR,
  tandaiTurSelesai,
  turSudahSelesai,
} from "@/lib/tur";

type Kotak = { top: number; left: number; width: number; height: number };
const PADDING = 6;
const TINGGI_KARTU_KIRA = 170;
const LEBAR_KARTU = 340;
const JEDA_POLL_MS = 120;
/** Target tak terlihat selama ini → cari langkah lain yang terlihat. */
const TOLERANSI_HILANG_MS = 1200;
/** Target tidak ada sama sekali di DOM selama ini → tur diakhiri. */
const TOLERANSI_TIDAK_ADA_MS = 6000;

const MULUS = "cubic-bezier(0.22, 1, 0.36, 1)";

function gabungKotak(els: HTMLElement[]): Kotak {
  let t = Infinity, l = Infinity, r = -Infinity, b = -Infinity;
  for (const el of els) {
    const k = el.getBoundingClientRect();
    t = Math.min(t, k.top);
    l = Math.min(l, k.left);
    r = Math.max(r, k.right);
    b = Math.max(b, k.bottom);
  }
  return { top: t - PADDING, left: l - PADDING, width: r - l + PADDING * 2, height: b - t + PADDING * 2 };
}

function elemenLangkah(i: number): HTMLElement[] {
  const langkah = LANGKAH_TUR[i];
  if (!langkah) return [];
  const hasil: HTMLElement[] = [];
  for (const nama of langkah.target) {
    const el = elemenTur(nama);
    if (el) hasil.push(el);
  }
  // Semua target harus terlihat; kalau ada yang hilang, anggap belum siap.
  return hasil.length === langkah.target.length ? hasil : [];
}

function adaDiDom(i: number): boolean {
  const langkah = LANGKAH_TUR[i];
  if (!langkah) return false;
  return langkah.target.every((nama) => document.querySelector(`[data-tur="${nama}"]`) !== null);
}

export function TurPemandu() {
  const user = useAppStore((s) => s.user);
  // -1 = tidak aktif; 0..n-1 = langkah; n = kartu selesai
  const [langkah, setLangkah] = useState(-1);
  const [kotak, setKotak] = useState<Kotak | null>(null);
  const [posKartu, setPosKartu] = useState<{ top: number; left: number; atas: boolean } | null>(null);
  const langkahRef = useRef(-1);
  const menungguHilangRef = useRef(false);
  const hilangSejakRef = useRef<number | null>(null);
  const tidakAdaSejakRef = useRef<number | null>(null);
  const sudahGulirRef = useRef(-1);

  const aktif = langkah >= 0;
  const selesai = langkah >= LANGKAH_TUR.length;
  const userId = user?.id ?? "";

  const pindah = useCallback((ke: number) => {
    langkahRef.current = ke;
    menungguHilangRef.current = false;
    hilangSejakRef.current = null;
    tidakAdaSejakRef.current = null;
    setLangkah(ke);
  }, []);

  const akhiri = useCallback(
    (cara: "selesai" | "lewati") => {
      if (userId) tandaiTurSelesai(userId, cara);
      pindah(-1);
      setKotak(null);
      setPosKartu(null);
    },
    [pindah, userId],
  );

  // Mulai dari peristiwa global (baris "Tutorial" di Profil).
  useEffect(() => {
    const mulai = () => pindah(0);
    window.addEventListener(PERISTIWA_TUR, mulai);
    return () => window.removeEventListener(PERISTIWA_TUR, mulai);
  }, [pindah]);

  // Mulai otomatis sekali: pengguna belum punya akun sosmed terdaftar.
  useEffect(() => {
    if (!userId || turSudahSelesai(userId)) return;
    let hidup = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    getAkunSosmed()
      .then((d) => {
        if (!hidup || d.length > 0 || langkahRef.current >= 0) return;
        timer = setTimeout(() => hidup && mulaiTur(), 1800);
      })
      .catch(() => {
        // gagal baca = jangan ganggu; tutorial tetap bisa dibuka manual
      });
    return () => {
      hidup = false;
      if (timer) clearTimeout(timer);
    };
  }, [userId]);

  // Ketukan pada target = maju.
  useEffect(() => {
    if (!aktif || selesai) return;
    const onKlik = (e: Event) => {
      const i = langkahRef.current;
      const l = LANGKAH_TUR[i];
      if (!l) return;
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.closest !== "function") return;
      const nama = [...l.target, ...(l.klikJuga ?? [])];
      const kena = nama.some((n) => t.closest(`[data-tur="${n}"]`));
      if (!kena) return;
      if (l.maju === "isi") return; // langkah isi maju lewat nilai, bukan ketukan
      if (l.maju === "klik-lalu-hilang") {
        menungguHilangRef.current = true;
        return;
      }
      // Beri waktu UI bereaksi (tab berpindah, jendela terbuka) sebelum sorotan pindah.
      window.setTimeout(() => {
        if (langkahRef.current === i) pindah(i + 1);
      }, 220);
    };
    document.addEventListener("click", onKlik, true);
    return () => document.removeEventListener("click", onKlik, true);
  }, [aktif, selesai, pindah]);

  // Pelacak posisi target + aturan maju/mundur otomatis.
  useEffect(() => {
    if (!aktif || selesai) return;
    let hidup = true;
    const hitung = () => {
      if (!hidup) return;
      const i = langkahRef.current;
      const l = LANGKAH_TUR[i];
      if (!l) return;
      const kini = Date.now();

      // Lewati bila target langkah berikutnya sudah terlihat.
      if (l.lewatiBilaTampak && elemenTur(l.lewatiBilaTampak)) {
        pindah(i + 1);
        return;
      }

      const els = elemenLangkah(i);
      if (els.length === 0) {
        setKotak(null);
        setPosKartu(null);
        if (menungguHilangRef.current) {
          // Tombol Simpan lenyap = tersimpan → maju.
          pindah(i + 1);
          return;
        }
        hilangSejakRef.current ??= kini;
        if (!adaDiDom(i)) {
          tidakAdaSejakRef.current ??= kini;
          if (kini - tidakAdaSejakRef.current > TOLERANSI_TIDAK_ADA_MS) {
            // Bagian ini memang tidak ada untuk akun ini (mis. tanpa menu Beranda).
            akhiri("selesai");
            return;
          }
        } else {
          tidakAdaSejakRef.current = null;
        }
        if (kini - hilangSejakRef.current > TOLERANSI_HILANG_MS) {
          // Mundur ke langkah terdekat yang targetnya terlihat.
          for (let j = i - 1; j >= 0; j--) {
            if (elemenLangkah(j).length > 0) {
              pindah(j);
              return;
            }
          }
        }
        return;
      }
      hilangSejakRef.current = null;
      tidakAdaSejakRef.current = null;

      if (l.maju === "isi") {
        const input = els[0] as HTMLInputElement;
        if (typeof input.value === "string" && input.value.trim().length >= 2) {
          pindah(i + 1);
          return;
        }
      }

      if (sudahGulirRef.current !== i) {
        sudahGulirRef.current = i;
        try {
          els[0].scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        } catch {
          // peramban lama
        }
      }

      const k = gabungKotak(els);
      setKotak((lama) =>
        lama &&
        Math.abs(lama.top - k.top) < 0.5 &&
        Math.abs(lama.left - k.left) < 0.5 &&
        Math.abs(lama.width - k.width) < 0.5 &&
        Math.abs(lama.height - k.height) < 0.5
          ? lama
          : k,
      );
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const lebar = Math.min(LEBAR_KARTU, vw - 24);
      const bawahCukup = k.top + k.height + 12 + TINGGI_KARTU_KIRA < vh;
      const top = bawahCukup ? k.top + k.height + 12 : Math.max(12, k.top - 12 - TINGGI_KARTU_KIRA);
      const left = Math.min(Math.max(12, k.left + k.width / 2 - lebar / 2), vw - lebar - 12);
      setPosKartu((lama) => (lama && lama.top === top && lama.left === left && lama.atas === !bawahCukup ? lama : { top, left, atas: !bawahCukup }));
    };
    hitung();
    const timer = window.setInterval(hitung, JEDA_POLL_MS);
    window.addEventListener("scroll", hitung, true);
    window.addEventListener("resize", hitung);
    return () => {
      hidup = false;
      window.clearInterval(timer);
      window.removeEventListener("scroll", hitung, true);
      window.removeEventListener("resize", hitung);
    };
  }, [aktif, selesai, pindah, akhiri]);

  if (!aktif) return null;

  const l = LANGKAH_TUR[langkah];
  const lebarKartu = typeof window === "undefined" ? LEBAR_KARTU : Math.min(LEBAR_KARTU, window.innerWidth - 24);
  // Lubang sorotan: poligon evenodd (layar penuh dikurangi kotak target).
  const h = kotak ?? { top: 0, left: 0, width: 0, height: 0 };
  const L = `${Math.max(0, h.left)}px`;
  const T = `${Math.max(0, h.top)}px`;
  const R = `${Math.max(0, h.left + h.width)}px`;
  const B = `${Math.max(0, h.top + h.height)}px`;
  const lubang = kotak
    ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${L} ${T}, ${R} ${T}, ${R} ${B}, ${L} ${B}, ${L} ${T})`
    : "polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%)";

  return (
    <AnimatePresence>
      <motion.div
        key="tur"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="pointer-events-none fixed inset-0 z-[110]"
        aria-live="polite"
      >
        {/* Lapisan buram + gelap dengan lubang di target */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(5px)",
            WebkitBackdropFilter: "blur(5px)",
            clipPath: lubang,
            WebkitClipPath: lubang,
            transition: `clip-path 380ms ${MULUS}, -webkit-clip-path 380ms ${MULUS}`,
          }}
        />

        {/* Cincin sorotan. Denyutnya CSS murni (opacity + transform) — animasi
            box-shadow per frame terbukti membuat peramban macet menggambar
            karena memaksa lapisan buram di bawahnya dilukis ulang terus. */}
        {kotak && !selesai && (
          <div
            aria-hidden="true"
            className="absolute rounded-2xl"
            style={{
              top: kotak.top,
              left: kotak.left,
              width: kotak.width,
              height: kotak.height,
              border: "2px solid #F59E0B",
              boxShadow: "0 0 0 3px rgba(245,158,11,0.3), 0 0 24px rgba(245,158,11,0.5)",
              transition: `top 380ms ${MULUS}, left 380ms ${MULUS}, width 380ms ${MULUS}, height 380ms ${MULUS}`,
            }}
          >
            <span className="tur-denyut absolute -inset-1.5 rounded-[1.15rem] border-2 border-amber-400" />
          </div>
        )}

        {/* Kartu langkah */}
        {!selesai && l && (
          <div
            className="pointer-events-auto absolute"
            style={{
              top: posKartu?.top ?? 24,
              left: posKartu?.left ?? 12,
              width: lebarKartu,
              transition: `top 380ms ${MULUS}, left 380ms ${MULUS}`,
            }}
          >
            <div className="glass-strong rounded-2xl p-3.5 shadow-2xl">
              <div className="flex items-start gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-500">
                  <GraduationCap className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold tracking-wide text-teks-sekunder uppercase">
                    Tutorial · langkah {langkah + 1} dari {LANGKAH_TUR.length}
                  </p>
                  <p className="font-heading text-[14px] font-extrabold text-teks-utama">{l.judul}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-teks-sekunder">{l.isi}</p>
                  {!kotak ? (
                    <p className="mt-1 text-[11px] text-amber-500">Mencari bagian yang harus diketuk…</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => akhiri("lewati")}
                  aria-label="Lewati tutorial"
                  className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-teks-sekunder"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex gap-1">
                  {LANGKAH_TUR.map((_, i) => (
                    <span
                      key={i}
                      className="h-1.5 rounded-full"
                      style={{
                        width: i === langkah ? 16 : 6,
                        background: i <= langkah ? "#F59E0B" : "rgba(148,163,184,0.45)",
                        transition: `width 300ms ${MULUS}, background 300ms`,
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => akhiri("lewati")}
                  className="btn-tekan text-[11.5px] font-bold text-teks-sekunder underline-offset-2 hover:underline"
                >
                  Lewati tutorial
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Kartu selesai */}
        {selesai && (
          <div className="pointer-events-auto absolute inset-0 flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="glass-strong w-full max-w-sm rounded-3xl p-5 text-center shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Tutorial selesai"
            >
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <p className="mt-3 font-heading text-[17px] font-extrabold text-teks-utama">Tutorial selesai!</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-teks-sekunder">
                Akun Anda sudah terdaftar dan Anda tahu cara mengecek Kepatuhan Komen. Komentar dihitung hanya bila
                ditulis memakai akun terdaftar dalam jendela 19.00–18.59 WIB. Tutorial ini bisa dibuka lagi dari
                Profil → Profil & Keamanan.
              </p>
              <button
                type="button"
                onClick={() => akhiri("selesai")}
                className="btn-tekan mt-4 h-11 w-full rounded-xl text-[13px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              >
                Mengerti
              </button>
            </motion.div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
