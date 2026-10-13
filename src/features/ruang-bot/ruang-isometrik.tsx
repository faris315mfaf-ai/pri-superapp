"use client";

// ============================================================
// RUANG ISOMETRIK — kanvas gedung empat ruang tempat bot bekerja.
//
// Penggambaran ada di dunia-gambar.ts (diporting dari mockup
// docs/mockups/pri-ruang-bot.html): ruang kerja, ruang meeting, ruang
// koordinator (Nara), dan kamar tidur, dipisah sekat kaca. Kanvas logis kecil
// (524x344) di-CSS-skala "pixelated" memenuhi lebar wadah (aspect-ratio W/H).
// Latar statis digambar sekali ke kanvas luar-layar dan dibangun ulang hanya
// saat siang/malam berubah; objek, orang, dan dinding dinamis digambar tiap
// frame berurut kedalaman.
//
// Loop requestAnimationFrame hanya berjalan bila tab aplikasi aktif DAN
// halaman terlihat. Posisi bot hidup di objek SimulasiBot / ref (bukan
// state), jadi tidak ada render ulang React per frame: overlay (tag nama,
// bubble, pil label meja & ruang) diposisikan lewat manipulasi style elemen.
// Menggambar dilewati bila kanvas di luar layar; simulasi tetap maju.
// ============================================================

import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useTabAktif } from "@/hooks/use-tab-aktif";
import { cn } from "@/lib/utils";
import { WARNA_TAHAP, URUTAN_TAHAP, WARNA_TEMPAT } from "./data-contoh";
import { LABEL_RUANG, STASIUN, type Titik, type ZonaRuang } from "./denah";
import { H, ID_NARA, P, W, gambarFrame, gambarLatar, type PosisiLayar } from "./dunia-gambar";
import type { BotHidup, SimulasiBot } from "./simulasi-bot";
import { WARNA_NARA } from "./simulasi-nara";
import type { BotContoh, RupaBot } from "./tipe";

/** Batas dt per frame (detik nyata): tab yang baru kembali tidak melonjak. */
const DT_MAKS = 0.1;
/** Selang gambar minimal bila gerak dikurangi (ms). */
const SELANG_GAMBAR_DIKURANGI = 250;
/** Waktu animasi beku untuk gerak dikurangi (mata terbuka, tanpa kedip). */
const WAKTU_BEKU = 100;

// ---------- langganan peramban (tanpa setState di effect) ----------

function langganVisibilitas(cb: () => void): () => void {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

function useHalamanTerlihat(): boolean {
  return useSyncExternalStore(
    langganVisibilitas,
    () => document.visibilityState === "visible",
    () => true,
  );
}

const KUERI_GERAK = "(prefers-reduced-motion: reduce)";

function langganGerak(cb: () => void): () => void {
  const mql = window.matchMedia(KUERI_GERAK);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function useGerakDikurangi(): boolean {
  return useSyncExternalStore(
    langganGerak,
    () => window.matchMedia(KUERI_GERAK).matches,
    () => false,
  );
}

// ---------- komponen ----------

export type RuangIsometrikProps = {
  sim: SimulasiBot;
  bots: BotContoh[];
  malam: boolean;
  /** Pengali kecepatan simulasi (1, 3, 8). */
  kecepatan: number;
  terpilihId: string | null;
  onPilih: (id: string | null) => void;
  /** Klik Nara di kanvas. */
  onPilihNara?: () => void;
  /** Pil nama ruang yang bisa diklik (mis. Ruang Meeting -> tab Chat). Ruang tanpa pengendali hanya label. */
  onBukaZona?: Partial<Record<ZonaRuang, () => void>>;
  /** Lapisan di atas kanvas (HUD, spanduk jeda). */
  children?: ReactNode;
  className?: string;
};

export function RuangIsometrik({ sim, bots, malam, kecepatan, terpilihId, onPilih, onPilihNara, onBukaZona, children, className }: RuangIsometrikProps) {
  const tabAktif = useTabAktif();
  const halamanTerlihat = useHalamanTerlihat();
  const gerakDikurangi = useGerakDikurangi();
  const jalan = tabAktif && halamanTerlihat;

  const kanvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<{ kanvas: HTMLCanvasElement; malam: boolean } | null>(null);
  const tagRef = useRef<(HTMLDivElement | null)[]>([]);
  const gelembungRef = useRef<(HTMLDivElement | null)[]>([]);
  const teksGelembungRef = useRef<(HTMLSpanElement | null)[]>([]);
  const naraTagRef = useRef<HTMLDivElement | null>(null);
  const naraGelembungRef = useRef<HTMLDivElement | null>(null);
  const naraTeksRef = useRef<HTMLSpanElement | null>(null);
  const naraNamaRef = useRef<HTMLSpanElement | null>(null);
  const pilRef = useRef<(HTMLDivElement | null)[]>([]);
  const zonaRef = useRef<(HTMLElement | null)[]>([]);
  const skalaRef = useRef(0);
  const terlihatRef = useRef(true);
  const kotorRef = useRef(true);
  const posisiRef = useRef<Map<string, PosisiLayar>>(new Map());
  const sinarRef = useRef<Titik[]>([]);

  // Nilai terbaru untuk loop (diisi lewat effect agar loop tidak dibuat ulang).
  const malamRef = useRef(malam);
  const kecepatanRef = useRef(kecepatan);
  const terpilihRef = useRef(terpilihId);
  const rupaRef = useRef<Map<string, { rupa: RupaBot; warna: string }>>(new Map());
  const onPilihRef = useRef(onPilih);
  const onPilihNaraRef = useRef(onPilihNara);

  useEffect(() => {
    malamRef.current = malam;
    kecepatanRef.current = kecepatan;
    terpilihRef.current = terpilihId;
    onPilihRef.current = onPilih;
    onPilihNaraRef.current = onPilihNara;
    rupaRef.current = new Map(bots.map((b) => [b.id, { rupa: b.rupa, warna: b.warna }]));
    kotorRef.current = true; // paksa gambar ulang walau mode gerak dikurangi
  }, [malam, kecepatan, terpilihId, onPilih, onPilihNara, bots]);

  useEffect(() => {
    sim.setGerakKurang(gerakDikurangi);
  }, [sim, gerakDikurangi]);

  // Ukuran kanvas -> skala overlay. Ukuran 0 (tersembunyi) = tidak menggambar.
  useEffect(() => {
    const el = kanvasRef.current;
    if (!el) return;
    const ukur = () => {
      skalaRef.current = el.clientWidth / W;
      kotorRef.current = true;
    };
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Di luar layar (digulir keluar): lewati menggambar, simulasi tetap maju.
  useEffect(() => {
    const el = kanvasRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entri]) => {
      terlihatRef.current = entri.isIntersecting;
      if (entri.isIntersecting) kotorRef.current = true;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Loop utama: hanya saat tab aktif & halaman terlihat.
  useEffect(() => {
    if (!jalan) return;
    const kanvas = kanvasRef.current;
    const ctx = kanvas?.getContext("2d");
    if (!kanvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;

    let id = 0;
    let terakhir = performance.now();
    let akhirGambar = 0;

    const ukuranGelembung = (sc: number) => `${Math.max(9, Math.min(12, sc * 3.3)).toFixed(1)}px`;

    const taruhOverlay = () => {
      const sc = skalaRef.current;
      if (sc <= 0) return;
      const daftar = sim.bots;
      for (let i = 0; i < daftar.length; i++) {
        const b = daftar[i];
        const tag = tagRef.current[i];
        const pos = posisiRef.current.get(b.id);
        if (!tag || !pos) continue;
        tag.style.visibility = "visible";
        tag.style.transform = `translate(${(pos.sx * sc).toFixed(1)}px, ${((pos.sy - 29) * sc).toFixed(1)}px) translate(-50%, -100%)`;
        tag.style.zIndex = String(Math.round(b.y * 10 + b.x * 10) + 10);
        const gel = gelembungRef.current[i];
        const isi = teksGelembungRef.current[i];
        if (gel && isi) {
          const teks = sim.teksTampil(b);
          if (teks) {
            if (isi.textContent !== teks) isi.textContent = teks;
            gel.style.setProperty("--c", WARNA_TEMPAT[b.tempat]);
            gel.style.fontSize = ukuranGelembung(sc);
            gel.style.display = "block";
          } else {
            gel.style.display = "none";
          }
        }
      }
      // Nara
      const n = sim.nara;
      const posN = posisiRef.current.get(ID_NARA);
      const tagN = naraTagRef.current;
      if (tagN && posN) {
        tagN.style.visibility = "visible";
        tagN.style.transform = `translate(${(posN.sx * sc).toFixed(1)}px, ${((posN.sy - 29) * sc).toFixed(1)}px) translate(-50%, -100%)`;
        tagN.style.zIndex = String(Math.round(n.y * 10 + n.x * 10) + 10);
        if (naraNamaRef.current && naraNamaRef.current.textContent !== n.nama) naraNamaRef.current.textContent = n.nama;
        const gel = naraGelembungRef.current;
        const isi = naraTeksRef.current;
        if (gel && isi) {
          const teks = n.teksTampil();
          if (teks) {
            if (isi.textContent !== teks) isi.textContent = teks;
            gel.style.fontSize = ukuranGelembung(sc);
            gel.style.display = "block";
          } else {
            gel.style.display = "none";
          }
        }
      }
      URUTAN_TAHAP.forEach((k, i) => {
        const pil = pilRef.current[i];
        if (!pil) return;
        const p = P(STASIUN[k].label[0], STASIUN[k].label[1]);
        pil.style.transform = `translate(${(p[0] * sc).toFixed(1)}px, ${(p[1] * sc).toFixed(1)}px) translate(-50%, -50%)`;
        pil.style.fontSize = `${Math.max(8, sc * 2.9).toFixed(1)}px`;
        pil.dataset.sibuk = sim.terisi(k) ? "ya" : "tidak";
        pil.style.visibility = "visible";
      });
      LABEL_RUANG.forEach((z, i) => {
        const el = zonaRef.current[i];
        if (!el) return;
        const p = P(z.titik[0], z.titik[1]);
        el.style.transform = `translate(${(p[0] * sc).toFixed(1)}px, ${(p[1] * sc).toFixed(1)}px) translate(-50%, -50%)`;
        el.style.fontSize = `${Math.max(7.5, Math.min(10, sc * 2.7)).toFixed(1)}px`;
        el.style.visibility = "visible";
      });
    };

    const langkah = (now: number) => {
      id = requestAnimationFrame(langkah);
      const dtNyata = Math.min(DT_MAKS, Math.max(0, (now - terakhir) / 1000));
      terakhir = now;
      sim.maju(dtNyata * kecepatanRef.current, dtNyata);

      if (!terlihatRef.current || skalaRef.current <= 0) return;
      if (gerakDikurangi && !kotorRef.current && now - akhirGambar < SELANG_GAMBAR_DIKURANGI) return;
      kotorRef.current = false;
      akhirGambar = now;

      // Latar luar-layar dibangun ulang hanya saat siang/malam berganti.
      const malamSekarang = malamRef.current;
      if (!bgRef.current) {
        const kb = document.createElement("canvas");
        kb.width = W;
        kb.height = H;
        bgRef.current = { kanvas: kb, malam: !malamSekarang };
      }
      if (bgRef.current.malam !== malamSekarang) {
        const cb = bgRef.current.kanvas.getContext("2d");
        if (cb) gambarLatar(cb, malamSekarang);
        bgRef.current.malam = malamSekarang;
      }

      gambarFrame(
        {
          c: ctx,
          t: gerakDikurangi ? WAKTU_BEKU : now,
          sim,
          rupa: rupaRef.current,
          terpilihId: terpilihRef.current,
          malam: malamSekarang,
          posisi: posisiRef.current,
        },
        bgRef.current.kanvas,
        sinarRef.current,
      );
      taruhOverlay();
    };

    id = requestAnimationFrame(langkah);
    return () => cancelAnimationFrame(id);
  }, [jalan, sim, gerakDikurangi]);

  const klikKanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    const sc = r.width / W;
    const x = (e.clientX - r.left) / sc;
    const y = (e.clientY - r.top) / sc;
    const kena = (pos: PosisiLayar | undefined) => !!pos && Math.abs(x - pos.sx) < 9 && y < pos.sy + 3 && y > pos.sy - 27;
    // Nara di atas bot bila bertumpuk (ia berdiri di depan papan / pintu).
    if (kena(posisiRef.current.get(ID_NARA))) {
      onPilihNaraRef.current?.();
      return;
    }
    let dipilih: BotHidup | null = null;
    for (const b of sim.bots) if (kena(posisiRef.current.get(b.id))) dipilih = b;
    onPilihRef.current(dipilih ? (terpilihRef.current === dipilih.id ? null : dipilih.id) : null);
  };

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-xl bg-[#0b0912]", className)}
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      <canvas
        ref={kanvasRef}
        width={W}
        height={H}
        role="img"
        aria-label="Gedung empat ruang pixel-art: ruang kerja, ruang meeting, ruang koordinator, dan kamar tidur. Klik bot atau koordinator untuk memilihnya."
        onClick={klikKanvas}
        className="absolute inset-0 block h-full w-full cursor-pointer"
        style={{ imageRendering: "pixelated" }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {bots.map((b, i) => (
          <div
            key={b.id}
            ref={(el) => {
              tagRef.current[i] = el;
            }}
            className="absolute left-0 top-0 flex flex-col items-center gap-[3px]"
            style={{ visibility: "hidden", "--c": b.warna } as CSSProperties}
          >
            <div
              ref={(el) => {
                gelembungRef.current[i] = el;
              }}
              className="relative hidden rounded-md border-2 border-[var(--c)] bg-[#f6f0e2] px-[7px] py-[3px] font-mono font-bold leading-tight text-[#2a2118] shadow-[0_2px_0_rgba(0,0,0,.35)] after:absolute after:-bottom-[6px] after:left-1/2 after:-ml-1 after:border-4 after:border-transparent after:border-t-[var(--c)] after:content-['']"
            >
              <span
                ref={(el) => {
                  teksGelembungRef.current[i] = el;
                }}
                className="block max-w-[150px] truncate whitespace-nowrap sm:max-w-[230px]"
              />
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full border bg-[rgba(14,11,20,.85)] py-px pl-[5px] pr-[7px] text-[10.5px] font-bold text-[#f4efe8]",
                terpilihId === b.id ? "border-[#fde68a]" : "border-white/10",
              )}
            >
              <i className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--c)]" />
              {b.nama}
            </div>
          </div>
        ))}
        {/* Nara (koordinator) */}
        <div
          ref={naraTagRef}
          className="absolute left-0 top-0 flex flex-col items-center gap-[3px]"
          style={{ visibility: "hidden", "--c": WARNA_NARA } as CSSProperties}
        >
          <div
            ref={naraGelembungRef}
            className="relative hidden rounded-md border-2 border-[var(--c)] bg-[#f6f0e2] px-[7px] py-[3px] font-mono font-bold leading-tight text-[#2a2118] shadow-[0_2px_0_rgba(0,0,0,.35)] after:absolute after:-bottom-[6px] after:left-1/2 after:-ml-1 after:border-4 after:border-transparent after:border-t-[var(--c)] after:content-['']"
          >
            <span ref={naraTeksRef} className="block max-w-[150px] truncate whitespace-nowrap sm:max-w-[260px]" />
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[rgba(14,11,20,.85)] py-px pl-[5px] pr-[7px] text-[10.5px] font-bold text-[#f4efe8]">
            <i className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--c)]" />
            <span ref={naraNamaRef}>Nara</span>
          </div>
        </div>
        {URUTAN_TAHAP.map((k, i) => (
          <div
            key={k}
            ref={(el) => {
              pilRef.current[i] = el;
            }}
            data-sibuk="tidak"
            className="group absolute left-0 top-0 inline-flex items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-[var(--c)] bg-[rgba(14,11,20,.8)] px-[7px] py-[3px] font-mono text-[9.5px] font-bold leading-none tracking-[.6px] text-[#f4efe8] max-[560px]:hidden"
            style={{ visibility: "hidden", "--c": WARNA_TAHAP[k] } as CSSProperties}
          >
            <i className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--c)] group-data-[sibuk=ya]:shadow-[0_0_6px_var(--c)]" />
            {STASIUN[k].nama}
          </div>
        ))}
        {LABEL_RUANG.map((z, i) => {
          const buka = onBukaZona?.[z.kunci];
          const kelas =
            "absolute left-0 top-0 inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] border border-[var(--c)] bg-[rgba(14,11,20,.82)] px-[6px] py-[2px] font-mono text-[9px] font-bold leading-none tracking-[.5px] text-[#f4efe8]";
          const gaya = { visibility: "hidden", "--c": z.warna } as CSSProperties;
          return buka ? (
            <button
              key={z.kunci}
              type="button"
              ref={(el) => {
                zonaRef.current[i] = el;
              }}
              onClick={buka}
              aria-label={`Buka ${z.nama.toLowerCase()}`}
              className={cn(kelas, "pointer-events-auto cursor-pointer underline decoration-dotted underline-offset-2 hover:bg-[rgba(40,32,58,.95)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#fde68a]")}
              style={gaya}
            >
              <i className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--c)]" />
              {z.nama}
            </button>
          ) : (
            <div
              key={z.kunci}
              ref={(el) => {
                zonaRef.current[i] = el;
              }}
              className={kelas}
              style={gaya}
            >
              <i className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--c)]" />
              {z.nama}
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}
