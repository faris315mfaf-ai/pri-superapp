// POST /api/berita/scrape — jalankan scrape berita TERJADWAL (fitur
// 1.22.x/5-bug). Dipanggil workflow n8n (Schedule Trigger) dengan header
// x-pri-secret = N8N_WEBHOOK_SECRET. Menjalankan scrape TikHub SINKRON
// (n8n menunggu hasilnya) lalu mengembalikan ringkasan.
//
// n8n hanya menjadwalkan; seluruh logika scraping ada di aplikasi
// (lib/scrape-berita) supaya bisa diuji & kunci TikHub tetap di env app.
import { bungkus } from "@/lib/api-helper";
import { bolehScrapeTerjadwal, jalankanScrapeBerita } from "@/lib/scrape-berita";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return bungkus(async () => {
    const rahasia = process.env.N8N_WEBHOOK_SECRET;
    if (rahasia && request.headers.get("x-pri-secret") !== rahasia) {
      throw Object.assign(new Error("Tidak berwenang"), { status: 401 });
    }
    // Gerbang interval: n8n boleh memanggil tiap 5 menit, tapi scrape
    // sebenarnya hanya jalan bila interval Pimred sudah terlewati.
    const gerbang = await bolehScrapeTerjadwal();
    if (!gerbang.boleh) {
      return { sukses: true, dilewati: true, sisa_detik: gerbang.sisaDetik };
    }
    const hasil = await jalankanScrapeBerita();
    return { sukses: true, ...hasil };
  });
}
