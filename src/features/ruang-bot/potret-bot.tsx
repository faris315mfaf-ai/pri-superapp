"use client";

// Potret karakter bot (canvas kecil). Dipakai di kartu bot, pemilih bot,
// dan halaman Detail Bot. Gambar diam, tanpa loop animasi, supaya ringan.

import { useEffect, useRef } from "react";
import { gambarKarakter } from "./sprite-bot";
import type { RupaBot } from "./tipe";

const LEBAR = 28;
const TINGGI = 40;

export function PotretBot({
  rupa,
  lencana,
  skala = 3,
  className,
  label,
}: {
  rupa: RupaBot;
  lencana: string;
  /** Piksel layar per piksel gambar. */
  skala?: number;
  className?: string;
  label: string;
}) {
  const kanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = kanvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    ctx.clearRect(0, 0, LEBAR, TINGGI);
    gambarKarakter(ctx, LEBAR / 2, TINGGI - 4, { rupa, lencana, pose: "diam", waktu: 0 });
  }, [rupa, lencana]);

  return (
    <canvas
      ref={kanvas}
      width={LEBAR}
      height={TINGGI}
      role="img"
      aria-label={label}
      className={className}
      style={{ width: LEBAR * skala, height: TINGGI * skala, imageRendering: "pixelated" }}
    />
  );
}
