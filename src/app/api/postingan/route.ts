// GET /api/postingan — daftar postingan terpantau
// Query: ?akun_wajib=dpp.pri (opsional), ?periode= (opsional)
// Sumber: Supabase (view v_app_postingan + v_app_rekap).
// Field sudah_komentar_kader / belum_komentar_kader dihitung dari rekap.
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

type BarisRekap = { id_postingan: string; periode: string; sudah_komentar: boolean };

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    await pastikanMasuk(request);
    const { searchParams } = new URL(request.url);
    const akunWajib = searchParams.get("akun_wajib");
    const periode = searchParams.get("periode");
    const db = supabase();

    let qPost = db
      .from("v_app_postingan")
      .select(
        "id_postingan, akun_wajib, platform, caption_asli, thumbnail_url, link_postingan, waktu_posting, jumlah_like, jumlah_komentar, periode",
      )
      .order("waktu_posting", { ascending: true });
    if (akunWajib) qPost = qPost.eq("akun_wajib", akunWajib);
    if (periode) qPost = qPost.eq("periode", periode);

    const postingan = pastikanSukses(await qPost, "daftar postingan") as Record<
      string,
      unknown
    >[];

    if (postingan.length === 0) return { data: [] };

    // Ambil rekap hanya untuk postingan yang benar-benar tampil,
    // supaya tidak menarik seluruh tabel rekap yang bisa puluhan ribu baris.
    // PENTING (1 Sep 2026): PostgREST memotong respons di 1000 baris —
    // 8 postingan x 151 kader saja sudah 1208 baris, jadi TANPA paginasi
    // hitungan "sudah komentar" diam-diam terpotong (bug "0% kepatuhan").
    const idList = postingan.map((p) => p.id_postingan as string);
    const rekap: BarisRekap[] = [];
    const UKURAN = 1000;
    for (let mulai = 0; ; mulai += UKURAN) {
      const halaman = pastikanSukses(
        await db
          .from("v_app_rekap")
          .select("id_postingan, periode, sudah_komentar")
          .in("id_postingan", idList)
          .order("id_unik")
          .range(mulai, mulai + UKURAN - 1),
        "rekap kepatuhan",
      ) as BarisRekap[];
      rekap.push(...halaman);
      if (halaman.length < UKURAN) break;
    }

    const data = postingan.map((p) => {
      // Cocokkan juga PERIODE: postingan hari transisi jendela QC punya
      // baris rekap di dua label periode — tanpa ini kadernya dihitung dobel.
      const baris = rekap.filter(
        (r) => r.id_postingan === p.id_postingan && r.periode === p.periode,
      );
      const sudah = baris.filter((r) => r.sudah_komentar).length;
      return {
        ...p,
        sudah_komentar_kader: sudah,
        belum_komentar_kader: baris.length - sudah,
      };
    });

    return { data };
  });
}
