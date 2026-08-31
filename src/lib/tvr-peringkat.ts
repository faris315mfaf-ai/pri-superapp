// ============================================================
// tvr-peringkat (1 Sep 2026) — logika BERSAMA data akun TV Rakyat
// pengguna: dipakai /api/dashboard/tv-nasional (dashboard pengurus)
// dan /api/peringkat-tvr (leaderboard mahkota — SELURUH pengguna).
// Satu sumber supaya angka dashboard & leaderboard tak pernah beda.
//
// Kontrak metrik upload-post DIVERIFIKASI dari cache produksi nyata
// 1 Sep 2026: tiap platform objek seragam { followers, impressions,
// reach, likes, comments, shares, ... } — angka polos; akun tak
// tertaut = { success:false, message }.
// ============================================================
import { supabase } from "@/lib/supabase";
import { analitikProfilUp, PETA_PLATFORM_UP, uploadPostSiap } from "@/lib/upload-post";

export const PLATFORM_TVR = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
  "twitter",
] as const;
export const INDIKATOR_TVR = [
  "pengikut",
  "tayangan",
  "jangkauan",
  "suka",
  "komentar",
  "bagikan",
] as const;
export type IndikatorTvr = (typeof INDIKATOR_TVR)[number];
export type MetrikTvr = Record<IndikatorTvr, number | null>;

export type AnggotaTvr = {
  user_id: string;
  nama: string;
  avatar_url: string;
  profil: string;
  diperbarui: string | null;
  platform: Record<string, MetrikTvr | null>;
  /** Handle/username per platform (dari akun yang login upload-post). */
  akun: Record<string, string>;
};

export function metrikTvrKosong(): MetrikTvr {
  return {
    pengikut: null,
    tayangan: null,
    jangkauan: null,
    suka: null,
    komentar: null,
    bagikan: null,
  };
}

/** Normalkan satu blok platform dari insight_cache upload-post. */
export function metrikDariUp(blok: unknown): MetrikTvr | null {
  if (!blok || typeof blok !== "object") return null;
  const o = blok as Record<string, unknown>;
  if (o.success === false) return null;
  const n = (k: string): number | null => {
    const v = Number(o[k]);
    return o[k] != null && Number.isFinite(v) ? v : null;
  };
  const m: MetrikTvr = {
    pengikut: n("followers"),
    tayangan: n("impressions"),
    jangkauan: n("reach"),
    suka: n("likes"),
    komentar: n("comments"),
    bagikan: n("shares"),
  };
  return (Object.values(m) as (number | null)[]).every((v) => v === null) ? null : m;
}

/** Jumlahkan dua metrik: null+null = null; angka+null = angka. */
export function jumlahkanMetrikTvr(a: MetrikTvr, b: MetrikTvr | null): MetrikTvr {
  if (!b) return a;
  const hasil = metrikTvrKosong();
  for (const k of INDIKATOR_TVR) {
    const x = a[k];
    const y = b[k];
    hasil[k] = x === null && y === null ? null : (x ?? 0) + (y ?? 0);
  }
  return hasil;
}

/**
 * Kumpulkan semua akun TV Rakyat pengguna + metrik per platform (dari
 * insight_cache) + handle per platform (untuk tautan ke profil sosmed).
 */
export async function kumpulkanAnggotaTvr(): Promise<AnggotaTvr[]> {
  const db = supabase();
  const [{ data: profil }, { data: akunBaris }] = await Promise.all([
    db
      .from("sosmed_profile")
      .select("user_id, profile_key, insight_cache, insight_pada")
      .eq("penyedia", "upload-post")
      .eq("jenis", "pengguna")
      .limit(500),
    db
      .from("akun_tvr_user")
      .select("user_id, platform, username")
      .eq("terhubung", true)
      .neq("platform", "website")
      .limit(3000),
  ]);

  const idList = (profil ?? [])
    .map((p) => Number(p.user_id))
    .filter((n) => Number.isFinite(n));
  const { data: roster } = await db
    .from("app_user")
    .select("id, nama, avatar_url")
    .in("id", idList.length > 0 ? idList : [-1]);
  const orangPer = new Map(
    (roster ?? []).map((r) => [
      Number(r.id),
      { nama: String(r.nama), avatar: String(r.avatar_url ?? "") },
    ]),
  );
  const handlePer = new Map<number, Record<string, string>>();
  for (const b of akunBaris ?? []) {
    const id = Number(b.user_id);
    const isi = handlePer.get(id) ?? {};
    isi[String(b.platform)] = String(b.username);
    handlePer.set(id, isi);
  }

  const hasil: AnggotaTvr[] = [];
  for (const p of profil ?? []) {
    const cache = p.insight_cache as Record<string, unknown> | null;
    const orang = orangPer.get(Number(p.user_id));
    const per: Record<string, MetrikTvr | null> = {};
    for (const plat of PLATFORM_TVR) {
      const kunciUp = PETA_PLATFORM_UP[plat] ?? plat;
      per[plat] = cache ? metrikDariUp(cache[kunciUp]) : null;
    }
    hasil.push({
      user_id: String(p.user_id),
      nama: orang?.nama ?? String(p.profile_key),
      avatar_url: orang?.avatar ?? "",
      profil: String(p.profile_key),
      diperbarui: (p.insight_pada as string | null) ?? null,
      platform: per,
      akun: handlePer.get(Number(p.user_id)) ?? {},
    });
  }
  return hasil;
}

export type JuaraTvr = {
  user_id: string;
  nama: string;
  avatar_url: string;
  /** Peringkat TERBAIK yang diraih di kategori mana pun: 1 | 2 | 3 */
  peringkat: number;
  /** Total pengikut gabungan seluruh sosmed (info tambahan). */
  total_pengikut: number;
  /** Berapa kategori (sosmed × indikator) tempat dia juara 1-3. */
  kategori_juara: number;
};

/**
 * Pemegang BORDER "Mythical" (revisi 1 Sep 2026, permintaan user):
 * border diberikan pada peringkat 1-2-3 dari SETIAP KATEGORI —
 * kategori = kombinasi sosmed × indikator (6×6). Peringkat border
 * seseorang = peringkat TERBAIK yang ia raih di kategori mana pun;
 * jumlah kategori juaranya ikut dihitung (dipakai keterangan UI).
 */
export function juaraKategoriTvr(anggota: AnggotaTvr[]): JuaraTvr[] {
  const terbaik = new Map<string, { peringkat: number; kategori: number }>();
  for (const plat of PLATFORM_TVR) {
    for (const ind of INDIKATOR_TVR) {
      const urut = anggota
        .map((a) => ({ a, nilai: a.platform[plat]?.[ind] ?? null }))
        .filter((x): x is typeof x & { nilai: number } => x.nilai !== null && x.nilai > 0)
        .sort((x, y) => y.nilai - x.nilai)
        .slice(0, 3);
      urut.forEach((x, i) => {
        const lama = terbaik.get(x.a.user_id);
        terbaik.set(x.a.user_id, {
          peringkat: Math.min(lama?.peringkat ?? 99, i + 1),
          kategori: (lama?.kategori ?? 0) + 1,
        });
      });
    }
  }
  const hasil: JuaraTvr[] = [];
  for (const a of anggota) {
    const j = terbaik.get(a.user_id);
    if (!j) continue;
    let total = 0;
    for (const plat of PLATFORM_TVR) total += a.platform[plat]?.pengikut ?? 0;
    hasil.push({
      user_id: a.user_id,
      nama: a.nama,
      avatar_url: a.avatar_url,
      peringkat: j.peringkat,
      total_pengikut: total,
      kategori_juara: j.kategori,
    });
  }
  // Urut: peringkat terbaik dulu, lalu paling banyak kategori juara.
  return hasil.sort(
    (x, y) => x.peringkat - y.peringkat || y.kategori_juara - x.kategori_juara,
  );
}

/** Umur cache insight anggota sebelum dianggap basi (jam). */
const BASI_JAM = 6;
/** Maks profil yang disegarkan di latar per permintaan. */
const MAKS_SEGAR = 5;

/** Segarkan insight profil paling basi — dipanggil lewat after(). */
export async function segarkanProfilTvrBasi(): Promise<void> {
  try {
    if (!uploadPostSiap()) return;
    const db = supabase();
    const batas = new Date(Date.now() - BASI_JAM * 3600_000).toISOString();
    const { data } = await db
      .from("sosmed_profile")
      .select("id, profile_key, insight_pada")
      .eq("penyedia", "upload-post")
      .eq("jenis", "pengguna")
      .or(`insight_pada.is.null,insight_pada.lt.${batas}`)
      .order("insight_pada", { ascending: true, nullsFirst: true })
      .limit(MAKS_SEGAR);
    for (const p of data ?? []) {
      try {
        const insight = await analitikProfilUp(String(p.profile_key));
        await db
          .from("sosmed_profile")
          .update({ insight_cache: insight, insight_pada: new Date().toISOString() })
          .eq("id", p.id);
      } catch (e) {
        // Satu profil gagal jangan menghentikan sisanya; insight_pada
        // tetap dimajukan supaya tidak macet menabrak profil yang sama.
        console.error("[tvr-peringkat] segarkan", p.profile_key, e);
        await db
          .from("sosmed_profile")
          .update({ insight_pada: new Date().toISOString() })
          .eq("id", p.id);
      }
    }
  } catch (e) {
    console.error("[tvr-peringkat] penyegar:", e);
  }
}
