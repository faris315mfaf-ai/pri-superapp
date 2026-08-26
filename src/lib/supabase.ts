// ============================================================
// PRI SuperApp — Koneksi Supabase (KHUSUS SISI SERVER)
//
// PENTING: file ini memakai SECRET KEY yang mem-bypass RLS.
// Hanya boleh diimpor dari API route / Server Component.
// JANGAN pernah diimpor dari komponen bertanda "use client",
// karena kuncinya akan ikut terkirim ke browser pengguna.
// ============================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Kesalahan konfigurasi .env — pesan sengaja berbahasa Indonesia */
export class KonfigurasiError extends Error {}

let klien: SupabaseClient | null = null;

/**
 * Ambil klien Supabase (dibuat sekali lalu dipakai ulang).
 * Melempar KonfigurasiError bila .env.local belum diisi, supaya
 * pesan errornya jelas ketimbang "fetch failed" yang membingungkan.
 */
export function supabase(): SupabaseClient {
  if (klien) return klien;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new KonfigurasiError(
      "Koneksi database belum diatur. Isi SUPABASE_URL dan SUPABASE_SECRET_KEY di file .env.local",
    );
  }

  klien = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return klien;
}

/** true bila .env sudah lengkap — dipakai untuk pesan status yang ramah */
export function supabaseSiap(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}
