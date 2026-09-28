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
// Redis 5 detik), yaitu 4 kueri "id terbesar" per 5 detik untuk seluruh
// aplikasi — berapa pun jumlah penggunanya — plus satu GET Redis per
// panggilan untuk sinyal pribadi.
// ============================================================
import { bungkus } from "@/lib/api-helper";
import { denganCache } from "@/lib/cache-bersama";
import { pastikanMasuk } from "@/lib/sesi";
import { supabase } from "@/lib/supabase";

import { catatHadir, daftarHadir } from "@/lib/kehadiran";
import { bacaSakelar } from "@/lib/sakelar";
import { jedaDetak, ratakan } from "@/lib/rem-detak";
import { kondisiDb } from "@/lib/penjaga-supabase";
import { bacaSinyal } from "@/lib/sinyal-pribadi";
export const dynamic = "force-dynamic";

/** Tabel yang perubahannya harus terasa di layar dalam hitungan detik. */
const TABEL_PANTAU = [
  "notifikasi",
  "pengumuman",
  "postingan",
  "feed_konten",
] as const;

/** Umur tanda di cache bersama; lebih pendek dari jeda detak klien. */
const TTL_DETIK = 5;

/*
 * TANDA GLOBAL vs SINYAL PRIBADI (28 Sep 2026, rencana "200 orang tanpa
 * lag" #3). Diukur: tanda global berubah di 10 dari 18 jendela 10 detik,
 * hampir semuanya karena laporan_video (KPI satu orang) dan notifikasi
 * untuk satu orang. Tiap perubahan membuat SEMUA HP yang online memuat
 * ulang layarnya serentak — beban terbesar yang menjenuhkan Supabase.
 *
 * Kini tanda global hanya berisi hal milik semua orang: notifikasi UMUM /
 * per peran (untuk_user kosong), pengumuman, postingan, feed konten.
 * Peristiwa milik satu orang (notifikasi & chat untuknya, laporan KPI-nya)
 * menaikkan sinyal pribadinya di Redis (lib/sinyal-pribadi) dan dikirim
 * sebagai `tanda_saya` — hanya HP orang itu yang menyegarkan diri.
 */
async function idTerbesar(db: ReturnType<typeof supabase>, tabel: string): Promise<string> {
  // "id terbesar" pada kunci primer: satu baris, memakai indeks.
  let q = db.from(tabel).select("id");
  // Notifikasi beralamat orang tertentu masuk sinyal pribadi, bukan tanda global.
  if (tabel === "notifikasi") q = q.is("untuk_user", null);
  const { data, error } = await q.order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    // Satu tabel bermasalah tidak boleh mematikan detak; tandai "x"
    // supaya nilainya stabil (tidak memicu penyegaran palsu).
    console.error(`[detak] ${tabel}:`, error.message);
    return `${tabel[0]}x`;
  }
  return `${tabel[0]}${data?.id ?? 0}`;
}

// Rem otomatis: jedanya dihitung lib/rem-detak (murni, teruji terpisah).
/** Rata-rata bergerak lama kueri tanda (ms) di instansi ini. */
let msTanda = 0;

async function hitungTanda(): Promise<string> {
  const mulai = Date.now();
  const db = supabase();
  const bagian = await Promise.all(TABEL_PANTAU.map((tabel) => idTerbesar(db, tabel)));
  msTanda = ratakan(msTanda, Date.now() - mulai);
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
    const [tanda, hadir, sakelar, tandaSaya] = await Promise.all([
      denganCache("detak:global", TTL_DETIK, hitungTanda),
      daftarHadir(),
      bacaSakelar().catch(() => null),
      bacaSinyal(user.id),
    ]);
    return {
      tanda,
      // Sinyal pribadi (Redis, bukan Supabase). "" = sedang tidak terbaca.
      tanda_saya: tandaSaya,
      hadir,
      online: hadir.length,
      // Klien memakai angka ini sebagai jeda detak berikutnya (detik).
      // Lama kueri tanda ATAU median seluruh kueri proses ini (penjaga
      // Supabase) — yang lebih lambat menang, supaya rem ikut terasa
      // walau tanda sendiri kebetulan tersaji dari cache.
      jeda: jedaDetak(sakelar?.hemat === true, Math.max(msTanda, kondisiDb().p50 ?? 0)),
    };
  });
}
