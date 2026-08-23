"use client";

// ============================================================
// PRI SuperApp — Store Global (Zustand)
// Auth, tema, toast, push notification, dan notifikasi.
// ============================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NotifikasiItem, User } from "@/types";

// ------------------------------------------------------------
// Tipe
// ------------------------------------------------------------

export type JenisToast = "sukses" | "error" | "info" | "peringatan";

export type ToastItem = {
  id: number;
  jenis: JenisToast;
  judul: string;
  isi?: string;
};

export type PushBannerItem = {
  id: number;
  judul: string;
  isi: string;
  waktu: string;
  target: "qc" | "tv" | "dashboard" | "notifikasi" | null;
};

export type Tema = "light" | "dark";

type AppState = {
  // Autentikasi
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;

  // Tema
  tema: Tema;
  setTema: (tema: Tema) => void;
  toggleTema: () => void;

  // Toast
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, "id">) => void;
  hapusToast: (id: number) => void;

  // Push notification (banner simulasi Android)
  pushBanners: PushBannerItem[];
  pushPushBanner: (banner: Omit<PushBannerItem, "id">) => void;
  hapusPushBanner: (id: number) => void;

  // Notifikasi pusat
  notifikasi: NotifikasiItem[];
  setNotifikasi: (items: NotifikasiItem[]) => void;
  tandaiDibaca: (id: string) => void;
  tandaiSemuaDibaca: () => void;
  hapusNotifikasi: (id: string) => void;
};

let idBerikutnya = 1;
function idBaru(): number {
  return idBerikutnya++;
}

// ------------------------------------------------------------
// Store
// ------------------------------------------------------------

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Autentikasi
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),

      // Tema
      tema: "light",
      setTema: (tema) => set({ tema }),
      toggleTema: () => set({ tema: get().tema === "light" ? "dark" : "light" }),

      // Toast — otomatis hilang setelah 4 detik
      toasts: [],
      pushToast: (toast) => {
        const id = idBaru();
        set((state) => ({
          toasts: [...state.toasts, { ...toast, id }].slice(-4),
        }));
        setTimeout(() => get().hapusToast(id), 4000);
      },
      hapusToast: (id) =>
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

      // Push banner — otomatis hilang setelah 6 detik
      pushBanners: [],
      pushPushBanner: (banner) => {
        const id = idBaru();
        set((state) => ({ pushBanners: [...state.pushBanners, { ...banner, id }] }));
        setTimeout(() => get().hapusPushBanner(id), 6000);
      },
      hapusPushBanner: (id) =>
        set((state) => ({
          pushBanners: state.pushBanners.filter((b) => b.id !== id),
        })),

      // Notifikasi pusat
      notifikasi: [],
      setNotifikasi: (items) => set({ notifikasi: items }),
      tandaiDibaca: (id) =>
        set((state) => ({
          notifikasi: state.notifikasi.map((n) =>
            n.id === id ? { ...n, dibaca: true } : n,
          ),
        })),
      tandaiSemuaDibaca: () =>
        set((state) => ({
          notifikasi: state.notifikasi.map((n) => ({ ...n, dibaca: true })),
        })),
      hapusNotifikasi: (id) =>
        set((state) => ({
          notifikasi: state.notifikasi.filter((n) => n.id !== id),
        })),
    }),
    {
      name: "pri-superapp",
      partialize: (state) => ({ user: state.user, tema: state.tema }),
    },
  ),
);

// ------------------------------------------------------------
// Helper toast di luar komponen React
// ------------------------------------------------------------

export function toast(jenis: JenisToast, judul: string, isi?: string): void {
  useAppStore.getState().pushToast({ jenis, judul, isi });
}
