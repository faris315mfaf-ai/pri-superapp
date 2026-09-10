// ============================================================
// Sayap Partai — daftar gabungan (KHUSUS SISI SERVER), 10 Sep 2026.
//
// Sayap bawaan hidup di src/lib/struktur.ts (SUB_SAYAP, aman klien).
// Sayap TAMBAHAN disimpan di tabel sayap_partai — bisa ditambah oleh
// Divisi HR, superadmin, dan master lewat /api/sayap. Modul ini
// menggabungkan keduanya untuk pemilih dan untuk validasi server
// (pastikanStrukturSah menerima daftar tambahan ini).
//
// Dicache 60 detik per proses: daftar sayap jarang berubah, sedangkan
// validasinya dipanggil di tiap ubah divisi / simpan profil.
// ============================================================
import { supabase } from "@/lib/supabase";
import { SUB_SAYAP } from "@/lib/struktur";

export type Sayap = {
  id: number | null;
  nilai: string;
  label: string;
  /** true = sayap bawaan aplikasi (tak bisa dinonaktifkan dari tabel). */
  bawaan: boolean;
  aktif: boolean;
};

let cache: { pada: number; data: Sayap[] } | null = null;
const UMUR_CACHE_MS = 60_000;

/** Semua sayap: bawaan + tambahan (termasuk yang nonaktif, ditandai). */
export async function daftarSayap(paksa = false): Promise<Sayap[]> {
  if (!paksa && cache && Date.now() - cache.pada < UMUR_CACHE_MS) return cache.data;
  const { data, error } = await supabase()
    .from("sayap_partai")
    .select("id, nilai, label, aktif")
    .order("label", { ascending: true });
  if (error) console.error("[sayap] baca:", error.message);
  const bawaanNilai = new Set(SUB_SAYAP.map((s) => s.nilai));
  const tambahan: Sayap[] = (data ?? [])
    // Nama yang kebetulan sama dengan bawaan tidak digandakan.
    .filter((b) => !bawaanNilai.has(String(b.nilai)))
    .map((b) => ({
      id: Number(b.id),
      nilai: String(b.nilai),
      label: String(b.label),
      bawaan: false,
      aktif: b.aktif !== false,
    }));
  const semua: Sayap[] = [
    ...SUB_SAYAP.map((s) => ({ id: null, nilai: s.nilai, label: s.label, bawaan: true, aktif: true })),
    ...tambahan,
  ];
  cache = { pada: Date.now(), data: semua };
  return semua;
}

/** Nilai sayap tambahan yang AKTIF — untuk pastikanStrukturSah(). */
export async function nilaiSayapTambahan(): Promise<string[]> {
  const semua = await daftarSayap();
  return semua.filter((s) => !s.bawaan && s.aktif).map((s) => s.nilai);
}

export function buangCacheSayap(): void {
  cache = null;
}
