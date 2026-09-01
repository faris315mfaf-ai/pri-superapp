"use client";

// ============================================================
// useSegarOtomatis (fitur 1 Sep 2026 — "se-realtime mungkin"):
// panggil `segarkan` berkala HANYA saat layar terlihat, plus
// sekali setiap aplikasi kembali dari latar belakang (visibility/
// focus). Interval mati saat tab disembunyikan — hemat kuota
// Supabase & baterai HP (pilihan user: 30 detik + saat kembali).
// ============================================================

import { useEffect, useRef } from "react";

// Bawaan 30→60 dtk (1 Sep 2026 — pemangkasan beban Supabase): dengan
// ratusan pengguna, tiap detik jeda = puluhan ribu request per hari.
export function useSegarOtomatis(segarkan: () => void, jedaDetik = 60) {
  // Ref supaya interval tidak dipasang ulang tiap render walau
  // pemanggil mengirim fungsi inline baru (disalin lewat effect —
  // menulis ref saat render dilarang aturan react-hooks/refs).
  const fnRef = useRef(segarkan);
  useEffect(() => {
    fnRef.current = segarkan;
  }, [segarkan]);
  const terakhirRef = useRef(Date.now());

  useEffect(() => {
    const jeda = Math.max(10, jedaDetik) * 1000;

    function jalan() {
      // Penjaga jarak minimum: visibility + focus bisa menyala
      // beruntun (buka aplikasi = keduanya) — jangan dobel tembak.
      if (Date.now() - terakhirRef.current < 5000) return;
      terakhirRef.current = Date.now();
      fnRef.current();
    }

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") jalan();
    }, jeda);

    function saatTerlihat() {
      if (document.visibilityState === "visible") jalan();
    }
    document.addEventListener("visibilitychange", saatTerlihat);
    window.addEventListener("focus", saatTerlihat);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", saatTerlihat);
      window.removeEventListener("focus", saatTerlihat);
    };
  }, [jedaDetik]);
}
