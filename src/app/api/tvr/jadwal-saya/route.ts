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
import { userEfektifTvr } from "@/lib/sebagai";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { daftarJadwalUp, uploadPostSiap } from "@/lib/upload-post";
import { hapusVideoCloudinary } from "@/lib/cloudinary";
import { dariR2, hapusVideoR2 } from "@/lib/r2";
import { PENYEDIA_ANGGOTA } from "@/lib/sosmed-penyedia";
import { saringJadwalMenunggu, waktuJadwal, type BarisPost } from "@/lib/jadwal-tvrku";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  // 4 Sep 2026: admin PALUGODAM bisa mengendalikan akun anggota (header X-Sebagai).
  return userEfektifTvr(request);
}
async function pastikanMasukLama(request: Request) {
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
    .in("penyedia", PENYEDIA_ANGGOTA)
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
      .select("request_id, video_path, jadwal, hasil")
      .eq("user_id", Number(user.id))
      .not("request_id", "is", null)
      .order("id", { ascending: false })
      .limit(200);
    // Job dicocokkan lewat request_id DAN hasil.job_id: "Post Sekarang"
    // menyimpan request_id async, sedangkan antrean upload-post memakai job_id.
    const peta = new Map<string, BarisPost>();
    for (const b of baris ?? []) {
      const isi: BarisPost = { jadwal: b.jadwal ? String(b.jadwal) : null, video_path: b.video_path ? String(b.video_path) : null };
      peta.set(String(b.request_id), isi);
      const hasil = (b.hasil && typeof b.hasil === "object" ? b.hasil : {}) as Record<string, unknown>;
      if (hasil.job_id) peta.set(String(hasil.job_id), isi);
    }

    // Hanya yang benar-benar MENUNGGU tayang (lib/jadwal-tvrku): posting
    // langsung yang masih diproses upload-post tidak ikut, dan tidak bisa
    // "dibatalkan" (itu akan menghapus video yang masih dipakai).
    const data = saringJadwalMenunggu(
      semua.filter((j) => j.profil === profil),
      peta,
    );
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
    // job_id antrean upload-post tersimpan di hasil.job_id (request_id
    // berisi id lain) — dicari di keduanya (24 Sep 2026).
    const kolomBatal = "id, video_path, video_url, jadwal";
    let { data: baris } = await db
      .from("tvrku_post")
      .select(kolomBatal)
      .eq("user_id", Number(user.id))
      .eq("request_id", jobId)
      .maybeSingle();
    if (!baris) {
      ({ data: baris } = await db
        .from("tvrku_post")
        .select(kolomBatal)
        .eq("user_id", Number(user.id))
        .eq("hasil->>job_id", jobId)
        .maybeSingle());
    }
    if (!baris) {
      throw Object.assign(new Error("Jadwal tidak ditemukan."), { status: 404 });
    }
    // Penjaga (24 Sep 2026): hanya posting TERJADWAL yang waktunya belum
    // tiba. Menghapus berkas posting yang sedang diproses membuat sosmed
    // yang belum selesai gagal terbit.
    const waktu = baris.jadwal ? waktuJadwal(String(baris.jadwal)) : NaN;
    if (!Number.isFinite(waktu) || waktu <= Date.now()) {
      throw Object.assign(
        new Error("Posting ini sudah atau sedang tayang — tidak bisa dibatalkan lagi."),
        { status: 409 },
      );
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
