"use client";

// ============================================================
// PlatformIcon — ikon platform sosmed (Instagram, TikTok, X,
// Facebook, Threads, YouTube) dengan aksen warna brand.
// ============================================================

import { Instagram, Facebook, Youtube, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";

const WARNA_PLATFORM: Record<string, string> = {
  instagram: "#E1306C",
  tiktok: "#25F4EE",
  twitter: "currentColor",
  facebook: "#1877F2",
  threads: "currentColor",
  youtube: "#FF0000",
};

function IkonTikTok({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function IkonX({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41z" />
    </svg>
  );
}

type PlatformIconProps = {
  platform: string;
  size?: number;
  /** Tampilkan dalam wadah bulat semi-transparan */
  denganWadah?: boolean;
  className?: string;
};

export function PlatformIcon({
  platform,
  size = 16,
  denganWadah = false,
  className,
}: PlatformIconProps) {
  const p = platform.toLowerCase();
  const warna = WARNA_PLATFORM[p] ?? "currentColor";
  const ukuranIkon = denganWadah ? size : size;

  const renderIkon = () => {
    switch (p) {
      case "instagram":
        return <Instagram size={ukuranIkon} color={warna} />;
      case "tiktok":
        return <IkonTikTok size={ukuranIkon} className="text-teks-utama" />;
      case "twitter":
      case "x":
        return <IkonX size={ukuranIkon} className="text-teks-utama" />;
      case "facebook":
        return <Facebook size={ukuranIkon} color={warna} />;
      case "threads":
        return <AtSign size={ukuranIkon} className="text-teks-utama" />;
      case "youtube":
        return <Youtube size={ukuranIkon} color={warna} />;
      default:
        return <Instagram size={ukuranIkon} color={warna} />;
    }
  };

  if (denganWadah) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          "bg-black/25 backdrop-blur-md border border-white/30",
          "shadow-sm",
          className,
        )}
        style={{ width: size + 12, height: size + 12 }}
        aria-label={p}
      >
        {renderIkon()}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center justify-center", className)} aria-label={p}>
      {renderIkon()}
    </span>
  );
}

/** Label ramah nama platform dalam Bahasa Indonesia */
export function labelPlatform(platform: string): string {
  const map: Record<string, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    twitter: "X",
    facebook: "Facebook",
    threads: "Threads",
    youtube: "YouTube",
  };
  return map[platform.toLowerCase()] ?? platform;
}
