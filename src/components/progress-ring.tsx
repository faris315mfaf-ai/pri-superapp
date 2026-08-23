"use client";

// ============================================================
// ProgressRing — lingkaran progres dengan animasi halus.
// Warna otomatis mengikuti ambang kepatuhan bila color="auto".
// ============================================================

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { warnaKepatuhan } from "@/lib/format";

type ProgressRingProps = {
  /** Nilai 0–100 */
  value: number;
  /** Ukuran piksel */
  size?: number;
  strokeWidth?: number;
  /** "auto" = hijau ≥80, kuning 50–79, merah <50 */
  color?: "auto" | string;
  className?: string;
  /** Konten di tengah ring (mis. angka persen) */
  children?: React.ReactNode;
};

export function ProgressRing({
  value,
  size = 72,
  strokeWidth = 7,
  color = "auto",
  className,
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const keliling = 2 * Math.PI * radius;
  const persen = Math.min(100, Math.max(0, value));
  const offset = keliling * (1 - persen / 100);
  const warna = color === "auto" ? warnaKepatuhan(persen) : color;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(persen)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Latar track bergaya kaca */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--glass-bg-soft)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={warna}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={keliling}
          initial={{ strokeDashoffset: keliling }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${warna}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
