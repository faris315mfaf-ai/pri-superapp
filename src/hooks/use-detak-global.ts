"use client";
// ============================================================
// useDetakGlobal (10 Sep 2026) — PENYEGARAN LATAR BELAKANG 10 DETIK.
//
// Dipasang SEKALI di aplikasi (page.tsx). Tiap 10 detik ia menanyakan
// satu hal murah ke /api/detak: "ada yang baru?" Bila tandanya berubah,
// ia memanggil segarkanData() — jalur yang sama dengan tombol refresh
// kanan atas — sehingga SEMUA layar yang sedang terbuka (beranda, KPI,
// notifikasi, dashboard, TVR Saya, …) menarik ulang datanya seketika.
//
// Aturan main:
// - Hanya saat layar TERLIHAT. Tab di latar belakang tidak menembak
//   apa pun (hemat baterai & kuota).
// - Mode Simpel dilewati (memang dirancang tanpa proses latar).
// - Jitter acak ±2 detik supaya ratusan perangkat tidak menabrak server
//   pada detik yang sama.
// - Pengguna DIAM > 3 menit (tidak menyentuh/mengetik/menggulir sama
//   sekali) = tab ditinggal: jeda melambat ke 30 detik. Sentuhan pertama
//   mengembalikannya ke 10 detik seketika. Tanpa ini, satu tab yang lupa
//   ditutup semalaman menembak ribuan permintaan untuk penonton nol.
// - Gagal berturut-turut = mundur berlipat (10 → 20 → 40 … maks 160
//   detik), lalu normal lagi begitu berhasil. Gangguan jaringan tidak
//   berubah menjadi badai permintaan.
//
// SATU RANTAI SAJA: `jadwalkan()` selalu membatalkan timer sebelumnya dan
// `periksa()` menolak berjalan tumpang tindih. Tanpa dua penjaga itu,
// sentuhan/pergantian tab yang datang saat pemeriksaan masih berjalan
// bisa melahirkan rantai timer kedua — detaknya diam-diam berlipat.
// ============================================================
import { useEffect, useRef } from "react";
import { useAppStore } from "@/hooks/use-app-store";
import { getDetak } from "@/services";

/** Jeda antar-detak (permintaan user 10 Sep 2026: 10 detik). */
export const JEDA_DETAK_MS = 10_000;
const JITTER_MS = 2_000;
const MAKS_MUNDUR = 4; // 2^4 = 16x → maksimal ±160 detik
/** Diam selama ini = tab ditinggal; detak melambat sampai disentuh lagi. */
const DIAM_MS = 3 * 60_000;
const JEDA_DIAM_MS = 30_000;
/** Peristiwa yang dihitung sebagai "penggunanya masih di sini". */
const PERISTIWA_SENTUH = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function useDetakGlobal(aktif: boolean) {
  // Tanda terakhir & jumlah kegagalan disimpan di ref: berubahnya tidak
  // perlu me-render ulang apa pun.
  const tandaRef = useRef<string | null>(null);
  const gagalRef = useRef(0);
  // Aplikasi baru dibuka = penggunanya jelas sedang ada di depan layar.
  const sentuhRef = useRef(Date.now());

  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sedang = false;

    function jadwalkan() {
      if (!hidup) return;
      if (timer) clearTimeout(timer);
      const lipat = 2 ** Math.min(gagalRef.current, MAKS_MUNDUR);
      const diam = Date.now() - sentuhRef.current > DIAM_MS;
      const dasar = diam ? JEDA_DIAM_MS : JEDA_DETAK_MS;
      timer = setTimeout(periksa, dasar * lipat + Math.random() * JITTER_MS);
    }

    async function periksa() {
      if (!hidup || sedang) return;
      // Tab tersembunyi / Mode Simpel: lewati giliran ini tanpa memanggil
      // server, tapi tetap jadwalkan giliran berikutnya.
      if (
        document.visibilityState !== "visible" ||
        document.documentElement.dataset.modeSimpel === "1"
      ) {
        jadwalkan();
        return;
      }
      sedang = true;
      try {
        const { tanda, hadir } = await getDetak();
        gagalRef.current = 0;
        // Siapa yang sedang membuka aplikasi (titik hijau & hitungan di Chat).
        useAppStore.getState().setHadir(hadir);
        // Detak PERTAMA hanya merekam keadaan awal — data baru saja
        // dimuat, jadi tidak perlu langsung ditarik ulang.
        if (tandaRef.current !== null && tanda !== tandaRef.current) {
          useAppStore.getState().segarkanData();
        }
        tandaRef.current = tanda;
      } catch {
        gagalRef.current += 1;
      } finally {
        sedang = false;
        jadwalkan();
      }
    }

    // Kembali dari latar belakang: periksa segera, jangan menunggu giliran.
    function saatTerlihat() {
      if (document.visibilityState !== "visible" || sedang) return;
      void periksa();
    }

    // Sentuhan pertama setelah lama diam: kembalikan ke irama 10 detik
    // sekarang juga, jangan menunggu sisa jeda 30 detik.
    function saatDisentuh() {
      const bangun = Date.now() - sentuhRef.current > DIAM_MS;
      sentuhRef.current = Date.now();
      if (bangun && !sedang) jadwalkan();
    }

    jadwalkan();
    document.addEventListener("visibilitychange", saatTerlihat);
    for (const p of PERISTIWA_SENTUH) {
      window.addEventListener(p, saatDisentuh, { passive: true });
    }
    return () => {
      hidup = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", saatTerlihat);
      for (const p of PERISTIWA_SENTUH) window.removeEventListener(p, saatDisentuh);
    };
  }, [aktif]);
}
