"use client";

// ============================================================
// RUPA SAYA (16 Okt 2026) — rupa yang baru disimpan di tab Karakter Saya,
// dibagikan ke kanvas dunia v2 & potret supaya langsung tampil tanpa menunggu
// status dunia berikutnya. Terikat ke akun penyimpannya: setelah keluar lalu
// masuk dengan akun lain di tab yang sama, rupa akun lama tidak terbawa.
// Hanya memori halaman; sumber kebenaran tetap tabel karakter_pengguna.
// ============================================================

import { useSyncExternalStore } from "react";
import { useAppStore } from "@/hooks/use-app-store";
import type { KonfigKarakter } from "@/lib/karakter-murni";

let terakhir: { userId: string; konfig: KonfigKarakter } | undefined;
const pendengar = new Set<() => void>();

/** Dipanggil editor setelah simpan berhasil (akun yang sedang masuk). */
export function umumkanRupaSaya(k: KonfigKarakter): void {
  const id = useAppStore.getState().user?.id;
  if (id == null) return;
  terakhir = { userId: String(id), konfig: k };
  for (const f of pendengar) f();
}

function langgan(f: () => void) {
  pendengar.add(f);
  return () => {
    pendengar.delete(f);
  };
}

/** Rupa yang baru disimpan akun `sayaId` selama halaman ini terbuka (undefined bila belum / akun lain). */
export function useRupaSaya(sayaId: number | string | null | undefined): KonfigKarakter | undefined {
  const t = useSyncExternalStore(langgan, () => terakhir, () => undefined);
  return t && sayaId != null && t.userId === String(sayaId) ? t.konfig : undefined;
}
