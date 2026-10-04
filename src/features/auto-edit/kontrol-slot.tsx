"use client";

// Kontrol master: berapa render Auto Edit berjalan SERENTAK di VPS. Makin
// banyak = antrean cepat habis tapi beban CPU/RAM server naik.
// Pindah dari layar Auto Edit ke HR Center (5 Okt 2026). Rute /api/video
// tetap khusus master; bila gagal dimuat (bukan master / mesin mati),
// kontrol ini menyembunyikan diri.

import { useEffect, useState } from "react";
import { Check, Loader2, Minus, Plus, Server } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { cn } from "@/lib/utils";
import { apiFetch, bacaJson, pesanGalat } from "./api";

export function KontrolSlot({ className }: { className?: string }) {
  const [slot, setSlot] = useState<number | null>(null);
  const [maks, setMaks] = useState(8);
  const [menyimpan, setMenyimpan] = useState(false);
  const [tersimpan, setTersimpan] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const res = await apiFetch("/api/video/slot", { cache: "no-store" });
        if (!res.ok) return;
        const d = await bacaJson(res);
        if (!hidup) return;
        setSlot(Number(d.slot) || 1);
        setMaks(Number(d.maks) || 8);
      } catch {
        // kontrol opsional; sembunyikan bila gagal
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function simpan(nilai: number) {
    const v = Math.max(1, Math.min(maks, nilai));
    setSlot(v);
    setMenyimpan(true);
    setTersimpan(false);
    try {
      const res = await apiFetch("/api/video/slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: v }),
      });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Gagal menyetel slot."));
      setSlot(Number(d.slot) || v);
      setTersimpan(true);
      window.setTimeout(() => setTersimpan(false), 1500);
    } catch {
      // gagal: biarkan nilai lama; tombol tetap bisa dicoba lagi
    } finally {
      setMenyimpan(false);
    }
  }

  if (slot === null) return null;
  return (
    <GlassCard className={cn("flex items-center gap-3 p-3", className)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pri/15 text-pri" aria-hidden="true">
        <Server className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold text-teks-utama">Render serentak Auto Edit</p>
        <p className="text-[10.5px] leading-snug text-teks-sekunder">
          {slot} video diproses bersamaan; sisanya mengantre. Maksimal {maks}.
        </p>
      </div>
      {menyimpan ? (
        <Loader2 className="h-4 w-4 animate-spin text-teks-sekunder" />
      ) : tersimpan ? (
        <Check className="h-4 w-4 text-sukses" />
      ) : null}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void simpan(slot - 1)}
          disabled={menyimpan || slot <= 1}
          aria-label="Kurangi slot"
          className="glass btn-tekan flex h-8 w-8 items-center justify-center rounded-lg text-teks-utama disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="angka-tab w-6 text-center text-[15px] font-extrabold text-teks-utama">{slot}</span>
        <button
          type="button"
          onClick={() => void simpan(slot + 1)}
          disabled={menyimpan || slot >= maks}
          aria-label="Tambah slot"
          className="glass btn-tekan flex h-8 w-8 items-center justify-center rounded-lg text-teks-utama disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </GlassCard>
  );
}
