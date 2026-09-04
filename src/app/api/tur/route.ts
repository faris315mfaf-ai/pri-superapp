// /api/tur — sakelar TUTORIAL interaktif (4 Sep 2026).
// Master bisa mematikan tutorial "daftar akun → Kepatuhan Komen" untuk semua
// pengguna lewat Panel Master (pengaturan_sistem kunci `tur_aktif`).
// GET → { aktif: boolean }  (bawaan: aktif). Semua pengguna yang login.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

let cache: { aktif: boolean; pada: number } | null = null;
const TTL_MS = 60_000;

async function turAktif(): Promise<boolean> {
  if (cache && Date.now() - cache.pada < TTL_MS) return cache.aktif;
  const { data } = await supabase()
    .from("pengaturan_sistem")
    .select("nilai")
    .eq("kunci", "tur_aktif")
    .maybeSingle();
  const aktif = String(data?.nilai ?? "true") !== "false";
  cache = { aktif, pada: Date.now() };
  return aktif;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    return { aktif: await turAktif() };
  });
}
