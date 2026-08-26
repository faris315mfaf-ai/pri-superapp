// GET /api/akun-wajib — daftar akun wajib + statistik kepatuhan
// Sumber: Supabase (view v_app_akun_wajib + v_app_rekap).
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

/** Satu baris view v_app_ringkasan_akun_periode */
type BarisRingkasanAkun = {
  akun_wajib: string;
  platform: string;
  total_unit: number;
  sudah_komentar: number;
  jumlah_postingan: number;
  jumlah_kader: number;
  persen_patuh: number;
};

type BarisRekap = {
  akun_wajib: string;
  id_postingan: string;
  nama_kader: string;
  sudah_komentar: boolean;
};

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    await pastikanMasuk(request);
    const periode = new URL(request.url).searchParams.get("periode");
    const db = supabase();

    const akun = pastikanSukses(
      await db
        .from("v_app_akun_wajib")
        .select("id, akun_wajib, nama_tampilan, platform, avatar_url, aktif")
        .eq("aktif", true)
        .order("akun_wajib"),
      "daftar akun wajib",
    ) as Record<string, unknown>[];

    // Periode WAJIB disaring. Sebelumnya filter ini hanya jalan bila query
    // string `?periode=` dikirim — padahal satu-satunya pemanggil
    // (getAkunWajib di services) tidak pernah mengirimnya. Akibatnya SELURUH
    // isi v_app_rekap ditarik dan angka kepatuhan di layar QC dihitung dari
    // GABUNGAN semua periode sejak sistem berjalan, bukan periode berjalan.
    // Itu bukan sekadar lambat — angkanya memang salah, dan makin melenceng
    // tiap hari karena rekap tidak pernah dihapus (aturan soft-delete).
    //
    // Bila klien tidak menyebut periode, server memilih yang TERBARU sendiri
    // (pola yang sudah dipakai /api/dashboard), jadi klien tidak perlu diubah.
    let periodeDipakai = periode;
    if (!periodeDipakai) {
      const barisPeriode = pastikanSukses(
        await db.from("v_app_periode").select("periode").limit(1),
        "periode terbaru",
      ) as { periode: string }[];
      periodeDipakai = barisPeriode[0]?.periode ?? null;
    }

    // Statistik per akun DIHITUNG DI DATABASE.
    //
    // Sebelumnya seluruh baris v_app_rekap periode ini ditarik lalu
    // dihitung di sini. Satu hari bisa berisi 11.901 baris (104 anggota
    // x 113 postingan) sementara PostgREST diam-diam memotong di 1.000,
    // sehingga angka kepatuhan tiap akun dihitung dari sebagian kecil
    // data — dan diam-diam salah.
    const ringkasan = periodeDipakai
      ? (pastikanSukses(
          await db
            .from("v_app_ringkasan_akun_periode")
            .select(
              "akun_wajib, platform, total_unit, sudah_komentar, jumlah_postingan, jumlah_kader, persen_patuh",
            )
            .eq("periode", periodeDipakai),
          "ringkasan kepatuhan akun",
        ) as BarisRingkasanAkun[])
      : [];

    const perAkun = new Map(ringkasan.map((r) => [r.akun_wajib, r]));

    const data = akun.map((a) => {
      const r = perAkun.get(a.akun_wajib as string);
      const total = Number(r?.total_unit ?? 0);
      const sudah = Number(r?.sudah_komentar ?? 0);
      return {
        ...a,
        total_postingan: Number(r?.jumlah_postingan ?? 0),
        sudah,
        belum: Math.max(0, total - sudah),
        persen: Number(r?.persen_patuh ?? 0),
        // Jumlah kewajiban yang terpenuhi di akun ini. Dulu bernama
        // "kader patuh penuh" dan dihitung per orang; angkanya tidak
        // pernah benar di bawah batas 1.000 baris, jadi kini memakai
        // hitungan unit yang bisa dipertanggungjawabkan.
        kader_patuh_penuh: sudah,
      };
    });

    return { data };
  });
}
