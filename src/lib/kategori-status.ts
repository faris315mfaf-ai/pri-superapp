// ============================================================
// STATUS KATEGORI (13 Sep 2026) — apakah sebuah kategori masih boleh
// dipilih kreator saat mengunggah / melaporkan video.
//
// Tiga keadaan kategori di keyword_wajib:
//   • aktif           → boleh dipilih.
//   • nonaktif        → disembunyikan (salah ketik, ganda); tidak boleh.
//   • SELESAI         → acaranya sudah lewat. Kreator TIDAK perlu dan
//                       TIDAK BOLEH mengunggah lagi. Datanya — laporan,
//                       unggahan, angka — tetap disimpan dan tetap tampil
//                       di insight; hanya pintu masuknya yang ditutup.
// Kategori tetap ("Video Sendiri") selalu boleh: ia hidup di kode.
//
// Keputusannya dibuat oleh fungsi MURNI (putuskanKategori) supaya bisa
// diuji tanpa database; pembungkus server (periksaKategoriBolehDipakai)
// hanya mengambil barisnya. Ditegakkan di server: dropdown di layar
// bisa saja basi (dibuka sebelum kategori ditandai selesai).
// ============================================================

import { supabase } from "@/lib/supabase";
import { kategoriTetap } from "@/lib/kategori-tetap";
import { polaPersis } from "@/lib/insight-kategori";

export type BarisKategori = {
  keyword: string;
  aktif: boolean;
  selesai: boolean;
};

/**
 * null = boleh dipakai; selain itu pesan penolakan untuk pengguna.
 * `baris` = undefined bila kategori tidak ada di tabel.
 */
export function putuskanKategori(nama: string, baris: BarisKategori | undefined): string | null {
  const n = nama.trim();
  if (!n) return "Pilih kategori videonya dulu.";
  if (kategoriTetap.adalah(n)) return null;
  if (!baris) return `Kategori "${n}" tidak dikenal. Pilih dari daftar kategori yang tersedia.`;
  if (baris.selesai) {
    return `Kategori "${baris.keyword}" sudah SELESAI — tidak perlu mengunggah video untuknya lagi.`;
  }
  if (!baris.aktif) return `Kategori "${baris.keyword}" sedang nonaktif. Pilih kategori lain.`;
  return null;
}

/** Versi server: cari barisnya, lalu putuskan. Melempar Error status 400 bila ditolak. */
export async function pastikanKategoriBolehDipakai(nama: string): Promise<void> {
  const n = nama.trim();
  let baris: BarisKategori | undefined;
  if (n && !kategoriTetap.adalah(n)) {
    const { data, error } = await supabase()
      .from("keyword_wajib")
      .select("keyword, aktif, selesai")
      .ilike("keyword", polaPersis(n))
      .limit(1)
      .maybeSingle();
    // Kolom `selesai` belum ada (sql/51 belum dijalankan)? Jangan
    // mengunci semua unggahan gara-gara migrasi tertinggal: anggap
    // belum ada yang selesai, tapi tetap periksa ada/aktifnya.
    if (error && error.code === "42703") {
      const lama = await supabase()
        .from("keyword_wajib")
        .select("keyword, aktif")
        .ilike("keyword", polaPersis(n))
        .limit(1)
        .maybeSingle();
      baris = lama.data ? { keyword: String(lama.data.keyword), aktif: lama.data.aktif === true, selesai: false } : undefined;
    } else if (error) {
      throw new Error("Gagal memeriksa kategori.");
    } else {
      baris = data
        ? { keyword: String(data.keyword), aktif: data.aktif === true, selesai: data.selesai === true }
        : undefined;
    }
  }
  const pesan = putuskanKategori(n, baris);
  if (pesan) throw Object.assign(new Error(pesan), { status: 400 });
}
