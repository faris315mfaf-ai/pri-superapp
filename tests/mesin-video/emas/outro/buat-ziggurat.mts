// Pembuat src/mesin-video/outro/ziggurat-tabel.ts dari header numpy asli.
// Tabel ini HARUS sama persis dengan numpy (v2.4.6, berkas
// numpy/random/src/distributions/ziggurat_constants.h): latar "butir"
// memakai np.random.default_rng(seed).normal(...), dan satu angka tabel
// yang meleset membuat derau tiap piksel berbeda dari versi Python.
// Jalankan: npx tsx tests/mesin-video/emas/outro/buat-ziggurat.mts [jalur-header]
// Tanpa argumen, header diunduh dari GitHub.
import fs from "node:fs";
import path from "node:path";

const URL_HEADER =
  "https://raw.githubusercontent.com/numpy/numpy/v2.4.6/numpy/random/src/distributions/ziggurat_constants.h";

async function bacaHeader(): Promise<string> {
  const jalur = process.argv[2];
  if (jalur) return fs.readFileSync(jalur, "utf8");
  const r = await fetch(URL_HEADER);
  if (!r.ok) throw new Error(`unduh header gagal: ${r.status}`);
  return r.text();
}

function ambilLarik(sumber: string, nama: string): string[] {
  const awal = sumber.indexOf(`${nama}[] = {`);
  if (awal < 0) throw new Error(`tabel ${nama} tidak ketemu`);
  const buka = sumber.indexOf("{", awal);
  const tutup = sumber.indexOf("}", buka);
  return sumber
    .slice(buka + 1, tutup)
    .split(",")
    .map((s) => s.trim().replace(/ULL$/, ""))
    .filter(Boolean);
}

function ambilKonstanta(sumber: string, nama: string): string {
  const awal = sumber.indexOf(`${nama} =`);
  if (awal < 0) throw new Error(`konstanta ${nama} tidak ketemu`);
  const m = sumber.slice(awal + nama.length + 2).match(/[0-9.eE+-]+/);
  if (!m) throw new Error(`konstanta ${nama} rusak`);
  return m[0];
}

const sumber = await bacaHeader();
const ki = ambilLarik(sumber, "ki_double");
const wi = ambilLarik(sumber, "wi_double");
const fi = ambilLarik(sumber, "fi_double");
if (ki.length !== 256 || wi.length !== 256 || fi.length !== 256) throw new Error("panjang tabel bukan 256");
// ki < 2^52, jadi aman disimpan sebagai angka JS biasa (tepat sampai 2^53).
for (const k of ki) if (BigInt(k) >= BigInt(2) ** BigInt(53)) throw new Error(`ki ${k} terlalu besar`);
const r = ambilKonstanta(sumber, "ziggurat_nor_r");
const invR = ambilKonstanta(sumber, "ziggurat_nor_inv_r");

const isi = `// DIBUAT OTOMATIS oleh tests/mesin-video/emas/outro/buat-ziggurat.mts dari
// numpy v2.4.6 ziggurat_constants.h — jangan diubah tangan.
// Tabel ziggurat distribusi normal milik numpy.random.Generator; dipakai
// supaya derau latar "butir" identik bit-per-bit dengan versi Python.
export const ZIGGURAT_NOR_R = ${r};
export const ZIGGURAT_NOR_INV_R = ${invR};
export const KI_DOUBLE: readonly number[] = [
${ki.map((k) => `  ${Number(BigInt(k))},`).join("\n")}
];
export const WI_DOUBLE: readonly number[] = [
${wi.map((v) => `  ${v},`).join("\n")}
];
export const FI_DOUBLE: readonly number[] = [
${fi.map((v) => `  ${v},`).join("\n")}
];
`;
const tujuan = path.resolve("src/mesin-video/outro/ziggurat-tabel.ts");
fs.writeFileSync(tujuan, isi, "utf8");
console.log("ditulis", tujuan);
