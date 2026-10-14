// Uji klien mesin (13 Okt 2026): deteksi job baru dari selisih daftar, deteksi
// "hilang", pemetaan kode HTTP -> KodeGagal, dan I/O lewat soket Unix PALSU
// (server lokal di folder sementara; tanpa jaringan).
// Jalankan: npx tsx tests/bot-runner/uji-klien-mesin.mts
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { GalatMesin, kodeGagalDariHttp } from "../../src/bot-runner/galat";
import {
  buatKlienMesin,
  deteksiJobBaru,
  detailDariJawaban,
  normalisasiKeadaan,
  nilaiJob,
  potongTeks,
  siapkanHook,
  type KeadaanMesin,
  type JobMesin,
} from "../../src/bot-runner/klien-mesin";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean, i?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n, i !== undefined ? JSON.stringify(i) : "");
  }
};

const job = (id: string, hook: string, status = "queued", ekstra: Partial<JobMesin> = {}): JobMesin => ({
  job_id: id,
  status,
  progress: null,
  message: null,
  error: null,
  durasi: null,
  size: null,
  sumber_url: null,
  hook,
  ...ekstra,
});
const stok = (id: string) => ({ id, judul: "j", durasi: 31.5, size: 4_000_000 });

console.log("\n[A] Pemetaan kode HTTP -> KodeGagal");
cek("409 template belum ada", kodeGagalDariHttp(409, "Buat dan tetapkan template dulu.") === "template_belum_ada");
cek("409 bahan template hilang", kodeGagalDariHttp(409, "Bahan template ada yang hilang. Unggah ulang lewat Edit Template.") === "template_belum_ada");
cek("409 stok hampir penuh", kodeGagalDariHttp(409, "Stok video hampir penuh: 150 di stok + 0 di antrean (maksimal 150). Hapus beberapa dulu.") === "stok_penuh");
cek("409 lain -> lainnya", kodeGagalDariHttp(409, "Sesuatu bentrok") === "lainnya");
cek("413 -> kuota_penuh", kodeGagalDariHttp(413, "Kuota penyimpanan penuh") === "kuota_penuh");
cek("429 -> antrean_penuh", kodeGagalDariHttp(429, "Antrean penuh") === "antrean_penuh");
cek("400 link ditolak -> sumber_ditolak", kodeGagalDariHttp(400, "Link tidak didukung") === "sumber_ditolak");
cek("500 -> lainnya", kodeGagalDariHttp(500, "boom") === "lainnya");
cek("0 (jaringan) -> lainnya", kodeGagalDariHttp(0, "soket") === "lainnya");
cek("401 -> lainnya", kodeGagalDariHttp(401, "Permintaan tidak lewat SuperApp.") === "lainnya");

console.log("\n[B] Deteksi job baru dari selisih daftar");
const kosong: KeadaanMesin = { jobs: [], stok: [] };
{
  const sesudah: KeadaanMesin = { jobs: [job("J1", "Hook satu")], stok: [] };
  const j = deteksiJobBaru(kosong, sesudah, "Hook satu");
  cek("satu selisih -> job itu", j?.job_id === "J1");
}
{
  const sebelum: KeadaanMesin = { jobs: [job("LAMA", "lama")], stok: [stok("S0")] };
  const sesudah: KeadaanMesin = { jobs: [job("LAMA", "lama", "rendering"), job("BARU", "hook baru")], stok: [stok("S0")] };
  cek("job lama diabaikan, yang baru terdeteksi", deteksiJobBaru(sebelum, sesudah, "hook baru")?.job_id === "BARU");
}
{
  // job lama yang selesai pindah ke stok tidak dianggap baru
  const sebelum: KeadaanMesin = { jobs: [job("X", "x")], stok: [] };
  const sesudah: KeadaanMesin = { jobs: [job("Y", "y")], stok: [stok("X")] };
  cek("id yang pindah ke stok bukan job baru", deteksiJobBaru(sebelum, sesudah, "y")?.job_id === "Y");
}
{
  const sesudah: KeadaanMesin = { jobs: [job("A", "bukan ini"), job("B", "hook saya")], stok: [] };
  cek("dua selisih -> disaring dengan hook", deteksiJobBaru(kosong, sesudah, "hook   saya")?.job_id === "B");
}
{
  const sesudah: KeadaanMesin = { jobs: [job("A", "sama"), job("B", "sama")], stok: [] };
  cek("dua selisih hook sama -> ambigu null", deteksiJobBaru(kosong, sesudah, "sama") === null);
  const s2: KeadaanMesin = { jobs: [job("A", "p"), job("B", "q")], stok: [] };
  cek("dua selisih tanpa hook cocok -> null", deteksiJobBaru(kosong, s2, "r") === null);
}
{
  const tetap: KeadaanMesin = { jobs: [job("A", "hook saya")], stok: [] };
  cek("tanpa selisih -> cadangan cocok hook", deteksiJobBaru(tetap, tetap, "hook saya")?.job_id === "A");
  cek("tanpa selisih & hook tak cocok -> null", deteksiJobBaru(tetap, tetap, "lain") === null);
}
cek("kosong semua -> null", deteksiJobBaru(kosong, kosong, "h") === null);

console.log("\n[C] Penilaian job (selesai / gagal / berjalan / hilang)");
{
  const k: KeadaanMesin = { jobs: [job("J", "h", "rendering", { progress: 40 })], stok: [] };
  const n = nilaiJob(k, "J", "h");
  cek("di jobs[] rendering -> berjalan", n.jenis === "berjalan" && n.status === "rendering");
}
{
  const k: KeadaanMesin = { jobs: [], stok: [stok("J")] };
  const n = nilaiJob(k, "J", "h");
  cek("di stok[] -> selesai dengan durasi & ukuran", n.jenis === "selesai" && n.idStok === "J" && n.durasi === 31.5 && n.ukuran === 4_000_000);
}
{
  const k: KeadaanMesin = { jobs: [job("J", "h", "error", { error: "ffmpeg gagal" })], stok: [] };
  const n = nilaiJob(k, "J", "h");
  cek("status error di jobs[] -> gagal membawa pesan", n.jenis === "gagal" && n.pesan === "ffmpeg gagal");
}
{
  const k: KeadaanMesin = { jobs: [job("J", "h", "dibatalkan")], stok: [] };
  cek("dibatalkan -> gagal", nilaiJob(k, "J", "h").jenis === "gagal");
}
{
  const k: KeadaanMesin = { jobs: [job("J", "h", "done")], stok: [] };
  cek("done tapi belum di stok -> masih berjalan (tunggu)", nilaiJob(k, "J", "h").jenis === "berjalan");
}
cek("tidak ada di keduanya -> tidak_ada", nilaiJob({ jobs: [job("LAIN", "x")], stok: [stok("S")] }, "J", "h").jenis === "tidak_ada");
{
  const k: KeadaanMesin = { jobs: [job("J9", "hook saya", "downloading")], stok: [] };
  const n = nilaiJob(k, null, "hook  saya");
  cek("id null dicari lewat hook", n.jenis === "berjalan" && n.idJob === "J9");
  cek("id null & hook ambigu -> tidak_ada", nilaiJob({ jobs: [job("A", "s"), job("B", "s")], stok: [] }, null, "s").jenis === "tidak_ada");
  cek("id null & hook null -> tidak_ada", nilaiJob(k, null, null).jenis === "tidak_ada");
}

console.log("\n[D] Normalisasi & utilitas");
{
  const k = normalisasiKeadaan({
    job: null,
    jobs: [{ job_id: "A", status: "queued", progress: 0, texts: { hook: "H", kategori: "NEWS" }, error: null }, { status: "x" }, "bukan objek", { job_id: "" }],
    stok: [{ id: "S1", judul: "Judul", durasi: 10, size: 99, terunggah: null }, { judul: "tanpa id" }],
    maks_job_aktif: 20,
  });
  cek("jobs tersaring (hanya yang punya job_id)", k.jobs.length === 1 && k.jobs[0].hook === "H");
  cek("stok tersaring", k.stok.length === 1 && k.stok[0].id === "S1");
  cek("bentuk salah -> kosong", normalisasiKeadaan(null).jobs.length === 0 && normalisasiKeadaan("x").stok.length === 0 && normalisasiKeadaan({ jobs: "x" }).jobs.length === 0);
}
cek("siapkanHook merapikan spasi", siapkanHook("  a   b \n c ") === "a b c");
cek("siapkanHook dipotong <=180", siapkanHook("kata ".repeat(100)).length <= 180);
cek("potongTeks utuh bila pendek", potongTeks("abc", 10) === "abc");
cek("detail string", detailDariJawaban({ detail: "pesan" }, "x") === "pesan");
cek("detail daftar pydantic", detailDariJawaban({ detail: [{ msg: "a" }, { msg: "b" }] }, "x") === "a; b");
cek("detail hilang -> bawaan", detailDariJawaban({}, "HTTP 500") === "HTTP 500" && detailDariJawaban(null, "HTTP 502") === "HTTP 502");

console.log("\n[E] I/O lewat soket Unix palsu");
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "uji-mesin-"));
const soket = path.join(folder, "api.sock");
type Catat = { metode: string; url: string; pengguna: string | undefined; badan: string };
const dicatat: Catat[] = [];
let skenario: (c: Catat) => { status: number; badan: unknown } = () => ({ status: 200, badan: {} });
const server = http.createServer((req, res) => {
  const potongan: Buffer[] = [];
  req.on("data", (c) => potongan.push(c));
  req.on("end", () => {
    const c: Catat = { metode: req.method ?? "", url: req.url ?? "", pengguna: req.headers["x-autoedit-pengguna"] as string | undefined, badan: Buffer.concat(potongan).toString("utf8") };
    dicatat.push(c);
    const j = skenario(c);
    res.writeHead(j.status, { "content-type": "application/json" });
    res.end(typeof j.badan === "string" ? j.badan : JSON.stringify(j.badan));
  });
});
await new Promise<void>((r) => server.listen(soket, r));
const klien = buatKlienMesin({ soket });
try {
  skenario = () => ({ status: 200, badan: { kicker: "k", body: "b", hook: "  Hook   hasil  ", source: "llm" } });
  const hook = await klien.buatHook(42, "naskah panjang");
  cek("buatHook: hook dirapikan", hook === "Hook hasil", hook);
  cek("buatHook: jalur, metode, header pengguna", dicatat[0].metode === "POST" && dicatat[0].url === "/api/tvr/hook" && dicatat[0].pengguna === "42");
  cek("buatHook: badan {naskah}", JSON.parse(dicatat[0].badan).naskah === "naskah panjang");

  skenario = () => ({ status: 200, badan: { jobs: [job("J1", "h")].map((j) => ({ job_id: j.job_id, status: "queued", texts: { hook: j.hook } })), stok: [{ id: "S", judul: "j", durasi: 5, size: 6 }] } });
  const ke = await klien.ambilKeadaan(7);
  cek("ambilKeadaan: GET /api/tvr/stok & hasil dinormalkan", dicatat[1].metode === "GET" && dicatat[1].url === "/api/tvr/stok" && dicatat[1].pengguna === "7" && ke.jobs[0].job_id === "J1" && ke.stok[0].id === "S");

  skenario = () => ({ status: 200, badan: { jobs: [], stok: [] } });
  await klien.buatJob(7, { url: "https://www.instagram.com/reel/abc/", hook: "H ".repeat(200), sumber: "S".repeat(100), kategori: "K".repeat(60) });
  const b = JSON.parse(dicatat[2].badan);
  cek("buatJob: POST /api/tvr/jobs dengan batas panjang mesin", dicatat[2].url === "/api/tvr/jobs" && b.hook.length <= 180 && b.sumber.length <= 60 && b.kategori.length <= 30, b);
  cek("buatJob: hanya 5 kolom (+ bingkai hitam)", JSON.stringify(Object.keys(b).sort()) === JSON.stringify(["bingkai", "hook", "kategori", "sumber", "url"]) && b.bingkai === "hitam");

  const galat = async (status: number, badan: unknown, f: () => Promise<unknown>) => {
    skenario = () => ({ status, badan });
    try {
      await f();
      return null;
    } catch (e) {
      return e;
    }
  };
  const e409 = await galat(409, { detail: "Buat dan tetapkan template dulu." }, () => klien.buatJob(7, { url: "u", hook: "h", sumber: "", kategori: "" }));
  cek("409 -> GalatMesin dengan detail", e409 instanceof GalatMesin && e409.status === 409 && e409.detail === "Buat dan tetapkan template dulu.");
  cek("... dipetakan template_belum_ada", e409 instanceof GalatMesin && kodeGagalDariHttp(e409.status, e409.detail) === "template_belum_ada");
  const e413 = await galat(413, { detail: "Penyimpanan penuh" }, () => klien.buatJob(7, { url: "u", hook: "h", sumber: "", kategori: "" }));
  cek("413 -> kuota_penuh", e413 instanceof GalatMesin && kodeGagalDariHttp(e413.status, e413.detail) === "kuota_penuh");
  const e500 = await galat(500, "bukan json", () => klien.ambilKeadaan(7));
  cek("500 tanpa JSON -> detail HTTP 500", e500 instanceof GalatMesin && e500.status === 500 && e500.detail === "HTTP 500", e500);
  const ehk = await galat(200, { hook: "" }, () => klien.buatHook(7, "x"));
  cek("hook kosong dari mesin -> galat", ehk instanceof GalatMesin);
  const eid = await klien.buatHook(0, "x").catch((e) => e);
  cek("id pengguna 0 ditolak tanpa panggilan", eid instanceof GalatMesin);
  const n0 = dicatat.length;
  await klien.ambilKeadaan(-5).catch(() => undefined);
  cek("id negatif tidak mengirim apa pun", dicatat.length === n0);
} finally {
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(folder, { recursive: true, force: true });
}
{
  const mati = buatKlienMesin({ soket: path.join(os.tmpdir(), "tidak-ada-soket-ini.sock") });
  const e = await mati.ambilKeadaan(1).catch((x) => x);
  cek("soket tidak ada -> GalatMesin status 0", e instanceof GalatMesin && e.status === 0, String(e));
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
