"use client";

// ============================================================
// SwitchKaca — toggle switch kaca kecil untuk baris pengaturan.
// Track kaca rounded-full w-11 h-6, knob putih dengan shadow;
// kondisi aktif memakai gradient merah PRI.
// ============================================================

import { cn } from "@/lib/utils";

type SwitchKacaProps = {
  aktif: boolean;
  onUbah: () => void;
  labelAria: string;
  disabled?: boolean;
};

export function SwitchKaca({ aktif, onUbah, labelAria, disabled = false }: SwitchKacaProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aktif}
      aria-label={labelAria}
      disabled={disabled}
      onClick={onUbah}
      className={cn(
        "relative flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200",
        aktif
          ? "border-transparent"
          : "border-black/10 bg-black/5 dark:border-white/15 dark:bg-white/10",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
      style={aktif ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 left-0.5 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-md transition-transform duration-200",
          aktif && "translate-x-5",
        )}
      />
    </button>
  );
}
