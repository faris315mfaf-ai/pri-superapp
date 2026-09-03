// GET /api/cron/sinkron-komen — dipanggil VERCEL CRON tiap 30 menit
// (vercel.json → crons). Menjalankan analisis komentar Ayrshare untuk
// periode QC yang sedang berjalan TANPA bergantung pada ada-tidaknya
// pengguna yang membuka aplikasi (permintaan 3 Sep 2026: "tiap 30 menit
// sekali tanpa gagal").
//
// Keamanan: bila env CRON_SECRET (standar Vercel) atau ASISTEN_CRON_SECRET
// terpasang, permintaan wajib membawa `Authorization: Bearer <rahasia>`.
// Bila belum ada rahasia sama sekali, hanya permintaan ber-user-agent
// resmi Vercel Cron yang diterima — pekerjaannya sendiri idempoten
// (upsert) dan dijaga klaim atomik 30 menit, jadi tak bisa dipakai
// membanjiri Ayrshare.
import { sinkronKontenTvPaksa } from "@/lib/sinkron-konten-tv";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  const rahasia = process.env.CRON_SECRET || process.env.ASISTEN_CRON_SECRET || "";
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  const sah = rahasia ? tokenDari(request) === rahasia : ua.includes("vercel-cron");
  if (!sah) {
    return Response.json({ error: "Tidak berwenang." }, { status: 403 });
  }
  const hasil = await sinkronKontenTvPaksa("vercel-cron");
  return Response.json(hasil, { headers: { "Cache-Control": "no-store" } });
}
