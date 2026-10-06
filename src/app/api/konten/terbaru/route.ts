// GET /api/konten/terbaru?halaman=N — feed "Video terbaru TV Rakyat" modul
// Konten (7 Okt 2026). Sumbernya KATALOG upload-post (tvr_video_metrik,
// diisi cron segar-metrik-video), bukan Ayrshare: video seluruh akun TV
// Rakyat anggota, terbaru dulu, lengkap dengan tayangan/suka/komentar.
// Halaman 1 juga membawa ringkasan 24 jam (v_tvr_ringkasan_24j, sql/63).
//
// Cache mikro per instance 60 dtk per halaman — ratusan anggota membuka
// Konten bersamaan cukup satu kueri.
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

const PER_HALAMAN = 24;
const MAKS_HALAMAN = 20;
const TTL_MS = 60_000;

type VideoTerbaru = {
  id: string;
  platform: string;
  url: string;
  thumbnail: string;
  judul: string;
  waktu: string | null;
  tayangan: number;
  suka: number;
  komentar: number;
  akun: { user_id: string; nama: string; avatar_url: string; username: string };
};
type Ringkasan = { video: number; tayangan: number; suka: number; akun: number };
type Hasil = { data: VideoTerbaru[]; ada_lagi: boolean; ringkasan?: Ringkasan | null };

const cache = new Map<number, { isi: Hasil; pada: number }>();

async function muat(halaman: number): Promise<Hasil> {
  const db = supabase();
  const awal = (halaman - 1) * PER_HALAMAN;
  const [{ data: baris, error }, ringkasan] = await Promise.all([
    db
      .from("tvr_video_metrik")
      .select("kode, platform, url, thumbnail_url, judul, waktu_posting, tayangan, suka, komentar, user_id, akun_username")
      .not("user_id", "is", null)
      .not("waktu_posting", "is", null)
      .neq("thumbnail_url", "")
      .order("waktu_posting", { ascending: false })
      .range(awal, awal + PER_HALAMAN), // +1 baris untuk tahu masih ada lanjutan
    halaman === 1
      ? db.from("v_tvr_ringkasan_24j").select("video, tayangan, suka, akun").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error) throw new Error("Video terbaru gagal dimuat.");
  const daftar = (baris ?? []).slice(0, PER_HALAMAN);

  const id = [...new Set(daftar.map((b) => Number(b.user_id)))];
  const { data: orang } = id.length
    ? await db.from("app_user").select("id, nama, avatar_url").in("id", id)
    : { data: [] as { id: number; nama: string; avatar_url: string | null }[] };
  const peta = new Map((orang ?? []).map((o) => [String(o.id), o]));

  const r = ringkasan.data as Ringkasan | null;
  return {
    data: daftar.map((b) => {
      const o = peta.get(String(b.user_id));
      return {
        id: String(b.kode),
        platform: String(b.platform ?? ""),
        url: String(b.url ?? ""),
        thumbnail: String(b.thumbnail_url ?? ""),
        judul: String(b.judul ?? "").trim().slice(0, 200),
        waktu: b.waktu_posting ? String(b.waktu_posting) : null,
        tayangan: Number(b.tayangan) || 0,
        suka: Number(b.suka) || 0,
        komentar: Number(b.komentar) || 0,
        akun: { user_id: String(b.user_id), nama: String(o?.nama ?? ""), avatar_url: String(o?.avatar_url ?? ""), username: String(b.akun_username ?? "") },
      };
    }),
    ada_lagi: (baris ?? []).length > PER_HALAMAN && halaman < MAKS_HALAMAN,
    ...(halaman === 1
      ? { ringkasan: r ? { video: Number(r.video) || 0, tayangan: Number(r.tayangan) || 0, suka: Number(r.suka) || 0, akun: Number(r.akun) || 0 } : null }
      : {}),
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    const halaman = Math.min(MAKS_HALAMAN, Math.max(1, Number(new URL(request.url).searchParams.get("halaman")) || 1));
    const c = cache.get(halaman);
    if (c && Date.now() - c.pada < TTL_MS) return c.isi;
    const isi = await muat(halaman);
    if (cache.size > MAKS_HALAMAN) cache.clear();
    cache.set(halaman, { isi, pada: Date.now() });
    return isi;
  });
}
