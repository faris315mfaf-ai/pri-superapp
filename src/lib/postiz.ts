// ============================================================
// PRI SuperApp — Klien POSTIZ SWAKELOLA (KHUSUS SISI SERVER)
//
// Postiz = pengganti upload-post untuk AKUN SOSMED PRIBADI anggota
// (TV Rakyat Saya). Bedanya besar: upload-post adalah layanan orang
// lain yang kita sewa, Postiz BERJALAN DI VPS KITA SENDIRI. Tidak ada
// kuota profil, tidak ada tagihan bulanan, tidak ada batas yang bisa
// diubah sepihak. Yang kita tukar: kita sendiri yang mengurus
// pembaruan, cadangan, dan kunci OAuth tiap platform.
//
// TV Rakyat OFFICIAL tetap lewat Ayrshare — tidak disentuh sama sekali.
//
// ------------------------------------------------------------------
// PERINGATAN KONTRAK — BACA SEBELUM MENGUBAH BERKAS INI
// ------------------------------------------------------------------
// Bentuk API di bawah ini DITULIS DARI PEMAHAMAN UMUM, BELUM diadu
// dengan server Postiz milik kita. Di proyek ini menebak bentuk data
// layanan luar sudah beberapa kali jadi bug diam (upload-post:
// "video_url" ditolak, "schedule_date" DIABAIKAN diam-diam sehingga
// video terjadwal langsung terbit; TikTok mengirim waktu sebagai unix
// detik sehingga KPI-nya tidak pernah tercatat).
//
// Karena itu ADA SATU LANGKAH WAJIB sebelum berkas ini dipercaya:
//     node alat/postiz-rekam-kontrak.mjs
// Skrip itu menembak instansi Postiz kita sendiri, merekam jawaban
// ASLINYA, lalu memberi tahu baris mana di sini yang perlu diperbaiki.
// Selama laporan itu belum bersih, JANGAN pindahkan anggota mana pun.
//
// Yang murni (bangunMuatan*, baca*) diuji tanpa jaringan lewat
// scratchpad/uji-postiz.mts — itulah bagian yang paling mudah salah
// diam-diam, jadi itu yang dikunci lebih dulu.
// ============================================================

/** Peta platform aplikasi ↔ Postiz. Sama seperti upload-post: "twitter"
 *  kita adalah "x" mereka. Nama Postiz disebut "identifier". */
const KE_POSTIZ: Record<string, string> = {
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  facebook: "facebook",
  twitter: "x",
  threads: "threads",
};
const DARI_POSTIZ: Record<string, string> = Object.fromEntries(
  Object.entries(KE_POSTIZ).map(([app, pz]) => [pz, app]),
);

export const PETA_PLATFORM_POSTIZ: Readonly<Record<string, string>> = KE_POSTIZ;

/** Nama platform versi aplikasi dari identifier Postiz. */
export function keAppPlatform(identifier: string): string {
  const id = String(identifier ?? "").toLowerCase();
  // Postiz punya beberapa varian ber-akhiran, mis. "instagram-standalone"
  // dan "linkedin-page". Yang kita pakai hanya enam, tapi varian tetap
  // dipetakan supaya akun anggota tidak hilang dari daftar hanya karena
  // ia menautkan lewat jalur yang sedikit berbeda.
  const pokok = id.replace(/-(standalone|page|business|professional)$/, "");
  return DARI_POSTIZ[pokok] ?? pokok;
}

export class PostizBelumDiaturError extends Error {
  constructor() {
    super("Postiz belum diatur. Isi POSTIZ_URL dan POSTIZ_API_KEY di pengaturan server.");
    this.name = "PostizBelumDiaturError";
  }
}

/** Postiz siap dipakai? Dua-duanya wajib: alamat DAN kunci. */
export function postizSiap(): boolean {
  return Boolean(process.env.POSTIZ_URL && process.env.POSTIZ_API_KEY);
}

function dasar(): string {
  const u = process.env.POSTIZ_URL;
  if (!u || !process.env.POSTIZ_API_KEY) throw new PostizBelumDiaturError();
  // Alamat di env boleh ditulis dengan atau tanpa garis miring penutup.
  return `${u.replace(/\/+$/, "")}/api/public/v1`;
}

/**
 * Bentuk header Authorization. Postiz memakai kunci MENTAH tanpa kata
 * "Bearer" — tapi ini persis jenis detail yang pernah menipu kami, jadi
 * bisa ditimpa lewat env POSTIZ_AUTH_SKEMA ("bearer") tanpa mengubah
 * kode, kalau perekam kontrak menemukan yang sebaliknya.
 */
export function headerAuthPostiz(kunci: string, skema = process.env.POSTIZ_AUTH_SKEMA): string {
  return String(skema ?? "").toLowerCase() === "bearer" ? `Bearer ${kunci}` : kunci;
}

async function panggil<T>(
  jalur: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 30000, ...sisa } = init;
  const res = await fetch(`${dasar()}${jalur}`, {
    ...sisa,
    headers: {
      Authorization: headerAuthPostiz(process.env.POSTIZ_API_KEY!),
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
    const dariJson =
      (json as { message?: string; error?: string })?.message ??
      (json as { error?: string })?.error ??
      "";
    // Postiz swakelola di belakang Caddy: kalau containernya mati, yang
    // kembali HTML halaman galat, bukan JSON. Potong supaya pesan di
    // layar anggota tidak berisi satu halaman penuh.
    const dariTeks = teks ? teks.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const pesan = dariJson || dariTeks || `Postiz menolak permintaan (${res.status})`;
    throw Object.assign(new Error(pesan), { status: res.status });
  }
  return json as T;
}

// ------------------------------------------------------------
// Akun tertaut ("integrations" dalam istilah Postiz)
// ------------------------------------------------------------

export type AkunPostiz = {
  /** id integrasi — inilah yang dipakai saat mengirim postingan. */
  id: string;
  /** nama platform versi APLIKASI (twitter, bukan x) */
  platform: string;
  /** nama akun yang terbaca di Postiz */
  nama: string;
  foto: string;
  /** true = token akunnya kedaluwarsa / dimatikan; tidak bisa diposting. */
  mati: boolean;
  /** id "customer" Postiz — dipakai memisahkan milik siapa akun ini. */
  pelanggan: string | null;
  /** nama "customer" — inilah yang diketik admin, biasanya nama anggota. */
  pelangganNama: string;
};

/** Ambil id pelanggan dari bentuk yang mungkin: objek {id,name} atau teks. */
function idPelanggan(nilai: unknown): string | null {
  if (!nilai) return null;
  if (typeof nilai === "string") return nilai || null;
  if (typeof nilai === "object") {
    const o = nilai as Record<string, unknown>;
    const id = o.id ?? o.customerId;
    return id ? String(id) : null;
  }
  return null;
}

/** Nama pelanggan bila balasannya berupa objek {id, name}. */
function namaPelanggan(nilai: unknown): string {
  if (nilai && typeof nilai === "object") {
    const o = nilai as Record<string, unknown>;
    return String(o.name ?? o.username ?? "");
  }
  return "";
}

/**
 * Apakah akun ini milik anggota berkunci `kunci`? MURNI.
 *
 * Postiz tidak punya "profil per anggota" seperti upload-post; yang ada
 * adalah label "customer". Admin memberi label itu saat menautkan akun.
 * Pencocokan sengaja longgar pada huruf besar/kecil dan tanda hubung,
 * karena label diketik manusia — "Budi Santoso", "budi-santoso" dan
 * "budi santoso" harus dianggap orang yang sama. Kalau tidak, akun
 * anggota tidak akan pernah ketemu dan gejalanya cuma "daftar kosong".
 */
export function akunMilik(akun: AkunPostiz, kunci: string): boolean {
  const rapi = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const k = rapi(kunci);
  if (!k) return false;
  return rapi(akun.pelanggan ?? "") === k || rapi(akun.pelangganNama) === k;
}

/**
 * Baca daftar integrasi. MURNI — diuji tanpa jaringan.
 * Postiz bisa membalas daftar langsung ATAU membungkusnya; dua-duanya
 * dibaca supaya perbedaan versi tidak bikin daftar akun kosong diam.
 */
export function bacaIntegrasi(mentah: unknown): AkunPostiz[] {
  const wadah = Array.isArray(mentah)
    ? mentah
    : Array.isArray((mentah as { integrations?: unknown[] })?.integrations)
      ? (mentah as { integrations: unknown[] }).integrations
      : Array.isArray((mentah as { data?: unknown[] })?.data)
        ? (mentah as { data: unknown[] }).data
        : [];
  const keluar: AkunPostiz[] = [];
  for (const it of wadah) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const id = String(o.id ?? "");
    if (!id) continue;
    const ident = String(o.identifier ?? o.providerIdentifier ?? o.provider ?? "");
    keluar.push({
      id,
      platform: keAppPlatform(ident),
      nama: String(o.name ?? o.username ?? o.profile ?? ""),
      foto: String(o.picture ?? o.avatar ?? o.profilePicture ?? ""),
      // "disabled" true ATAU token yang sudah direfresh gagal.
      mati: o.disabled === true || o.refreshNeeded === true || o.inBetweenSteps === true,
      pelanggan: idPelanggan(o.customer ?? o.customerId),
      pelangganNama: namaPelanggan(o.customer),
    });
  }
  return keluar;
}

/** GET /integrations/list — akun sosmed yang tertaut di Postiz kita. */
export async function integrasiPostiz(timeoutMs = 20000): Promise<AkunPostiz[]> {
  const d = await panggil<unknown>("/integrations/list", { method: "GET", timeoutMs });
  return bacaIntegrasi(d);
}

// ------------------------------------------------------------
// Mengirim / menjadwalkan postingan
// ------------------------------------------------------------

export type MuatanPostiz = {
  type: "now" | "schedule" | "draft";
  date: string;
  shortLink: boolean;
  tags: unknown[];
  posts: {
    integration: { id: string };
    value: { content: string; id?: string; image?: { id: string }[] }[];
    settings: Record<string, unknown>;
  }[];
};

/**
 * Susun muatan JSON untuk POST /posts. MURNI — diuji tanpa jaringan.
 *
 * Perbedaan penting dari upload-post: di sana satu permintaan memuat
 * DAFTAR platform; di sini satu permintaan memuat daftar INTEGRASI, dan
 * tiap integrasi membawa teksnya sendiri. Itu justru lebih pas dengan
 * fitur "caption per sosmed" yang sudah ada — tidak perlu akal-akalan
 * field `{platform}_title` lagi.
 *
 * `jadwalIso` wajib diisi walau tipe "now": Postiz memakai tanggal itu
 * sebagai waktu tercatatnya postingan.
 */
export function bangunMuatanPostiz(opsi: {
  /** integrasi tujuan: id Postiz + platform versi aplikasi */
  tujuan: { id: string; platform: string }[];
  judul: string;
  caption?: string;
  /** caption KHUSUS per platform (nama versi aplikasi) */
  captionPer?: Record<string, string>;
  /** id berkas hasil unggah ke Postiz (bila videonya sudah diunggah) */
  berkasId?: string;
  jadwalIso: string;
  terjadwal: boolean;
}): MuatanPostiz {
  const judul = opsi.judul.trim();
  const caption = opsi.caption?.trim() ?? "";
  const umum = (caption ? `${judul}\n\n${caption}` : judul).trim();

  return {
    type: opsi.terjadwal ? "schedule" : "now",
    date: opsi.jadwalIso,
    shortLink: false,
    tags: [],
    posts: opsi.tujuan.map((t) => {
      const khusus = opsi.captionPer?.[t.platform]?.trim();
      // Batas karakter tiap platform sudah dijaga di lapisan atas
      // (lib/batas-caption); di sini hanya disalin apa adanya supaya
      // tidak ada DUA tempat yang memotong teks dengan aturan berbeda.
      const isi = khusus || umum || judul || "TV Rakyat";
      return {
        integration: { id: t.id },
        value: [
          {
            content: isi,
            ...(opsi.berkasId ? { image: [{ id: opsi.berkasId }] } : {}),
          },
        ],
        // YouTube menolak postingan tanpa judul; platform lain tidak
        // memakai field ini dan mengabaikannya.
        settings: t.platform === "youtube" ? { title: judul.slice(0, 100) || "TV Rakyat" } : {},
      };
    }),
  };
}

export type HasilPostiz = {
  sukses: boolean;
  /** id grup postingan di Postiz — dipakai memantau & membatalkan. */
  id: string | null;
  mentah: unknown;
};

/** Baca id grup dari balasan POST /posts. MURNI. */
export function bacaIdPost(mentah: unknown): string | null {
  if (!mentah) return null;
  if (Array.isArray(mentah)) {
    const p = mentah.find((x) => x && typeof x === "object");
    return p ? bacaIdPost(p) : null;
  }
  const o = mentah as Record<string, unknown>;
  for (const k of ["group", "id", "postId", "groupId"]) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  if (Array.isArray(o.posts) && o.posts.length) return bacaIdPost(o.posts[0]);
  return null;
}

/** POST /posts — kirim sekarang atau jadwalkan. */
export async function kirimPostPostiz(
  muatan: MuatanPostiz,
  timeoutMs = 120000,
): Promise<HasilPostiz> {
  const d = await panggil<unknown>("/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(muatan),
    timeoutMs,
  });
  return { sukses: true, id: bacaIdPost(d), mentah: d };
}

/**
 * DELETE /posts/{id} — Postiz BISA membatalkan jadwal lewat API.
 * Ini keunggulan nyata atas upload-post, yang menolak pembatalan (405)
 * sehingga aplikasi terpaksa membatalkan dengan cara menghapus berkas
 * videonya. Setelah pindah, akal-akalan itu bisa dibuang.
 */
export async function hapusPostPostiz(id: string, timeoutMs = 20000): Promise<void> {
  await panggil<unknown>(`/posts/${encodeURIComponent(id)}`, { method: "DELETE", timeoutMs });
}

// ------------------------------------------------------------
// Daftar postingan & hasilnya
// ------------------------------------------------------------

export type PostPostiz = {
  id: string;
  /** nama platform versi APLIKASI */
  platform: string;
  integrasiId: string;
  /** QUEUE/PUBLISHED/ERROR/DRAFT — apa adanya dari Postiz */
  status: string;
  /** URL postingan di platform; kosong bila belum terbit. */
  url: string;
  isi: string;
  waktu: string | null;
  galat: string;
};

/** Normalkan waktu ke ISO. Sama alasannya dengan upload-post: bentuknya
 *  berbeda antar sumber, dan Date.parse yang gagal menghasilkan NaN yang
 *  diam — laporan lalu tidak pernah cocok. */
function keIso(nilai: unknown): string | null {
  if (nilai == null) return null;
  if (typeof nilai === "number" || /^\d{9,14}$/.test(String(nilai))) {
    const n = Number(nilai);
    if (!Number.isFinite(n)) return null;
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const t = Date.parse(String(nilai));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Cari URL http pertama pada kunci yang lazim. MURNI. */
function urlDari(o: Record<string, unknown>): string {
  for (const k of ["releaseURL", "releaseUrl", "postUrl", "url", "permalink", "link"]) {
    const v = o[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  }
  return "";
}

/** Baca daftar postingan. MURNI — diuji tanpa jaringan. */
export function bacaDaftarPost(mentah: unknown): PostPostiz[] {
  const wadah = Array.isArray(mentah)
    ? mentah
    : Array.isArray((mentah as { posts?: unknown[] })?.posts)
      ? (mentah as { posts: unknown[] }).posts
      : [];
  const keluar: PostPostiz[] = [];
  for (const it of wadah) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const integ = (o.integration ?? {}) as Record<string, unknown>;
    const ident = String(integ.providerIdentifier ?? integ.identifier ?? o.providerIdentifier ?? "");
    keluar.push({
      id: String(o.id ?? ""),
      platform: keAppPlatform(ident),
      integrasiId: String(integ.id ?? o.integrationId ?? ""),
      status: String(o.state ?? o.status ?? "").toUpperCase(),
      url: urlDari(o),
      isi: String(o.content ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300),
      waktu: keIso(o.publishDate ?? o.createdAt ?? o.date),
      galat: String(o.error ?? "").slice(0, 300),
    });
  }
  return keluar;
}

/** Platform yang dinyatakan GAGAL dalam sekumpulan postingan. MURNI. */
export function gagalDariPost(daftar: PostPostiz[]): { platform: string; pesan: string }[] {
  return daftar
    .filter((p) => p.status === "ERROR" || (p.galat && p.status !== "PUBLISHED"))
    .map((p) => ({ platform: p.platform, pesan: p.galat || `Postiz gagal menerbitkan ke ${p.platform}` }));
}

/** GET /posts?startDate=&endDate= — riwayat dalam satu rentang. */
export async function daftarPostPostiz(
  mulaiIso: string,
  sampaiIso: string,
  opsi: { pelanggan?: string; timeoutMs?: number } = {},
): Promise<PostPostiz[]> {
  const q = new URLSearchParams({ startDate: mulaiIso, endDate: sampaiIso });
  if (opsi.pelanggan) q.set("customer", opsi.pelanggan);
  const d = await panggil<unknown>(`/posts?${q.toString()}`, {
    method: "GET",
    timeoutMs: opsi.timeoutMs ?? 25000,
  });
  return bacaDaftarPost(d);
}

// ------------------------------------------------------------
// Berkas video
// ------------------------------------------------------------

/** Baca id berkas dari balasan unggah. MURNI. */
export function bacaIdBerkas(mentah: unknown): string | null {
  if (!mentah || typeof mentah !== "object") return null;
  const o = mentah as Record<string, unknown>;
  for (const k of ["id", "fileId", "path"]) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

/**
 * POST /upload — titipkan berkas video ke Postiz.
 *
 * Videonya diambil dulu dari bucket aplikasi lalu diteruskan. Berbeda
 * dengan upload-post yang mau menerima URL, Postiz menyimpan medianya
 * sendiri. Konsekuensinya nyata: berkas 50 MB melewati server kita dua
 * kali. Karena itu jalur ini dibatasi timeout longgar dan HANYA dipakai
 * dari container VPS (yang sekamar dengan Postiz), bukan dari fungsi
 * tanpa-server yang berumur pendek.
 */
export async function unggahBerkasPostiz(
  videoUrl: string,
  namaBerkas = "video.mp4",
  timeoutMs = 180000,
): Promise<string | null> {
  const unduh = await fetch(videoUrl, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!unduh.ok) throw new Error(`Video tidak bisa diambil dari penyimpanan (${unduh.status}).`);
  const blob = await unduh.blob();
  const form = new FormData();
  form.set("file", blob, namaBerkas);
  const d = await panggil<unknown>("/upload", { method: "POST", body: form, timeoutMs });
  return bacaIdBerkas(d);
}
