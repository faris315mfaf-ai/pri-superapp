// GET /api/peringkat-tvr — leaderboard akun TV Rakyat pengguna untuk
// SELURUH pengguna aplikasi (fitur mahkota, 1 Sep 2026). Berbeda dari
// /api/dashboard/tv-nasional yang khusus pengurus, endpoint ini cukup
// login: leaderboard memang dirancang dilihat semua orang.
//
// ?ringkas=1 → hanya tiga besar (untuk badge cincin di avatar —
//              dipanggil sering, jadi dibuat seringan mungkin).
// Tanpa param → daftar lengkap anggota + metrik per platform + handle
//              per platform (klik nama → profil sosmednya) + tiga besar.
//
// Tiga besar (dasar badge "Mythical"): TOTAL PENGIKUT gabungan seluruh
// sosmed. Data ikut segar bertahap lewat penyapu profil basi (after()).
import { after } from "next/server";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import {
  INDIKATOR_TVR,
  kumpulkanAnggotaTvr,
  PLATFORM_TVR,
  segarkanProfilTvrBasi,
  tigaBesarTvr,
} from "@/lib/tvr-peringkat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    const anggota = await kumpulkanAnggotaTvr();
    const top3 = tigaBesarTvr(anggota);
    after(segarkanProfilTvrBasi);

    const { searchParams } = new URL(request.url);
    if (searchParams.get("ringkas") === "1") return { top3 };

    return {
      platforms: PLATFORM_TVR,
      indikator: INDIKATOR_TVR,
      anggota,
      top3,
      diperbarui: new Date().toISOString(),
    };
  });
}
