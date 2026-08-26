// GET /api/video-antrian/<kode> — pantau kemajuan satu video
//
// Dipakai layar "Sedang Memproses Video" untuk menanyakan berulang kali
// (polling) sudah sampai tahap mana n8n bekerja. Angka `tahap`, `persen`,
// dan `tahap_nama` diisi oleh n8n lewat fungsi tv_maju_tahap() di
// Supabase — jadi yang tampil di layar adalah kemajuan SEBENARNYA,
// bukan animasi yang menebak-nebak seperti versi sebelumnya.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehProsesVideo } from "@/types";
import { adalahPimred } from "@/lib/jabatan";
import { hapusVideoCloudinary } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return bungkus(async () => {
    const { id } = await params;

    const { data, error } = await supabase()
      .from("v_app_video_antrian")
      .select(
        "id, judul, jenis, link, video_asli, caption_asli, caption_platform, judul_overlay, highlight, status, tahap, tahap_nama, persen, hasil_render_url, pesan_error, sumber_akun, thumbnail_url, link_instagram, platform_terunggah, jam_tanggal",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[Supabase] pantau video:", error.message);
      throw new Error("Gagal membaca kemajuan proses video");
    }
    if (!data) {
      throw Object.assign(new Error("Video tidak ditemukan"), { status: 404 });
    }

    return data;
  });
}

/**
 * PATCH — simpan suntingan admin pada judul overlay / caption.
 * Dipakai layar pratinjau: judul dan caption yang dibuat AI boleh
 * diperbaiki manusia sebelum video diunggah.
 */
// Platform tujuan yang caption khususnya boleh disimpan, beserta
// batas keras di sisi server. Batas X memakai angka Premium (25.000)
// karena server tidak tahu jenis akunnya; batas akun standar (280)
// dijaga di layar pratinjau tempat admin bisa memilih.
const BATAS_CAPTION: Record<string, number> = {
  instagram: 2200,
  tiktok: 2200,
  youtube: 5000,
  facebook: 63206,
  twitter: 25000,
  threads: 500,
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return bungkus(async () => {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      judul_overlay?: string;
      caption_asli?: string;
      highlight?: string;
      caption_platform?: Record<string, string>;
    };

    // Hanya kirim kolom yang benar-benar disebut, supaya mengedit caption
    // saja tidak ikut mengosongkan judul.
    const ubahan: Record<string, unknown> = {};
    if (typeof body.judul_overlay === "string") {
      ubahan.judul_overlay = body.judul_overlay.slice(0, 200);
      ubahan.judul = body.judul_overlay.slice(0, 200);
    }
    if (typeof body.caption_asli === "string") {
      ubahan.caption_asli = body.caption_asli;
    }
    if (typeof body.highlight === "string") {
      ubahan.highlight = body.highlight.slice(0, 80);
    }
    if (body.caption_platform && typeof body.caption_platform === "object") {
      // Hanya platform yang dikenal yang disimpan; panjangnya dipangkas
      // ke batas resmi platform itu. String kosong berarti "pakai
      // caption utama" dan tidak perlu disimpan.
      const bersih: Record<string, string> = {};
      for (const [platform, isi] of Object.entries(body.caption_platform)) {
        const batas = BATAS_CAPTION[platform];
        if (!batas || typeof isi !== "string") continue;
        const teks = isi.trim();
        if (teks) bersih[platform] = teks.slice(0, batas);
      }
      ubahan.caption_platform = bersih;
    }

    if (Object.keys(ubahan).length === 0) {
      throw Object.assign(new Error("Tidak ada perubahan yang dikirim"), {
        status: 400,
      });
    }

    const { error } = await supabase()
      .from("video_antrian")
      .update(ubahan)
      .eq("kode", id);

    if (error) {
      console.error("[Supabase] simpan suntingan video:", error.message);
      throw new Error("Gagal menyimpan perubahan");
    }

    return { sukses: true };
  });
}

/**
 * DELETE — hapus satu video dari antrian TV Rakyat official.
 *
 * Boleh dihapus pada tahap apa pun SEBELUM tayang: sedang diproses,
 * siap ditinjau, menunggu ACC, atau ditolak. Video yang SUDAH tayang
 * di sosmed sengaja TIDAK bisa dihapus dari sini — barisnya adalah
 * catatan bahwa unggahan itu benar terjadi, dan menghapusnya tidak
 * akan menurunkan postingannya dari Instagram.
 *
 * Media di Cloudinary (untuk kiriman manual) ikut dibuang supaya
 * penyimpanan tidak menyisakan berkas yatim.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return bungkus(async () => {
    const h = request.headers.get("authorization") ?? "";
    const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
    const pengguna = await userDariToken(token);
    if (!pengguna) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    if (!bolehProsesVideo(pengguna.role) && !adalahPimred(pengguna)) {
      throw Object.assign(
        new Error("Hanya tim TV Rakyat atau Pimpinan Redaksi yang boleh menghapus video."),
        { status: 403 },
      );
    }

    const { id } = await params;
    const db = supabase();
    const { data: video } = await db
      .from("video_antrian")
      .select("kode, status, cloudinary_public_id, judul, judul_overlay")
      .eq("kode", id)
      .maybeSingle();
    if (!video) throw Object.assign(new Error("Video tidak ditemukan."), { status: 404 });

    if (video.status === "SUDAH DIPROSES") {
      throw Object.assign(
        new Error(
          "Video ini sudah tayang di sosmed, jadi catatannya tidak bisa dihapus. Turunkan postingannya langsung di platformnya bila perlu.",
        ),
        { status: 409 },
      );
    }

    if (video.cloudinary_public_id) {
      await hapusVideoCloudinary(video.cloudinary_public_id as string);
    }

    const { error } = await db.from("video_antrian").delete().eq("kode", id);
    if (error) {
      console.error("[video-antrian] hapus:", error.message);
      throw new Error("Gagal menghapus video.");
    }
    return { sukses: true };
  });
}
