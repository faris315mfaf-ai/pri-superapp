// ============================================================
// METRIK PER POSTINGAN DARI UPLOAD-POST (12 Sep 2026)
//
// Jawaban /uploadposts/post-analytics/{request_id} memuat blok per
// platform. Bentuk pastinya milik upload-post dan bisa berbeda antar
// platform (TikTok memakai play_count, Instagram views, YouTube
// view_count…). Pengurai ini membaca BEBERAPA nama yang lazim untuk tiap
// angka, dan mengembalikan bentuk seragam untuk aplikasi.
//
// Prinsipnya: angka yang tidak ditemukan = null (tidak diketahui),
// BUKAN 0. Nol berarti "benar-benar tidak ada yang menyukai"; null
// berarti "upload-post tidak memberi angka ini untuk platform ini". Dua
// hal itu tidak boleh tampak sama di layar.
//
// Berkas ini murni (tanpa jaringan/database) supaya bisa diuji.
// ============================================================

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
  simpan: ["save_count", "saves", "saved", "bookmarks", "bookmark_count", "collect_count"],
};

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
 * Urai SELURUH jawaban post-analytics → per platform (nama platform
 * versi aplikasi). Jawaban upload-post kadang berupa daftar berkunci
 * "platform", kadang objek berkunci nama platform; keduanya diterima.
 * `keApp` menerjemahkan nama upload-post ("x" → "twitter", dst.).
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
        // Kunci bukan-platform (mis. "request_id", "status") tidak punya
        // angka apa pun — lolos sebagai blok kosong dan dibuang di bawah.
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
