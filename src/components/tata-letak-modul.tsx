"use client";

// ============================================================
// TataLetakModul (fitur 1.20/1 & 1.20/2) — kerangka seksi sebuah
// modul yang bisa DIKUSTOMISASI penggunanya sendiri:
//
// - Tiap seksi otomatis bisa DILIPAT/DIBUKA (dibungkus SeksiLipat).
// - Tombol "Atur" membuka mode tata letak: naikkan/turunkan urutan
//   seksi dan sembunyikan/tampilkan seksi.
// - Pilihan disimpan per pengguna di server (kunci layout:<modul>)
//   sehingga ikut ke semua perangkatnya. Seksi BARU dari rilis
//   berikutnya otomatis tampil di posisi bawaannya — preferensi lama
//   tidak pernah menyembunyikan fitur baru.
//
// Dipakai Beranda, Konten, dan TVR Saya — satu komponen, banyak
// modul (aturan reusable 1.19 tetap dipegang).
// ============================================================

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { SeksiLipat } from "@/components/seksi-lipat";
import { getPreferensi, simpanPreferensi } from "@/services";
import { toast } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";

export type SeksiModul = {
  /** Unik dalam modulnya — jadi bagian kunci preferensi & localStorage */
  id: string;
  judul: string;
  ikon?: LucideIcon;
  keterangan?: string;
  /** false (bawaan SeksiLipat) = mulai terlipat */
  bawaanTerbuka?: boolean;
  render: () => ReactNode;
};

type PrefLayout = { urutan?: unknown; sembunyi?: unknown };

/**
 * Susun seksi mengikuti urutan pilihan pengguna. Id yang tidak dikenal
 * dibuang; seksi yang belum ada di preferensi (fitur baru) ditempelkan
 * di belakang sesuai urutan bawaannya.
 */
function susun(seksi: SeksiModul[], urutan: string[] | null): SeksiModul[] {
  if (!urutan || urutan.length === 0) return seksi;
  const perId = new Map(seksi.map((s) => [s.id, s]));
  const hasil: SeksiModul[] = [];
  for (const id of urutan) {
    const s = perId.get(id);
    if (s) {
      hasil.push(s);
      perId.delete(id);
    }
  }
  for (const s of seksi) if (perId.has(s.id)) hasil.push(s);
  return hasil;
}

export function TataLetakModul({
  modul,
  seksi,
}: {
  /** Nama modul, huruf kecil (mis. "beranda") — jadi kunci preferensi */
  modul: string;
  seksi: SeksiModul[];
}) {
  const [urutan, setUrutan] = useState<string[] | null>(null);
  const [sembunyi, setSembunyi] = useState<string[]>([]);
  const [modeAtur, setModeAtur] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const pref = await getPreferensi();
      if (!hidup) return;
      const layout = pref[`layout:${modul}`] as PrefLayout | undefined;
      if (Array.isArray(layout?.urutan)) setUrutan(layout.urutan.map(String));
      if (Array.isArray(layout?.sembunyi)) setSembunyi(layout.sembunyi.map(String));
    })();
    return () => {
      hidup = false;
    };
  }, [modul]);

  const tersusun = susun(seksi, urutan);

  function simpan(urutanBaru: string[], sembunyiBaru: string[]) {
    // Optimis — layar langsung berubah; kegagalan cukup dilaporkan,
    // preferensi berikutnya akan menimpanya lagi.
    setUrutan(urutanBaru);
    setSembunyi(sembunyiBaru);
    void simpanPreferensi(`layout:${modul}`, {
      urutan: urutanBaru,
      sembunyi: sembunyiBaru,
    }).catch((e) =>
      toast("error", "Gagal menyimpan tata letak", e instanceof Error ? e.message : ""),
    );
  }

  function geser(id: string, arah: -1 | 1) {
    const ids = tersusun.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + arah;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    simpan(ids, sembunyi);
  }

  function toggleSembunyi(id: string) {
    const baru = sembunyi.includes(id)
      ? sembunyi.filter((s) => s !== id)
      : [...sembunyi, id];
    // Minimal satu seksi harus tampil — modul kosong itu membingungkan.
    if (baru.length >= seksi.length) {
      toast("peringatan", "Minimal satu seksi harus tampil");
      return;
    }
    simpan(
      tersusun.map((s) => s.id),
      baru,
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tombol mode atur — kecil, rata kanan, tidak mengganggu isi */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setModeAtur((v) => !v)}
          aria-pressed={modeAtur}
          className={cn(
            "btn-tekan flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold",
            modeAtur ? "text-white" : "glass text-teks-sekunder",
          )}
          style={
            modeAtur
              ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
              : undefined
          }
        >
          {modeAtur ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Selesai Mengatur
            </>
          ) : (
            <>
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Atur Tata Letak
            </>
          )}
        </button>
      </div>

      {tersusun.map((s, i) => {
        const disembunyikan = sembunyi.includes(s.id);
        // Di luar mode atur, seksi tersembunyi benar-benar hilang.
        if (disembunyikan && !modeAtur) return null;
        return (
          <div
            key={s.id}
            className={cn(
              modeAtur && "rounded-2xl ring-2 ring-pri/30",
              modeAtur && disembunyikan && "opacity-45",
            )}
          >
            {modeAtur && (
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-teks-sekunder">
                  {s.judul}
                </span>
                <button
                  type="button"
                  onClick={() => geser(s.id, -1)}
                  disabled={i === 0}
                  aria-label={`Naikkan seksi ${s.judul}`}
                  className="glass btn-tekan flex h-7 w-7 items-center justify-center rounded-lg text-teks-utama disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => geser(s.id, 1)}
                  disabled={i === tersusun.length - 1}
                  aria-label={`Turunkan seksi ${s.judul}`}
                  className="glass btn-tekan flex h-7 w-7 items-center justify-center rounded-lg text-teks-utama disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleSembunyi(s.id)}
                  aria-label={
                    disembunyikan ? `Tampilkan seksi ${s.judul}` : `Sembunyikan seksi ${s.judul}`
                  }
                  className="glass btn-tekan flex h-7 w-7 items-center justify-center rounded-lg text-teks-utama"
                >
                  {disembunyikan ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
            <SeksiLipat
              id={`${modul}-${s.id}`}
              judul={s.judul}
              ikon={s.ikon}
              keterangan={s.keterangan}
              bawaanTerbuka={s.bawaanTerbuka}
            >
              {s.render()}
            </SeksiLipat>
          </div>
        );
      })}
    </div>
  );
}
