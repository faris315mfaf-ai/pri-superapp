"use client";

// ============================================================
// GlassCard — kartu kaca dasar dengan highlight tepi atas.
// Bisa diklik (interactive) dengan umpan balik tekan.
// ============================================================

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type GlassCardProps = {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** Gaya kaca lebih pekat (untuk modal / elemen melayang) */
  kuat?: boolean;
  /** Nonaktifkan efek tekan pada kartu yang bisa diklik */
  tanpaTekan?: boolean;
  ariaLabel?: string;
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard(
    { children, className, onClick, kuat = false, tanpaTekan = false, ariaLabel },
    ref,
  ) {
    const bisaDiklik = typeof onClick === "function";

    if (bisaDiklik) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          aria-label={ariaLabel}
          onClick={onClick}
          className={cn(
            "block w-full text-left",
            kuat ? "glass-strong" : "glass",
            "rounded-[1.25rem]",
            !tanpaTekan && "btn-tekan cursor-pointer",
            className,
          )}
        >
          {children}
        </button>
      );
    }

    return (
      <div
        ref={ref}
        aria-label={ariaLabel}
        className={cn(
          kuat ? "glass-strong" : "glass",
          "rounded-[1.25rem]",
          className,
        )}
      >
        {children}
      </div>
    );
  },
);
