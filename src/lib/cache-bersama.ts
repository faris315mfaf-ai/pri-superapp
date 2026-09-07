// ============================================================
// CACHE HASIL QUERY BERSAMA (7 Sep 2026) — KHUSUS SISI SERVER.
//
// Insiden 7 Sep 2026: view agregat QC (v_app_kepatuhan_kader ≈ 400 ms per
// panggilan) dipanggil oleh SETIAP pengguna tiap 60 dtk (kartu beranda),
// padahal isinya sama untuk semua orang dan sumbernya (komentar) hanya
// disegarkan tiap 5 menit. Compute Supabase kecil jenuh → semua permintaan
// 20-30 dtk. Helper ini menghitung SEKALI lalu membagikan hasilnya:
//   1. memori proses (seketika, TTL penuh bila dihitung sendiri; maks 30 dtk
//      bila disalin dari Redis supaya instans lain ikut segar),
//   2. Redis bersama (REDIS_URL/Upstash) bila ada → semua instans Vercel
//      memakai satu hasil,
//   3. "single-flight": permintaan bersamaan untuk kunci yang sama menunggu
//      satu perhitungan, bukan menghitung sendiri-sendiri.
// Nilai null/undefined ikut disimpan (dibungkus {isi}) supaya kosong pun
// tidak dihitung ulang terus-menerus.
// ============================================================
import { klienCache } from "@/lib/redis";

const memori = new Map<string, { isi: unknown; sampai: number }>();
const dalamProses = new Map<string, Promise<unknown>>();
const MAKS_ENTRI = 500;
const MAKS_MEMORI_DARI_REDIS_DETIK = 30;

export async function denganCache<T>(kunci: string, ttlDetik: number, hitung: () => Promise<T>): Promise<T> {
  const kini = Date.now();
  const m = memori.get(kunci);
  if (m && m.sampai > kini) return m.isi as T;
  const sedang = dalamProses.get(kunci);
  if (sedang) return sedang as Promise<T>;
  const p = (async () => {
    const redis = klienCache();
    if (redis) {
      try {
        const r = await redis.get<{ isi: T }>(`cache:${kunci}`);
        if (r && typeof r === "object" && "isi" in r) {
          simpanMemori(kunci, r.isi, Math.min(ttlDetik, MAKS_MEMORI_DARI_REDIS_DETIK));
          return r.isi;
        }
      } catch {
        // Redis bermasalah → hitung sendiri.
      }
    }
    const isi = await hitung();
    simpanMemori(kunci, isi, ttlDetik);
    if (redis) {
      try {
        await redis.set(`cache:${kunci}`, { isi }, { ex: Math.max(1, Math.floor(ttlDetik)) });
      } catch {
        // Gagal menyimpan cache bukan alasan menggagalkan permintaan.
      }
    }
    return isi;
  })().finally(() => dalamProses.delete(kunci));
  dalamProses.set(kunci, p);
  return p;
}

function simpanMemori(kunci: string, isi: unknown, ttlDetik: number): void {
  memori.delete(kunci);
  memori.set(kunci, { isi, sampai: Date.now() + ttlDetik * 1000 });
  while (memori.size > MAKS_ENTRI) {
    const tertua = memori.keys().next().value;
    if (tertua === undefined) break;
    memori.delete(tertua);
  }
}

/** Buang satu kunci (memori + Redis) — dipakai setelah data sumbernya berubah. */
export async function hapusCacheBersama(kunci: string): Promise<void> {
  memori.delete(kunci);
  const redis = klienCache();
  if (redis) {
    try {
      await redis.del(`cache:${kunci}`);
    } catch {
      // abaikan
    }
  }
}
