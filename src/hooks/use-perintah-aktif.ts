"use client";

// Perintah Video Wajib yang sedang dikerjakan anggota (15 Okt 2026).
//
// Tombol "Buat video dari perintah ini" menyimpannya di sini; formulir Buat
// Video (Edit Otomatis) mengunci kategori ke kategori perintah, dan formulir
// unggah mengirim nomor perintahnya — sehingga video itu tercatat milik
// perintah sampai Insight, tanpa tebakan. Disimpan per PENGGUNA di
// localStorage perangkat (bertahan walau layar ditutup di antara membuat
// video dan mengunggahnya); lepas otomatis setelah unggahan berhasil.
//
// Server tetap memutuskan: perintah yang sudah tidak aktif ditolak saat
// unggah, jadi nilai basi di sini tidak berbahaya.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAppStore } from "@/hooks/use-app-store";
import { kunciPerintahAktif, uraiPerintahAktif, type PerintahAktif } from "@/lib/video-wajib-perintah";

const PERISTIWA = "pri:perintah-aktif";

function langgan(kabari: () => void): () => void {
  window.addEventListener(PERISTIWA, kabari);
  window.addEventListener("storage", kabari);
  return () => {
    window.removeEventListener(PERISTIWA, kabari);
    window.removeEventListener("storage", kabari);
  };
}

export function usePerintahAktif(): [PerintahAktif | null, (p: PerintahAktif | null) => void] {
  const userId = useAppStore((s) => String(s.user?.id ?? ""));
  const kunci = kunciPerintahAktif(userId);
  const mentah = useSyncExternalStore(
    langgan,
    () => {
      if (!userId) return null;
      try {
        return localStorage.getItem(kunci);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const perintah = useMemo(() => uraiPerintahAktif(mentah), [mentah]);
  const atur = useCallback(
    (p: PerintahAktif | null) => {
      if (!userId) return;
      try {
        if (p) localStorage.setItem(kunci, JSON.stringify(p));
        else localStorage.removeItem(kunci);
      } catch {
        // Penyimpanan diblokir: perintah tidak terbawa, anggota memilih kategori sendiri.
      }
      window.dispatchEvent(new Event(PERISTIWA));
    },
    [kunci, userId],
  );
  return [perintah, atur];
}

const KUNCI_KECIL = "pri:video-wajib-kecil";
const PERISTIWA_KECIL = "pri:video-wajib-kecil";

function langgganKecil(kabari: () => void): () => void {
  window.addEventListener(PERISTIWA_KECIL, kabari);
  window.addEventListener("storage", kabari);
  return () => {
    window.removeEventListener(PERISTIWA_KECIL, kabari);
    window.removeEventListener("storage", kabari);
  };
}

/** Panel Video Wajib diciutkan jadi ikon? Per perangkat (localStorage). */
export function usePanelWajibKecil(): [boolean, (kecil: boolean) => void] {
  const kecil = useSyncExternalStore(
    langgganKecil,
    () => {
      try {
        return localStorage.getItem(KUNCI_KECIL) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const atur = useCallback((k: boolean) => {
    try {
      localStorage.setItem(KUNCI_KECIL, k ? "1" : "0");
    } catch {
      // Diblokir: ciutan berlaku sampai halaman dimuat ulang saja.
    }
    window.dispatchEvent(new Event(PERISTIWA_KECIL));
  }, []);
  return [kecil, atur];
}


