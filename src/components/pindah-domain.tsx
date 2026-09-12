"use client";

// ============================================================
// PINDAH ALAMAT — PENGALIHAN PAKSA (12 Sep 2026)
//
// Aplikasi sudah pindah ke pri-superapp.com. Salinan lama di
// pri-superapp.vercel.app tidak lagi boleh dipakai: datanya sama, tapi
// yang baru hanya dikerjakan di alamat baru, dan dua pintu masuk untuk
// satu aplikasi cuma membingungkan.
//
// Sebelumnya ini cuma pemberitahuan yang bisa ditunda. Sekarang semua
// yang membuka alamat lama DIALIHKAN, termasuk yang baru sampai di
// halaman masuk — tidak ada tombol "nanti saja".
//
// Tapi tidak dilempar diam-diam: orang diberi tahu dulu, dimintai maaf,
// lalu dipindahkan sendiri beberapa detik kemudian. Pengalihan yang
// tiba-tiba tanpa penjelasan membuat orang mengira aplikasinya rusak.
//
// Dikerjakan di sisi peramban, BUKAN pengalihan server, justru supaya
// kalimat maaf itu sempat terbaca.
// ============================================================

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

/** Jeda sebelum dipindahkan sendiri — cukup untuk membaca, tidak lama. */
const JEDA_PINDAH_MS = 4000;

/**
 * Perlu tidaknya pengalihan dijalankan.
 *
 * Sengaja dipisah dari tampilannya: inilah bagian yang kalau salah,
 * orang dilempar dari alamat yang sudah benar — atau layar pengembang
 * ikut terlempar setiap kali aplikasi dijalankan.
 */
export function perluPemberitahuanPindah({
  hostSekarang,
  tujuan,
}: {
  hostSekarang: string;
  tujuan: string;
}): boolean {
  let tuan: string;
  try {
    tuan = new URL(tujuan).hostname;
  } catch {
    return false; // alamat tujuan tidak masuk akal — lebih baik diam
  }
  if (!tuan) return false;
  // Sudah di alamat yang benar: tidak ada yang perlu dialihkan.
  if (hostSekarang === tuan) return false;
  // Hanya salinan lama di Vercel. Localhost dan pratinjau lain tidak
  // ikut terlempar saat pengembangan.
  return hostSekarang.endsWith(".vercel.app");
}

/** Alamat tujuan lengkap, mempertahankan halaman yang sedang dibuka. */
export function alamatPindah(tujuan: string, pathname: string, search: string): string {
  return tujuan.replace(/\/+$/, "") + pathname + search;
}

/**
 * Maskot bulat yang sedang minta maaf: menunduk sedikit, satu tangan
 * terangkat. Digambar langsung (bukan berkas gambar) supaya tetap tajam
 * di layar mana pun dan tidak menambah satu pun unduhan — layar ini
 * justru muncul saat orang sedang mau pergi ke alamat lain.
 */
function Maskot() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="h-28 w-28"
      role="img"
      aria-label="Maskot sedang meminta maaf"
    >
      <defs>
        <linearGradient id="pindah-badan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      {/* Bayangan tipis: membuatnya terasa berpijak, bukan melayang. */}
      <ellipse cx="60" cy="107" rx="30" ry="5" fill="#000" opacity="0.12" />
      {/* Badan gembul */}
      <circle cx="60" cy="62" r="40" fill="url(#pindah-badan)" />
      {/* Tangan terangkat */}
      <circle cx="97" cy="44" r="10" fill="url(#pindah-badan)" />
      {/* Pipi bersemu */}
      <ellipse cx="42" cy="70" rx="7" ry="4.5" fill="#EF4444" opacity="0.28" />
      <ellipse cx="78" cy="70" rx="7" ry="4.5" fill="#EF4444" opacity="0.28" />
      {/* Mata menunduk — garis melengkung, bukan titik, supaya terbaca
          sebagai menyesal dan bukan sekadar diam. */}
      <path
        d="M38 55 q6 -7 12 0"
        stroke="#78350F"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M70 55 q6 -7 12 0"
        stroke="#78350F"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Mulut kecil */}
      <ellipse cx="60" cy="74" rx="4.5" ry="5.5" fill="#78350F" opacity="0.85" />
    </svg>
  );
}

export function PindahDomain({ tujuan }: { tujuan: string }) {
  const [tampil, setTampil] = useState(false);
  const [masuk, setMasuk] = useState(false);

  useEffect(() => {
    // Dibungkus supaya keadaan tidak disetel langsung di dalam efek.
    const id = window.setTimeout(() => {
      if (perluPemberitahuanPindah({ hostSekarang: window.location.hostname, tujuan })) {
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

  // Pindah sendiri setelah kalimatnya sempat terbaca.
  useEffect(() => {
    if (!tampil) return;
    const id = window.setTimeout(() => {
      const { pathname, search } = window.location;
      window.location.replace(alamatPindah(tujuan, pathname, search));
    }, JEDA_PINDAH_MS);
    return () => window.clearTimeout(id);
  }, [tampil, tujuan]);

  if (!tampil) return null;

  const pindahSekarang = () => {
    const { pathname, search } = window.location;
    // replace, bukan href: alamat lama tidak perlu tersimpan di riwayat
    // peramban — tombol "kembali" tidak boleh mengembalikan orang ke sini.
    window.location.replace(alamatPindah(tujuan, pathname, search));
  };

  const alamatBaru = (() => {
    try {
      return new URL(tujuan).hostname;
    } catch {
      return tujuan;
    }
  })();

  return (
    // Menutup SELURUH layar, termasuk halaman masuk, dan tidak bisa
    // ditutup: tidak ada latar yang bisa diklik dan tidak ada tombol
    // batal. Aplikasi lama memang sudah tidak dipakai lagi.
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-app-bg px-6 text-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="judul-pindah"
      style={{
        opacity: masuk ? 1 : 0,
        transition: "opacity 260ms cubic-bezier(0.23, 1, 0.32, 1)",
      }}
    >
      <div
        style={{
          // Tidak dari nol: benda yang muncul dari ketiadaan terasa
          // mengagetkan, bukan hadir.
          transform: masuk ? "scale(1)" : "scale(0.94)",
          transition: "transform 320ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <Maskot />
      </div>

      <h1
        id="judul-pindah"
        className="mt-4 font-heading text-2xl font-extrabold text-teks-utama"
      >
        Mohon Maaf
      </h1>

      <p className="mt-3 max-w-[330px] text-[13.5px] leading-relaxed text-teks-sekunder">
        Alamat ini sudah tidak dipakai lagi. PRI SuperApp sekarang ada di
        rumahnya sendiri, dan Anda sedang dipindahkan ke sana.
      </p>

      <p className="mt-3 font-heading text-[16px] font-bold text-teks-utama break-all">
        {alamatBaru}
      </p>

      <button
        type="button"
        onClick={pindahSekarang}
        className="btn-tekan mt-7 flex w-full max-w-[300px] items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[14px] font-bold text-white"
        style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
      >
        Lanjut Sekarang
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>

      <p className="mt-3 text-[11.5px] text-teks-sekunder">
        Dipindahkan otomatis dalam beberapa detik…
      </p>
    </div>
  );
}
