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

// ------------------------------------------------------------
// KOMPRESI OTOMATIS (5 Sep 2026): video > BATAS_KOMPRES_MB dikompres
// oleh Cloudinary (eager/explicit, sinkron) menjadi <= 50 MB. Caranya:
// batasi BITRATE MAKSIMUM sesuai durasi (50 MB x 8 bit / detik), bukan
// menurunkan kualitas secara buta — bitrate variabel di bawah plafon
// itu tetap memakai kualitas asli untuk adegan yang mudah dikompres.
// Resolusi dibatasi 1080x1920 (c_limit: tidak pernah memperbesar).
// Hasil: berkas turunan (derived) tersimpan di Cloudinary dan ikut
// terhapus saat aslinya dihapus (destroy). Video <= 50 MB TIDAK disentuh.
// ------------------------------------------------------------
export const BATAS_KOMPRES_MB = 50;
/** Batas berkas Cloudinary paket Free (media_limits.video_max_size_bytes). */
export const BATAS_BERKAS_CLOUDINARY_MB = 100;

export type RencanaKompres = {
  perlu: boolean;
  br_kbps: number;
  lebar: number;
  tinggi: number;
  transformasi: string;
};

/**
 * Susun transformasi Cloudinary supaya hasilnya <= BATAS_KOMPRES_MB.
 * `sisihkan` = faktor cadangan untuk overhead kontainer + audio.
 */
export function rencanaKompres(bytes: number, durasiDetik: number, sisihkan = 0.9): RencanaKompres {
  const batasByte = BATAS_KOMPRES_MB * 1024 * 1024;
  if (!Number.isFinite(bytes) || bytes <= batasByte) {
    return { perlu: false, br_kbps: 0, lebar: 0, tinggi: 0, transformasi: "" };
  }
  // Durasi tak diketahui → anggap 3 menit (aman: bitrate lebih rendah).
  const durasi = Number.isFinite(durasiDetik) && durasiDetik > 0 ? durasiDetik : 180;
  // Bitrate maksimum (kbps) supaya durasi x bitrate <= batas.
  let br = Math.floor((batasByte * 8 * sisihkan) / durasi / 1000);
  br = Math.max(600, Math.min(12_000, br));
  // Bitrate rendah pada 1080p terlihat pecah → turunkan ke 720p dulu.
  const lebar = br < 2000 ? 720 : 1080;
  const tinggi = br < 2000 ? 1280 : 1920;
  return {
    perlu: true,
    br_kbps: br,
    lebar,
    tinggi,
    // q_auto:best = kualitas tertinggi; bila bentrok dengan plafon bitrate,
    // Cloudinary mendahulukan plafon (dokumentasi br) → tetap <= 50 MB.
    transformasi: `c_limit,h_${tinggi},w_${lebar}/br_${br}k,q_auto:best,vc_h264,ac_aac`,
  };
}

export type HasilKompres = {
  perlu: boolean;
  secure_url: string;
  bytes: number;
  transformasi: string;
  br_kbps: number;
  percobaan: number;
};

/**
 * Minta Cloudinary membuat versi terkompres (explicit + eager sinkron).
 * Bila hasil masih > batas (bitrate variabel meleset), coba sekali lagi
 * dengan plafon 15% lebih rendah. Melempar bila kredensial tidak ada.
 */
export async function kompresVideoCloudinary(
  publicId: string,
  bytes: number,
  durasiDetik: number,
): Promise<HasilKompres> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw Object.assign(new Error("Kredensial Cloudinary (key/secret) belum diatur."), { status: 503 });
  }
  const batasByte = BATAS_KOMPRES_MB * 1024 * 1024;
  let sisihkan = 0.9;
  let terakhir: HasilKompres | null = null;
  for (let percobaan = 1; percobaan <= 2; percobaan++) {
    const rencana = rencanaKompres(bytes, durasiDetik, sisihkan);
    if (!rencana.perlu) {
      return { perlu: false, secure_url: "", bytes, transformasi: "", br_kbps: 0, percobaan: 0 };
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string> = {
      eager: rencana.transformasi,
      eager_async: "false",
      public_id: publicId,
      timestamp: String(timestamp),
      type: "upload",
    };
    const dasar =
      Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join("&") + apiSecret;
    const signature = createHash("sha1").update(dasar).digest("hex");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/explicit`, {
      method: "POST",
      body: new URLSearchParams({ ...params, api_key: apiKey, signature }),
      signal: AbortSignal.timeout(280_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      eager?: { secure_url?: string; bytes?: number }[];
      error?: { message?: string };
    };
    const e = json.eager?.[0];
    if (!res.ok || !e?.secure_url) {
      throw new Error(`Cloudinary gagal mengompres: ${json.error?.message ?? res.status}`);
    }
    terakhir = {
      perlu: true,
      secure_url: e.secure_url,
      bytes: Number(e.bytes ?? 0),
      transformasi: rencana.transformasi,
      br_kbps: rencana.br_kbps,
      percobaan,
    };
    if (terakhir.bytes > 0 && terakhir.bytes <= batasByte) return terakhir;
    sisihkan *= 0.85;
  }
  return terakhir as HasilKompres;
}
