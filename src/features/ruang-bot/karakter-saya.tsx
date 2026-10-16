"use client";

// ============================================================
// KARAKTER SAYA (16 Okt 2026) — sub tab Ruang Bot: pengguna memilih rupa
// karakternya dari aset pixel art (public/karakter/v1). Pratinjau 4 arah &
// 4 pose, preset, kulit, rambut + warna, atasan + warna, celana & sepatu.
// Uji coba bertahap: hanya akun Faris (bolehKarakterSaya).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dices, Pause, Play, RotateCcw, RotateCw, UserRound } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  GAYA_RAMBUT,
  KULIT,
  MODEL_ATASAN,
  PRESET,
  WARNA_ATASAN,
  WARNA_CELANA,
  WARNA_RAMBUT,
  WARNA_SEPATU,
  samaKonfig,
  type KonfigKarakter,
  type Warna,
} from "@/lib/karakter-murni";
import { cn } from "@/lib/utils";
import { getKarakterSaya, simpanKarakterSaya, type KarakterSaya } from "@/services";
import { URUTAN_ARAH, infoAnimasi, rakitFrame, rakitPotret, siapkanKarakter, type AnimKarakter, type ArahKarakter } from "./karakter-sprite";

type Kategori = "preset" | "kulit" | "rambut" | "atasan" | "bawah";

const KATEGORI: { kunci: Kategori; label: string }[] = [
  { kunci: "preset", label: "Preset" },
  { kunci: "kulit", label: "Kulit" },
  { kunci: "rambut", label: "Rambut" },
  { kunci: "atasan", label: "Atasan" },
  { kunci: "bawah", label: "Celana & sepatu" },
];

const POSE: { kunci: AnimKarakter; label: string }[] = [
  { kunci: "idle", label: "Diam" },
  { kunci: "walk", label: "Jalan" },
  { kunci: "sit", label: "Duduk" },
  { kunci: "work", label: "Kerja" },
];

const NAMA_ARAH: Record<ArahKarakter, string> = { NW: "Belakang kiri", NE: "Belakang kanan", SE: "Depan kanan", SW: "Depan kiri" };
const PUTAR: ArahKarakter[] = ["SE", "SW", "NW", "NE"];
const SUDUT_PANAH: Record<ArahKarakter, number> = { NW: 315, NE: 45, SE: 135, SW: 225 };

const namaWarna = (daftar: readonly Warna[], hex: string) => daftar.find(([h]) => h === hex)?.[1] ?? hex;

/** Kanvas kecil statis: potret kepala atau badan penuh pose diam. */
function GambarRupa({ konfig, potret, skala, label }: { konfig: KonfigKarakter; potret?: boolean; skala: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        await siapkanKarakter(konfig);
        const sumber = potret ? await rakitPotret(konfig) : await rakitFrame(konfig, "idle", "SE", 0);
        const c = ref.current;
        if (batal || !c) return;
        c.width = sumber.width * skala;
        c.height = sumber.height * skala;
        const ctx = c.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(sumber, 0, 0, c.width, c.height);
      } catch {
        /* aset gagal dimuat: biarkan kosong */
      }
    })();
    return () => { batal = true; };
  }, [konfig, potret, skala]);
  return <canvas ref={ref} role="img" aria-label={label} className="block [image-rendering:pixelated]" />;
}

/** Panggung pratinjau beranimasi. */
function Panggung({ konfig, anim, arah, main, skala }: { konfig: KonfigKarakter; anim: AnimKarakter; arah: ArahKarakter; main: boolean; skala: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let batal = false;
    let raf = 0;
    let sibuk = false;
    let terakhir = -1;
    const mulai = performance.now();
    (async () => {
      await siapkanKarakter(konfig);
      const info = await infoAnimasi(anim);
      const gambar = async (t: number) => {
        const frame = main ? Math.floor(((t - mulai) / 1000) * info.fps) % info.frames : 0;
        if (frame !== terakhir && !sibuk) {
          sibuk = true;
          try {
            const sumber = await rakitFrame(konfig, anim, arah, frame);
            const c = ref.current;
            if (!batal && c) {
              const ctx = c.getContext("2d")!;
              ctx.imageSmoothingEnabled = false;
              ctx.clearRect(0, 0, c.width, c.height);
              ctx.drawImage(sumber, 0, 0, c.width, c.height);
              terakhir = frame;
            }
          } finally {
            sibuk = false;
          }
        }
        if (!batal && main) raf = requestAnimationFrame(gambar);
      };
      if (!batal) raf = requestAnimationFrame(gambar);
    })().catch(() => {});
    return () => { batal = true; cancelAnimationFrame(raf); };
  }, [konfig, anim, arah, main]);
  return <canvas ref={ref} width={64 * skala} height={96 * skala} role="img" aria-label="Pratinjau karakter Anda" className="block [image-rendering:pixelated]" />;
}

function Swatch({ daftar, nilai, onPilih, judul }: { daftar: readonly Warna[]; nilai: string; onPilih: (hex: string) => void; judul: string }) {
  return (
    <div role="group" aria-label={judul} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-teks-sekunder">{judul}</span>
        <span className="text-[12.5px] text-teks-utama">{namaWarna(daftar, nilai)}</span>
      </div>
      <div className="flex flex-wrap gap-0.5">
        {daftar.map(([hex, nama]) => {
          const aktif = hex === nilai;
          return (
            <button
              key={hex}
              type="button"
              aria-label={nama}
              aria-pressed={aktif}
              title={nama}
              onClick={() => onPilih(hex)}
              className="btn-tekan flex h-11 w-11 items-center justify-center"
            >
              <span
                className="h-[30px] w-[30px] rounded-full"
                style={{ background: hex, boxShadow: aktif ? "0 0 0 2px #fff, 0 0 0 4px #dc2626" : "inset 0 0 0 1px rgba(15,23,42,.18)" }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Ubin({ aktif, label, onPilih, children }: { aktif: boolean; label: string; onPilih: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={aktif}
      onClick={onPilih}
      className={cn(
        "btn-tekan relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border p-1.5 pb-2 text-teks-utama",
        aktif ? "border-2 border-pri bg-pri/5" : "border-black/10 bg-white/70 dark:border-white/10 dark:bg-white/5",
      )}
    >
      <span className="flex h-[88px] w-full items-center justify-center overflow-hidden rounded-xl bg-[#e8edf3] dark:bg-white/10">{children}</span>
      <span className="text-center text-[12px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

export function KarakterSayaPanel({ ringkas = false }: { ringkas?: boolean }) {
  const [data, setData] = useState<KarakterSaya | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [draf, setDraf] = useState<KonfigKarakter | null>(null);
  const [kat, setKat] = useState<Kategori>("rambut");
  const [arah, setArah] = useState<ArahKarakter>("SE");
  const [anim, setAnim] = useState<AnimKarakter>("walk");
  const [main, setMain] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);

  const [percobaan, setPercobaan] = useState(0);
  useEffect(() => {
    let batal = false;
    getKarakterSaya()
      .then((d) => {
        if (batal) return;
        setGalat(null);
        setData(d);
        setDraf(d.konfig);
      })
      .catch((e: unknown) => {
        if (!batal) setGalat(e instanceof Error ? e.message : "Gagal memuat karakter.");
      });
    return () => { batal = true; };
  }, [percobaan]);
  const muat = useCallback(() => {
    setGalat(null);
    setPercobaan((n) => n + 1);
  }, []);

  const berubah = !!data && !!draf && !samaKonfig(data.konfig, draf);
  const ubah = (sebagian: Partial<KonfigKarakter>) => setDraf((d) => (d ? { ...d, ...sebagian } : d));

  const simpan = async () => {
    if (!draf) return;
    setMenyimpan(true);
    try {
      const d = await simpanKarakterSaya(draf);
      setData(d);
      setDraf(d.konfig);
      toast("sukses", "Karakter tersimpan", "Rupa baru Anda tampil di Ruang Bot.");
    } catch (e) {
      toast("error", "Karakter gagal disimpan", e instanceof Error ? e.message : "");
    } finally {
      setMenyimpan(false);
    }
  };

  const acak = () => {
    const pil = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;
    setDraf({
      v: 1,
      kulit: pil(KULIT)[0],
      rambut: Math.floor(Math.random() * GAYA_RAMBUT.length),
      warnaRambut: pil(WARNA_RAMBUT)[0],
      atasan: Math.floor(Math.random() * MODEL_ATASAN.length),
      warnaAtasan: pil(WARNA_ATASAN)[0],
      warnaCelana: pil(WARNA_CELANA)[0],
      warnaSepatu: pil(WARNA_SEPATU)[0],
    });
  };

  const presetAktif = useMemo(() => (draf ? PRESET.find((p) => samaKonfig(p.konfig, draf)) : undefined), [draf]);

  if (galat) {
    return (
      <GlassCard className="p-4">
        <EmptyState ikon={UserRound} judul="Karakter Saya belum bisa dibuka" keterangan={galat} labelAksi="Coba lagi" onAksi={muat} />
      </GlassCard>
    );
  }
  if (!data || !draf) {
    return (
      <div role="status" aria-busy="true" className="flex flex-wrap gap-4">
        <span className="sr-only">Memuat karakter…</span>
        <GlassSkeleton className="h-[460px] min-w-0 flex-[1_1_320px] rounded-2xl" />
        <GlassSkeleton className="h-[460px] min-w-0 flex-[999_1_520px] rounded-2xl" />
      </div>
    );
  }

  const skalaPanggung = ringkas ? 2 : 3;
  const geser = (n: number) => setArah((a) => PUTAR[(PUTAR.indexOf(a) + n + 4) % 4]!);
  const nilaiKat: Record<Kategori, string> = {
    preset: presetAktif?.nama ?? "Kustom",
    kulit: namaWarna(KULIT, draf.kulit),
    rambut: `${GAYA_RAMBUT[draf.rambut]} · ${namaWarna(WARNA_RAMBUT, draf.warnaRambut)}`,
    atasan: MODEL_ATASAN[draf.atasan] ?? "",
    bawah: `${namaWarna(WARNA_CELANA, draf.warnaCelana)} · ${namaWarna(WARNA_SEPATU, draf.warnaSepatu)}`,
  };
  const hijab = draf.rambut === 19 || draf.rambut === 20;

  return (
    <div className="flex flex-wrap items-start gap-4">
      {/* Pratinjau */}
      <GlassCard className={cn("flex min-w-0 flex-[1_1_320px] flex-col gap-3 p-3", !ringkas && "max-w-[380px]")}>
        <div className="relative flex items-end justify-center overflow-hidden rounded-2xl bg-[#1e1a26]" style={{ height: ringkas ? 250 : 340 }}>
          <div aria-hidden className="absolute inset-x-0 top-0 border-b-[3px] border-[#3a3145] bg-[#2a2433]" style={{ height: ringkas ? 100 : 140 }} />
          <div
            aria-hidden
            className="absolute left-1/2 -translate-x-1/2 bg-[#7a5238] [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]"
            style={{ width: ringkas ? 210 : 260, height: ringkas ? 105 : 130, bottom: ringkas ? 20 : 26 }}
          />
          <span className="absolute left-2.5 top-2.5 rounded-lg border border-white/10 bg-[rgba(14,11,20,.82)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#f4efe8]">
            Hadap {NAMA_ARAH[arah].toLowerCase()} · {arah}
          </span>
          <div className="relative" style={{ marginBottom: ringkas ? 72 - 32 : 86 - 48 }}>
            <Panggung konfig={draf} anim={anim} arah={arah} main={main} skala={skalaPanggung} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <button type="button" aria-label="Putar ke kiri" onClick={() => geser(-1)} className="btn-tekan flex h-11 w-11 items-center justify-center rounded-xl border border-black/10 bg-white/80 text-teks-utama dark:border-white/10 dark:bg-white/10">
            <RotateCcw size={18} />
          </button>
          <div role="group" aria-label="Arah hadap" className="flex gap-1 rounded-2xl bg-slate-400/20 p-1">
            {URUTAN_ARAH.map((a) => (
              <button
                key={a}
                type="button"
                aria-label={NAMA_ARAH[a]}
                aria-pressed={arah === a}
                title={NAMA_ARAH[a]}
                onClick={() => setArah(a)}
                className={cn("btn-tekan flex h-9 w-11 items-center justify-center rounded-xl", arah === a ? "bg-white text-teks-utama shadow-sm dark:bg-white/20" : "text-teks-sekunder")}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: `rotate(${SUDUT_PANAH[a]}deg)` }}>
                  <path d="M8 13V3" />
                  <path d="M4 7l4-4 4 4" />
                </svg>
              </button>
            ))}
          </div>
          <button type="button" aria-label="Putar ke kanan" onClick={() => geser(1)} className="btn-tekan flex h-11 w-11 items-center justify-center rounded-xl border border-black/10 bg-white/80 text-teks-utama dark:border-white/10 dark:bg-white/10">
            <RotateCw size={18} />
          </button>
        </div>

        <div role="group" aria-label="Pose" className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-400/20 p-1">
          {POSE.map((p) => (
            <button
              key={p.kunci}
              type="button"
              aria-pressed={anim === p.kunci}
              onClick={() => setAnim(p.kunci)}
              className={cn("btn-tekan min-h-9 rounded-xl text-[13px] font-semibold", anim === p.kunci ? "bg-white text-teks-utama shadow-sm dark:bg-white/20" : "text-teks-sekunder")}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-[1_1_180px] text-[12px] leading-snug text-teks-sekunder">
            {draf.atasan > 0 && anim !== "idle" ? "Model atasan baru tampil saat diam; pose lain memakai kaus berwarna sama." : "Rupa ini tampil di Ruang Bot untuk anggota lain setelah disimpan."}
          </span>
          <button
            type="button"
            aria-pressed={main}
            onClick={() => setMain((m) => !m)}
            className="btn-tekan flex min-h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-white/80 px-3 text-[12.5px] font-semibold text-teks-utama dark:border-white/10 dark:bg-white/10"
          >
            {main ? <Pause size={14} /> : <Play size={14} />}
            {main ? "Jeda animasi" : "Putar animasi"}
          </button>
        </div>
      </GlassCard>

      {/* Pilihan */}
      <GlassCard className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5 px-4 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="m-0 font-heading text-[18px] font-extrabold tracking-tight text-teks-utama">Karakter Saya</h2>
            <p className="m-0 text-[12.5px] text-teks-sekunder">Pilih rupa yang mewakili Anda di Ruang Bot.</p>
          </div>
          <span className="whitespace-nowrap rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:text-blue-300">Uji coba</span>
        </div>

        <div role="tablist" aria-label="Bagian karakter" className={cn("tanpa-scrollbar flex gap-1 rounded-2xl bg-slate-400/20 p-1", ringkas ? "overflow-x-auto" : "flex-wrap")}>
          {KATEGORI.map((k) => (
            <button
              key={k.kunci}
              type="button"
              role="tab"
              aria-selected={kat === k.kunci}
              onClick={() => setKat(k.kunci)}
              className={cn(
                "btn-tekan flex min-h-11 shrink-0 flex-col items-start justify-center rounded-xl px-3 text-left",
                kat === k.kunci ? "bg-white text-teks-utama shadow-sm dark:bg-white/20" : "text-teks-sekunder",
              )}
            >
              <span className="text-[13px] font-bold">{k.label}</span>
              <span className="whitespace-nowrap text-[11px] text-teks-sekunder">{nilaiKat[k.kunci]}</span>
            </button>
          ))}
        </div>

        {kat === "preset" && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
            {PRESET.map((p) => (
              <Ubin key={p.id} aktif={presetAktif?.id === p.id} label={p.nama} onPilih={() => setDraf(p.konfig)}>
                <GambarRupa konfig={p.konfig} skala={1} label={p.nama} />
              </Ubin>
            ))}
          </div>
        )}

        {kat === "kulit" && <Swatch daftar={KULIT} nilai={draf.kulit} onPilih={(kulit) => ubah({ kulit })} judul="Warna kulit" />}

        {kat === "rambut" && (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
              {GAYA_RAMBUT.map((nama, i) => {
                const k = { ...draf, rambut: i };
                return (
                  <Ubin key={nama} aktif={draf.rambut === i} label={nama} onPilih={() => ubah({ rambut: i })}>
                    <GambarRupa konfig={k} potret skala={2} label={nama} />
                  </Ubin>
                );
              })}
            </div>
            <Swatch daftar={WARNA_RAMBUT} nilai={draf.warnaRambut} onPilih={(warnaRambut) => ubah({ warnaRambut })} judul={hijab ? "Warna hijab" : "Warna rambut"} />
          </>
        )}

        {kat === "atasan" && (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
              {MODEL_ATASAN.map((nama, i) => {
                const k = { ...draf, atasan: i };
                return (
                  <Ubin key={nama} aktif={draf.atasan === i} label={nama} onPilih={() => ubah({ atasan: i })}>
                    <GambarRupa konfig={k} skala={1} label={nama} />
                  </Ubin>
                );
              })}
            </div>
            <Swatch daftar={WARNA_ATASAN} nilai={draf.warnaAtasan} onPilih={(warnaAtasan) => ubah({ warnaAtasan })} judul="Warna atasan" />
          </>
        )}

        {kat === "bawah" && (
          <>
            <Swatch daftar={WARNA_CELANA} nilai={draf.warnaCelana} onPilih={(warnaCelana) => ubah({ warnaCelana })} judul="Warna celana" />
            <Swatch daftar={WARNA_SEPATU} nilai={draf.warnaSepatu} onPilih={(warnaSepatu) => ubah({ warnaSepatu })} judul="Warna sepatu" />
            <p className="m-0 text-[12px] text-teks-sekunder">Model celana & sepatu lain menyusul setelah gambarnya dibuat.</p>
          </>
        )}

        <div className={cn("-mx-4 flex flex-wrap items-center gap-2 rounded-b-[1.25rem] border-t border-black/10 bg-white/90 px-4 py-3 dark:border-white/10 dark:bg-[rgba(20,20,24,.9)]", ringkas && "sticky bottom-0")}>
          <span className={cn("flex min-w-0 flex-[1_1_200px] items-center gap-2 text-[12.5px] font-semibold", berubah ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300")}>
            <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", berubah ? "bg-amber-500" : "bg-emerald-500")} />
            {berubah ? "Ada perubahan yang belum disimpan" : data.tersimpan ? "Tersimpan · tampil di Ruang Bot" : "Masih rupa bawaan — pilih lalu simpan"}
          </span>
          <button type="button" onClick={acak} className="btn-tekan flex min-h-11 items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3.5 text-[13px] font-semibold text-teks-utama dark:border-white/10 dark:bg-white/10">
            <Dices size={16} /> Acak
          </button>
          <button
            type="button"
            disabled={!berubah || menyimpan}
            onClick={() => setDraf(data.konfig)}
            className="btn-tekan min-h-11 rounded-xl px-3.5 text-[13px] font-semibold text-teks-utama disabled:opacity-45"
          >
            Atur ulang
          </button>
          <button
            type="button"
            disabled={(!berubah && data.tersimpan) || menyimpan}
            onClick={() => void simpan()}
            className="btn-tekan min-h-11 rounded-xl bg-pri px-4 text-[13.5px] font-bold text-white disabled:opacity-45"
          >
            {menyimpan ? "Menyimpan…" : "Simpan karakter"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
