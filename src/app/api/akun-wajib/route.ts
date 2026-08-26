// GET /api/akun-wajib — daftar akun wajib + statistik kepatuhan
// Sumber: Supabase (view v_app_akun_wajib + v_app_rekap).
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

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

    const rekap = periodeDipakai
      ? (pastikanSukses(
          await db
            .from("v_app_rekap")
            .select("akun_wajib, id_postingan, nama_kader, sudah_komentar")
            .eq("periode", periodeDipakai),
          "rekap kepatuhan",
        ) as BarisRekap[])
      : [];

    // Dikelompokkan sekali di depan. Sebelumnya tiap akun memanggil
    // rekap.filter() sendiri, jadi seluruh tabel disapu ulang sebanyak jumlah
    // akun — beban yang naik seiring bertambahnya baris rekap.
    const rekapPerAkun = new Map<string, BarisRekap[]>();
    for (const r of rekap) {
      const isi = rekapPerAkun.get(r.akun_wajib);
      if (isi) isi.push(r);
      else rekapPerAkun.set(r.akun_wajib, [r]);
    }

    const data = akun.map((a) => {
      const baris = rekapPerAkun.get(a.akun_wajib as string) ?? [];
      const sudah = baris.filter((r) => r.sudah_komentar).length;
      const belum = baris.length - sudah;

      // "Patuh penuh" = kader yang komentar di SEMUA postingan akun ini,
      // sesuai aturan bisnis: kewajiban dihitung per orang x postingan.
      const perKader = new Map<string, { total: number; sudah: number }>();
      for (const r of baris) {
        const k = perKader.get(r.nama_kader) ?? { total: 0, sudah: 0 };
        k.total += 1;
        if (r.sudah_komentar) k.sudah += 1;
        perKader.set(r.nama_kader, k);
      }
      const kaderPatuhPenuh = [...perKader.values()].filter(
        (k) => k.total > 0 && k.sudah === k.total,
      ).length;

      return {
        ...a,
        total_postingan: new Set(baris.map((r) => r.id_postingan)).size,
        sudah,
        belum,
        persen: baris.length > 0 ? Math.round((sudah / baris.length) * 100) : 0,
        kader_patuh_penuh: kaderPatuhPenuh,
      };
    });

    return { data };
  });
}
