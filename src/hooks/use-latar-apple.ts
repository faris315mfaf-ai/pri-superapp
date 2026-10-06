"use client";

// ============================================================
// Tema tampilan akun uji coba (6 Okt 2026): Pagi · Sore · Malam (desain
// Apple berlatar ilustrasi) atau Classic (tampilan asli aplikasi).
//
// Disimpan per AKUN di server (preferensi "latar") supaya ikut ke semua
// perangkat, dengan salinan localStorage agar latar langsung tampil saat
// aplikasi dibuka (tanpa kedip menunggu jaringan). Satu sumber untuk semua
// pemakai (latar di belakang setiap layar + pemilih di Profil) lewat
// useSyncExternalStore.
//
// Belum pernah memilih = null → tema bawaan akun (latarBawaan: akun uji
// coba Pagi, master lain Classic).
//
// Aturan: latar Malam hanya berlaku di mode gelap — di mode terang yang
// tampil Pagi (lihat latarEfektif). Classic mematikan desain Apple
// sepenuhnya (tema, latar, Dock) — lihat temaApple.
// ============================================================

import { useCallback, useSyncExternalStore } from "react";
import { getPreferensi, simpanPreferensi } from "@/services";
import { useAppStore } from "@/hooks/use-app-store";
import { latarBawaan } from "@/lib/desain-apple";

export type Latar = "pagi" | "sore" | "malam" | "classic";
const SAH: readonly Latar[] = ["pagi", "sore", "malam", "classic"];
const KUNCI_LOKAL = "pri:latar";
const PERISTIWA = "pri:latar";

let nilai: Latar | null = null;
let sudahBaca = false;
let sudahTarikServer = false;

function sah(v: unknown): Latar | null {
  return SAH.includes(v as Latar) ? (v as Latar) : null;
}

function baca(): Latar | null {
  if (sudahBaca) return nilai;
  sudahBaca = true;
  try {
    nilai = sah(localStorage.getItem(KUNCI_LOKAL));
  } catch {
    nilai = null;
  }
  return nilai;
}

function kabari(): void {
  window.dispatchEvent(new Event(PERISTIWA));
}

function langgan(cb: () => void): () => void {
  window.addEventListener(PERISTIWA, cb);
  // Pilihan tersimpan di server menang atas salinan lokal (perangkat lain).
  if (!sudahTarikServer) {
    sudahTarikServer = true;
    void getPreferensi().then((pref) => {
      const dariServer = sah(pref.latar);
      if (dariServer && dariServer !== baca()) {
        nilai = dariServer;
        try {
          localStorage.setItem(KUNCI_LOKAL, dariServer);
        } catch {
          // penyimpanan lokal diblokir: tetap berlaku sesi ini
        }
        kabari();
      }
    });
  }
  return () => window.removeEventListener(PERISTIWA, cb);
}

/** Latar yang benar-benar tampil: Malam hanya di mode gelap. */
export function latarEfektif(latar: Latar, gelap: boolean): Latar {
  return latar === "malam" && !gelap ? "pagi" : latar;
}

/** Desain Apple aktif kecuali pengguna memilih tampilan Classic. */
export function temaApple(latar: Latar): boolean {
  return latar !== "classic";
}

export function useLatarApple(): [Latar, (l: Latar) => void] {
  const tersimpan = useSyncExternalStore(langgan, baca, () => null);
  const bawaan = useAppStore((s) => latarBawaan(s.user));
  const latar = tersimpan ?? bawaan;
  const atur = useCallback((l: Latar) => {
    nilai = l;
    sudahBaca = true;
    try {
      localStorage.setItem(KUNCI_LOKAL, l);
    } catch {
      // penyimpanan lokal diblokir: tetap berlaku sesi ini
    }
    kabari();
    void simpanPreferensi("latar", l).catch(() => undefined);
  }, []);
  return [latar, atur];
}
