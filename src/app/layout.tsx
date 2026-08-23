import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${jakarta.variable} ${inter.variable} ${geistMono.variable} antialiased bg-app-bg text-teks-utama`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
