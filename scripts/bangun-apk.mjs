#!/usr/bin/env node
/**
 * Membangun APK PRI SuperApp (Trusted Web Activity) tanpa prompt.
 *
 * Kenapa tidak memakai perintah `bubblewrap` biasa: seluruh perintah
 * CLI-nya interaktif (menanyakan JDK, checksum, dsb) dan menolak
 * berjalan bila tidak ada terminal sungguhan. Pustaka intinya
 * (@bubblewrap/core) menyediakan langkah yang sama tanpa prompt, jadi
 * skrip ini memanggilnya langsung.
 *
 * Jalankan:  node scripts/bangun-apk.mjs
 *
 * Hasil: apk/app-release-signed.apk
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(
  "file:///C:/Users/Admin/AppData/Roaming/npm/node_modules/@bubblewrap/cli/",
);
const core = require("@bubblewrap/core");
const { AndroidSdkTools, Config, ConsoleLog, GradleWrapper, JdkHelper, TwaGenerator, TwaManifest } =
  core;

const DIR_APK = join(process.cwd(), "apk");
const BERKAS_KUNCI = join(DIR_APK, "KUNCI-PENTING.txt");

/** Ambil sandi keystore dari berkas lokal; tidak pernah dicetak. */
function sandiKeystore() {
  if (!existsSync(BERKAS_KUNCI)) {
    throw new Error(
      "apk/KUNCI-PENTING.txt tidak ditemukan. Berkas ini memuat sandi keystore.",
    );
  }
  const baris = readFileSync(BERKAS_KUNCI, "utf8")
    .split("\n")
    .find((b) => b.startsWith("Kata sandi"));
  const sandi = baris?.split(":").slice(1).join(":").trim();
  if (!sandi) throw new Error("Sandi keystore tidak terbaca dari KUNCI-PENTING.txt");
  return sandi;
}

async function main() {
  const log = new ConsoleLog("apk");
  const sandi = sandiKeystore();

  // Config dimuat langsung dari berkas, bukan lewat helper CLI —
  // helper itu akan memunculkan prompt bila berkasnya belum ada.
  const config = await Config.loadConfig(
    join(process.env.USERPROFILE || process.env.HOME || "", ".bubblewrap", "config.json"),
  );
  if (!config) throw new Error("~/.bubblewrap/config.json tidak terbaca");
  const jdkHelper = new JdkHelper(process, config);
  const androidSdkTools = await AndroidSdkTools.create(process, config, jdkHelper, log);

  const twaManifest = await TwaManifest.fromFile(join(DIR_APK, "twa-manifest.json"));

  console.log("\n[1/3] Menyusun proyek Android dari twa-manifest.json...");
  const generator = new TwaGenerator();
  await generator.createTwaProject(DIR_APK, twaManifest, log);

  console.log("[2/3] Menjalankan Gradle assembleRelease (unduhan pertama lama)...");
  const gradle = new GradleWrapper(process, androidSdkTools, DIR_APK);
  // Windows tidak mencari executable di direktori kerja, sedangkan
  // GradleWrapper memanggilnya sebagai "gradlew.bat" polos. Diberi
  // jalur absolut supaya tidak bergantung pada PATH.
  gradle.gradleCmd = join(DIR_APK, "gradlew.bat");
  await gradle.assembleRelease();

  console.log("[3/3] Menandatangani & merapikan APK...");
  const apkMentah = join(DIR_APK, "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk");
  const apkRapi = join(DIR_APK, "app-release-unsigned-aligned.apk");
  const apkFinal = join(DIR_APK, "app-release-signed.apk");

  await androidSdkTools.zipalign(apkMentah, apkRapi);

  // Penandatanganan dijalankan sendiri, tidak lewat androidSdkTools.
  // Helper bawaannya merangkai perintah sebagai satu string shell tanpa
  // tanda kutip, sehingga jalur JDK yang mengandung spasi
  // ("C:\Program Files\...") terpotong di spasi pertama dan gagal.
  // execFile dengan argumen berbentuk array tidak punya masalah itu.
  // Sandi dikirim lewat berkas, bukan argumen, supaya tidak muncul di
  // daftar proses maupun di pesan error bila terjadi kegagalan.
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { writeFile, rm } = await import("node:fs/promises");
  const jalankan = promisify(execFile);

  const berkasSandi = join(DIR_APK, ".sandi-sementara");
  // Sandi ditulis DUA baris. apksigner membaca berkas ini secara
  // berurutan: baris pertama untuk --ks-pass, baris berikutnya untuk
  // --key-pass. Dengan satu baris saja ia melapor "end of file reached"
  // saat mencari sandi kedua.
  await writeFile(berkasSandi, `${sandi}\n${sandi}\n`, "utf8");
  try {
    await jalankan(
      join(config.jdkPath, "bin", "java.exe"),
      [
        "-jar",
        join(config.androidSdkPath, "build-tools", "36.1.0", "lib", "apksigner.jar"),
        "sign",
        "--ks", twaManifest.signingKey.path,
        "--ks-key-alias", twaManifest.signingKey.alias,
        "--ks-pass", `file:${berkasSandi}`,
        "--key-pass", `file:${berkasSandi}`,
        "--out", apkFinal,
        apkRapi,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
  } finally {
    await rm(berkasSandi, { force: true });
  }

  console.log(`\nSELESAI. APK: ${apkFinal}`);
}

main().catch((e) => {
  console.error("\nGAGAL:", e?.message || e);
  process.exit(1);
});
