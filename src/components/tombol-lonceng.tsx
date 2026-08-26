"use client";

// ============================================================
// TombolLonceng — pintu notifikasi di KANAN ATAS tiap layar.
//
// Notifikasi tidak lagi menempati satu slot di navigasi bawah:
// slot itu mahal (hanya muat 4–6 tab) sementara notifikasi lebih
// wajar sebagai lonceng di header, sejajar sakelar tema. Badge
// merah membawa jumlah yang belum dibaca supaya tetap terlihat
// tanpa perlu tab sendiri.
// ============================================================

import { Bell } from "lucide-react";
import { useAppStore } from "@/hooks/use-app-store";

export function TombolLonceng({ onBuka }: { onBuka?: () => void }) {
  const notifikasi = useAppStore((s) => s.notifikasi);
  const belumBaca = notifikasi.filter((n) => !n.dibaca).length;

  // Tanpa penangan buka, tombolnya tidak berguna — jangan ditampilkan
  // sebagai hiasan yang tidak melakukan apa-apa saat ditekan.
  if (!onBuka) return null;

  return (
    <button
      type="button"
      onClick={onBuka}
      aria-label={
        belumBaca > 0 ? `Buka notifikasi — ${belumBaca} belum dibaca` : "Buka notifikasi"
      }
      className="glass btn-tekan relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
    >
      <Bell className="h-[18px] w-[18px]" />
      {belumBaca > 0 && (
        <span
          className="angka-tab absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white"
          style={{
            background: "linear-gradient(135deg, #DC2626, #B91C1C)",
            boxShadow: "0 4px 10px rgba(220, 38, 38, 0.4)",
          }}
        >
          {belumBaca > 99 ? "99+" : belumBaca}
        </span>
      )}
    </button>
  );
}
