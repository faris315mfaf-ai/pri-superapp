// ============================================================
// CHOCODATA — PEMETAAN ENDPOINT & PENGURAI (13 Sep 2026)
//
// Kontrak dari endpoint reference resmi (chocodata.com/docs):
//   GET https://api.chocodata.com/api/v1/{platform}/{resource}?api_key=…
//   tiktok/video?url=            → stats{plays, likes, comments, shares, saves}
//   youtube/video?url=           → view_count, like_count, duration_seconds
//   instagram/post?shortcode=    → …comments, author, images, taken_at
//   facebook/post?url=           → reactions_count, comments_count, shares_count
//   xtwitter/tweet?id=           → favorite_count, reply_count, …
//   threads                      → BELUM ada endpoint khusus (dilewati)
//
// Nama kolomnya berbeda per platform dan tidak semuanya dijanjikan di
// dokumentasi, jadi pengurai membaca beberapa nama yang lazim untuk tiap
// angka. Yang tidak ada = null, BUKAN 0 — nol berarti benar-benar nol.
//
// Berkas ini murni (tanpa jaringan) supaya bisa diuji.
// ============================================================
import { idVideo } from "@/lib/tautan-video";

export const PLATFORM_CHOCODATA = ["tiktok", "instagram", "youtube", "facebook", "twitter"] as const;
export type PlatformChocodata = (typeof PLATFORM_CHOCODATA)[number];

export function platformDidukungChocodata(p: string): p is PlatformChocodata {
  return (PLATFORM_CHOCODATA as readonly string[]).includes(p.trim().toLowerCase());
}

/** Jalur & parameter permintaan untuk satu video; null bila tidak bisa. */
export function permintaanChocodata(
  platform: string,
  url: string,
): { jalur: string; params: Record<string, string> } | null {
  const p = platform.trim().toLowerCase();
  const u = url.trim();
  switch (p) {
    case "tiktok":
      return u ? { jalur: "/tiktok/video", params: { url: u } } : null;
    case "youtube":
      return u ? { jalur: "/youtube/video", params: { url: u } } : null;
    case "facebook":
      return u ? { jalur: "/facebook/post", params: { url: u } } : null;
    case "instagram": {
      const kode = idVideo("instagram", u);
      return kode ? { jalur: "/instagram/post", params: { shortcode: kode } } : null;
    }
    case "twitter":
    case "x": {
      const id = idVideo("twitter", u);
      return id ? { jalur: "/xtwitter/tweet", params: { id } } : null;
    }
    default:
      return null;
  }
}

export type MetrikChocodata = {
  judul: string;
  thumbnail_url: string;
  akun_username: string;
  nama_akun: string;
  waktu_posting: string | null;
  tayangan: number | null;
  suka: number | null;
  komentar: number | null;
  bagikan: number | null;
  favorit: number | null;
  durasi_detik: number | null;
};

const NAMA = {
  tayangan: ["plays", "play_count", "playCount", "view_count", "views", "viewCount", "video_view_count", "video_views", "impressions"],
  suka: ["likes", "like_count", "likeCount", "digg_count", "diggCount", "favorite_count", "reactions_count", "reactions", "reaction_count"],
  komentar: ["comments", "comment_count", "commentCount", "comments_count", "reply_count", "replies"],
  bagikan: ["shares", "share_count", "shareCount", "shares_count", "retweet_count", "retweets", "reposts", "repost_count"],
  favorit: ["saves", "save_count", "collect_count", "collectCount", "bookmarks", "bookmark_count", "favorites"],
  durasi: ["duration_seconds", "duration", "video_duration", "length_seconds"],
};

/** Tempat angka biasanya bersembunyi (stats/statistics/metrics/…). */
const SARANG = ["stats", "statistics", "metrics", "engagement", "data", "video", "post", "item", "result"];

function angka(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

function cari(blok: Record<string, unknown>, nama: readonly string[], kedalaman = 0): number | null {
  for (const n of nama) {
    if (n in blok) {
      const v = angka(blok[n]);
      if (v !== null) return v;
    }
  }
  if (kedalaman >= 2) return null;
  for (const s of SARANG) {
    const isi = blok[s];
    if (isi && typeof isi === "object" && !Array.isArray(isi)) {
      const v = cari(isi as Record<string, unknown>, nama, kedalaman + 1);
      if (v !== null) return v;
    }
  }
  return null;
}

function teks(blok: Record<string, unknown>, nama: readonly string[], kedalaman = 0): string {
  for (const n of nama) {
    const v = blok[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (kedalaman >= 2) return "";
  for (const s of SARANG) {
    const isi = blok[s];
    if (isi && typeof isi === "object" && !Array.isArray(isi)) {
      const v = teks(isi as Record<string, unknown>, nama, kedalaman + 1);
      if (v) return v;
    }
  }
  return "";
}

function keIso(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000; // detik vs milidetik
    return new Date(ms).toISOString();
  }
  if (typeof v === "string" && v.trim()) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString();
    if (/^\d{9,13}$/.test(v.trim())) return keIso(Number(v.trim()));
  }
  return null;
}

/** Angka & keterangan video dari jawaban Chocodata (platform apa pun). */
export function uraiChocodata(platform: string, jawaban: unknown): MetrikChocodata {
  const kosong: MetrikChocodata = {
    judul: "", thumbnail_url: "", akun_username: "", nama_akun: "", waktu_posting: null,
    tayangan: null, suka: null, komentar: null, bagikan: null, favorit: null, durasi_detik: null,
  };
  if (!jawaban || typeof jawaban !== "object" || Array.isArray(jawaban)) return kosong;
  const d = jawaban as Record<string, unknown>;
  // Chocodata membungkus hasil di "data"/"result" pada beberapa endpoint.
  const b = (["data", "result", "item"].map((k) => d[k]).find((x) => x && typeof x === "object" && !Array.isArray(x)) ??
    d) as Record<string, unknown>;

  const penulis = (b.author ?? b.user ?? b.channel ?? b.page ?? {}) as Record<string, unknown>;
  const akun = typeof penulis === "object" && penulis ? penulis : {};
  const p = platform.trim().toLowerCase();

  // X: "favorite_count" = suka (bukan favorit/simpan) — nama yang menipu.
  const suka =
    p === "twitter" || p === "x"
      ? cari(b, ["favorite_count", "favoriteCount", "likes", "like_count"])
      : cari(b, NAMA.suka);
  const favorit =
    p === "twitter" || p === "x" ? cari(b, ["bookmark_count", "bookmarks"]) : cari(b, NAMA.favorit);

  return {
    judul: teks(b, ["title", "caption", "text", "description", "desc"]).slice(0, 200),
    thumbnail_url: teks(b, ["thumbnail", "thumbnail_url", "cover", "image", "display_url", "poster"]) ||
      (Array.isArray(b.images) && typeof (b.images as unknown[])[0] === "string" ? String((b.images as unknown[])[0]) : ""),
    akun_username: teks(akun as Record<string, unknown>, ["uniqueId", "unique_id", "username", "screen_name", "handle", "id"]),
    nama_akun: teks(akun as Record<string, unknown>, ["nickname", "name", "full_name", "title"]),
    waktu_posting: keIso(b.create_time ?? b.created_at ?? b.taken_at ?? b.publish_date ?? b.timestamp ?? b.date),
    tayangan: cari(b, NAMA.tayangan),
    suka,
    komentar: cari(b, NAMA.komentar),
    bagikan: cari(b, NAMA.bagikan),
    favorit,
    durasi_detik: cari(b, NAMA.durasi),
  };
}

export function adaAngkaChocodata(m: MetrikChocodata): boolean {
  return [m.tayangan, m.suka, m.komentar, m.bagikan, m.favorit].some((v) => v !== null);
}
