// GET /api/komentar — komentar tertangkap pada sebuah postingan
// Query: ?id_postingan=IG-001 (tanpa parameter → semua komentar)
// Sumber: Supabase (view v_app_komentar). nama_kader NULL = warga biasa.
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    await pastikanMasuk(request);
    const idPostingan = new URL(request.url).searchParams.get("id_postingan");

    let q = supabase()
      .from("v_app_komentar")
      .select(
        "id_komentar, id_postingan, ig_username, nama_kader, isi_komentar, waktu_komentar",
      )
      .order("waktu_komentar", { ascending: true });
    if (idPostingan) q = q.eq("id_postingan", idPostingan);

    return { data: pastikanSukses(await q, "daftar komentar") };
  });
}
