// GET /api/tv/insight/detail?platform=X — daftar postingan terbaru akun TV
// Rakyat OFFICIAL per platform, dari profil upload-post (16 Okt 2026;
// sebelumnya Ayrshare /history).
//
// ?semua=1 (spek 1.15): gabungan 30 postingan terbaru dari SELURUH platform
// yang tertaut, untuk galeri embed (EmbedTerbaru).
//
// Sumbernya daftar media upload-post (GET /uploadposts/media), yang memuat
// postingan akun itu sendiri — termasuk yang tidak diunggah lewat aplikasi.
// Daftar media TIDAK membawa angka per postingan, jadi `metrik` dikosongkan
// dengan jujur (bukan nol palsu).
//
// Hasilnya di-cache 15 menit di pengaturan_sistem (`up_official_detail_*`):
// satu layar tidak boleh menghabiskan kuota upload-post hanya karena
// dibuka-tutup. Official belum ditautkan → { siap:false, pesan, data:[] }.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { PESAN_OFFICIAL_BELUM_TERTAUT, profilOfficialUp } from "@/lib/official-up";
import { akunTertautUp, postinganTerbaruUp, uploadPostSiap, type PostinganUp } from "@/lib/upload-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLATFORM_SAH = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"];
const TTL_MS = 15 * 60 * 1000;
const PER_PLATFORM = 15;

type PostinganDetail = {
  id: string;
  teks: string;
  url: string;
  thumbnail: string;
  jenis: string;
  waktu: string | null;
  metrik: { label: string; nilai: number }[];
  platform: string;
};

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function keDetail(p: PostinganUp, platform: string): PostinganDetail {
  return {
    id: p.id || p.permalink,
    teks: p.caption,
    url: p.permalink,
    thumbnail: p.thumbnail,
    jenis: p.jenis,
    waktu: p.waktu,
    metrik: [],
    platform,
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!uploadPostSiap()) {
      return { siap: false, pesan: "upload-post belum diatur di server.", data: [] };
    }
    const profil = await profilOfficialUp();
    if (!profil) return { siap: false, pesan: PESAN_OFFICIAL_BELUM_TERTAUT, data: [] };

    const url = new URL(request.url);
    const mentah = (url.searchParams.get("platform") ?? "instagram").toLowerCase();
    const platform = PLATFORM_SAH.includes(mentah) ? mentah : "instagram";
    const paksa = url.searchParams.get("paksa") === "1";
    const gabungSemua = url.searchParams.get("semua") === "1";
    const kunci = gabungSemua ? "up_official_detail_semua" : `up_official_detail_${platform}`;
    const db = supabase();

    if (!paksa) {
      const { data: cache } = await db
        .from("pengaturan_sistem")
        .select("nilai, diubah_pada")
        .eq("kunci", kunci)
        .maybeSingle();
      if (cache?.nilai && cache.diubah_pada) {
        const umur = Date.now() - new Date(cache.diubah_pada).getTime();
        if (umur < TTL_MS) {
          try {
            const isi = JSON.parse(cache.nilai) as { profil?: string };
            // Profil Official berganti → cache milik profil lama diabaikan.
            if (isi.profil === profil) return { siap: true, dariCache: true, ...isi };
          } catch {
            // Cache rusak — abaikan, ambil ulang dari upload-post.
          }
        }
      }
    }

    const akun = await akunTertautUp(profil);
    const tertaut = PLATFORM_SAH.filter((p) => akun[p]);
    if (tertaut.length === 0) return { siap: false, pesan: PESAN_OFFICIAL_BELUM_TERTAUT, data: [] };

    let isi: { profil: string; platform: string; data: PostinganDetail[] };
    if (gabungSemua) {
      // Tarik tiap platform sendiri-sendiri; platform yang gagal dilewati
      // supaya satu gangguan tidak mengosongkan galeri.
      const hasil = await Promise.allSettled(
        tertaut.map(async (pf) => (await postinganTerbaruUp(profil, pf, PER_PLATFORM)).map((p) => keDetail(p, pf))),
      );
      const semua = hasil
        .filter((h): h is PromiseFulfilledResult<PostinganDetail[]> => h.status === "fulfilled")
        .flatMap((h) => h.value)
        .filter((p) => p.url);
      semua.sort((a, b) => String(b.waktu ?? "").localeCompare(String(a.waktu ?? "")));
      isi = { profil, platform: "semua", data: semua.slice(0, 30) };
    } else if (!akun[platform]) {
      isi = { profil, platform, data: [] };
    } else {
      const daftar = await postinganTerbaruUp(profil, platform, PER_PLATFORM);
      isi = { profil, platform, data: daftar.map((p) => keDetail(p, platform)).filter((p) => p.url) };
    }

    try {
      await db.from("pengaturan_sistem").upsert(
        { kunci, nilai: JSON.stringify(isi), diubah_pada: new Date().toISOString() },
        { onConflict: "kunci" },
      );
    } catch (e) {
      // Gagal menyimpan cache bukan alasan menggagalkan permintaan.
      console.error("[insight/detail] cache:", e);
    }

    return { siap: true, dariCache: false, ...isi };
  });
}
