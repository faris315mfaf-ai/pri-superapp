// GET /api/tv/insight/detail?platform=X — insight RINCI per postingan.
//
// Sumber: GET /history/{platform} milik Ayrshare, yang mengembalikan
// postingan akun itu sendiri BESERTA angkanya — termasuk postingan
// yang tidak diunggah lewat aplikasi ini.
//
// Kekayaan datanya berbeda per platform, dan itu memang apa adanya:
// - TikTok  : paling lengkap (tayangan, durasi tonton, jangkauan, dst.)
// - Instagram / Facebook : suka, komentar, sebagian tayangan
// - YouTube / Threads    : Ayrshare tidak memberi angka per postingan
//   (sudah diuji: nilainya nol bahkan untuk video lama), jadi yang
//   ditampilkan hanya judul/tautan — bukan angka nol yang menyesatkan.
//
// Hasilnya di-cache 15 menit di pengaturan_sistem: satu layar detail
// tidak boleh menghabiskan kuota Ayrshare hanya karena dibuka-tutup.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { ambilRiwayatPostingan, ayrshareSiap } from "@/lib/ayrshare";

export const dynamic = "force-dynamic";

const PLATFORM_SAH = new Set([
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
]);
const TTL_MS = 15 * 60 * 1000;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!ayrshareSiap()) {
      return { siap: false, pesan: "Ayrshare belum tersambung.", data: [] };
    }

    const url = new URL(request.url);
    const mentah = (url.searchParams.get("platform") ?? "instagram").toLowerCase();
    const platform = PLATFORM_SAH.has(mentah) ? mentah : "instagram";
    const paksa = url.searchParams.get("paksa") === "1";
    const kunci = `ayrshare_detail_${platform}`;
    const db = supabase();

    if (!paksa) {
      const { data: cache } = await db
        .from("pengaturan_sistem")
        .select("nilai, diubah_pada")
        .eq("kunci", kunci)
        .maybeSingle();
      if (cache?.nilai && cache.diubah_pada) {
        const umur = Date.now() - new Date(cache.diubah_pada).getTime();
        if (umur < TTL_MS) {
          try {
            return { siap: true, dariCache: true, ...JSON.parse(cache.nilai) };
          } catch {
            // Cache rusak — abaikan, ambil ulang dari Ayrshare.
          }
        }
      }
    }

    const data = await ambilRiwayatPostingan(platform, 15);
    const isi = { platform, data };

    try {
      await db.from("pengaturan_sistem").upsert(
        { kunci, nilai: JSON.stringify(isi), diubah_pada: new Date().toISOString() },
        { onConflict: "kunci" },
      );
    } catch (e) {
      // Gagal menyimpan cache bukan alasan menggagalkan permintaan.
      console.error("[insight/detail] cache:", e);
    }

    return { siap: true, dariCache: false, ...isi };
  });
}
