// GET  /api/berita — berita terbaru hasil scraping (dibaca dari Supabase)
// POST /api/berita — picu scraping baru LANGSUNG lewat TikHub (fitur
//                    1.22.x/5-bug), lalu kembalikan hasil terbarunya.
//
// Sejak 1.22.x scraping dikerjakan APLIKASI sendiri via TikHub (bukan
// Apify/n8n): lib/scrape-berita menarik postingan akun sumber_berita
// aktif & menyimpannya ke tabel `berita`. Dijalankan di latar (after)
// supaya permintaan tak menggantung; layar memantau tabel `berita`.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { jalankanScrapeBerita } from "@/lib/scrape-berita";
import { tikhubSiap } from "@/lib/tikhub";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Kolom yang dibutuhkan kartu berita di layar TV Rakyat */
const KOLOM =
  "id, judul, sumber, waktu_relatif, platform_asal, link_video, thumbnail_url, ringkasan, sumber_akun, jenis, dipakai, selisih_menit";

/** Ambil daftar berita terbaru yang belum dipakai */
async function ambilBerita() {
  return pastikanSukses(
    await supabase()
      .from("v_app_berita")
      .select(KOLOM)
      .order("waktu_terbit", { ascending: false })
      .limit(30),
    "daftar berita",
  );
}

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    await pastikanMasuk(request);
    return { data: await ambilBerita() };
  });
}

/**
 * MULAI pemindaian baru — tidak menunggu sampai selesai.
 *
 * Scraping 6 profil lewat Apify makan waktu sekitar satu menit, jauh
 * lebih lama dari batas hidup sebuah permintaan web (baik batas tunggu
 * aplikasi maupun batas fungsi serverless Vercel). Karena itu n8n
 * membalas segera lalu bekerja di latar belakang, dan aplikasi memantau
 * tabel `berita` sampai hasil barunya muncul.
 *
 * Respons memuat daftar berita SAAT INI beserta penanda `dimulai`,
 * supaya layar bisa membandingkan mana yang baru nanti.
 */
export async function POST(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    if (!tikhubSiap()) {
      throw Object.assign(
        new Error("Scraper berita belum diaktifkan (TIKHUB_TOKEN kosong)."),
        { status: 503 },
      );
    }
    // Scrape dijalankan SETELAH respons terkirim — permintaan tak
    // menggantung; layar memantau tabel `berita` sampai yang baru muncul.
    after(async () => {
      try {
        const hasil = await jalankanScrapeBerita();
        console.log(
          `[berita] scrape: ${hasil.disimpan} baru dari ${hasil.akun} akun` +
            (hasil.gagal.length ? ` (gagal: ${hasil.gagal.join("; ")})` : ""),
        );
      } catch (e) {
        console.error("[berita] scrape gagal:", e instanceof Error ? e.message : e);
      }
    });
    return { dimulai: true, data: await ambilBerita() };
  });
}
