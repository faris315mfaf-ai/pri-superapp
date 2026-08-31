// ============================================================
// PRI SuperApp — Klien upload-post (KHUSUS SISI SERVER)
//
// upload-post = gerbang posting + analitik untuk AKUN SOSMED PRIBADI
// anggota (rombakan TV Rakyat Saya, 31 Agu 2026). Satu anggota = satu
// PROFIL upload-post (kuota paket business: 225 profil); tiap profil
// menautkan 6 akun: instagram, tiktok, youtube, facebook (page), x,
// threads. TV Rakyat OFFICIAL tetap lewat Ayrshare — dua dunia ini
// SENGAJA dipisah (keputusan user).
//
// Kontrak API (DIVERIFIKASI langsung ke api.upload-post.com, 31 Agu):
//   Auth   : "Authorization: Apikey <UPLOAD_POST_API_KEY>"
//   Profil : GET  /api/uploadposts/users            → {profiles[], limit, plan}
//            POST /api/uploadposts/users {username}
//            DELETE /api/uploadposts/users {username}
//   Tautan : POST /api/uploadposts/users/generate-jwt {username}
//            → {access_url} (halaman penautan, berlaku 48 jam)
//   Unggah : POST /api/upload (multipart form-data)
//            field: user, platform[] (boleh berulang), title, caption,
//            video_url ATAU video, schedule_date (ISO 8601, opsional)
//            → validasi per platform jelas ("has no X account configured")
//   Insight: GET /api/analytics/{username}?platforms=a,b,c
//            → objek per platform (akun tak tertaut = {success:false, silent})
//
// Kunci HANYA dari env UPLOAD_POST_API_KEY — pernah tertulis di chat,
// sarankan regenerate di dashboard upload-post bila tersedia.
// ============================================================

const DASAR = "https://api.upload-post.com/api";

/** Peta platform aplikasi ↔ upload-post ("twitter" kita = "x" mereka). */
const KE_UP: Record<string, string> = {
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  facebook: "facebook",
  twitter: "x",
  threads: "threads",
};
const DARI_UP: Record<string, string> = Object.fromEntries(
  Object.entries(KE_UP).map(([app, up]) => [up, app]),
);

export class UploadPostBelumDiaturError extends Error {
  constructor() {
    super("upload-post belum diatur. Isi UPLOAD_POST_API_KEY di pengaturan server.");
    this.name = "UploadPostBelumDiaturError";
  }
}

export function uploadPostSiap(): boolean {
  return Boolean(process.env.UPLOAD_POST_API_KEY);
}

function kunci(): string {
  const k = process.env.UPLOAD_POST_API_KEY;
  if (!k) throw new UploadPostBelumDiaturError();
  return k;
}

async function panggil<T>(
  jalur: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 30000, ...sisa } = init;
  const res = await fetch(`${DASAR}${jalur}`, {
    ...sisa,
    headers: {
      Authorization: `Apikey ${kunci()}`,
      ...(sisa.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
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
      `upload-post menolak permintaan (${res.status})`;
    throw Object.assign(new Error(pesan), { status: res.status });
  }
  return json as T;
}

// ------------------------------------------------------------
// Profil
// ------------------------------------------------------------

export type ProfilUp = {
  username: string;
  /** platform (nama APLIKASI: twitter, bukan x) → username akun tertaut */
  akun: Record<string, string>;
  dibuat: string;
};

type BalasanUsers = {
  profiles?: {
    username?: string;
    social_accounts?: Record<string, unknown>;
    created_at?: string;
  }[];
  limit?: number;
  plan?: string;
};

function petaAkun(social: Record<string, unknown> | undefined): Record<string, string> {
  const hasil: Record<string, string> = {};
  for (const [kunciUp, nilai] of Object.entries(social ?? {})) {
    const app = DARI_UP[kunciUp] ?? kunciUp;
    // Bentuk NYATA balasan upload-post (diverifikasi 31 Agu 2026):
    //   "tiktok": ""                                  → BELUM tertaut
    //   "youtube": { display_name, handle, ... }       → tertaut
    // Kuncinya `handle` (mis. "@channel") / `display_name` — BUKAN
    // `username`. Salah baca di sini membuat SEMUA akun terbaca kosong
    // (bug nyata: Insight menampilkan YouTube, tapi menu Unggah bilang
    // "belum ada akun tertaut"). `username` tetap diterima untuk jaga-jaga.
    const o = (typeof nilai === "object" && nilai ? nilai : {}) as {
      handle?: string;
      display_name?: string;
      username?: string;
    };
    const uname =
      typeof nilai === "string"
        ? nilai
        : String(o.handle ?? o.display_name ?? o.username ?? "");
    // Buang "@" di depan supaya seragam dengan akun_tvr_user.
    const bersih = uname.trim().replace(/^@+/, "");
    if (bersih) hasil[app] = bersih;
  }
  return hasil;
}

/** Semua profil + kuota. */
export async function daftarProfilUp(): Promise<{
  profil: ProfilUp[];
  kuota: number;
  paket: string;
}> {
  const d = await panggil<BalasanUsers>("/uploadposts/users", { method: "GET" });
  return {
    profil: (d.profiles ?? []).map((p) => ({
      username: String(p.username ?? ""),
      akun: petaAkun(p.social_accounts),
      dibuat: String(p.created_at ?? ""),
    })),
    kuota: Number(d.limit ?? 0),
    paket: String(d.plan ?? ""),
  };
}

/** Buat profil baru (username unik, huruf kecil/angka/strip). */
export async function buatProfilUp(username: string): Promise<void> {
  await panggil("/uploadposts/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
}

export async function hapusProfilUp(username: string): Promise<void> {
  await panggil("/uploadposts/users", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
}

/** URL halaman penautan akun (berlaku 48 jam) untuk satu profil. */
export async function tautanHubungkanUp(username: string): Promise<string> {
  const d = await panggil<{ access_url?: string }>("/uploadposts/users/generate-jwt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!d.access_url) throw new Error("upload-post tidak memberi tautan penautan.");
  return d.access_url;
}

/** Akun tertaut satu profil (nama platform versi APLIKASI). */
export async function akunTertautUp(username: string): Promise<Record<string, string>> {
  const { profil } = await daftarProfilUp();
  const p = profil.find((x) => x.username === username);
  return p?.akun ?? {};
}

// ------------------------------------------------------------
// Unggah
// ------------------------------------------------------------

export type HasilUnggahUp = {
  sukses: boolean;
  /** Jawaban mentah per platform (disimpan apa adanya di tvrku_post.hasil) */
  mentah: Record<string, unknown>;
  request_id: string | null;
};

/**
 * Unggah satu video ke platform terpilih milik SATU profil anggota.
 * Video diserahkan sebagai URL publik (bucket tvrku) — bukan multipart
 * berkas — supaya fungsi server tidak menelan ratusan MB.
 * scheduleDate ISO 8601 = biarkan upload-post yang menerbitkan nanti.
 */
export async function unggahVideoUp(opsi: {
  profil: string;
  videoUrl: string;
  judul: string;
  caption?: string;
  /** Nama platform versi APLIKASI (twitter, bukan x). */
  platforms: string[];
  scheduleDate?: string;
}): Promise<HasilUnggahUp> {
  const form = new FormData();
  form.set("user", opsi.profil);
  form.set("title", opsi.judul.slice(0, 100) || "TV Rakyat");
  if (opsi.caption?.trim()) form.set("caption", opsi.caption.trim().slice(0, 2200));
  form.set("video_url", opsi.videoUrl);
  for (const p of opsi.platforms) {
    form.append("platform[]", KE_UP[p] ?? p);
  }
  if (opsi.scheduleDate) form.set("schedule_date", opsi.scheduleDate);

  const d = await panggil<Record<string, unknown>>("/upload", {
    method: "POST",
    body: form,
    // Posting multi-platform bisa lama (server mereka mengunduh video).
    timeoutMs: 180000,
  });
  return {
    sukses: (d as { success?: boolean }).success !== false,
    mentah: d,
    request_id: String((d as { request_id?: string }).request_id ?? "") || null,
  };
}

// ------------------------------------------------------------
// Insight
// ------------------------------------------------------------

// ------------------------------------------------------------
// Daftar postingan (untuk KPI OTOMATIS)
// ------------------------------------------------------------

export type PostinganUp = {
  id: string;
  /** URL asli postingan di platform — inilah yang dicatat sebagai laporan. */
  permalink: string;
  caption: string;
  jenis: string;
  /** SELALU ISO string (sudah dinormalkan), atau null bila tak terbaca. */
  waktu: string | null;
};

/**
 * Normalkan `timestamp` upload-post ke ISO. WAJIB: bentuknya BERBEDA
 * antar platform (diverifikasi 31 Agu 2026) —
 *   TikTok    : 1788123600            (unix DETIK, angka/teks)
 *   Threads/FB: "2026-08-30T16:19:31+0000"
 *   X         : "2026-08-30T21:00:01.000Z"
 *   YouTube   : "2026-01-07T08:47:40Z"
 * Tanpa ini, Date.parse("1788123600") = NaN dan postingan TikTok tak
 * pernah cocok → KPI TikTok diam-diam tidak pernah tercatat.
 */
function keIso(nilai: unknown): string | null {
  if (nilai == null) return null;
  if (typeof nilai === "number" || /^\d{9,14}$/.test(String(nilai))) {
    const n = Number(nilai);
    if (!Number.isFinite(n)) return null;
    // < 1e12 = detik (bukan milidetik).
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const t = Date.parse(String(nilai));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Postingan terbaru satu profil pada satu platform.
 * Kontrak diverifikasi 31 Agu 2026:
 *   GET /uploadposts/media?platform=<up>&user=<profil>&limit=N
 *   → { success, media:[{id, caption, media_type, media_url, permalink, timestamp}] }
 * Dipakai merekonsiliasi unggahan aplikasi → laporan_video (KPI otomatis),
 * karena URL postingan baru tersedia SETELAH platform selesai menerbitkan.
 */
export async function postinganTerbaruUp(
  profil: string,
  platformApp: string,
  limit = 5,
): Promise<PostinganUp[]> {
  const up = KE_UP[platformApp] ?? platformApp;
  const d = await panggil<{ media?: Record<string, unknown>[] }>(
    `/uploadposts/media?platform=${encodeURIComponent(up)}&user=${encodeURIComponent(profil)}&limit=${Math.min(Math.max(limit, 1), 25)}`,
    { method: "GET", timeoutMs: 20000 },
  );
  return (d.media ?? []).map((m) => ({
    id: String(m.id ?? ""),
    permalink: String(m.permalink ?? m.media_url ?? ""),
    caption: String(m.caption ?? "").slice(0, 300),
    jenis: String(m.media_type ?? ""),
    waktu: keIso(m.timestamp),
  }));
}

/**
 * Analitik satu profil untuk platform terpilih (bawaan: keenamnya).
 * Balasan per platform disimpan apa adanya; akun yang belum tertaut
 * berisi {success:false, silent:true} — biarkan UI yang menyaring.
 */
export async function analitikProfilUp(
  username: string,
  platformsApp?: string[],
): Promise<Record<string, unknown>> {
  const daftar = (platformsApp ?? Object.keys(KE_UP)).map((p) => KE_UP[p] ?? p);
  return panggil<Record<string, unknown>>(
    `/analytics/${encodeURIComponent(username)}?platforms=${daftar.join(",")}`,
    { method: "GET", timeoutMs: 45000 },
  );
}
