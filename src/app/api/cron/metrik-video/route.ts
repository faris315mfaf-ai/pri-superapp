// /api/cron/metrik-video — penyegar angka per video dari upload-post.
//
// Dipanggil penjadwal VPS tiap 5 menit (vps/aplikasi/jadwal). Tiap
// panggilan bekerja ±4 menit (maks ±200 permintaan/menit ke upload-post):
// mengenali video baru di seluruh akun tersambung, lalu menyegarkan angka
// — video hari ini dulu (±tiap 15 menit), lalu kemarin, lalu yang lama.
// Rincian cara kerjanya di lib/segar-metrik-video.ts.
//
// Keamanan: sama seperti cron lain — bila CRON_SECRET terpasang, wajib
// `Authorization: Bearer`; bila tidak, hanya user-agent penjadwal.
import { putaranSegarMetrik } from "@/lib/segar-metrik-video";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function jalankan(request: Request) {
  const rahasia = process.env.CRON_SECRET || process.env.ASISTEN_CRON_SECRET || "";
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  const sah = rahasia ? tokenDari(request) === rahasia : ua.includes("cron");
  if (!sah) return Response.json({ error: "Tidak berwenang." }, { status: 403 });
  const hasil = await putaranSegarMetrik();
  return Response.json(hasil, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  return jalankan(request);
}

export async function POST(request: Request) {
  return jalankan(request);
}
