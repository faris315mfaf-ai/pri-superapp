// GET /api/dashboard/tv-nasional — dashboard "TV Rakyat Nasional"
// (permintaan 1 Sep 2026): statistik SANGAT rinci gabungan
//   • TV Rakyat OFFICIAL (induk, profil upload-post Official) dan
//   • TV Rakyat PENGGUNA (akun pribadi anggota, sumber: upload-post),
// dipisah per 6 sosial media, 6 indikator: pengikut, tayangan,
// jangkauan, suka, komentar, bagikan — plus data per anggota untuk
// leaderboard per sosmed per indikator (diurutkan di klien).
//
// Sumber angka & kesegaran (jujur, bukan "realtime" palsu):
// - Official: cache bersama `up_official_insight` (lib/tvr-nasional →
//   insightOfficialUp, TTL 15 menit). Satu panggilan /analytics memuat
//   keenam platform; Official belum ditautkan = kolom Official kosong.
//   (16 Okt 2026: Ayrshare dihapus; cache `ayrshare_insight_*` dan
//   `tvnas_official_*` tidak dibaca lagi.)
// - Pengguna: `sosmed_profile.insight_cache` (terisi saat anggota
//   membuka Insight); profil yang basi >6 jam disegarkan bertahap di
//   latar (after(), maks 5 per permintaan) — konvergen tanpa cron.
// Payload menyertakan cakupan (x dari y profil terbaca) — tanpa
// pemotongan diam-diam.
import { adalahSuperuser } from "@/lib/peran";
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";
import { semuaBaris } from "@/lib/semua-baris";
import { jalankanLatar } from "@/lib/penjaga-supabase";
import { bacaCacheInsightOfficial, insightOfficialUp, metrikOfficial } from "@/lib/tvr-nasional";
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

/** Timeout penarikan Official dari dashboard (sisa waktu untuk anggota). */
const TIMEOUT_OFFICIAL_MS = 20_000;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    // Superuser (mode lihat, 16 Okt 2026): membaca angka total untuk TV Nasional ringkas.
    if (!PENGATUR.has(user.role) && !adalahSuperuser(user) && !(await bolehDashboard(user, "tvnasional"))) {
      throw Object.assign(
        new Error("Jabatan Anda tidak punya akses dashboard TV Rakyat Nasional."),
        { status: 403 },
      );
    }
    // ---------- OFFICIAL (upload-post, cache bersama) ----------
    // Gagal menarik (upload-post sibuk) tidak menggagalkan dashboard:
    // cache terakhir — bila ada — tetap dipakai. Pengguna virtual uji beban
    // hanya membaca cache (tidak menghubungi upload-post).
    const cacheOfficial = user.ujiBeban
      ? await bacaCacheInsightOfficial()
      : await insightOfficialUp({ timeoutMs: TIMEOUT_OFFICIAL_MS })
          .then((h) => h.cache)
          .catch(async (e) => {
            console.error("[tv-nasional] insight Official:", e instanceof Error ? e.message : e);
            return bacaCacheInsightOfficial();
          });
    const official: Record<string, Metrik | null> = {};
    for (const p of PLATFORMS) official[p] = metrikOfficial(cacheOfficial, p);

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
    // per sosmed bila akun resminya terbaca lewat profil upload-post Official.
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
    // Penyapu memanggil upload-post — tidak untuk pengguna virtual uji beban.
    if (!user.ujiBeban) after(() => jalankanLatar("sapu-profil-tvr", segarkanProfilTvrBasi));

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
