// ============================================================
// PENGINGAT OTOMATIS VIDEO WAJIB (15 Okt 2026) — KHUSUS SERVER.
//
// Dipanggil penjadwal tiap ±10 menit (/api/cron/video-wajib). Untuk setiap
// perintah yang AKTIF + wajib posting + pengingat menyala: dua jam sebelum
// batas jam (WIB) — dan hanya SEKALI per perintah per hari — anggota yang
// belum menuntaskan perintahnya dikabari lewat notifikasi aplikasi + push.
//
// Murni dari catatan yang ada: tidak memanggil platform mana pun.
// ============================================================
import { supabase } from "@/lib/supabase";
import { kirimKabar } from "@/lib/notifikasi";
import { pastikanKategoriBolehDipakai } from "@/lib/kategori-status";
import {
  catatanPosting,
  hitungKepatuhan,
  perintahWajibAktif,
  roster,
  tanggalTerbit,
  type PerintahWajib,
} from "@/lib/video-wajib-pantau";
import { berlakuPada, menitDariJam, menitWib, tanggalWibWajib } from "@/lib/video-wajib-perintah";

/** Berapa menit sebelum batas jam pengingat otomatis dikirim. */
export const MENIT_SEBELUM_BATAS = 120;

/** Sudah waktunya mengirim pengingat otomatis untuk perintah ini? (murni) */
export function saatnyaMengingatkan(p: PerintahWajib, ms: number): boolean {
  if (!p.aktif || !p.wajib_posting || !p.pengingat) return false;
  const hari = tanggalWibWajib(ms);
  if (!berlakuPada({ aktif: p.aktif, batas_waktu: p.batas_waktu, dibuat_tanggal: tanggalTerbit(p), wajib_posting: p.wajib_posting, pola: p.pola }, hari)) {
    return false;
  }
  const batas = menitDariJam(p.batas_jam);
  const mulai = Math.max(0, batas - MENIT_SEBELUM_BATAS);
  const kini = menitWib(ms);
  return kini >= mulai && kini < batas;
}

export type HasilPengingat = { diperiksa: number; dikirim: { perintah: string; penerima: number }[]; lewati: string[] };

export async function jalankanPengingatWajib(ms = Date.now()): Promise<HasilPengingat> {
  const hasil: HasilPengingat = { diperiksa: 0, dikirim: [], lewati: [] };
  const daftar = await perintahWajibAktif();
  if (daftar.length === 0) return hasil;
  const db = supabase();
  const hari = tanggalWibWajib(ms);

  for (const p of daftar) {
    hasil.diperiksa += 1;
    if (!saatnyaMengingatkan(p, ms)) continue;
    const id = Number(p.id);

    // Kategori yang sudah SELESAI/nonaktif ditolak server saat unggah: mengingatkan hanya membuat
    // anggota mencoba sesuatu yang pasti gagal.
    try {
      await pastikanKategoriBolehDipakai(p.kategori);
    } catch {
      hasil.lewati.push(`${p.id}: kategori tidak bisa dipakai lagi`);
      continue;
    }

    // Catat DULU (indeks unik per perintah per hari) supaya putaran yang berbarengan tidak ikut
    // mengirim. Bentrok (23505) = sudah dikirim/sedang dikirim oleh putaran lain.
    const { error: galatCatat } = await db
      .from("tvr_wajib_pengingat")
      .insert({ perintah_id: id, tanggal_wib: hari, jenis: "otomatis", jumlah: 0 });
    if (galatCatat) {
      if (galatCatat.code !== "23505") hasil.lewati.push(`${p.id}: gagal mencatat (${galatCatat.message})`);
      continue;
    }

    try {
      // Pembacaan KETAT (melempar bila ada kueri gagal): data parsial akan mengirim "belum memposting"
      // ke anggota yang sebenarnya sudah selesai.
      const [anggota, { catatan }] = await Promise.all([roster(), catatanPosting(id)]);
      const { daftar: baris } = hitungKepatuhan(p, hari, anggota, catatan);
      const belum = baris.filter((b) => b.status !== "selesai").map((b) => Number(b.user_id)).filter((n) => n > 0);
      if (belum.length > 0) {
        await kirimKabar({
          judul: `⏰ Video Wajib: ${p.judul}`.slice(0, 120),
          isi: `Anda belum memposting "${p.judul}"${p.kategori ? ` (kategori ${p.kategori})` : ""} di semua akun. Batas ${p.batas_jam.replace(":", ".")} WIB. Buka TV Rakyat Saya sekarang.`,
          kategori: "peringatan",
          jenis_peristiwa: "video_wajib_pengingat",
          target: "tvrku",
          untukUserIds: belum,
        });
        await db
          .from("tvr_wajib_pengingat")
          .update({ jumlah: belum.length })
          .eq("perintah_id", id)
          .eq("tanggal_wib", hari)
          .eq("jenis", "otomatis");
        hasil.dikirim.push({ perintah: p.id, penerima: belum.length });
      }
    } catch (e) {
      // Gagal sebelum terkirim: cabut penanda supaya putaran berikutnya (10 menit lagi) mencoba lagi.
      console.error("[video-wajib] pengingat gagal:", e);
      await db
        .from("tvr_wajib_pengingat")
        .delete()
        .eq("perintah_id", id)
        .eq("tanggal_wib", hari)
        .eq("jenis", "otomatis")
        .then(
          () => undefined,
          () => undefined,
        );
      hasil.lewati.push(`${p.id}: ${e instanceof Error ? e.message : "gagal"}`);
    }
  }
  return hasil;
}
