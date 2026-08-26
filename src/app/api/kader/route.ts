// GET /api/kader — roster kader aktif
// Sumber: Supabase (view v_app_kader).
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { adalahPengurus, pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    const user = await pastikanMasuk(request);
    const data = pastikanSukses(
      await supabase()
        .from("v_app_kader")
        .select("id, nama_kader, wilayah, jabatan, nomor_wa, ig_username, aktif")
        .eq("aktif", true)
        .order("nama_kader"),
      "daftar kader",
    ) as { nomor_wa?: string | null }[];

    // Nomor WhatsApp hanya untuk pengurus. Bagi anggota biasa, daftar
    // ini tidak boleh berubah menjadi buku telepon seluruh partai.
    if (!adalahPengurus(user.role)) {
      for (const baris of data) baris.nomor_wa = null;
    }
    return { data };
  });
}
