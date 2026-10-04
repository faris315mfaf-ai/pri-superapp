"use client";

// ============================================================
// LapisanTur — mesin tutorial interaktif bersama (dipisah dari
// TurPemandu, 5 Okt 2026, supaya bisa dipakai lebih dari satu tur).
//
// Bagian yang harus diketuk DISOROT; sisanya diburamkan & digelapkan
// (lapisan backdrop-blur dengan lubang clip-path yang bergerak halus
// mengikuti target). Kartu penjelasan menempel di dekat target.
//
// Jenis langkah (lib/tur → LangkahTur):
//   klik / klik-lalu-hilang / isi → maju saat pengguna benar-benar bertindak
//   lanjut  → kartu penjelasan; maju lewat tombol Lanjut
//   target kosong → kartu di tengah layar (mis. contoh bergambar)
// Target hilang: langkah opsional/penjelasan yang bagiannya tidak ada
// DILEWATI; langkah tindakan mundur ke langkah terdekat yang masih terlihat,
// dan tur diakhiri bila bagiannya memang tidak ada untuk akun ini.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronRight, Download, GraduationCap, X } from "lucide-react";
import { elemenTur, keadaanTur, type LangkahTur } from "@/lib/tur";

type Kotak = { top: number; left: number; width: number; height: number };
const PADDING = 6;
const TINGGI_KARTU_KIRA = 190;
const LEBAR_KARTU = 340;
const LEBAR_KARTU_GAMBAR = 400;
const JEDA_POLL_MS = 120;
/** Target tak terlihat selama ini → cari langkah lain yang terlihat. */
const TOLERANSI_HILANG_MS = 1200;
/** Target tidak ada sama sekali di DOM selama ini → tur diakhiri. */
const TOLERANSI_TIDAK_ADA_MS = 6000;
/** Langkah opsional / penjelasan yang bagiannya tidak tampak → dilewati. */
const TOLERANSI_LEWATI_MS = 1500;

const MULUS = "cubic-bezier(0.22, 1, 0.36, 1)";

function gabungKotak(els: HTMLElement[]): Kotak {
  let t = Infinity,
    l = Infinity,
    r = -Infinity,
    b = -Infinity;
  for (const el of els) {
    const k = el.getBoundingClientRect();
    t = Math.min(t, k.top);
    l = Math.min(l, k.left);
    r = Math.max(r, k.right);
    b = Math.max(b, k.bottom);
  }
  return {
    top: t - PADDING,
    left: l - PADDING,
    width: r - l + PADDING * 2,
    height: b - t + PADDING * 2,
  };
}

function elemenLangkah(l: LangkahTur | undefined): HTMLElement[] {
  if (!l) return [];
  const hasil: HTMLElement[] = [];
  for (const nama of l.target) {
    const el = elemenTur(nama);
    if (el) hasil.push(el);
  }
  // Semua target harus terlihat; kalau ada yang hilang, anggap belum siap.
  return hasil.length === l.target.length ? hasil : [];
}

function adaDiDom(l: LangkahTur | undefined): boolean {
  if (!l) return false;
  return l.target.every((nama) => document.querySelector(`[data-tur="${nama}"]`) !== null);
}

export function LapisanTur({
  id,
  daftar,
  label = "Tutorial",
  catatan,
  judulSelesai,
  isiSelesai,
  onAkhiri,
}: {
  /** Penanda tur (keadaanTur.aktif) supaya dua tur tidak tampil bersamaan. */
  id: string;
  daftar: LangkahTur[];
  label?: string;
  /** Catatan kecil di setiap kartu (mis. "muncul lagi tiap 5 menit"). */
  catatan?: string;
  judulSelesai: string;
  isiSelesai: string;
  onAkhiri: (cara: "selesai" | "lewati") => void;
}) {
  // 0..n-1 = langkah; n = kartu selesai
  const [langkah, setLangkah] = useState(0);
  const [kotak, setKotak] = useState<Kotak | null>(null);
  const [posKartu, setPosKartu] = useState<{ top: number; left: number } | null>(null);
  const langkahRef = useRef(0);
  const menungguHilangRef = useRef(false);
  const hilangSejakRef = useRef<number | null>(null);
  const tidakAdaSejakRef = useRef<number | null>(null);
  const sudahGulirRef = useRef(-1);
  const kartuRef = useRef<HTMLDivElement>(null);

  const selesai = langkah >= daftar.length;

  useEffect(() => {
    keadaanTur.aktif = id;
    return () => {
      if (keadaanTur.aktif === id) keadaanTur.aktif = "";
    };
  }, [id]);

  const pindah = useCallback((ke: number) => {
    langkahRef.current = ke;
    menungguHilangRef.current = false;
    hilangSejakRef.current = null;
    tidakAdaSejakRef.current = null;
    setLangkah(ke);
  }, []);

  // Ketukan pada target = maju (langkah klik saja).
  useEffect(() => {
    if (selesai) return;
    const onKlik = (e: Event) => {
      const i = langkahRef.current;
      const l = daftar[i];
      if (!l || l.maju === "isi" || l.maju === "lanjut") return;
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.closest !== "function") return;
      const nama = [...l.target, ...(l.klikJuga ?? [])];
      const kena = nama.some((n) => t.closest(`[data-tur="${n}"]`));
      if (!kena) return;
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
  }, [selesai, pindah, daftar]);

  // Pelacak posisi target + aturan maju/mundur otomatis.
  useEffect(() => {
    if (selesai) return;
    let hidup = true;
    const hitung = () => {
      if (!hidup) return;
      const i = langkahRef.current;
      const l = daftar[i];
      if (!l) return;
      const kini = Date.now();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const lebar = Math.min(l.gambar ? LEBAR_KARTU_GAMBAR : LEBAR_KARTU, vw - 24);
      const tinggiKartu = kartuRef.current?.offsetHeight || TINGGI_KARTU_KIRA;
      const aturPos = (top: number, left: number) =>
        setPosKartu((lama) => (lama && Math.abs(lama.top - top) < 0.5 && Math.abs(lama.left - left) < 0.5 ? lama : { top, left }));

      // Lewati bila target langkah berikutnya sudah terlihat.
      if (l.lewatiBilaTampak && elemenTur(l.lewatiBilaTampak)) {
        pindah(i + 1);
        return;
      }

      // Kartu tengah tanpa sorotan.
      if (l.target.length === 0) {
        setKotak(null);
        aturPos(Math.max(12, (vh - tinggiKartu) / 2), Math.max(12, (vw - lebar) / 2));
        return;
      }

      const els = elemenLangkah(l);
      if (els.length === 0) {
        setKotak(null);
        setPosKartu(null);
        if (menungguHilangRef.current) {
          // Tombol Simpan lenyap = tersimpan → maju.
          pindah(i + 1);
          return;
        }
        hilangSejakRef.current ??= kini;
        const ada = adaDiDom(l);
        // Bagian opsional, atau penjelasan yang bagiannya tidak ada untuk akun
        // ini (seksi disembunyikan, fitur terkunci) → lewati, jangan mundur.
        // (Harus sebelum aturan mundur: mundur lebih cepat dan akan memantulkan
        // tur kembali ke langkah sebelumnya tanpa henti.)
        if (l.opsional || (l.maju === "lanjut" && !ada)) {
          if (kini - hilangSejakRef.current > TOLERANSI_LEWATI_MS) pindah(i + 1);
          return;
        }
        if (!ada) {
          tidakAdaSejakRef.current ??= kini;
          if (kini - tidakAdaSejakRef.current > TOLERANSI_TIDAK_ADA_MS) {
            // Bagian ini memang tidak ada untuk akun ini (mis. tanpa menu Beranda).
            onAkhiri("selesai");
            return;
          }
        } else {
          tidakAdaSejakRef.current = null;
        }
        if (kini - hilangSejakRef.current > TOLERANSI_HILANG_MS) {
          // Mundur ke langkah terdekat yang targetnya terlihat.
          for (let j = i - 1; j >= 0; j--) {
            const lj = daftar[j];
            if (lj && lj.target.length > 0 && elemenLangkah(lj).length > 0) {
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
      // Kartu di bawah target; tidak muat → di atas; target terlalu tinggi
      // (mis. kartu status sepanjang layar) → menempel di bawah layar.
      const bawahCukup = k.top + k.height + 12 + tinggiKartu < vh;
      const atasCukup = k.top - 12 - tinggiKartu > 0;
      const top = bawahCukup
        ? k.top + k.height + 12
        : atasCukup
          ? k.top - 12 - tinggiKartu
          : Math.max(12, vh - tinggiKartu - 12);
      const left = Math.min(Math.max(12, k.left + k.width / 2 - lebar / 2), vw - lebar - 12);
      aturPos(top, left);
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
  }, [selesai, pindah, daftar, onAkhiri]);

  const l = daftar[langkah];
  const lebarKartu =
    typeof window === "undefined"
      ? LEBAR_KARTU
      : Math.min(l?.gambar ? LEBAR_KARTU_GAMBAR : LEBAR_KARTU, window.innerWidth - 24);
  // Lubang sorotan: poligon evenodd (layar penuh dikurangi kotak target).
  const h = kotak ?? { top: 0, left: 0, width: 0, height: 0 };
  const L = `${Math.max(0, h.left)}px`;
  const T = `${Math.max(0, h.top)}px`;
  const R = `${Math.max(0, h.left + h.width)}px`;
  const B = `${Math.max(0, h.top + h.height)}px`;
  const lubang = kotak
    ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${L} ${T}, ${R} ${T}, ${R} ${B}, ${L} ${B}, ${L} ${T})`
    : "polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%)";
  const kartuTengah = l ? l.target.length === 0 : false;
  const pakaiLanjut = l ? l.maju === "lanjut" : false;

  return (
    <AnimatePresence>
      <motion.div
        key="tur"
        data-lapisan-tur={id}
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
            ref={kartuRef}
            className="pointer-events-auto absolute"
            style={{
              top: posKartu?.top ?? 24,
              left: posKartu?.left ?? 12,
              width: lebarKartu,
              // Kartu tengah muncul di tempat; kartu tersorot bergeser halus.
              transition: kartuTengah ? undefined : `top 380ms ${MULUS}, left 380ms ${MULUS}`,
            }}
          >
            {/* Latar pekat: backdrop-filter glass tidak menembus lapisan tur yang
                beranimasi, sehingga tanpa ini teks halaman ikut terbaca di kartu. */}
            <div className="glass-strong max-h-[85vh] overflow-y-auto rounded-2xl bg-white/95 p-3.5 shadow-2xl dark:bg-slate-900/95">
              <div className="flex items-start gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-500">
                  <GraduationCap className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold tracking-wide text-teks-sekunder uppercase">
                    {label} · langkah {langkah + 1} dari {daftar.length}
                  </p>
                  <p className="font-heading text-[14px] font-extrabold text-teks-utama">{l.judul}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onAkhiri("lewati")}
                  aria-label="Tutup tutorial"
                  className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-teks-sekunder"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {l.gambar && (
                // Ketuk = buka ukuran penuh di tab baru (teks kecil di HP).
                <a href={l.gambar.src} target="_blank" rel="noopener noreferrer" className="mt-2.5 block">
                  {/* Gambar contoh statis dari public/ (SVG) — bukan untuk next/image. */}
                  <img
                    src={l.gambar.src}
                    alt={l.gambar.alt}
                    className="max-h-[42vh] w-full rounded-xl bg-white object-contain"
                  />
                  <span className="mt-1 block text-center text-[10px] text-teks-sekunder">Ketuk gambar untuk memperbesar</span>
                </a>
              )}
              <p className="mt-2 text-[12px] leading-relaxed text-teks-sekunder">{l.isi}</p>
              {l.tautan && l.tautan.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {l.tautan.map((t) => (
                    <a
                      key={t.href}
                      href={t.href}
                      download
                      className="glass btn-tekan flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10.5px] font-bold text-teks-utama"
                    >
                      <Download className="h-3.5 w-3.5 text-pri" /> {t.label}
                    </a>
                  ))}
                </div>
              )}
              {!kotak && !kartuTengah ? (
                <p className="mt-1 text-[11px] text-amber-500">Mencari bagian yang dimaksud…</p>
              ) : null}
              {catatan ? <p className="mt-1 text-[10.5px] text-amber-500">{catatan}</p> : null}
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {daftar.map((_, i) => (
                    <span
                      key={i}
                      className="h-1.5 rounded-full"
                      style={{
                        width: i === langkah ? 14 : 5,
                        background: i <= langkah ? "#F59E0B" : "rgba(148,163,184,0.45)",
                        transition: `width 300ms ${MULUS}, background 300ms`,
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onAkhiri("lewati")}
                  className="btn-tekan shrink-0 text-[11px] font-bold text-teks-sekunder underline-offset-2 hover:underline"
                >
                  Lewati
                </button>
                {pakaiLanjut && (
                  <button
                    type="button"
                    onClick={() => pindah(langkah + 1)}
                    className="btn-tekan flex shrink-0 items-center gap-0.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
                  >
                    Lanjut <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
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
              className="glass-strong w-full max-w-sm rounded-3xl bg-white/95 p-5 text-center shadow-2xl dark:bg-slate-900/95"
              role="dialog"
              aria-modal="true"
              aria-label="Tutorial selesai"
            >
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <p className="mt-3 font-heading text-[17px] font-extrabold text-teks-utama">{judulSelesai}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-line text-teks-sekunder">{isiSelesai}</p>
              <button
                type="button"
                onClick={() => onAkhiri("selesai")}
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
