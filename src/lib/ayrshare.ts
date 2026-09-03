// ============================================================
// PRI SuperApp — Klien Ayrshare (KHUSUS SISI SERVER)
//
// Ayrshare adalah gerbang unggah ke banyak sosmed sekaligus dan
// sumber angka insight profil. Kuncinya HANYA boleh dipakai di
// API route — sekali diimpor komponen "use client", kunci itu
// ikut terkirim ke ponsel pengguna dan siapa pun bisa memposting
// atas nama akun partai.
// ============================================================

/** Kesalahan konfigurasi (.env belum diisi) — pesan Bahasa Indonesia */
export class AyrshareBelumDiaturError extends Error {}

const DASAR = "https://api.ayrshare.com/api";

/**
 * Profile Key — menunjuk PROFIL mana yang dipakai.
 *
 * Ayrshare memisahkan dua kunci: API Key (milik akun, di header
 * Authorization) dan Profile Key (milik satu profil/brand, di header
 * Profile-Key). Akun TV Rakyat resmi (IG/TikTok/YouTube/Facebook/
 * Threads) bernaung di profil tersendiri, jadi tanpa header ini
 * Ayrshare menjawab dari Primary Profile yang kosong — itulah kenapa
 * insight sempat tidak menemukan satu akun pun.
 */
function profileKey(): string | null {
  return process.env.AYRSHARE_PROFILE_KEY || null;
}

function kunci(): string {
  const k = process.env.AYRSHARE_API_KEY;
  if (!k) {
    throw new AyrshareBelumDiaturError(
      "Ayrshare belum tersambung. Isi AYRSHARE_API_KEY di pengaturan lingkungan.",
    );
  }
  return k;
}

export function ayrshareSiap(): boolean {
  return Boolean(process.env.AYRSHARE_API_KEY);
}

/**
 * Panggil Ayrshare. Melempar Error berbahasa Indonesia bila gagal,
 * dengan pesan asli Ayrshare disisipkan supaya admin tahu apa yang
 * ditolak platform (mis. "video terlalu panjang untuk Reels").
 */
async function panggil<T>(
  jalur: string,
  init: RequestInit & { timeoutMs?: number; kunciProfil?: string | null } = {},
): Promise<T> {
  const { timeoutMs = 60000, kunciProfil, ...sisa } = init;
  const kendali = new AbortController();
  const timer = setTimeout(() => kendali.abort(), timeoutMs);

  try {
    const res = await fetch(`${DASAR}${jalur}`, {
      ...sisa,
      headers: {
        Authorization: `Bearer ${kunci()}`,
        "Content-Type": "application/json",
        // kunciProfil menimpa profil bawaan env (multi-profile 1.17);
        // string kosong = sengaja TANPA Profile-Key (profil utama akun).
        ...(kunciProfil !== undefined
          ? kunciProfil
            ? { "Profile-Key": kunciProfil }
            : {}
          : profileKey()
            ? { "Profile-Key": profileKey()! }
            : {}),
        ...(sisa.headers ?? {}),
      },
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
      const pesan =
        (json as { message?: string })?.message ??
        (json as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
        `Ayrshare menolak permintaan (${res.status})`;
      throw Object.assign(new Error(pesan), { status: res.status });
    }
    return json as T;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Ayrshare tidak menjawab tepat waktu. Coba lagi sebentar.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// Profil & akun tertaut
// ------------------------------------------------------------

export type AkunTertaut = {
  platform: string;
  username: string;
  displayName: string;
  profileUrl: string;
  userImage: string;
};

type BalasanUser = {
  activeSocialAccounts?: string[];
  displayNames?: {
    platform?: string;
    username?: string;
    displayName?: string;
    profileUrl?: string;
    userImage?: string;
  }[];
  monthlyPostCount?: number;
  monthlyApiCalls?: number;
};

export async function ambilAkunTertaut(kunciProfil?: string): Promise<{
  platformAktif: string[];
  akun: AkunTertaut[];
  postBulanIni: number;
}> {
  const d = await panggil<BalasanUser>("/user", {
    method: "GET",
    // 45 dtk (dulu 20): dari Vercel, /user Ayrshare kadang lambat saat
    // cold start — timeout terlalu pendek membuat sinkron menyerah (3 Sep 2026).
    timeoutMs: 45000,
    ...(kunciProfil !== undefined ? { kunciProfil } : {}),
  });
  return {
    platformAktif: d.activeSocialAccounts ?? [],
    akun: (d.displayNames ?? []).map((a) => ({
      platform: (a.platform ?? "").toLowerCase(),
      username: a.username ?? "",
      displayName: a.displayName ?? "",
      profileUrl: a.profileUrl ?? "",
      userImage: a.userImage ?? "",
    })),
    postBulanIni: d.monthlyPostCount ?? 0,
  };
}

// ------------------------------------------------------------
// Insight profil
// ------------------------------------------------------------

export type InsightProfil = {
  platform: string;
  username: string;
  nama: string;
  fotoProfil: string;
  pengikut: number | null;
  mengikuti: number | null;
  jumlahMedia: number | null;
  suka: number | null;
  komentar: number | null;
  jangkauan: number | null;
  tayangan: number | null;
  /** Jumlah dibagikan/share (1 Sep 2026 — dashboard TV Rakyat Nasional). */
  bagikan: number | null;
  /** Kapan Ayrshare terakhir menyegarkan angkanya (ISO) */
  diperbarui: string | null;
  /** Kapan Ayrshare akan menyegarkan lagi (ISO) — dipakai UI & cache */
  berikutnya: string | null;
  /** Catatan dari Ayrshare, mis. data demografi belum tersedia */
  catatan: string[];
};

function angka(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Ambil metrik pertama yang ADA dari beberapa kemungkinan nama kolom.
 *
 * Tiap platform menamai hal yang sama dengan cara berbeda — pengikut
 * bernama followersCount di Instagram/Facebook/Threads, followerCount
 * di TikTok, dan subscriberCount di YouTube. Sebelum ini pemetaannya
 * hanya mengenal nama versi Instagram, sehingga insight TikTok/
 * YouTube/Facebook/Threads tampil kosong padahal datanya ada.
 */
function metrik(a: Record<string, unknown>, ...kandidat: string[]): number | null {
  for (const k of kandidat) {
    const v = angka(a[k]);
    if (v !== null) return v;
  }
  return null;
}

/**
 * Insight satu profil per platform.
 *
 * PENTING soal "realtime": Ayrshare TIDAK mengambil ulang angka dari
 * Instagram setiap kali dipanggil — ia menyegarkan menurut jadwalnya
 * sendiri dan memberi tahu lewat lastUpdated/nextUpdate. Karena itu
 * kedua penanda waktu itu ikut dikembalikan, supaya layar menampilkan
 * "diperbarui pukul sekian" apa adanya, bukan mengaku selalu terkini.
 */
export async function ambilInsight(platform = "instagram"): Promise<InsightProfil | null> {
  const d = await panggil<Record<string, unknown>>("/analytics/social", {
    method: "POST",
    body: JSON.stringify({ platforms: [platform] }),
    timeoutMs: 45000,
  });

  const blok = d[platform] as
    | {
        analytics?: Record<string, unknown>;
        lastUpdated?: string;
        nextUpdate?: string;
        warning?: { message?: string }[];
      }
    | undefined;
  const a = blok?.analytics;
  if (!a) return null;

  return {
    platform,
    // YouTube memakai `title`, Facebook `pageName` — bukan `username`.
    username: String(a.username ?? a.pageName ?? a.title ?? a.name ?? ""),
    nama: String(a.name ?? a.title ?? a.pageName ?? a.username ?? ""),
    fotoProfil: String(a.profilePictureUrl ?? ""),
    // Urutan kandidat = urutan prioritas; lihat komentar metrik().
    pengikut: metrik(a, "followersCount", "followerCount", "subscriberCount", "fanCount"),
    mengikuti: metrik(a, "followsCount", "followingCount"),
    jumlahMedia: metrik(a, "mediaCount", "videoCountTotal", "videoCount"),
    suka: metrik(a, "likeCount", "likeCountTotal", "likes"),
    komentar: metrik(a, "commentsCount", "commentCountTotal", "comments", "replies"),
    jangkauan: metrik(a, "reachCount", "profileViews", "engagedViews", "pagePostEngagements"),
    tayangan: metrik(a, "viewsCount", "viewCountTotal", "viewCount", "views", "pageVideoViews"),
    bagikan: metrik(a, "shareCount", "sharesCount", "shareCountTotal", "shares"),
    diperbarui: blok?.lastUpdated ?? null,
    berikutnya: blok?.nextUpdate ?? null,
    catatan: (blok?.warning ?? [])
      .map((w) => w?.message ?? "")
      .filter((m): m is string => Boolean(m)),
  };
}

// ------------------------------------------------------------
// Unggah
// ------------------------------------------------------------

export type HasilUnggahPlatform = {
  platform: string;
  status: string;
  id: string;
  postUrl: string;
  pesan: string;
};

type BalasanPost = {
  id?: string;
  status?: string;
  postIds?: {
    platform?: string;
    status?: string;
    id?: string;
    postUrl?: string;
    contentIssues?: unknown;
  }[];
  errors?: { platform?: string; message?: string; code?: number }[];
};

/**
 * Unggah satu video ke beberapa platform sekaligus.
 *
 * `caption` boleh berupa string (sama untuk semua) atau objek
 * { default, instagram, twitter, ... } — Ayrshare mendukung teks
 * berbeda per platform dalam SATU permintaan, sehingga batas
 * karakter tiap platform bisa dihormati tanpa mengunggah berkali-kali.
 *
 * Kegagalan sebagian TIDAK dianggap gagal total: platform yang
 * berhasil tetap dikembalikan bersama alasan penolakan platform lain,
 * karena videonya memang sudah tayang di sebagian tempat.
 */
export async function unggahVideo(opsi: {
  videoUrl: string;
  caption: string | Record<string, string>;
  platforms: string[];
  judulYoutube?: string;
  /** Kunci anti-dobel: permintaan ulang dengan kunci sama tidak memposting dua kali */
  idempotencyKey?: string;
  /**
   * Jadwalkan tayang di masa depan (fitur 1.22.x/3). Format WAJIB
   * ISO-8601 Zulu/UTC "YYYY-MM-DDThh:mm:ssZ". Ayrshare sendiri yang
   * menerbitkan pada waktunya — TANPA cron di aplikasi. Kosong = posting
   * langsung seperti biasa.
   */
  scheduleDate?: string;
  /** false untuk media gambar (bawaan true = video). */
  isVideo?: boolean;
  /**
   * URL PUBLIK gambar sampul video (fitur sampul 31 Agu 2026). Dipasang
   * ke platform yang MENDUKUNG sampul: YouTube, Instagram Reels, TikTok,
   * Facebook (parameter Ayrshare `thumbNail`, kontrak per docs resmi).
   * Threads & X tidak punya opsi sampul — dilewati, bukan dipaksakan.
   * Syarat terketat (YouTube): URL berakhiran .png/.jpg/.jpeg, < 2 MB.
   */
  thumbnailUrl?: string;
}): Promise<{ idAyrshare: string; hasil: HasilUnggahPlatform[] }> {
  const badan: Record<string, unknown> = {
    post: opsi.caption,
    platforms: opsi.platforms,
    mediaUrls: [opsi.videoUrl],
    isVideo: opsi.isVideo ?? true,
  };

  if (opsi.idempotencyKey) badan.idempotencyKey = opsi.idempotencyKey;
  // Jadwal tayang (Ayrshare yang menerbitkan nanti).
  if (opsi.scheduleDate) badan.scheduleDate = opsi.scheduleDate;

  const sampul = (opsi.thumbnailUrl ?? "").trim();

  // YouTube menolak unggahan tanpa judul (maks. 100 karakter), dan
  // "shorts: true" meminta YouTube memperlakukannya sebagai Short.
  if (opsi.platforms.includes("youtube")) {
    badan.youTubeOptions = {
      title: (opsi.judulYoutube || "TV Rakyat").slice(0, 100),
      visibility: "public",
      shorts: true,
      // Catatan docs: sampul kustom butuh channel YouTube TERVERIFIKASI;
      // bila belum, video tetap tayang hanya sampulnya tak terpasang.
      ...(sampul ? { thumbNail: sampul } : {}),
    };
  }
  if (sampul) {
    if (opsi.platforms.includes("instagram")) {
      badan.instagramOptions = { thumbNail: sampul };
    }
    if (opsi.platforms.includes("tiktok")) {
      badan.tikTokOptions = { thumbNail: sampul };
    }
    if (opsi.platforms.includes("facebook")) {
      badan.faceBookOptions = { thumbNail: sampul };
    }
  }

  // Batas tunggu HARUS lebih kecil dari maxDuration route pemanggil
  // (tv/unggah = 300 dtk). Dulu 120 dtk sementara maxDuration hanya 60:
  // untuk video lambat (Reels IG + YouTube) fungsi Vercel MATI di detik
  // 60 sebelum Ayrshare menjawab, sehingga status tak pernah jadi
  // "SUDAH DIPROSES" padahal videonya SUDAH tayang — itulah bug "masih
  // ditinjau padahal sudah diunggah". Kini 230 dtk (di bawah 300) memberi
  // Ayrshare waktu menyelesaikan unggahan lambat lalu kode penyimpanan
  // sempat berjalan. Untuk posting terjadwal (scheduleDate) Ayrshare
  // menjawab cepat, jadi batas besar ini tak pernah tersentuh di sana.
  const d = await panggil<BalasanPost>("/post", {
    method: "POST",
    body: JSON.stringify(badan),
    timeoutMs: 230000,
  });

  const hasil: HasilUnggahPlatform[] = (d.postIds ?? []).map((p) => ({
    platform: (p.platform ?? "").toLowerCase(),
    status: p.status ?? "success",
    id: p.id ?? "",
    postUrl: p.postUrl ?? "",
    pesan: "",
  }));

  // Platform yang ditolak tidak muncul di postIds — ambil dari errors
  // supaya admin melihat SEMUA platform yang dipilihnya, bukan hanya
  // yang berhasil (diam soal kegagalan itu yang bikin orang mengira
  // videonya sudah tayang padahal belum).
  for (const e of d.errors ?? []) {
    const platform = (e.platform ?? "").toLowerCase();
    if (!platform) continue;
    hasil.push({
      platform,
      status: "error",
      id: "",
      postUrl: "",
      pesan: e.message ?? "Ditolak platform",
    });
  }

  return { idAyrshare: d.id ?? "", hasil };
}

/**
 * Batalkan / hapus satu postingan Ayrshare berdasarkan id-nya (fitur
 * 1.22.x/3). Dipakai untuk MEMBATALKAN posting terjadwal yang belum
 * tayang — Ayrshare memakai endpoint DELETE /post yang sama untuk
 * postingan biasa maupun terjadwal.
 */
export async function hapusPostingan(idAyrshare: string): Promise<void> {
  await panggil("/post", {
    method: "DELETE",
    body: JSON.stringify({ id: idAyrshare }),
    timeoutMs: 45000,
  });
}

// ------------------------------------------------------------
// Riwayat postingan per platform (insight rinci per konten)
// ------------------------------------------------------------

export type PostinganInsight = {
  id: string;
  teks: string;
  url: string;
  thumbnail: string;
  jenis: string;
  waktu: string | null;
  /** Metrik yang BENAR-BENAR diberikan platform; kosong = tak tersedia */
  metrik: { label: string; nilai: number }[];
};

type BarisRiwayat = Record<string, unknown>;

function teksDari(p: BarisRiwayat): string {
  return String(p.post ?? p.text ?? p.title ?? p.caption ?? "").slice(0, 400);
}

/**
 * Daftar metrik per platform, dengan nama kolom apa adanya dari
 * Ayrshare. Sengaja dipisah per platform: tiap jaringan memberi
 * angka yang berbeda, dan memaksakan satu bentuk seragam hanya
 * akan menampilkan nol untuk hal yang sebenarnya tidak diukur.
 */
const METRIK_PER_PLATFORM: Record<string, [string, string][]> = {
  instagram: [
    ["likeCount", "Suka"],
    ["commentsCount", "Komentar"],
  ],
  tiktok: [
    ["videoViews", "Tayangan"],
    ["likeCount", "Suka"],
    ["commentsCount", "Komentar"],
    ["shareCount", "Dibagikan"],
    ["reach", "Jangkauan"],
    ["favorites", "Disimpan"],
    ["newFollowers", "Pengikut baru"],
    ["averageTimeWatched", "Rata2 tonton (dtk)"],
  ],
  facebook: [
    ["videoViews", "Tayangan video"],
    ["mediaView", "Dilihat"],
    ["likeCount", "Suka"],
    ["commentsCount", "Komentar"],
    ["sharesCount", "Dibagikan"],
  ],
  youtube: [],
  threads: [],
};

/**
 * Ambil postingan terakhir sebuah platform beserta angkanya.
 * `lastRecords` dibatasi supaya satu layar tidak menarik ratusan baris.
 */
export async function ambilRiwayatPostingan(
  platform: string,
  jumlah = 15,
  kunciProfil?: string,
): Promise<PostinganInsight[]> {
  // PENTING — parameter yang benar adalah `limit`, BUKAN `lastRecords`.
  //
  // `lastRecords` diterima Ayrshare tanpa galat tetapi SELALU membalas
  // maksimal 10 postingan berapa pun angkanya. Itu membuat analisis QC
  // hanya pernah melihat 10 postingan per platform: saat diuji, akun
  // Instagram TV Rakyat ternyata memposting 39 kali dalam satu hari,
  // jadi 29 di antaranya tidak pernah masuk perhitungan kepatuhan.
  // Dengan `limit`, jumlah yang diminta benar-benar dikembalikan.
  const batas = Math.min(Math.max(jumlah, 1), 200);
  const d = await panggil<{ posts?: BarisRiwayat[]; history?: BarisRiwayat[] }>(
    `/history/${encodeURIComponent(platform)}?limit=${batas}`,
    { method: "GET", timeoutMs: 45000, ...(kunciProfil !== undefined ? { kunciProfil } : {}) },
  );

  const daftar = d.posts ?? d.history ?? [];
  const petaMetrik = METRIK_PER_PLATFORM[platform] ?? [];

  return daftar.map((p) => ({
    id: String(p.id ?? p.itemId ?? ""),
    teks: teksDari(p),
    url: String(p.postUrl ?? p.shareUrl ?? p.url ?? ""),
    thumbnail: String(p.thumbnailUrl ?? p.fullPicture ?? ""),
    jenis: String(p.mediaProductType ?? p.mediaType ?? p.statusType ?? ""),
    waktu: (p.created as string) ?? (p.timestamp as string) ?? (p.published as string) ?? null,
    metrik: petaMetrik
      .map(([kolom, label]) => ({ label, nilai: angka(p[kolom]) }))
      .filter((m): m is { label: string; nilai: number } => m.nilai !== null),
  }));
}

// ------------------------------------------------------------
// Komentar sebuah postingan (untuk analisis ulang QC)
// ------------------------------------------------------------

export type KomentarPostingan = {
  id: string;
  username: string;
  teks: string;
  waktu: string | null;
};

/**
 * Ambil komentar satu postingan lewat Ayrshare, memakai ID POST ASLI
 * platform (searchPlatformId) — jadi postingan yang tidak diunggah
 * lewat Ayrshare pun tetap bisa dibaca komentarnya, selama akunnya
 * tertaut di profil. Nama field balasan berbeda-beda per platform,
 * maka setiap nilai dibaca lewat daftar kandidat.
 */
export async function ambilKomentarPostingan(
  platform: string,
  idPost: string,
  kunciProfil?: string,
  headerTambahan?: Record<string, string>,
): Promise<KomentarPostingan[]> {
  const d = await panggil<Record<string, unknown>>(
    `/comments/${encodeURIComponent(idPost)}?searchPlatformId=true&platform=${encodeURIComponent(platform)}`,
    {
      method: "GET",
      timeoutMs: 45000,
      ...(kunciProfil !== undefined ? { kunciProfil } : {}),
      // Header ekstra (mis. kredensial X sendiri — sejak 31 Mar 2026
      // Ayrshare mewajibkan kunci API X milik pengguna untuk operasi X).
      ...(headerTambahan ? { headers: headerTambahan } : {}),
    },
  );

  const mentah = d[platform];
  if (!Array.isArray(mentah)) return [];

  return (mentah as Record<string, unknown>[]).map((k) => {
    // Instagram menaruh identitas komentator di from.username (terbukti
    // dari uji langsung); platform lain memakai nama field yang berbeda.
    const dari = k.from as { name?: string; username?: string; id?: string } | undefined;
    return {
      id: String(k.commentId ?? k.id ?? ""),
      username: String(
        k.userName ?? k.username ?? dari?.username ?? k.uniqueId ?? dari?.name ?? "",
      ).trim(),
      teks: String(k.comment ?? k.text ?? k.message ?? "").slice(0, 1000),
      waktu:
        (k.created as string) ??
        (k.timestamp as string) ??
        (k.createdTime as string) ??
        null,
    };
  });
}

// ------------------------------------------------------------
// Profiles API (1.17): buat/hapus profil & halaman penautan sosmed
// white-label — pengguna menautkan akunnya TANPA membuka Ayrshare.
// ------------------------------------------------------------

/** Buat profil Ayrshare baru. profileKey HANYA keluar di sini — simpan! */
export async function buatProfilAyrshare(
  judul: string,
): Promise<{ profileKey: string; refId: string }> {
  const d = await panggil<{ profileKey?: string; refId?: string; status?: string }>(
    "/profiles",
    {
      method: "POST",
      body: JSON.stringify({ title: judul }),
      timeoutMs: 30000,
      kunciProfil: "", // Profiles API selalu memakai kunci UTAMA akun
    },
  );
  if (!d.profileKey) throw new Error("Ayrshare tidak mengembalikan profileKey.");
  return { profileKey: d.profileKey, refId: d.refId ?? "" };
}

/** Hapus profil Ayrshare (akun tertautnya ikut lepas). */
export async function hapusProfilAyrshare(profileKey: string): Promise<void> {
  await panggil("/profiles", {
    method: "DELETE",
    body: JSON.stringify({ profileKey }),
    timeoutMs: 30000,
    kunciProfil: "",
  });
}

/**
 * URL halaman penautan sosmed untuk SATU profil (generateJWT).
 * Butuh dua rahasia dari dashboard Ayrshare (paket Business):
 * AYRSHARE_PRIVATE_KEY (isi berkas .key) dan AYRSHARE_DOMAIN (id-xxxx).
 */
export async function buatTautanHubungkan(profileKey: string): Promise<string> {
  // Env sering menyimpan kunci RSA dengan "\n" literal — kembalikan
  // jadi baris nyata supaya diterima Ayrshare.
  const privateKey = (process.env.AYRSHARE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const domain = process.env.AYRSHARE_DOMAIN ?? "";
  if (!privateKey || !domain) {
    throw Object.assign(
      new Error(
        "Penautan butuh AYRSHARE_PRIVATE_KEY dan AYRSHARE_DOMAIN. Unduh Private Key di dashboard Ayrshare (Account → API Key) lalu isi keduanya di pengaturan lingkungan.",
      ),
      { status: 503, pesanAman: true },
    );
  }
  const d = await panggil<{ url?: string; token?: string }>("/profiles/generateJWT", {
    method: "POST",
    body: JSON.stringify({ profileKey, domain, privateKey, expiresIn: 30 }),
    timeoutMs: 30000,
    kunciProfil: "",
  });
  if (!d.url) throw new Error("Ayrshare tidak mengembalikan URL penautan.");
  return d.url;
}
