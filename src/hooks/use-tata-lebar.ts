"use client";

// ============================================================
// useTataLebar (7 Okt 2026) — akun ini memakai tata letak LEBAR (modul
// berkolom di tablet & PC)? Khusus master; lihat tataLebar di
// lib/desain-apple.ts.
// ============================================================

import { useAppStore } from "@/hooks/use-app-store";
import { tataLebar } from "@/lib/desain-apple";

export function useTataLebar(): boolean {
  return useAppStore((s) => tataLebar(s.user));
}
