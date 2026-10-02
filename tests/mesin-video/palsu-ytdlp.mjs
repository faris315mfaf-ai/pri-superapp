// yt-dlp PALSU untuk uji: tidak pernah menyentuh internet. Dipakai oleh mesin
// Python (buat_emas.py) DAN mesin TS (uji-media.mts) supaya keduanya diuji
// terhadap tiruan yang sama persis.
//
// Lingkungan:
//   PALSU_SKENARIO  berkas JSON: daftar balasan per panggilan
//                   [{kode, stdout, stderr, tulis: [{ext|nama, dari}]}]
//                   (panggilan melebihi daftar memakai balasan terakhir)
//   PALSU_STATUS    berkas penghitung panggilan
//   PALSU_LOG       berkas JSONL: argv tiap panggilan dicatat di sini
//   PALSU_MEDIA     folder asal berkas yang "diunduh"
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
fs.appendFileSync(process.env.PALSU_LOG, `${JSON.stringify(argv)}\n`);
let nomor = 0;
try {
  nomor = Number(fs.readFileSync(process.env.PALSU_STATUS, "utf8")) || 0;
} catch {
  nomor = 0;
}
fs.writeFileSync(process.env.PALSU_STATUS, String(nomor + 1));
const daftar = JSON.parse(fs.readFileSync(process.env.PALSU_SKENARIO, "utf8"));
const balasan = daftar.length ? daftar[Math.min(nomor, daftar.length - 1)] : { kode: 1, stderr: "ERROR: tak ada balasan" };

const iO = argv.indexOf("-o");
const pola = iO >= 0 ? argv[iO + 1] : null;
for (const t of balasan.tulis ?? []) {
  if (!pola) break;
  const tujuan = t.nama ? path.join(path.dirname(pola), t.nama) : pola.replace("%(ext)s", t.ext);
  fs.copyFileSync(path.join(process.env.PALSU_MEDIA, t.dari), tujuan);
}
if (balasan.stdout) process.stdout.write(balasan.stdout);
if (balasan.stderr) process.stderr.write(balasan.stderr);
process.exitCode = balasan.kode ?? 0;
