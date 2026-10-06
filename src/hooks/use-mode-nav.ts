"use client";

// Pilihan navigasi layar lebar: Sidebar atau Dock (desain Apple, 6 Okt 2026).
// Disimpan per perangkat (localStorage) — seperti macOS, posisi Dock adalah
// kebiasaan mesin yang dipakai, bukan milik akun. useSyncExternalStore
// supaya semua pemakai serempak tanpa setState di dalam effect.

import { useCallback, useSyncExternalStore } from "react";
import type { ModeNav } from "@/lib/desain-apple";

const KUNCI = "pri:mode-nav";
const PERISTIWA = "pri:mode-nav";

function baca(): ModeNav {
  try {
    return localStorage.getItem(KUNCI) === "dock" ? "dock" : "sidebar";
  } catch {
    return "sidebar";
  }
}

function langgan(kabari: () => void): () => void {
  window.addEventListener(PERISTIWA, kabari);
  window.addEventListener("storage", kabari);
  return () => {
    window.removeEventListener(PERISTIWA, kabari);
    window.removeEventListener("storage", kabari);
  };
}

export function useModeNav(): [ModeNav, (m: ModeNav) => void] {
  const mode = useSyncExternalStore(langgan, baca, () => "sidebar" as ModeNav);
  const atur = useCallback((m: ModeNav) => {
    try {
      localStorage.setItem(KUNCI, m);
    } catch {
      // Penyimpanan diblokir (mode privat): navigasi tetap Sidebar.
    }
    window.dispatchEvent(new Event(PERISTIWA));
  }, []);
  return [mode, atur];
}
