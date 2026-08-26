// GET  /api/berita — berita terbaru hasil scraping (dibaca dari Supabase)
// POST /api/berita — picu scraping baru lewat workflow n8n "TV Rakyat -
//                    Cek Berita Terbaru", lalu kembalikan hasil terbarunya.
//
// Aplikasi tidak melakukan scraping sendiri: Apify, dedup, dan penyimpanan
// semuanya dikerjakan n8n. Aplikasi hanya menekan tombolnya lalu membaca
// tabel `berita` di Supabase.
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { panggilWebhookN8n, N8nBelumDiaturError } from "@/lib/n8n";

export const dynamic = "force-dynamic";

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
export async function POST() {
  return bungkus(async () => {
    try {
      await panggilWebhookN8n("N8N_WEBHOOK_SCRAPE_BERITA", {});
    } catch (e) {
      if (e instanceof N8nBelumDiaturError) {
        throw Object.assign(new Error(e.message), { status: 503 });
      }
      throw e;
    }

    return { dimulai: true, data: await ambilBerita() };
  });
}
