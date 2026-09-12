// /api/cron/rekam-metrik — mencatat angka nasional TV Rakyat hari ini.
//
// Inilah yang membuat panel "kenaikan" mungkin ada. Sumber datanya
// (Ayrshare & upload-post) hanya memberi angka SEKARANG dan tidak
// menyimpan sejarah; tanpa rekaman harian, pertanyaan "naik berapa hari
// ini" tidak punya jawaban sama sekali.
//
// Dijalankan penjadwal di VPS (vps/aplikasi/jadwal). Dijalankan dua kali
// sehari pun tidak masalah: barisnya diperbarui, bukan ditambah.
//
// Keamanan: sama seperti cron lain — bila CRON_SECRET terpasang, wajib
// `Authorization: Bearer`; bila tidak, hanya user-agent penjadwal.
import { rekamMetrikHarian } from "@/lib/tvr-nasional";
import { beriKoinJuaraKomenHarian } from "@/lib/juara-komen";

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
  try {
    const hasil = await rekamMetrikHarian();
    // Reward top komen harian (12 Sep 2026): juara 1 periode yang baru
    // selesai diberi koin. Gagal di sini tidak membatalkan rekaman —
    // keduanya urusan terpisah yang kebetulan berjalan di jam yang sama.
    let juara: unknown = null;
    try {
      juara = await beriKoinJuaraKomenHarian();
    } catch (e) {
      juara = { error: e instanceof Error ? e.message : "gagal" };
    }
    return Response.json({ ...hasil, juara_komen: juara }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron/rekam-metrik]", e);
    return Response.json({ error: e instanceof Error ? e.message : "gagal" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return jalankan(request);
}

export async function POST(request: Request) {
  return jalankan(request);
}
