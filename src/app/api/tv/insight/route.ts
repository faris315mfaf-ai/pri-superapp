// GET /api/tv/insight — insight profil sosmed TV Rakyat dari Ayrshare
//
// Soal "realtime": Ayrshare tidak menarik ulang angka dari Instagram
// setiap kali dipanggil. Ia menyegarkan menurut jadwalnya sendiri dan
// memberi tahu lewat lastUpdated/nextUpdate. Maka:
//
// 1. Hasilnya disimpan di `pengaturan_sistem` sebagai cache bersama.
//    Tanpa ini, tiap layar yang terbuka (dan tiap instance serverless)
//    akan memanggil Ayrshare sendiri-sendiri dan membakar kuota API.
// 2. Ayrshare hanya dihubungi lagi setelah waktu `nextUpdate`-nya
//    lewat — memanggil lebih cepat dari itu hanya menghabiskan kuota
//    untuk angka yang sama persis.
// 3. Layar menampilkan "diperbarui pukul sekian" apa adanya, supaya
//    tidak ada yang mengira angka ini detik-per-detik.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { ambilAkunTertaut, ambilInsight, ayrshareSiap, type InsightProfil } from "@/lib/ayrshare";

export const dynamic = "force-dynamic";

const PLATFORM_SAH = new Set([
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
  "twitter",
]);
/** Jaring pengaman bila Ayrshare tidak menyebut nextUpdate */
const TTL_CADANGAN_MS = 10 * 60 * 1000;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

type IsiCache = {
  insight: InsightProfil | null;
  akun: Awaited<ReturnType<typeof ambilAkunTertaut>> | null;
  diambil: string;
};

async function bacaCache(kunci: string): Promise<IsiCache | null> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", kunci)
      .maybeSingle();
    if (!data?.nilai) return null;
    return JSON.parse(data.nilai) as IsiCache;
  } catch {
    return null;
  }
}

async function simpanCache(kunci: string, isi: IsiCache): Promise<void> {
  try {
    await supabase()
      .from("pengaturan_sistem")
      .upsert(
        { kunci, nilai: JSON.stringify(isi), diubah_pada: new Date().toISOString() },
        { onConflict: "kunci" },
      );
  } catch (e) {
    // Cache gagal disimpan bukan alasan menggagalkan permintaan —
    // angkanya sudah di tangan, paling-paling panggilan berikutnya
    // menghubungi Ayrshare lagi.
    console.error("[tv/insight] simpan cache:", e);
  }
}

/** true bila cache masih layak dipakai (belum lewat nextUpdate Ayrshare) */
function masihSegar(cache: IsiCache | null): boolean {
  if (!cache) return false;
  const berikutnya = cache.insight?.berikutnya;
  const batas = berikutnya
    ? new Date(berikutnya).getTime()
    : new Date(cache.diambil).getTime() + TTL_CADANGAN_MS;
  return Number.isFinite(batas) && Date.now() < batas;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    // Insight memuat angka internal akun partai — hanya untuk yang
    // sudah masuk, bukan siapa pun yang menebak URL-nya.
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });

    if (!ayrshareSiap()) {
      return {
        siap: false,
        pesan: "Ayrshare belum tersambung. Isi AYRSHARE_API_KEY di pengaturan lingkungan.",
        insight: null,
        akun: null,
      };
    }

    const url = new URL(request.url);
    const paksa = url.searchParams.get("paksa") === "1";
    // Insight bisa diminta per platform (pemilih di dashboard super
    // admin). Cache dipisah per platform supaya angka IG dan TikTok
    // tidak saling menimpa.
    const platformMentah = (url.searchParams.get("platform") ?? "instagram").toLowerCase();
    const platform = PLATFORM_SAH.has(platformMentah) ? platformMentah : "instagram";
    const kunciCache = `ayrshare_insight_${platform}`;
    const cache = await bacaCache(kunciCache);

    if (!paksa && masihSegar(cache)) {
      return { siap: true, dariCache: true, insight: cache!.insight, akun: cache!.akun };
    }

    try {
      // Keduanya tidak saling bergantung — dijalankan bersamaan.
      const [insight, akun] = await Promise.all([
        ambilInsight(platform),
        ambilAkunTertaut(),
      ]);
      const isi: IsiCache = { insight, akun, diambil: new Date().toISOString() };
      await simpanCache(kunciCache, isi);
      return { siap: true, dariCache: false, insight, akun };
    } catch (e) {
      // Ayrshare sedang bermasalah: sajikan angka terakhir yang kita
      // punya daripada layar kosong — asal dijelaskan bahwa ini data
      // lama, lengkap dengan waktu pembaruannya.
      if (cache) {
        return {
          siap: true,
          dariCache: true,
          kedaluwarsa: true,
          pesan: e instanceof Error ? e.message : "Ayrshare tidak bisa dihubungi.",
          insight: cache.insight,
          akun: cache.akun,
        };
      }
      throw e;
    }
  });
}
