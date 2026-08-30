// ============================================================
// Scrape berita (KHUSUS SERVER) — fitur 1.22.x/5-bug.
//
// Menarik postingan terbaru dari SEMUA akun sumber_berita yang aktif
// lewat TikHub, lalu MENYIMPANNYA (upsert idempoten by kode) ke tabel
// `berita`. Dipakai dua pemicu: tombol manual (login TV) & jadwal n8n
// (X-PRI-Secret). Satu akun gagal tidak menggagalkan yang lain.
// ============================================================
import { supabase } from "@/lib/supabase";
import { scrapeAkun, tikhubSiap } from "@/lib/tikhub";

/** Berapa postingan terbaru diambil per akun tiap scrape. */
const MAKS_PER_AKUN = 10;

export async function jalankanScrapeBerita(): Promise<{
  akun: number;
  disimpan: number;
  gagal: string[];
}> {
  if (!tikhubSiap()) {
    throw Object.assign(new Error("Scraper belum diaktifkan (TIKHUB_TOKEN kosong)."), {
      status: 503,
    });
  }
  const db = supabase();
  const { data: sumber } = await db
    .from("sumber_berita")
    .select("nama, username, platform")
    .eq("aktif", true);
  const daftar = sumber ?? [];

  let disimpan = 0;
  const gagal: string[] = [];

  for (const s of daftar) {
    try {
      const posts = await scrapeAkun(String(s.platform), String(s.username), MAKS_PER_AKUN);
      if (posts.length === 0) continue;
      const baris = posts.map((p) => ({
        kode: p.kode,
        judul: p.judul || `Postingan @${p.username}`,
        sumber: String(s.nama),
        platform_asal: p.platform,
        link_video: p.url,
        thumbnail_url: p.thumbnail_url,
        caption_asli: p.caption,
        sumber_akun: p.username,
        jenis: p.jenis,
        dipakai: false,
        waktu_terbit: new Date((p.waktu_unix || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      }));
      // Idempoten: hanya baris baru yang masuk; yang sudah ada dilewati
      // (ignoreDuplicates) supaya kolom `dipakai` yang sudah true tak tereset.
      const { error, count } = await db
        .from("berita")
        .upsert(baris, { onConflict: "kode", ignoreDuplicates: true, count: "exact" });
      if (error) {
        gagal.push(`${s.platform}/@${s.username}: ${error.message}`);
      } else {
        disimpan += count ?? 0;
      }
    } catch (e) {
      const pesan = e instanceof Error ? e.message : "gagal";
      console.error(`[scrape-berita] ${s.platform}/@${s.username}:`, pesan);
      gagal.push(`${s.platform}/@${s.username}: ${pesan}`);
    }
  }

  // Catat waktu scrape terakhir (dipakai gerbang interval terjadwal).
  await db
    .from("pengaturan_sistem")
    .upsert({ kunci: "berita_terakhir_scrape", nilai: String(Date.now()) }, { onConflict: "kunci" })
    .then(() => {}, () => {});

  return { akun: daftar.length, disimpan, gagal };
}

/**
 * Untuk scrape TERJADWAL (n8n jalan tiap 5 menit): boleh scrape hanya bila
 * jarak dari scrape terakhir >= interval yang diatur Pimred. Jadi menaikkan
 * interval ke 30 menit membuat sebagian pemicu 5-menitan dilewati — kuota
 * TikHub terjaga tanpa mengubah jadwal n8n.
 */
export async function bolehScrapeTerjadwal(): Promise<{ boleh: boolean; sisaDetik: number }> {
  const db = supabase();
  const [{ data: iv }, { data: last }] = await Promise.all([
    db.from("pengaturan_sistem").select("nilai").eq("kunci", "berita_interval_menit").maybeSingle(),
    db.from("pengaturan_sistem").select("nilai").eq("kunci", "berita_terakhir_scrape").maybeSingle(),
  ]);
  const intervalMs = Math.max(5, Number(iv?.nilai ?? 5)) * 60 * 1000;
  const terakhir = Number(last?.nilai ?? 0);
  const lewat = Date.now() - terakhir;
  if (lewat >= intervalMs) return { boleh: true, sisaDetik: 0 };
  return { boleh: false, sisaDetik: Math.ceil((intervalMs - lewat) / 1000) };
}
