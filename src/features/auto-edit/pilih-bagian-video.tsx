"use client";

// ============================================================
// PilihBagianVideo (14 Okt 2026) — pilih detik mulai–akhir sebelum Auto Edit, ala CapCut.
//
// Ujung kuning di garis waktu DISERET ke kiri/kanan (mouse & sentuh, pointer capture) untuk memendekkan
// atau memanjangkan; panah kiri/kanan menggeser 0,1 dtk (Shift = 1 dtk). Ketuk/seret garis waktu =
// pindah posisi putar. Pratinjau berbentuk hasil 9:16: video lebar tampil utuh dengan atas-bawah hitam
// (sama seperti mesin, lihat mesin-video/perintah.filterBadan), video potret penuh.
// Sumber unggahan: <video> lokal (blob:) + gambar garis waktu diambil di peramban.
// Sumber link: gambar sampul saja (videonya baru diunduh mesin saat render).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  adalahLandscape,
  formatDurasi,
  formatWaktu,
  geserUjung,
  nilaiRentang,
  type RentangVideo,
} from "@/lib/potong-video";

const JUMLAH_BINGKAI = 10;

type Ujung = "mulai" | "akhir";

/** Ambil beberapa gambar kecil dari video lokal untuk garis waktu. Gagal = daftar kosong. */
async function ambilBingkai(src: string, durasi: number, batal: () => boolean): Promise<string[]> {
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.playsInline = true;
  v.src = src;
  const tunggu = (ev: string) =>
    new Promise<void>((ok, gagal) => {
      const t = window.setTimeout(() => gagal(new Error("waktu habis")), 8000);
      v.addEventListener(ev, () => {
        window.clearTimeout(t);
        ok();
      }, { once: true });
      v.addEventListener("error", () => {
        window.clearTimeout(t);
        gagal(new Error("video"));
      }, { once: true });
    });
  try {
    if (v.readyState < 1) await tunggu("loadedmetadata");
    const tinggi = 72;
    const lebar = Math.max(40, Math.round((v.videoWidth / Math.max(1, v.videoHeight)) * tinggi));
    const kanvas = document.createElement("canvas");
    kanvas.width = lebar;
    kanvas.height = tinggi;
    const ctx = kanvas.getContext("2d");
    if (!ctx) return [];
    const hasil: string[] = [];
    for (let i = 0; i < JUMLAH_BINGKAI; i++) {
      if (batal()) return [];
      v.currentTime = Math.min(durasi - 0.05, ((i + 0.5) * durasi) / JUMLAH_BINGKAI);
      await tunggu("seeked");
      ctx.drawImage(v, 0, 0, lebar, tinggi);
      hasil.push(kanvas.toDataURL("image/jpeg", 0.6));
    }
    return hasil;
  } catch {
    return [];
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}

export function PilihBagianVideo({
  durasi,
  maks,
  nilai,
  onUbah,
  srcVideo,
  gambar,
  lebarSumber,
  tinggiSumber,
  className,
}: {
  /** Durasi sumber (detik). */
  durasi: number;
  /** Batas durasi hasil (detik). */
  maks: number;
  nilai: RentangVideo;
  onUbah: (r: RentangVideo) => void;
  /** URL video lokal (blob:) untuk sumber unggahan. */
  srcVideo?: string | null;
  /** Gambar sampul (sumber link). */
  gambar?: string | null;
  /** Ukuran sumber bila sudah diketahui (link); unggahan dibaca dari <video>. */
  lebarSumber?: number;
  tinggiSumber?: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trekRef = useRef<HTMLDivElement>(null);
  const tarikRef = useRef<{ ujung: Ujung | "kepala"; selisih: number } | null>(null);
  const nilaiRef = useRef(nilai);
  const [kepala, setKepala] = useState(nilai.mulai);
  const [seret, setSeret] = useState<Ujung | null>(null);
  const [aktif, setAktif] = useState<Ujung>("mulai");
  const [main, setMain] = useState(false);
  const [bingkai, setBingkai] = useState<string[]>([]);
  const [ukuran, setUkuran] = useState<{ w: number; h: number }>({ w: lebarSumber ?? 0, h: tinggiSumber ?? 0 });

  useEffect(() => {
    nilaiRef.current = nilai;
  }, [nilai]);

  // Gambar garis waktu dari video lokal (async; dibatalkan bila sumber berganti).
  useEffect(() => {
    if (!srcVideo || !(durasi > 0)) return undefined;
    let batal = false;
    void ambilBingkai(srcVideo, durasi, () => batal).then((b) => {
      if (!batal) setBingkai(b);
    });
    return () => {
      batal = true;
    };
  }, [srcVideo, durasi]);

  const lebarW = srcVideo ? ukuran.w : (lebarSumber ?? 0);
  const tinggiW = srcVideo ? ukuran.h : (tinggiSumber ?? 0);
  const landscape = adalahLandscape(lebarW, tinggiW);
  const keadaan = nilaiRentang(nilai, durasi, maks);
  const persen = (t: number) => `${Math.max(0, Math.min(100, (t / Math.max(0.1, durasi)) * 100))}%`;

  const lompat = useCallback((t: number) => {
    const v = videoRef.current;
    if (v && Number.isFinite(t)) v.currentTime = t;
    setKepala(t);
  }, []);

  const detikDari = (clientX: number) => {
    const el = trekRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return ((clientX - r.left) / Math.max(1, r.width)) * durasi;
  };

  const ubahUjung = (ujung: Ujung, t: number) => {
    const baru = geserUjung(nilaiRef.current, ujung, t, durasi);
    nilaiRef.current = baru;
    onUbah(baru);
    lompat(ujung === "mulai" ? baru.mulai : baru.akhir);
  };

  const mulaiTarik = (ujung: Ujung) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // perangkat lama: tetap jalan tanpa capture
    }
    videoRef.current?.pause();
    const nilaiSekarang = ujung === "mulai" ? nilaiRef.current.mulai : nilaiRef.current.akhir;
    tarikRef.current = { ujung, selisih: nilaiSekarang - detikDari(e.clientX) };
    setSeret(ujung);
    setAktif(ujung);
    lompat(nilaiSekarang);
  };

  const gerak = (e: React.PointerEvent) => {
    const t = tarikRef.current;
    if (!t) return;
    const detik = detikDari(e.clientX) + t.selisih;
    if (t.ujung === "kepala") lompat(Math.max(0, Math.min(durasi, detik)));
    else ubahUjung(t.ujung, detik);
  };

  const lepas = () => {
    tarikRef.current = null;
    setSeret(null);
  };

  const mulaiGeserKepala = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // abaikan
    }
    tarikRef.current = { ujung: "kepala", selisih: 0 };
    lompat(Math.max(0, Math.min(durasi, detikDari(e.clientX))));
  };

  const tombolUjung = (ujung: Ujung) => (e: React.KeyboardEvent) => {
    const arah = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!arah) return;
    e.preventDefault();
    setAktif(ujung);
    const r = nilaiRef.current;
    ubahUjung(ujung, (ujung === "mulai" ? r.mulai : r.akhir) + arah * (e.shiftKey ? 1 : 0.1));
  };

  const geserHalus = (delta: number) => {
    const r = nilaiRef.current;
    ubahUjung(aktif, (aktif === "mulai" ? r.mulai : r.akhir) + delta);
  };

  const putar = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) {
      v.pause();
      return;
    }
    const r = nilaiRef.current;
    if (v.currentTime < r.mulai || v.currentTime >= r.akhir - 0.05) v.currentTime = r.mulai;
    void v.play().catch(() => setMain(false));
  };

  const tombolHalus =
    "min-h-10 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 text-[12px] font-bold text-[#EEF2EE] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F0B429]";
  const warnaPilihan = keadaan.sah ? "#F0B429" : "#F87171";
  const diLuar = kepala < nilai.mulai - 0.05 || kepala > nilai.akhir + 0.05;

  return (
    <section aria-label="Pilih bagian video" className={cn("rounded-2xl bg-[#0E110F] p-3 text-[#EEF2EE]", className)} data-tur="pilih-bagian-video">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-extrabold">Pilih bagian video</h3>
        <span className="font-mono text-[11.5px] font-bold" style={{ color: keadaan.sah ? "#7FE0A0" : "#FCA5A5" }}>
          {formatDurasi(keadaan.durasi)} / maks {formatDurasi(maks)}
        </span>
      </div>

      <div className="mt-2 flex justify-center">
        <div className="relative h-[300px] w-[169px] overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
          {srcVideo ? (
            <video
              ref={videoRef}
              src={srcVideo}
              playsInline
              preload="metadata"
              className={cn("h-full w-full", landscape || !ukuran.w ? "object-contain" : "object-cover")}
              onLoadedMetadata={(e) => {
                setUkuran({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight });
                e.currentTarget.currentTime = nilaiRef.current.mulai;
              }}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (!tarikRef.current) setKepala(v.currentTime);
                if (!v.paused && v.currentTime >= nilaiRef.current.akhir) {
                  v.pause();
                  v.currentTime = nilaiRef.current.mulai;
                }
              }}
              onPlay={() => setMain(true)}
              onPause={() => setMain(false)}
            />
          ) : gambar ? (
            <img src={gambar} alt="Sampul video" className={cn("h-full w-full", landscape ? "object-contain" : "object-cover")} />
          ) : null}
          <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/15 px-2 py-0.5 text-[9.5px] font-bold">
            Hasil 9:16{landscape ? " · bingkai hitam" : ""}
          </span>
          {srcVideo && diLuar && (
            <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold text-[#FCD34D]">
              Bagian ini tidak dipakai
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11.5px] text-[#C9D3CC]">
          {formatWaktu(kepala)} <span className="text-[#9AA89F]">/ {formatWaktu(durasi)}</span>
        </span>
        {srcVideo && (
          <button
            type="button"
            onClick={putar}
            aria-label={main ? "Jeda" : "Putar bagian terpilih"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EEF2EE] text-[#0E110F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F0B429]"
          >
            {main ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        )}
        <span className="font-mono text-[11.5px] text-[#C9D3CC]">
          {formatWaktu(nilai.mulai)} – {formatWaktu(nilai.akhir)}
        </span>
      </div>

      {/* Garis waktu: ketuk/seret latar = posisi putar; ujung kuning = awal/akhir. */}
      <div
        ref={trekRef}
        onPointerDown={mulaiGeserKepala}
        onPointerMove={gerak}
        onPointerUp={lepas}
        onPointerCancel={lepas}
        className="relative mx-3 mt-8 h-16 touch-none select-none"
      >
        <div className="absolute inset-0 grid grid-cols-10 gap-[2px] overflow-hidden rounded-lg bg-white/10">
          {Array.from({ length: JUMLAH_BINGKAI }, (_, i) => {
            const src = bingkai[i] ?? (srcVideo ? null : gambar);
            return src ? (
              <img key={i} src={src} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <span key={i} className="bg-white/[0.08]" />
            );
          })}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 rounded-l-lg bg-[#0E110F]/75" style={{ width: persen(nilai.mulai) }} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 rounded-r-lg bg-[#0E110F]/75" style={{ width: `calc(100% - ${persen(nilai.akhir)})` }} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-y-[3px] border-y-[3px]"
          style={{ left: persen(nilai.mulai), width: `calc(${persen(nilai.akhir)} - ${persen(nilai.mulai)})`, borderColor: warnaPilihan }}
        />
        <div aria-hidden="true" className="pointer-events-none absolute -inset-y-2 z-[2] w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.6)]" style={{ left: persen(kepala) }} />
        {(["mulai", "akhir"] as const).map((u) => (
          <button
            key={u}
            type="button"
            aria-label={`${u === "mulai" ? "Awal" : "Akhir"} potongan ${formatWaktu(nilai[u])}. Seret ke kiri atau kanan, atau tekan panah.`}
            onPointerDown={mulaiTarik(u)}
            onKeyDown={tombolUjung(u)}
            onFocus={() => setAktif(u)}
            className={cn(
              "absolute -inset-y-[3px] z-[3] flex w-[22px] cursor-ew-resize touch-none items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              u === "mulai" ? "-translate-x-full rounded-l-lg" : "rounded-r-lg",
            )}
            style={{ left: persen(nilai[u]), background: warnaPilihan }}
          >
            <span aria-hidden="true" className="h-6 w-[3px] rounded bg-[#1A1406]" />
          </button>
        ))}
        {seret && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-8 z-[4] -translate-x-1/2 whitespace-nowrap rounded-md bg-[#F0B429] px-2 py-0.5 font-mono text-[11px] font-bold text-[#1A1406]"
            style={{ left: persen(nilai[seret]) }}
          >
            {formatWaktu(nilai[seret])} · {formatDurasi(keadaan.durasi)}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-bold text-[#9AA89F]">Geser {aktif === "mulai" ? "awal" : "akhir"}:</span>
        <button type="button" onClick={() => geserHalus(-1)} className={tombolHalus}>−1</button>
        <button type="button" onClick={() => geserHalus(-0.1)} className={tombolHalus}>−0,1</button>
        <button type="button" onClick={() => ubahUjung(aktif, kepala)} className={cn(tombolHalus, "border-[#F0B429] text-[#FCD34D]")}>
          Di garis putih
        </button>
        <button type="button" onClick={() => geserHalus(0.1)} className={tombolHalus}>+0,1</button>
        <button type="button" onClick={() => geserHalus(1)} className={tombolHalus}>+1</button>
      </div>

      <p className={cn("mt-2 text-[11px] leading-snug", keadaan.sah ? "text-[#9AA89F]" : "text-[#FCA5A5]")} role={keadaan.sah ? undefined : "alert"}>
        {keadaan.sah
          ? `Seret ujung kuning untuk memendekkan atau memanjangkan.${landscape ? " Video lebar ditaruh utuh di tengah, atas-bawah hitam." : ""}`
          : keadaan.pesan}
      </p>
    </section>
  );
}
