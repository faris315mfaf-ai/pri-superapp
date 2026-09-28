"use client";

// ============================================================
// TAB AKTIF (28 Sep 2026) — rencana "200 orang tanpa lag", langkah #1.
//
// page.tsx membiarkan tab yang pernah dibuka tetap TERPASANG (state
// terjaga), hanya disembunyikan. Dulu penyegar di tab tersembunyi tetap
// berjalan: tab Chat yang ditinggal menarik daftar chat 8x/menit, dan
// setiap "ada yang baru" memuat ulang SEMUA tab yang pernah dibuka
// (±28 panggilan per HP per kejadian).
//
// Kini page.tsx membungkus tiap tab dengan KonteksTabAktif. Penyegar
// (useSegarOtomatis, useVersiSegar, useIntervalAktif) diam selama tabnya
// tidak terlihat, mencatat bahwa datanya BASI, lalu menyegarkan SEKALI
// begitu tab itu dibuka lagi. Komponen di luar tab (sub-layar, global)
// tetap dianggap aktif — nilai bawaan konteks = true.
// ============================================================

import { createContext, useContext, useEffect, useRef } from "react";

export const KonteksTabAktif = createContext(true);

/** true bila layar ini sedang terlihat (tab aktif, tanpa sub-layar di atasnya). */
export function useTabAktif(): boolean {
  return useContext(KonteksTabAktif);
}

/**
 * MURNI (diuji): pengatur "jalan sekarang atau tandai basi".
 * - `minta()` → true bila boleh jalan sekarang; bila tab tidak aktif,
 *   dicatat basi dan mengembalikan false.
 * - `ubahAktif(aktif)` → true bila baru aktif lagi DAN ada yang basi
 *   (pemanggil menyegarkan sekali).
 */
export function buatPenjagaTab(aktifAwal: boolean) {
  let aktif = aktifAwal;
  let basi = false;
  return {
    minta(): boolean {
      if (aktif) return true;
      basi = true;
      return false;
    },
    ubahAktif(baru: boolean): boolean {
      const kembali = baru && !aktif;
      aktif = baru;
      if (kembali && basi) {
        basi = false;
        return true;
      }
      return false;
    },
    get aktif() {
      return aktif;
    },
  };
}

/**
 * Ref berisi status tab aktif — untuk setInterval lama yang cukup diberi
 * satu baris `if (!aktifRef.current) return;` tanpa ditulis ulang.
 */
export function useRefTabAktif() {
  const aktif = useTabAktif();
  const ref = useRef(aktif);
  useEffect(() => {
    ref.current = aktif;
  }, [aktif]);
  return ref;
}

/**
 * setInterval yang sadar tab: berdetak hanya saat halaman terlihat DAN tab
 * aktif; detak yang terlewat membuat `fn` dipanggil sekali saat tab aktif
 * lagi. `ms <= 0` / `nyala=false` = mati.
 */
export function useIntervalAktif(fn: () => void, ms: number, nyala = true) {
  const aktif = useTabAktif();
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  const penjagaRef = useRef<ReturnType<typeof buatPenjagaTab> | null>(null);

  useEffect(() => {
    if (!penjagaRef.current) penjagaRef.current = buatPenjagaTab(aktif);
    if (penjagaRef.current.ubahAktif(aktif) && nyala) fnRef.current();
  }, [aktif, nyala]);

  useEffect(() => {
    if (!nyala || ms <= 0) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const p = penjagaRef.current;
      if (p && !p.minta()) return;
      fnRef.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms, nyala]);
}
