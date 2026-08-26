// ============================================================
// PRI SuperApp — Klien Cloudinary (KHUSUS SISI SERVER)
//
// Cloudinary dipakai sebagai "drive kedua" untuk video manual
// anggota. Unggahnya TIDAK lewat server ini (peramban mengirim
// langsung ke Cloudinary memakai unsigned preset — batas 4,5 MB
// badan permintaan Vercel tidak berlaku); yang lewat sini hanya
// PENGHAPUSAN, karena destroy butuh tanda tangan API secret yang
// tidak boleh sampai ke peramban.
// ============================================================
import { createHash } from "node:crypto";

export function konfigUploadCloudinary(): {
  cloudName: string;
  uploadPreset: string;
} | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) return null;
  return { cloudName, uploadPreset };
}

/** true bila kredensial penghapusan lengkap (key + secret) */
export function siapHapusCloudinary(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

/**
 * Hapus satu video permanen dari Cloudinary.
 *
 * Mengembalikan true bila terhapus (atau memang sudah tidak ada).
 * Gagal karena kredensial belum lengkap mengembalikan false TANPA
 * melempar — penghapusan tertunda bukan alasan menggagalkan alur
 * pemanggilnya; barisnya tetap tertanda dan dicoba lagi nanti.
 */
export async function hapusVideoCloudinary(publicId: string): Promise<boolean> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret || !publicId) return false;

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    // Aturan tanda tangan Cloudinary: parameter (selain file/api_key/
    // signature) diurutkan alfabetis, digabung "&", ditambah secret,
    // lalu di-SHA1.
    const dasar = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash("sha1").update(dasar).digest("hex");

    const badan = new URLSearchParams({
      public_id: publicId,
      invalidate: "true",
      timestamp: String(timestamp),
      api_key: apiKey,
      signature,
    });

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/video/destroy`,
      { method: "POST", body: badan },
    );
    const json = (await res.json().catch(() => ({}))) as { result?: string };
    // "ok" = terhapus; "not found" = sudah tidak ada — dua-duanya berarti
    // tujuan tercapai: berkasnya tidak lagi memakan penyimpanan.
    return json.result === "ok" || json.result === "not found";
  } catch (e) {
    console.error("[cloudinary] hapus:", e);
    return false;
  }
}
