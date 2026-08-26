"use client";

// ============================================================
// <Maskot3D /> — karakter gamify "Gembul" dalam 3D sederhana.
//
// Pakai di mana saja: profil (dekorasi/companion), beranda (saat
// streak naik tingkat), notifikasi pencapaian (badge baru, kudos
// diterima), atau reminder streak mau putus (mood="sedih").
//
// Contoh pakai:
//   <Maskot3D mood="senang" tingkat="biru" tinggi={200} onSentuh={() => bunyikanSfx()} />
//
// Catatan teknis:
// - Berat (three.js + react-three-fiber) di-load lewat dynamic
//   import hanya saat komponen ini benar-benar dirender, tidak ikut
//   bundle awal halaman.
// - Kalau perangkat tidak mendukung WebGL, atau pengguna mengaktifkan
//   "reduce motion", tampilkan fallback 2D statis (emoji) — supaya
//   tetap ringan & tidak memaksa animasi ke orang yang memintanya
//   dimatikan.
// ============================================================

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { GlassSkeleton } from "@/components/pri-ui";
import type { MaskotMood, MaskotTingkat } from "@/components/maskot-3d-canvas";

export type { MaskotMood, MaskotTingkat };

const Maskot3DCanvas = dynamic(() => import("@/components/maskot-3d-canvas"), {
  ssr: false,
  loading: () => <GlassSkeleton className="mx-auto aspect-square w-[70%] rounded-full" />,
});

function dukungWebGL(): boolean {
  try {
    const kanvas = document.createElement("canvas");
    return !!(
      kanvas.getContext("webgl") || kanvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

const EMOJI_MOOD: Record<MaskotMood, string> = {
  netral: "🐣",
  senang: "🥳",
  sedih: "🥺",
};

export type Maskot3DProps = {
  /** Ekspresi/animasi saat ini. Default "netral". */
  mood?: MaskotMood;
  /** Warna aksesoris — samakan dengan tingkatan streak pengguna
   *  (merah = 1–10 hari, biru = 30 hari, hijau = 90 hari). */
  tingkat?: MaskotTingkat;
  /** Tinggi area render dalam px. Default 220. */
  tinggi?: number;
  className?: string;
  /** Dipanggil setiap Gembul disentuh/diklik (mis. untuk mainkan SFX). */
  onSentuh?: () => void;
};

export function Maskot3D({
  mood = "netral",
  tingkat = "merah",
  tinggi = 220,
  className,
  onSentuh,
}: Maskot3DProps) {
  const [bisa3D, setBisa3D] = useState<boolean | null>(null);

  useEffect(() => {
    // Ditunda ke microtask: aturan lint proyek melarang setState
    // sinkron di badan effect (memicu render beruntun).
    let hidup = true;
    void (async () => {
      await Promise.resolve();
      if (!hidup) return;
      const kurangiGerak = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setBisa3D(!kurangiGerak && dukungWebGL());
    })();
    return () => {
      hidup = false;
    };
  }, []);

  // Status awal (server render / belum dicek): tampilkan skeleton,
  // bukan langsung fallback, supaya tidak "flash" dari emoji ke 3D.
  if (bisa3D === null) {
    return (
      <div className={className} style={{ height: tinggi }}>
        <GlassSkeleton className="mx-auto aspect-square h-full rounded-full" />
      </div>
    );
  }

  if (!bisa3D) {
    return (
      <div
        className={className}
        style={{ height: tinggi }}
        role="img"
        aria-label={`Maskot Gembul, ekspresi ${mood}`}
      >
        <div
          className="flex h-full w-full cursor-pointer select-none items-center justify-center"
          style={{ fontSize: tinggi * 0.4 }}
          onClick={onSentuh}
        >
          {EMOJI_MOOD[mood]}
        </div>
      </div>
    );
  }

  return (
    <div className={className} onClick={onSentuh}>
      <Maskot3DCanvas mood={mood} tingkat={tingkat} tinggi={tinggi} />
    </div>
  );
}
