import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { Plus_Jakarta_Sans, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { DaftarServiceWorker } from "@/components/daftar-service-worker";

// ============================================================
// Jaring pengaman pemulihan — WAJIB berjalan sebelum berkas
// aplikasi dimuat, karena tugasnya justru menangani kegagalan
// memuat berkas itu.
//
// Latar belakang: berkas skrip Next.js bernama sidik build. Bila
// sebuah halaman tersimpan di ponsel lalu aplikasinya diperbarui,
// halaman lama itu meminta berkas yang sudah tidak ada — dan yang
// pengguna lihat hanyalah layar galat peramban tanpa penjelasan.
//
// Skrip ini mendengar kegagalan pemuatan berkas /_next/, lalu
// membersihkan simpanan + service worker dan memuat ulang SEKALI.
// Penanda di sessionStorage mencegahnya berputar tanpa henti bila
// ternyata penyebabnya bukan simpanan basi.
// ============================================================
const SKRIP_PEMULIHAN = `
(function () {
  var KUNCI = "pri-pulih-sekali";

  // --- Mode Simpel (4 Sep 2026) ------------------------------------
  // Perangkat yang memilih Mode Simpel langsung dialihkan ke /simpel
  // SEBELUM aplikasi lengkap dimuat — hanya bila ada token perangkat
  // (tanpa token, "/" tetap menampilkan layar masuk; /simpel juga
  // mengembalikan ke "/" bila sesi tak ada, jadi tidak mungkin berputar).
  try {
    if (
      location.pathname === "/" &&
      localStorage.getItem("pri-mode-simpel") === "1" &&
      localStorage.getItem("pri-token-perangkat")
    ) {
      location.replace("/simpel");
      return;
    }
  } catch (e) {}

  // --- Telemetri crash -----------------------------------------
  // Setiap galat yang tidak tertangani dikirim ke server, karena
  // "This page couldn't load" di ponsel pengguna tidak terlihat
  // dari mana pun. Maksimal 3 laporan per pemuatan halaman supaya
  // galat berulang tidak membanjiri server.
  var sisaLapor = 3;
  function lapor(jenis, pesan, stack) {
    if (sisaLapor <= 0) return;
    sisaLapor -= 1;
    try {
      var isi = JSON.stringify({
        jenis: jenis,
        pesan: String(pesan || "").slice(0, 900),
        stack: String(stack || "").slice(0, 3500),
        url: location.href,
        versi: "${process.env.NEXT_PUBLIC_VERSI_APLIKASI || "?"}"
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/log-klien", new Blob([isi], { type: "application/json" }));
      } else {
        fetch("/api/log-klien", { method: "POST", headers: { "Content-Type": "application/json" }, body: isi, keepalive: true }).catch(function () {});
      }
    } catch (e) { /* pelaporan tidak boleh menimbulkan galat baru */ }
  }
  window.addEventListener("unhandledrejection", function (ev) {
    var alasan = ev && ev.reason;
    lapor("promise", alasan && alasan.message ? alasan.message : String(alasan), alasan && alasan.stack);
  });
  // --------------------------------------------------------------

  function pulihkan() {
    try {
      if (sessionStorage.getItem(KUNCI)) return;
      sessionStorage.setItem(KUNCI, "1");
    } catch (e) { return; }
    var muatUlang = function () { location.reload(); };
    try {
      var tugas = [];
      if (window.caches && caches.keys) {
        tugas.push(caches.keys().then(function (n) {
          return Promise.all(n.map(function (k) { return caches.delete(k); }));
        }));
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        tugas.push(navigator.serviceWorker.getRegistrations().then(function (r) {
          return Promise.all(r.map(function (x) { return x.unregister(); }));
        }));
      }
      Promise.all(tugas).then(muatUlang, muatUlang);
    } catch (e) { muatUlang(); }
  }
  window.addEventListener("error", function (ev) {
    var t = ev && ev.target;
    if (t && t.tagName === "SCRIPT" && t.src && t.src.indexOf("/_next/") > -1) {
      lapor("berkas-gagal", "Gagal memuat " + t.src, "");
      pulihkan();
      return;
    }
    // Galat JavaScript biasa (bukan kegagalan memuat berkas)
    if (ev && ev.message) {
      lapor("error", ev.message, ev.error && ev.error.stack);
    }
  }, true);
})();
`;

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRI SuperApp — Pusat Kendali Digital Partai Rakyat Indonesia",
  description:
    "SuperApp resmi Partai Rakyat Indonesia: Modul QC Konten Sosmed, Otomatisasi Video TV Rakyat, dan Pusat Notifikasi dalam satu genggaman.",
  applicationName: "PRI SuperApp",
  // Membuat iOS memperlakukan aplikasi ini sebagai aplikasi layar penuh
  // saat ditambahkan ke layar beranda (Android memakai manifest).
  appleWebApp: {
    capable: true,
    title: "PRI SuperApp",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/ikon/ikon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/ikon/ikon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/ikon/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F1F5F9" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1120" },
  ],
};

// CSP berbasis nonce (src/proxy.ts) MENSYARATKAN render dinamis:
// nonce dibuat baru per permintaan, jadi HTML-nya tidak boleh dibekukan
// saat build — kalau tidak, tag <script> lama membawa nonce basi dan
// seluruh aplikasi diblokir CSP (terbukti saat diuji di peramban).
// Aplikasi ini memang cangkang klien yang datanya diambil setelah
// muat, jadi kehilangan pre-render statis tidak terasa bagi pengguna.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce dari proxy — dibubuhkan ke skrip inline pemulihan di bawah;
  // tanpa ini, CSP memblok skrip penyelamat itu sendiri.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${jakarta.variable} ${inter.variable} ${geistMono.variable} antialiased bg-app-bg text-teks-utama`}
      >
        <Script
          id="pemulihan-simpanan"
          strategy="beforeInteractive"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: SKRIP_PEMULIHAN }}
        />
        {children}
        <Toaster />
        <DaftarServiceWorker />
      </body>
    </html>
  );
}
