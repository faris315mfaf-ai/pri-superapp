"use client";

// Keadaan sakelar modul (lib/sakelar-modul) di klien. Sebelum /api/sakelar
// termuat, yang dipakai nilai bawaan — modul yang bawaannya mati tidak
// sempat berkedip muncul.
import { useAppStore } from "@/hooks/use-app-store";
import { modulAktif, type KunciModul } from "@/lib/sakelar-modul";

export function useModulAktif(kunci: KunciModul): boolean {
  return useAppStore((s) => modulAktif(s.sakelar.modul, kunci));
}
