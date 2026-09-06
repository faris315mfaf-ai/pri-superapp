// /api/master/diagnosa-kpi — ALAT DIAGNOSA pencatatan KPI otomatis (6 Sep 2026),
// khusus master. Menjawab "video terupload tapi link tidak tercatat, kenapa?"
// dengan data mentah dari upload-post untuk SATU unggahan:
//   GET ?post_id=<tvrku_post.id>            → status, post-analytics (URL pasti
//                                             per platform), media profil per
//                                             platform, dan keadaan laporan_video.
//   GET ?user_id=<id>&jalankan=1            → jalankan rekonsiliasi (rinci) untuk
//                                             satu anggota sekarang juga.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { rekonsiliasiKpiRinci } from "@/lib/kpi-otomatis";
import { analitikPostUp, postinganTerbaruUp, statusUnggahUp, uploadPostSiap } from "@/lib/upload-post";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (user.role !== "master") throw Object.assign(new Error("Halaman tidak ditemukan."), { status: 404 });
    if (!uploadPostSiap()) throw Object.assign(new Error("upload-post belum diatur."), { status: 503 });
    const url = new URL(request.url);
    const db = supabase();

    if (url.searchParams.get("jalankan") === "1") {
      const uid = Number(url.searchParams.get("user_id") ?? 0);
      if (!uid) throw Object.assign(new Error("user_id wajib."), { status: 400 });
      return { user_id: uid, hasil: await rekonsiliasiKpiRinci(uid, { anggaranMs: 90_000 }) };
    }

    const postId = Number(url.searchParams.get("post_id") ?? 0);
    if (!postId) throw Object.assign(new Error("post_id wajib."), { status: 400 });
    const { data: post } = await db.from("tvrku_post").select("id, user_id, platforms, kpi_tercatat, jadwal, dibuat_pada, request_id, judul").eq("id", postId).maybeSingle();
    if (!post) throw Object.assign(new Error("Unggahan tidak ditemukan."), { status: 404 });
    const [{ data: profil }, { data: laporan }] = await Promise.all([
      db.from("sosmed_profile").select("profile_key").eq("jenis", "pengguna").eq("penyedia", "upload-post").eq("user_id", Number(post.user_id)).limit(1).maybeSingle(),
      db.from("laporan_video").select("platform, url_video, tanggal_wib, dibuat_pada").eq("tvrku_post_id", postId),
    ]);
    const requestId = post.request_id ? String(post.request_id) : "";
    const [status, pasti] = await Promise.all([
      requestId ? statusUnggahUp(requestId).catch((e) => ({ galat: e instanceof Error ? e.message : String(e) })) : null,
      requestId ? analitikPostUp(requestId).then((m) => Object.fromEntries(m)).catch((e) => ({ galat: e instanceof Error ? e.message : String(e) })) : null,
    ]);
    const media: Record<string, unknown> = {};
    const profilKey = String(profil?.profile_key ?? "");
    for (const pf of (post.platforms ?? []) as string[]) {
      media[pf] = profilKey ? await postinganTerbaruUp(profilKey, pf, 6).catch((e) => ({ galat: e instanceof Error ? e.message : String(e) })) : "profil tidak ada";
    }
    return { post, profil: profilKey, status, pasti, media, laporan_terkait: laporan ?? [] };
  });
}
