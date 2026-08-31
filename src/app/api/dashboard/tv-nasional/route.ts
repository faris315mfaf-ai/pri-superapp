// GET /api/dashboard/tv-nasional — dashboard "TV Rakyat Nasional"
// (permintaan 1 Sep 2026): statistik SANGAT rinci gabungan
//   • TV Rakyat OFFICIAL (induk, sumber: Ayrshare) dan
//   • TV Rakyat PENGGUNA (akun pribadi anggota, sumber: upload-post),
// dipisah per 6 sosial media, 6 indikator: pengikut, tayangan,
// jangkauan, suka, komentar, bagikan — plus data per anggota untuk
// leaderboard per sosmed per indikator (diurutkan di klien).
//
// Sumber angka & kesegaran (jujur, bukan "realtime" palsu):
// - Official: cache bersama `ayrshare_insight_<platform>` yang sudah
//   dipelihara /api/tv/insight; bila belum ada, maksimal 2 platform
//   ditarik langsung per permintaan (sisanya menyusul) agar tidak
//   menabrak batas waktu fungsi.
// - Pengguna: `sosmed_profile.insight_cache` (terisi saat anggota
//   membuka Insight); profil yang basi >6 jam disegarkan bertahap di
//   latar (after(), maks 5 per permintaan) — konvergen tanpa cron.
// Payload menyertakan cakupan (x dari y profil terbaca) — tanpa
// pemotongan diam-diam.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";
import { ambilInsight, ayrshareSiap, type InsightProfil } from "@/lib/ayrshare";
import { analitikProfilUp, PETA_PLATFORM_UP, uploadPostSiap } from "@/lib/upload-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PENGATUR = new Set(["master", "super_admin"]);
const PLATFORMS = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"] as const;
const INDIKATOR = ["pengikut", "tayangan", "jangkauan", "suka", "komentar", "bagikan"] as const;
type Indikator = (typeof INDIKATOR)[number];
type Metrik = Record<Indikator, number | null>;

/** Umur cache insight anggota sebelum dianggap basi (jam). */
const BASI_JAM = 6;
/** Maks profil anggota yang disegarkan di latar per permintaan. */
const MAKS_SEGAR = 5;
/** Maks platform Official yang ditarik langsung bila cache kosong. */
const MAKS_OFFICIAL_LANGSUNG = 2;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function metrikKosong(): Metrik {
  return {
    pengikut: null,
    tayangan: null,
    jangkauan: null,
    suka: null,
    komentar: null,
    bagikan: null,
  };
}

/**
 * Normalkan satu blok platform dari insight_cache upload-post.
 * Kunci-kunci ini DIVERIFIKASI dari cache produksi nyata 1 Sep 2026:
 * followers / impressions / reach / likes / comments / shares — sama
 * untuk semua platform; akun tak tertaut = { success:false, message }.
 */
function metrikDariUp(blok: unknown): Metrik | null {
  if (!blok || typeof blok !== "object") return null;
  const o = blok as Record<string, unknown>;
  if (o.success === false) return null;
  const n = (k: string): number | null => {
    const v = Number(o[k]);
    return o[k] != null && Number.isFinite(v) ? v : null;
  };
  const m: Metrik = {
    pengikut: n("followers"),
    tayangan: n("impressions"),
    jangkauan: n("reach"),
    suka: n("likes"),
    komentar: n("comments"),
    bagikan: n("shares"),
  };
  return (Object.values(m) as (number | null)[]).every((v) => v === null) ? null : m;
}

function metrikDariOfficial(i: InsightProfil | null): Metrik | null {
  if (!i) return null;
  return {
    pengikut: i.pengikut,
    tayangan: i.tayangan,
    jangkauan: i.jangkauan,
    suka: i.suka,
    komentar: i.komentar,
    bagikan: i.bagikan ?? null,
  };
}

/** Jumlahkan dua metrik: null + null = null; angka + null = angka. */
function jumlahkan(a: Metrik, b: Metrik | null): Metrik {
  if (!b) return a;
  const hasil = metrikKosong();
  for (const k of INDIKATOR) {
    const x = a[k];
    const y = b[k];
    hasil[k] = x === null && y === null ? null : (x ?? 0) + (y ?? 0);
  }
  return hasil;
}

type IsiCacheOfficial = { insight: InsightProfil | null; diambil: string };

/** Cache Official milik /api/tv/insight (dibaca-saja, bentuk longgar). */
async function bacaCacheOfficial(platform: string): Promise<InsightProfil | null> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", `ayrshare_insight_${platform}`)
      .maybeSingle();
    if (!data?.nilai) return null;
    const isi = JSON.parse(String(data.nilai)) as { insight?: InsightProfil | null };
    return isi.insight ?? null;
  } catch {
    return null;
  }
}

/** Cache milik dashboard ini sendiri (untuk platform yang ditarik langsung). */
async function bacaCacheSendiri(platform: string): Promise<InsightProfil | null> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", `tvnas_official_${platform}`)
      .maybeSingle();
    if (!data?.nilai) return null;
    const isi = JSON.parse(String(data.nilai)) as IsiCacheOfficial;
    // TTL 30 menit — Ayrshare toh menyegarkan menurut jadwalnya sendiri.
    if (Date.now() - new Date(isi.diambil).getTime() > 30 * 60_000) return null;
    return isi.insight;
  } catch {
    return null;
  }
}

async function simpanCacheSendiri(platform: string, insight: InsightProfil | null) {
  try {
    await supabase()
      .from("pengaturan_sistem")
      .upsert(
        {
          kunci: `tvnas_official_${platform}`,
          nilai: JSON.stringify({ insight, diambil: new Date().toISOString() }),
        },
        { onConflict: "kunci" },
      );
  } catch {
    // Cache gagal ditulis bukan alasan menggagalkan dashboard.
  }
}

/** Segarkan insight profil anggota paling basi (dipanggil lewat after()). */
async function segarkanProfilBasi(): Promise<void> {
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
        console.error("[tv-nasional] segarkan", p.profile_key, e);
        await db
          .from("sosmed_profile")
          .update({ insight_pada: new Date().toISOString() })
          .eq("id", p.id);
      }
    }
  } catch (e) {
    console.error("[tv-nasional] penyegar:", e);
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!PENGATUR.has(user.role) && !(await bolehDashboard(user.role, "tvnasional"))) {
      throw Object.assign(
        new Error("Jabatan Anda tidak punya akses dashboard TV Rakyat Nasional."),
        { status: 403 },
      );
    }
    const db = supabase();

    // ---------- OFFICIAL (Ayrshare) ----------
    const official: Record<string, Metrik | null> = {};
    let tarikLangsung = 0;
    for (const p of PLATFORMS) {
      let insight = (await bacaCacheOfficial(p)) ?? (await bacaCacheSendiri(p));
      if (!insight && ayrshareSiap() && tarikLangsung < MAKS_OFFICIAL_LANGSUNG) {
        tarikLangsung++;
        try {
          insight = await ambilInsight(p);
        } catch {
          insight = null;
        }
        await simpanCacheSendiri(p, insight);
      }
      official[p] = metrikDariOfficial(insight);
    }

    // ---------- PENGGUNA (upload-post, dari cache) ----------
    const profil = pastikanSukses(
      await db
        .from("sosmed_profile")
        .select("user_id, profile_key, insight_cache, insight_pada")
        .eq("penyedia", "upload-post")
        .eq("jenis", "pengguna")
        .limit(500),
      "profil anggota",
    ) as {
      user_id: unknown;
      profile_key: unknown;
      insight_cache: unknown;
      insight_pada: unknown;
    }[];

    const idList = profil.map((p) => Number(p.user_id)).filter((n) => Number.isFinite(n));
    const { data: roster } = await db
      .from("app_user")
      .select("id, nama, avatar_url")
      .in("id", idList.length > 0 ? idList : [-1]);
    const namaPer = new Map(
      (roster ?? []).map((r) => [Number(r.id), { nama: String(r.nama), avatar: String(r.avatar_url ?? "") }]),
    );

    type Anggota = {
      user_id: string;
      nama: string;
      avatar_url: string;
      profil: string;
      diperbarui: string | null;
      platform: Record<string, Metrik | null>;
    };
    const anggota: Anggota[] = [];
    let terbaca = 0;
    for (const p of profil) {
      const cache = p.insight_cache as Record<string, unknown> | null;
      const orang = namaPer.get(Number(p.user_id));
      const per: Record<string, Metrik | null> = {};
      let adaData = false;
      for (const plat of PLATFORMS) {
        const kunciUp = PETA_PLATFORM_UP[plat] ?? plat;
        const m = cache ? metrikDariUp(cache[kunciUp]) : null;
        per[plat] = m;
        if (m) adaData = true;
      }
      if (adaData) terbaca++;
      anggota.push({
        user_id: String(p.user_id),
        nama: orang?.nama ?? String(p.profile_key),
        avatar_url: orang?.avatar ?? "",
        profil: String(p.profile_key),
        diperbarui: (p.insight_pada as string | null) ?? null,
        platform: per,
      });
    }

    // ---------- AGREGAT per platform + total ----------
    const perPlatform: Record<
      string,
      { official: Metrik | null; pengguna: Metrik; total: Metrik; akun_terbaca: number }
    > = {};
    for (const plat of PLATFORMS) {
      let sum = metrikKosong();
      let akunTerbaca = 0;
      for (const a of anggota) {
        const m = a.platform[plat];
        if (m) {
          sum = jumlahkan(sum, m);
          akunTerbaca++;
        }
      }
      perPlatform[plat] = {
        official: official[plat],
        pengguna: sum,
        total: jumlahkan(sum, official[plat]),
        akun_terbaca: akunTerbaca,
      };
    }
    let totalSemua = metrikKosong();
    for (const plat of PLATFORMS) totalSemua = jumlahkan(totalSemua, perPlatform[plat].total);

    // Penyegaran latar untuk profil basi — dashboard berikutnya lebih segar.
    after(segarkanProfilBasi);

    return {
      indikator: INDIKATOR,
      platforms: PLATFORMS,
      total: totalSemua,
      per_platform: perPlatform,
      anggota,
      cakupan: {
        profil_total: profil.length,
        profil_terbaca: terbaca,
        official_terbaca: PLATFORMS.filter((p) => official[p] !== null).length,
        catatan:
          "Angka mengikuti definisi analitik masing-masing platform; profil anggota disegarkan bertahap otomatis.",
      },
    };
  });
}
