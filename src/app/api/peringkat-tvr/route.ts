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
import { waktuAmbilKomentarTerakhir } from "@/lib/kepatuhan";
import { after } from "next/server";
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { periodeSaatIni } from "@/lib/periode-qc";
import {
  leaderboardVideo,
  METRIK_VIDEO,
  PLATFORM_VIDEO,
  segarkanVideoMetrik,
  type MetrikVideo,
  type PlatformVideo,
} from "@/lib/video-terbaik";
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

// Leaderboard KEPATUHAN KOMEN (2 Sep 2026) — cache mikro 30 dtk.
let cacheKomen: { isi: Record<string, unknown>; pada: number } | null = null;

async function leaderboardKomen() {
  if (cacheKomen && Date.now() - cacheKomen.pada < TTL_CACHE_MS) return cacheKomen.isi;
  const db = supabase();
  const periode = periodeSaatIni();
  const [{ data: baris }, { data: roster }, diperbarui] = await Promise.all([
    // v_app_kepatuhan_kader: periode, nama_kader, total, sudah (+nomor_wa —
    // SENGAJA tidak dibaca: endpoint ini untuk semua pengguna).
    db.from("v_app_kepatuhan_kader").select("nama_kader, total, sudah").eq("periode", periode),
    db.from("app_user").select("nama, avatar_url").eq("aktif", true).eq("status", "aktif").limit(500),
    waktuAmbilKomentarTerakhir(periode),
  ]);
  const avatarPer = new Map((roster ?? []).map((r) => [String(r.nama), String(r.avatar_url ?? "")]));
  const daftar = (baris ?? [])
    .map((b) => {
      const total = Number(b.total ?? 0);
      const sudah = Number(b.sudah ?? 0);
      return {
        nama: String(b.nama_kader),
        avatar_url: avatarPer.get(String(b.nama_kader)) ?? "",
        total,
        sudah,
        persen: total > 0 ? Math.round((sudah / total) * 100) : 0,
      };
    })
    // Persen tertinggi dulu; seri → yang paling banyak komentar.
    .sort((x, y) => y.persen - x.persen || y.sudah - x.sudah || x.nama.localeCompare(y.nama));
  const isi = {
    periode,
    // Jendela penilaian mengikuti lib/periode-qc (17.00 → 16.59 WIB).
    jendela: "17.00 WIB – 16.59 WIB hari berikutnya",
    // Kapan komentar terakhir diambil dari sosmed (label jelas, 3 Sep 2026).
    diperbarui,
    daftar,
  };
  cacheKomen = { isi, pada: Date.now() };
  return isi;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    // Kategori KEPATUHAN KOMEN — jalur ringan terpisah dari data TVR.
    if (new URL(request.url).searchParams.get("komen") === "1") {
      return leaderboardKomen();
    }
    // Kategori VIDEO TERBAIK (2 Sep 2026): top video per sosmed berdasarkan
    // tayangan/suka/komentar. Membuka mode ini juga memicu sapuan metrik
    // (klaim atomik 15 mnt, maks 6 akun & 30 dtk) lewat after().
    const qp = new URL(request.url).searchParams;
    if (qp.get("video") === "1") {
      const platform = (PLATFORM_VIDEO as readonly string[]).includes(qp.get("platform") ?? "")
        ? (qp.get("platform") as PlatformVideo)
        : "tiktok";
      const metrik = (METRIK_VIDEO as readonly string[]).includes(qp.get("metrik") ?? "")
        ? (qp.get("metrik") as MetrikVideo)
        : "tayangan";
      const hariRaw = Number(qp.get("hari") ?? 30);
      const hari = [0, 7, 30].includes(hariRaw) ? hariRaw : 30;
      after(segarkanVideoMetrik);
      return leaderboardVideo(platform, metrik, hari);
    }
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
