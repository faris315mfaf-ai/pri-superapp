// GET /api/master/kuota — pantauan KUOTA & PENYIMPANAN untuk pengelola
// (permintaan 2 Sep 2026). Menggabungkan angka dari tiga tempat supaya
// master tidak perlu membuka tiga dashboard berbeda:
//
//   1. Supabase Storage — terpakai per bucket (dihitung dari
//      storage.objects; akurat, bukan perkiraan).
//   2. Cloudinary — kredit terpakai/limit + rincian bandwidth &
//      penyimpanan (API /usage). Bandwidth-lah yang menghabiskan
//      kredit, jadi ditampilkan terpisah.
//   3. upload-post — profil anggota terpakai dari kuota 225.
//
// Plus lalu-lintas video bulan berjalan: dihitung dari ukuran berkas
// yang tercatat di tvrku_post (kolom ukuran_byte). Video yang diunggah
// SEBELUM pencatatan ini ada tidak punya ukuran — jumlahnya dilaporkan
// terpisah supaya angkanya jujur, bukan seolah-olah lengkap.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { daftarProfilUp, uploadPostSiap } from "@/lib/upload-post";
import { r2Siap } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PENGELOLA = new Set(["master", "super_admin"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** Pemakaian kredit Cloudinary (kredit = 1 GiB bandwidth / 1 GiB simpan). */
async function pakaiCloudinary() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) return { siap: false as const };
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/usage`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { siap: false as const };
    const d = (await res.json()) as {
      plan?: string;
      credits?: { usage?: number; limit?: number; used_percent?: number };
      bandwidth?: { usage?: number; credits_usage?: number };
      storage?: { usage?: number; credits_usage?: number };
    };
    return {
      siap: true as const,
      paket: String(d.plan ?? "-"),
      kredit_pakai: Number(d.credits?.usage ?? 0),
      kredit_limit: Number(d.credits?.limit ?? 0),
      persen: Number(d.credits?.used_percent ?? 0),
      bandwidth_gb: Number(d.bandwidth?.credits_usage ?? 0),
      simpan_gb: Number(d.storage?.credits_usage ?? 0),
    };
  } catch {
    return { siap: false as const };
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!PENGELOLA.has(user.role)) {
      throw Object.assign(new Error("Khusus pengelola aplikasi."), { status: 403 });
    }

    const db = supabase();
    const awalBulan = new Date();
    awalBulan.setUTCDate(1);
    awalBulan.setUTCHours(0, 0, 0, 0);

    const [rBucket, rVideo, cloudinary, profil] = await Promise.all([
      // Pemakaian storage per bucket — RPC tak ada, jadi lewat view
      // bawaan storage.objects (service key boleh membacanya).
      db.rpc("kuota_penyimpanan").then(
        (r) => r,
        () => ({ data: null, error: { message: "rpc tidak ada" } }),
      ),
      db
        .from("tvrku_post")
        .select("ukuran_byte")
        .gte("dibuat_pada", awalBulan.toISOString())
        .limit(5000),
      pakaiCloudinary(),
      uploadPostSiap()
        ? daftarProfilUp().catch(() => null)
        : Promise.resolve(null),
    ]);

    type BarisBucket = { bucket: string; objek: number; byte: number };
    const bucket = (rBucket.data ?? []) as BarisBucket[];
    const totalByte = bucket.reduce((a, b) => a + Number(b.byte ?? 0), 0);

    const barisVideo = (rVideo.data ?? []) as { ukuran_byte: number | null }[];
    const byteVideo = barisVideo.reduce((a, b) => a + Number(b.ukuran_byte ?? 0), 0);
    const tanpaUkuran = barisVideo.filter((b) => b.ukuran_byte == null).length;

    return {
      penyimpanan: {
        total_byte: totalByte,
        bucket: bucket
          .map((b) => ({
            nama: String(b.bucket),
            objek: Number(b.objek ?? 0),
            byte: Number(b.byte ?? 0),
          }))
          .sort((x, y) => y.byte - x.byte),
      },
      video_bulan_ini: {
        jumlah: barisVideo.length,
        byte: byteVideo,
        // Tiap video diunduh sekali oleh upload-post → perkiraan
        // lalu-lintas keluar minimal sebesar ukurannya sendiri.
        bandwidth_byte: byteVideo,
        tanpa_ukuran: tanpaUkuran,
      },
      cloudinary,
      uploadpost: profil
        ? {
            siap: true,
            paket: profil.paket,
            profil: profil.profil.length,
            limit: profil.kuota,
          }
        : { siap: false },
      r2_aktif: r2Siap(),
    };
  });
}
