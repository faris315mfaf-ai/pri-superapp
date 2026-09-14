// GET /api/cron/sinkron-absensi — tarik absensi dari SADAR (14 Sep 2026).
//
// Dijalankan container `jadwal` tiap 5 menit. Setiap jalan: hari ini +
// kemarin (absen pulang lewat tengah malam / verifikasi yang berubah),
// lalu melengkapi sampai 5 tanggal dalam 31 hari terakhir yang belum
// pernah ditarik — sehingga tren & peringkat 30 hari terisi sendiri
// beberapa puluh menit setelah integrasi dinyalakan.
//
// Keamanan sama dengan cron lain: Authorization: Bearer CRON_SECRET.
import { sinkronAbsensiHariIni, sinkronAbsensiRentang, sinkronAbsensiTanggal } from "@/lib/absensi-sadar";
import { sadarSiap } from "@/lib/sadar";
import { tanggalWibHariIni } from "@/lib/format";

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
  if (!sadarSiap()) {
    return Response.json({ jalan: false, pesan: "SADAR_API_TOKEN belum diatur." });
  }

  const hariIni = tanggalWibHariIni();
  const kemarin = new Date(Date.parse(`${hariIni}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const awal = new Date(Date.parse(`${hariIni}T00:00:00Z`) - 31 * 86_400_000).toISOString().slice(0, 10);

  const ini = await sinkronAbsensiHariIni();
  const kmr = await sinkronAbsensiTanggal(kemarin);
  const lampau = await sinkronAbsensiRentang(awal, kemarin, 5);
  return Response.json({ jalan: true, hari_ini: ini, kemarin: kmr, lampau });
}
