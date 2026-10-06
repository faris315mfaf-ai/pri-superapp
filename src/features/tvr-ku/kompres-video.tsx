"use client";

// ============================================================
// Kompres Video (5 Okt 2026) — TVR Saya, semua akun kecuali modul
// "kompres"-nya ditutup master. Hasil Auto Edit juga dikompres otomatis ke
// VMAF 90 (mesin-video/pekerja.ts kompresOtomatis).
//
// Unggah video dari perangkat (≤100 MB) → mesin mencari setelan x264 terkecil
// yang masih memenuhi target VMAF (ab-av1 + Netflix VMAF) → encode H.264
// resolusi asli → hasilnya masuk Stok Video (bisa diunggah ke sosmed atau
// diunduh). Kualitas dipilih: Tinggi (VMAF 96), Seimbang (94), Hemat (92),
// Paling Kecil (86).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Minimize2, RotateCcw, UploadCloud, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { toast } from "@/hooks/use-app-store";
import { useRefTabAktif } from "@/hooks/use-tab-aktif";
import { cn } from "@/lib/utils";
import { bacaJson, pesanGalat } from "@/features/auto-edit/api";
import { useApiAutoEdit } from "@/features/auto-edit/tim";
import { segarkanStokTvr } from "./stok-video-tvr";
import { perkiraanWaktu, ukuranMb, type AntreanTvr } from "./edit-otomatis-tipe";

type Mutu = "tinggi" | "seimbang" | "hemat" | "kecil";

type ItemKompres = {
  id: string;
  status: "queued" | "downloading" | "rendering" | "error" | "dibatalkan";
  progress: number;
  judul: string;
  mutu: Mutu;
  size_awal: number | null;
  log: string | null;
  error: string | null;
  antrean: AntreanTvr | null;
};

const PILIHAN: { nilai: Mutu; judul: string; vmaf: number; ket: string }[] = [
  { nilai: "tinggi", judul: "Tinggi", vmaf: 96, ket: "Paling mirip aslinya, berkas sedikit lebih besar" },
  { nilai: "seimbang", judul: "Seimbang", vmaf: 94, ket: "Bedanya tidak terlihat mata, jauh lebih kecil" },
  { nilai: "hemat", judul: "Hemat", vmaf: 92, ket: "Lebih kecil, cocok untuk unggahan sosmed" },
  { nilai: "kecil", judul: "Paling Kecil", vmaf: 86, ket: "Berkas terkecil; detail halus bisa sedikit berkurang" },
];

// Sama dengan yang diterima mesin (src/mesin-video/server/tvr.ts JENIS_VIDEO).
const JENIS = [".mp4", ".mov", ".m4v", ".webm"];
const AKTIF = ["queued", "downloading", "rendering"];

/** "1 GB", "100 MB" */
function labelBatas(mb: number): string {
  return mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`;
}

export function KompresVideo() {
  const api = useApiAutoEdit();
  const [mutu, setMutu] = useState<Mutu>("seimbang");
  const [daftar, setDaftar] = useState<ItemKompres[] | null>(null);
  const [maksMb, setMaksMb] = useState(100);
  const [persen, setPersen] = useState<number | null>(null);
  const [pesan, setPesan] = useState("");
  const [membatalkan, setMembatalkan] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tabAktifRef = useRefTabAktif();

  const muat = useCallback(async () => {
    try {
      const res = await api.fetch("/api/tvr/kompres", { cache: "no-store" });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Kompres Video gagal dimuat."));
      setDaftar((d.kompres as ItemKompres[]) ?? []);
      if (Number(d.maks_mb) > 0) setMaksMb(Number(d.maks_mb));
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Kompres Video gagal dimuat.");
      setDaftar((l) => l ?? []);
    }
  }, [api]);

  useEffect(() => {
    void (async () => {
      await muat();
    })();
  }, [muat]);

  // Boleh mengantre banyak video sekaligus (6 Okt 2026): urut nomor antrean.
  const aktif = (daftar ?? [])
    .filter((k) => AKTIF.includes(k.status))
    .sort((x, y) => (x.antrean?.posisi ?? 0) - (y.antrean?.posisi ?? 0));
  const gagal = (daftar ?? []).filter((k) => k.status === "error");

  // Pantau selama ada yang dikompres; selesai = hilang dari daftar aktif.
  const idAktif = aktif.map((k) => k.id).sort().join(",");
  const sebelumnyaRef = useRef("");
  // Yang dibatalkan sendiri ikut hilang dari daftar — jangan dikira selesai.
  const dibatalkanRef = useRef(new Set<string>());
  useEffect(() => {
    const lama = sebelumnyaRef.current ? sebelumnyaRef.current.split(",") : [];
    sebelumnyaRef.current = idAktif;
    const kini = new Set(idAktif ? idAktif.split(",") : []);
    const selesai = lama.filter(
      (id) => !kini.has(id) && !dibatalkanRef.current.has(id) && !(daftar ?? []).some((k) => k.id === id),
    );
    if (selesai.length > 0) {
      toast("sukses", "Kompres selesai", "Hasilnya sudah di Stok Video — ketuk untuk Unduh atau Upload.");
      segarkanStokTvr();
    }
  }, [idAktif, daftar]);
  useEffect(() => {
    if (!idAktif) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible" && tabAktifRef.current) void muat();
    }, 3000);
    return () => window.clearInterval(t);
  }, [idAktif, muat, tabAktifRef]);

  async function pilih(file: File | null) {
    if (!file || persen !== null) return;
    const akhir = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!JENIS.includes(akhir)) {
      setPesan(`Jenis berkas harus ${JENIS.map((j) => j.slice(1).toUpperCase()).join(", ")}.`);
      return;
    }
    if (file.size > maksMb * 1_048_576) {
      setPesan(`Video ${Math.round(file.size / 1_048_576)} MB melebihi batas ${labelBatas(maksMb)}.`);
      return;
    }
    setPesan("");
    setPersen(0);
    try {
      const { ok, status, data } = await api.unggah(`/api/tvr/kompres?mutu=${mutu}`, file, setPersen);
      if (!ok) throw new Error(pesanGalat(status, data, "Video gagal dikirim untuk dikompres."));
      setDaftar((data.kompres as ItemKompres[]) ?? []);
      toast("sukses", "Masuk antrean kompres", "Boleh menambah video lain atau tinggalkan halaman ini — hasilnya masuk Stok Video.");
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal dikirim untuk dikompres.");
    } finally {
      setPersen(null);
    }
  }

  async function batalkan(id: string) {
    if (membatalkan) return;
    dibatalkanRef.current.add(id);
    setMembatalkan(id);
    try {
      const res = await api.fetch(`/api/tvr/kompres/${id}`, { method: "DELETE" });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Gagal membatalkan."));
      setDaftar((d.kompres as ItemKompres[]) ?? []);
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setMembatalkan("");
    }
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #10B981, #047857)" }}
          aria-hidden="true"
        >
          <Minimize2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[14px] font-bold text-teks-utama">
            Kompres Video
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
            Perkecil video dengan kualitas yang terukur. Hasil masuk Stok Video.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Kualitas hasil">
        {PILIHAN.map((p) => (
          <button
            key={p.nilai}
            type="button"
            role="radio"
            aria-checked={mutu === p.nilai}
            onClick={() => setMutu(p.nilai)}
            disabled={persen !== null}
            className={cn(
              "btn-tekan rounded-xl px-1.5 py-2 text-center disabled:opacity-60",
              mutu === p.nilai ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
            )}
          >
            <span className="block text-[12px] font-bold">{p.judul}</span>
            <span className="block text-[9.5px]">VMAF {p.vmaf}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-teks-sekunder">
        {PILIHAN.find((p) => p.nilai === mutu)?.ket}. VMAF = skor kualitas buatan Netflix (100 = identik).
      </p>

      {aktif.length > 0 && (
        <div className="mt-3 flex flex-col gap-2" aria-live="polite">
          {aktif.map((k) => (
            <div key={k.id} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="truncate text-[12.5px] font-bold text-teks-utama">{k.judul}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-teks-sekunder">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                {k.status === "queued"
                  ? k.antrean
                    ? `Antrean #${k.antrean.posisi} · selesai ${perkiraanWaktu(k.antrean.perkiraan_detik)}`
                    : "Menunggu giliran"
                  : k.progress < 45
                    ? `Mencari setelan terbaik… ${k.progress}%`
                    : `Mengompres… ${k.progress}%`}
                {k.size_awal ? ` · asli ${ukuranMb(k.size_awal)}` : ""}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                  style={{ width: `${Math.max(3, k.progress)}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => void batalkan(k.id)}
                disabled={membatalkan === k.id}
                className="glass btn-tekan mt-2 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-teks-utama disabled:opacity-50"
              >
                {membatalkan === k.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                Batalkan
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={JENIS.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          void pilih(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={persen !== null || daftar === null}
        className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #10B981, #047857)" }}
      >
        {persen !== null ? (
          <>
            <Loader2 className="h-4.5 w-4.5 animate-spin" /> Mengunggah… {persen}%
          </>
        ) : (
          <>
            <UploadCloud className="h-4.5 w-4.5" /> Pilih Video untuk Dikompres
          </>
        )}
      </button>
      <p className="mt-1.5 text-center text-[10.5px] text-teks-sekunder">
        Maks {labelBatas(maksMb)} · video asli dihapus setelah jadi · resolusi tetap asli · ±2–4 menit per menit video
      </p>
      {gagal.length > 0 && (
        <div className="mt-3 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5" role="alert">
          <p className="text-[11.5px] font-bold text-teks-utama">Kompres terakhir gagal</p>
          <p className="mt-0.5 text-[11px] text-teks-sekunder">{gagal[0].error || gagal[0].log || "Coba lagi."}</p>
          <button
            type="button"
            onClick={() => void batalkan(gagal[0].id)}
            className="glass btn-tekan mt-1.5 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-bold text-teks-utama"
          >
            <RotateCcw className="h-3 w-3" /> Tutup
          </button>
        </div>
      )}

      {pesan && (
        <p className="mt-3 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5 text-[11.5px] text-teks-utama" role="alert">
          {pesan}
        </p>
      )}
    </GlassCard>
  );
}
