// TV RAKYAT SAYA — antrean posting TERJADWAL milik saya (2 Sep 2026).
//
// GET    → daftar jadwal yang BELUM tayang untuk profil upload-post
//          milik pemanggil (dari GET /uploadposts/schedule, disaring).
// DELETE { job_id } → "batalkan".
//
// CATATAN JUJUR soal pembatalan: upload-post TIDAK menyediakan API
// pembatalan (diverifikasi 2 Sep 2026: DELETE /uploadposts/schedule
// → 405, per-job → 404). Yang bisa kita lakukan: MENGHAPUS BERKAS
// VIDEO-nya lebih dulu, sehingga saat jadwal tiba upload-post tidak
// menemukan videonya dan posting itu gagal terbit. Karena itu:
//   - kiriman berkas (R2/Cloudinary/bucket) → BISA dibatalkan;
//   - kiriman TAUTAN milik anggota → TIDAK bisa (berkasnya bukan milik
//     kita; anggota harus mencabut sendiri di sumber tautannya).
// Layar menyampaikan batasan ini apa adanya, bukan menjanjikan
// pembatalan bersih yang tidak ada.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { daftarJadwalUp, uploadPostSiap } from "@/lib/upload-post";
import { hapusVideoCloudinary } from "@/lib/cloudinary";
import { dariR2, hapusVideoR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Profil upload-post milik user. */
async function profilUp(userId: number): Promise<string | null> {
  const { data } = await supabase()
    .from("sosmed_profile")
    .select("profile_key")
    .eq("jenis", "pengguna")
    .eq("penyedia", "upload-post")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.profile_key as string) ?? null;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!uploadPostSiap()) return { data: [] };
    const profil = await profilUp(Number(user.id));
    if (!profil) return { data: [] };

    const semua = await daftarJadwalUp().catch(() => []);
    const db = supabase();
    // Riwayat milik user ini untuk mencocokkan job_id → baris kita
    // (request_id menampung job_id balasan post terjadwal).
    const { data: baris } = await db
      .from("tvrku_post")
      .select("request_id, video_path, video_url")
      .eq("user_id", Number(user.id))
      .not("request_id", "is", null)
      .limit(200);
    const peta = new Map(
      (baris ?? []).map((b) => [String(b.request_id), b as { video_path: string; video_url: string }]),
    );

    const data = semua
      .filter((j) => j.profil === profil)
      .map((j) => {
        const milik = peta.get(j.job_id);
        return {
          ...j,
          // Hanya kiriman berkas milik kita yang bisa dibatalkan.
          bisa_batal: Boolean(milik?.video_path),
        };
      });
    return { data };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as { job_id?: string };
    const jobId = String(body.job_id ?? "").trim();
    if (!jobId) throw Object.assign(new Error("job_id wajib diisi."), { status: 400 });

    const db = supabase();
    const { data: baris } = await db
      .from("tvrku_post")
      .select("id, video_path, video_url")
      .eq("user_id", Number(user.id))
      .eq("request_id", jobId)
      .maybeSingle();
    if (!baris) {
      throw Object.assign(new Error("Jadwal tidak ditemukan."), { status: 404 });
    }
    const jalur = String(baris.video_path ?? "");
    const url = String(baris.video_url ?? "");
    if (!jalur) {
      throw Object.assign(
        new Error(
          "Kiriman lewat tautan tidak bisa dibatalkan dari sini — cabut videonya di sumber tautan Anda.",
        ),
        { status: 409 },
      );
    }

    // Hapus berkasnya sesuai generasi penyimpanan.
    if (dariR2(url)) await hapusVideoR2(jalur);
    else if (url.includes("res.cloudinary.com")) await hapusVideoCloudinary(jalur);
    else await db.storage.from("tvrku").remove([jalur]);

    await db
      .from("tvrku_post")
      .update({ video_path: "", hapus_media_pada: null })
      .eq("id", baris.id);

    return {
      sukses: true,
      pesan:
        "Video sudah dihapus dari penyimpanan, jadi posting terjadwal itu tidak akan terbit.",
    };
  });
}
