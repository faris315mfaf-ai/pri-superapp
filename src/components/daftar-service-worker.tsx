"use client";

// ============================================================
// DaftarServiceWorker — mendaftarkan /sw.js sekali saat aplikasi
// dibuka. Tanpa ini Android menolak memasang aplikasi ke layar
// beranda, dan PWABuilder menolak membuatkan APK.
//
// Komponen ini sengaja tidak menampilkan apa pun.
// ============================================================

import { useEffect } from "react";

export function DaftarServiceWorker() {
  useEffect(() => {
    // Aplikasi berhasil dijalankan → hapus penanda pemulihan yang
    // dipasang skrip jaring pengaman di layout. Tanpa penghapusan ini,
    // penanda bertahan sepanjang sesi dan pemulihan otomatis hanya
    // bisa menolong sekali saja, padahal masalahnya bisa muncul lagi
    // setelah pembaruan berikutnya.
    try {
      sessionStorage.removeItem("pri-pulih-sekali");
    } catch {
      // Penyimpanan sesi diblokir (mode privat) — abaikan.
    }

    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Didaftarkan setelah halaman selesai memuat supaya tidak
    // memperebutkan bandwidth dengan tampilan awal aplikasi.
    const daftar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Gagal mendaftar bukan kesalahan fatal — aplikasi tetap
        // berjalan normal sebagai situs biasa, hanya tidak bisa
        // dipasang. Tidak perlu mengganggu pengguna dengan pesan.
      });
    };

    if (document.readyState === "complete") {
      daftar();
      return;
    }
    window.addEventListener("load", daftar);
    return () => window.removeEventListener("load", daftar);
  }, []);

  return null;
}
