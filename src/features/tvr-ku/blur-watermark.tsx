"use client";

// ============================================================
// Blur Watermark (uji coba, 5 Okt 2026) — TVR Saya, akun yang modul
// "blurwm"-nya dibuka master.
//
// 1. Pilih video: unggah dari perangkat (≤100 MB) atau ambil dari Stok Video.
// 2. Seret kotak di gambar pratinjau (maks 3) — atau tombol "Pojok TikTok"
//    untuk watermark yang berpindah antara kiri-atas & kanan-bawah — lalu
//    pilih efek: Blur, Mosaik, atau Hapus halus.
// 3. Mesin memproses dengan ffmpeg (beberapa detik per video); hasilnya masuk
//    Stok Video (bisa diunggah ke sosmed atau diunduh).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, Film, Loader2, RotateCcw, UploadCloud, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { toast } from "@/hooks/use-app-store";
import { useRefTabAktif } from "@/hooks/use-tab-aktif";
import { cn } from "@/lib/utils";
import { bacaJson, pesanGalat } from "@/features/auto-edit/api";
import { useApiAutoEdit } from "@/features/auto-edit/tim";
import { segarkanStokTvr } from "./stok-video-tvr";
import { perkiraanWaktu, ukuranMb, type AntreanTvr, type StokTvr } from "./edit-otomatis-tipe";

type Efek = "blur" | "mosaik" | "halus";
type Kotak = { x: number; y: number; w: number; h: number };

type ItemBlur = {
  id: string;
  status: "draf" | "queued" | "downloading" | "rendering" | "error" | "dibatalkan";
  progress: number;
  judul: string;
  efek: Efek | null;
  kotak: Kotak[];
  lebar: number | null;
  tinggi: number | null;
  durasi: number | null;
  size_awal: number | null;
  log: string | null;
  error: string | null;
  antrean: AntreanTvr | null;
};

const EFEK: { nilai: Efek; judul: string; ket: string }[] = [
  { nilai: "blur", judul: "Blur", ket: "Diburamkan kuat — aman di semua latar" },
  { nilai: "mosaik", judul: "Mosaik", ket: "Kotak-kotak piksel seperti sensor TV" },
  { nilai: "halus", judul: "Hapus halus", ket: "Diisi warna sekitarnya — paling samar di latar polos" },
];

// Watermark TikTok berpindah antara kiri-atas dan kanan-bawah.
const POJOK_TIKTOK: Kotak[] = [
  { x: 0.02, y: 0.03, w: 0.45, h: 0.11 },
  { x: 0.53, y: 0.83, w: 0.45, h: 0.11 },
];

const JENIS = [".mp4", ".mov", ".m4v", ".webm"];
const AKTIF = ["queued", "downloading", "rendering"];
const MAKS_KOTAK = 3;
const WARNA_KOTAK = ["#F43F5E", "#F59E0B", "#22C55E"];

export function BlurWatermark() {
  const api = useApiAutoEdit();
  const [daftar, setDaftar] = useState<ItemBlur[] | null>(null);
  const [maksMb, setMaksMb] = useState(100);
  const [persen, setPersen] = useState<number | null>(null);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pilihStok, setPilihStok] = useState<StokTvr[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabAktifRef = useRefTabAktif();

  const muat = useCallback(async () => {
    try {
      const res = await api.fetch("/api/tvr/blur", { cache: "no-store" });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Blur Watermark gagal dimuat."));
      setDaftar((d.blur as ItemBlur[]) ?? []);
      if (Number(d.maks_mb) > 0) setMaksMb(Number(d.maks_mb));
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Blur Watermark gagal dimuat.");
      setDaftar((l) => l ?? []);
    }
  }, [api]);

  useEffect(() => {
    void (async () => {
      await muat();
    })();
  }, [muat]);

  const aktif = (daftar ?? []).find((b) => AKTIF.includes(b.status)) ?? null;
  // Draf (atau yang gagal/dibatalkan — bisa diproses ulang) yang sedang diedit.
  const draf = aktif ? null : ((daftar ?? []).find((b) => !AKTIF.includes(b.status)) ?? null);

  // Pantau selama diproses; selesai = hilang dari daftar (kecuali dibatalkan sendiri).
  const idAktif = aktif?.id ?? null;
  const sebelumnyaRef = useRef<string | null>(null);
  const dibuangRef = useRef(new Set<string>());
  useEffect(() => {
    const lama = sebelumnyaRef.current;
    sebelumnyaRef.current = idAktif;
    if (lama && !idAktif && !dibuangRef.current.has(lama) && !(daftar ?? []).some((b) => b.id === lama)) {
      toast("sukses", "Watermark disamarkan", "Hasilnya sudah di Stok Video — ketuk untuk Unduh atau Upload.");
      segarkanStokTvr();
    }
  }, [idAktif, daftar]);
  useEffect(() => {
    if (!idAktif) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible" && tabAktifRef.current) void muat();
    }, 2500);
    return () => window.clearInterval(t);
  }, [idAktif, muat, tabAktifRef]);

  async function unggah(file: File | null) {
    if (!file || persen !== null) return;
    const akhir = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!JENIS.includes(akhir)) {
      setPesan(`Jenis berkas harus ${JENIS.map((j) => j.slice(1).toUpperCase()).join(", ")}.`);
      return;
    }
    if (file.size > maksMb * 1_048_576) {
      setPesan(`Video ${Math.round(file.size / 1_048_576)} MB melebihi batas ${maksMb} MB.`);
      return;
    }
    setPesan("");
    setPersen(0);
    try {
      const { ok, status, data } = await api.unggah("/api/tvr/blur", file, setPersen);
      if (!ok) throw new Error(pesanGalat(status, data, "Video gagal dikirim."));
      setDaftar((data.blur as ItemBlur[]) ?? []);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal dikirim.");
    } finally {
      setPersen(null);
    }
  }

  async function bukaStok() {
    setPesan("");
    try {
      const res = await api.fetch("/api/tvr/stok", { cache: "no-store" });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Stok Video gagal dimuat."));
      setPilihStok((d.stok as StokTvr[]) ?? []);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Stok Video gagal dimuat.");
    }
  }

  async function dariStok(id: string) {
    if (sibuk) return;
    setSibuk(true);
    setPesan("");
    try {
      const res = await api.fetch(`/api/tvr/blur/dari-stok/${id}`, { method: "POST" });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Video stok gagal dipilih."));
      setDaftar((d.blur as ItemBlur[]) ?? []);
      setPilihStok(null);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video stok gagal dipilih.");
    } finally {
      setSibuk(false);
    }
  }

  async function buang(id: string) {
    if (sibuk) return;
    dibuangRef.current.add(id);
    setSibuk(true);
    try {
      const res = await api.fetch(`/api/tvr/blur/${id}`, { method: "DELETE" });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Gagal."));
      setDaftar((d.blur as ItemBlur[]) ?? []);
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  async function proses(id: string, efek: Efek, kotak: Kotak[]) {
    if (sibuk) return;
    setSibuk(true);
    setPesan("");
    try {
      const res = await api.fetch(`/api/tvr/blur/${id}/proses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efek, kotak }),
      });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Video gagal diproses."));
      setDaftar((d.blur as ItemBlur[]) ?? []);
      toast("sukses", "Masuk antrean", "Boleh tinggalkan halaman ini — hasilnya masuk Stok Video.");
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal diproses.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #8B5CF6, #5B21B6)" }}
          aria-hidden="true"
        >
          <EyeOff className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[14px] font-bold text-teks-utama">
            Blur Watermark <span className="text-[10px] font-bold text-amber-500">UJI COBA</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
            Samarkan watermark di video milik sendiri atau yang sudah diizinkan. Hasil masuk Stok Video.
          </p>
        </div>
      </div>

      {daftar === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-teks-sekunder" />
        </div>
      ) : aktif ? (
        <div className="mt-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3" aria-live="polite">
          <p className="truncate text-[12.5px] font-bold text-teks-utama">{aktif.judul}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-teks-sekunder">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
            {aktif.status === "queued"
              ? aktif.antrean
                ? `Antrean #${aktif.antrean.posisi} · selesai ${perkiraanWaktu(aktif.antrean.perkiraan_detik)}`
                : "Menunggu giliran"
              : `Menyamarkan watermark… ${aktif.progress}%`}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div className="h-full rounded-full bg-violet-500 transition-[width] duration-500" style={{ width: `${Math.max(3, aktif.progress)}%` }} />
          </div>
          <button
            type="button"
            onClick={() => void buang(aktif.id)}
            disabled={sibuk}
            className="glass btn-tekan mt-2 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-teks-utama disabled:opacity-50"
          >
            <X className="h-3 w-3" /> Batalkan
          </button>
        </div>
      ) : draf ? (
        <EditorArea key={draf.id} item={draf} sibuk={sibuk} onProses={proses} onBuang={buang} />
      ) : pilihStok ? (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-bold text-teks-utama">Pilih dari Stok Video</p>
            <button type="button" onClick={() => setPilihStok(null)} aria-label="Tutup daftar stok" className="glass btn-tekan flex h-8 w-8 items-center justify-center rounded-lg text-teks-utama">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {pilihStok.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => void dariStok(s.id)}
                  disabled={sibuk}
                  className="glass-soft btn-tekan flex w-full items-center gap-2 rounded-xl p-2.5 text-left disabled:opacity-50"
                >
                  <Film className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-teks-utama">{s.judul}</span>
                  <span className="shrink-0 text-[10.5px] text-teks-sekunder">{ukuranMb(s.size)}</span>
                </button>
              </li>
            ))}
            {pilihStok.length === 0 && <p className="text-[11.5px] text-teks-sekunder">Stok Video masih kosong.</p>}
          </ul>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={JENIS.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              void unggah(f);
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={persen !== null}
              className="btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #5B21B6)" }}
            >
              {persen !== null ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {persen}%
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" /> Unggah video
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => void bukaStok()}
              disabled={persen !== null}
              className="glass btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-teks-utama disabled:opacity-60"
            >
              <Film className="h-4 w-4" /> Dari Stok Video
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10.5px] text-teks-sekunder">Maks {maksMb} MB · resolusi tetap asli</p>
        </>
      )}

      {pesan && (
        <p className="mt-3 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5 text-[11.5px] text-teks-utama" role="alert">
          {pesan}
        </p>
      )}
    </GlassCard>
  );
}

// ---- Editor area: pratinjau + kotak seret + efek ------------------------------

function EditorArea({
  item,
  sibuk,
  onProses,
  onBuang,
}: {
  item: ItemBlur;
  sibuk: boolean;
  onProses: (id: string, efek: Efek, kotak: Kotak[]) => void;
  onBuang: (id: string) => void;
}) {
  const api = useApiAutoEdit();
  const [gambar, setGambar] = useState<string | null>(null);
  const [galatGambar, setGalatGambar] = useState("");
  const [kotak, setKotak] = useState<Kotak[]>(item.kotak ?? []);
  const [efek, setEfek] = useState<Efek>(item.efek ?? "blur");
  const [seret, setSeret] = useState<Kotak | null>(null);
  const awal = useRef<{ x: number; y: number } | null>(null);
  const bidangRef = useRef<HTMLDivElement>(null);

  // Gambar pratinjau butuh token: diambil sebagai blob, bukan <img src> biasa.
  useEffect(() => {
    let hidup = true;
    let alamat = "";
    void (async () => {
      try {
        const res = await api.fetch(`/api/tvr/blur/${item.id}/pratinjau.jpg`, { cache: "no-store" });
        if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Pratinjau gagal dimuat."));
        const blob = await res.blob();
        if (!hidup) return;
        alamat = URL.createObjectURL(blob);
        setGambar(alamat);
      } catch (e) {
        if (hidup) setGalatGambar(e instanceof Error ? e.message : "Pratinjau gagal dimuat.");
      }
    })();
    return () => {
      hidup = false;
      if (alamat) URL.revokeObjectURL(alamat);
    };
  }, [api, item.id]);

  function titik(e: React.PointerEvent<HTMLDivElement>) {
    const r = bidangRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }
  function mulai(e: React.PointerEvent<HTMLDivElement>) {
    if (sibuk || kotak.length >= MAKS_KOTAK) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = titik(e);
    awal.current = p;
    setSeret({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  function gerak(e: React.PointerEvent<HTMLDivElement>) {
    const a = awal.current;
    if (!a) return;
    const p = titik(e);
    setSeret({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
  }
  function selesai() {
    const k = seret;
    awal.current = null;
    setSeret(null);
    // Seretan kecil dianggap sentuhan tak sengaja.
    if (!k || k.w < 0.03 || k.h < 0.02) return;
    setKotak((l) => (l.length >= MAKS_KOTAK ? l : [...l, k]));
  }

  const gaya = (k: Kotak) => ({
    left: `${k.x * 100}%`,
    top: `${k.y * 100}%`,
    width: `${k.w * 100}%`,
    height: `${k.h * 100}%`,
  });
  const lebar = item.lebar ?? 9;
  const tinggi = item.tinggi ?? 16;
  const tegak = tinggi >= lebar;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-teks-utama">{item.judul}</p>
        <button
          type="button"
          onClick={() => onBuang(item.id)}
          disabled={sibuk}
          className="glass btn-tekan flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-teks-utama disabled:opacity-50"
        >
          <X className="h-3 w-3" /> Ganti video
        </button>
      </div>
      {item.status === "error" && (
        <p className="mt-2 rounded-xl border border-gagal/30 bg-gagal/10 p-2 text-[11px] text-teks-utama" role="alert">
          Proses terakhir gagal: {item.error || "coba lagi."}
        </p>
      )}

      <p className="mt-2 text-[10.5px] leading-snug text-teks-sekunder">
        Seret kotak di gambar menutupi watermark (maks {MAKS_KOTAK}). Area berlaku sepanjang video.
      </p>
      <div
        ref={bidangRef}
        className={cn(
          "relative mx-auto mt-2 w-full touch-none overflow-hidden rounded-xl bg-neutral-900 select-none",
          tegak ? "max-w-[260px]" : "max-w-full",
        )}
        style={{ aspectRatio: `${lebar} / ${tinggi}` }}
        onPointerDown={mulai}
        onPointerMove={gerak}
        onPointerUp={selesai}
        onPointerCancel={selesai}
      >
        {gambar ? (
          // Blob lokal ber-token: bukan untuk next/image.
          <img src={gambar} alt="Pratinjau video" draggable={false} className="h-full w-full object-fill" />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-[11px] text-white/80">
            {galatGambar || <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
        )}
        {kotak.map((k, i) => (
          <div
            key={i}
            className="pointer-events-none absolute border-2"
            style={{ ...gaya(k), borderColor: WARNA_KOTAK[i], background: `${WARNA_KOTAK[i]}33` }}
          >
            <span className="absolute -top-0.5 -left-0.5 rounded-br px-1 text-[9px] font-bold text-white" style={{ background: WARNA_KOTAK[i] }}>
              {i + 1}
            </span>
          </div>
        ))}
        {seret && <div className="pointer-events-none absolute border-2 border-dashed border-white bg-white/20" style={gaya(seret)} />}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {kotak.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setKotak((l) => l.filter((__, j) => j !== i))}
            disabled={sibuk}
            className="btn-tekan flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold text-white disabled:opacity-50"
            style={{ background: WARNA_KOTAK[i] }}
            aria-label={`Hapus area ${i + 1}`}
          >
            Area {i + 1} <X className="h-3 w-3" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setKotak(POJOK_TIKTOK)}
          disabled={sibuk}
          className="glass btn-tekan rounded-lg px-2.5 py-1 text-[10.5px] font-bold text-teks-utama disabled:opacity-50"
        >
          Pojok TikTok
        </button>
        {kotak.length > 0 && (
          <button
            type="button"
            onClick={() => setKotak([])}
            disabled={sibuk}
            className="btn-tekan flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold text-teks-sekunder disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" /> Ulang
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Efek penyamaran">
        {EFEK.map((e) => (
          <button
            key={e.nilai}
            type="button"
            role="radio"
            aria-checked={efek === e.nilai}
            onClick={() => setEfek(e.nilai)}
            disabled={sibuk}
            className={cn(
              "btn-tekan rounded-xl px-1.5 py-2 text-center text-[12px] font-bold disabled:opacity-60",
              efek === e.nilai ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "glass text-teks-sekunder",
            )}
          >
            {e.judul}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10.5px] text-teks-sekunder">{EFEK.find((e) => e.nilai === efek)?.ket}.</p>

      <button
        type="button"
        onClick={() => onProses(item.id, efek, kotak)}
        disabled={sibuk || kotak.length === 0}
        className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #8B5CF6, #5B21B6)" }}
      >
        {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />}
        {kotak.length === 0 ? "Tandai area dulu" : `Samarkan ${kotak.length} area`}
      </button>
      {item.durasi ? (
        <p className="mt-1.5 text-center text-[10.5px] text-teks-sekunder">
          {Math.round(item.durasi)} dtk · {ukuranMb(item.size_awal)} · biasanya selesai dalam hitungan detik
        </p>
      ) : null}
    </div>
  );
}
