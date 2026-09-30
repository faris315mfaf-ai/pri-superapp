"use client";

// ============================================================
// Pop-up "Upload ke Sosmed" untuk video jadi Auto Edit (1 Okt 2026).
// Isinya form unggah TVR Saya yang biasa (upload-post milik akun ini),
// dengan video hasil render sudah terpasang — tanpa riwayat & antrean jadwal.
// ============================================================

import { createPortal } from "react-dom";
import { Send, X } from "lucide-react";
import { UnggahSosmedSaya } from "@/features/tvr-ku/unggah-sosmed-saya";

export function PopupUnggahSosmed({
  berkas,
  onTutup,
  onTerkirim,
}: {
  berkas: File;
  onTutup: () => void;
  /** Video sudah diserahkan ke upload-post. */
  onTerkirim: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Upload ke Sosmed"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <Send className="h-5 w-5 text-pri" aria-hidden="true" />
          <p className="font-heading text-[15px] font-extrabold text-teks-utama">Upload ke Sosmed</p>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="glass btn-tekan ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-teks-utama"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-tipis flex-1 overflow-y-auto px-4 pb-5">
          <UnggahSosmedSaya berkasAwal={berkas} hanyaForm onTerkirim={onTerkirim} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
