// Tulis package.json image jalan mesin Auto Edit: hanya paket yang tidak
// bisa dibundel (biner native / membaca berkasnya sendiri), dengan versi
// PERSIS seperti di package-lock.json repo — supaya yang diuji = yang jalan.
import fs from "node:fs";

const kunci = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const PAKET = ["sharp", "@napi-rs/canvas", "bullmq", "ioredis"];
const dependencies = {};
for (const nama of PAKET) {
  const versi = kunci.packages?.[`node_modules/${nama}`]?.version;
  if (!versi) throw new Error(`${nama} tidak ada di package-lock.json`);
  dependencies[nama] = versi;
}
process.stdout.write(
  JSON.stringify({ name: "pri-autoedit-ts", private: true, type: "module", dependencies }, null, 2) + "\n",
);
