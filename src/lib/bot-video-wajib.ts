// ============================================================
// BOT REDAKSI — pembaca permintaan Video Wajib Pimred (13 Okt 2026).
//
// Sistem lama tidak punya status "terpenuhi" maupun notifikasi (lihat
// docs/BOT-REDAKSI-SCRAPER-DAN-VIDEO-WAJIB.md §1, §4), jadi bot melacaknya
// sendiri di bot_video_wajib (UNIQUE video_wajib_id = satu permintaan hanya
// diambil satu bot). Route /api/tv/video-wajib TIDAK diubah; kueri di sini
// berdiri sendiri. Aturan penyaringan (murni) ada di bot-kerja-murni.ts.
//
// Server saja (service role). Tahan tabel/kolom belum ada: hasil kosong.
// ============================================================

import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import { KERJA, hariIniWib, saringPermintaanWajib, type BarisVideoWajib, type PermintaanWajib } from "@/lib/bot-kerja-murni";

export type { PermintaanWajib } from "@/lib/bot-kerja-murni";

const KOLOM_BARU = "id, judul, keterangan, link_doksli, kategori, batas_waktu, dibuat_pada, sumber_video";
/** Kolom sumber_video berasal dari sql/52; tanpa itu tetap bisa dibaca. */
const KOLOM_LAMA = "id, judul, keterangan, link_doksli, kategori, batas_waktu, dibuat_pada";

/** Kolom tidak ada (belum migrasi) — PostgreSQL 42703 atau cache skema PostgREST. */
const kolomHilang = (e: { code?: string } | null | undefined): boolean => e?.code === "42703" || e?.code === "PGRST204";

/**
 * Permintaan Video Wajib yang layak diambil bot, terdekat tenggat lebih dulu.
 * Syarat: aktif, batas_waktu kosong atau >= hari ini WIB, link_doksli lolos
 * kunciKanonik, belum ada di bot_video_wajib. Tabel belum ada → [].
 * Kegagalan DB lain → melempar (pemanggil memutuskan; tak boleh dikira "kosong").
 */
export async function bacaPermintaanWajib(sekarangMs: number = Date.now()): Promise<PermintaanWajib[]> {
  const db = supabase();
  const hari = hariIniWib(sekarangMs);
  const kueri = (kolom: string) =>
    db
      .from("tvr_video_wajib")
      .select(kolom)
      .eq("aktif", true)
      .or(`batas_waktu.is.null,batas_waktu.gte.${hari}`)
      .order("batas_waktu", { ascending: true, nullsFirst: false })
      .order("dibuat_pada", { ascending: true })
      .limit(KERJA.MAKS_PERMINTAAN_WAJIB);

  let r = await kueri(KOLOM_BARU);
  if (r.error && kolomHilang(r.error)) r = await kueri(KOLOM_LAMA);
  if (r.error) {
    if (tabelBelumAda(r.error)) return [];
    console.error("[bot/video-wajib] baca permintaan:", r.error.message);
    throw new Error("Gagal memuat permintaan Video Wajib.");
  }
  const baris = (r.data ?? []) as unknown as BarisVideoWajib[];
  if (baris.length === 0) return [];

  const { data: diambil, error } = await db
    .from("bot_video_wajib")
    .select("video_wajib_id")
    .in(
      "video_wajib_id",
      baris.map((b) => Number(b.id)),
    );
  if (error) {
    if (tabelBelumAda(error)) return [];
    console.error("[bot/video-wajib] baca klaim:", error.message);
    throw new Error("Gagal memuat klaim Video Wajib.");
  }
  const sudah = new Set(((diambil ?? []) as { video_wajib_id: number }[]).map((d) => Number(d.video_wajib_id)));
  return saringPermintaanWajib(baris, sudah, hari);
}

/**
 * Klaim atomik: INSERT ke bot_video_wajib. UNIQUE(video_wajib_id) menjamin hanya
 * satu bot yang menang. true = berhasil mengambil; false = sudah diambil bot lain
 * (kode 23505), TANPA melempar. Galat lain melempar.
 */
export async function klaimVideoWajib(botId: number, videoWajibId: number): Promise<boolean> {
  const { error } = await supabase().from("bot_video_wajib").insert({ video_wajib_id: videoWajibId, bot_id: botId, status: "diambil" });
  if (!error) return true;
  if (error.code === "23505") return false;
  console.error("[bot/video-wajib] klaim:", error.message);
  throw new Error("Gagal mengambil Video Wajib.");
}
