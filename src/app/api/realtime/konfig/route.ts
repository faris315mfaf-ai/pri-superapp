// /api/realtime/konfig — kunci PUBLISHABLE Supabase untuk klien yang ingin
// mendengar siaran realtime (mis. layar Komen Video Mode Simpel).
// GET → { realtime, url, key }. Wajib login. Kunci publishable memang untuk
// peramban; RLS tanpa kebijakan berarti kunci ini tidak bisa membaca tabel.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
    const url = (process.env.SUPABASE_URL ?? "").trim();
    return { realtime: Boolean(key && url), url, key };
  });
}
