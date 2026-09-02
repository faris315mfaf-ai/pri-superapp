#!/usr/bin/env node
/**
 * Membuat semua ikon PWA dari logo resmi PRI (public/logo-pri.png).
 *
 * Dijalankan sekali-sekali saja (bukan bagian dari build), lalu hasil
 * PNG-nya ikut ter-commit — hasilnya deterministik dan menjalankan
 * sharp di setiap build hanya memperlambat deploy.
 *
 *   node scripts/buat-ikon-pwa.mjs
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const SUMBER = join(process.cwd(), "public", "logo-pri.png");
const KELUARAN = join(process.cwd(), "public", "ikon");

/** Merah PRI, diambil dari lingkaran logo */
const MERAH = "#D0021B";

/**
 * Logo aslinya punya latar transparan dan lingkaran merahnya tidak
 * memenuhi seluruh bidang. Kalau dipakai apa adanya:
 *  - di ikon biasa, sudut-sudutnya jadi transparan/putih dan terlihat
 *    "melayang" di peluncur bertema gelap;
 *  - di ikon maskable, Android memotongnya jadi lingkaran sehingga
 *    tepi harimau bisa terpotong.
 * Karena itu ikon dibuat dua versi dengan perlakuan berbeda.
 */

/** Ikon biasa: logo memenuhi bidang, latar putih agar kontras di mana pun. */
async function ikonBiasa(ukuran) {
  const isi = Math.round(ukuran * 0.92); // sedikit ruang napas di tepi
  const logo = await sharp(SUMBER)
    .trim() // buang ruang kosong transparan di sekeliling logo
    .resize(isi, isi, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();

  return sharp({
    create: {
      width: ukuran,
      height: ukuran,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Ikon maskable: Android memotong ikon sesuai bentuk peluncur
 * (lingkaran, kotak membulat, dsb). Isi penting harus berada di dalam
 * "safe zone" 80% bagian tengah, dan latarnya WAJIB memenuhi seluruh
 * bidang — kalau tidak, akan muncul bingkai putih di sekeliling ikon.
 */
async function ikonMaskable(ukuran) {
  const isi = Math.round(ukuran * 0.72); // 72% -> aman di dalam safe zone 80%
  const logo = await sharp(SUMBER)
    .trim()
    .resize(isi, isi, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp({
    create: {
      width: ukuran,
      height: ukuran,
      channels: 4,
      background: MERAH,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Logo untuk dipakai DI DALAM aplikasi (layar masuk, splash, banner
 * notifikasi, modal "Tentang Aplikasi").
 *
 * Kenapa tidak memakai ikonBiasa() saja? Karena tujuannya berbeda:
 *  - ikonBiasa() SENGAJA memberi latar putih penuh sebidang, sebab ikon
 *    peluncur Android/iOS selalu digambar sebagai kotak/bulat penuh dan
 *    tidak boleh tembus pandang.
 *  - Di dalam aplikasi, logo ditempel di atas latar kaca yang temanya
 *    bisa terang atau gelap. Kalau ia membawa latar putih sebidang,
 *    hasilnya kotak putih kaku yang merusak tampilan kaca. Jadi versi ini
 *    latarnya DIBIARKAN TRANSPARAN; alas putihnya diurus komponen React
 *    (src/components/logo-pri.tsx) supaya bentuk dan opasitasnya bisa
 *    menyesuaikan tema.
 * Ukurannya juga lebih kecil (256/512) karena hanya perlu tajam sampai
 * ~80px pada layar 3x, bukan untuk ikon peluncur beresolusi penuh.
 */
async function logoDalamAplikasi(ukuran) {
  return sharp(SUMBER)
    .trim() // logo aslinya tidak center di kanvas 1408px — buang ruang transparannya
    .resize(ukuran, ukuran, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // tetap transparan
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const DAFTAR = [
  { nama: "ikon-192.png", ukuran: 192, maskable: false },
  { nama: "ikon-512.png", ukuran: 512, maskable: false },
  { nama: "ikon-maskable-192.png", ukuran: 192, maskable: true },
  { nama: "ikon-maskable-512.png", ukuran: 512, maskable: true },
  { nama: "apple-touch-icon.png", ukuran: 180, maskable: false },
];

async function main() {
  try {
    await access(SUMBER);
  } catch {
    throw new Error(
      "public/logo-pri.png tidak ditemukan. Simpan logo resmi PRI di sana lebih dulu.",
    );
  }

  await mkdir(KELUARAN, { recursive: true });

  for (const { nama, ukuran, maskable } of DAFTAR) {
    const png = maskable ? await ikonMaskable(ukuran) : await ikonBiasa(ukuran);
    await writeFile(join(KELUARAN, nama), png);
    console.log(
      `  dibuat  ${nama.padEnd(26)} ${ukuran}x${ukuran}  ${Math.round(png.length / 1024)} KB`,
    );
  }

  // Ikon toko untuk APK (Play Store meminta 512x512 tanpa transparansi)
  await writeFile(join(process.cwd(), "apk", "store_icon.png"), await ikonBiasa(512));
  console.log("  dibuat  apk/store_icon.png          512x512");

  // Logo untuk pemakaian di dalam aplikasi (latar transparan)
  for (const ukuran of [256, 512]) {
    const nama = `logo-app-${ukuran}.png`;
    const png = await logoDalamAplikasi(ukuran);
    await writeFile(join(KELUARAN, nama), png);
    console.log(
      `  dibuat  ${nama.padEnd(26)} ${ukuran}x${ukuran}  ${Math.round(png.length / 1024)} KB  (transparan)`,
    );
  }

  console.log(`\nSelesai. ${DAFTAR.length + 3} berkas dibuat dari logo resmi PRI.`);
}

main().catch((e) => {
  console.error("Gagal membuat ikon:", e.message);
  process.exit(1);
});
