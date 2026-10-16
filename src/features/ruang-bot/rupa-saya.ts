"use client";

// ============================================================
// RUPA SAYA (16 Okt 2026) — rupa yang baru disimpan di tab Karakter Saya,
// dibagikan ke kanvas dunia v2 supaya langsung tampil tanpa menunggu status
// dunia berikutnya (status dari server menyusul membawa rupa yang sama).
// Hanya memori halaman; sumber kebenaran tetap tabel karakter_pengguna.
// ============================================================

import { useSyncExternalStore } from "react";
import type { KonfigKarakter } from "@/lib/karakter-murni";

let terakhir: KonfigKarakter | undefined;
const pendengar = new Set<() => void>();

/** Dipanggil editor setelah simpan berhasil. */
export function umumkanRupaSaya(k: KonfigKarakter): void {
  terakhir = k;
  for (const f of pendengar) f();
}

function langgan(f: () => void) {
  pendengar.add(f);
  return () => {
    pendengar.delete(f);
  };
}

/** Rupa sendiri yang disimpan selama halaman ini terbuka (undefined bila belum). */
export function useRupaSaya(): KonfigKarakter | undefined {
  return useSyncExternalStore(langgan, () => terakhir, () => undefined);
}
