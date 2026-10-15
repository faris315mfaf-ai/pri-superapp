// /api/cron/siaran — pemroses antrean Siaran (15 Okt 2026).
//
// Dipanggil penjadwal VPS tiap menit (vps/aplikasi/jadwal). Mengirim item siaran yang
// sudah jatuh giliran (siaran koordinator bertahap; juga sisa Siaran Serentak lama) dan
// memanggil karakter anggota ke Ruang Bot. Satu putaran sekaligus (kunci), supaya putaran
// yang lebih lama dari semenit tidak tumpang tindih. Rincian: lib/siaran.ts.
//
// Keamanan: sama seperti cron lain — bila CRON_SECRET terpasang, wajib
// `Authorization: Bearer`; bila tidak, hanya user-agent penjadwal.
import { prosesSiaranSerentak } from "@/lib/siaran";
import { ambilKunciUnggah } from "@/lib/upload-post";
import { jalankanLatar, tundaKarenaMacet } from "@/lib/penjaga-supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Anggaran satu putaran (< maxDuration, sisakan ruang). */
const ANGGARAN_MS = 240_000;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function jalankan(request: Request) {
  const rahasia = process.env.CRON_SECRET || process.env.ASISTEN_CRON_SECRET || "";
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  const sah = rahasia ? tokenDari(request) === rahasia : ua.includes("cron");
  if (!sah) return Response.json({ error: "Tidak berwenang." }, { status: 403 });
  const tunda = tundaKarenaMacet("siaran");
  if (tunda) return Response.json(tunda, { headers: { "Cache-Control": "no-store" } });
  const kunci = await ambilKunciUnggah("cron:siaran", 290);
  if (!kunci) return Response.json({ jalan: false, alasan: "putaran sebelumnya masih berjalan" }, { headers: { "Cache-Control": "no-store" } });
  try {
    await jalankanLatar("siaran", () => prosesSiaranSerentak(ANGGARAN_MS));
    return Response.json({ jalan: true }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    await kunci.lepas(0);
  }
}

export async function GET(request: Request) {
  return jalankan(request);
}

export async function POST(request: Request) {
  return jalankan(request);
}
