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
