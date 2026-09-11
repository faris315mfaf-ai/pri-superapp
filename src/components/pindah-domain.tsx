"use client";

// ============================================================
// PEMBERITAHUAN PINDAH ALAMAT (12 Sep 2026)
//
// Aplikasi sudah pindah ke pri-superapp.com. Salinan lama di
// pri-superapp.vercel.app SENGAJA tidak dimatikan dan sengaja TIDAK
// dialihkan paksa: APK yang sudah terpasang di ponsel anggota terkunci
// ke alamat lama itu. Pengalihan paksa ke domain lain membuat APK
// keluar dari wilayahnya sendiri — yang muncul bukan aplikasi, tapi
// jendela peramban dengan bilah alamat.
//
// Jadi yang lama tetap bekerja seperti biasa, hanya diberi tahu: ini
// sudah pindah, ini alamat barunya. Orang memutuskan sendiri kapan
// berpindah, dan tidak ada yang kehilangan aplikasinya mendadak.
//
// Tidak tampil sama sekali di alamat yang benar, jadi tidak ada beban
// tambahan bagi pemakai yang sudah pindah.
// ============================================================

import { useEffect, useState } from "react";
import { ArrowRight, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ditunda sehari kalau dipilih "Nanti saja" — bukan selamanya. */
const KUNCI_TUNDA = "pri-pindah-domain-tunda";
const SEHARI = 24 * 60 * 60 * 1000;

/**
 * Perlu tidaknya pemberitahuan ditampilkan.
 *
 * Sengaja dipisah dari tampilannya: inilah bagian yang kalau salah,
 * pemberitahuan muncul di tempat yang tidak semestinya — di alamat yang
 * sudah benar, atau di layar pengembang sendiri.
 */
export function perluPemberitahuanPindah({
  hostSekarang,
  tujuan,
  tundaSampai = 0,
  sekarang = Date.now(),
}: {
  hostSekarang: string;
  tujuan: string;
  tundaSampai?: number;
  sekarang?: number;
}): boolean {
  let tuan: string;
  try {
    tuan = new URL(tujuan).hostname;
  } catch {
    return false; // alamat tujuan tidak masuk akal — lebih baik diam
  }
  if (!tuan) return false;
  // Sudah di alamat yang benar: tidak ada yang perlu diberitahukan.
  if (hostSekarang === tuan) return false;
  // Hanya salinan lama di Vercel. Localhost dan pratinjau lain tidak
  // ikut diganggu saat pengembangan.
  if (!hostSekarang.endsWith(".vercel.app")) return false;
  // Pernah memilih "Nanti saja" dan waktunya belum lewat.
  if (sekarang < tundaSampai) return false;
  return true;
}

export function PindahDomain({ tujuan }: { tujuan: string }) {
  const [tampil, setTampil] = useState(false);
  const [masuk, setMasuk] = useState(false);

  useEffect(() => {
    // Dibungkus supaya keadaan tidak disetel langsung di dalam efek.
    const id = window.setTimeout(() => {
      let tundaSampai = 0;
      try {
        tundaSampai = Number(localStorage.getItem(KUNCI_TUNDA) ?? 0) || 0;
      } catch {
        /* penyimpanan diblokir: anggap belum pernah ditunda */
      }
      if (perluPemberitahuanPindah({ hostSekarang: window.location.hostname, tujuan, tundaSampai })) {
        setTampil(true);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [tujuan]);

  // Dipisah dari langkah di atas supaya animasi masuk benar-benar
  // berjalan: elemennya harus sempat tergambar dalam keadaan awal dulu.
  useEffect(() => {
    if (!tampil) return;
    const id = window.setTimeout(() => setMasuk(true), 20);
    return () => window.clearTimeout(id);
  }, [tampil]);

  if (!tampil) return null;

  const pindah = () => {
    const { pathname, search } = window.location;
    window.location.href = tujuan.replace(/\/$/, "") + pathname + search;
  };

  const nanti = () => {
    try {
      localStorage.setItem(KUNCI_TUNDA, String(Date.now() + SEHARI));
    } catch {
      /* tidak bisa disimpan: paling-paling muncul lagi nanti */
    }
    setMasuk(false);
    window.setTimeout(() => setTampil(false), 200);
  };

  const alamatBaru = (() => {
    try {
      return new URL(tujuan).hostname;
    } catch {
      return tujuan;
    }
  })();

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="judul-pindah"
    >
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        style={{
          opacity: masuk ? 1 : 0,
          transition: "opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
        aria-hidden="true"
      />
      <div
        className={cn(
          "glass-strong relative w-full max-w-[380px] rounded-[1.75rem] px-6 pt-7 pb-6 text-center",
        )}
        style={{
          // Tidak dari nol: benda yang muncul dari ketiadaan terasa
          // mengagetkan, bukan hadir.
          opacity: masuk ? 1 : 0,
          transform: masuk ? "scale(1)" : "scale(0.95)",
          transition:
            "opacity 220ms cubic-bezier(0.23, 1, 0.32, 1), transform 220ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <span
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
          aria-hidden="true"
        >
          <Globe className="h-7 w-7" />
        </span>

        <h2 id="judul-pindah" className="font-heading text-xl font-extrabold text-teks-utama">
          Alamat Kita Sudah Pindah
        </h2>

        <p className="mt-2.5 text-[13px] leading-relaxed text-teks-sekunder">
          PRI SuperApp sekarang ada di rumah sendiri:
        </p>
        <p className="mt-1 font-heading text-[15px] font-bold text-teks-utama break-all">
          {alamatBaru}
        </p>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-teks-sekunder">
          Alamat lama masih bisa dipakai untuk sementara, tapi semua yang
          baru hanya ada di alamat baru. Sebaiknya pindah sekarang.
        </p>

        <button
          type="button"
          onClick={pindah}
          className="btn-tekan mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[14px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
        >
          Buka Alamat Baru
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={nanti}
          className="btn-tekan mt-2 w-full rounded-2xl px-5 py-2.5 text-[13px] font-semibold text-teks-sekunder"
        >
          Nanti saja
        </button>
      </div>
    </div>
  );
}
