"use client";

// ============================================================
// useKolomWadah (7 Okt 2026) — jumlah kolom bento menurut LEBAR WADAH,
// bukan lebar layar: di PC rel kiri / Dock ikut memakan tempat, jadi
// lebar layar saja menipu (1024 px layar ≈ 760 px isi).
//   < 680 px → 1 kolom (HP) · < 1080 px → 2 kolom (tablet) · selebihnya 3.
// null sampai wadah terukur — pemakai sebaiknya menunda render isi supaya
// panel tidak dipasang dua kali (1 kolom lalu pindah ke 3 kolom).
// ============================================================

import { useEffect, useState, type RefObject } from "react";

export type JumlahKolom = 1 | 2 | 3;

const BATAS_DUA = 680;
const BATAS_TIGA = 1080;

export function useKolomWadah(ref: RefObject<HTMLElement | null>): JumlahKolom | null {
  const [kolom, setKolom] = useState<JumlahKolom | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entri]) => {
      const lebar = entri.contentRect.width;
      setKolom(lebar >= BATAS_TIGA ? 3 : lebar >= BATAS_DUA ? 2 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return kolom;
}
