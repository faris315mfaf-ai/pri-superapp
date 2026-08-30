// ============================================================
// PRI SuperApp — Scraper TikHub (KHUSUS SISI SERVER).
//
// Menarik postingan terbaru sebuah akun Instagram / TikTok lewat TikHub
// (menggantikan Apify — fitur 1.22.x/5-bug). Kunci di env TIKHUB_TOKEN;
// TIDAK pernah hardcode di kode.
//
// Kontrak endpoint TikHub (diverifikasi empiris, bukan ditebak):
// - TikTok (1 panggilan): GET /tiktok/app/v3/fetch_user_post_videos?unique_id=USER&count=N
//     → data.aweme_list[]: { aweme_id, desc, create_time, share_url,
//       video.cover.url_list[0] }
// - Instagram (2 panggilan): GET /instagram/v3/get_user_id_by_username?username=USER
//     → data.user_id; lalu GET /instagram/v1/fetch_user_posts?user_id=ID&count=N
//     → data.items[]: { code, pk, taken_at, caption.text,
//       image_versions2.candidates[0].url, media_type }
//
// Tiap panggilan TikHub DIBEBANI biaya (per-request) — hemat: default
// count kecil, dan hanya akun aktif yang di-scrape.
// ============================================================

const BASE = "https://api.tikhub.io/api/v1";

export function tikhubSiap(): boolean {
  return Boolean(process.env.TIKHUB_TOKEN);
}

export type PostinganScrape = {
  /** Kunci unik lintas-scrape (prefix platform + id asli). */
  kode: string;
  platform: "instagram" | "tiktok";
  username: string;
  judul: string;
  caption: string;
  url: string;
  thumbnail_url: string;
  /** Waktu terbit (unix detik). */
  waktu_unix: number;
  jenis: "video" | "foto";
};

async function tk<T>(path: string, timeoutMs = 25000): Promise<T> {
  if (!process.env.TIKHUB_TOKEN) {
    throw new Error("Scraper belum tersambung (TIKHUB_TOKEN kosong).");
  }
  const kendali = new AbortController();
  const timer = setTimeout(() => kendali.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${process.env.TIKHUB_TOKEN}` },
      signal: kendali.signal,
      cache: "no-store",
    });
    const teks = await res.text();
    let json: unknown = null;
    try {
      json = teks ? JSON.parse(teks) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const pesan = (json as { detail?: string; message?: string })?.detail
        ?? (json as { message?: string })?.message
        ?? `TikHub menolak (${res.status})`;
      throw Object.assign(new Error(String(pesan)), { status: res.status });
    }
    return json as T;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("TikHub tidak menjawab tepat waktu.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

type AwemeTikTok = {
  aweme_id?: string | number;
  desc?: string;
  create_time?: number;
  share_url?: string;
  aweme_type?: number;
  image_post_info?: unknown;
  video?: {
    cover?: { url_list?: string[] };
    origin_cover?: { url_list?: string[] };
  };
};

/** Postingan terbaru TikTok via username (unique_id). */
export async function scrapeTikTok(username: string, count = 10): Promise<PostinganScrape[]> {
  const u = username.replace(/^@+/, "").trim();
  const j = await tk<{ data?: { aweme_list?: AwemeTikTok[] } }>(
    `/tiktok/app/v3/fetch_user_post_videos?unique_id=${encodeURIComponent(u)}&count=${count}`,
  );
  const arr = j.data?.aweme_list ?? [];
  return arr
    .filter((v) => v.aweme_id)
    .map((v) => {
      const foto = Boolean(v.image_post_info) || v.aweme_type === 150;
      return {
        kode: `tt_${v.aweme_id}`,
        platform: "tiktok" as const,
        username: u,
        judul: (v.desc ?? "").trim().slice(0, 200),
        caption: (v.desc ?? "").trim(),
        url: (v.share_url ?? "").split("?")[0] || `https://www.tiktok.com/@${u}/video/${v.aweme_id}`,
        thumbnail_url:
          v.video?.cover?.url_list?.[0] ?? v.video?.origin_cover?.url_list?.[0] ?? "",
        waktu_unix: Number(v.create_time ?? 0),
        jenis: foto ? ("foto" as const) : ("video" as const),
      };
    });
}

type PostIG = {
  code?: string;
  pk?: string | number;
  taken_at?: number;
  media_type?: number;
  product_type?: string;
  caption?: { text?: string } | null;
  image_versions2?: { candidates?: { url?: string }[] };
};

/** Postingan terbaru Instagram via username (resolve id → posts). */
export async function scrapeInstagram(username: string, count = 10): Promise<PostinganScrape[]> {
  const u = username.replace(/^@+/, "").trim();
  const idJ = await tk<{ data?: { user_id?: string } }>(
    `/instagram/v3/get_user_id_by_username?username=${encodeURIComponent(u)}`,
  );
  const uid = idJ.data?.user_id;
  if (!uid) return [];
  const j = await tk<{ data?: { items?: PostIG[] } }>(
    `/instagram/v1/fetch_user_posts?user_id=${encodeURIComponent(uid)}&count=${count}`,
  );
  const arr = j.data?.items ?? [];
  return arr
    .filter((p) => p.code || p.pk)
    .map((p) => {
      const video = p.media_type === 2 || p.product_type === "clips";
      const kodeIg = String(p.code ?? p.pk);
      return {
        kode: `ig_${kodeIg}`,
        platform: "instagram" as const,
        username: u,
        judul: (p.caption?.text ?? "").trim().slice(0, 200),
        caption: (p.caption?.text ?? "").trim(),
        url: `https://www.instagram.com/${video ? "reel" : "p"}/${kodeIg}/`,
        thumbnail_url: p.image_versions2?.candidates?.[0]?.url ?? "",
        waktu_unix: Number(p.taken_at ?? 0),
        jenis: video ? ("video" as const) : ("foto" as const),
      };
    });
}

/** Scrape satu akun sesuai platformnya. */
export async function scrapeAkun(
  platform: string,
  username: string,
  count = 10,
): Promise<PostinganScrape[]> {
  if (platform === "tiktok") return scrapeTikTok(username, count);
  if (platform === "instagram") return scrapeInstagram(username, count);
  return [];
}
