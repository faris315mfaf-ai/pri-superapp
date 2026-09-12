// GET /api/tv-nasional/kategori?kategori=BPJS
//
// Insight PER KATEGORI untuk modul TV Rakyat Nasional. Dua sumber angka,
// dilaporkan TERPISAH karena artinya berbeda:
//
//  1. LAPORAN (laporan_video × tvr_video_metrik) — semua video yang
//     dilaporkan anggota dengan kategori itu; angkanya dari sapuan TikHub
//     (TikTok & Instagram saja).
//  2. POSTINGAN LEWAT SUPERAPP (tvrku_post) — video yang diunggah lewat
//     aplikasi dan diberi kategori saat unggah; angkanya LANGSUNG dari
//     upload-post (post-analytics/{request_id}): suka, komentar,
//     dibagikan, tayangan, impresi, jangkauan — per platform.
//     Inilah yang dipakai untuk pengiklan: "20 video bulan ini dapat
//     berapa" dijawab dari sini, per postingan, dengan jam penarikannya.
//
// Angka upload-post disimpan di baris unggahannya (sql/49) dan disegarkan
// BERTAHAP di latar: yang paling basi ditarik dulu, maksimal beberapa per
// permintaan — supaya panel tetap cepat dan kuota upload-post tidak habis
// oleh satu orang yang membuka panel berkali-kali.
//
// ?mentah=<id tvrku_post> (master saja): jawaban upload-post apa adanya,
// untuk memastikan penguraian membaca kolom yang benar.
//
// Akses: jabatan TV Rakyat Nasional, Pimpinan Redaksi, master.
import { after } from "next/server";
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
import {
  jumlahkanMetrikPost,
  metrikBasi,
  type MetrikPost,
} from "@/lib/metrik-post-up";
import { metrikPostUp, uploadPostSiap } from "@/lib/upload-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Maks unggahan yang ditarik dari upload-post per permintaan panel. */
const MAKS_SEGAR_PER_PERMINTAAN = 6;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

type BarisPost = {
  id: number | string;
  user_id: number | string;
  judul: string | null;
  platforms: string[] | null;
  request_id: string | null;
  dibuat_pada: string;
  metrik: Record<string, MetrikPost> | null;
  metrik_pada: string | null;
};

/** Tarik angka satu unggahan dari upload-post dan simpan. */
async function segarkanMetrikPost(post: BarisPost): Promise<void> {
  if (!post.request_id) return;
  try {
    const { mentah, per_platform } = await metrikPostUp(String(post.request_id), 20_000);
    await supabase()
      .from("tvrku_post")
      .update({ metrik: per_platform, metrik_mentah: mentah, metrik_pada: new Date().toISOString() })
      .eq("id", Number(post.id));
  } catch (e) {
    console.error("[kategori] metrik post", post.id, e instanceof Error ? e.message : e);
  }
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
    const url = new URL(request.url);
    const db = supabase();

    // ---- Diagnosa: jawaban upload-post apa adanya (master) ----------
    const idMentah = Number(url.searchParams.get("mentah") ?? 0);
    if (idMentah > 0) {
      if (user.role !== "master") throw Object.assign(new Error("Halaman tidak ditemukan."), { status: 404 });
      const { data: p } = await db
        .from("tvrku_post")
        .select("id, request_id, metrik, metrik_pada")
        .eq("id", idMentah)
        .maybeSingle();
      if (!p?.request_id) throw Object.assign(new Error("Unggahan tidak punya request_id."), { status: 404 });
      const hasil = await metrikPostUp(String(p.request_id), 25_000);
      return { post_id: idMentah, request_id: p.request_id, mentah: hasil.mentah, terurai: hasil.per_platform };
    }

    const kategori = (url.searchParams.get("kategori") ?? "").trim().slice(0, 120);
    if (!kategori) throw Object.assign(new Error("Sebutkan kategorinya."), { status: 400 });
    const pola = polaPersis(kategori);

    // ==================================================================
    // 1. LAPORAN × TikHub
    // ==================================================================
    const laporan = await semuaBaris<LaporanKategori>(
      (dari, sampai) =>
        db
          .from("laporan_video")
          .select("id, user_id, platform, url_video, tanggal_wib")
          .ilike("keyword", pola)
          .order("tanggal_wib", { ascending: false })
          .range(dari, sampai) as unknown as PromiseLike<{
            data: LaporanKategori[] | null;
            error: { message: string } | null;
          }>,
      20_000,
    );
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
        .select("kode, platform, judul, url, thumbnail_url, nama_akun, akun_username, waktu_posting, tayangan, suka, komentar, bagikan")
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

    // ==================================================================
    // 2. POSTINGAN LEWAT SUPERAPP × upload-post
    // ==================================================================
    const { data: postMentah } = await db
      .from("tvrku_post")
      .select("id, user_id, judul, platforms, request_id, dibuat_pada, metrik, metrik_pada")
      .ilike("keyword", pola)
      .order("dibuat_pada", { ascending: false })
      .limit(500);
    const postingan = (postMentah ?? []) as BarisPost[];

    // Penyegaran bertahap di latar: yang paling basi dulu.
    if (uploadPostSiap()) {
      const basi = postingan
        .filter((p) => p.request_id && metrikBasi(p.metrik_pada))
        .sort((a, b) => (a.metrik_pada ?? "").localeCompare(b.metrik_pada ?? ""))
        .slice(0, MAKS_SEGAR_PER_PERMINTAAN);
      if (basi.length > 0) {
        after(async () => {
          for (const p of basi) await segarkanMetrikPost(p);
        });
      }
    }

    // ---- Nama orang (pelapor & pengunggah) ---------------------------
    const idOrang = [
      ...new Set([
        ...laporan.map((l) => Number(l.user_id)),
        ...postingan.map((p) => Number(p.user_id)),
      ].filter((n) => n > 0)),
    ];
    const nama = new Map<string, string>();
    for (const bagian of potong(idOrang, 300)) {
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

    const daftarPost = postingan.map((p) => {
      const perPlatform = (p.metrik ?? {}) as Record<string, MetrikPost>;
      const total = jumlahkanMetrikPost(Object.values(perPlatform));
      return {
        id: String(p.id),
        judul: String(p.judul ?? ""),
        pengunggah: nama.get(String(p.user_id)) ?? "",
        platforms: (p.platforms ?? []) as string[],
        dibuat_pada: String(p.dibuat_pada),
        metrik_pada: p.metrik_pada,
        terlacak: Boolean(p.request_id),
        per_platform: perPlatform,
        total,
      };
    });
    const totalUp = jumlahkanMetrikPost(
      daftarPost.flatMap((p) => Object.values(p.per_platform)),
    );

    return {
      kategori,
      ringkasan,
      video: video.slice(0, 300),
      ditampilkan: Math.min(300, video.length),
      // Postingan lewat SuperApp — angka dari upload-post.
      postingan: daftarPost,
      postingan_terukur: daftarPost.filter((p) => p.total.platform_terukur > 0).length,
      total_up: totalUp,
      upload_post_siap: uploadPostSiap(),
    };
  });
}
