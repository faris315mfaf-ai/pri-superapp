// ============================================================
// Retensi komentar QC (KHUSUS SISI SERVER) — fitur 1.22.x/3-perbaikan.
//
// Komentar adalah "penyimpanan sementara": otomatis dihapus setelah
// 2 hari (48 jam) — meniru pola retensi media video. Pembersihan
// dijalankan OPORTUNISTIK lewat after() pada route QC (tanpa cron).
//
// AMAN untuk dashboard: angka kepatuhan (comply) ada di tabel `rekap`
// yang TERPISAH dan dimaterialisasi saat analisis; menghapus baris
// `komentar` lama tidak mengubah satu pun angka kepatuhan — hanya
// daftar komentar mentah per-postingan yang menyusut (memang tujuannya).
// ============================================================
import { supabase } from "@/lib/supabase";

const KUNCI_RETENSI = "qc_komentar_retensi_jam";
const RETENSI_JAM_BAWAAN = 48; // 2 hari
const RETENSI_JAM_MIN = 6;

async function bacaRetensiJam(db: ReturnType<typeof supabase>): Promise<number> {
  const { data } = await db
    .from("pengaturan_sistem")
    .select("nilai")
    .eq("kunci", KUNCI_RETENSI)
    .maybeSingle();
  const n = Number(data?.nilai ?? RETENSI_JAM_BAWAAN);
  return Number.isFinite(n) && n >= RETENSI_JAM_MIN ? Math.floor(n) : RETENSI_JAM_BAWAAN;
}

/**
 * Hapus komentar yang usianya melewati batas retensi (bawaan 48 jam).
 * Tidak melempar — kegagalan pembersihan tidak boleh menggagalkan alur
 * pemanggilnya.
 */
export async function bersihkanKomentarKedaluwarsa(): Promise<void> {
  try {
    const db = supabase();
    const retensiJam = await bacaRetensiJam(db);
    const batas = new Date(Date.now() - retensiJam * 3600_000).toISOString();
    await db.from("komentar").delete().lt("dibuat_pada", batas);
  } catch (e) {
    console.error("[qc] bersih komentar kedaluwarsa:", e);
  }
}
