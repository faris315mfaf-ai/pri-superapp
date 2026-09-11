// ============================================================
// Penjaga kolom `app_user.struktur_lain` (11 Sep 2026) — KHUSUS SERVER.
//
// Struktur ganda butuh kolom baru (sql/43). Sampai SQL itu dijalankan di
// database, kolomnya belum ada — dan PostgREST menolak dengan 400 setiap
// kali kolom yang tidak ada disebut. Kalau kode langsung menyebutnya,
// akibatnya fatal: HR tidak bisa mengubah divisi siapa pun.
//
// Jadi keberadaan kolom DIPERIKSA sekali per instansi server, lalu
// diingat. Belum ada kolomnya = aplikasi berjalan persis seperti
// sebelumnya (satu struktur saja), tanpa galat. Sudah ada = struktur
// ganda langsung menyala tanpa perlu rilis ulang.
// ============================================================
import { supabase } from "@/lib/supabase";

let jawaban: boolean | null = null;
let sedangPeriksa: Promise<boolean> | null = null;

/** true bila kolom `struktur_lain` sudah terpasang di database. */
export async function kolomStrukturLainAda(): Promise<boolean> {
  if (jawaban !== null) return jawaban;
  if (sedangPeriksa) return sedangPeriksa;
  sedangPeriksa = (async () => {
    try {
      const { error } = await supabase().from("app_user").select("struktur_lain").limit(1);
      jawaban = !error;
    } catch {
      jawaban = false;
    }
    sedangPeriksa = null;
    return jawaban;
  })();
  return sedangPeriksa;
}

/**
 * Potongan " , struktur_lain" untuk ditempel di daftar kolom select —
 * kosong bila kolomnya belum ada.
 */
export async function kolomStrukturSelect(): Promise<string> {
  return (await kolomStrukturLainAda()) ? ", struktur_lain" : "";
}
