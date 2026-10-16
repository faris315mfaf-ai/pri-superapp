"use client";

// ============================================================
// STUDIO TEMPLATE — timeline waktu tampil (16 Okt 2026). Batang tiap elemen
// diseret seperti Canva video: ujung = ubah durasi, tengah = geser; menempel
// ke awal/akhir video, garis putar, ujung batang lain, dan kelipatan 0,5 dtk
// (Alt = bebas). Patokan awal/akhir dipasang otomatis (studio-model).
// Outro hanya bisa dipendekkan. Penggaris diseret = pindah garis putar.
// ============================================================

import { useEffect, useRef, type PointerEvent as PE } from "react";
import { DURASI_MIN, OUTRO_MIN, WARNA_JENIS, detikEfektif, rentangTampil, type DokStudio } from "@/mesin-video/studio-model";
import { cn } from "@/lib/utils";
import { PILIH_OUTRO, PILIH_TEKS } from "./kanvas-studio";
import { fmtDetik, fmtDurasi, namaElemen, seretWaktu, titikTimeline, ubahElemen, type ModeSeretWaktu } from "./studio-murni";

type Props = {
  dok: DokStudio;
  durasi: number;
  onDurasi: (d: number) => void;
  putar: number;
  onPutar: (t: number) => void;
  pilih: string | null;
  onPilih: (id: string | null) => void;
  mulaiUbah: () => void;
  ubah: (fn: (d: DokStudio) => DokStudio) => void;
  /** Panjang asli berkas outro (detik), null bila belum diketahui. */
  outroAsli: number | null;
  ringkas?: boolean;
};

const CONTOH_DURASI = [20, 40, 90] as const;

export function TimelineStudio(p: Props) {
  const propsRef = useRef(p);
  useEffect(() => {
    propsRef.current = p;
  });
  const { dok, durasi, putar } = p;
  const outro = dok.outro.file ? Math.min(p.outroAsli ?? Number.POSITIVE_INFINITY, dok.outro.durasi ?? p.outroAsli ?? 5) : 0;
  const total = durasi + outro;
  const pc = (t: number) => `${(Math.max(0, t) / total) * 100}%`;

  const lajurDari = (el: HTMLElement) => (el.closest("[data-lajur]") as HTMLElement | null)?.getBoundingClientRect() ?? null;

  const mulai = (e: PE<HTMLElement>, jenis: "putar" | "outro" | ModeSeretWaktu, id: string | null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = lajurDari(e.currentTarget);
    if (!rect) return;
    const awal = propsRef.current;
    const total0 = awal.durasi + outro;
    const dps = total0 / Math.max(1, rect.width);
    const el = id ? awal.dok.elemen.find((x) => x.id === id) : null;
    const x0 = e.clientX;
    const outro0 = outro;
    if (jenis !== "putar") awal.mulaiUbah();
    if (id) awal.onPilih(id);
    if (jenis === "outro") awal.onPilih(PILIH_OUTRO);
    const gerak = (ev: PointerEvent) => {
      const k = propsRef.current;
      if (jenis === "putar") {
        k.onPutar(Math.round(Math.max(0, Math.min(total0, (ev.clientX - rect.left) * dps)) * 10) / 10);
        return;
      }
      const dt = (ev.clientX - x0) * dps;
      if (jenis === "outro") {
        const asli = k.outroAsli ?? outro0;
        const d = Math.round(Math.max(OUTRO_MIN, Math.min(asli, outro0 + dt)) * 10) / 10;
        k.ubah((dok) => ({ ...dok, outro: { ...dok.outro, durasi: d >= asli - 0.05 ? null : d } }));
        return;
      }
      if (!el) return;
      const titik = titikTimeline(k.dok, el.id, k.durasi, k.putar);
      const waktu = seretWaktu(el.waktu, jenis, dt, k.durasi, titik, 8 * dps, ev.altKey);
      k.ubah((dok) => ubahElemen(dok, el.id, (x) => ({ ...x, waktu })));
    };
    if (jenis === "putar") gerak(e.nativeEvent);
    const lepas = () => {
      window.removeEventListener("pointermove", gerak);
      window.removeEventListener("pointerup", lepas);
      window.removeEventListener("pointercancel", lepas);
    };
    window.addEventListener("pointermove", gerak);
    window.addEventListener("pointerup", lepas);
    window.addEventListener("pointercancel", lepas);
  };

  const langkah = total > 60 ? 15 : total > 30 ? 10 : 5;
  const tanda: number[] = [];
  for (let t = 0; t <= total + 1e-6; t += langkah) tanda.push(t);
  const urutTampil = [...dok.elemen].reverse();
  const tinggiBatang = p.ringkas ? "h-7" : "h-6";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-[13px] font-extrabold text-teks-utama">Timeline</span>
        <span className="text-[11.5px] text-teks-sekunder">
          Contoh video {fmtDetik(durasi).replace(/,0$/, "")}
          {outro > 0 ? ` + outro ${fmtDurasi(outro)}` : ""} · tarik ujung = durasi · seret tengah = geser
        </span>
        <span className="flex-1" />
        <div role="group" aria-label="Panjang contoh video" className="flex gap-1">
          {CONTOH_DURASI.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={durasi === d}
              onClick={() => p.onDurasi(d)}
              className={cn(
                "btn-tekan h-8 rounded-lg border px-2.5 font-mono text-[11.5px] font-semibold",
                durasi === d ? "border-teks-utama bg-teks-utama text-app-bg" : "border-black/10 text-teks-utama dark:border-white/15",
              )}
            >
              {fmtDetik(d).replace(/,0$/, "")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 items-center gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: p.ringkas ? "88px minmax(0,1fr)" : "128px minmax(0,1fr)" }}>
        <span className="text-[11px] text-teks-sekunder">Detik</span>
        <div
          data-lajur="1"
          role="slider"
          tabIndex={0}
          aria-label="Garis putar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={putar}
          aria-valuetext={fmtDetik(putar)}
          onPointerDown={(e) => mulai(e, "putar", null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") p.onPutar(Math.min(total, Math.round((putar + 0.5) * 10) / 10));
            if (e.key === "ArrowLeft") p.onPutar(Math.max(0, Math.round((putar - 0.5) * 10) / 10));
          }}
          className="relative h-6 cursor-ew-resize touch-none rounded-md bg-black/5 dark:bg-white/10"
        >
          {tanda.map((t) => (
            <span key={t} className="pointer-events-none absolute top-1 font-mono text-[10px] text-teks-sekunder" style={{ left: pc(t), transform: t === 0 ? "translateX(2px)" : "translateX(-50%)" }}>
              {fmtDetik(t).replace(/,0$/, "")}
            </span>
          ))}
          <span className="pointer-events-none absolute -bottom-1 -top-1 z-20 w-0.5 bg-pri" style={{ left: pc(putar) }} />
          <span className="pointer-events-none absolute -top-1.5 z-20 h-2.5 w-2.5 -translate-x-1 rounded-full bg-pri" style={{ left: pc(putar) }} />
        </div>

        <span className="text-[12px] font-semibold text-teks-utama">Klip</span>
        <div data-lajur="1" className={cn("relative", tinggiBatang)}>
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-1 -top-1 z-10 w-px bg-pri/70" style={{ left: pc(putar) }} />
          <div className="absolute inset-y-0 left-0 flex items-center rounded-md bg-[#334155] pl-2 text-[10.5px] font-bold text-white" style={{ width: `calc(${pc(durasi)} - 2px)` }}>
            <span className="truncate">Video sumber (panjang ikut berita)</span>
          </div>
          {outro > 0 && (
            <div
              onPointerDown={() => p.onPilih(PILIH_OUTRO)}
              className={cn("absolute inset-y-0 flex items-center rounded-md bg-[#6d28d9] pl-1.5 text-[10.5px] font-bold text-white", p.pilih === PILIH_OUTRO && "outline outline-2 outline-offset-1 outline-teks-utama")}
              style={{ left: pc(durasi), width: pc(outro) }}
            >
              <span className="truncate">Outro</span>
              <span
                role="slider"
                aria-label="Pendekkan outro"
                aria-valuenow={outro}
                tabIndex={-1}
                onPointerDown={(e) => mulai(e, "outro", null)}
                className="absolute -right-1 -top-1 h-[calc(100%+8px)] w-3 cursor-ew-resize touch-none rounded border-2 border-[#6d28d9] bg-white"
              />
            </div>
          )}
        </div>

        {urutTampil.map((el) => {
          const r = rentangTampil(el.waktu, durasi);
          const m = Math.max(0, detikEfektif(el.waktu.mulai, durasi));
          const s = Math.min(durasi, detikEfektif(el.waktu.selesai, durasi));
          const dipilih = p.pilih === el.id || (el.jenis === "berita" && p.pilih === PILIH_TEKS);
          const warna = r ? WARNA_JENIS[el.jenis] : "#94a3b8";
          return (
            <FragmenLajur key={el.id}>
              <button
                type="button"
                onClick={() => p.onPilih(el.id)}
                className={cn("truncate text-left text-[12px]", dipilih ? "font-extrabold" : "font-semibold text-teks-utama", el.tersembunyi && "line-through opacity-60")}
                style={dipilih ? { color: WARNA_JENIS[el.jenis] } : undefined}
              >
                {namaElemen(el)}
              </button>
              <div data-lajur="1" className={cn("relative rounded-md bg-black/[.03] dark:bg-white/[.05]", tinggiBatang)}>
                <span aria-hidden="true" className="pointer-events-none absolute -bottom-1 -top-1 z-10 w-px bg-pri/70" style={{ left: pc(putar) }} />
                <div
                  onPointerDown={(e) => mulai(e, "tengah", el.id)}
                  className={cn("absolute inset-y-0.5 flex cursor-grab touch-none items-center overflow-hidden rounded-md text-[10.5px] font-semibold text-white", dipilih && "outline outline-2 outline-offset-1 outline-teks-utama")}
                  style={{ left: pc(m), width: pc(Math.max(DURASI_MIN, s - m)), background: warna }}
                  title={`${fmtDetik(m)} → ${fmtDetik(s)}`}
                >
                  <span className="pointer-events-none truncate px-3">{r ? fmtDurasi(r.selesai - r.mulai) : "tidak tampil"}</span>
                  <span
                    aria-label="Ubah awal"
                    onPointerDown={(e) => mulai(e, "kiri", el.id)}
                    className="absolute -left-0.5 -top-1 h-[calc(100%+8px)] w-3 cursor-ew-resize touch-none rounded border-2 bg-white"
                    style={{ borderColor: warna }}
                  />
                  <span
                    aria-label="Ubah akhir"
                    onPointerDown={(e) => mulai(e, "kanan", el.id)}
                    className="absolute -right-0.5 -top-1 h-[calc(100%+8px)] w-3 cursor-ew-resize touch-none rounded border-2 bg-white"
                    style={{ borderColor: warna }}
                  />
                </div>
              </div>
            </FragmenLajur>
          );
        })}
      </div>
    </div>
  );
}

function FragmenLajur({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
