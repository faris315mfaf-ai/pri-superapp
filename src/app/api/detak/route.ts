// ============================================================
// GET /api/detak — DENYUT SISTEM (10 Sep 2026).
//
// Dipanggil tiap perangkat setiap 10 detik untuk menjawab SATU
// pertanyaan murah: "ada yang baru?" Jawabannya sebuah TANDA — gabungan
// id terbaru dari tabel yang menggerakkan layar. Klien membandingkannya
// dengan tanda sebelumnya; hanya bila BERBEDA ia menyegarkan data.
//
// KENAPA BUKAN MENARIK SEMUA DATA TIAP 10 DETIK:
// beranda saja memanggil 4 endpoint (KPI video, komentar, absensi,
// streak). Dengan ~200 anggota daring, 10 detik = ±80 permintaan berat
// per detik — dua kali lipat beban yang pada 7 Sep 2026 membuat Supabase
// melambat 20-30 detik. Dengan pola detak: 1 permintaan ringan per
// perangkat, dan tarikan berat HANYA saat memang ada perubahan.
//
// Biaya server: tanda dihitung SEKALI untuk semua orang (cache bersama
// Redis 5 detik), yaitu 5 kueri "id terbesar" per 5 detik untuk seluruh
// aplikasi — berapa pun jumlah penggunanya.
// ============================================================
import { bungkus } from "@/lib/api-helper";
import { denganCache } from "@/lib/cache-bersama";
import { pastikanMasuk } from "@/lib/sesi";
import { supabase } from "@/lib/supabase";

import { catatHadir, daftarHadir } from "@/lib/kehadiran";
export const dynamic = "force-dynamic";

/** Tabel yang perubahannya harus terasa di layar dalam hitungan detik. */
const TABEL_PANTAU = [
  "notifikasi",
  "pengumuman",
  "postingan",
  "laporan_video",
  "feed_konten",
] as const;

/** Umur tanda di cache bersama; lebih pendek dari jeda detak klien. */
const TTL_DETIK = 5;

async function hitungTanda(): Promise<string> {
  const db = supabase();
  const bagian = await Promise.all(
    TABEL_PANTAU.map(async (tabel) => {
      // "id terbesar" pada kunci primer: satu baris, memakai indeks.
      const { data, error } = await db
        .from(tabel)
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        // Satu tabel bermasalah tidak boleh mematikan detak; tandai "x"
        // supaya nilainya stabil (tidak memicu penyegaran palsu).
        console.error(`[detak] ${tabel}:`, error.message);
        return `${tabel[0]}x`;
      }
      return `${tabel[0]}${data?.id ?? 0}`;
    }),
  );
  return bagian.join(".");
}

export async function GET(request: Request) {
  return bungkus(async () => {
    // Wajib login: endpoint internal, dan pemeriksaan sesinya sendiri
    // sudah dilayani cache (lib/cache-sesi) sehingga tetap murah.
    const user = await pastikanMasuk(request);
    // KEHADIRAN (10 Sep 2026): detak inilah bukti "aplikasinya sedang
    // dibuka", jadi ditumpangi sekalian — tanpa permintaan tambahan.
    await catatHadir(user.id);
    const [tanda, hadir] = await Promise.all([
      denganCache("detak:global", TTL_DETIK, hitungTanda),
      daftarHadir(),
    ]);
    return { tanda, hadir, online: hadir.length };
  });
}
