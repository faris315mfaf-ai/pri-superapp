"use client";

// ============================================================
// FotoBulat — avatar bulat berbasis next/image.
//
// Pengganti seragam untuk pola `<img className="rounded-full">` di
// daftar-daftar (kelola pengguna, chat, database, dsb.): gambar
// dioptimalkan & di-resize server (pustaka sharp sudah terpasang),
// bukan mengunduh foto asli ukuran penuh untuk kotak 32px.
//
// Sumber data:/blob: (pratinjau unggahan) tidak bisa dioptimalkan —
// otomatis jatuh ke mode unoptimized supaya tetap tampil.
// ============================================================

import Image from "next/image";
import { cn } from "@/lib/utils";

export function FotoBulat({
  src,
  ukuran,
  alt = "",
  className,
}: {
  src: string;
  /** Sisi persegi dalam piksel (mis. 32, 40, 72) */
  ukuran: number;
  alt?: string;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={ukuran}
      height={ukuran}
      className={cn("shrink-0 rounded-full object-cover", className)}
      style={{ width: ukuran, height: ukuran }}
      unoptimized={src.startsWith("data:") || src.startsWith("blob:")}
    />
  );
}
