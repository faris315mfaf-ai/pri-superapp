// Uji layanan Auto Edit TS lewat HTTP: port tests/test_autoedit.py (Python)
// kasus demi kasus — keamanan, pemisahan akun, render & outro sungguhan
// dengan ffmpeg, dan Edit Otomatis TVR Saya. Redis diganti tiruan di memori;
// antrean diganti penampung TUGAS lalu worker dijalankan langsung.
//
//   npx tsx tests/mesin-video/uji-api.mts
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const MEDIA = fs.mkdtempSync(path.join(os.tmpdir(), "autoedit-uji-"));
Object.assign(process.env, { MEDIA_DIR: MEDIA, OUTRO_VIDEO_W: "360", OUTRO_VIDEO_H: "640", VIDEO_THREADS: "1" });
delete process.env.REDIS_URL;
delete process.env.DEEPSEEK_API_KEY;

const { default: RedisMock } = await import("ioredis-mock");
const job = await import("../../src/mesin-video/job.ts");
job.aturRedis(new RedisMock() as never);
const antrean = await import("../../src/mesin-video/antrean.ts");
type Muatan = Parameters<typeof antrean.kirimRender>[0];
const TUGAS: Muatan[] = [];
antrean.aturPengirim(async (m) => {
  TUGAS.push(m);
});
// Tidak ada broker di uji ini: worker dianggap hidup.
await job.redis().set(antrean.KUNCI_DETAK_WORKER, "1");

const unduh = await import("../../src/mesin-video/unduh.ts");
// Semua nama situs video dianggap beralamat publik, kecuali yang sengaja
// disiapkan menunjuk ke alamat privat untuk menguji penjaga SSRF.
const dns = await import("node:dns");
unduh.pasangPenyelesaiDns(async (host: string) => {
  if (host === "jebakan.instagram.com") return ["10.0.0.5"];
  if (/(instagram|tiktok|youtube)\.com$/.test(host)) return ["157.240.1.1"];
  return (await dns.promises.lookup(host, { all: true })).map((a) => a.address);
});

const tpl = await import("../../src/mesin-video/template.ts");
const jalur = await import("../../src/mesin-video/jalur.ts");
const media = await import("../../src/mesin-video/media.ts");
const kuota = await import("../../src/mesin-video/kuota.ts");
const volume = await import("../../src/mesin-video/volume.ts");
const outro = await import("../../src/mesin-video/outro/index.ts");
const pekerja = await import("../../src/mesin-video/pekerja.ts");
const bantu = await import("../../src/mesin-video/server/bantu.ts");
const tvr = await import("../../src/mesin-video/server/tvr.ts");
const video = await import("../../src/mesin-video/server/video.ts");
const utama = await import("../../src/mesin-video/server/utama.ts");
const { GalatVideo } = await import("../../src/mesin-video/jenis.ts");

const router = utama.buatRouter();
const server = utama.buatServer(router);
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
const DASAR = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// ---------------------------------------------------------------- alat uji

let lolos = 0;
const gagal: string[] = [];
async function uji(nama: string, fn: () => Promise<void> | void): Promise<void> {
  const t0 = Date.now();
  try {
    await fn();
    lolos += 1;
    console.log(`  LOLOS  ${nama} (${Date.now() - t0} ms)`);
  } catch (e) {
    gagal.push(nama);
    console.log(`  GAGAL  ${nama}\n         ${e instanceof Error ? e.stack?.split("\n").slice(0, 4).join("\n         ") : e}`);
  }
}
function pastikan(syarat: unknown, pesan = "syarat tidak terpenuhi"): asserts syarat {
  if (!syarat) throw new Error(pesan);
}

type Jawaban = { status: number; json: () => any; teks: string; isi: Buffer; tipe: string };
async function minta(
  method: string,
  url: string,
  opsi: { id?: string | null; json?: unknown; berkas?: { nama: string; isi: Buffer; tipe?: string } } = {},
): Promise<Jawaban> {
  const headers: Record<string, string> = {};
  if (opsi.id !== undefined && opsi.id !== null) headers["X-Autoedit-Pengguna"] = opsi.id;
  let body: BodyInit | undefined;
  if (opsi.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opsi.json);
  } else if (opsi.berkas) {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(opsi.berkas.isi)], { type: opsi.berkas.tipe ?? "application/octet-stream" }), opsi.berkas.nama);
    body = fd;
  }
  const r = await fetch(DASAR + url, { method, headers, body });
  const isi = Buffer.from(await r.arrayBuffer());
  const teks = isi.toString("utf8");
  return { status: r.status, teks, isi, tipe: r.headers.get("content-type") ?? "", json: () => JSON.parse(teks) };
}

async function png(w: number, h: number, warna: [number, number, number, number] = [255, 255, 255, 200]): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: warna[0], g: warna[1], b: warna[2], alpha: warna[3] / 255 } } })
    .png()
    .toBuffer();
}

function ffmpeg(...argumen: string[]): void {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...argumen], { stdio: "pipe" });
}

function videoSumber(detik = 3): Buffer {
  const keluaran = path.join(MEDIA, `sumber-${detik}.mp4`);
  if (!fs.existsSync(keluaran)) {
    ffmpeg(
      "-f", "lavfi", "-i", `testsrc=size=720x1280:rate=30:duration=${detik}`,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${detik}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", keluaran,
    );
  }
  return fs.readFileSync(keluaran);
}

async function templateUji(id: string, nama = "Uji TV"): Promise<string> {
  let r = await minta("POST", "/api/video/templates", {
    id,
    json: {
      name: nama, width: 720, height: 1280, fps: 30,
      overlays: [{ file: "assets/bingkai.png", x: 0, y: "main_h-h", w: 720, crop: "720:300:0:0" }],
      texts: [{ name: "hook", style: "berita", size: 44 }],
      text_box: { x: 40, y: 960, w: 640, h: 240 },
    },
  });
  pastikan(r.status === 200, r.teks);
  const tid = r.json().id as string;
  r = await minta("POST", `/api/video/templates/${tid}/assets`, {
    id,
    berkas: { nama: "bingkai.png", isi: await png(720, 300, [10, 60, 200, 230]), tipe: "image/png" },
  });
  pastikan(r.status === 200, r.teks);
  return tid;
}

// ---------------------------------------------------------------- 1. identitas

console.log("Identitas dari SuperApp");
for (const nilai of ["", "abc", "12; rm", "1".repeat(13), "../1"]) {
  await uji(`identitas tidak sah ditolak: ${JSON.stringify(nilai)}`, async () => {
    const r = await minta("GET", "/api/video/templates", { id: nilai });
    pastikan(r.status === 401, `${r.status}`);
  });
}

await uji("semua rute video, outro & tvr wajib identitas", async () => {
  let diperiksa = 0;
  for (const { method, jalur: pola } of router.daftar()) {
    if (pola === "^\\/health$") continue;
    const contoh = pola
      .replace(/^\^|\$$/g, "")
      .replace(/\\\//g, "/")
      .replace(/\\\./g, ".")
      .replace(/\(\[\^\/\]\+\)/g, "abc");
    pastikan(/^\/api\/(video|outro|tvr)/.test(contoh), contoh);
    const r = await minta(method, contoh, { json: method === "GET" || method === "DELETE" ? undefined : {} });
    pastikan([401, 404].includes(r.status), `${method} ${contoh} -> ${r.status}`);
    diperiksa += 1;
  }
  pastikan(diperiksa >= 30, `${diperiksa}`);
});

await uji("akun baru dapat template awal dari bawaan", async () => {
  tpl.saveTemplate({ name: "TV Rakyat", width: 720, height: 1280 }, "bawaan-tv-rakyat", "");
  let daftar = (await minta("GET", "/api/video/templates", { id: "7001" })).json().templates as any[];
  const milik = daftar.filter((t) => t.owner === "pri-7001");
  pastikan(milik.length === 1 && milik[0].aset_dari === "bawaan-tv-rakyat", JSON.stringify(milik));
  daftar = (await minta("GET", "/api/video/templates", { id: "7001" })).json().templates;
  pastikan(daftar.filter((t) => t.owner === "pri-7001").length === 1);
});

// ---------------------------------------------------------------- 3. SSRF & validasi

console.log("Penjaga SSRF & validasi template");
for (const url of [
  "http://127.0.0.1:8000/health",
  "http://10.0.0.1/a.mp4",
  "http://localhost/a.mp4",
  "http://supabase-db:5432/",
  "http://pri-redis:6379/",
  "file:///etc/passwd",
  "ftp://instagram.com/a.mp4",
  "https://evil.example/a.mp4",
  "https://instagram.com.evil.example/reel/x",
  "https://user:pass@www.instagram.com/reel/x",
  "http://[::1]/a.mp4",
  "https://jebakan.instagram.com/reel/x",
]) {
  await uji(`periksa_url menolak ${url}`, async () => {
    let ditolak = false;
    try {
      await unduh.periksaUrl(url);
    } catch (e) {
      ditolak = e instanceof GalatVideo;
    }
    pastikan(ditolak);
  });
}

await uji("periksa_url menerima situs video", async () => {
  pastikan((await unduh.periksaUrl("https://www.instagram.com/reel/ABC123/")).startsWith("https://"));
  pastikan(await unduh.periksaUrl("https://vt.tiktok.com/ZS123/"));
});

await uji("job dengan link internal ditolak 400", async () => {
  const tid = await templateUji("1001", "SSRF");
  const r = await minta("POST", "/api/video/jobs", {
    id: "1001",
    json: { url: "http://127.0.0.1:3000/x.mp4", template_id: tid, texts: { hook: "UJI" } },
  });
  pastikan(r.status === 400, `${r.status} ${r.teks}`);
  pastikan(TUGAS.every((t) => t.url !== "http://127.0.0.1:3000/x.mp4"));
});

for (const overlay of [
  { file: "assets/a.png", crop: "100:100:0:0,movie=/etc/passwd" },
  { file: "assets/a.png", crop: "iw/2:ih:0:0" },
  { file: "assets/a.png", w: 99999 },
  { file: "assets/a.png", x: "1;drawtext=text=x" },
]) {
  await uji(`template berbahaya ditolak ${JSON.stringify(overlay)}`, async () => {
    const id = String(2000 + (crypto.createHash("md5").update(JSON.stringify(overlay)).digest()[0] % 1000));
    const r = await minta("POST", "/api/video/templates", { id, json: { name: "Jahat", overlays: [overlay] } });
    pastikan(r.status === 422, `${r.status} ${r.teks}`);
  });
}

await uji("teks berukuran raksasa ditolak", async () => {
  const r = await minta("POST", "/api/video/templates", { id: "1002", json: { name: "Besar", texts: [{ name: "hook", size: 100000 }] } });
  pastikan(r.status === 422, `${r.status}`);
});

// ---------------------------------------------------------------- 4. pemisahan akun

console.log("Pemisahan antar-akun");
await uji("akun lain tidak bisa melihat atau memakai milik orang", async () => {
  const [a, b] = ["1003", "1004"];
  const tid = await templateUji(a, "Milik A");
  let r = await minta("POST", "/api/video/sources", { id: a, berkas: { nama: "s.mp4", isi: videoSumber(2), tipe: "video/mp4" } });
  pastikan(r.status === 200, r.teks);
  const unggahan = r.json().url as string;
  pastikan((await minta("GET", `/api/video/templates/${tid}`, { id: b })).status === 404);
  pastikan((await minta("DELETE", `/api/video/templates/${tid}`, { id: b })).status === 404);
  pastikan(((await minta("GET", "/api/video/templates", { id: b })).json().templates as any[]).every((t) => t.id !== tid));
  const tidB = await templateUji(b, "Milik B");
  r = await minta("POST", "/api/video/jobs", { id: b, json: { url: unggahan, template_id: tidB, texts: { hook: "UJI" } } });
  pastikan(r.status === 404, "unggahan milik A tidak boleh dipakai B");
  r = await minta("POST", "/api/video/jobs", { id: a, json: { url: unggahan, template_id: tid, texts: { hook: "UJI" } } });
  pastikan(r.status === 200, r.teks);
  const j = r.json().job_id;
  pastikan((await minta("GET", `/api/video/jobs/${j}`, { id: b })).status === 404);
  pastikan((await minta("GET", `/api/video/jobs/${j}/file`, { id: b })).status === 404);
  pastikan((await minta("POST", "/api/video/jobs/cleanup", { id: b, json: { job_ids: [j] } })).json().dihapus === 0);
});

await uji("batas job aktif per akun", async () => {
  const lama = bantu.rem.aktifPerAkun;
  bantu.rem.aktifPerAkun = 2;
  try {
    const tid = await templateUji("1005", "Rakus");
    const kirim = () =>
      minta("POST", "/api/video/jobs", {
        id: "1005",
        json: { url: "https://www.instagram.com/reel/ABC/", template_id: tid, texts: { hook: "UJI" } },
      });
    pastikan((await kirim()).status === 200);
    pastikan((await kirim()).status === 200);
    pastikan((await kirim()).status === 429);
  } finally {
    bantu.rem.aktifPerAkun = lama;
  }
});

// ---------------------------------------------------------------- 5. render sungguhan

console.log("Render ujung-ke-ujung dengan ffmpeg sungguhan");
await uji("render video sampai jadi", async () => {
  const id = "1006";
  const t1 = await templateUji(id, "Render Satu");
  const t2 = await templateUji(id, "Render Dua");
  let r = await minta("POST", "/api/video/sources", { id, berkas: { nama: "s.mp4", isi: videoSumber(3), tipe: "video/mp4" } });
  pastikan(r.status === 200, r.teks);
  const sumber = r.json().url;
  TUGAS.length = 0;
  r = await minta("POST", "/api/video/jobs/batch", {
    id,
    json: { url: sumber, template_ids: [t1, t2], texts: { hook: "VIRAL! UJI RENDER AUTO EDIT BERJALAN MULUS" }, teks_warna: "black" },
  });
  pastikan(r.status === 200, r.teks);
  pastikan(TUGAS.length === 2, `${TUGAS.length}`);
  pastikan(TUGAS.every((t) => t.teks_warna === "black"));
  for (const t of TUGAS) {
    const hasil = await pekerja.renderVideo(t);
    pastikan(hasil.status === "done", JSON.stringify(hasil));
  }
  for (const j of r.json().jobs as { job_id: string }[]) {
    const st = (await minta("GET", `/api/video/jobs/${j.job_id}`, { id })).json();
    pastikan(st.status === "done" && st.progress === 100, JSON.stringify(st));
    const unduhan = await minta("GET", `/api/video/jobs/${j.job_id}/file`, { id });
    pastikan(unduhan.status === 200 && unduhan.isi.length > 10_000);
    const berkas = path.join(MEDIA, `hasil-${j.job_id}.mp4`);
    fs.writeFileSync(berkas, unduhan.isi);
    const info = await media.probe(berkas);
    pastikan(info.width === 720 && info.height === 1280, JSON.stringify(info));
    pastikan(Number(info.duration) > 2.5 && Number(info.duration) < 3.6, `${info.duration}`);
    pastikan(info.has_audio);
  }
  // Tugas yang dikirim ulang setelah selesai tidak dirender dua kali.
  pastikan((await pekerja.renderVideo(TUGAS[0])).status === "done");
  pastikan((await kuota.pemakaianByte("pri-1006", true)) > 50_000);
  pastikan((await minta("GET", "/api/video/info", { id })).json().kuota.tamu === false);
  // Rentang byte (pemutar video menggeser) dilayani 206.
  const jid = (r.json().jobs as { job_id: string }[])[0].job_id;
  const sebagian = await fetch(`${DASAR}/api/video/jobs/${jid}/file`, { headers: { "X-Autoedit-Pengguna": id, Range: "bytes=0-99" } });
  pastikan(sebagian.status === 206 && (await sebagian.arrayBuffer()).byteLength === 100);
});

await uji("tugas ulangan setelah gagal dilewati", async () => {
  const j = await job.buatJob("upload://tidakada", "x", { hook: "a" }, "siapa");
  await job.tulisStatus(j, { status: "error", log: "worker mati" });
  pastikan((await pekerja.renderVideo({ job_id: j, url: "upload://tidakada", template_id: "x", texts: { hook: "a" } })).status === "error");
});

await uji("hentikan dan hapus job", async () => {
  const id = "1007";
  const tid = await templateUji(id, "Henti");
  const r = await minta("POST", "/api/video/jobs", {
    id,
    json: { url: "https://www.instagram.com/reel/XYZ/", template_id: tid, texts: { hook: "UJI" } },
  });
  const j = r.json().job_id;
  pastikan((await minta("POST", `/api/video/jobs/${j}/stop`, { id })).status === 200);
  pastikan((await minta("GET", `/api/video/jobs/${j}`, { id })).json().status === "dibatalkan");
  pastikan((await minta("DELETE", `/api/video/jobs/${j}`, { id })).json().ok);
  pastikan((await minta("GET", `/api/video/jobs/${j}`, { id })).status === 404);
});

await uji("template bawaan tidak bisa diubah tapi bisa diduplikat", async () => {
  tpl.saveTemplate({ name: "Bawaan TV", width: 720, height: 1280 }, "bawaan-tv-rakyat", "");
  const id = "1008";
  pastikan((await minta("GET", "/api/video/templates/bawaan-tv-rakyat", { id })).status === 200);
  pastikan((await minta("DELETE", "/api/video/templates/bawaan-tv-rakyat", { id })).status === 403);
  const r = await minta("POST", "/api/video/templates/bawaan-tv-rakyat/duplicate", { id, json: { name: "Salinanku" } });
  pastikan(r.status === 200 && r.json().can_edit === true, r.teks);
});

// ---------------------------------------------------------------- 6. outro & penyapu

console.log("Outro dan penyapu disk");
await uji("outro dpp jadi lalu tersapu", async () => {
  const id = "1009";
  const r = await minta("POST", "/api/outro/jobs", {
    id,
    json: { channel: "TV Uji", mode: "dpp", akun: { instagram: "tvuji", tiktok: "tvuji" } },
  });
  pastikan(r.status === 200, r.teks);
  const j = r.json().job_id;
  const batas = Date.now() + 240_000;
  let st: any = {};
  while (Date.now() < batas) {
    st = (await minta("GET", `/api/outro/jobs/${j}`, { id })).json();
    if (["done", "error", "dibatalkan"].includes(st.status)) break;
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  pastikan(st.status === "done", JSON.stringify(st));
  const unduhan = await minta("GET", `/api/outro/jobs/${j}/video`, { id });
  pastikan(unduhan.status === 200 && unduhan.isi.length > 5_000);
  pastikan(fs.existsSync(path.join(jalur.outroDir(), "indeks.json")));
  // Sapuan dengan umur 0: folder outro terbuang, entrinya ikut dilupakan.
  await volume.bersihkanVolume(0);
  pastikan((await minta("GET", `/api/outro/jobs/${j}`, { id })).status === 404);
});

// ---------------------------------------------------------------- 7. TVR Saya

console.log("Edit Otomatis TVR Saya");
async function pngKotak(latar: [number, number, number, number] = [20, 20, 60, 255]): Promise<Buffer> {
  // Panel bawah 720x300: latar gelap dengan bidang putih polos untuk tulisan.
  const { default: sharp } = await import("sharp");
  const putih = await sharp({ create: { width: 681, height: 241, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .png()
    .toBuffer();
  return sharp({ create: { width: 720, height: 300, channels: 4, background: { r: latar[0], g: latar[1], b: latar[2], alpha: latar[3] / 255 } } })
    .composite([{ input: putih, left: 20, top: 40 }])
    .png()
    .toBuffer();
}
function berkasVideo(nama: string, ...argumen: string[]): Buffer {
  const tujuan = path.join(MEDIA, nama);
  ffmpeg(...argumen, tujuan);
  return fs.readFileSync(tujuan);
}
const hijau = () =>
  berkasVideo("boom-hijau.mp4", "-f", "lavfi", "-i", "color=c=0x00C040:s=280x158:d=2,drawbox=x=90:y=40:w=100:h=80:color=red:t=fill",
    "-c:v", "libx264", "-pix_fmt", "yuv420p");
const gif = () =>
  berkasVideo("boom.gif", "-f", "lavfi", "-i", "testsrc=s=120x80:d=1:r=10", "-vf",
    "split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse");
const webmAlpha = () =>
  berkasVideo("boom-alpha.webm", "-f", "lavfi", "-i",
    "color=c=black@0.0:s=200x100:d=1,format=yuva420p,drawbox=x=50:y=25:w=100:h=50:color=red@1:t=fill",
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0");
const penutup = () =>
  berkasVideo("penutup.mp4", "-f", "lavfi", "-i", "color=c=navy:s=720x1280:d=2:r=30", "-f", "lavfi", "-i",
    "sine=frequency=880:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest");

const draf = (id: string, slot: string, nama: string, isi: Buffer) =>
  minta("POST", `/api/tvr/template/draf/${slot}`, { id, berkas: { nama, isi } });
function asetTvr(id: string): string[] {
  const folder = path.join(jalur.templatePath(`tvr-${id}`), "assets");
  if (!fs.existsSync(folder)) return [];
  return bantu.urut(fs.readdirSync(folder, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name));
}
const KOTAK_UJI = { x: 30, y: 1000, w: 660, h: 230 };
const tetapkan = (id: string, tambahan: Record<string, unknown> = {}) =>
  minta("PUT", "/api/tvr/template", { id, json: { text_box: KOTAK_UJI, ...tambahan } });
async function templateSiap(id: string): Promise<void> {
  pastikan((await draf(id, "kotak", "kotak.png", await pngKotak())).status === 200);
  pastikan((await draf(id, "bingkai", "bingkai.png", await png(720, 120, [200, 0, 0, 255]))).status === 200);
  const r = await tetapkan(id);
  pastikan(r.status === 200, r.teks);
}
const md5 = (b: Buffer) => crypto.createHash("md5").update(b).digest("hex");
const sama = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

await uji("tvr wajib identitas", async () => {
  pastikan((await minta("GET", "/api/tvr/ringkas")).status === 401);
  pastikan((await minta("GET", "/api/tvr/ringkas", { id: "abc" })).status === 401);
});

await uji("tvr template draf, validasi, dan tetapkan", async () => {
  const a = "8001";
  const awal = (await minta("GET", "/api/tvr/ringkas", { id: a })).json();
  pastikan(awal.template.ada === false && awal.job === null);
  let r = await draf(a, "kotak", "kotak.jpg", Buffer.from("\xff\xd8\xff\xe0isi-jpeg", "latin1"));
  pastikan(r.status === 415 && r.json().detail.includes("wajib PNG"), r.teks);
  r = await draf(a, "kotak", "kotak.png", Buffer.from("\xff\xd8\xff\xe0bukan-png", "latin1"));
  pastikan(r.status === 415 && r.json().detail.includes("bukan PNG asli"), r.teks);
  pastikan((await draf(a, "bingkai", "b.gif", gif())).status === 415);
  pastikan((await draf(a, "tidakada", "x.png", await pngKotak())).status === 404);
  r = await draf(a, "kotak", "kotak.png", await pngKotak());
  pastikan(r.status === 200, r.teks);
  let t = r.json().template;
  pastikan(t.ada && !t.siap);
  pastikan(sama(t.slot.kotak, { ada: false, draf: true, jenis: "gambar" }), JSON.stringify(t.slot.kotak));
  r = await tetapkan(a);
  pastikan(r.status === 400 && r.json().detail.includes("Bingkai teratas"), r.teks);
  pastikan(asetTvr(a).length === 0);
  pastikan((await draf(a, "bingkai", "bingkai.png", await png(720, 120, [200, 0, 0, 255]))).status === 200);
  r = await minta("PUT", "/api/tvr/template", { id: a, json: {} });
  pastikan(r.status === 400 && r.json().detail.includes("posisi tulisan"), r.teks);
  r = await minta("PUT", "/api/tvr/template", { id: a, json: { text_box: { x: 600, y: 0, w: 300, h: 100 } } });
  pastikan(r.status === 422, `${r.status}`);
  r = await minta("GET", "/api/tvr/template/pratinjau.png?kotak=30,1000,660,230&warna=black&teks=HALO", { id: a });
  pastikan(r.status === 200 && r.tipe === "image/png" && r.isi.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  video.deteksiTerakhir.clear();
  r = await minta("POST", "/api/tvr/template/deteksi", { id: a });
  pastikan(r.status === 200, r.teks);
  const kotak = r.json().text_box;
  pastikan(kotak.y > 900 && kotak.w > 500, JSON.stringify(kotak));
  pastikan((await minta("POST", "/api/tvr/template/deteksi", { id: a })).status === 429);
  r = await minta("PUT", "/api/tvr/template", { id: a, json: { text_box: kotak, teks_warna: "black" } });
  pastikan(r.status === 200, r.teks);
  t = r.json().template;
  pastikan(t.siap && t.slot.kotak.ada && !t.slot.kotak.draf);
  pastikan(sama(t.text_box, kotak) && t.teks_warna === "black");
  pastikan(sama(asetTvr(a), ["bingkai.png", "kotak.png"]), JSON.stringify(asetTvr(a)));
  pastikan(!fs.existsSync(path.join(jalur.templatePath(`tvr-${a}`), "assets", ".draf")));
});

await uji("tvr edit template menggantikan, bukan menumpuk", async () => {
  const a = "8002";
  await templateSiap(a);
  const folder = path.join(jalur.templatePath(`tvr-${a}`), "assets");
  const sidik = md5(fs.readFileSync(path.join(folder, "bingkai.png")));
  pastikan((await draf(a, "bingkai", "baru.png", await png(720, 200, [0, 200, 0, 255]))).status === 200);
  let r = await minta("DELETE", "/api/tvr/template/draf", { id: a });
  pastikan(r.status === 200 && !r.json().template.slot.bingkai.draf);
  pastikan(md5(fs.readFileSync(path.join(folder, "bingkai.png"))) === sidik);
  pastikan((await draf(a, "boom", "boom.gif", gif())).status === 200);
  pastikan((await tetapkan(a)).status === 200);
  pastikan(asetTvr(a).includes("boom.gif"));
  r = await draf(a, "boom", "boom.mp4", hijau());
  pastikan(r.status === 200, r.teks);
  pastikan(r.json().template.slot.boom.alpha === false);
  pastikan((await tetapkan(a, { kunci_hijau: true })).status === 200);
  pastikan(sama(asetTvr(a), ["bingkai.png", "boom.mp4", "kotak.png"]), JSON.stringify(asetTvr(a)));
  const boom = (tpl.loadTemplate(`tvr-${a}`).overlays as any[])[1];
  pastikan(boom.file === "assets/boom.mp4" && boom.loop && boom.kunci_hijau, JSON.stringify(boom));
  r = await draf(a, "boom", "boom.webm", webmAlpha());
  pastikan(r.status === 200, r.teks);
  pastikan(r.json().template.slot.boom.alpha === true);
  pastikan((await tetapkan(a)).status === 200);
  pastikan(sama(asetTvr(a), ["bingkai.png", "boom.mov", "kotak.png"]), JSON.stringify(asetTvr(a)));
  pastikan((await tetapkan(a, { kosongkan: ["boom"] })).status === 200);
  pastikan(sama(asetTvr(a), ["bingkai.png", "kotak.png"]));
  pastikan((await tetapkan(a, { kosongkan: ["kotak"] })).status === 422);
});

await uji("tvr penutup dibatasi durasinya", async () => {
  const a = "8003";
  const lama = tvr.batasTvr.maksAnimasiDetik;
  tvr.batasTvr.maksAnimasiDetik = 1;
  try {
    const r = await draf(a, "penutup", "penutup.mp4", penutup());
    pastikan(r.status === 413 && r.json().detail.includes("maksimal"), r.teks);
    const folderDraf = path.join(jalur.templatePath(`tvr-${a}`), "assets", ".draf");
    pastikan(!fs.existsSync(folderDraf) || fs.readdirSync(folderDraf).length === 0);
  } finally {
    tvr.batasTvr.maksAnimasiDetik = lama;
  }
});

await uji("tvr antrean satu video per akun dan render", async () => {
  const [a, b] = ["8101", "8102"];
  for (const sisa of await job.redis().zrange(job.KUNCI_AKTIF, 0, -1)) {
    await job.tulisStatus(sisa, { status: "error", log: "dibereskan uji" });
  }
  let r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: "https://www.instagram.com/reel/X/", hook: "UJI" } });
  pastikan(r.status === 409, `${r.status}`);
  await templateSiap(a);
  await templateSiap(b);
  pastikan((await draf(a, "boom", "boom.mp4", hijau())).status === 200);
  pastikan((await draf(a, "penutup", "penutup.mp4", penutup())).status === 200);
  pastikan((await tetapkan(a, { kunci_hijau: true })).status === 200);
  r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: "https://www.instagram.com/reel/X/", hook: "   " } });
  pastikan(r.status === 422, `${r.status}`);

  r = await minta("POST", "/api/tvr/sumber", { id: a, berkas: { nama: "s.mp4", isi: videoSumber(3), tipe: "video/mp4" } });
  pastikan(r.status === 200, r.teks);
  const sumberA = r.json().url as string;
  r = await minta("POST", "/api/tvr/jobs", { id: b, json: { url: sumberA, hook: "UJI" } });
  pastikan(r.status === 404, `${r.status}`);

  TUGAS.length = 0;
  r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: sumberA, hook: "VIRAL! UJI EDIT OTOMATIS TVR SAYA", sumber: "SUMBER: @uji" } });
  pastikan(r.status === 200, r.teks);
  const d = r.json();
  pastikan(d.job.status === "queued" && d.antrean.posisi === 1, JSON.stringify(d));
  r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: sumberA, hook: "LAGI" } });
  pastikan(r.status === 409 && r.json().detail.includes("masih diproses"), r.teks);
  r = await minta("POST", "/api/tvr/jobs", { id: b, json: { url: "https://www.instagram.com/reel/B/", hook: "UJI B" } });
  pastikan(r.status === 200, r.teks);
  const antreB = r.json().antrean;
  pastikan(antreB.posisi === 2 && antreB.di_depan === 1, JSON.stringify(antreB));
  pastikan(antreB.perkiraan_detik >= 2 * (await job.rataDurasi()) - 1);

  const hasil = await pekerja.renderVideo(TUGAS[0]);
  pastikan(hasil.status === "done", JSON.stringify(hasil));
  let st = (await minta("GET", "/api/tvr/jobs/saya", { id: a })).json();
  pastikan(st.job.status === "done" && st.antrean === null, JSON.stringify(st));
  pastikan((await minta("GET", "/api/tvr/jobs/saya", { id: b })).json().antrean.posisi === 1);
  const unduhan = await minta("GET", "/api/tvr/jobs/saya/berkas", { id: a });
  pastikan(unduhan.status === 200 && unduhan.tipe === "video/mp4");
  const berkas = path.join(MEDIA, "hasil-tvr.mp4");
  fs.writeFileSync(berkas, unduhan.isi);
  const info = await media.probe(berkas);
  pastikan(info.width === 720 && info.height === 1280 && info.has_audio, JSON.stringify(info));
  // 3 detik video sumber + 2 detik video penutup.
  pastikan(Number(info.duration) > 4.5 && Number(info.duration) < 5.6, `${info.duration}`);
  pastikan((await minta("GET", "/api/tvr/jobs/saya/berkas", { id: b })).status === 409);
  r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: sumberA, hook: "LAGI" } });
  pastikan(r.status === 409 && r.json().detail.includes("sudah jadi"), r.teks);

  const folderJob = job.jobPath(d.job.job_id);
  pastikan(fs.existsSync(folderJob));
  pastikan((await minta("DELETE", "/api/tvr/jobs/saya", { id: a })).json().ok);
  pastikan(!fs.existsSync(folderJob));
  st = (await minta("GET", "/api/tvr/jobs/saya", { id: a })).json();
  pastikan(st.job === null);
  pastikan(fs.existsSync(jalur.folderUnggahan(sumberA) as string));
  r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: sumberA, hook: "ULANG" } });
  pastikan(r.status === 200, r.teks);
  const jobUlang = r.json().job.job_id;
  pastikan((await minta("DELETE", "/api/tvr/jobs/saya?hapus_sumber=1", { id: a })).json().ok);
  pastikan((await job.posisiAntrean(jobUlang)) === null);
  pastikan(!fs.existsSync(jalur.folderUnggahan(sumberA) as string));
  pastikan((await pekerja.renderVideo(TUGAS[TUGAS.length - 1])).status === "hilang");
});

await uji("tvr render dengan gif berulang", async () => {
  const a = "8103";
  await templateSiap(a);
  pastikan((await draf(a, "boom", "boom.gif", gif())).status === 200);
  pastikan((await tetapkan(a)).status === 200);
  let r = await minta("POST", "/api/tvr/sumber", { id: a, berkas: { nama: "s.mp4", isi: videoSumber(3), tipe: "video/mp4" } });
  TUGAS.length = 0;
  r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: r.json().url, hook: "UJI GIF" } });
  pastikan(r.status === 200, r.teks);
  pastikan((await pekerja.renderVideo(TUGAS[0])).status === "done");
  pastikan((await minta("GET", "/api/tvr/jobs/saya", { id: a })).json().job.status === "done");
});

await uji("tvr unggahan baru membuang unggahan lama", async () => {
  const a = "8104";
  const r1 = (await minta("POST", "/api/tvr/sumber", { id: a, berkas: { nama: "1.mp4", isi: videoSumber(2) } })).json();
  const r2 = (await minta("POST", "/api/tvr/sumber", { id: a, berkas: { nama: "2.mp4", isi: videoSumber(2) } })).json();
  pastikan(!fs.existsSync(jalur.folderUnggahan(r1.url) as string));
  pastikan(fs.existsSync(jalur.folderUnggahan(r2.url) as string));
});

await uji("tvr identitas tidak membuat template awal", async () => {
  await minta("GET", "/api/tvr/ringkas", { id: "8105" });
  pastikan(tpl.listTemplates("pri-8105").length === 0);
});

await uji("tvr template persis susunan GODAM", async () => {
  const a = "8106";
  pastikan((await draf(a, "kotak", "kotak.png", await pngKotak())).status === 200);
  pastikan((await draf(a, "bingkai", "bingkai.png", await png(720, 120, [200, 0, 0, 255]))).status === 200);
  pastikan((await draf(a, "boom", "boom.gif", gif())).status === 200);
  let t = (await minta("GET", "/api/tvr/ringkas", { id: a })).json().template;
  pastikan(t.teks_warna === "white" && t.rata === "justify" && t.kategori === "", JSON.stringify(t));
  const badge = { x: 36, y: 950, w: 260, h: 48 };
  let r = await minta("PUT", "/api/tvr/template", {
    id: a,
    json: { text_box: KOTAK_UJI, badge_box: badge, kategori: "  news  ", rata: "center", teks_warna: "black" },
  });
  pastikan(r.status === 200, r.teks);
  t = r.json().template;
  pastikan(t.kategori === "NEWS" && sama(t.badge_box, badge) && t.rata === "center", JSON.stringify(t));
  pastikan(t.badge_box_default !== null);
  const isi = tpl.loadTemplate(`tvr-${a}`) as any;
  pastikan(sama(isi.overlays.map((o: any) => o.label), ["kotak monas", "boom like share", "bingkai teratas"]));
  const boom = isi.overlays[1];
  pastikan(sama([boom.x, boom.y, boom.w, boom.h, boom.loop], [45, 55, 280, 158, true]));
  pastikan(sama(isi.texts.map((x: any) => x.name), ["hook", "kategori", "sumber"]));
  pastikan(isi.texts[0].align === "center" && isi.texts[1].source === "kategori");
  pastikan(sama([isi.width, isi.height, isi.fps], [720, 1280, 30]));
  pastikan((await minta("PUT", "/api/tvr/template", { id: a, json: { text_box: KOTAK_UJI, kategori: "X".repeat(31) } })).status === 422);
  pastikan((await minta("PUT", "/api/tvr/template", { id: a, json: { text_box: KOTAK_UJI, rata: "miring" } })).status === 422);
  r = await minta("GET", "/api/tvr/template/pratinjau.png?badge=36,950,260,48&kategori=hiburan&rata=left", { id: a });
  pastikan(r.status === 200 && r.isi.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  r = await minta("POST", "/api/tvr/sumber", { id: a, berkas: { nama: "s.mp4", isi: videoSumber(3), tipe: "video/mp4" } });
  TUGAS.length = 0;
  pastikan((await minta("POST", "/api/tvr/jobs", { id: a, json: { url: r.json().url, hook: "UJI BADGE", kategori: "hiburan" } })).status === 200);
  // Kategori PER VIDEO masuk ke texts.kategori (dibersihkan → kapital), bukan template.
  pastikan(TUGAS[0].texts.kategori === "HIBURAN", JSON.stringify(TUGAS[0].texts));
  pastikan((await pekerja.renderVideo(TUGAS[0])).status === "done");
  const berkas = path.join(MEDIA, "hasil-badge.mp4");
  fs.writeFileSync(berkas, (await minta("GET", "/api/tvr/jobs/saya/berkas", { id: a })).isi);
  const bingkai = path.join(MEDIA, "badge.png");
  ffmpeg("-ss", "1", "-i", berkas, "-frames:v", "1", "-update", "1", bingkai);
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(bingkai).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // Huruf badge (putih) tergambar di dalam kotaknya; video sumber di bagian
  // itu tidak punya piksel putih murni.
  let putih = 0;
  for (let x = 100; x < badge.x + badge.w; x++) {
    for (let y = badge.y; y < badge.y + badge.h; y++) {
      const i = (y * info.width + x) * 3;
      if (Math.min(data[i], data[i + 1], data[i + 2]) > 235) putih += 1;
    }
  }
  pastikan(putih > 150, `${putih}`);
});

// ---------------------------------------------------------------- selesai

server.close();
await job.redis().quit();
fs.rmSync(MEDIA, { recursive: true, force: true });
console.log(`\n${lolos} lolos, ${gagal.length} gagal`);
if (gagal.length) {
  console.log("Gagal:\n - " + gagal.join("\n - "));
  process.exit(1);
}
process.exit(0);
