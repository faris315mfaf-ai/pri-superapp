// GET /api/tv-nasional/kategori?kategori=BPJS
//
// Insight PER KATEGORI untuk modul TV Rakyat Nasional. Dua sumber angka,
// dilaporkan TERPISAH karena artinya berbeda:
//
//  1. LAPORAN (laporan_video × tvr_video_metrik) — semua video yang
//     dilaporkan anggota dengan kategori itu; angkanya dari sapuan TikHub
//     (TikTok & Instagram saja).
//  2. POSTINGAN LEWAT SUPERAPP (tvrku_post) — video yang diunggah lewat
//     aplikasi; angkanya LANGSUNG dari upload-post, per platform.
//
// CARA ANGKA UPLOAD-POST DITARIK (diperbaiki 13 Sep 2026, setelah
// membaca openapi.json resmi mereka): per PROFIL, bukan per unggahan.
//   GET /uploadposts/post-analytics/cached?user=<profil>&since=&until=
// mengembalikan SEMUA postingan profil itu beserta `metrics`. Lalu tiap
// postingan dicocokkan ke unggahan aplikasi lewat ID video di post_url
// (laporan_video menyimpan URL per platform untuk tiap unggahan).
// Endpoint /post-analytics/{request_id} yang dipakai sebelumnya TIDAK
// ADA di spesifikasi — ia hanya kebetulan memberi post_url, bukan angka.
//
// Angka disimpan di baris unggahannya (sql/49: metrik, metrik_mentah,
// metrik_pada) dan disegarkan BERTAHAP di latar: profil yang paling basi
// dulu, maksimal beberapa profil per permintaan — panel tetap cepat dan
// kuota upload-post tidak habis oleh satu orang yang membuka panel
// berkali-kali.
//
// ?mentah=<id tvrku_post> (master saja): jawaban upload-post apa adanya
// untuk profil pemilik unggahan itu, plus hasil pencocokannya.
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
  petakanPostCached,
  type MetrikPostTerurai,
  type TautanUnggahan,
} from "@/lib/metrik-post-up";
import { analitikPostCachedUp, uploadPostSiap } from "@/lib/upload-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Maks profil yang ditarik dari upload-post per permintaan panel. */
const MAKS_PROFIL_SEGAR = 3;
/** Rentang tarik maksimal ke belakang (upload-post bawaannya cuma 30 hari). */
const MAKS_HARI_TARIK = 120;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

function tanggalIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

type BarisPost = {
  id: number | string;
  user_id: number | string;
  judul: string | null;
  platforms: string[] | null;
  request_id: string | null;
  dibuat_pada: string;
  metrik: Record<string, MetrikPostTerurai> | null;
  metrik_pada: string | null;
};

/**
 * Tarik angka SATU PROFIL dari upload-post, cocokkan ke seluruh unggahan
 * pemiliknya (bukan hanya yang berkategori — sekali tarik, semua dapat),
 * simpan ke tvrku_post. Mengembalikan jumlah unggahan yang terisi.
 */
async function segarkanProfil(userId: number, profil: string, sejakMs: number): Promise<{
  terisi: number;
  posts: number;
  mentah: unknown;
}> {
  const db = supabase();
  const since = tanggalIso(Math.max(sejakMs, Date.now() - MAKS_HARI_TARIK * 86_400_000));
  const { posts, mentah_halaman_pertama } = await analitikPostCachedUp(profil, {
    since,
    until: tanggalIso(Date.now()),
    timeoutMs: 20_000,
  });

  // Seluruh unggahan pemilik ini + URL per platform (laporan_video).
  const { data: milik } = await db
    .from("tvrku_post")
    .select("id")
    .eq("user_id", userId)
    .not("request_id", "is", null)
    .limit(1000);
  const idMilik = (milik ?? []).map((p) => String(p.id));
  const tautan: TautanUnggahan[] = [];
  for (const bagian of potong(idMilik, 300)) {
    const { data } = await db
      .from("laporan_video")
      .select("tvrku_post_id, platform, url_video")
      .in("tvrku_post_id", bagian.map(Number));
    for (const t of data ?? []) {
      if (t.tvrku_post_id && t.url_video) {
        tautan.push({
          tvrku_post_id: String(t.tvrku_post_id),
          platform: String(t.platform ?? ""),
          url_video: String(t.url_video),
        });
      }
    }
  }

  const peta = petakanPostCached(posts, tautan);
  const kini = new Date().toISOString();
  let terisi = 0;
  for (const [postId, perPlatform] of peta) {
    const mentah: Record<string, unknown> = {};
    for (const [pf, m] of Object.entries(perPlatform)) mentah[pf] = m.mentah;
    const { error } = await db
      .from("tvrku_post")
      .update({ metrik: perPlatform, metrik_mentah: mentah, metrik_pada: kini })
      .eq("id", Number(postId));
    if (!error) terisi += 1;
  }
  // Unggahan pemilik ini yang TIDAK ketemu di upload-post tetap ditandai
  // sudah dicoba (metrik_pada), supaya tidak ditarik ulang terus-menerus.
  const tidakKetemu = idMilik.filter((id) => !peta.has(id));
  for (const bagian of potong(tidakKetemu, 300)) {
    await db
      .from("tvrku_post")
      .update({ metrik_pada: kini })
      .in("id", bagian.map(Number))
      .is("metrik", null);
  }
  return { terisi, posts: posts.length, mentah: mentah_halaman_pertama };
}

/** Profil upload-post milik seorang anggota (username), atau "". */
async function profilMilik(userId: number): Promise<string> {
  const { data } = await supabase()
    .from("sosmed_profile")
    .select("profile_key")
    .eq("jenis", "pengguna")
    .eq("penyedia", "upload-post")
    .eq("user_id", userId)
    .maybeSingle();
  return String(data?.profile_key ?? "");
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

    // ---- Diagnosa (master): tarik profil pemilik satu unggahan SEKARANG ----
    const idMentah = Number(url.searchParams.get("mentah") ?? 0);
    if (idMentah > 0) {
      if (user.role !== "master") throw Object.assign(new Error("Halaman tidak ditemukan."), { status: 404 });
      if (!uploadPostSiap()) throw Object.assign(new Error("Kunci upload-post belum terpasang."), { status: 503 });
      const { data: p } = await db
        .from("tvrku_post")
        .select("id, user_id, request_id, dibuat_pada")
        .eq("id", idMentah)
        .maybeSingle();
      if (!p) throw Object.assign(new Error("Unggahan tidak ditemukan."), { status: 404 });
      const profil = await profilMilik(Number(p.user_id));
      if (!profil) throw Object.assign(new Error("Pemilik unggahan belum punya profil upload-post."), { status: 404 });
      const hasil = await segarkanProfil(Number(p.user_id), profil, Date.parse(String(p.dibuat_pada)) - 86_400_000);
      const { data: sesudah } = await db.from("tvrku_post").select("metrik, metrik_pada").eq("id", idMentah).maybeSingle();
      return {
        post_id: idMentah,
        profil,
        postingan_di_upload_post: hasil.posts,
        unggahan_terisi: hasil.terisi,
        mentah_halaman_pertama: hasil.mentah,
        unggahan_ini: sesudah,
      };
    }

    const kategori = (url.searchParams.get("kategori") ?? "").trim().slice(0, 120);
    if (!kategori) throw Object.assign(new Error("Sebutkan kategorinya."), { status: 400 });
    const pola = polaPersis(kategori);

    // ==================================================================
    // 1. LAPORAN × TikHub
    // ==================================================================
    const laporan = await semuaBaris<LaporanKategori & { tvrku_post_id?: unknown }>(
      (dari, sampai) =>
        db
          .from("laporan_video")
          .select("id, user_id, platform, url_video, tanggal_wib, tvrku_post_id")
          .ilike("keyword", pola)
          .order("tanggal_wib", { ascending: false })
          .range(dari, sampai) as unknown as PromiseLike<{
            data: (LaporanKategori & { tvrku_post_id?: unknown })[] | null;
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
    //    Unggahan berkategori = keyword di tvrku_post ATAU laporan yang
    //    tertaut ke unggahan itu berkategori (unggahan lama belum punya
    //    kolom kategori, tapi laporannya mungkin sudah).
    // ==================================================================
    const idDariLaporan = [
      ...new Set(laporan.map((l) => Number(l.tvrku_post_id ?? 0)).filter((n) => n > 0)),
    ];
    const kolomPost = "id, user_id, judul, platforms, request_id, dibuat_pada, metrik, metrik_pada";
    const { data: postKeyword } = await db
      .from("tvrku_post")
      .select(kolomPost)
      .ilike("keyword", pola)
      .order("dibuat_pada", { ascending: false })
      .limit(500);
    const postSemua = new Map<string, BarisPost>();
    for (const p of (postKeyword ?? []) as BarisPost[]) postSemua.set(String(p.id), p);
    for (const bagian of potong(idDariLaporan, 300)) {
      const { data } = await db.from("tvrku_post").select(kolomPost).in("id", bagian);
      for (const p of (data ?? []) as BarisPost[]) postSemua.set(String(p.id), p);
    }
    const postingan = [...postSemua.values()].sort((a, b) =>
      String(b.dibuat_pada).localeCompare(String(a.dibuat_pada)),
    );

    // Penyegaran bertahap di latar, PER PROFIL: profil yang unggahannya
    // paling basi ditarik dulu.
    if (uploadPostSiap()) {
      const perPemilik = new Map<number, { basiTertua: string; sejakMs: number }>();
      for (const p of postingan) {
        if (!p.request_id || !metrikBasi(p.metrik_pada)) continue;
        const uid = Number(p.user_id);
        const ada = perPemilik.get(uid);
        const dibuat = Date.parse(String(p.dibuat_pada)) || Date.now();
        perPemilik.set(uid, {
          basiTertua: ada ? (ada.basiTertua < (p.metrik_pada ?? "") ? ada.basiTertua : (p.metrik_pada ?? "")) : (p.metrik_pada ?? ""),
          sejakMs: Math.min(ada?.sejakMs ?? Number.POSITIVE_INFINITY, dibuat - 86_400_000),
        });
      }
      const antrean = [...perPemilik.entries()]
        .sort((a, b) => a[1].basiTertua.localeCompare(b[1].basiTertua))
        .slice(0, MAKS_PROFIL_SEGAR);
      if (antrean.length > 0) {
        after(async () => {
          for (const [uid, info] of antrean) {
            try {
              const profil = await profilMilik(uid);
              if (profil) await segarkanProfil(uid, profil, info.sejakMs);
            } catch (e) {
              console.error("[kategori] segarkan profil", uid, e instanceof Error ? e.message : e);
            }
          }
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
      const perPlatform = (p.metrik ?? {}) as Record<string, MetrikPostTerurai>;
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
    const totalUp = jumlahkanMetrikPost(daftarPost.flatMap((p) => Object.values(p.per_platform)));

    return {
      kategori,
      ringkasan,
      video: video.slice(0, 300),
      ditampilkan: Math.min(300, video.length),
      postingan: daftarPost,
      postingan_terukur: daftarPost.filter((p) => p.total.platform_terukur > 0).length,
      total_up: totalUp,
      upload_post_siap: uploadPostSiap(),
    };
  });
}
