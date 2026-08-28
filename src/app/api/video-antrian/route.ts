// GET /api/video-antrian — antrian & riwayat video TV Rakyat
// + ringkasan jumlah video per status.
// Sumber: Supabase (view v_app_video_antrian). Diisi workflow n8n TV Rakyat.
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

type Video = { status: string };

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    await pastikanMasuk(request);
    const data = pastikanSukses(
      await supabase()
        .from("v_app_video_antrian")
        .select(
          // hasil_render_url ikut diambil supaya baris riwayat bisa langsung
          // diklik untuk memutar videonya tanpa permintaan tambahan.
          "id, judul, link, jenis, video_asli, caption_asli, caption_platform, judul_overlay, highlight, status, link_instagram, thumbnail_url, jam_tanggal, platform_terunggah, hasil_render_url, digenerate_oleh, persetujuan, persetujuan_oleh, sumber_upload, diupload_oleh, ayrshare_hasil",
        )
        .order("jam_tanggal", { ascending: false })
        .limit(100),
      "antrian video",
    ) as Video[];

    const ringkasan: Record<string, number> = {};
    for (const v of data) {
      ringkasan[v.status] = (ringkasan[v.status] ?? 0) + 1;
    }

    return { data, ringkasan };
  });
}
