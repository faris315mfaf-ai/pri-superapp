// ============================================================
// KEHADIRAN "sedang membuka aplikasi" (10 Sep 2026) — KHUSUS SERVER.
//
// Menumpang DETAK: tiap perangkat yang aplikasinya terbuka sudah memanggil
// /api/detak setiap 10 detik. Di situ kita tandai "orang ini sedang ada",
// jadi fitur ini TIDAK menambah satu permintaan pun.
//
// Cara menyimpan: EMBER 20 detik. Nama kunci = "hadir:<nomor ember>", dan
// isinya himpunan id pengguna yang berdetak pada rentang itu. Membaca
// siapa saja yang online = gabungan 3 ember terakhir (±60 detik).
//
// Kenapa ember, bukan satu kunci per orang: menghitung "berapa yang
// online" hanya perlu 3 pembacaan himpunan, bukan memindai ratusan kunci.
// Ember lama hangus sendiri (TTL 2 menit) — tidak ada sampah menumpuk.
//
// Tanpa Redis (mis. dev lokal), catatan disimpan di memori proses. Di
// produksi berinstansi banyak angkanya bisa lebih kecil dari kenyataan —
// karena itu Redis yang dipakai bila ada.
// ============================================================
import { klienCache } from "@/lib/redis";

/** Lebar satu ember. */
const EMBER_MS = 20_000;
/** Berapa ember terakhir yang dianggap "masih online" (3 x 20 dtk). */
const EMBER_DIBACA = 3;
/** Umur simpan ember di Redis — cukup lebih panjang dari jendela baca. */
const TTL_EMBER_DETIK = 120;
/** Jendela "masih online" untuk penyimpanan memori (tanpa Redis). */
const JENDELA_MS = 60_000;
/** Hasil pembacaan ditahan sebentar supaya ratusan detik tidak menembak Redis bersamaan. */
const MEMO_MS = 5_000;

// Catatan memori sengaja ditempel ke globalThis: Next kadang memuat modul
// yang sama lebih dari sekali (tiap rute punya bundel sendiri, apalagi saat
// dev/HMR). Kalau Map-nya milik modul, /api/detak dan /api/master bisa
// memegang dua catatan berbeda dan daftar online terbaca kosong.
const gudang = globalThis as unknown as { __priHadir?: Map<string, number> };
const memori: Map<string, number> = (gudang.__priHadir ??= new Map<string, number>());
let memo: { pada: number; data: string[] } | null = null;

function kunciEmber(geser = 0): string {
  return `hadir:${Math.floor(Date.now() / EMBER_MS) - geser}`;
}

/** Tandai bahwa pengguna ini sedang membuka aplikasi. */
export async function catatHadir(userId: string | number): Promise<void> {
  const id = String(userId);
  const r = klienCache();
  if (!r) {
    memori.set(id, Date.now());
    return;
  }
  try {
    const kunci = kunciEmber();
    await r.sadd(kunci, id);
    await r.expire(kunci, TTL_EMBER_DETIK);
  } catch {
    // Redis tumbang bukan galat aplikasi — jatuh ke memori proses.
    memori.set(id, Date.now());
  }
}

/** Id pengguna yang sedang membuka aplikasi (±60 detik terakhir). */
export async function daftarHadir(): Promise<string[]> {
  if (memo && Date.now() - memo.pada < MEMO_MS) return memo.data;
  const r = klienCache();
  let data: string[];
  if (!r) {
    const batas = Date.now() - JENDELA_MS;
    for (const [id, waktu] of memori) if (waktu < batas) memori.delete(id);
    data = [...memori.keys()];
  } else {
    try {
      const himpunan = await Promise.all(
        Array.from({ length: EMBER_DIBACA }, (_, i) =>
          r.smembers<string[]>(kunciEmber(i)).catch(() => [] as string[]),
        ),
      );
      data = [...new Set(himpunan.flat().map(String))];
    } catch {
      data = [];
    }
  }
  memo = { pada: Date.now(), data };
  return data;
}
