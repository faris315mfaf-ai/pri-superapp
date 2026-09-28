// /api/cron/pantau-server — dijalankan Vercel Cron tiap 10 menit (vercel.json).
// Memeriksa tanda-tanda server akan tumbang; menyalakan MODE HEMAT otomatis
// dan memberi tahu master (lib/pantau-server). Master juga bisa memanggilnya
// manual dari Panel Master lewat /api/master aksi "pantau_sekarang".
// Keamanan: bila env CRON_SECRET terpasang, wajib `Authorization: Bearer`;
// bila tidak, hanya user-agent vercel-cron yang diterima.
import { pantauServer } from "@/lib/pantau-server";
import { jalankanLatar } from "@/lib/penjaga-supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  const rahasia = process.env.CRON_SECRET || process.env.ASISTEN_CRON_SECRET || "";
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  const sah = rahasia ? tokenDari(request) === rahasia : ua.includes("vercel-cron");
  if (!sah) return Response.json({ error: "Tidak berwenang." }, { status: 403 });
  try {
    // Pemantau tetap jalan walau database macet — justru saat itulah ia
    // dibutuhkan — tapi di lajur latar supaya mengalah pada pengguna.
    const hasil = await jalankanLatar("pantau-server", () => pantauServer());
    return Response.json(hasil, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron/pantau-server]", e);
    return Response.json({ error: e instanceof Error ? e.message : "gagal" }, { status: 500 });
  }
}
