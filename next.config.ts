import type { NextConfig } from "next";

// Versi dibaca dari package.json supaya layar "Tentang Aplikasi"
// tidak pernah berbeda dari versi aplikasi yang sebenarnya.
import { version as versiPaket } from "./package.json";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_VERSI_APLIKASI: versiPaket },
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  reactStrictMode: false,
  // Host gambar yang boleh dioptimalkan next/image. Thumbnail berita
  // hasil pindaian TIDAK didaftarkan (host CDN-nya berubah-ubah) dan
  // tetap memakai <img> biasa.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pichnkyjepsirpclofhs.supabase.co" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Avatar akun Google (fitur 1.19/3.1): pengguna yang masuk lewat
      // Google membawa foto profil dari CDN googleusercontent.
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
  // Jangan mengiklankan teknologi server ke setiap pengunjung.
  poweredByHeader: false,

  // Header keamanan untuk SEMUA route. Catatan pilihan:
  // - X-Frame-Options DENY: aplikasi dibungkus APK WebView yang memuat
  //   origin yang sama secara langsung (bukan lewat iframe), dan tidak
  //   ada bagian app yang meng-iframe dirinya sendiri — DENY aman.
  // - HSTS 2 tahun + includeSubDomains: app selalu di balik HTTPS
  //   (Vercel/Caddy); preload sengaja tidak dipasang karena butuh
  //   pendaftaran domain terpisah.
  // - Permissions-Policy: kamera dipakai lewat getUserMedia dari origin
  //   sendiri (absensi & foto profil) — kebijakan di bawah hanya
  //   menutup akses untuk PIHAK KETIGA (daftar izin kosong berarti
  //   tidak ada origin luar yang boleh; origin sendiri diatur lewat
  //   allowlist "self" pada kamera/mikrofon/geolokasi).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            // microphone=(self): mik dipakai mode suara Asisten AI
            // (fitur 1.20/3) dari origin sendiri. Dulu "()" (kosong) —
            // itu MEMBLOKIR mik untuk semua termasuk aplikasi sendiri,
            // sehingga prompt izin tidak pernah muncul (bug 1.20.1).
            value: "camera=(self), microphone=(self), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
