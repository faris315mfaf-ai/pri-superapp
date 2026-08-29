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
import { Reorder } from "framer-motion";
import {
  Check,
  Eye,
  EyeOff,
  GripVertical,
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
  bungkusSeksi = true,
}: {
  /** Nama modul, huruf kecil (mis. "beranda") — jadi kunci preferensi */
  modul: string;
  seksi: SeksiModul[];
  /**
   * true (bawaan): tiap seksi dibungkus SeksiLipat (bisa dilipat). Set
   * FALSE bila seksi sudah punya kepala/kartu sendiri (mis. DashboardScreen)
   * supaya tak ada kepala dobel — reorder & sembunyikan tetap jalan.
   */
  bungkusSeksi?: boolean;
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

  /** Simpan urutan baru hasil DRAG (fitur 1.22.x/bug 1). */
  function urutkanUlang(idsBaru: string[]) {
    simpan(idsBaru, sembunyi);
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

      {modeAtur ? (
        // Mode atur: daftar ringkas yang bisa DISERET (drag-and-drop) untuk
        // mengurutkan; ikon mata untuk sembunyikan/tampilkan. Seret dari mana
        // saja di baris; pegangan grip menandai bahwa ia bisa digeser.
        <Reorder.Group
          axis="y"
          values={tersusun.map((s) => s.id)}
          onReorder={urutkanUlang}
          className="flex flex-col gap-2"
        >
          {tersusun.map((s) => {
            const disembunyikan = sembunyi.includes(s.id);
            return (
              <Reorder.Item
                key={s.id}
                value={s.id}
                className={cn(
                  "glass flex cursor-grab items-center gap-2 rounded-2xl px-3 py-2.5 ring-2 ring-pri/30 active:cursor-grabbing",
                  disembunyikan && "opacity-45",
                )}
                whileDrag={{ scale: 1.03, boxShadow: "0 12px 28px rgba(0,0,0,0.18)" }}
              >
                <GripVertical className="h-4.5 w-4.5 shrink-0 text-teks-sekunder" aria-hidden="true" />
                {s.ikon && <s.ikon className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-teks-utama">
                  {s.judul}
                </span>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => toggleSembunyi(s.id)}
                  aria-label={
                    disembunyikan ? `Tampilkan seksi ${s.judul}` : `Sembunyikan seksi ${s.judul}`
                  }
                  className="glass btn-tekan flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-teks-utama"
                >
                  {disembunyikan ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      ) : (
        // Mode normal: seksi ditampilkan penuh; yang disembunyikan hilang.
        tersusun.map((s) => {
          if (sembunyi.includes(s.id)) return null;
          // Seksi yang sudah punya kepala/kartu sendiri dirender apa adanya.
          if (!bungkusSeksi) return <div key={s.id}>{s.render()}</div>;
          return (
            <SeksiLipat
              key={s.id}
              id={`${modul}-${s.id}`}
              judul={s.judul}
              ikon={s.ikon}
              keterangan={s.keterangan}
              bawaanTerbuka={s.bawaanTerbuka}
            >
              {s.render()}
            </SeksiLipat>
          );
        })
      )}
    </div>
  );
}
