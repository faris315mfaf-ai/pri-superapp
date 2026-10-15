// /api/cron/video-wajib — pengingat otomatis Video Wajib (15 Okt 2026).
//
// Dipanggil penjadwal VPS tiap ±10 menit (vps/aplikasi/jadwal). Dua jam
// sebelum batas jam, anggota yang belum menuntaskan perintah wajib posting
// dikabari — sekali per perintah per hari. Rincian: lib/video-wajib-pengingat.ts.
//
// Keamanan: sama seperti cron lain — bila CRON_SECRET terpasang, wajib
// `Authorization: Bearer`; bila tidak, hanya user-agent penjadwal.
import { jalankanPengingatWajib } from "@/lib/video-wajib-pengingat";
import { jalankanLatar, tundaKarenaMacet } from "@/lib/penjaga-supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function jalankan(request: Request) {
  const rahasia = process.env.CRON_SECRET || process.env.ASISTEN_CRON_SECRET || "";
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  const sah = rahasia ? tokenDari(request) === rahasia : ua.includes("cron");
  if (!sah) return Response.json({ error: "Tidak berwenang." }, { status: 403 });
  const tunda = tundaKarenaMacet("video-wajib");
  if (tunda) return Response.json(tunda, { headers: { "Cache-Control": "no-store" } });
  const hasil = await jalankanLatar("video-wajib", () => jalankanPengingatWajib());
  return Response.json(hasil, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  return jalankan(request);
}

export async function POST(request: Request) {
  return jalankan(request);
}
