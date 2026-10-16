// GET /api/tv/insight?platform=X — insight profil sosmed TV Rakyat OFFICIAL
// dari profil upload-post (16 Okt 2026; sebelumnya Ayrshare).
//
// Satu panggilan /analytics upload-post memuat keenam platform sekaligus;
// hasilnya disimpan di cache bersama `up_official_insight`
// (lib/tvr-nasional → insightOfficialUp) dan upload-post baru dihubungi lagi
// setelah 15 menit atau bila diminta `?paksa=1`. Bentuk jawaban sengaja
// sama dengan versi lama (insight + akun) supaya layar pemanggil tak berubah.
//
// Official belum ditautkan → { siap:false, pesan } (bukan galat 500).
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { blokOfficial, insightOfficialUp, TTL_INSIGHT_OFFICIAL_MS } from "@/lib/tvr-nasional";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLATFORM_SAH = new Set(["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** Angka pertama yang ADA dari beberapa kemungkinan nama kolom. */
function angka(o: Record<string, unknown>, ...kandidat: string[]): number | null {
  for (const k of kandidat) {
    const v = o[k];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    // Insight memuat angka internal akun partai — hanya untuk yang sudah masuk.
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });

    const url = new URL(request.url);
    const paksa = url.searchParams.get("paksa") === "1";
    const mentah = (url.searchParams.get("platform") ?? "instagram").toLowerCase();
    const platform = PLATFORM_SAH.has(mentah) ? mentah : "instagram";

    const hasil = await insightOfficialUp({ paksa });
    if (!hasil.siap || !hasil.cache) {
      return { siap: false, pesan: hasil.pesan, insight: null, akun: null };
    }

    const { cache } = hasil;
    const blok = blokOfficial(cache, platform);
    const username = cache.akun[platform] ?? "";
    const diambilMs = new Date(cache.diambil).getTime();
    const insight = blok
      ? {
          platform,
          username,
          nama: username,
          fotoProfil: "",
          pengikut: angka(blok, "followers", "follower_count", "followers_count", "subscribers", "fans"),
          mengikuti: angka(blok, "following", "following_count"),
          jumlahMedia: angka(blok, "media_count", "video_count", "posts", "posts_count"),
          suka: angka(blok, "likes"),
          komentar: angka(blok, "comments"),
          jangkauan: angka(blok, "reach"),
          tayangan: angka(blok, "impressions", "views"),
          bagikan: angka(blok, "shares"),
          diperbarui: cache.diambil || null,
          berikutnya: Number.isFinite(diambilMs)
            ? new Date(diambilMs + TTL_INSIGHT_OFFICIAL_MS).toISOString()
            : null,
          catatan: [] as string[],
        }
      : null;

    return {
      siap: true,
      dariCache: hasil.dariCache,
      ...(hasil.kedaluwarsa ? { kedaluwarsa: true, pesan: hasil.pesan } : {}),
      insight,
      akun: {
        platformAktif: Object.keys(cache.akun),
        akun: Object.entries(cache.akun).map(([pf, un]) => ({
          platform: pf,
          username: un,
          displayName: un,
          profileUrl: "",
          userImage: "",
        })),
        // upload-post tidak memberi hitungan posting bulanan (dulu dari Ayrshare).
        postBulanIni: 0,
      },
    };
  });
}
