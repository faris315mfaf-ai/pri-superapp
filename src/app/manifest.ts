// Manifest PWA — dibaca Android/Chrome saat aplikasi dipasang, dan
// dipakai PWABuilder/Bubblewrap sebagai sumber data saat membungkusnya
// menjadi APK. Nama, warna, dan ikon di sini yang muncul di layar
// beranda ponsel, jadi harus cocok dengan tampilan aplikasi.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PRI SuperApp — Pusat Kendali Digital Partai Rakyat Indonesia",
    // Nama pendek dipakai di bawah ikon layar beranda; lebih dari ~12
    // karakter akan dipotong peluncur Android.
    short_name: "PRI SuperApp",
    description:
      "SuperApp resmi Partai Rakyat Indonesia: QC Konten Sosmed, Otomatisasi Video TV Rakyat, dan Pusat Notifikasi dalam satu genggaman.",
    start_url: "/",
    scope: "/",
    // standalone = tanpa bilah alamat peramban, terasa seperti aplikasi
    display: "standalone",
    orientation: "portrait",
    // Warna latar layar pembuka saat aplikasi dibuka dari ikon
    background_color: "#0B1120",
    // Warna bilah status Android
    theme_color: "#DC2626",
    lang: "id",
    dir: "ltr",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/ikon/ikon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/ikon/ikon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Versi maskable wajib ada supaya Android tidak menempelkan ikon
      // di atas kotak putih saat peluncur memotongnya jadi lingkaran.
      {
        src: "/ikon/ikon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/ikon/ikon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
