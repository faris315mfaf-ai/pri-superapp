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
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";
import { semuaBaris } from "@/lib/semua-baris";
import { jalankanLatar } from "@/lib/penjaga-supabase";
import { ambilInsight, ayrshareSiap, type InsightProfil } from "@/lib/ayrshare";
import {
  INDIKATOR_TVR,
  jumlahkanMetrikTvr,
  kumpulkanAnggotaTvr,
  metrikTvrKosong,
  PLATFORM_TVR,
  segarkanProfilTvrBasi,
  type MetrikTvr,
} from "@/lib/tvr-peringkat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PENGATUR = new Set(["master", "super_admin"]);
const PLATFORMS = PLATFORM_TVR;
const INDIKATOR = INDIKATOR_TVR;
type Metrik = MetrikTvr;
const metrikKosong = metrikTvrKosong;
const jumlahkan = jumlahkanMetrikTvr;

/** Maks platform Official yang ditarik langsung bila cache kosong. */
const MAKS_OFFICIAL_LANGSUNG = 2;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
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

type IsiCacheOfficial = { insight: InsightProfil | null; diambil: string };

/**
 * Kedua cache Official SEMUA platform dalam SATU kueri (28 Sep 2026).
 * Dulu dibaca per platform, berurutan: hingga 12 kueri tiap dashboard
 * dibuka (pola N+1). Kunci yang tidak ada = cache kosong.
 */
async function bacaSemuaCache(platforms: readonly string[]): Promise<Map<string, string>> {
  const kunci = platforms.flatMap((p) => [`ayrshare_insight_${p}`, `tvnas_official_${p}`]);
  try {
    const { data } = await supabase().from("pengaturan_sistem").select("kunci, nilai").in("kunci", kunci);
    return new Map((data ?? []).map((b) => [String(b.kunci), String(b.nilai ?? "")]));
  } catch {
    return new Map();
  }
}

/** Cache Official milik /api/tv/insight (dibaca-saja, bentuk longgar). */
function uraiCacheOfficial(nilai: string | undefined): InsightProfil | null {
  if (!nilai) return null;
  try {
    const isi = JSON.parse(nilai) as { insight?: InsightProfil | null };
    return isi.insight ?? null;
  } catch {
    return null;
  }
}

/** Cache milik dashboard ini sendiri (untuk platform yang ditarik langsung). */
function uraiCacheSendiri(nilai: string | undefined): InsightProfil | null {
  if (!nilai) return null;
  try {
    const isi = JSON.parse(nilai) as IsiCacheOfficial;
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

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!PENGATUR.has(user.role) && !(await bolehDashboard(user, "tvnasional"))) {
      throw Object.assign(
        new Error("Jabatan Anda tidak punya akses dashboard TV Rakyat Nasional."),
        { status: 403 },
      );
    }
    // ---------- OFFICIAL (Ayrshare) ----------
    const official: Record<string, Metrik | null> = {};
    let tarikLangsung = 0;
    const cache = await bacaSemuaCache(PLATFORMS);
    for (const p of PLATFORMS) {
      let insight =
        uraiCacheOfficial(cache.get(`ayrshare_insight_${p}`)) ?? uraiCacheSendiri(cache.get(`tvnas_official_${p}`));
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

    // ---------- PENGGUNA (upload-post, dari cache — lib bersama) ----------
    const anggota = await kumpulkanAnggotaTvr();
    const terbaca = anggota.filter((a) =>
      PLATFORMS.some((plat) => a.platform[plat] !== null),
    ).length;

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

    // ---------- AKUN TERHUBUNG per sosmed (24 Sep 2026) ----------
    // Dihitung dari akun_tvr_user (terhubung = login upload-post), BUKAN
    // dari akun yang angkanya sudah terbaca — akun baru tersambung ikut
    // terhitung walau insight-nya belum ditarik. Official dihitung satu
    // per sosmed bila akun resminya terbaca lewat Ayrshare.
    const barisAkun = await semuaBaris<{ user_id: unknown; platform: unknown }>((a, b) =>
      supabase()
        .from("akun_tvr_user")
        .select("user_id, platform")
        .eq("terhubung", true)
        .neq("platform", "website")
        .order("user_id")
        .range(a, b),
    );
    const unikPer = new Map<string, Set<number>>();
    const orangTerhubung = new Set<number>();
    for (const r of barisAkun) {
      const plat = String(r.platform ?? "");
      if (!PLATFORMS.includes(plat as (typeof PLATFORMS)[number])) continue;
      const uid = Number(r.user_id);
      if (!Number.isFinite(uid)) continue;
      const set = unikPer.get(plat) ?? new Set<number>();
      set.add(uid);
      unikPer.set(plat, set);
      orangTerhubung.add(uid);
    }
    const akunTerhubung: Record<string, { pengguna: number; official: boolean }> = {};
    let totalAkun = 0;
    for (const plat of PLATFORMS) {
      const pengguna = unikPer.get(plat)?.size ?? 0;
      const adaOfficial = official[plat] !== null;
      akunTerhubung[plat] = { pengguna, official: adaOfficial };
      totalAkun += pengguna + (adaOfficial ? 1 : 0);
    }

    // Penyegaran latar untuk profil basi — dashboard berikutnya lebih segar.
    after(() => jalankanLatar("sapu-profil-tvr", segarkanProfilTvrBasi));

    return {
      indikator: INDIKATOR,
      platforms: PLATFORMS,
      total: totalSemua,
      per_platform: perPlatform,
      akun_terhubung: {
        total: totalAkun,
        orang: orangTerhubung.size,
        per_platform: akunTerhubung,
      },
      anggota,
      cakupan: {
        profil_total: anggota.length,
        profil_terbaca: terbaca,
        official_terbaca: PLATFORMS.filter((p) => official[p] !== null).length,
        catatan:
          "Angka mengikuti definisi analitik masing-masing platform; profil anggota disegarkan bertahap otomatis.",
      },
    };
  });
}
