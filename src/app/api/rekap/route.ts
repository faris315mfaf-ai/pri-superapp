// GET /api/rekap — rekap kepatuhan kader
// Query: ?id_postingan=IG-001 (opsional) atau ?periode= (opsional)
// Bila ?id_postingan diberikan, respons menyertakan ringkasan
// { sudah, belum, persen } untuk postingan tersebut.
// Sumber: Supabase (view v_app_rekap).
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { adalahPengurus, pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

type BarisRekap = { sudah_komentar: boolean; nomor_wa?: string | null };

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    const user = await pastikanMasuk(request);
    const { searchParams } = new URL(request.url);
    const idPostingan = searchParams.get("id_postingan");
    const periode = searchParams.get("periode");

    let q = supabase()
      .from("v_app_rekap")
      .select(
        "id_unik, periode, nama_kader, platform, akun_wajib, id_postingan, sudah_komentar, jumlah_komentar, nomor_wa",
      )
      .order("nama_kader");
    if (idPostingan) q = q.eq("id_postingan", idPostingan);
    if (periode) q = q.eq("periode", periode);

    const data = pastikanSukses(await q, "rekap kepatuhan") as BarisRekap[];

    // Nomor WhatsApp hanya untuk pengurus (dipakai fitur "ingatkan").
    if (!adalahPengurus(user.role)) {
      for (const baris of data) baris.nomor_wa = null;
    }

    const payload: Record<string, unknown> = { data };
    if (idPostingan) {
      const sudah = data.filter((r) => r.sudah_komentar).length;
      const belum = data.length - sudah;
      payload.ringkasan = {
        sudah,
        belum,
        persen: data.length > 0 ? Math.round((sudah / data.length) * 100) : 0,
      };
    }
    return payload;
  });
}
