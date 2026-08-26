// GET /api/sehat — pemeriksaan kesehatan untuk pemantau luar (BetterStack).
//
// SENGAJA menyentuh database, bukan sekadar membalas "OK". Alasannya
// dari kejadian nyata: pernah aplikasi tampak hidup (halaman depan
// 200) padahal seluruh akses database ditolak karena kunci Supabase
// dicabut — layar login berkata "kata sandi salah" kepada semua
// anggota selama satu jam tanpa ada yang tahu. Pemantau yang hanya
// menengok halaman depan tidak akan menangkap kejadian seperti itu.
//
// Balasan:
//   200 {"sehat":true,...}   → semuanya baik
//   503 {"sehat":false,...}  → database tidak terjangkau/ditolak
//
// SENGAJA tanpa autentikasi (pemantau tidak punya akun), tetapi juga
// TIDAK membocorkan apa pun: hanya status, tanpa data anggota, tanpa
// pesan galat mentah, dan tanpa nama tabel.
import { supabase } from "@/lib/supabase";
import { batasTerpusatAktif } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const mulai = Date.now();

  let dbSehat = false;
  let sebab = "";
  try {
    // Query paling ringan yang tetap membuktikan tiga hal sekaligus:
    // jaringan sampai, kunci diterima, dan tabel bisa dibaca.
    const { error } = await supabase()
      .from("rilis_aplikasi")
      .select("versi", { count: "exact", head: true })
      .limit(1);
    dbSehat = !error;
    if (error) sebab = "database menolak permintaan";
  } catch {
    sebab = "database tidak terjangkau";
  }

  const jawaban = {
    sehat: dbSehat,
    database: dbSehat ? "ok" : "gagal",
    // Berguna saat menelusuri: apakah pembatas terpusat sudah hidup.
    batas_terpusat: batasTerpusatAktif() ? "redis" : "memori",
    versi: process.env.NEXT_PUBLIC_VERSI_APLIKASI ?? "?",
    ms: Date.now() - mulai,
    ...(dbSehat ? {} : { sebab }),
  };

  return Response.json(jawaban, {
    status: dbSehat ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
