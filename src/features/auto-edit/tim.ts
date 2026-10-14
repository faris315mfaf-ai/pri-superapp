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

/**
 * "tv" = tim TV Rakyat Official; "bot:<id>" = akun bot yang disunting master dari Kelola Bot
 * (14 Okt 2026); null = akun pribadi. Nilainya dikirim sebagai header X-Autoedit-Tim.
 */
export const KonteksTimAutoEdit = createContext<string | null>(null);

/** Penanda akun bot untuk konteks di atas. */
export const tandaAkunBot = (userId: number | string): string => `bot:${userId}`;
export const adalahKonteksBot = (tim: string | null): boolean => !!tim && tim.startsWith("bot:");

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
