// ============================================================
// Mesin Auto Edit versi TypeScript (2 Okt 2026) — pengganti layanan
// Python autoedit/. Setelan dibaca dari environment dengan NAMA dan NILAI
// BAWAAN yang sama persis dengan versi Python (video_edit.py, video_tasks.py,
// video_api.py, tvr_api.py), supaya kedua mesin bisa bergantian memakai
// disk media dan Redis yang sama tanpa beda perilaku.
//
// Modul di folder ini hanya untuk proses Node di luar Next.js (layanan
// autoedit-ts & worker-nya); jangan diimpor dari komponen peramban.
// ============================================================
import path from "node:path";

function angka(nama: string, bawaan: number): number {
  const nilai = Number.parseFloat(process.env[nama] ?? "");
  return Number.isFinite(nilai) ? nilai : bawaan;
}

function teks(nama: string, bawaan: string): string {
  const nilai = (process.env[nama] ?? "").trim();
  return nilai || bawaan;
}

/** Disk media bersama: templates/, jobs/, uploads/, cache/, outro/. */
export const MEDIA_DIR = path.resolve(teks("MEDIA_DIR", ".media"));
/** Font & aset bawaan (Poppins-Bold.ttf, aset outro). */
export const ASET_DIR = path.resolve(teks("AUTOEDIT_ASET_DIR", path.join(process.cwd(), "autoedit", "assets")));

export const PEMILIK_BAWAAN = "";
export const ID_TEMPLATE_BAWAAN = teks("TEMPLATE_BAWAAN_ID", "bawaan-tv-rakyat");
export const PEMILIK_LAMA = teks("TEMPLATE_PEMILIK_LAMA", "godam").toLowerCase();

export const FFMPEG_BIN = teks("FFMPEG_BIN", "ffmpeg");
export const FFPROBE_BIN = teks("FFPROBE_BIN", "ffprobe");
export const YTDLP_BIN = teks("YTDLP_BIN", "yt-dlp");

export const VIDEO_PRESET = teks("VIDEO_PRESET", "veryfast");
export const VIDEO_CRF = teks("VIDEO_CRF", "23");
export const VIDEO_THREADS = teks("VIDEO_THREADS", "2");

export const MAX_SOURCE_SECONDS = angka("VIDEO_MAX_SOURCE_SECONDS", 600);
export const RENDER_TIMEOUT_SECONDS = angka("VIDEO_RENDER_TIMEOUT", 1800);
export const DOWNLOAD_TIMEOUT_SECONDS = angka("VIDEO_DOWNLOAD_TIMEOUT", 600);
export const PREVIEW_TIMEOUT_SECONDS = angka("VIDEO_PREVIEW_TIMEOUT", 45);
export const SOURCE_CACHE_SECONDS = angka("VIDEO_SOURCE_CACHE_SECONDS", 21600);
export const MAX_SOURCE_UPLOAD_MB = angka("VIDEO_MAX_SOURCE_UPLOAD_MB", 100);
// Kompres Video menerima video lebih besar (6 Okt 2026): 1 GB. Video asli
// dihapus begitu hasil kompresnya jadi (atau gagal) — yang tersisa hanya hasil.
// Caddy di VPS aplikasi memberi jalur kompres batas tersendiri (vps/11, vps/21).
export const MAX_KOMPRES_UPLOAD_MB = angka("VIDEO_MAX_KOMPRES_UPLOAD_MB", 1024);
export const MAX_UNDUH_MB = Math.trunc(angka("VIDEO_MAX_UNDUH_MB", 200));
export const AWALAN_UNGGAHAN = "upload://";

export const SITUS_DIIZINKAN: readonly string[] = teks(
  "VIDEO_SITUS_DIIZINKAN",
  "instagram.com,cdninstagram.com,tiktok.com,tiktokcdn.com,tiktokv.com," +
    "youtube.com,youtu.be,googlevideo.com,facebook.com,fb.watch,fbcdn.net," +
    "x.com,twitter.com,twimg.com,threads.net,threads.com",
)
  .split(",")
  .map((s) => s.trim().toLowerCase().replace(/^\.+/, ""))
  .filter(Boolean);

export const IG_SESSIONID = teks("VIDEO_IG_SESSIONID", "");
export const UNDUH_PROXY = teks("VIDEO_UNDUH_PROXY", "");
export const JEDA_BATAS_DETIK = angka("VIDEO_JEDA_BATAS", 180);
export const TUNGGU_ULANG_DETIK: readonly number[] = [20, 60];

/** "lebar:tinggi:x:y", angka saja — nilai ini masuk filtergraph ffmpeg. */
export const POLA_CROP = /^\d{1,5}:\d{1,5}:\d{1,5}:\d{1,5}$/;

export const BATAS_FRAME_MB = angka("VIDEO_ASET_FRAME_MB", 2);
export const RUANG_CADANGAN_MB = angka("VIDEO_RUANG_CADANGAN_MB", 80);
// 48 jam = 2 hari: masa simpan Stok video TVR Saya (hasil render + unggahan
// manual) sesuai permintaan. Berlaku juga untuk hasil Edit Video master —
// retensi lebih panjang, beban disk masih kecil.
export const UMUR_SIMPAN_JAM = angka("VIDEO_JOB_RETENTION_HOURS", 48);
export const SELANG_SAPUAN_MENIT = angka("VIDEO_SAPUAN_MENIT", 30);

export const FONT_BUNDLED = path.join(ASET_DIR, "Poppins-Bold.ttf");
export const FONT_CANDIDATES: readonly string[] = [
  teks("VIDEO_FONT", ""),
  FONT_BUNDLED,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
].filter(Boolean);
