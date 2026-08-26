// PATCH /api/tv/persetujuan — Pimpinan Redaksi menyetujui / menolak
// sebuah video sebelum boleh diunggah ke sosmed.
// Body: { kode, keputusan: "disetujui" | "ditolak", catatan? }
//
// Hirarki TV Rakyat:
// - Pimpinan Redaksi (jabatan "Pimpinan Redaksi TV Rakyat", plus
//   master sebagai cadangan) → berhak seluruhnya, termasuk memutus.
// - Tim TV Rakyat (role admin_tv) → memindai berita & memproses
//   video, tetapi TIDAK bisa menayangkan tanpa persetujuan Pimred.
//
// Video manual anggota yang DITOLAK: medianya di Cloudinary langsung
// dihapus (tidak perlu menunggu jatuh tempo 2 hari) — video yang
// tidak akan pernah tayang tidak boleh terus memakan penyimpanan.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred } from "@/lib/jabatan";
import { bolehAccVideo } from "@/lib/tv-tim";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { hapusVideoCloudinary } from "@/lib/cloudinary";
import { kirimKabar } from "@/lib/notifikasi";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    await pastikanFiturAktif(
      user,
      "tv.approval",
      "Approval video sedang dimatikan untuk peran Anda.",
    );
    if (!(await bolehAccVideo(user))) {
      throw Object.assign(
        new Error("Anda belum ditunjuk Pimpinan Redaksi untuk menyetujui video."),
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      kode?: string;
      keputusan?: string;
      catatan?: string;
    };
    const kode = (body.kode ?? "").trim();
    if (!kode) throw Object.assign(new Error("Video tidak disebutkan."), { status: 400 });
    const keputusan =
      body.keputusan === "disetujui" || body.keputusan === "ditolak" ? body.keputusan : null;
    if (!keputusan) {
      throw Object.assign(new Error("Keputusan harus disetujui atau ditolak."), { status: 400 });
    }

    const db = supabase();
    const { data: video } = await db
      .from("video_antrian")
      .select("kode, judul, judul_overlay, sumber_upload, diupload_oleh_id, cloudinary_public_id, status")
      .eq("kode", kode)
      .maybeSingle();
    if (!video) throw Object.assign(new Error("Video tidak ditemukan."), { status: 404 });

    const perubahan: Record<string, unknown> = {
      persetujuan: keputusan,
      persetujuan_oleh: user.nama,
      persetujuan_pada: new Date().toISOString(),
    };

    if (video.sumber_upload === "manual") {
      if (keputusan === "disetujui") {
        // Lolos ACC → pindah ke kolom "siap upload" (SIAP DITINJAU
        // adalah status yang tombol unggahnya aktif).
        perubahan.status = "SIAP DITINJAU";
      } else {
        perubahan.status = "DITOLAK PIMRED";
        // Media video yang ditolak dihapus seketika dari Cloudinary.
        if (video.cloudinary_public_id) {
          const terhapus = await hapusVideoCloudinary(video.cloudinary_public_id);
          if (terhapus) {
            perubahan.cloudinary_public_id = null;
            perubahan.hapus_media_pada = null;
          }
          // Gagal terhapus (mis. kredensial belum lengkap): biarkan
          // penanda jatuh temponya — pembersih berkala akan mencoba lagi.
        }
      }
    }

    const { error } = await db.from("video_antrian").update(perubahan).eq("kode", kode);
    if (error) {
      console.error("[tv/persetujuan] simpan:", error.message);
      throw new Error("Gagal menyimpan keputusan.");
    }

    // Kabari pihak yang berkepentingan.
    const judul = video.judul_overlay || video.judul || kode;
    if (video.sumber_upload === "manual" && video.diupload_oleh_id) {
      await kirimKabar({
        judul:
          keputusan === "disetujui"
            ? "Video Anda disetujui Pimred"
            : "Video Anda ditolak Pimred",
        isi:
          keputusan === "disetujui"
            ? `"${judul}" lolos persetujuan dan masuk kolom siap upload.`
            : `"${judul}" ditolak${body.catatan ? `: ${String(body.catatan).slice(0, 140)}` : ""}. Medianya dihapus dari penyimpanan.`,
        kategori: keputusan === "disetujui" ? "sukses" : "peringatan",
        jenis_peristiwa: "tv_persetujuan",
        untukUserIds: [Number(video.diupload_oleh_id)],
      });
    } else {
      await kirimKabar({
        judul: keputusan === "disetujui" ? "Video disetujui Pimred" : "Video ditolak Pimred",
        isi: `"${judul}" ${keputusan} oleh ${user.nama}.`,
        kategori: keputusan === "disetujui" ? "sukses" : "peringatan",
        jenis_peristiwa: "tv_persetujuan",
        untukRole: ["admin_tv"],
      });
    }

    return { sukses: true, persetujuan: keputusan };
  });
}
