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

    // Penyegaran latar untuk profil basi — dashboard berikutnya lebih segar.
    after(segarkanProfilTvrBasi);

    return {
      indikator: INDIKATOR,
      platforms: PLATFORMS,
      total: totalSemua,
      per_platform: perPlatform,
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
