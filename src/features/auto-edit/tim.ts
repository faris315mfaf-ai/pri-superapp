"use client";

// ============================================================
// Akun TIM untuk Edit Otomatis & Stok Video (5 Okt 2026).
//
// Komponen yang sama (EditOtomatisTvr, StokVideoTvr, TemplateTvrModal)
// dipakai di dua tempat: TVR Saya (milik pribadi) dan TV Rakyat Official
// (milik bersama tim, kuota 5 GB). Keduanya bisa terpasang bersamaan di
// tab yang berbeda, jadi penandanya lewat context — bukan variabel global.
// ============================================================

import { createContext, useContext, useMemo } from "react";
import { apiFetch, apiUnggah } from "./api";

/** "tv" = tim TV Rakyat Official; null = akun pribadi. */
export const KonteksTimAutoEdit = createContext<string | null>(null);

export function useApiAutoEdit() {
  const tim = useContext(KonteksTimAutoEdit);
  return useMemo(
    () => ({
      tim,
      fetch: (path: string, init: RequestInit = {}) => apiFetch(path, init, tim),
      unggah: (path: string, file: File, onProgres: (persen: number) => void) => apiUnggah(path, file, onProgres, tim),
    }),
    [tim],
  );
}
