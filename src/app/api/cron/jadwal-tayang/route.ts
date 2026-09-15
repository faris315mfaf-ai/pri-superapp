// GET /api/cron/jadwal-tayang — tutup lingkaran posting terjadwal
// TV Rakyat Official (15 Sep 2026).
//
// Ayrshare menerbitkan postingan terjadwal sendiri dan tidak memberi tahu
// siapa pun. Tugas berkala inilah yang menanyakan hasilnya, lalu
// menyelesaikan catatan videonya — status, kanal Konten, kewajiban
// komentar — dengan WAKTU JADWAL sebagai acuan.
//
// Keamanan sama dengan tugas berkala lain: Authorization: Bearer CRON_SECRET.
import { rekonsiliasiJadwalTayang } from "@/lib/jadwal-tayang";
import { ayrshareSiap } from "@/lib/ayrshare";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  const rahasia = process.env.CRON_SECRET || process.env.ASISTEN_CRON_SECRET || "";
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  const sah = rahasia ? tokenDari(request) === rahasia : ua.includes("vercel-cron");
  if (!sah) return Response.json({ error: "Tidak berwenang." }, { status: 403 });
  if (!ayrshareSiap()) {
    return Response.json({ jalan: false, pesan: "Ayrshare belum diatur." });
  }
  const hasil = await rekonsiliasiJadwalTayang();
  return Response.json({ jalan: true, ...hasil });
}
