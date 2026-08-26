// TUGAS INTERAKSI — kewajiban seluruh anggota atas video TV Rakyat
// yang baru diposting: beri KOMENTAR di platform + SHARE ke grup WA.
//
// GET  → video tayang 7 hari terakhir + status komen/share SAYA
// POST {kode, jenis:"komen"|"share"} → tandai kewajiban itu selesai
//
// Penandaan bersifat laporan-diri (klik tombol), dengan dua penjaga:
// hanya video yang benar-benar tayang yang bisa ditandai, dan satu
// orang hanya bisa menandai sekali per video per jenis (primary key).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";

export const dynamic = "force-dynamic";

const UMUR_HARI = 7;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const db = supabase();
    const batas = new Date(Date.now() - UMUR_HARI * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: video }, { data: interaksi }] = await Promise.all([
      db
        .from("video_antrian")
        .select("kode, judul, judul_overlay, link_instagram, thumbnail_url, diunggah_pada, ayrshare_hasil")
        .eq("status", "SUDAH DIPROSES")
        .gte("diunggah_pada", batas)
        .order("diunggah_pada", { ascending: false })
        .limit(10),
      db
        .from("interaksi_video")
        .select("video_kode, jenis")
        .eq("user_id", Number(user.id)),
    ]);

    const punya = new Set((interaksi ?? []).map((i) => `${i.video_kode}|${i.jenis}`));
    return {
      data: (video ?? []).map((v) => ({
        kode: v.kode,
        judul: v.judul_overlay || v.judul || v.kode,
        link: v.link_instagram ?? "",
        // SELURUH tautan platform tempat video ini tayang, supaya
        // tombol bagikan bisa mengirim semuanya sekaligus — bukan
        // hanya tautan Instagram seperti sebelumnya.
        tautan: (Array.isArray(v.ayrshare_hasil) ? v.ayrshare_hasil : [])
          .filter(
            (h): h is { platform: string; postUrl: string } =>
              Boolean(h) &&
              typeof (h as { postUrl?: unknown }).postUrl === "string" &&
              Boolean((h as { postUrl?: string }).postUrl),
          )
          .map((h) => ({ platform: String(h.platform ?? ""), url: h.postUrl })),
        thumbnail_url: v.thumbnail_url ?? "",
        diunggah_pada: v.diunggah_pada,
        sudah_komen: punya.has(`${v.kode}|komen`),
        sudah_share: punya.has(`${v.kode}|share`),
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      kode?: string;
      jenis?: string;
    };
    const kode = (body.kode ?? "").trim();
    const jenis = body.jenis === "komen" || body.jenis === "share" ? body.jenis : null;
    if (!kode || !jenis) {
      throw Object.assign(new Error("Video/jenis interaksi tidak disebutkan."), {
        status: 400,
      });
    }

    const db = supabase();
    const { data: video } = await db
      .from("video_antrian")
      .select("kode, status")
      .eq("kode", kode)
      .maybeSingle();
    if (!video || video.status !== "SUDAH DIPROSES") {
      throw Object.assign(new Error("Video itu belum/tidak tayang."), { status: 404 });
    }

    // Upsert supaya klik ganda tidak menghasilkan error (idempoten).
    const { error } = await db.from("interaksi_video").upsert(
      { user_id: Number(user.id), video_kode: kode, jenis },
      { onConflict: "user_id,video_kode,jenis" },
    );
    if (error) {
      console.error("[tv/interaksi] simpan:", error.message);
      throw new Error("Gagal menyimpan tanda interaksi.");
    }
    return { sukses: true };
  });
}
