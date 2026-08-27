"use client";

// ============================================================
// IkonStreak — api streak dengan tingkatan visual (spek 4.1):
//   1 hari   : api kecil, merah
//   3 hari   : api kecil, merah lebih pekat
//   10 hari  : api besar, merah
//   30 hari  : api besar, biru
//   90 hari  : api besar, hijau
// hari <= 0 tidak menampilkan apa-apa.
// ============================================================

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

function tampilan(hari: number): { warna: string; besar: boolean } {
  if (hari >= 90) return { warna: "#10B981", besar: true }; // hijau
  if (hari >= 30) return { warna: "#3B82F6", besar: true }; // biru
  if (hari >= 10) return { warna: "#DC2626", besar: true }; // merah besar
  if (hari >= 3) return { warna: "#B91C1C", besar: false }; // merah pekat
  return { warna: "#EF4444", besar: false }; // merah kecil
}

export function IkonStreak({
  hari,
  className,
  tanpaAngka = false,
  skala = "normal",
}: {
  hari: number;
  className?: string;
  /** true = api saja tanpa angka hari */
  tanpaAngka?: boolean;
  /** "besar" = api mencolok ala streak TikTok (daftar & room chat) */
  skala?: "normal" | "besar";
}) {
  if (hari <= 0) return null;
  const { warna, besar } = tampilan(hari);
  const kelasApi =
    skala === "besar"
      ? besar
        ? "h-6 w-6"
        : "h-5 w-5"
      : besar
        ? "h-4.5 w-4.5"
        : "h-3.5 w-3.5";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-0.5", className)}
      title={`Streak ${hari} hari`}
      aria-label={`Streak ${hari} hari`}
    >
      <Flame
        className={kelasApi}
        style={{
          color: warna,
          fill: warna,
          // Nyala lembut supaya apinya "hidup" ala TikTok, tanpa
          // animasi berat — cukup bayangan warna apinya sendiri.
          filter: skala === "besar" ? `drop-shadow(0 0 5px ${warna}88)` : undefined,
        }}
        aria-hidden="true"
      />
      {!tanpaAngka && (
        <span
          className={cn(
            "angka-tab font-extrabold",
            skala === "besar" ? "text-[13px]" : "text-[11px]",
          )}
          style={{ color: warna }}
        >
          {hari}
        </span>
      )}
    </span>
  );
}
