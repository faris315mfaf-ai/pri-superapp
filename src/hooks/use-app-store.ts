"use client";

// ============================================================
// PRI SuperApp — Store Global (Zustand)
// Auth, tema, toast, push notification, dan notifikasi.
// ============================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NotifikasiItem, User } from "@/types";
import type { PetaIzin } from "@/lib/fitur";

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

/**
 * Berapa lama sesi bertahan setelah aplikasi ditinggalkan.
 *
 * Mengikuti kebiasaan aplikasi m-banking: begitu aplikasi ditutup atau
 * lama di latar belakang, pengguna diminta masuk lagi. Aplikasi ini
 * memuat data kader beserta nomor WhatsApp-nya, jadi ponsel yang
 * berpindah tangan tidak boleh langsung menampilkan isinya.
 */
export const BATAS_SESI_MS = 5 * 60 * 1000; // 5 menit

type AppState = {
  // Autentikasi
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;

  /**
   * Kapan pengguna terakhir terlihat aktif (epoch ms).
   * Diperbarui saat aplikasi dibuka dan saat kembali dari latar
   * belakang; dipakai memutuskan apakah sesinya sudah kedaluwarsa.
   */
  waktuAktifTerakhir: number | null;
  segarkanSesi: () => void;
  /** true bila sesi tersimpan sudah lewat batas dan harus login ulang */
  sesiKedaluwarsa: () => boolean;

  // Tema
  tema: Tema;
  setTema: (tema: Tema) => void;
  /** Skala teks aplikasi: kecil (14px) / normal (16px) / besar (18px) */
  skalaFont: "kecil" | "normal" | "besar";
  setSkalaFont: (s: "kecil" | "normal" | "besar") => void;
  /**
   * true setelah pemuatan notifikasi PERTAMA selesai (sukses atau
   * gagal). Tanpa penanda ini, layar Notifikasi menampilkan skeleton
   * selamanya bila daftarnya memang kosong — bug "loading terus".
   */
  notifikasiSiap: boolean;
  setNotifikasiSiap: () => void;
  /**
   * Izin fitur untuk peran pengguna ini — hanya memuat fitur yang
   * DIMATIKAN super admin. Kunci yang tidak ada berarti nyala, jadi
   * nilai awal {} membuat semua fitur tersedia seperti biasa.
   */
  izinFitur: PetaIzin;
  setIzinFitur: (izin: PetaIzin) => void;

  /** true bila pengguna anggota tim TV Rakyat (buka modul TV) */
  tvAnggota: boolean;
  setTvAnggota: (v: boolean) => void;
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

/**
 * Apakah dua daftar notifikasi benar-benar sama isinya?
 *
 * Dibandingkan dangkal per-field, BUKAN hanya id: field `waktu_relatif`
 * ("13 menit lalu") memang berubah sendiri seiring waktu dan perubahan itu
 * HARUS tampil. Membandingkan id saja akan membekukan teks waktunya.
 */
function samaIsinya(a: NotifikasiItem[], b: NotifikasiItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as Record<string, unknown>;
    const y = b[i] as Record<string, unknown>;
    const kunciX = Object.keys(x);
    if (kunciX.length !== Object.keys(y).length) return false;
    for (const k of kunciX) {
      if (!Object.is(x[k], y[k])) return false;
    }
  }
  return true;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Autentikasi
      user: null,
      setUser: (user) => set({ user, waktuAktifTerakhir: Date.now() }),
      logout: () => set({ user: null, waktuAktifTerakhir: null }),

      waktuAktifTerakhir: null,
      segarkanSesi: () => {
        // Hanya bermakna bila ada yang sedang masuk.
        if (get().user) set({ waktuAktifTerakhir: Date.now() });
      },
      sesiKedaluwarsa: () => {
        const { user, waktuAktifTerakhir } = get();
        if (!user) return false;
        // Tidak ada catatan waktu = sesi dari versi lama aplikasi.
        // Diperlakukan kedaluwarsa supaya tidak ada celah.
        if (!waktuAktifTerakhir) return true;
        return Date.now() - waktuAktifTerakhir > BATAS_SESI_MS;
      },

      // Tema
      tema: "light",
      setTema: (tema) => set({ tema }),
      skalaFont: "normal",
      setSkalaFont: (skalaFont) => set({ skalaFont }),
      notifikasiSiap: false,
      setNotifikasiSiap: () => set({ notifikasiSiap: true }),
      izinFitur: {},
      setIzinFitur: (izinFitur) => set({ izinFitur }),
      tvAnggota: false,
      setTvAnggota: (tvAnggota) => set({ tvAnggota }),
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
      setNotifikasi: (items) =>
        set((keadaan) =>
          // Polling 30 detik hampir selalu membawa isi yang SAMA PERSIS.
          // Kalau referensi array tetap diganti, setiap komponen yang
          // berlangganan daftar ini dirender ulang percuma dua kali semenit —
          // termasuk baris notifikasi yang berat (motion value + gesture drag).
          // Referensi lama dipertahankan bila tidak ada yang benar-benar
          // berubah, sehingga zustand tidak membangunkan siapa pun.
          samaIsinya(keadaan.notifikasi, items)
            ? keadaan
            : { notifikasi: items },
        ),
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
      partialize: (state) => ({
        user: state.user,
        tema: state.tema,
        waktuAktifTerakhir: state.waktuAktifTerakhir,
      }),
    },
  ),
);

// ------------------------------------------------------------
// Helper toast di luar komponen React
// ------------------------------------------------------------

export function toast(jenis: JenisToast, judul: string, isi?: string): void {
  useAppStore.getState().pushToast({ jenis, judul, isi });
}
