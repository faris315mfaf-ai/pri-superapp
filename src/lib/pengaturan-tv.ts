// ============================================================
// Pengaturan modul TV Rakyat (fitur 1.20/6 & 1.20/8) — SISI SERVER.
//
// Disimpan di pengaturan_sistem (key-value, pola rumah):
// - tv_maks_upload_mb : batas ukuran video unggahan manual (1-200 MB)
// - tv_retensi_jam    : umur tayang video di aplikasi SETELAH upload
//                       ke sosmed (1-24 jam). Lewat itu: embed hilang
//                       dari Konten/Beranda dan berkas videonya
//                       dibersihkan dari penyimpanan. Postingan yang
//                       sudah naik di sosmed TIDAK disentuh, dan baris
//                       riwayat tetap ada untuk statistik dashboard.
//
// Keduanya diatur Pimpinan Redaksi lewat layar Kelola Tim TV.
// ============================================================
import { supabase } from "@/lib/supabase";

export const MAKS_UPLOAD_MB_BAWAAN = 100;
export const RETENSI_JAM_BAWAAN = 24;

/**
 * Baca satu pengaturan angka dengan pagar min-maks. Nilai rusak/di
 * luar rentang jatuh ke bawaan — pengaturan salah tidak boleh membuat
 * fitur mati.
 */
async function bacaAngka(
  kunci: string,
  bawaan: number,
  min: number,
  maks: number,
): Promise<number> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", kunci)
      .maybeSingle();
    const n = Number(data?.nilai);
    if (Number.isFinite(n) && n >= min && n <= maks) return Math.floor(n);
  } catch {
    // Gagal baca = pakai bawaan; bukan alasan menggagalkan pemanggil.
  }
  return bawaan;
}

/** Batas ukuran unggahan video manual, dalam MB (1-200). */
export async function maksUploadMb(): Promise<number> {
  return bacaAngka("tv_maks_upload_mb", MAKS_UPLOAD_MB_BAWAAN, 1, 200);
}

/** Umur tayang video di aplikasi setelah upload sosmed, dalam jam (1-24). */
export async function retensiJamTv(): Promise<number> {
  return bacaAngka("tv_retensi_jam", RETENSI_JAM_BAWAAN, 1, 24);
}

/**
 * Apakah kartu "Video Baru TV Rakyat" ditampilkan di modul Konten
 * (fitur 1.22.x/2). BAWAAN tersembunyi (false) — hanya muncul bila
 * Pimpinan Redaksi menyalakannya dari TV Rakyat Official.
 */
export async function videoBaruTampil(): Promise<boolean> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", "tvr_video_baru_tampil")
      .maybeSingle();
    return data?.nilai === "true";
  } catch {
    return false;
  }
}
