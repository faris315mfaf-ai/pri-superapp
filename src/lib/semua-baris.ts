// ============================================================
// semuaBaris — membaca SELURUH baris sebuah kueri Supabase.
//
// FAKTA PENTING (dibuktikan 2 Sep 2026): PostgREST di Supabase memotong
// setiap jawaban di 1000 baris APA PUN `range()`/`limit()` yang diminta
// (minta 0-4999 → hanya 1000 dari 1053; content-range "0-999/1053").
// Semua kueri `.range(0, 4999)` / `.limit(20000)` selama ini diam-diam
// hanya menerima 1000 baris — itulah "KPI video hanya tampil 1000".
//
// Helper ini meminta per 1000 baris sampai habis. Pakai untuk tabel yang
// bisa melewati 1000 baris (laporan_video per hari, rekap per periode).
// ============================================================

const LANGKAH = 1000;

export type BalasanBaris<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Baca semua baris. `buat(dari, sampai)` harus mengembalikan kueri yang
 * SUDAH memakai `.range(dari, sampai)` — helper hanya mengulanginya.
 * Kesalahan di tengah dicatat ke log dan hasil parsial dikembalikan
 * (dashboard tetap tampil, bukan mati total).
 */
export async function semuaBaris<T>(
  buat: (dari: number, sampai: number) => PromiseLike<BalasanBaris<T>>,
  maks = 50_000,
): Promise<T[]> {
  const semua: T[] = [];
  for (let dari = 0; dari < maks; dari += LANGKAH) {
    const { data, error } = await buat(dari, dari + LANGKAH - 1);
    if (error) {
      console.error("[semuaBaris]", error.message);
      break;
    }
    const b = data ?? [];
    semua.push(...b);
    if (b.length < LANGKAH) break;
  }
  return semua;
}

/**
 * Bentuk `{ data, error: null }` supaya bisa langsung menggantikan kueri
 * di dalam Promise.all yang didestrukturisasi `{ data }`.
 */
export async function semuaBarisData<T>(
  buat: (dari: number, sampai: number) => PromiseLike<BalasanBaris<T>>,
  maks = 50_000,
): Promise<{ data: T[]; error: null }> {
  return { data: await semuaBaris(buat, maks), error: null };
}
