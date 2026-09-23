// ============================================================
// Laporan video manual yang TERTAHAN di antrean ACC HR lama.
//
// Sejak 12 Sep 2026 laporan manual langsung masuk laporan_video. Tapi
// antrean lama (laporan_video_pending berstatus "menunggu") masih berisi
// ratusan link yang tak pernah diputus — dan layar anggota terus
// menampilkannya sebagai "menunggu HR". Permintaan 23 Sep 2026: ACC HR
// ditiadakan sama sekali, jadi sisa antrean itu diluluskan otomatis.
//
// Dijalankan di jalur yang memang sudah dilewati anggota (GET/POST
// laporan, rangkuman) untuk orang itu saja, dan disapu global oleh cron
// rekonsiliasi — jadi tidak perlu migrasi SQL (sql/47) untuk membereskannya.
//
// Aman diulang: link yang sudah ada di laporan_video (bentrok unik
// user_id+url_video, 23505) dianggap sudah tercatat; koin idempoten per
// referensi `laporan-<id>` sehingga tidak pernah dibayar dua kali.
// ============================================================
import { supabase } from "@/lib/supabase";
import { beriKoin } from "@/lib/koin";
import { namaKolomHilang } from "@/lib/kolom-struktur";

const CATATAN = "Disetujui otomatis — ACC HR ditiadakan";

type Tertahan = {
  id: unknown;
  user_id: unknown;
  platform: unknown;
  url_video: unknown;
  keyword?: unknown;
  tanggal_wib: unknown;
};

/**
 * Luluskan laporan manual yang masih "menunggu" ke laporan_video.
 * `userId` diisi = hanya milik orang itu; kosong = sapuan global (cron).
 * Mengembalikan jumlah baris antrean yang diputus. Tidak pernah melempar
 * galat — kegagalan di sini tidak boleh menggagalkan layar anggota.
 */
export async function luluskanLaporanTertahan(
  userId?: number,
  batas = 200,
  /** Hanya untuk uji (tests/uji-laporan-tertahan.mts). */
  suntik?: { db?: ReturnType<typeof supabase>; koin?: typeof beriKoin },
): Promise<number> {
  try {
    const db = suntik?.db ?? supabase();
    const bayar = suntik?.koin ?? beriKoin;
    let q = db
      .from("laporan_video_pending")
      .select("id, user_id, platform, url_video, keyword, tanggal_wib")
      .eq("status", "menunggu");
    if (userId) q = q.eq("user_id", userId);
    const { data, error } = await q.order("id").limit(batas);
    if (error) {
      console.error("[laporan-tertahan] baca:", error.message);
      return 0;
    }
    let diputus = 0;
    for (const p of (data ?? []) as Tertahan[]) {
      const uid = Number(p.user_id);
      const isi: Record<string, unknown> = {
        user_id: uid,
        platform: p.platform,
        url_video: p.url_video,
        keyword: p.keyword ?? null,
        tanggal_wib: p.tanggal_wib,
        sumber: "manual",
      };
      let hasil = await db.from("laporan_video").insert(isi).select("id").single();
      // Database cloud belum tentu punya kolom keyword — ulang tanpa itu.
      if (hasil.error && namaKolomHilang(hasil.error.message) === "keyword") {
        delete isi.keyword;
        hasil = await db.from("laporan_video").insert(isi).select("id").single();
      }
      // 23505 = link ini sudah tercatat lewat jalur lain → cukup tutup antreannya.
      if (hasil.error && hasil.error.code !== "23505") {
        console.error("[laporan-tertahan] catat:", hasil.error.message);
        continue;
      }
      if (hasil.data) await bayar(uid, "laporan_video", `laporan-${Number(hasil.data.id)}`);
      const { error: errTutup } = await db
        .from("laporan_video_pending")
        .update({
          status: "disetujui",
          catatan: CATATAN,
          diputus_oleh: "Sistem",
          diputus_pada: new Date().toISOString(),
        })
        .eq("id", Number(p.id))
        .eq("status", "menunggu");
      if (errTutup) {
        console.error("[laporan-tertahan] tutup antrean:", errTutup.message);
        continue;
      }
      diputus++;
    }
    return diputus;
  } catch (e) {
    console.error("[laporan-tertahan]", e instanceof Error ? e.message : e);
    return 0;
  }
}
