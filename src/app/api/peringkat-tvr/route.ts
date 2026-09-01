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
  juaraKategoriTvr,
  kumpulkanAnggotaTvr,
  PLATFORM_TVR,
  segarkanProfilTvrBasi,
} from "@/lib/tvr-peringkat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cache mikro per-instance (persiapan lonjakan 300 pengguna, 1 Sep
// 2026): data leaderboard sama untuk SEMUA orang dan sumbernya toh
// cache insight — hitung sekali per 30 dtk per instance, bukan 3 query
// setiap permintaan. Basi maksimal 30 dtk = tak terasa.
let hasilCache: {
  anggota: Awaited<ReturnType<typeof kumpulkanAnggotaTvr>>;
  top3: ReturnType<typeof juaraKategoriTvr>;
  pada: number;
} | null = null;
const TTL_CACHE_MS = 30_000;

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    if (!hasilCache || Date.now() - hasilCache.pada > TTL_CACHE_MS) {
      const anggota = await kumpulkanAnggotaTvr();
      // "top3" = SEMUA pemegang border (juara 1-3 di kategori mana pun),
      // masing-masing membawa peringkat TERBAIKNYA — dipakai cincin
      // border avatar di seluruh aplikasi.
      hasilCache = { anggota, top3: juaraKategoriTvr(anggota), pada: Date.now() };
    }
    const { anggota, top3 } = hasilCache;

    const { searchParams } = new URL(request.url);
    // Jalur ?ringkas=1 dipanggil SANGAT sering (cincin avatar semua
    // pengguna, tiap 60 dtk) — JANGAN menjadwalkan penyapu di sini
    // (insiden 1 Sep 2026). Sapuan cukup dari pembukaan leaderboard/
    // dashboard, dan tetap dijaga klaim atomik 10-menit di dalamnya.
    if (searchParams.get("ringkas") === "1") return { top3 };
    after(segarkanProfilTvrBasi);

    return {
      platforms: PLATFORM_TVR,
      indikator: INDIKATOR_TVR,
      anggota,
      top3,
      diperbarui: new Date().toISOString(),
    };
  });
}
