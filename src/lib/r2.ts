// ============================================================
// Cloudflare R2 (KHUSUS SISI SERVER) — "rumah singgah" video TVR Saya.
//
// KENAPA R2 (keputusan 1 Sep 2026): video anggota hanya numpang ±2 jam
// (diunduh upload-post untuk diposting, lalu dihapus). Cloudinary
// menagih BANDWIDTH untuk itu — 91% konsumsi kredit akun kita, dan
// untuk 500 anggota butuh ±1.460 kredit/bulan. R2 menggratiskan
// bandwidth keluar sepenuhnya, jadi beban yang sama nyaris nol biaya.
//
// TANPA dependensi baru: URL bertanda tangan (AWS SigV4) dibuat manual
// dengan node:crypto — SDK AWS akan menambah megabyte ke tiap fungsi
// serverless hanya untuk beberapa baris kriptografi ini.
//
// Bucket-nya PRIVAT. Dua macam URL bertanda tangan dipakai:
//   PUT (15 menit)  → HP mengunggah video LANGSUNG ke R2;
//   GET (maks 7 hari) → diserahkan ke upload-post untuk mengunduh.
// Tidak ada bucket publik, tidak butuh domain sendiri, dan URL-nya
// kedaluwarsa sendiri — lebih aman daripada tautan publik permanen.
// ============================================================
import { createHash, createHmac } from "node:crypto";

const WILAYAH = "auto"; // R2 selalu "auto"
const LAYANAN = "s3";

/** Batas keras presigned URL S3/R2: 7 hari. */
export const MAKS_UMUR_URL_DETIK = 7 * 24 * 3600;

export function r2Siap(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

function konfig() {
  const akun = process.env.R2_ACCOUNT_ID ?? "";
  return {
    kunci: process.env.R2_ACCESS_KEY_ID ?? "",
    rahasia: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "",
    host: `${akun}.r2.cloudflarestorage.com`,
  };
}

/** Asal (origin) R2 — dipakai proxy.ts untuk mengizinkan unggahan di CSP. */
export function asalR2(): string {
  const akun = process.env.R2_ACCOUNT_ID;
  return akun ? `https://${akun}.r2.cloudflarestorage.com` : "";
}

/** Encode RFC3986 per segmen; "/" dibiarkan sebagai pemisah jalur. */
function encJalur(s: string): string {
  return s
    .split("/")
    .map((seg) =>
      encodeURIComponent(seg).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

function hmac(kunci: Buffer | string, data: string): Buffer {
  return createHmac("sha256", kunci).update(data, "utf8").digest();
}

function sha256hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * URL bertanda tangan untuk satu objek. `detik` dibatasi 7 hari
 * (aturan SigV4) — pemanggil yang meminta lebih akan dipangkas.
 */
export function presignR2(
  metode: "PUT" | "GET" | "DELETE",
  key: string,
  detik: number,
): string {
  const { kunci, rahasia, bucket, host } = konfig();
  const umur = Math.min(Math.max(60, Math.floor(detik)), MAKS_UMUR_URL_DETIK);

  // Format waktu AWS: YYYYMMDDTHHMMSSZ
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const tanggal = amzDate.slice(0, 8);
  const cakupan = `${tanggal}/${WILAYAH}/${LAYANAN}/aws4_request`;
  const jalurKanonik = `/${encJalur(bucket)}/${encJalur(key)}`;

  const q = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${kunci}/${cakupan}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(umur),
    "X-Amz-SignedHeaders": "host",
  });
  q.sort(); // SigV4 mewajibkan parameter terurut
  const kueriKanonik = q.toString().replace(/\+/g, "%20");

  const permintaanKanonik = [
    metode,
    jalurKanonik,
    kueriKanonik,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const untukDitandatangani = [
    "AWS4-HMAC-SHA256",
    amzDate,
    cakupan,
    sha256hex(permintaanKanonik),
  ].join("\n");

  const kTanggal = hmac(`AWS4${rahasia}`, tanggal);
  const kWilayah = hmac(kTanggal, WILAYAH);
  const kLayanan = hmac(kWilayah, LAYANAN);
  const kTandaTangan = hmac(kLayanan, "aws4_request");
  const tandaTangan = createHmac("sha256", kTandaTangan)
    .update(untukDitandatangani, "utf8")
    .digest("hex");

  return `https://${host}${jalurKanonik}?${kueriKanonik}&X-Amz-Signature=${tandaTangan}`;
}

/**
 * Hapus satu video dari R2. Mengembalikan true bila terhapus (atau
 * memang sudah tidak ada). TIDAK melempar — penghapusan tertunda bukan
 * alasan menggagalkan alur pemanggilnya.
 */
export async function hapusVideoR2(key: string): Promise<boolean> {
  if (!r2Siap() || !key) return false;
  try {
    const res = await fetch(presignR2("DELETE", key, 300), { method: "DELETE" });
    // 204 = terhapus, 404 = sudah tidak ada — dua-duanya tujuan tercapai.
    return res.status === 204 || res.status === 200 || res.status === 404;
  } catch (e) {
    console.error("[r2] hapus:", e);
    return false;
  }
}

/** true bila URL video ini milik R2 (dipakai penyapu membedakan generasi). */
export function dariR2(videoUrl: string): boolean {
  return videoUrl.includes(".r2.cloudflarestorage.com");
}
