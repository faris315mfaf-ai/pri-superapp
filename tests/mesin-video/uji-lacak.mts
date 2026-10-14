// Uji penerusan /api/lacak/* mesin TS -> layanan Python (15 Okt 2026). Layanan Python ditiru server HTTP kecil.
// Jalankan: npx tsx tests/mesin-video/uji-lacak.mts
import http from "node:http";
import type { AddressInfo } from "node:net";

let lulus = 0;
let gagal = 0;
async function uji(nama: string, fn: () => Promise<void>) {
  try {
    await fn();
    lulus++;
    console.log("  LOLOS ", nama);
  } catch (e) {
    gagal++;
    console.log("  GAGAL ", nama, e instanceof Error ? e.message : e);
  }
}
function pastikan(ok: unknown, pesan = "") {
  if (!ok) throw new Error(pesan || "tidak terpenuhi");
}

type Dicatat = { method: string; url: string; header: http.IncomingHttpHeaders; badan: string };
const dicatat: Dicatat[] = [];
let jawabStatus = 200;
let jawabBadan = '{"ok":true}';
const tiruan = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    dicatat.push({ method: req.method ?? "", url: req.url ?? "", header: req.headers, badan: b });
    res.writeHead(jawabStatus, { "content-type": "application/json" });
    res.end(jawabBadan);
  });
});
await new Promise<void>((ok) => tiruan.listen(0, "127.0.0.1", ok));
process.env.LACAK_URL = `http://127.0.0.1:${(tiruan.address() as AddressInfo).port}`;

const { Router } = await import("../../src/mesin-video/server/dasar.ts");
const { pasangRuteLacak } = await import("../../src/mesin-video/server/lacak.ts");
const { buatServer } = await import("../../src/mesin-video/server/utama.ts");
const router = new Router();
pasangRuteLacak(router);
const server = buatServer(router);
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
const dasar = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function minta(method: string, jalur: string, header: Record<string, string> = {}, json?: unknown) {
  const r = await fetch(dasar + jalur, {
    method,
    headers: { ...header, ...(json !== undefined ? { "content-type": "application/json" } : {}) },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

console.log("Lacak Sumber: penerusan mesin TS");
await uji("tanpa identitas: 401, tidak diteruskan", async () => {
  const n = dicatat.length;
  const r = await minta("POST", "/api/lacak/jobs", {}, { url: "https://x.com/a/status/1" });
  pastikan(r.status === 401 && dicatat.length === n, `${r.status}`);
});
await uji("pengguna biasa: x-pengguna diteruskan, tanpa peran/bot", async () => {
  jawabStatus = 200;
  jawabBadan = '{"id":"abc"}';
  const r = await minta("POST", "/api/lacak/jobs", { "x-autoedit-pengguna": "176" }, { url: "https://www.tiktok.com/@a/video/1" });
  const d = dicatat.at(-1)!;
  pastikan(r.status === 200 && r.json.id === "abc", JSON.stringify(r));
  pastikan(d.url === "/jobs" && d.method === "POST" && d.header["x-pengguna"] === "176", JSON.stringify(d));
  pastikan(d.header["x-peran"] === undefined && d.header["x-bot"] === undefined);
  pastikan(JSON.parse(d.badan).url === "https://www.tiktok.com/@a/video/1");
});
await uji("peran master & penanda bot disalin", async () => {
  await minta("GET", "/api/lacak/koleksi", { "x-autoedit-pengguna": "4", "x-autoedit-peran": "master" });
  pastikan(dicatat.at(-1)!.header["x-peran"] === "master");
  await minta("GET", "/api/lacak/pengaturan", { "x-autoedit-pengguna": "900", "x-autoedit-bot": "1" });
  pastikan(dicatat.at(-1)!.header["x-bot"] === "1");
  await minta("GET", "/api/lacak/pengaturan", { "x-autoedit-pengguna": "900", "x-autoedit-peran": "admin" });
  pastikan(dicatat.at(-1)!.header["x-peran"] === undefined);
});
await uji("status & isi galat 4xx diteruskan apa adanya", async () => {
  jawabStatus = 429;
  jawabBadan = '{"detail":"Masih ada pencarian yang berjalan."}';
  const r = await minta("POST", "/api/lacak/jobs", { "x-autoedit-pengguna": "176" }, { url: "https://www.tiktok.com/@a/video/1" });
  pastikan(r.status === 429 && r.json.detail.includes("berjalan"), JSON.stringify(r));
});
await uji("5xx dari layanan disamarkan jadi 502", async () => {
  jawabStatus = 500;
  jawabBadan = "Traceback rahasia";
  const r = await minta("GET", "/api/lacak/riwayat?limit=5", { "x-autoedit-pengguna": "4" });
  pastikan(r.status === 502 && !JSON.stringify(r.json).includes("Traceback"), JSON.stringify(r));
  pastikan(dicatat.at(-1)!.url === "/riwayat?limit=5");
});
await uji("id job & akun divalidasi sebelum diteruskan", async () => {
  jawabStatus = 200;
  jawabBadan = "{}";
  const n = dicatat.length;
  pastikan((await minta("GET", "/api/lacak/jobs/..%2F..%2Fetc", { "x-autoedit-pengguna": "4" })).status === 404);
  pastikan((await minta("PATCH", "/api/lacak/koleksi/abc", { "x-autoedit-pengguna": "4" }, {})).status === 404);
  pastikan(dicatat.length === n, "tidak boleh diteruskan");
  await minta("POST", "/api/lacak/jobs/0123456789abcdef/keputusan", { "x-autoedit-pengguna": "4" }, { aksi: "bukan", kandidat: 0 });
  pastikan(dicatat.at(-1)!.url === "/jobs/0123456789abcdef/keputusan");
  await minta("POST", "/api/lacak/jobs/0123456789abcdef/batal", { "x-autoedit-pengguna": "176" });
  pastikan(dicatat.at(-1)!.url === "/jobs/0123456789abcdef/batal" && dicatat.at(-1)!.method === "POST");
  await minta("DELETE", "/api/lacak/koleksi/12", { "x-autoedit-pengguna": "4", "x-autoedit-peran": "master" });
  pastikan(dicatat.at(-1)!.method === "DELETE" && dicatat.at(-1)!.url === "/koleksi/12");
});
await uji("layanan mati: 503 ramah", async () => {
  await new Promise<void>((ok) => tiruan.close(() => ok()));
  const r = await minta("GET", "/api/lacak/pengaturan", { "x-autoedit-pengguna": "4" });
  pastikan(r.status === 503 && r.json.detail.includes("tidak aktif"), JSON.stringify(r));
});

server.close();
console.log(`\n${lulus} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
