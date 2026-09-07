// ============================================================
// Sambungan Redis bersama (KHUSUS SISI SERVER).
//
// Dipakai dua hal: pembatas laju (src/lib/rate-limit.ts) dan cache
// sesi (src/lib/cache-sesi.ts). Keduanya OPSIONAL — bila variabel
// lingkungannya kosong, masing-masing kembali ke penyimpanan di
// memori proses tanpa galat dan tanpa log berisik.
//
// Menerima DUA penamaan variabel:
// - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN → didaftarkan
//   sendiri
// - KV_REST_API_URL / KV_REST_API_TOKEN → nama yang dipakai integrasi
//   Upstash lewat Vercel Marketplace
// Menerima keduanya menghapus satu penyebab gagal yang membingungkan:
// Redis sudah dibuat, tetapi aplikasi diam-diam tetap memakai memori.
// ============================================================

import { Redis } from "@upstash/redis";

export type KonfigRedis = { url: string; token: string };

export function konfigRedis(): KonfigRedis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function redisAktif(): boolean {
  return konfigRedis() !== null;
}

// Satu klien dipakai ulang selama proses hidup. Membuat klien baru di
// tiap permintaan hanya memboroskan sambungan.
let klien: Redis | null = null;

/** Klien Redis, atau null bila Upstash belum diatur. */
export function klienRedis(): Redis | null {
  const konfig = konfigRedis();
  if (!konfig) return null;
  if (!klien) klien = new Redis({ url: konfig.url, token: konfig.token });
  return klien;
}

// ------------------------------------------------------------
// CACHE BERSAMA lewat REDIS_URL (TCP, 7 Sep 2026).
//
// Insiden 7 Sep 2026: produksi hanya punya REDIS_URL (Redis Cloud, skema
// redis://), bukan pasangan URL/token REST Upstash — jadi cache sesi diam-
// diam memakai memori per-instans Vercel dan ~55% lalu lintas Supabase
// adalah pemeriksaan sesi (sesi_perangkat + app_user) yang berulang-ulang.
// Adapter ioredis ini memberi cache sesi yang benar-benar dipakai bersama
// semua instans. Pembatas laju (@upstash/ratelimit) tetap butuh klien
// Upstash, jadi klienRedis()/redisAktif() TIDAK berubah.
// ------------------------------------------------------------
import IORedis from "ioredis";

/** Bagian API Redis yang dipakai cache sesi — dipenuhi klien Upstash maupun adapter TCP. */
export type KlienCache = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opsi?: { ex?: number }): Promise<unknown>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers<T = string[]>(key: string): Promise<T>;
  expire(key: string, seconds: number): Promise<number>;
  del(...keys: string[]): Promise<number>;
};

class AdapterRedisTcp implements KlienCache {
  private readonly r: IORedis;
  constructor(url: string) {
    this.r = new IORedis(url, {
      lazyConnect: true,
      connectTimeout: 3000,
      // Perintah boleh antre sebentar sampai tersambung; bila Redis tumbang,
      // tiap perintah gagal <= 2,5 dtk lalu pemanggil turun ke memori/DB.
      commandTimeout: 2500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      retryStrategy: (kali) => (kali > 3 ? null : Math.min(200 * kali, 1000)),
    });
    this.r.on("error", () => {
      // Sengaja senyap: Redis tumbang bukan galat aplikasi; lapisan memori/DB mengambil alih.
    });
    // Sambung sekali di awal (tanpa await) — perintah pertama menunggu di antrean.
    this.r.connect().catch(() => {});
  }
  async get<T = unknown>(key: string): Promise<T | null> {
    const v = await this.r.get(key);
    if (v == null) return null;
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as unknown as T;
    }
  }
  async set(key: string, value: unknown, opsi?: { ex?: number }): Promise<unknown> {
    const isi = typeof value === "string" ? value : JSON.stringify(value);
    return opsi?.ex ? this.r.set(key, isi, "EX", opsi.ex) : this.r.set(key, isi);
  }
  sadd(key: string, ...members: string[]): Promise<number> {
    return this.r.sadd(key, ...members);
  }
  async smembers<T = string[]>(key: string): Promise<T> {
    return (await this.r.smembers(key)) as unknown as T;
  }
  expire(key: string, seconds: number): Promise<number> {
    return this.r.expire(key, seconds);
  }
  del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return Promise.resolve(0);
    return this.r.del(...keys);
  }
}

let klienTcp: AdapterRedisTcp | null = null;

/**
 * Klien cache bersama: Upstash (REST) bila ada, kalau tidak REDIS_URL (TCP),
 * kalau tidak ada keduanya → null (pemanggil memakai memori proses).
 */
export function klienCache(): KlienCache | null {
  const upstash = klienRedis();
  if (upstash) return upstash as unknown as KlienCache;
  const url = process.env.REDIS_URL;
  if (!url || !/^rediss?:\/\//i.test(url)) return null;
  if (!klienTcp) klienTcp = new AdapterRedisTcp(url);
  return klienTcp;
}

/** true bila ada cache bersama (Upstash atau REDIS_URL) — untuk /api/sehat & Panel Master. */
export function cacheBersamaAktif(): boolean {
  return klienCache() !== null;
}
