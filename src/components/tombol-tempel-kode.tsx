"use client";

// ============================================================
// TombolTempelKode (7 Okt 2026) — isi kolom OTP sekali ketuk dari
// clipboard. Kode OTP WhatsApp dikirim sebagai pesan tersendiri (lib/otp):
// pengguna cukup tekan-lama → Salin di WhatsApp, kembali ke aplikasi,
// ketuk "Tempel kode". Membaca clipboard hanya saat tombol diketuk
// (gestur pengguna), sesuai aturan izin peramban.
// ============================================================

import { useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ambil kode 6 angka dari teks apa pun (pesan WA utuh / kode saja). */
export function ambilKode6(teks: string): string {
  const tepat = teks.match(/(?:^|\D)(\d{6})(?!\d)/);
  if (tepat) return tepat[1];
  return teks.replace(/[^0-9]/g, "").slice(0, 6);
}

export function TombolTempelKode({ onTempel, disabled, className }: { onTempel: (kode: string) => void; disabled?: boolean; className?: string }) {
  const [pesan, setPesan] = useState<string | null>(null);

  async function tempel() {
    setPesan(null);
    try {
      if (!navigator.clipboard?.readText) throw new Error("clipboard tak didukung");
      const kode = ambilKode6(await navigator.clipboard.readText());
      if (kode.length === 6) onTempel(kode);
      else setPesan("Belum ada kode 6 angka yang tersalin.");
    } catch {
      setPesan("Izinkan akses clipboard, atau tempel manual di kolom kode.");
    }
  }

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => void tempel()}
        disabled={disabled}
        className="btn-tekan flex h-9 items-center gap-1.5 rounded-full bg-pri/10 px-4 text-[13px] font-semibold text-pri disabled:opacity-50"
      >
        <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
        Tempel kode
      </button>
      {pesan && <p className="text-center text-[11.5px] text-teks-sekunder">{pesan}</p>}
    </div>
  );
}
