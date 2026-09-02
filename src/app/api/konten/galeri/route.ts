// GET /api/konten/galeri — galeri video akun TV Rakyat untuk modul Konten
// (2 Sep 2026). Menggantikan tiga kartu akun Instagram lama.
//
// Tanpa parameter → daftar LINGKARAN: TV Rakyat Official + semua anggota
//                   yang sudah menautkan minimal satu akun TV Rakyat.
// ?siapa=official  → semua postingan akun resmi TV Rakyat dari `feed_konten`
//                   (hasil sinkron Ayrshare/n8n, 5 platform).
// ?siapa=<user_id> → postingan terbaru anggota itu dari upload-post
//                   (maks 25 per platform tertaut) digabung laporan_video-nya.
//
// Cache mikro per instance: daftar 60 dtk, video per akun 10 mnt — supaya
// 300 anggota yang mengetuk-ngetuk lingkaran tidak menghujani upload-post.
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { pastikanMasuk } from "@/lib/sesi";
import { kumpulkanAnggotaTvr } from "@/lib/tvr-peringkat";
import { postinganTerbaruUp } from "@/lib/upload-post";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Lingkaran = {
  kunci: string;
  nama: string;
  avatar_url: string;
  akun: Record<string, string>;
};

type VideoGaleri = {
  id: string;
  platform: string;
  url: string;
  thumbnail: string;
  caption: string;
  waktu: string | null;
  like: number | null;
  komentar: number | null;
};

const TTL_DAFTAR_MS = 60_000;
const TTL_VIDEO_MS = 10 * 60_000;
const MAKS_CACHE_VIDEO = 300;

let cacheDaftar: { isi: { official: Lingkaran; pengguna: Lingkaran[] }; pada: number } | null =
  null;
const cacheVideo = new Map<string, { isi: VideoGaleri[]; pada: number }>();

function simpanCacheVideo(kunci: string, isi: VideoGaleri[]) {
  if (cacheVideo.size >= MAKS_CACHE_VIDEO) {
    const tertua = cacheVideo.keys().next().value;
    if (tertua !== undefined) cacheVideo.delete(tertua);
  }
  cacheVideo.set(kunci, { isi, pada: Date.now() });
}

/** Akun resmi TV Rakyat per platform, dari akun_wajib (nama_akun "tv rakyat"). */
async function akunOfficial(): Promise<Record<string, string>> {
  const { data } = await supabase()
    .from("akun_wajib")
    .select("platform, username, nama_akun")
    .eq("aktif", true)
    .ilike("nama_akun", "%tv rakyat%")
    .order("id");
  const akun: Record<string, string> = {};
  for (const b of data ?? []) {
    const p = String(b.platform ?? "").trim().toLowerCase();
    if (p && !akun[p]) akun[p] = String(b.username ?? "").trim();
  }
  return akun;
}

function normalUrl(u: string): string {
  return u.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
}

async function daftarLingkaran() {
  if (cacheDaftar && Date.now() - cacheDaftar.pada < TTL_DAFTAR_MS) return cacheDaftar.isi;
  const [akunResmi, anggota] = await Promise.all([akunOfficial(), kumpulkanAnggotaTvr()]);
  const official: Lingkaran = {
    kunci: "official",
    nama: "TV Rakyat Official",
    avatar_url: "/ikon/logo-app-256.png",
    akun: akunResmi,
  };
  const pengguna: Lingkaran[] = anggota
    .filter((a) => Object.keys(a.akun).length > 0)
    .map((a) => ({ kunci: a.user_id, nama: a.nama, avatar_url: a.avatar_url, akun: a.akun }))
    .sort((x, y) => x.nama.localeCompare(y.nama));
  const isi = { official, pengguna };
  cacheDaftar = { isi, pada: Date.now() };
  return isi;
}

async function videoOfficial(): Promise<VideoGaleri[]> {
  const akun = await akunOfficial();
  const username = Object.values(akun)
    .map((u) => u.toLowerCase())
    .filter(Boolean);
  if (username.length === 0) return [];
  const { data } = await supabase()
    .from("feed_konten")
    .select(
      "id_postingan, platform, akun_username, url_postingan, caption, thumbnail_url, jumlah_like, jumlah_komentar, waktu_posting",
    )
    .in("akun_username", username)
    .order("waktu_posting", { ascending: false, nullsFirst: false })
    .limit(600);
  const hasil: VideoGaleri[] = [];
  for (const f of data ?? []) {
    const platform = String(f.platform ?? "").toLowerCase();
    const id = String(f.id_postingan ?? "");
    const url =
      String(f.url_postingan ?? "") ||
      (platform === "instagram" ? `https://www.instagram.com/p/${encodeURIComponent(id)}/` : "");
    if (!url) continue;
    hasil.push({
      id: `${platform}-${id}`,
      platform,
      url,
      thumbnail: String(f.thumbnail_url ?? ""),
      caption: String(f.caption ?? "").trim().slice(0, 300),
      waktu: f.waktu_posting ? String(f.waktu_posting) : null,
      like: f.jumlah_like == null ? null : Number(f.jumlah_like),
      komentar: f.jumlah_komentar == null ? null : Number(f.jumlah_komentar),
    });
  }
  return hasil;
}

async function videoAnggota(userId: number): Promise<VideoGaleri[]> {
  const db = supabase();
  const [{ data: profil }, { data: akunBaris }, { data: laporan }] = await Promise.all([
    db
      .from("sosmed_profile")
      .select("profile_key")
      .eq("penyedia", "upload-post")
      .eq("jenis", "pengguna")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    db
      .from("akun_tvr_user")
      .select("platform")
      .eq("user_id", userId)
      .eq("terhubung", true)
      .neq("platform", "website"),
    db
      .from("laporan_video")
      .select("platform, url_video, keyword, tanggal_wib, dibuat_pada")
      .eq("user_id", userId)
      .order("dibuat_pada", { ascending: false })
      .limit(300),
  ]);

  const hasil: VideoGaleri[] = [];
  const sudah = new Set<string>();

  // 1. Postingan LANGSUNG dari platform (lewat upload-post) — mencakup
  //    apa pun yang diunggah, lewat aplikasi maupun tidak.
  const profilKey = profil?.profile_key ? String(profil.profile_key) : "";
  const platformTertaut = [...new Set((akunBaris ?? []).map((b) => String(b.platform)))];
  if (profilKey && platformTertaut.length > 0) {
    const tarikan = await Promise.allSettled(
      platformTertaut.map((p) => postinganTerbaruUp(profilKey, p, 25)),
    );
    tarikan.forEach((t, i) => {
      if (t.status !== "fulfilled") return;
      const platform = platformTertaut[i];
      for (const p of t.value) {
        if (!p.permalink) continue;
        const kunci = normalUrl(p.permalink);
        if (sudah.has(kunci)) continue;
        sudah.add(kunci);
        hasil.push({
          id: `${platform}-${p.id || kunci}`,
          platform,
          url: p.permalink,
          thumbnail: p.thumbnail,
          caption: p.caption,
          waktu: p.waktu,
          like: null,
          komentar: null,
        });
      }
    });
  }

  // 2. Laporan KPI (link) — menutup platform yang tak tertaut / di luar 25 terbaru.
  for (const l of laporan ?? []) {
    const url = String(l.url_video ?? "");
    if (!url) continue;
    const kunci = normalUrl(url);
    if (sudah.has(kunci)) continue;
    sudah.add(kunci);
    hasil.push({
      id: `lap-${kunci}`,
      platform: String(l.platform ?? ""),
      url,
      thumbnail: "",
      caption: String(l.keyword ?? ""),
      waktu: l.dibuat_pada ? String(l.dibuat_pada) : null,
      like: null,
      komentar: null,
    });
  }

  // Terbaru di atas; yang tanpa waktu di belakang.
  hasil.sort((x, y) => {
    if (!x.waktu && !y.waktu) return 0;
    if (!x.waktu) return 1;
    if (!y.waktu) return -1;
    return y.waktu.localeCompare(x.waktu);
  });
  return hasil;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    const siapa = (new URL(request.url).searchParams.get("siapa") ?? "").trim();

    if (!siapa) return daftarLingkaran();

    const cache = cacheVideo.get(siapa);
    if (cache && Date.now() - cache.pada < TTL_VIDEO_MS) return { data: cache.isi };

    let data: VideoGaleri[] = [];
    if (siapa === "official") {
      data = await videoOfficial();
    } else if (/^\d+$/.test(siapa)) {
      data = await videoAnggota(Number(siapa));
    } else {
      throw Object.assign(new Error("Akun tidak dikenal."), { status: 400 });
    }
    simpanCacheVideo(siapa, data);
    return { data };
  });
}
