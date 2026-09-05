// ============================================================
// KOMPRES di Cloudinary → SALIN ke R2 (5 Sep 2026) — sisi SERVER.
//
// Jalur TVR Saya (Unggah ke Sosmed Saya, Siaran Serentak, Studio) memakai
// R2 yang tidak bisa mengompres. Untuk video > 50 MB: peramban mengunggah
// ke Cloudinary dulu, server meminta versi terkompres (lib/cloudinary),
// mengunduhnya, menaruhnya ke R2 dengan kunci milik user, lalu MENGHAPUS
// berkas di Cloudinary (asli + turunan) supaya penyimpanan/kuota
// Cloudinary tidak terpakai lama. Alur di belakangnya (upload-post,
// siaran, studio, penyapu R2) tidak berubah karena tetap menerima r2_key.
// ============================================================
import { BATAS_KOMPRES_MB, hapusVideoCloudinary, kompresVideoCloudinary } from "@/lib/cloudinary";
import { presignR2, r2Siap } from "@/lib/r2";
import { supabase } from "@/lib/supabase";

export type HasilKompresR2 = {
  /** "r2" (utama) atau "supabase" (cadangan bucket tvrku bila R2 belum diatur) */
  cara: "r2" | "supabase";
  bytes: number;
  dikompres: boolean;
  br_kbps: number;
  percobaan: number;
};

export async function kompresLaluSalinKeR2(
  publicId: string,
  bytes: number,
  durasiDetik: number,
  r2Key: string,
): Promise<HasilKompresR2> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud) {
    throw Object.assign(new Error("Cloudinary belum diatur."), { status: 503 });
  }

  // 1. Kompres (bila > 50 MB). Yang sudah kecil langsung disalin apa adanya.
  const hasil = await kompresVideoCloudinary(publicId, bytes, durasiDetik);
  const sumber = hasil.perlu
    ? hasil.secure_url
    : `https://res.cloudinary.com/${cloud}/video/upload/${publicId}.mp4`;

  // 2. Unduh hasilnya (<= 50 MB, muat di memori fungsi).
  const res = await fetch(sumber, { signal: AbortSignal.timeout(150_000) });
  if (!res.ok) throw new Error(`Gagal mengambil hasil kompresi dari Cloudinary (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Hasil kompresi kosong.");
  if (buf.length > BATAS_KOMPRES_MB * 1024 * 1024) {
    throw new Error(
      `Hasil kompresi masih ${Math.round(buf.length / 1048576)} MB (di atas ${BATAS_KOMPRES_MB} MB). Coba video yang lebih pendek.`,
    );
  }

  // 3. Simpan dengan kunci milik user (pola sama dengan aksi "siapkan"):
  //    utama R2; cadangan bucket Supabase "tvrku" bila R2 belum diatur
  //    (produksi saat ini memakai bucket Supabase — batas global 50 MB,
  //    persis alasan hasil kompresi dipatok <= 50 MB).
  let cara: "r2" | "supabase" = "r2";
  if (r2Siap()) {
    const put = await fetch(presignR2("PUT", r2Key, 10 * 60), {
      method: "PUT",
      body: buf,
      headers: { "content-type": "video/mp4" },
      signal: AbortSignal.timeout(150_000),
    });
    if (!put.ok) throw new Error(`Penyimpanan R2 menolak berkas (${put.status}).`);
  } else {
    cara = "supabase";
    const { error } = await supabase()
      .storage.from("tvrku")
      .upload(r2Key, buf, { contentType: "video/mp4", upsert: false });
    if (error) throw new Error(`Penyimpanan menolak berkas: ${error.message}`);
  }

  // 4. Bersihkan Cloudinary — tidak fatal bila gagal (penyapu Cloudinary
  //    di /api/tv/manual juga membersihkan berkas kedaluwarsa).
  await hapusVideoCloudinary(publicId);

  return { cara, bytes: buf.length, dikompres: hasil.perlu, br_kbps: hasil.br_kbps, percobaan: hasil.percobaan };
}
