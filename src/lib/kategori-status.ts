// ============================================================
// STATUS KATEGORI (13 Sep 2026) — apakah sebuah kategori masih boleh
// dipilih kreator saat mengunggah / melaporkan video.
//
// Tiga keadaan kategori di keyword_wajib:
//   • aktif           → boleh dipilih.
//   • nonaktif        → disembunyikan (salah ketik, ganda); tidak boleh.
//   • SELESAI         → acaranya sudah lewat: DISEMBUNYIKAN (26 Sep 2026).
//                       Kreator TIDAK boleh mengunggah lagi. Datanya —
//                       laporan, unggahan, angka — tetap disimpan dan
//                       tampil di insight; Pimred/Superadmin bisa
//                       memunculkannya lagi (lib/kategori-selesai).
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
import { petaKategoriSelesai } from "@/lib/kategori-selesai";

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
      .select("id, keyword, aktif")
      .ilike("keyword", polaPersis(n))
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Gagal memeriksa kategori.");
    if (data) {
      // Status selesai (disembunyikan) dari kolomnya ATAU catatan
      // pengaturan_sistem bila kolomnya belum dipasang (26 Sep 2026).
      const selesai = (await petaKategoriSelesai()).has(String(data.id));
      baris = { keyword: String(data.keyword), aktif: data.aktif === true, selesai };
    }
  }
  const pesan = putuskanKategori(n, baris);
  if (pesan) throw Object.assign(new Error(pesan), { status: 400 });
}
