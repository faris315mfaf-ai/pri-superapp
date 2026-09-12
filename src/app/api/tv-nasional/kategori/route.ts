// GET /api/tv-nasional/kategori?kategori=BPJS
//
// Insight PER KATEGORI: seluruh video yang dilaporkan dengan kategori
// itu, beserta angka per video (tayangan, suka, komentar, bagikan) dan
// totalnya. Dipakai modul TV Rakyat Nasional.
//
// Sumber angka: tvr_video_metrik — hasil sapuan TikHub yang sudah
// dipelihara fitur Video Terbaik. Rute ini TIDAK menarik apa pun dari
// luar; ia hanya menyusun yang sudah ada. Video di platform yang tidak
// disapu (YouTube, Facebook, X, Threads, Bilibili) tetap dihitung
// sebagai laporan, tanpa angka — dan panel mengatakannya apa adanya.
//
// Akses: jabatan TV Rakyat Nasional, Pimpinan Redaksi, master.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred, adalahTvrNasional } from "@/lib/jabatan";
import { semuaBaris } from "@/lib/semua-baris";
import {
  kodeMetrik,
  polaPersis,
  susunInsightKategori,
  type LaporanKategori,
  type MetrikVideoKategori,
} from "@/lib/insight-kategori";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** Membagi daftar jadi potongan — kueri IN yang terlalu panjang ditolak PostgREST. */
function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    if (!adalahTvrNasional(user) && !adalahPimred(user)) {
      throw Object.assign(
        new Error("Hanya jabatan TV Rakyat Nasional & Pimpinan Redaksi yang bisa membuka insight ini."),
        { status: 403 },
      );
    }

    const kategori = (new URL(request.url).searchParams.get("kategori") ?? "").trim().slice(0, 120);
    if (!kategori) throw Object.assign(new Error("Sebutkan kategorinya."), { status: 400 });

    const db = supabase();

    // 1. Seluruh laporan berkategori ini — lewat semuaBaris, karena
    //    PostgREST memotong jawaban di 1000 baris apa pun rentangnya.
    const laporan = await semuaBaris<LaporanKategori>(
      (dari, sampai) =>
        db
          .from("laporan_video")
          .select("id, user_id, platform, url_video, tanggal_wib")
          .ilike("keyword", polaPersis(kategori))
          .order("tanggal_wib", { ascending: false })
          .range(dari, sampai) as unknown as PromiseLike<{
            data: LaporanKategori[] | null;
            error: { message: string } | null;
          }>,
      20_000,
    );

    // 2. Angka per video — dicari lewat kode (kunci utama), bukan URL.
    const kodeSemua = [
      ...new Set(
        laporan
          .map((l) => kodeMetrik(String(l.platform), String(l.url_video)))
          .filter((k): k is string => Boolean(k)),
      ),
    ];
    const metrik = new Map<string, MetrikVideoKategori>();
    for (const bagian of potong(kodeSemua, 200)) {
      const { data } = await db
        .from("tvr_video_metrik")
        .select(
          "kode, platform, judul, url, thumbnail_url, nama_akun, akun_username, waktu_posting, tayangan, suka, komentar, bagikan",
        )
        .in("kode", bagian);
      for (const m of data ?? []) {
        metrik.set(String(m.kode), {
          kode: String(m.kode),
          platform: String(m.platform),
          judul: String(m.judul ?? ""),
          url: String(m.url ?? ""),
          thumbnail_url: String(m.thumbnail_url ?? ""),
          nama_akun: String(m.nama_akun ?? ""),
          akun_username: String(m.akun_username ?? ""),
          waktu_posting: m.waktu_posting ? String(m.waktu_posting) : null,
          tayangan: Number(m.tayangan ?? 0),
          suka: Number(m.suka ?? 0),
          komentar: Number(m.komentar ?? 0),
          bagikan: Number(m.bagikan ?? 0),
        });
      }
    }

    // 3. Nama pelapor.
    const idPelapor = [...new Set(laporan.map((l) => Number(l.user_id)).filter((n) => n > 0))];
    const nama = new Map<string, string>();
    for (const bagian of potong(idPelapor, 300)) {
      const { data } = await db.from("app_user").select("id, nama").in("id", bagian);
      for (const u of data ?? []) nama.set(String(u.id), String(u.nama ?? ""));
    }

    const laporanBersih: LaporanKategori[] = laporan.map((l) => ({
      id: String(l.id),
      user_id: String(l.user_id),
      platform: String(l.platform ?? ""),
      url_video: String(l.url_video ?? ""),
      tanggal_wib: String(l.tanggal_wib ?? ""),
    }));
    const { video, ringkasan } = susunInsightKategori(laporanBersih, metrik, nama);

    return {
      kategori,
      ringkasan,
      // Daftar dibatasi supaya jawaban tidak membengkak; ringkasan di atas
      // tetap dihitung dari SEMUA video, bukan dari 300 yang ditampilkan.
      video: video.slice(0, 300),
      ditampilkan: Math.min(300, video.length),
    };
  });
}
