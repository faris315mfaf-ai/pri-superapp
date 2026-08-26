// GET /api/periode — daftar periode QC yang tersedia (terbaru dulu)
// Sumber: Supabase (view v_app_periode, dihitung dari tabel rekap).
// Sebelumnya daftar ini ditebak di sisi aplikasi dari tanggal hari ini;
// sekarang mengikuti data yang benar-benar ada di database.
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    await pastikanMasuk(request);
    const rows = pastikanSukses(
      await supabase().from("v_app_periode").select("periode").limit(30),
      "daftar periode",
    ) as { periode: string }[];

    return { data: rows.map((r) => r.periode) };
  });
}
