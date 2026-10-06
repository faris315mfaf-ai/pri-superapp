// Uji layanan Auto Edit TS lewat HTTP: port tests/test_autoedit.py (Python)
// kasus demi kasus — keamanan, pemisahan akun, render & outro sungguhan
// dengan ffmpeg, dan Edit Otomatis TVR Saya. Redis diganti tiruan di memori;
// antrean diganti penampung TUGAS lalu worker dijalankan langsung.
//
//   npx tsx tests/mesin-video/uji-api.mts
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const MEDIA = fs.mkdtempSync(path.join(os.tmpdir(), "autoedit-uji-"));
// ab-av1 TIRUAN untuk uji Kompres Video: mencetak hasil crf-search seperti
// aslinya (ab-av1 hanya ada untuk Linux/Windows). Encode akhirnya tetap ffmpeg asli.
const AB_AV1_TIRUAN = path.join(MEDIA, "ab-av1-tiruan.sh");
fs.writeFileSync(
  AB_AV1_TIRUAN,
  // Berkas penanda "ab-av1-gagal" membuat tiruan ini gagal (uji kompres otomatis gagal).
  `#!/bin/sh\n[ -f "${path.join(MEDIA, "ab-av1-gagal")}" ] && { echo "error: tiruan gagal" >&2; exit 1; }\necho "sample 1/1 crf 30 VMAF 94.6 (40%)"\necho "crf 30 VMAF 94.60 predicted video stream size 1.00 MiB (40%) taking 1 minutes"\n`,
  { mode: 0o755 },
);
// rembg TIRUAN untuk uji Hapus Latar (jalan AI): tiap frame dibalas PNG beralpha.
const PNG_ALFA = path.join(MEDIA, "rembg-tiruan.png");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red@0.5:s=64x36,format=rgba", "-frames:v", "1", PNG_ALFA]);
let panggilanRembg = 0;
const rembgTiruan = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    panggilanRembg++;
    res.writeHead(200, { "content-type": "image/png" });
    res.end(fs.readFileSync(PNG_ALFA));
  });
});
await new Promise<void>((ok) => rembgTiruan.listen(0, "127.0.0.1", ok));
Object.assign(process.env, {
  REMBG_URL: `http://127.0.0.1:${(rembgTiruan.address() as AddressInfo).port}`,
  HAPUS_LATAR_FPS: "5",
  MEDIA_DIR: MEDIA,
  OUTRO_VIDEO_W: "360",
  OUTRO_VIDEO_H: "640",
  VIDEO_THREADS: "1",
  // Akun TIM uji (pri-8201): kuota, stok, dan antrean khusus.
  KUOTA_KHUSUS_MB: "pri-8201=5120",
  TVR_MAKS_STOK_KHUSUS: "pri-8201=150",
  TVR_JOB_AKTIF_KHUSUS: "pri-8201=4",
  AB_AV1_BIN: AB_AV1_TIRUAN,
  KOMPRES_THREADS: "1",
});
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
  opsi: { id?: string | null; anggota?: string; json?: unknown; berkas?: { nama: string; isi: Buffer; tipe?: string } } = {},
): Promise<Jawaban> {
  const headers: Record<string, string> = {};
  if (opsi.id !== undefined && opsi.id !== null) headers["X-Autoedit-Pengguna"] = opsi.id;
  if (opsi.anggota) headers["X-Autoedit-Anggota"] = opsi.anggota;
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

await uji("slot serentak diatur & dibaca master", async () => {
  const id = "1011";
  let r = await minta("GET", "/api/video/slot", { id });
  pastikan(r.status === 200 && r.json().slot >= 1 && r.json().maks >= 1, r.teks);
  r = await minta("POST", "/api/video/slot", { id, json: { slot: 3 } });
  pastikan(r.status === 200 && r.json().slot === 3, r.teks);
  pastikan((await minta("GET", "/api/video/slot", { id })).json().slot === 3);
  // di luar batas ditolak
  pastikan((await minta("POST", "/api/video/slot", { id, json: { slot: 999 } })).status === 422);
  pastikan((await minta("POST", "/api/video/slot", { id, json: { slot: 0 } })).status === 422);
  // kembalikan ke 1 supaya tak mengubah perkiraan antrean uji lain
  pastikan((await minta("POST", "/api/video/slot", { id, json: { slot: 1 } })).json().slot === 1);
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
  const infoKuota = (await minta("GET", "/api/video/info", { id })).json().kuota;
  pastikan(infoKuota.tamu === false && infoKuota.batas_mb === 1024, JSON.stringify(infoKuota));
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

await uji("tvr antrean banyak video per akun, giliran adil, dan render", async () => {
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
  // Boleh menambah video lagi selagi yang pertama mengantre (6 Okt 2026).
  r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: "https://www.instagram.com/reel/LAGI/", hook: "LAGI" } });
  pastikan(r.status === 200, r.teks);
  const jobsA = r.json().jobs as { job_id: string; antrean: { posisi: number } }[];
  pastikan(jobsA.length === 2, JSON.stringify(jobsA));
  const keduaA = jobsA.find((j) => j.job_id !== d.job.job_id)!;
  r = await minta("POST", "/api/tvr/jobs", { id: b, json: { url: "https://www.instagram.com/reel/B/", hook: "UJI B" } });
  pastikan(r.status === 200, r.teks);
  // Giliran adil: video PERTAMA b mendahului video KEDUA a.
  const antreB = r.json().antrean;
  pastikan(antreB.posisi === 2 && antreB.di_depan === 1, JSON.stringify(antreB));
  pastikan(antreB.perkiraan_detik >= 2 * (await job.rataDurasi()) - 1);
  pastikan((await job.posisiAntrean(keduaA.job_id))?.posisi === 3, JSON.stringify(await job.posisiAntrean(keduaA.job_id)));
  pastikan(TUGAS.length === 3);
  // Video kedua a dibatalkan lagi supaya sisa uji ini tetap satu video.
  r = await minta("DELETE", `/api/tvr/jobs/${keduaA.job_id}`, { id: a });
  pastikan(r.status === 200, r.teks);

  const hasil = await pekerja.renderVideo(TUGAS[0]);
  pastikan(hasil.status === "done", JSON.stringify(hasil));
  // a: video jadi masuk STOK, antrean bebas (tak ada job aktif).
  let st = (await minta("GET", "/api/tvr/jobs/saya", { id: a })).json();
  pastikan(st.job === null && st.antrean === null && st.stok.length === 1, JSON.stringify(st));
  const item = st.stok[0];
  pastikan(item.sumber === "render" && item.judul && item.durasi && item.size, JSON.stringify(item));
  // Kompres otomatis (VMAF 90) dijalankan pada hasil render; dipakai hanya
  // bila memperkecil (video uji ini kecil & didominasi audio, jadi bisa tidak).
  const logRender = ((await job.bacaStatus(item.id)).logs ?? []) as string[];
  pastikan(logRender.some((l) => l.includes("Mengompres otomatis (kualitas VMAF 90)")), JSON.stringify(logRender));
  pastikan(item.hemat_persen === undefined || (item.hemat_persen > 0 && item.size < item.size_awal), JSON.stringify(item));
  pastikan(!fs.existsSync(path.join(jalur.jobsDir(), item.id, "kompres.mp4")));
  pastikan(!fs.existsSync(path.join(jalur.jobsDir(), item.id, "kerja-kompres")));
  // b masih mengantre; setelah a selesai, b jadi posisi 1.
  pastikan((await minta("GET", "/api/tvr/jobs/saya", { id: b })).json().job?.status === "queued");
  const unduhan = await minta("GET", `/api/tvr/stok/${item.id}/berkas`, { id: a });
  pastikan(unduhan.status === 200 && unduhan.tipe === "video/mp4");
  // Thumbnail: 1 frame JPEG, milik akun ini saja.
  const thumb = await minta("GET", `/api/tvr/stok/${item.id}/thumb`, { id: a });
  pastikan(thumb.status === 200 && thumb.tipe === "image/jpeg" && thumb.isi.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])), `${thumb.status} ${thumb.tipe}`);
  pastikan((await minta("GET", `/api/tvr/stok/${item.id}/thumb`, { id: b })).status === 404);
  const berkas = path.join(MEDIA, "hasil-tvr.mp4");
  fs.writeFileSync(berkas, unduhan.isi);
  const info = await media.probe(berkas);
  pastikan(info.width === 720 && info.height === 1280 && info.has_audio, JSON.stringify(info));
  // 3 detik video sumber + 2 detik video penutup.
  pastikan(Number(info.duration) > 4.5 && Number(info.duration) < 5.6, `${info.duration}`);
  // b belum punya stok; stok & berkas orang lain tak bisa diakses.
  pastikan((await minta("GET", "/api/tvr/stok", { id: b })).json().stok.length === 0);
  pastikan((await minta("GET", `/api/tvr/stok/${item.id}/berkas`, { id: b })).status === 404);

  // Antrean bebas: a boleh mulai video baru lagi (bukan lagi "sudah jadi" 409).
  r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: sumberA, hook: "LAGI" } });
  pastikan(r.status === 200, r.teks);
  const jobBaru = r.json().job.job_id as string;

  // Tambah video JADI dari perangkat langsung ke stok (tanpa diedit).
  const rUp = await minta("POST", "/api/tvr/stok", { id: a, berkas: { nama: "monas keren.mp4", isi: penutup(), tipe: "video/mp4" } });
  pastikan(rUp.status === 200, rUp.teks);
  const stok2 = rUp.json().stok as { id: string; sumber: string; judul: string }[];
  pastikan(stok2.length === 2 && stok2.some((s) => s.sumber === "unggah"), JSON.stringify(stok2));
  pastikan(stok2.some((s) => s.judul === "monas keren"), JSON.stringify(stok2));

  // Tandai item sudah terunggah: DIBERI TANDA, tetap ada di stok (tak dihapus).
  const rMark = await minta("POST", `/api/tvr/stok/${item.id}/terunggah`, { id: a });
  pastikan(rMark.status === 200, rMark.teks);
  const ditandai = (rMark.json().stok as { id: string; terunggah: number | null }[]).find((s) => s.id === item.id);
  pastikan(ditandai !== undefined && typeof ditandai.terunggah === "number", JSON.stringify(ditandai));

  // Hapus satu item stok (hasil render): berkas & catatannya hilang.
  const folderItem = job.jobPath(item.id);
  pastikan(fs.existsSync(folderItem));
  pastikan((await minta("DELETE", `/api/tvr/stok/${item.id}`, { id: a })).json().ok);
  pastikan(!fs.existsSync(folderItem));
  pastikan((await minta("GET", "/api/tvr/stok", { id: a })).json().stok.length === 1);

  // Batalkan job aktif baru + buang video sumbernya.
  pastikan(fs.existsSync(jalur.folderUnggahan(sumberA) as string));
  pastikan((await minta("DELETE", "/api/tvr/jobs/saya?hapus_sumber=1", { id: a })).json().ok);
  pastikan((await job.posisiAntrean(jobBaru)) === null);
  pastikan(!fs.existsSync(jalur.folderUnggahan(sumberA) as string));
  // Tugas yang terlanjur di antrean dilewati worker karena job-nya sudah tiada.
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
  // Kompres otomatis GAGAL tidak boleh menggagalkan render: video asli dipakai.
  const penanda = path.join(MEDIA, "ab-av1-gagal");
  fs.writeFileSync(penanda, "");
  try {
    pastikan((await pekerja.renderVideo(TUGAS[0])).status === "done");
  } finally {
    fs.rmSync(penanda, { force: true });
  }
  const stokGif = (await minta("GET", "/api/tvr/jobs/saya", { id: a })).json().stok;
  pastikan(stokGif.length === 1 && stokGif[0].hemat_persen === undefined, JSON.stringify(stokGif));
  pastikan(!fs.existsSync(path.join(jalur.jobsDir(), stokGif[0].id, "kompres.mp4")));
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
  const sid = (await minta("GET", "/api/tvr/jobs/saya", { id: a })).json().stok[0].id;
  fs.writeFileSync(berkas, (await minta("GET", `/api/tvr/stok/${sid}/berkas`, { id: a })).isi);
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

await uji("tvr akun tim: antre bersamaan, unggahan per anggota, batal milik sendiri", async () => {
  const tim = "8201";
  for (const sisa of await job.redis().zrange(job.KUNCI_AKTIF, 0, -1)) {
    await job.tulisStatus(sisa, { status: "error", log: "dibereskan uji" });
  }
  await templateSiap(tim);
  // Kuota & batas stok khusus akun tim.
  let st = (await minta("GET", "/api/tvr/ringkas", { id: tim, anggota: "11" })).json();
  pastikan(st.kuota.batas_mb === 5120 && st.maks_stok === 150 && st.maks_job_aktif === 4, JSON.stringify(st));
  pastikan(Array.isArray(st.jobs) && st.jobs.length === 0, JSON.stringify(st.jobs));

  // Dua anggota mengunggah sumber: unggahan anggota 11 TIDAK dibuang oleh anggota 12.
  let r = await minta("POST", "/api/tvr/sumber", { id: tim, anggota: "11", berkas: { nama: "a.mp4", isi: videoSumber(2), tipe: "video/mp4" } });
  pastikan(r.status === 200, r.teks);
  const urlA = r.json().url as string;
  r = await minta("POST", "/api/tvr/sumber", { id: tim, anggota: "12", berkas: { nama: "b.mp4", isi: videoSumber(2), tipe: "video/mp4" } });
  pastikan(r.status === 200, r.teks);
  const urlB = r.json().url as string;
  pastikan(urlA !== urlB, "dua unggahan harus berbeda");

  // Keduanya mengantre bersamaan (akun pribadi akan 409). Job anggota 11
  // diterima SETELAH anggota 12 mengunggah — mesin menolak sumber yang
  // berkasnya sudah dibuang, jadi ini bukti unggahannya tidak terhapus.
  r = await minta("POST", "/api/tvr/jobs", { id: tim, anggota: "11", json: { url: urlA, hook: "TIM A" } });
  pastikan(r.status === 200, r.teks);
  r = await minta("POST", "/api/tvr/jobs", { id: tim, anggota: "12", json: { url: urlB, hook: "TIM B" } });
  pastikan(r.status === 200, r.teks);
  let jobs = r.json().jobs as { job_id: string; anggota: string; antrean: { posisi: number } | null }[];
  pastikan(jobs.length === 2 && jobs.every((j) => j.antrean !== null), JSON.stringify(jobs));
  const milikA = jobs.find((j) => j.anggota === "11");
  const milikB = jobs.find((j) => j.anggota === "12");
  pastikan(Boolean(milikA && milikB), JSON.stringify(jobs));

  // Anggota 12 tidak bisa membatalkan video anggota 11; pembuatnya bisa.
  r = await minta("DELETE", `/api/tvr/jobs/${milikA!.job_id}`, { id: tim, anggota: "12" });
  pastikan(r.status === 404, `${r.status}`);
  r = await minta("DELETE", `/api/tvr/jobs/${milikA!.job_id}`, { id: tim, anggota: "11" });
  pastikan(r.status === 200, r.teks);
  jobs = r.json().jobs;
  pastikan(jobs.length === 1 && jobs[0].anggota === "12", JSON.stringify(jobs));

  // Batas antrean tim (4): 3 lagi masuk, yang ke-5 ditolak.
  for (const n of [1, 2, 3]) {
    r = await minta("POST", "/api/tvr/jobs", { id: tim, anggota: "13", json: { url: `https://www.instagram.com/reel/TIM${n}/`, hook: `TIM ${n}` } });
    pastikan(r.status === 200, r.teks);
  }
  r = await minta("POST", "/api/tvr/jobs", { id: tim, anggota: "13", json: { url: "https://www.instagram.com/reel/TIM9/", hook: "TIM 9" } });
  pastikan(r.status === 429 && r.json().detail.includes("Antrean Anda penuh"), r.teks);

  // Akun pribadi juga mendapat daftar antrean (bisa banyak video, 6 Okt 2026).
  pastikan(Array.isArray((await minta("GET", "/api/tvr/ringkas", { id: "8102" })).json().jobs));
  for (const sisa of await job.redis().zrange(job.KUNCI_AKTIF, 0, -1)) {
    await job.tulisStatus(sisa, { status: "error", log: "dibereskan uji" });
  }
});

await uji("kompres video: antre banyak, worker, masuk stok, tak memblok edit", async () => {
  const a = "8301";
  for (const sisa of await job.redis().zrange(job.KUNCI_AKTIF, 0, -1)) {
    await job.tulisStatus(sisa, { status: "error", log: "dibereskan uji" });
  }
  // Sumber bitrate tinggi supaya hasil kompres CRF 30 jelas lebih kecil.
  const besar = path.join(MEDIA, "kompres-sumber.mp4");
  ffmpeg("-f", "lavfi", "-i", "testsrc2=s=360x640:r=25", "-t", "3", "-c:v", "libx264", "-crf", "8", "-pix_fmt", "yuv420p", besar);
  TUGAS.length = 0;
  let r = await minta("POST", "/api/tvr/kompres?mutu=kecil", { id: a, berkas: { nama: "rekaman hp.mp4", isi: fs.readFileSync(besar), tipe: "video/mp4" } });
  pastikan(r.status === 200, r.teks);
  const k = r.json().kompres as { id: string; status: string; mutu: string }[];
  pastikan(k.length === 1 && k[0].status === "queued" && k[0].mutu === "kecil", JSON.stringify(k));
  // Boleh mengantre kompres berikutnya (6 Okt 2026); yang kedua lalu dibatalkan.
  r = await minta("POST", "/api/tvr/kompres", { id: a, berkas: { nama: "lagi.mp4", isi: fs.readFileSync(besar), tipe: "video/mp4" } });
  pastikan(r.status === 200, r.teks);
  const k2 = (r.json().kompres as { id: string }[]).find((x) => x.id !== k[0].id);
  pastikan(Boolean(k2) && r.json().kompres.length === 2, r.teks);
  r = await minta("DELETE", `/api/tvr/kompres/${k2!.id}`, { id: a });
  pastikan(r.status === 200 && r.json().kompres.length === 1, r.teks);
  // Tidak memblok Edit Otomatis: ringkasan tak menganggapnya job aktif.
  pastikan((await minta("GET", "/api/tvr/jobs/saya", { id: a })).json().job === null);

  const muatan = TUGAS.find((t) => t.job_id === k[0].id);
  pastikan(Boolean(muatan) && muatan!.jenis === "kompres", JSON.stringify(TUGAS));
  const hasil = await pekerja.kompresJob(muatan!);
  pastikan(hasil.status === "done", JSON.stringify(hasil));
  const st = (await minta("GET", "/api/tvr/stok", { id: a })).json();
  const item = st.stok.find((s: { id: string }) => s.id === k[0].id);
  pastikan(item && item.sumber === "kompres" && item.hemat_persen > 0 && item.vmaf === 94.6, JSON.stringify(item));
  pastikan(item.size < item.size_awal, JSON.stringify(item));
  // Masukan dibuang; hasil bisa diunduh.
  const unduhan = await minta("GET", `/api/tvr/stok/${item.id}/berkas`, { id: a });
  pastikan(unduhan.status === 200 && unduhan.isi.length === item.size);
  pastikan((await minta("GET", "/api/tvr/kompres", { id: a })).json().kompres.length === 0);
});

await uji("hapus latar boom: warna polos, AI, Boom diganti, tak memblok edit", async () => {
  const a = "8401";
  await templateSiap(a);
  const hapus = (metode: string) => minta(metode, "/api/tvr/template/hapus-latar", { id: a });
  const tugas = () => {
    const m = TUGAS.find((t) => t.jenis === "hapuslatar");
    pastikan(Boolean(m), JSON.stringify(TUGAS));
    return m!;
  };

  // 1. Green screen → jalan WARNA (tanpa AI).
  pastikan((await draf(a, "boom", "boom.mp4", hijau())).status === 200);
  TUGAS.length = 0;
  panggilanRembg = 0;
  let r = await hapus("POST");
  pastikan(r.status === 200 && r.json().hapus_latar.status === "queued", r.teks);
  pastikan((await hapus("POST")).status === 409);
  pastikan((await minta("GET", "/api/tvr/jobs/saya", { id: a })).json().job === null);
  pastikan((await pekerja.hapusLatarJob(tugas())).status === "done");
  let d = (await hapus("GET")).json();
  pastikan(d.hapus_latar.status === "done" && d.hapus_latar.mode === "warna" && panggilanRembg === 0, JSON.stringify(d.hapus_latar));
  pastikan(d.template.slot.boom.draf === true && d.template.slot.boom.alpha === true, JSON.stringify(d.template.slot.boom));
  // Sudah transparan: tidak ada yang perlu dibuang.
  pastikan((await hapus("POST")).status === 400);

  // 2. Latar ramai → jalan AI, frame demi frame lewat rembg.
  const ramai = () =>
    berkasVideo("boom-ramai.mp4", "-f", "lavfi", "-i", "testsrc2=s=280x158:d=1.2:r=25", "-c:v", "libx264", "-pix_fmt", "yuv420p");
  pastikan((await draf(a, "boom", "boom.mp4", ramai())).status === 200);
  TUGAS.length = 0;
  pastikan((await hapus("POST")).status === 200);
  pastikan((await pekerja.hapusLatarJob(tugas())).status === "done");
  d = (await hapus("GET")).json();
  pastikan(d.hapus_latar.mode === "ai" && panggilanRembg >= 5, `${panggilanRembg} ${JSON.stringify(d.hapus_latar)}`);
  pastikan(d.template.slot.boom.alpha === true);

  // 3. Boom diunggah ulang selagi antre → job dibatalkan, Boom baru utuh.
  pastikan((await draf(a, "boom", "boom.mp4", ramai())).status === 200);
  TUGAS.length = 0;
  pastikan((await hapus("POST")).status === 200);
  const m3 = tugas();
  pastikan((await draf(a, "boom", "boom.mp4", hijau())).status === 200);
  pastikan((await pekerja.hapusLatarJob(m3)).status !== "done");
  pastikan((await hapus("GET")).json().template.slot.boom.alpha === false);

  // 4. Boom berubah di tengah proses → hasil dibuang, tidak menimpa.
  TUGAS.length = 0;
  pastikan((await hapus("POST")).status === 200);
  const boomDraf = path.join(jalur.templatePath(`tvr-${a}`), "assets", ".draf", "boom.mp4");
  fs.utimesSync(boomDraf, new Date(), new Date(Date.now() + 5000));
  pastikan((await pekerja.hapusLatarJob(tugas())).status === "dibatalkan");
  d = (await hapus("GET")).json();
  pastikan(d.template.slot.boom.alpha === false && /diganti/.test(d.hapus_latar.log), JSON.stringify(d.hapus_latar));
});

await uji("blur watermark: draf, pratinjau, 3 efek, dari stok, validasi", async () => {
  const a = "8501";
  for (const sisa of await job.redis().zrange(job.KUNCI_AKTIF, 0, -1)) {
    await job.tulisStatus(sisa, { status: "error", log: "dibereskan uji" });
  }
  const sumber = videoSumber(2);
  TUGAS.length = 0;
  // 1. Unggah → draf + ukuran tampil + pratinjau JPEG.
  let r = await minta("POST", "/api/tvr/blur", { id: a, berkas: { nama: "watermark.mp4", isi: sumber, tipe: "video/mp4" } });
  pastikan(r.status === 200, r.teks);
  const draf = r.json().draf as { id: string; status: string; lebar: number; tinggi: number };
  pastikan(draf.status === "draf" && draf.lebar > 0 && draf.tinggi > 0, JSON.stringify(draf));
  const g = await minta("GET", `/api/tvr/blur/${draf.id}/pratinjau.jpg`, { id: a });
  pastikan(g.status === 200 && g.isi[0] === 0xff && g.isi[1] === 0xd8, `pratinjau ${g.status}`);
  // Validasi: 4 kotak ditolak, efek asing ditolak.
  const kotak4 = Array.from({ length: 4 }, () => ({ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }));
  pastikan((await minta("POST", `/api/tvr/blur/${draf.id}/proses`, { id: a, json: { efek: "blur", kotak: kotak4 } })).status === 422);
  pastikan((await minta("POST", `/api/tvr/blur/${draf.id}/proses`, { id: a, json: { efek: "api", kotak: kotak4.slice(0, 1) } })).status === 422);
  // Akun lain tidak bisa menyentuh draf ini.
  pastikan((await minta("GET", `/api/tvr/blur/${draf.id}/pratinjau.jpg`, { id: "8502" })).status === 404);

  // 2. Proses: 2 kotak mosaik (satu menempel tepi kanan-bawah).
  const kotak = [{ x: 0.02, y: 0.03, w: 0.45, h: 0.11 }, { x: 0.6, y: 0.9, w: 0.5, h: 0.2 }];
  r = await minta("POST", `/api/tvr/blur/${draf.id}/proses`, { id: a, json: { efek: "mosaik", kotak } });
  pastikan(r.status === 200, r.teks);
  // Boleh menyiapkan video berikutnya selagi yang ini mengantre (6 Okt 2026).
  r = await minta("POST", "/api/tvr/blur", { id: a, berkas: { nama: "lagi.mp4", isi: sumber, tipe: "video/mp4" } });
  pastikan(r.status === 200 && r.json().blur.length === 2, r.teks);
  const lagi = r.json().draf as { id: string };
  pastikan((await minta("DELETE", `/api/tvr/blur/${lagi.id}`, { id: a })).json().blur.length === 1);
  pastikan((await minta("GET", "/api/tvr/jobs/saya", { id: a })).json().job === null);
  let m = TUGAS.find((t) => t.job_id === draf.id);
  pastikan(Boolean(m) && m!.jenis === "blur", JSON.stringify(TUGAS));
  pastikan((await pekerja.blurJob(m!)).status === "done");
  let stok = (await minta("GET", "/api/tvr/stok", { id: a })).json().stok as { id: string; sumber: string; size: number }[];
  pastikan(stok.some((s) => s.id === draf.id && s.sumber === "blur" && s.size > 0), JSON.stringify(stok));
  pastikan((await minta("GET", "/api/tvr/blur", { id: a })).json().blur.length === 0);

  // 3. Dari Stok → draf baru (stok asal tetap utuh), efek blur & halus.
  for (const efek of ["blur", "halus"]) {
    TUGAS.length = 0;
    r = await minta("POST", `/api/tvr/blur/dari-stok/${draf.id}`, { id: a });
    pastikan(r.status === 200, r.teks);
    const d2 = r.json().draf as { id: string; judul: string };
    pastikan(d2.judul.startsWith("Blur — "), d2.judul);
    r = await minta("POST", `/api/tvr/blur/${d2.id}/proses`, { id: a, json: { efek, kotak: [{ x: 0, y: 0, w: 1, h: 0.2 }] } });
    pastikan(r.status === 200, r.teks);
    m = TUGAS.find((t) => t.job_id === d2.id);
    pastikan((await pekerja.blurJob(m!)).status === "done", efek);
  }
  stok = (await minta("GET", "/api/tvr/stok", { id: a })).json().stok;
  pastikan(stok.filter((s) => s.sumber === "blur").length === 3, JSON.stringify(stok));

  // 4. Draf dibuang lewat DELETE.
  r = await minta("POST", "/api/tvr/blur", { id: a, berkas: { nama: "buang.mp4", isi: sumber, tipe: "video/mp4" } });
  const d3 = r.json().draf as { id: string };
  pastikan((await minta("DELETE", `/api/tvr/blur/${d3.id}`, { id: a })).json().blur.length === 0);
});

await uji("tvr hapus template: ditolak selama ada antrean, lalu bersih", async () => {
  const a = "8601";
  for (const sisa of await job.redis().zrange(job.KUNCI_AKTIF, 0, -1)) {
    await job.tulisStatus(sisa, { status: "error", log: "dibereskan uji" });
  }
  await templateSiap(a);
  let r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: "https://www.instagram.com/reel/HAPUS/", hook: "UJI HAPUS" } });
  pastikan(r.status === 200, r.teks);
  const idJob = r.json().job.job_id as string;
  r = await minta("DELETE", "/api/tvr/template", { id: a });
  pastikan(r.status === 409 && r.json().detail.includes("antrean"), r.teks);
  pastikan((await minta("DELETE", `/api/tvr/jobs/${idJob}`, { id: a })).status === 200);
  r = await minta("DELETE", "/api/tvr/template", { id: a });
  pastikan(r.status === 200 && r.json().template.ada === false && r.json().template.siap === false, r.teks);
  pastikan(!fs.existsSync(path.join(MEDIA, "templates", "tvr-8601")));
  // Tanpa template, Edit Otomatis kembali minta template dibuat dulu.
  r = await minta("POST", "/api/tvr/jobs", { id: a, json: { url: "https://www.instagram.com/reel/HAPUS2/", hook: "UJI" } });
  pastikan(r.status === 409, `${r.status}`);
});

// ---------------------------------------------------------------- selesai

server.close();
rembgTiruan.close();
await job.redis().quit();
fs.rmSync(MEDIA, { recursive: true, force: true });
console.log(`\n${lolos} lolos, ${gagal.length} gagal`);
if (gagal.length) {
  console.log("Gagal:\n - " + gagal.join("\n - "));
  process.exit(1);
}
process.exit(0);
