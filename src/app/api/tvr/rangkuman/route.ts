// /api/tvr/rangkuman — RANGKUMAN LINK HARIAN (TVR Saya, 3 Sep 2026).
// Semua tautan video yang tercatat atas nama pengguna pada satu tanggal WIB
// (laporan_video: otomatis dari unggahan aplikasi + laporan manual yang
// disetujui), dikelompokkan per sosmed — bahan laporan WhatsApp.
// GET ?tanggal=YYYY-MM-DD (bawaan: hari ini WIB)
//
// PERBAIKAN 4 Sep 2026 (bug: "video sudah diupload tapi laporan kosong"):
// tautan hasil unggahan baru masuk laporan_video lewat rekonsiliasi KPI, yang
// dulu HANYA terpicu saat layar Riwayat dibuka. Anggota yang videonya
// diunggahkan admin (Studio/Siaran Serentak) sering tidak pernah membuka layar
// itu, jadi rangkumannya selalu kosong. Sekarang rekonsiliasi DITUNGGU di sini
// dulu (dengan anggaran waktu) sebelum laporan disusun.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userEfektifTvr } from "@/lib/sebagai";
import { rekonsiliasiKpiOtomatis } from "@/lib/kpi-otomatis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Batas waktu rekonsiliasi supaya tombol Generate tidak terasa menggantung. */
const ANGGARAN_REKONSILIASI_MS = 30_000;

const URUTAN_PLATFORM = [
  "instagram",
  "tiktok",
  "twitter",
  "facebook",
  "youtube",
  "threads",
] as const;

function tanggalWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    // 4 Sep 2026: admin PALUGODAM bisa mengendalikan akun anggota (header X-Sebagai).
    const user = await userEfektifTvr(request);
    const db = supabase();
    const uid = Number(user.id);
    const mentah = (
      new URL(request.url).searchParams.get("tanggal") ?? ""
    ).trim();
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(mentah) ? mentah : tanggalWib();

    // Tautan unggahan yang baru terbit dicatat dulu, supaya sekali ketuk
    // Generate sudah lengkap (tidak perlu buka Riwayat lebih dulu).
    // Hanya untuk tanggal hari ini — laporan tanggal lama sudah final.
    if (tanggal === tanggalWib()) {
      await rekonsiliasiKpiOtomatis(uid, {
        anggaranMs: ANGGARAN_REKONSILIASI_MS,
      });
    }

    const [{ data: tercatat }, { data: pending }] = await Promise.all([
      db
        .from("laporan_video")
        .select("platform, url_video, dibuat_pada")
        .eq("user_id", uid)
        .eq("tanggal_wib", tanggal)
        .order("dibuat_pada", { ascending: true })
        .limit(500),
      db
        .from("laporan_video_pending")
        .select("platform, url_video")
        .eq("user_id", uid)
        .eq("tanggal_wib", tanggal)
        .eq("status", "menunggu")
        .limit(100),
    ]);

    const perPlatform: Record<string, string[]> = {};
    for (const p of URUTAN_PLATFORM) perPlatform[p] = [];
    let jumlah = 0;
    for (const b of tercatat ?? []) {
      const pf = String(b.platform ?? "").toLowerCase();
      const url = String(b.url_video ?? "").trim();
      if (!url) continue;
      if (!perPlatform[pf]) perPlatform[pf] = [];
      if (perPlatform[pf].includes(url)) continue;
      perPlatform[pf].push(url);
      jumlah += 1;
    }
    return {
      nama: user.nama,
      tanggal,
      per_platform: perPlatform,
      jumlah,
      menunggu: (pending ?? []).map((b) => ({
        platform: String(b.platform ?? ""),
        url: String(b.url_video ?? ""),
      })),
    };
  });
}
