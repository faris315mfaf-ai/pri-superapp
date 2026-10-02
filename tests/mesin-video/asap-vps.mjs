// Uji asap mesin Auto Edit TS di VPS, dijalankan DI DALAM container
// pri-autoedit-ts (tanpa paket tambahan): API + worker sungguhan lewat socket
// Unix, ffmpeg sungguhan. Wajib diarahkan ke disk & Redis TERPISAH dari
// produksi (lihat vps/autoedit-ts/uji-asap.sh) — akun uji 999999997.
//
//   node asap-vps.mjs /run/uji/api.sock
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const SOKET = process.argv[2] || "/run/autoedit/api.sock";
const AKUN = "999999997";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "asap-"));

function minta(method, jalur, { json, berkas } = {}) {
  return new Promise((ok, gagal) => {
    const headers = { "X-Autoedit-Pengguna": AKUN };
    let badan = null;
    if (json !== undefined) {
      badan = Buffer.from(JSON.stringify(json));
      headers["content-type"] = "application/json";
    } else if (berkas) {
      const b = "batas" + Date.now();
      badan = Buffer.concat([
        Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${berkas.nama}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        berkas.isi,
        Buffer.from(`\r\n--${b}--\r\n`),
      ]);
      headers["content-type"] = `multipart/form-data; boundary=${b}`;
    }
    if (badan) headers["content-length"] = badan.length;
    const req = http.request({ socketPath: SOKET, path: jalur, method, headers, timeout: 180_000 }, (res) => {
      const potong = [];
      res.on("data", (d) => potong.push(d));
      res.on("end", () => {
        const isi = Buffer.concat(potong);
        ok({ status: res.statusCode, isi, tipe: res.headers["content-type"] || "", json: () => JSON.parse(isi.toString()) });
      });
    });
    req.on("error", gagal);
    if (badan) req.write(badan);
    req.end();
  });
}

let gagalAda = false;
function cek(nama, syarat, info = "") {
  console.log(`${syarat ? "  OK    " : "  GAGAL "}${nama}${syarat ? "" : `  ${String(info).slice(0, 300)}`}`);
  if (!syarat) gagalAda = true;
}
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "pipe" });
const berkas = (nama, ...a) => {
  const p = path.join(TMP, nama);
  ff(...a, p);
  return fs.readFileSync(p);
};
const probe = (p) =>
  JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", p]).toString());
async function tunggu(cekStatus, batasDetik = 300) {
  const akhir = Date.now() + batasDetik * 1000;
  let st;
  while (Date.now() < akhir) {
    st = await cekStatus();
    if (["done", "error", "dibatalkan"].includes(st?.status)) return st;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return st;
}

// Bahan uji dibuat ffmpeg (lavfi), bukan diunduh.
const sumber = berkas("s.mp4", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=30:duration=4", "-f", "lavfi", "-i",
  "sine=frequency=440:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest");
const pngWarna = (nama, w, h, warna) => berkas(nama, "-f", "lavfi", "-i", `color=c=${warna}:s=${w}x${h}`, "-frames:v", "1");
const kotak = berkas("kotak.png", "-f", "lavfi", "-i", "color=c=0x14143c:s=720x300", "-vf",
  "drawbox=x=20:y=40:w=681:h=241:color=white:t=fill", "-frames:v", "1");
const bingkai = pngWarna("bingkai.png", 720, 120, "0xc80000");
const gif = berkas("boom.gif", "-f", "lavfi", "-i", "testsrc=s=120x80:d=1:r=10", "-vf",
  "split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse");
const penutup = berkas("penutup.mp4", "-f", "lavfi", "-i", "color=c=navy:s=720x1280:d=2:r=30", "-f", "lavfi", "-i",
  "sine=frequency=880:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest");

console.log("Kesehatan & info");
cek("health", (await minta("GET", "/health")).status === 200);
const info = await minta("GET", "/api/video/info");
cek("info + worker hidup", info.status === 200 && info.json().worker_aktif === true, info.isi);
cek("tanpa identitas 401", (await new Promise((ok) => {
  http.get({ socketPath: SOKET, path: "/api/tvr/ringkas" }, (r) => { r.resume(); ok(r.statusCode); });
})) === 401);

console.log("Edit Video (master)");
let r = await minta("POST", "/api/video/templates", {
  json: {
    name: "Asap TS", width: 720, height: 1280, fps: 30,
    overlays: [{ file: "assets/bingkai.png", x: 0, y: "main_h-h", w: 720 }],
    texts: [{ name: "hook", style: "berita", size: 44 }],
    text_box: { x: 40, y: 960, w: 640, h: 240 },
  },
});
cek("buat template", r.status === 200, r.isi);
const tid = r.json().id;
r = await minta("POST", `/api/video/templates/${tid}/assets`, { berkas: { nama: "bingkai.png", isi: bingkai } });
cek("unggah aset", r.status === 200, r.isi);
r = await minta("GET", `/api/video/templates/${tid}/preview.png?teks=1`);
cek("pratinjau template PNG", r.status === 200 && r.tipe === "image/png", r.isi);
r = await minta("POST", "/api/video/sources", { berkas: { nama: "s.mp4", isi: sumber } });
cek("unggah sumber", r.status === 200, r.isi);
const urlSumber = r.json().url;
r = await minta("POST", "/api/video/jobs", { json: { url: urlSumber, template_id: tid, texts: { hook: "VIRAL! UJI ASAP MESIN TS DI VPS" } } });
cek("kirim job", r.status === 200, r.isi);
const jid = r.json().job_id;
let st = await tunggu(async () => (await minta("GET", `/api/video/jobs/${jid}`)).json());
cek("render selesai (worker BullMQ)", st?.status === "done" && st.progress === 100, JSON.stringify(st));
r = await minta("GET", `/api/video/jobs/${jid}/file`);
fs.writeFileSync(path.join(TMP, "hasil.mp4"), r.isi);
let p = probe(path.join(TMP, "hasil.mp4"));
const v = p.streams.find((s) => s.codec_type === "video");
cek("hasil 720x1280 + audio", v?.width === 720 && v?.height === 1280 && p.streams.some((s) => s.codec_type === "audio"));
cek("durasi ~4 dtk", Math.abs(Number(p.format.duration) - 4) < 0.6, p.format.duration);

console.log("Edit Otomatis TVR Saya");
const draf = (slot, nama, isi) => minta("POST", `/api/tvr/template/draf/${slot}`, { berkas: { nama, isi } });
cek("draf kotak", (await draf("kotak", "kotak.png", kotak)).status === 200);
cek("draf bingkai", (await draf("bingkai", "bingkai.png", bingkai)).status === 200);
cek("draf boom gif", (await draf("boom", "boom.gif", gif)).status === 200);
cek("draf penutup", (await draf("penutup", "penutup.mp4", penutup)).status === 200);
r = await minta("POST", "/api/tvr/template/deteksi");
cek("deteksi kotak tulisan", r.status === 200 && r.json().text_box.y > 900, r.isi);
r = await minta("PUT", "/api/tvr/template", { json: { text_box: r.json().text_box, kategori: "berita", rata: "justify" } });
cek("simpan & tetapkan", r.status === 200 && r.json().template.siap, r.isi);
r = await minta("GET", "/api/tvr/template/pratinjau.png?teks=HALO");
cek("pratinjau TVR", r.status === 200 && r.tipe === "image/png");
r = await minta("POST", "/api/tvr/sumber", { berkas: { nama: "s.mp4", isi: sumber } });
cek("sumber TVR", r.status === 200, r.isi);
r = await minta("POST", "/api/tvr/jobs", { json: { url: r.json().url, hook: "VIRAL! ASAP TVR SAYA", sumber: "SUMBER: @uji" } });
cek("kirim job TVR + nomor antrean", r.status === 200 && r.json().antrean?.posisi >= 1, r.isi);
st = await tunggu(async () => (await minta("GET", "/api/tvr/jobs/saya")).json().job);
cek("render TVR selesai", st?.status === "done", JSON.stringify(st));
r = await minta("GET", "/api/tvr/jobs/saya/berkas");
fs.writeFileSync(path.join(TMP, "tvr.mp4"), r.isi);
p = probe(path.join(TMP, "tvr.mp4"));
cek("TVR = sumber 4 dtk + penutup 2 dtk", Math.abs(Number(p.format.duration) - 6) < 0.7, p.format.duration);
cek("edit ulang (hapus hasil)", (await minta("DELETE", "/api/tvr/jobs/saya?hapus_sumber=1")).json().ok === true);

console.log("Auto Outro");
r = await minta("POST", "/api/outro/jobs", { json: { channel: "TV Asap", mode: "dpp", akun: { instagram: "tvasap" } } });
cek("mulai outro", r.status === 200, r.isi);
const oid = r.json().job_id;
st = await tunggu(async () => (await minta("GET", `/api/outro/jobs/${oid}`)).json(), 400);
cek("outro selesai", st?.status === "done", JSON.stringify(st));
r = await minta("GET", `/api/outro/jobs/${oid}/video`);
cek("unduh outro", r.status === 200 && r.isi.length > 5000);

// Bersih-bersih (disk & Redis uji memang sementara, tapi tetap rapi).
await minta("DELETE", `/api/video/jobs/${jid}`);
await minta("DELETE", `/api/video/templates/${tid}`);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(gagalAda ? "\nADA YANG GAGAL" : "\nSEMUA LOLOS");
process.exit(gagalAda ? 1 : 0);
