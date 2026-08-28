"use client";

// ============================================================
// TombolGoogle — tombol "Masuk dengan Google" + divider "atau"
// (fitur 1.19/3.1). Reusable: dipakai FormMasuk, dan bisa dipakai
// layar lain yang butuh pintu masuk Google.
//
// Mengikuti Google Branding Guidelines: tombol putih, border abu,
// logo "G" resmi berwarna. Alurnya REDIRECT dokumen penuh ke
// /api/login/google (route API lalu 302 ke halaman izin Google) —
// router Next tidak bisa dipakai untuk itu.
// ============================================================

import { useState } from "react";
import { Loader2 } from "lucide-react";

export function TombolGoogle({
  disabled = false,
  label = "Masuk dengan Google",
}: {
  disabled?: boolean;
  /** Teks tombol — form Daftar memakai "Daftar dengan Google". */
  label?: string;
}) {
  // Loading tidak pernah di-reset: halaman memang akan pergi ke Google.
  const [menuju, setMenuju] = useState(false);

  return (
    <>
      <div className="mt-1 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        <span className="text-[11px] font-medium text-teks-sekunder">atau</span>
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
      </div>
      <button
        type="button"
        disabled={disabled || menuju}
        onClick={() => {
          setMenuju(true);
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- tujuan akhirnya situs Google (via 302 route API), bukan halaman Next
          window.location.href = `${window.location.origin}/api/login/google`;
        }}
        className="btn-tekan flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white text-sm font-semibold text-[#1F1F1F] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {menuju ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin" />
        ) : (
          <IkonGoogle className="h-[18px] w-[18px] shrink-0" />
        )}
        {menuju ? "Menuju Google..." : label}
      </button>
    </>
  );
}

/** Logo "G" resmi Google (warna baku dari brand guidelines). */
export function IkonGoogle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.29C4.672 5.166 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
