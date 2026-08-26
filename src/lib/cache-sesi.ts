// ============================================================
// Cache sesi (KHUSUS SISI SERVER).
//
// MASALAH YANG DIPECAHKAN: userDariToken() dipanggil di hampir setiap
// permintaan API, dan tiap panggilan berarti dua query ke Supabase
// (cari sesi, lalu ambil profil). Untuk aplikasi yang layarnya
// memanggil beberapa endpoint sekaligus, itu belasan round-trip hanya
// untuk menjawab "siapa yang sedang masuk".
//
// TRADE-OFF TTL 60 DETIK — dibaca sebagai bagian keamanan, bukan
// sekadar performa:
// - Perubahan PROFIL (nama panggilan, foto, divisi) paling lambat
//   tampil 60 detik bila suatu tempat lupa memanggil invalidasi.
//   Itu batas terburuknya, dan tidak berbahaya.
// - Pencabutan AKSES (akun ditolak, dinonaktifkan, peran diturunkan,
//   sesi dicabut) TIDAK menunggu TTL sama sekali: setiap tempat yang
//   mengubah baris app_user memanggil hapusCacheUser() sehingga entri
//   cache-nya hilang seketika. TTL hanyalah jaring pengaman terakhir
//   bila ada jalur yang terlewat, bukan mekanisme utamanya.
//
// DUA LAPIS, dipilih otomatis:
// 1. Redis (Upstash) bila diatur → cache dipakai bersama oleh semua
//    instance, jadi tetap berguna di serverless yang instance-nya
//    berganti-ganti.
// 2. Memori proses sebagai cadangan → berguna di satu VPS/laptop.
//
// Kunci Redis: `sesi:<token_hash>` untuk entrinya, plus
// `sesi-milik:<user_id>` (SET berisi token_hash) supaya satu akun bisa
// dibatalkan seluruh entrinya tanpa memindai seluruh basis kunci.
// ============================================================

import { klienRedis } from "@/lib/redis";
import type { UserPublik } from "@/lib/sesi";

/** Umur entri cache. */
const TTL_DETIK = 60;

/** Batas entri di memori proses; yang terlama dibuang lebih dulu. */
const MAKS_ENTRI = 5000;

type Entri = { user: UserPublik; diambilPada: number };

// Map JavaScript mempertahankan urutan penyisipan, jadi kunci pertama
// adalah yang terlama — cukup untuk pola LRU sederhana.
const memori = new Map<string, Entri>();
// user_id → kumpulan token_hash miliknya, supaya pembatalan per-akun
// tidak perlu menyusuri seluruh isi cache.
const milikSiapa = new Map<string, Set<string>>();

function kunciRedis(tokenHash: string): string {
  return `sesi:${tokenHash}`;
}

function kunciMilik(userId: string): string {
  return `sesi-milik:${userId}`;
}

/**
 * Ambil profil dari cache. null berarti tidak ada / sudah kedaluwarsa,
 * dan pemanggil harus bertanya ke database seperti biasa.
 */
export async function ambilCacheSesi(tokenHash: string): Promise<UserPublik | null> {
  const redis = klienRedis();
  if (redis) {
    try {
      const isi = await redis.get<UserPublik>(kunciRedis(tokenHash));
      if (isi) return isi;
    } catch {
      // Redis bermasalah bukan alasan menolak pengguna — turun diam-diam
      // ke lapisan memori, lalu ke database.
    }
  }

  const entri = memori.get(tokenHash);
  if (!entri) return null;
  if (Date.now() - entri.diambilPada > TTL_DETIK * 1000) {
    memori.delete(tokenHash);
    return null;
  }
  // Sentuh entri supaya menjadi yang terbaru (pola LRU sederhana).
  memori.delete(tokenHash);
  memori.set(tokenHash, entri);
  return entri.user;
}

/** Simpan profil ke cache selama TTL_DETIK. */
export async function simpanCacheSesi(
  tokenHash: string,
  user: UserPublik,
): Promise<void> {
  const redis = klienRedis();
  if (redis) {
    try {
      await redis.set(kunciRedis(tokenHash), user, { ex: TTL_DETIK });
      // Daftar kepemilikan dibuat sedikit lebih panjang umurnya
      // daripada entrinya, supaya pembatalan tetap menemukan sasaran
      // walau entri terakhir hampir kedaluwarsa.
      await redis.sadd(kunciMilik(String(user.id)), tokenHash);
      await redis.expire(kunciMilik(String(user.id)), TTL_DETIK * 4);
    } catch {
      // Gagal menyimpan cache tidak boleh menggagalkan permintaan.
    }
  }

  memori.set(tokenHash, { user, diambilPada: Date.now() });
  const set = milikSiapa.get(String(user.id)) ?? new Set<string>();
  set.add(tokenHash);
  milikSiapa.set(String(user.id), set);

  // Buang yang terlama bila melewati batas.
  while (memori.size > MAKS_ENTRI) {
    const tertua = memori.keys().next().value;
    if (tertua === undefined) break;
    const dibuang = memori.get(tertua);
    memori.delete(tertua);
    if (dibuang) milikSiapa.get(String(dibuang.user.id))?.delete(tertua);
  }
}

/** Hapus satu entri (dipakai saat sebuah perangkat keluar). */
export async function hapusCacheToken(tokenHash: string): Promise<void> {
  const redis = klienRedis();
  if (redis) {
    try {
      await redis.del(kunciRedis(tokenHash));
    } catch {
      // diabaikan; entri memori tetap dibuang di bawah
    }
  }
  const entri = memori.get(tokenHash);
  memori.delete(tokenHash);
  if (entri) milikSiapa.get(String(entri.user.id))?.delete(tokenHash);
}

/**
 * Hapus SEMUA entri milik satu akun.
 *
 * WAJIB dipanggil setiap kali baris app_user berubah (status, aktif,
 * role, jabatan, divisi, profil) supaya pencabutan akses berlaku
 * seketika — bukan menunggu TTL habis.
 */
export async function hapusCacheUser(userId: number | string): Promise<void> {
  const id = String(userId);

  const redis = klienRedis();
  if (redis) {
    try {
      const daftar = await redis.smembers<string[]>(kunciMilik(id));
      if (daftar && daftar.length > 0) {
        await redis.del(...daftar.map(kunciRedis));
      }
      await redis.del(kunciMilik(id));
    } catch {
      // diabaikan; lapisan memori tetap dibersihkan di bawah
    }
  }

  const set = milikSiapa.get(id);
  if (set) {
    for (const tokenHash of set) memori.delete(tokenHash);
    milikSiapa.delete(id);
  }
}

/** true bila cache sesi memakai Redis — dipakai /api/sehat. */
export function cacheSesiTerpusat(): boolean {
  return klienRedis() !== null;
}
