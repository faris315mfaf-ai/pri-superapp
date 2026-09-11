import type { NextConfig } from "next";

// Versi dibaca dari package.json supaya layar "Tentang Aplikasi"
// tidak pernah berbeda dari versi aplikasi yang sebenarnya.
import { version as versiPaket } from "./package.json";

/**
 * Nama host Supabase dari SUPABASE_URL. Dibaca saat BUILD karena daftar
 * host next/image memang ditentukan saat build; kalau kosong atau salah
 * bentuk, cukup dilewati tanpa menggagalkan build.
 */
const hostSupabase = (() => {
  try {
    const u = (process.env.SUPABASE_URL ?? "").trim();
    return u ? new URL(u).hostname : "";
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_VERSI_APLIKASI: versiPaket },
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  reactStrictMode: false,
  // Host gambar yang boleh dioptimalkan next/image. Thumbnail berita
  // hasil pindaian TIDAK didaftarkan (host CDN-nya berubah-ubah) dan
  // tetap memakai <img> biasa.
  images: {
    remotePatterns: [
      // Host Supabase dibaca dari env (11 Sep 2026) supaya pindah ke
      // server sendiri tidak membuat next/image menolak foto profil &
      // sampul video. Nama lama tetap didaftarkan selama masa peralihan.
      ...(hostSupabase ? [{ protocol: "https" as const, hostname: hostSupabase }] : []),
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
  // ------------------------------------------------------------
  // VERCEL JADI PENUNJUK JALAN (12 Sep 2026)
  //
  // Aplikasi sudah pindah ke server sendiri. Tapi Vercel TIDAK dimatikan
  // begitu saja: APK yang sudah terpasang di ponsel anggota terkunci ke
  // alamat lama, dan mematikannya mendadak membuat semua pemakai APK
  // kehilangan aplikasinya sekaligus.
  //
  // Jadi salinan di Vercel diubah jadi penunjuk jalan: apa pun yang
  // datang ke sana diteruskan ke domain sendiri. Pemakai lama tetap
  // sampai ke tujuan sampai sempat memasang APK baru.
  //
  // HANYA berlaku di Vercel. Variabel VERCEL diisi sendiri oleh Vercel
  // saat membangun; di server sendiri ia kosong, jadi tidak ada
  // pengalihan sama sekali di sana.
  //
  // Sengaja TIDAK permanen, supaya peramban tidak mengingatnya selamanya.
  // Kalau suatu saat Vercel perlu dipakai lagi, cukup dibatalkan tanpa
  // menunggu ingatan peramban orang hilang sendiri.
  // ------------------------------------------------------------
  async redirects() {
    if (!process.env.VERCEL) return [];
    const tujuan = (process.env.APP_URL || "https://pri-superapp.com").replace(/\/+$/, "");
    return [{ source: "/:jalur*", destination: tujuan + "/:jalur*", permanent: false }];
  },

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
            // publickey-credentials-*: login sidik jari WebAuthn (1.21)
            // dari origin sendiri (default sudah self, ditulis eksplisit).
            value:
              "camera=(self), microphone=(self), geolocation=(self), publickey-credentials-get=(self), publickey-credentials-create=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
