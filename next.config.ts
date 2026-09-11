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

/**
 * Host penyimpanan berkas yang SELALU boleh, apa pun isi env saat build.
 *
 * Pelajaran mahal (12 Sep 2026): daftar host next/image ditentukan saat
 * BUILD. Satu kali aplikasi terbangun tanpa SUPABASE_URL, seluruh foto
 * dari server sendiri ditolak dengan "url parameter is not allowed" —
 * dan yang terlihat pengguna hanyalah foto kosong di mana-mana, tanpa
 * satu pun pesan galat. Sulit sekali ditebak dari gejalanya.
 *
 * Karena itu host produksi ditulis tetap di sini sebagai jaring
 * pengaman. Env tetap dibaca supaya domain lain (uji coba, pindah
 * domain lagi) tidak perlu menyentuh berkas ini.
 */
const HOST_BERKAS_TETAP = ["db.pri-superapp.com", "pichnkyjepsirpclofhs.supabase.co"];

const hostGambar = [...new Set([hostSupabase, ...HOST_BERKAS_TETAP].filter(Boolean))];

if (!hostSupabase) {
  // Terlihat di log build — satu-satunya tanda bahwa jaring pengaman di
  // atas sedang menanggung sesuatu yang seharusnya datang dari env.
  console.warn(
    "[next.config] SUPABASE_URL kosong saat build — daftar host gambar memakai daftar tetap.",
  );
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_VERSI_APLIKASI: versiPaket },
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  reactStrictMode: false,
  // Host gambar yang boleh dioptimalkan next/image. Thumbnail berita
  // hasil pindaian TIDAK didaftarkan (host CDN-nya berubah-ubah) dan
  // tetap memakai <img> biasa.
  images: {
    remotePatterns: [
      // Host penyimpanan berkas: dari env + daftar tetap (lihat atas).
      // Nama lama tetap ada selama masa peralihan, supaya foto yang
      // alamatnya belum sempat diperbarui tidak ikut hilang.
      ...hostGambar.map((hostname) => ({ protocol: "https" as const, hostname })),
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
  // Catatan soal salinan lama di Vercel (12 Sep 2026)
  //
  // Sempat dipasang pengalihan paksa dari Vercel ke domain sendiri,
  // lalu DIBATALKAN sebelum sempat dipakai. Alasannya: APK yang sudah
  // terpasang di ponsel anggota terkunci ke alamat Vercel. Pengalihan
  // ke domain lain membuat APK keluar dari wilayahnya sendiri — yang
  // muncul bukan aplikasi, melainkan jendela peramban berbilah alamat.
  //
  // Gantinya komponen PindahDomain: salinan lama tetap bekerja penuh,
  // hanya memberi tahu alamat barunya. Lihat src/components/pindah-domain.tsx.
  // ------------------------------------------------------------
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
