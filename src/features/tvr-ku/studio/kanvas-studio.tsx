"use client";

// ============================================================
// STUDIO TEMPLATE — kanvas 9:16 (720x1280) dengan seret & ubah ukuran
// (16 Okt 2026). Elemen digambar berurutan seperti perender: lapisan gambar
// sesuai urutan, lalu tulisan berita & kategori paling depan. Elemen yang
// tidak tampil pada detik garis putar dibuat pudar (tetap bisa dipilih).
// Koordinat = piksel kanvas 720x1280; layar hanya mengalikan skala.
// ============================================================

import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { LEBAR_KANVAS, TINGGI_KANVAS, WARNA_JENIS, rentangTampil, type DokStudio, type ElemenStudio, type Rect } from "@/mesin-video/studio-model";
import { cn } from "@/lib/utils";
import {
  PEGANGAN_SISI,
  PEGANGAN_SUDUT,
  garisDari,
  geserRect,
  jepitKanvas,
  namaElemen,
  ubahElemen,
  ubahUkuran,
  type Garis,
  type Pegangan,
} from "./studio-murni";

export const PILIH_TEKS = "berita:teks";
export const PILIH_OUTRO = "outro";

type Props = {
  dok: DokStudio;
  gambar: Record<string, string>;
  pilih: string | null;
  onPilih: (id: string | null) => void;
  mulaiUbah: () => void;
  ubah: (fn: (d: DokStudio) => DokStudio) => void;
  kunciRasio: (id: string) => boolean;
  rasioAset: (ref: string | null) => number | null;
  putar: number;
  durasi: number;
  contohLebar: boolean;
  areaAman: boolean;
  tempel: boolean;
};

const KURSOR: Record<Pegangan, string> = {
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
};

const CONTOH_HOOK = "VIRAL! Contoh tulisan berita untuk melihat letak dan ukurannya di video";

type Seret = {
  target: string;
  mode: "geser" | Pegangan;
  x0: number;
  y0: number;
  awal: Rect;
  garis: { v: number[]; h: number[] };
  rasio: number | null;
};

export function KanvasStudio(p: Props) {
  const wadahRef = useRef<HTMLDivElement>(null);
  const [skala, setSkala] = useState(0.4);
  const [garisAktif, setGarisAktif] = useState<Garis[]>([]);
  const seretRef = useRef<Seret | null>(null);
  const propsRef = useRef(p);
  useEffect(() => {
    propsRef.current = p;
  });

  useEffect(() => {
    const el = wadahRef.current;
    if (!el) return;
    const ukur = () => {
      const s = Math.min((el.clientWidth - 24) / LEBAR_KANVAS, (el.clientHeight - 24) / TINGGI_KANVAS);
      setSkala(Math.max(0.12, s));
    };
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rectTarget = (d: DokStudio, target: string): Rect | null => {
    if (target === PILIH_TEKS) return d.elemen.find((e) => e.jenis === "berita")?.teks ?? null;
    return d.elemen.find((e) => e.id === target)?.rect ?? null;
  };

  const mulaiSeret = (e: PE<HTMLElement>, target: string, mode: "geser" | Pegangan) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const { dok, onPilih, mulaiUbah, kunciRasio, rasioAset, tempel } = propsRef.current;
    onPilih(target);
    const awal = rectTarget(dok, target);
    if (!awal) return;
    const lain = dok.elemen
      .filter((x) => x.id !== target && !x.tersembunyi && (x.file || x.jenis === "kategori"))
      .map((x) => x.rect);
    const berita = dok.elemen.find((x) => x.jenis === "berita");
    if (target !== PILIH_TEKS && berita?.teks) lain.push(berita.teks);
    if (target === PILIH_TEKS && berita?.file) lain.push(berita.rect);
    const el = dok.elemen.find((x) => x.id === target);
    const rasio = target !== PILIH_TEKS && el && el.file && kunciRasio(target) ? (rasioAset(el.file) ?? awal.w / awal.h) : null;
    seretRef.current = { target, mode, x0: e.clientX, y0: e.clientY, awal, garis: tempel ? garisDari(lain) : { v: [], h: [] }, rasio };
    mulaiUbah();
    const gerak = (ev: PointerEvent) => {
      const s = seretRef.current;
      if (!s) return;
      const k = propsRef.current;
      const sk = skalaRef.current;
      const dx = (ev.clientX - s.x0) / sk;
      const dy = (ev.clientY - s.y0) / sk;
      const ambang = 7 / sk;
      const garis = ev.altKey ? { v: [], h: [] } : s.garis;
      const hasil = s.mode === "geser" ? geserRect(s.awal, dx, dy, garis, ambang) : ubahUkuran(s.awal, s.mode, dx, dy, ev.shiftKey ? null : s.rasio, garis, ambang);
      setGarisAktif(hasil.garis);
      const rect = s.target === PILIH_TEKS ? jepitKanvas(hasil.rect) : hasil.rect;
      k.ubah((d) =>
        s.target === PILIH_TEKS
          ? { ...d, elemen: d.elemen.map((x) => (x.jenis === "berita" ? { ...x, teks: rect } : x)) }
          : ubahElemen(d, s.target, (x) => ({ ...x, rect })),
      );
    };
    const lepas = () => {
      seretRef.current = null;
      setGarisAktif([]);
      window.removeEventListener("pointermove", gerak);
      window.removeEventListener("pointerup", lepas);
      window.removeEventListener("pointercancel", lepas);
    };
    window.addEventListener("pointermove", gerak);
    window.addEventListener("pointerup", lepas);
    window.addEventListener("pointercancel", lepas);
  };

  const skalaRef = useRef(skala);
  useEffect(() => {
    skalaRef.current = skala;
  }, [skala]);

  const { dok, gambar, pilih, putar, durasi } = p;
  const s = skala;
  const diOutro = putar > durasi && Boolean(dok.outro.file);
  const tampil = (e: ElemenStudio) => {
    const r = rentangTampil(e.waktu, durasi);
    return !!r && putar >= r.mulai && putar <= r.selesai;
  };
  const kotak = (r: Rect) => ({ left: r.x * s, top: r.y * s, width: r.w * s, height: r.h * s });
  const berita = dok.elemen.find((e) => e.jenis === "berita" && !e.tersembunyi);
  const kategori = dok.elemen.find((e) => e.jenis === "kategori" && !e.tersembunyi);

  const rectPilih = pilih ? rectTarget(dok, pilih) : null;
  const elPilih = dok.elemen.find((e) => e.id === pilih) ?? null;
  const warnaPilih = pilih === PILIH_TEKS ? "#0f172a" : elPilih ? WARNA_JENIS[elPilih.jenis] : "#0f172a";

  return (
    <div ref={wadahRef} className="relative flex h-full min-h-0 w-full items-center justify-center" onPointerDown={() => p.onPilih(null)}>
      <div
        className="relative select-none overflow-hidden rounded-md bg-[#334155] shadow-[0_10px_30px_rgba(15,23,42,.25)]"
        style={{ width: LEBAR_KANVAS * s, height: TINGGI_KANVAS * s }}
        role="application"
        aria-label="Kanvas template 9:16. Seret elemen untuk memindah, tarik pegangan untuk mengubah ukuran."
      >
        {/* video sumber */}
        {p.contohLebar ? (
          <div className="absolute inset-0 bg-black">
            <div className="absolute left-0 right-0 flex items-center justify-center bg-[#334155]" style={{ top: (TINGGI_KANVAS - 405) / 2 * s, height: 405 * s }}>
              <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">VIDEO SUMBER 16:9</span>
            </div>
          </div>
        ) : (
          <span className="absolute inset-x-0 top-[34%] text-center font-mono text-[11px] font-semibold tracking-wider text-slate-300">VIDEO SUMBER</span>
        )}

        {/* lapisan gambar, urut bawah -> atas */}
        {dok.elemen.map((e) => {
          if (e.tersembunyi || !e.file) return null;
          const url = gambar[e.file];
          const nampak = tampil(e);
          return (
            <div
              key={e.id}
              onPointerDown={(ev) => mulaiSeret(ev, e.id, "geser")}
              className={cn("absolute touch-none", pilih === e.id ? "cursor-move" : "cursor-pointer")}
              style={{ ...kotak(e.rect), opacity: (nampak ? 1 : 0.22) * e.opacity }}
              title={namaElemen(e)}
            >
              {url ? (
                <img src={url} alt="" draggable={false} className="pointer-events-none h-full w-full" style={{ objectFit: "fill" }} />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/20 text-[10px] font-semibold text-white">memuat…</div>
              )}
            </div>
          );
        })}

        {/* tulisan berita & kategori: selalu paling depan (sama dengan perender) */}
        {berita?.teks && (
          <div
            onPointerDown={(ev) => mulaiSeret(ev, PILIH_TEKS, "geser")}
            className="absolute touch-none cursor-move overflow-hidden border border-dashed border-white/70"
            style={{ ...kotak(berita.teks), opacity: tampil(berita) ? 1 : 0.25 }}
            title="Area tulisan berita"
          >
            <p
              className="m-0 font-extrabold leading-[1.15]"
              style={{
                fontSize: Math.max(6, 38 * s),
                color: dok.teks_warna === "black" ? "#0f172a" : "#ffffff",
                textAlign: dok.rata === "justify" ? "justify" : dok.rata,
                padding: 4 * s,
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                textShadow: dok.teks_warna === "black" ? "none" : "0 1px 2px rgba(0,0,0,.4)",
              }}
            >
              <span style={{ color: "#d32d27" }}>VIRAL!</span> {CONTOH_HOOK.slice(7)}
            </p>
          </div>
        )}
        {kategori && (
          <div
            onPointerDown={(ev) => mulaiSeret(ev, kategori.id, "geser")}
            className="absolute flex touch-none cursor-move items-center justify-center border border-dashed border-orange-300 bg-black/25"
            style={{ ...kotak(kategori.rect), opacity: tampil(kategori) ? 1 : 0.25 }}
            title="Kotak kategori (tulisan kategori tiap video)"
          >
            <span className="font-extrabold text-white" style={{ fontSize: Math.max(6, kategori.rect.h * 0.5 * s) }}>
              POLITIK
            </span>
          </div>
        )}

        {/* outro */}
        {diOutro && dok.outro.file && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#6d28d9]">
            {gambar[dok.outro.file] && (
              <img src={gambar[dok.outro.file]} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            <span className="relative rounded-md bg-black/50 px-2 py-1 text-[12px] font-extrabold text-white">OUTRO</span>
          </div>
        )}

        {/* area aman Reels/TikTok */}
        {p.areaAman && !diOutro && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded border border-dashed border-white/50"
            style={{ left: 40 * s, top: 130 * s, width: 560 * s, height: 860 * s }}
          />
        )}

        {/* garis bantu aktif */}
        {garisAktif.map((g, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute z-40 bg-pink-400"
            style={g.arah === "v" ? { left: g.pos * s, top: 0, width: 1, height: TINGGI_KANVAS * s } : { top: g.pos * s, left: 0, height: 1, width: LEBAR_KANVAS * s }}
          />
        ))}

        {/* bingkai & pegangan elemen terpilih */}
        {rectPilih && !diOutro && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute z-20 outline outline-2"
              style={{ ...kotak(rectPilih), outlineColor: warnaPilih }}
            />
            {[...PEGANGAN_SUDUT, ...PEGANGAN_SISI].map((h) => {
              const fx = h.includes("w") ? 0 : h.includes("e") ? 1 : 0.5;
              const fy = h.includes("n") ? 0 : h.includes("s") ? 1 : 0.5;
              const sudut = h.length === 2;
              const ukuran = sudut ? 14 : 12;
              return (
                <span
                  key={h}
                  role="presentation"
                  onPointerDown={(e) => mulaiSeret(e, pilih!, h)}
                  className="absolute z-30 touch-none rounded-[3px] border-2 bg-white"
                  style={{
                    left: rectPilih.x * s + rectPilih.w * s * fx - ukuran / 2,
                    top: rectPilih.y * s + rectPilih.h * s * fy - ukuran / 2,
                    width: ukuran,
                    height: ukuran,
                    borderColor: warnaPilih,
                    cursor: KURSOR[h],
                  }}
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
