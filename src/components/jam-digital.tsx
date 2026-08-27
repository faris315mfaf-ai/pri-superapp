"use client";

// ============================================================
// JamDigital — jam WIB real-time Jam:Menit:Detik (spek 1.15).
//
// Detik yang berdetak dirender di komponen KECIL yang terisolasi:
// setInterval 1 detik hanya me-render ulang teks jam ini, bukan
// seluruh Beranda. angka-tab (tabular-nums) mencegah lebar teks
// bergoyang tiap digit berganti.
// ============================================================

import { useEffect, useState } from "react";

function jamWibSekarang(): string {
  return new Date().toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function JamDigital({ className }: { className?: string }) {
  // Nilai awal langsung diisi jam sekarang — server & klien pasti
  // menghasilkan detik berbeda, tapi hanya TEKSNYA yang beda dan
  // suppressHydrationWarning di span menutup selisih itu. Ini lebih
  // tangguh daripada menunda lewat effect (yang tertahan di tab
  // tersembunyi).
  const [jam, setJam] = useState(jamWibSekarang);

  useEffect(() => {
    const detak = setInterval(() => setJam(jamWibSekarang()), 1000);
    return () => clearInterval(detak);
  }, []);
  return (
    <span
      className={className}
      aria-label={`Jam WIB sekarang ${jam}`}
      suppressHydrationWarning
    >
      <span className="angka-tab">{jam.replace(/\./g, ":")}</span>
      <span className="ml-1 text-[0.7em] font-semibold opacity-70">WIB</span>
    </span>
  );
}
