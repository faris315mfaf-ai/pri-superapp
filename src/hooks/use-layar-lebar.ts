"use client";

// ============================================================
// useLayarLebar (7 Okt 2026) — layar PC (≥ 1024 px, sama dengan `lg:`)?
// Dipakai untuk memilih bentuk sub-layar (mis. notifikasi sebagai panel
// samping di PC, layar penuh di HP/tablet).
// ============================================================

import { useSyncExternalStore } from "react";

const KUERI = "(min-width: 1024px)";

function langgan(cb: () => void): () => void {
  const mql = window.matchMedia(KUERI);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

export function useLayarLebar(): boolean {
  return useSyncExternalStore(
    langgan,
    () => window.matchMedia(KUERI).matches,
    () => false,
  );
}
