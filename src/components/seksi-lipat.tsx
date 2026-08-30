"use client";

// ============================================================
// SeksiLipat — seksi yang bisa diperkecil/diperbesar (spek 1.18).
//
// - Header bar: judul + chevron; klik/tap men-toggle.
// - Transisi halus memakai grid-template-rows 0fr→1fr (tanpa
//   mengukur tinggi, tanpa display:none yang kasar).
// - Preferensi tersimpan di localStorage per seksi:
//   kunci `tvr_collapse_${id}` → "1" (terlipat) / "0" (terbuka).
// - Dipakai modul TV Rakyat (bawaan TERLIPAT) dan HR Center
//   (bawaan bisa diatur lewat prop bawaanTerbuka).
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function bacaSimpanan(id: string, bawaanTerbuka: boolean): boolean {
  try {
    const v = localStorage.getItem(`tvr_collapse_${id}`);
    if (v === "1") return false; // terlipat
    if (v === "0") return true; // terbuka
  } catch {
    // localStorage bisa tak tersedia (mode privat) — pakai bawaan.
  }
  return bawaanTerbuka;
}

export function SeksiLipat({
  id,
  judul,
  ikon: Ikon,
  bawaanTerbuka = false,
  keterangan,
  bukaSinyal,
  children,
}: {
  /** Unik per seksi — jadi kunci localStorage */
  id: string;
  judul: string;
  ikon?: LucideIcon;
  /** false (bawaan) = mulai TERLIPAT */
  bawaanTerbuka?: boolean;
  keterangan?: string;
  /** Naikkan angkanya dari luar untuk MEMBUKA paksa seksi ini +
   *  menggulirkannya ke layar (mis. tombol "Pakai" mengarahkan ke
   *  Bagi Tugas). Nilai awal/undefined tidak melakukan apa-apa. */
  bukaSinyal?: number;
  children: ReactNode;
}) {
  // Lazy initializer membaca localStorage SEKALI saat mount — aman
  // SSR karena komponen ini "use client" dan initializer jalan di klien.
  const [terbuka, setTerbuka] = useState(() =>
    typeof window === "undefined" ? bawaanTerbuka : bacaSimpanan(id, bawaanTerbuka),
  );
  const seksiRef = useRef<HTMLElement>(null);

  // Buka paksa ketika bukaSinyal berubah (abaikan render pertama).
  const sinyalTerakhir = useRef(bukaSinyal);
  useEffect(() => {
    if (bukaSinyal === undefined || bukaSinyal === sinyalTerakhir.current) return;
    sinyalTerakhir.current = bukaSinyal;
    setTerbuka(true);
    try {
      localStorage.setItem(`tvr_collapse_${id}`, "0");
    } catch {
      // Preferensi gagal disimpan bukan masalah.
    }
    seksiRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [bukaSinyal, id]);

  function toggle() {
    setTerbuka((v) => {
      try {
        localStorage.setItem(`tvr_collapse_${id}`, v ? "1" : "0");
      } catch {
        // Gagal menyimpan preferensi bukan masalah — sesi ini tetap jalan.
      }
      return !v;
    });
  }

  return (
    <section ref={seksiRef} className="glass rounded-2xl scroll-mt-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={terbuka}
        aria-controls={`isi-${id}`}
        className="btn-tekan flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        {Ikon && (
          <Ikon className="h-4.5 w-4.5 shrink-0 text-pri" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-teks-utama">{judul}</span>
          {keterangan && !terbuka && (
            <span className="block truncate text-[10.5px] text-teks-sekunder">
              {keterangan}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4.5 w-4.5 shrink-0 text-teks-sekunder transition-transform duration-300",
            terbuka && "rotate-180",
          )}
          style={{ transitionTimingFunction: "var(--ease-keluar)" }}
          aria-hidden="true"
        />
      </button>

      {/* grid 0fr->1fr: transisi tinggi mulus tanpa mengukur konten */}
      <div
        id={`isi-${id}`}
        className="grid transition-[grid-template-rows] duration-300"
        style={{
          gridTemplateRows: terbuka ? "1fr" : "0fr",
          transitionTimingFunction: "var(--ease-keluar)",
        }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
