// ============================================================
// RUMAH BOT (runner) — program utama (13 Okt 2026).
// Hidup di kontainer `autoedit-bot` pada VPS mesin. Tiap ~15 detik `denyut` ke
// aplikasi; tiap bot aktif punya tugas sendiri (giliran.ts). SIGTERM: selesaikan
// langkah yang berjalan lalu keluar bersih.
// Modul bawaan Node 22 saja; tanpa dependensi npm.
// ============================================================

import fs from "node:fs";
import { buatKlienApp } from "./klien-app";
import { buatKlienMesin } from "./klien-mesin";
import { bacaKonfig, type KonfigRunner } from "./konfig";
import { Penjadwal, selangDenyutBerikut } from "./giliran";
import { Pemanen } from "./pemanen";
import { pesanGalat } from "./galat";

/** Berkas penanda "proses masih berputar" untuk healthcheck kontainer. */
const BERKAS_HIDUP = process.env.BOT_HIDUP_FILE || "/tmp/runner-hidup";

function catat(teks: string): void {
  console.log(`${new Date().toISOString()} [bot-runner] ${teks}`);
}

function tandaiHidup(): void {
  try {
    fs.writeFileSync(BERKAS_HIDUP, String(Date.now()));
  } catch {
    // healthcheck saja; jangan menjatuhkan runner.
  }
}

export async function mulai(env: Record<string, string | undefined> = process.env): Promise<void> {
  let konfig: KonfigRunner;
  try {
    konfig = bacaKonfig(env);
  } catch (e) {
    console.error(`[bot-runner] konfigurasi tidak lengkap: ${pesanGalat(e)}`);
    process.exit(1);
  }

  const pembatal = new AbortController();
  let berhenti = false;
  const tidur = (ms: number) =>
    new Promise<void>((selesai) => {
      if (pembatal.signal.aborted) return selesai();
      const t = setTimeout(selesai, ms);
      pembatal.signal.addEventListener("abort", () => (clearTimeout(t), selesai()), { once: true });
    });

  const penjadwal = new Penjadwal({
    app: buatKlienApp(konfig),
    mesin: buatKlienMesin({ soket: konfig.soketMesin }),
    pemanen: new Pemanen({ ytdlpBin: konfig.ytdlpBin, cookiesFile: konfig.cookiesFile }),
    tidur,
    sekarang: Date.now,
    log: catat,
    pengaturan: { jedaDiamMs: konfig.jedaDiamMs },
  });

  const berhentiBersih = (sinyal: string) => {
    if (berhenti) return;
    berhenti = true;
    catat(`${sinyal} diterima: menyelesaikan langkah lalu keluar`);
    pembatal.abort();
    void penjadwal.hentikan().finally(() => {
      catat("selesai, keluar");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => berhentiBersih("SIGTERM"));
  process.on("SIGINT", () => berhentiBersih("SIGINT"));
  process.on("unhandledRejection", (e) => catat(`unhandledRejection: ${pesanGalat(e)}`));

  catat(`mulai (versi ${konfig.versi}; aplikasi ${konfig.appUrl}; cookies ${konfig.cookiesFile ? "ada" : "tidak"})`);
  while (!berhenti) {
    await penjadwal.denyut();
    tandaiHidup();
    await tidur(selangDenyutBerikut(penjadwal.gagalDenyut, konfig.selangDenyutMs));
  }
}
