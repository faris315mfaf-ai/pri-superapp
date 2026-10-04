// /api/media/kompres — KOMPRESI VIDEO OTOMATIS di Cloudinary (5 Sep 2026).
//
// Dipanggil peramban SETELAH video terunggah langsung ke Cloudinary
// (unsigned preset) dan ternyata > 50 MB. Server (pemegang API secret)
// meminta Cloudinary membuat versi terkompres lewat explicit + eager
// sinkron: plafon bitrate dihitung dari durasi supaya hasil <= 50 MB,
// resolusi dibatasi 1080x1920, kodek H.264/AAC. Video <= 50 MB tidak
// disentuh sama sekali (perlu=false).
//
// Kenapa sinkron: kompresi 50-100 MB memakan 30-90 detik; fungsi ini
// diberi napas 300 detik dan klien menampilkan penghitung waktu.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { BATAS_KOMPRES_MB, konfigUploadCloudinary, kompresVideoCloudinary } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    // Kompresi sinkron membakar kredit Cloudinary + menduduki fungsi 300 dtk.
    // public_id datang dari klien dan tak bisa diikat ke pemilik (preset
    // unsigned memberi id acak), jadi rem penyalahgunaan = batas per akun:
    // 12 kompresi / 10 menit cukup untuk pemakaian wajar.
    const tolak = await pastikanTidakMelebihiBatas(request, "media-kompres", 12, 600, String(user.id));
    if (tolak) return tolak;
    if (!konfigUploadCloudinary()) {
      throw Object.assign(new Error("Penyimpanan video (Cloudinary) belum diatur."), { status: 503 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      public_id?: string;
      bytes?: number;
      duration?: number;
    };
    const publicId = String(body.public_id ?? "").trim();
    if (!publicId || publicId.length > 200 || !/^[\w/-]+$/.test(publicId)) {
      throw Object.assign(new Error("Berkas video tidak dikenal."), { status: 400 });
    }
    const bytes = Number(body.bytes ?? 0);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      throw Object.assign(new Error("Ukuran berkas tidak dikenal."), { status: 400 });
    }
    const duration = Number(body.duration ?? 0);
    const hasil = await kompresVideoCloudinary(publicId, bytes, Number.isFinite(duration) ? duration : 0);
    return { ...hasil, kompres_mb: BATAS_KOMPRES_MB };
  });
}
