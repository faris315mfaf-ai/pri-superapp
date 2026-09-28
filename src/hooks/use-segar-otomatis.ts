"use client";

// ============================================================
// useSegarOtomatis (fitur 1 Sep 2026 — "se-realtime mungkin"):
// panggil `segarkan` berkala HANYA saat layar terlihat, plus
// sekali setiap aplikasi kembali dari latar belakang (visibility/
// focus). Interval mati saat tab disembunyikan — hemat kuota
// Supabase & baterai HP (pilihan user: 30 detik + saat kembali).
//
// 28 Sep 2026 (rencana "200 orang tanpa lag", langkah #1): "terlihat"
// kini juga berarti TAB-nya aktif (use-tab-aktif). Tab yang tersembunyi
// tidak menarik data sama sekali — tidak berkala, tidak saat aplikasi
// kembali dari latar, tidak saat "ada yang baru" — hanya dicatat basi,
// lalu disegarkan SEKALI begitu tab itu dibuka lagi.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/hooks/use-app-store";
import { buatPenjagaTab, useTabAktif } from "@/hooks/use-tab-aktif";

/** Nama peristiwa jendela yang ditembakkan tombol refresh sistem. */
export const PERISTIWA_SEGAR = "pri:segarkan";

/**
 * Versi "segarkan data" global — taruh di deps effect pemuat data supaya
 * tombol refresh kanan atas memuat ulang data komponen itu (tanpa reload).
 *
 * Di tab yang tidak aktif nilainya DIBEKUKAN pada nilai terakhir saat tab
 * itu terlihat; begitu tab aktif lagi, nilai terbaru dikembalikan sehingga
 * pemuatnya berjalan sekali (hanya bila memang ada yang berubah).
 */
export function useVersiSegar(): number {
  const aktif = useTabAktif();
  const versi = useAppStore((s) => s.versiSegar);
  const [beku, setBeku] = useState(versi);
  // Pola resmi React "menyesuaikan state saat masukan berubah" (setState
  // bersyarat saat render) — tanpa effect, tanpa render ganda di layar.
  if (aktif && beku !== versi) setBeku(versi);
  return aktif ? versi : beku;
}

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
  const aktif = useTabAktif();
  const penjagaRef = useRef<ReturnType<typeof buatPenjagaTab> | null>(null);

  // Tab dibuka lagi setelah ada penyegaran yang terlewat → segarkan sekali.
  useEffect(() => {
    if (!penjagaRef.current) penjagaRef.current = buatPenjagaTab(aktif);
    if (penjagaRef.current.ubahAktif(aktif)) {
      terakhirRef.current = Date.now();
      fnRef.current();
    }
  }, [aktif]);

  useEffect(() => {
    const jeda = Math.max(10, jedaDetik) * 1000;
    /** false = tab tidak aktif (dicatat basi) → jangan menarik data. */
    const boleh = () => penjagaRef.current?.minta() ?? true;

    function jalan() {
      // Penjaga jarak minimum: visibility + focus bisa menyala
      // beruntun (buka aplikasi = keduanya) — jangan dobel tembak.
      if (Date.now() - terakhirRef.current < 5000) return;
      if (!boleh()) return;
      terakhirRef.current = Date.now();
      fnRef.current();
    }

    const interval = setInterval(() => {
      // Mode Simpel (4 Sep 2026): tidak ada penyegaran berkala — hemat
      // baterai/kuota; tombol muat ulang & kembali dari latar tetap jalan.
      if (document.documentElement.dataset.modeSimpel === "1") return;
      if (document.visibilityState === "visible") jalan();
    }, jeda);

    function saatTerlihat() {
      if (document.visibilityState === "visible") jalan();
    }
    // Tombol refresh sistem (kanan atas) & "ada yang baru": segarkan
    // SEKARANG, tanpa penjaga jarak — kecuali tabnya sedang tersembunyi.
    function saatDiminta() {
      if (!boleh()) return;
      terakhirRef.current = Date.now();
      fnRef.current();
    }
    document.addEventListener("visibilitychange", saatTerlihat);
    window.addEventListener("focus", saatTerlihat);
    window.addEventListener(PERISTIWA_SEGAR, saatDiminta);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", saatTerlihat);
      window.removeEventListener("focus", saatTerlihat);
      window.removeEventListener(PERISTIWA_SEGAR, saatDiminta);
    };
  }, [jedaDetik]);
}
