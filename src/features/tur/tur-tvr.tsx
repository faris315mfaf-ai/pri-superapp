"use client";

// ============================================================
// TurTvr (5 Okt 2026) — tutorial interaktif TVR Saya: sambung ulang akun
// sosmed sampai minimal 5 terhubung → Edit Otomatis (template + buat video)
// → Stok Video (cara posting baru). Mesinnya LapisanTur.
//
// Muncul otomatis SEKALI per pengguna (penanda localStorage berversi),
// menunggu bila tur lain sedang tampil. Bisa dibuka lagi kapan saja dari
// tombol Tutorial di judul Edit Otomatis (mulaiTurTvr).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/hooks/use-app-store";
import {
  keadaanTur,
  LANGKAH_TUR_TVR,
  PERISTIWA_TUR_TVR,
  tandaiTurTvrSelesai,
  turTvrSudahSelesai,
} from "@/lib/tur";
import { LapisanTur } from "./lapisan-tur";

/** Jeda sebelum muncul otomatis — biarkan tur lain & data awal lebih dulu. */
const JEDA_AWAL_MS = 3500;
/** Tur lain sedang tampil: coba lagi selang ini. */
const JEDA_TUNGGU_MS = 20_000;

export function TurTvr() {
  const user = useAppStore((s) => s.user);
  const [aktif, setAktif] = useState(false);
  const [putaran, setPutaran] = useState(0);
  const aktifRef = useRef(false);
  const userId = user?.id ?? "";

  const mulai = useCallback(() => {
    aktifRef.current = true;
    setPutaran((n) => n + 1);
    setAktif(true);
  }, []);

  const akhiri = useCallback(
    (cara: "selesai" | "lewati") => {
      if (userId) tandaiTurTvrSelesai(userId, cara);
      aktifRef.current = false;
      setAktif(false);
    },
    [userId],
  );

  // Tombol Tutorial di Edit Otomatis.
  useEffect(() => {
    window.addEventListener(PERISTIWA_TUR_TVR, mulai);
    return () => window.removeEventListener(PERISTIWA_TUR_TVR, mulai);
  }, [mulai]);

  // Muncul sendiri sekali; tunggu bila tur lain sedang tampil.
  useEffect(() => {
    if (!userId || turTvrSudahSelesai(userId)) return;
    let timer: ReturnType<typeof setTimeout>;
    const coba = () => {
      if (aktifRef.current || turTvrSudahSelesai(userId)) return;
      if (keadaanTur.aktif || document.visibilityState !== "visible") {
        timer = setTimeout(coba, JEDA_TUNGGU_MS);
        return;
      }
      mulai();
    };
    timer = setTimeout(coba, JEDA_AWAL_MS);
    return () => clearTimeout(timer);
  }, [userId, mulai]);

  if (!aktif) return null;
  return (
    <LapisanTur
      key={putaran}
      id="tvr"
      daftar={LANGKAH_TUR_TVR}
      label="Tutorial TVR Saya"
      judulSelesai="Tutorial TVR Saya selesai!"
      isiSelesai={
        "Ringkasnya:\n1. Sambung ulang akun sosmed sampai minimal 5 terhubung.\n2. Buat template (Kotak monas + Bingkai).\n3. Buat video otomatis, atau tambah video jadi ke Stok Video.\n4. Upload dari Stok Video ke sosmed.\n\nVideo di Stok terhapus otomatis setelah 2 hari. Tutorial ini bisa dibuka lagi dari tombol Tutorial di Edit Otomatis."
      }
      onAkhiri={akhiri}
    />
  );
}
