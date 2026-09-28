// ============================================================
// SINYAL PRIBADI "ada yang baru UNTUK SAYA" (28 Sep 2026). SERVER.
// Rencana "200 orang tanpa lag", langkah #3.
//
// Dulu /api/detak hanya punya satu tanda GLOBAL (id terbesar notifikasi,
// pengumuman, postingan, feed, laporan). Notifikasi untuk SATU orang —
// pesan chat, kiriman koin, laporan KPI tercatat — mengubah tanda itu,
// sehingga SEMUA HP yang online memuat ulang layarnya (±28 panggilan per
// HP per kejadian).
//
// Kini peristiwa milik satu orang menaikkan penghitung di Redis
// "sinyal:u:<id>". /api/detak mengembalikannya sebagai `tanda_saya`
// (satu GET Redis, bukan kueri Supabase), dan hanya HP orang itu yang
// menyegarkan diri. Tanda global tetap ada untuk hal yang memang milik
// semua orang (pengumuman, konten, notifikasi umum/per peran).
//
// Tanpa Redis (dev lokal): penghitung disimpan di memori proses.
// Tidak pernah melempar — sinyal hanyalah percepatan, bukan data.
// ============================================================
import { klienCache } from "@/lib/redis";

/** Penghitung disimpan 7 hari; lewat itu HP yang kembali tetap menarik data sendiri. */
const UMUR_DETIK = 7 * 24 * 3600;

const memori = new Map<string, number>();

export function kunciSinyal(userId: number | string): string {
  return `sinyal:u:${userId}`;
}

/** Id unik yang sah (bilangan bulat positif), sebagai teks. */
export function idSinyalUnik(ids: (number | string | null | undefined)[]): string[] {
  const hasil = new Set<string>();
  for (const x of ids) {
    const n = Number(x);
    if (Number.isSafeInteger(n) && n > 0) hasil.add(String(n));
  }
  return [...hasil];
}

/** Naikkan sinyal orang-orang ini: HP mereka menyegarkan diri pada detak berikutnya. */
export async function naikkanSinyal(ids: (number | string | null | undefined)[]): Promise<void> {
  const unik = idSinyalUnik(ids);
  if (unik.length === 0) return;
  const r = klienCache();
  if (!r) {
    for (const id of unik) memori.set(id, (memori.get(id) ?? 0) + 1);
    return;
  }
  try {
    await Promise.all(
      unik.map(async (id) => {
        await r.incr(kunciSinyal(id));
        await r.expire(kunciSinyal(id), UMUR_DETIK);
      }),
    );
  } catch (e) {
    console.error("[sinyal] naikkan:", e instanceof Error ? e.message : e);
  }
}

/**
 * Nilai sinyal satu orang: "0" bila belum pernah; "" bila Redis sedang
 * bermasalah (klien mengabaikan "" supaya gangguan sesaat tidak memicu
 * penyegaran palsu).
 */
export async function bacaSinyal(userId: number | string): Promise<string> {
  const id = idSinyalUnik([userId])[0];
  if (!id) return "0";
  const r = klienCache();
  if (!r) return String(memori.get(id) ?? 0);
  try {
    const v = await r.get<number | string>(kunciSinyal(id));
    return v == null ? "0" : String(v);
  } catch {
    return "";
  }
}
