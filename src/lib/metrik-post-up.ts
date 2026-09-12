// ============================================================
// METRIK PER POSTINGAN DARI UPLOAD-POST (12–13 Sep 2026)
//
// Sumber pasti (openapi.json resmi upload-post): satu baris per
// postingan dari /uploadposts/post-analytics/cached, dengan `metrics`
// yang KUNCINYA BERBEDA PER PLATFORM — YouTube: views, likes, comments,
// favorites; TikTok menambah reach, favorites, profile_views, dst.
//
// Pengurai membaca beberapa nama yang lazim untuk tiap angka dan
// mengembalikan bentuk seragam. Angka yang tidak ada = null (tidak
// diketahui), BUKAN 0. Kunci mentahnya ikut dibawa utuh: kalau ada
// angka yang tidak dikenali pengurai, ia tetap bisa dilihat di layar,
// bukan hilang diam-diam.
//
// Berkas ini murni (tanpa jaringan/database) supaya bisa diuji.
// ============================================================
import { idVideo } from "@/lib/tautan-video";

export type MetrikPost = {
  suka: number | null;
  komentar: number | null;
  bagikan: number | null;
  tayangan: number | null;
  impresi: number | null;
  jangkauan: number | null;
  simpan: number | null;
  post_url: string;
};

export const KUNCI_METRIK_POST = ["suka", "komentar", "bagikan", "tayangan", "impresi", "jangkauan", "simpan"] as const;
export type KunciMetrikPost = (typeof KUNCI_METRIK_POST)[number];

/** Nama-nama yang lazim dipakai upload-post & sosmed asalnya, per angka. */
const NAMA: Record<KunciMetrikPost, string[]> = {
  suka: ["like_count", "likes", "likes_count", "digg_count", "favorite_count", "reactions", "reaction_count", "total_likes"],
  komentar: ["comment_count", "comments", "comments_count", "reply_count", "total_comments"],
  bagikan: ["share_count", "shares", "shares_count", "reposts", "repost_count", "retweets", "retweet_count", "total_shares"],
  tayangan: ["view_count", "views", "views_count", "play_count", "video_views", "plays", "total_views", "video_view_count"],
  impresi: ["impressions", "impression_count", "impressions_count", "total_impressions"],
  jangkauan: ["reach", "reach_count", "unique_viewers", "unique_views", "total_reach"],
  // "favorites" = istilah upload-post untuk TikTok/YouTube (simpan/bookmark).
  simpan: ["save_count", "saves", "saved", "favorites", "favourites", "bookmarks", "bookmark_count", "collect_count"],
};

/** Semua nama yang sudah dipetakan — sisanya = "angka lain" yang tetap ditampilkan. */
const SEMUA_NAMA_DIKENAL = new Set(Object.values(NAMA).flat());

/** Tempat angka biasanya bersembunyi di dalam satu blok platform. */
const SARANG = ["metrics", "analytics", "stats", "statistics", "insights", "data", "post", "engagement"];

function angka(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

function cariAngka(blok: Record<string, unknown>, nama: string[], kedalaman = 0): number | null {
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
      const v = cariAngka(isi as Record<string, unknown>, nama, kedalaman + 1);
      if (v !== null) return v;
    }
  }
  return null;
}

function cariUrl(blok: Record<string, unknown>, kedalaman = 0): string {
  for (const k of ["post_url", "url", "permalink", "share_url", "link", "video_url"]) {
    const v = blok[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  }
  if (kedalaman >= 2) return "";
  for (const s of SARANG) {
    const isi = blok[s];
    if (isi && typeof isi === "object" && !Array.isArray(isi)) {
      const u = cariUrl(isi as Record<string, unknown>, kedalaman + 1);
      if (u) return u;
    }
  }
  return "";
}

/** Urai SATU blok platform menjadi bentuk seragam. */
export function uraiMetrikPost(blok: unknown): MetrikPost {
  const kosong: MetrikPost = {
    suka: null, komentar: null, bagikan: null, tayangan: null, impresi: null, jangkauan: null, simpan: null, post_url: "",
  };
  if (!blok || typeof blok !== "object" || Array.isArray(blok)) return kosong;
  const b = blok as Record<string, unknown>;
  if (b.success === false || b.error) return kosong;
  return {
    suka: cariAngka(b, NAMA.suka),
    komentar: cariAngka(b, NAMA.komentar),
    bagikan: cariAngka(b, NAMA.bagikan),
    tayangan: cariAngka(b, NAMA.tayangan),
    impresi: cariAngka(b, NAMA.impresi),
    jangkauan: cariAngka(b, NAMA.jangkauan),
    simpan: cariAngka(b, NAMA.simpan),
    post_url: cariUrl(b),
  };
}

/**
 * Angka LAIN di blok metrics yang tidak masuk tujuh kolom baku (mis.
 * profile_views, full_video_watched_rate) — hanya yang bernilai angka,
 * kunci tingkat atas saja.
 */
export function angkaLain(metrics: Record<string, unknown>): Record<string, number> {
  const hasil: Record<string, number> = {};
  for (const [k, v] of Object.entries(metrics)) {
    if (SEMUA_NAMA_DIKENAL.has(k)) continue;
    const n = angka(v);
    if (n !== null) hasil[k] = n;
  }
  return hasil;
}

/**
 * Urai SELURUH jawaban post-analytics gaya lama → per platform. Masih
 * dipakai untuk membaca metrik_mentah yang bentuknya objek per platform.
 */
export function uraiJawabanPostAnalytics(
  jawaban: unknown,
  keApp: (namaUp: string) => string,
): Record<string, MetrikPost> {
  const hasil: Record<string, MetrikPost> = {};
  if (!jawaban || typeof jawaban !== "object") return hasil;
  const d = jawaban as Record<string, unknown>;
  const wadah = (d.platforms ?? d.results ?? d.data ?? d) as unknown;
  if (Array.isArray(wadah)) {
    for (const item of wadah as Record<string, unknown>[]) {
      const nama = String(item?.platform ?? "");
      if (nama) hasil[keApp(nama.toLowerCase())] = uraiMetrikPost(item);
    }
  } else if (wadah && typeof wadah === "object") {
    for (const [nama, isi] of Object.entries(wadah as Record<string, unknown>)) {
      if (isi && typeof isi === "object" && !Array.isArray(isi)) {
        const m = uraiMetrikPost(isi);
        if (adaAngka(m) || m.post_url) hasil[keApp(nama.toLowerCase())] = m;
      }
    }
  }
  return hasil;
}

export function adaAngka(m: MetrikPost): boolean {
  return KUNCI_METRIK_POST.some((k) => m[k] !== null);
}

export type TotalMetrikPost = Record<KunciMetrikPost, number> & { platform_terukur: number };

/** Jumlahkan banyak blok platform (null dilewati, bukan dianggap nol). */
export function jumlahkanMetrikPost(daftar: MetrikPost[]): TotalMetrikPost {
  const t: TotalMetrikPost = {
    suka: 0, komentar: 0, bagikan: 0, tayangan: 0, impresi: 0, jangkauan: 0, simpan: 0, platform_terukur: 0,
  };
  for (const m of daftar) {
    if (!adaAngka(m)) continue;
    t.platform_terukur += 1;
    for (const k of KUNCI_METRIK_POST) {
      const v = m[k];
      if (v !== null) t[k] += v;
    }
  }
  return t;
}

/** Angka yang sudah lewat 6 jam layak ditarik lagi. */
export const BASI_METRIK_MS = 6 * 60 * 60_000;

export function metrikBasi(metrikPada: string | null | undefined, kini = Date.now()): boolean {
  if (!metrikPada) return true;
  const t = Date.parse(metrikPada);
  return !Number.isFinite(t) || kini - t > BASI_METRIK_MS;
}

// ============================================================
// MENCOCOKKAN postingan dari upload-post ↔ unggahan di aplikasi
// ============================================================

/** Satu postingan dari /post-analytics/cached (sudah dinormalkan nama platformnya). */
export type PostCached = {
  post_id: string;
  platform: string;
  post_url: string;
  captured_at: string | null;
  upload_timestamp: string | null;
  metrics: Record<string, unknown>;
};

/** Tautan satu unggahan aplikasi di satu platform (dari laporan_video). */
export type TautanUnggahan = { tvrku_post_id: string; platform: string; url_video: string };

/** Angka satu platform untuk satu unggahan — bentuk yang disimpan di tvrku_post.metrik. */
export type MetrikPostTerurai = MetrikPost & {
  post_id: string;
  captured_at: string | null;
  /** Angka lain yang tidak masuk tujuh kolom baku — tetap ditampilkan. */
  lain: Record<string, number>;
  /** metrics mentah dari upload-post, apa adanya. */
  mentah: Record<string, unknown>;
};

/** Kunci pencocokan: platform + ID video dari URL (bentuk URL boleh beda). */
export function kunciTautan(platform: string, url: string): string {
  const p = platform.trim().toLowerCase();
  const id = idVideo(p, url);
  return `${p}:${id ?? url.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "")}`;
}

/**
 * Petakan postingan upload-post ke unggahan aplikasi. Kembali:
 * Map<tvrku_post_id, { [platform]: MetrikPostTerurai }>.
 *
 * Pencocokan lewat ID video di post_url (bukan teks URL, yang bentuknya
 * bisa berbeda antara yang disimpan aplikasi dan yang dikembalikan
 * upload-post). Bila upload-post memberi baris ganda untuk postingan
 * yang sama (rekaman harian), yang captured_at-nya paling baru menang.
 */
export function petakanPostCached(
  posts: PostCached[],
  tautan: TautanUnggahan[],
): Map<string, Record<string, MetrikPostTerurai>> {
  const perKunci = new Map<string, PostCached>();
  for (const p of posts) {
    if (!p.post_url) continue;
    const k = kunciTautan(p.platform, p.post_url);
    const ada = perKunci.get(k);
    if (!ada || (p.captured_at ?? "") > (ada.captured_at ?? "")) perKunci.set(k, p);
  }
  const hasil = new Map<string, Record<string, MetrikPostTerurai>>();
  for (const t of tautan) {
    const p = perKunci.get(kunciTautan(t.platform, t.url_video));
    if (!p) continue;
    const m = uraiMetrikPost(p.metrics);
    const isi = hasil.get(t.tvrku_post_id) ?? {};
    isi[t.platform.toLowerCase()] = {
      ...m,
      post_url: m.post_url || p.post_url,
      post_id: p.post_id,
      captured_at: p.captured_at,
      lain: angkaLain(p.metrics),
      mentah: p.metrics,
    };
    hasil.set(t.tvrku_post_id, isi);
  }
  return hasil;
}
