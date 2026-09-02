// ============================================================
// Video Terbaik (2 Sep 2026) — leaderboard VIDEO per sosmed berdasarkan
// tayangan / suka / komentar. KHUSUS SISI SERVER.
//
// Sumber angka: TikHub. Diverifikasi empiris 2 Sep 2026:
//   TikTok    → statistics.play_count / digg_count / comment_count / share_count
//   Instagram → play_count / like_count / comment_count
// upload-post (profil anggota) dan Ayrshare hanya memberi angka per
// PROFIL, bukan per video — jadi TikHub satu-satunya sumber per video.
// YouTube / Facebook / Threads / X belum tercakup (tidak ada sumbernya).
//
// Akun yang disapu: akun TV Rakyat pribadi anggota (akun_tvr_user aktif &
// terhubung, platform tiktok/instagram) + akun resmi (akun_wajib aktif).
// Tiap akun disegarkan paling cepat 12 jam sekali, 12 video terbaru per
// akun (TikTok 1 panggilan, Instagram 2) — ±430 panggilan TikHub/hari
// untuk ±145 akun. Hasil di tabel tvr_video_metrik (upsert per kode).
//
// Sapuan memakai pola klaim atomik yang terbukti (tvr_insight_bucket):
// satu pemenang per 15 menit di seluruh instance, maks 6 akun & 20 dtk
// per sapuan, dipicu after() saat seseorang membuka leaderboard video.
// ============================================================
import { supabase } from "@/lib/supabase";
import { scrapeAkun, tikhubSiap } from "@/lib/tikhub";

export const PLATFORM_VIDEO = ["tiktok", "instagram"] as const;
export const METRIK_VIDEO = ["tayangan", "suka", "komentar"] as const;
export type PlatformVideo = (typeof PLATFORM_VIDEO)[number];
export type MetrikVideo = (typeof METRIK_VIDEO)[number];

const BASI_JAM = 12;
const MAKS_AKUN_PER_SAPU = 6;
const MAKS_RESMI_PER_SAPU = 2;
const VIDEO_PER_AKUN = 12;
// 20 dtk + satu panggilan TikHub terlama (25 dtk) tetap < maxDuration 60 dtk.
const ANGGARAN_SAPU_MS = 20_000;
const KUNCI_KLAIM = "video_metrik_bucket";
const INTERVAL_SAPU_MENIT = 15;
let bucketInstance = "";

type Kandidat = {
  sumber: "anggota" | "resmi";
  id: number;
  platform: PlatformVideo;
  username: string;
  user_id: number | null;
  nama: string;
};

/** Segarkan metrik video akun-akun paling basi — dipanggil lewat after(). */
export async function segarkanVideoMetrik(): Promise<void> {
  try {
    if (!tikhubSiap()) return;
    const mulai = Date.now();
    const db = supabase();

    // --- Klaim atomik: satu pemenang per jendela 15 menit ---
    const bucket = String(Math.floor(Date.now() / (INTERVAL_SAPU_MENIT * 60_000)));
    if (bucket === bucketInstance) return;
    await db
      .from("pengaturan_sistem")
      .upsert({ kunci: KUNCI_KLAIM, nilai: "" }, { onConflict: "kunci", ignoreDuplicates: true });
    const { data: klaim } = await db
      .from("pengaturan_sistem")
      .update({ nilai: bucket })
      .eq("kunci", KUNCI_KLAIM)
      .neq("nilai", bucket)
      .select("kunci");
    bucketInstance = bucket;
    if (!klaim || klaim.length === 0) return;

    const batas = new Date(Date.now() - BASI_JAM * 3600_000).toISOString();
    const [{ data: anggota }, { data: resmi }] = await Promise.all([
      db
        .from("akun_tvr_user")
        .select("id, user_id, platform, username, metrik_pada")
        .eq("aktif", true)
        .eq("terhubung", true)
        .in("platform", [...PLATFORM_VIDEO])
        .or(`metrik_pada.is.null,metrik_pada.lt.${batas}`)
        .order("metrik_pada", { ascending: true, nullsFirst: true })
        .limit(MAKS_AKUN_PER_SAPU),
      db
        .from("akun_wajib")
        .select("id, platform, username, nama_akun, metrik_pada")
        .eq("aktif", true)
        .in("platform", [...PLATFORM_VIDEO])
        .or(`metrik_pada.is.null,metrik_pada.lt.${batas}`)
        .order("metrik_pada", { ascending: true, nullsFirst: true })
        .limit(MAKS_RESMI_PER_SAPU),
    ]);

    const ids = [...new Set((anggota ?? []).map((a) => Number(a.user_id)))];
    const namaPer = new Map<number, string>();
    if (ids.length > 0) {
      const { data: u } = await db.from("app_user").select("id, nama").in("id", ids);
      for (const x of u ?? []) namaPer.set(Number(x.id), String(x.nama ?? ""));
    }

    // Akun resmi didahulukan (sedikit, tapi paling dilihat orang).
    const kandidat: Kandidat[] = [
      ...(resmi ?? []).map((r) => ({
        sumber: "resmi" as const,
        id: Number(r.id),
        platform: String(r.platform) as PlatformVideo,
        username: String(r.username ?? ""),
        user_id: null,
        nama: String(r.nama_akun || r.username || ""),
      })),
      ...(anggota ?? []).map((a) => ({
        sumber: "anggota" as const,
        id: Number(a.id),
        platform: String(a.platform) as PlatformVideo,
        username: String(a.username ?? ""),
        user_id: Number(a.user_id),
        nama: namaPer.get(Number(a.user_id)) ?? "",
      })),
    ].slice(0, MAKS_AKUN_PER_SAPU);

    for (const k of kandidat) {
      // Penjaga anggaran total — berhenti jauh sebelum maxDuration.
      if (Date.now() - mulai > ANGGARAN_SAPU_MS) break;
      const kini = new Date().toISOString();
      try {
        const posts = await scrapeAkun(k.platform, k.username, VIDEO_PER_AKUN);
        const baris = posts
          .filter((p) => p.jenis === "video")
          .map((p) => ({
            kode: p.kode,
            platform: k.platform,
            akun_username: k.username,
            user_id: k.user_id,
            nama_akun: k.nama,
            judul: p.judul,
            url: p.url,
            thumbnail_url: p.thumbnail_url,
            waktu_posting: p.waktu_unix > 0 ? new Date(p.waktu_unix * 1000).toISOString() : null,
            tayangan: p.tayangan ?? 0,
            suka: p.suka ?? 0,
            komentar: p.komentar ?? 0,
            bagikan: p.bagikan ?? 0,
            diperbarui_pada: kini,
          }));
        if (baris.length > 0) {
          const { error } = await db.from("tvr_video_metrik").upsert(baris, { onConflict: "kode" });
          if (error) console.error("[video-terbaik] upsert", error.message);
        }
      } catch (e) {
        // Akun tak ditemukan / privat / TikHub lambat — catat saja.
        console.error("[video-terbaik] scrape", k.platform, k.username, e instanceof Error ? e.message : e);
      }
      // metrik_pada dimajukan apa pun hasilnya — akun bermasalah tidak
      // boleh memacetkan antrean (giliran berikutnya 12 jam lagi).
      await db
        .from(k.sumber === "resmi" ? "akun_wajib" : "akun_tvr_user")
        .update({ metrik_pada: kini })
        .eq("id", k.id);
    }
  } catch (e) {
    console.error("[video-terbaik] penyapu:", e);
  }
}

// ------------------------------------------------------------
// Pembacaan leaderboard
// ------------------------------------------------------------

export type VideoTerbaik = {
  kode: string;
  platform: string;
  judul: string;
  url: string;
  thumbnail_url: string;
  nama_akun: string;
  akun_username: string;
  /** null = akun resmi TV Rakyat / akun wajib */
  user_id: string | null;
  avatar_url: string;
  waktu_posting: string | null;
  tayangan: number;
  suka: number;
  komentar: number;
  bagikan: number;
};

export type BalasanVideoTerbaik = {
  platform: PlatformVideo;
  metrik: MetrikVideo;
  hari: number;
  daftar: VideoTerbaik[];
  cakupan: { akun_total: number; akun_tersapu: number; terakhir: string | null };
};

const cache = new Map<string, { isi: BalasanVideoTerbaik; pada: number }>();
const TTL_CACHE_MS = 30_000;

export async function leaderboardVideo(
  platform: PlatformVideo,
  metrik: MetrikVideo,
  hari: number,
): Promise<BalasanVideoTerbaik> {
  const kunci = `${platform}|${metrik}|${hari}`;
  const ada = cache.get(kunci);
  if (ada && Date.now() - ada.pada < TTL_CACHE_MS) return ada.isi;

  const db = supabase();
  let q = db
    .from("tvr_video_metrik")
    .select(
      "kode, platform, judul, url, thumbnail_url, nama_akun, akun_username, user_id, waktu_posting, tayangan, suka, komentar, bagikan",
    )
    .eq("platform", platform)
    .gt(metrik, 0)
    .order(metrik, { ascending: false })
    .limit(20);
  if (hari > 0) {
    q = q.gte("waktu_posting", new Date(Date.now() - hari * 86_400_000).toISOString());
  }
  const [{ data }, { count: total }, { count: tersapu }, { data: terakhir }] = await Promise.all([
    q,
    db
      .from("akun_tvr_user")
      .select("id", { count: "exact", head: true })
      .eq("aktif", true)
      .eq("terhubung", true)
      .in("platform", [...PLATFORM_VIDEO]),
    db
      .from("akun_tvr_user")
      .select("id", { count: "exact", head: true })
      .eq("aktif", true)
      .eq("terhubung", true)
      .in("platform", [...PLATFORM_VIDEO])
      .not("metrik_pada", "is", null),
    db.from("tvr_video_metrik").select("diperbarui_pada").order("diperbarui_pada", { ascending: false }).limit(1),
  ]);

  const ids = [...new Set((data ?? []).map((v) => v.user_id).filter((x) => x != null).map(Number))];
  const avatarPer = new Map<number, string>();
  if (ids.length > 0) {
    const { data: u } = await db.from("app_user").select("id, avatar_url").in("id", ids);
    for (const x of u ?? []) avatarPer.set(Number(x.id), String(x.avatar_url ?? ""));
  }

  const isi: BalasanVideoTerbaik = {
    platform,
    metrik,
    hari,
    daftar: (data ?? []).map((v) => ({
      kode: String(v.kode),
      platform: String(v.platform),
      judul: String(v.judul ?? ""),
      url: String(v.url ?? ""),
      thumbnail_url: String(v.thumbnail_url ?? ""),
      nama_akun: String(v.nama_akun ?? ""),
      akun_username: String(v.akun_username ?? ""),
      user_id: v.user_id == null ? null : String(v.user_id),
      avatar_url: v.user_id == null ? "" : (avatarPer.get(Number(v.user_id)) ?? ""),
      waktu_posting: v.waktu_posting ? String(v.waktu_posting) : null,
      tayangan: Number(v.tayangan ?? 0),
      suka: Number(v.suka ?? 0),
      komentar: Number(v.komentar ?? 0),
      bagikan: Number(v.bagikan ?? 0),
    })),
    cakupan: {
      akun_total: total ?? 0,
      akun_tersapu: tersapu ?? 0,
      terakhir: terakhir?.[0]?.diperbarui_pada ? String(terakhir[0].diperbarui_pada) : null,
    },
  };
  cache.set(kunci, { isi, pada: Date.now() });
  return isi;
}
