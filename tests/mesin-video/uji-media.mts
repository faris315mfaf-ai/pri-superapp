// Uji kesetaraan mesin video TS (media/perintah/render/unduh) terhadap mesin
// Python asli. Keluaran acuan ("emas") dibuat oleh
//   tests/mesin-video/emas/perintah/buat_emas.py
// dan render pembanding dijalankan langsung lewat render_py.py.
//
// Jalankan: npx tsx tests/mesin-video/uji-media.mts
// Python pembanding: env PYTHON_AUTOEDIT (bawaan venv uji di godam-autoedit).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const EMAS = path.join(DIR, "emas");
const MEDIA_UJI = path.join(EMAS, "media");
const PALSU = path.join(DIR, "palsu-ytdlp.mjs");
const PYTHON = process.env.PYTHON_AUTOEDIT ?? "C:\\Users\\Admin\\godam-autoedit\\.venv-uji\\Scripts\\python.exe";

// Lingkungan WAJIB disetel sebelum modul mesin diimpor (konfig dibaca saat impor),
// sama dengan yang dipakai buat_emas.py.
const AKAR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "uji-mesin-video-")));
const MEDIA = path.join(AKAR, "media");
fs.mkdirSync(MEDIA, { recursive: true });
process.env.MEDIA_DIR = MEDIA;
process.env.VIDEO_IG_SESSIONID = "sesi-uji";
process.env.VIDEO_UNDUH_PROXY = "http://proxy.uji:8080";
delete process.env.REDIS_URL;

const media = await import("../../src/mesin-video/media");
const perintah = await import("../../src/mesin-video/perintah");
const { render } = await import("../../src/mesin-video/render");
const unduh = await import("../../src/mesin-video/unduh");
const { loadTemplate } = await import("../../src/mesin-video/template");
const { Dibatalkan, GalatVideo } = await import("../../src/mesin-video/jenis");
const jalur = await import("../../src/mesin-video/jalur");

let lulus = 0;
let gagal = 0;
const cek = (nama: string, ok: boolean, info?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", nama);
  } else {
    gagal++;
    console.log("  ✘", nama, info !== undefined ? (typeof info === "string" ? info : JSON.stringify(info)) : "");
  }
};
const bacaJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));

/** JSON kanonik (kunci terurut) untuk membandingkan objek Python vs TS. */
function kanonik(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(kanonik).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${kanonik(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Sama dengan normal() di buat_emas.py. */
function normal(nilai: string): string {
  let t = nilai.split(MEDIA).join("{MEDIA}");
  t = t.replace(/[^\s"']*godam-kuki-[^\\/\s"']+/g, "{KUKI}");
  if (t.includes("{MEDIA}") || t.includes("{KUKI}")) t = t.replace(/\\/g, "/");
  return t;
}

function beda(a: unknown[], b: unknown[]): string {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (kanonik(a[i]) !== kanonik(b[i])) return `#${i}: py=${kanonik(a[i])} ts=${kanonik(b[i])}`;
  }
  return "";
}

if (!fs.existsSync(path.join(EMAS, "angka.json"))) {
  console.error("Berkas emas belum ada. Jalankan dulu buat_emas.py (lihat kepala berkas ini).");
  process.exit(2);
}

// ------------------------------------------------------------------
console.log("\n[A] Format angka setara Python");
for (const a of bacaJson(path.join(EMAS, "angka.json")) as Record<string, string>[]) {
  const x = Number(a.x === "-0.0" ? "-0" : a.x);
  const ts = {
    f3: media.formatF(x, 3),
    f1: media.formatF(x, 1),
    f0: media.formatF(x, 0),
    repr: media.pyFloatRepr(x),
    round: media.teksBulat(media.pyRound(x)),
  };
  const py = { f3: a.f3, f1: a.f1, f0: a.f0, repr: a.repr, round: a.round };
  cek(`angka ${a.x}`, kanonik(ts) === kanonik(py), { py, ts });
}

// ------------------------------------------------------------------
console.log("\n[B] ipaddress.ip_address + is_global");
for (const k of bacaJson(path.join(EMAS, "ip.json")) as { ip: string; sah: boolean; versi?: number; global?: boolean }[]) {
  const ip = unduh.ipDariTeks(k.ip);
  const ts = ip ? { sah: true, versi: ip.versi, global: unduh.isGlobalPy(ip) } : { sah: false };
  const py = k.sah ? { sah: true, versi: k.versi, global: k.global } : { sah: false };
  cek(`ip ${JSON.stringify(k.ip)}`, kanonik(ts) === kanonik(py), { py, ts });
}
// Pengetatan sengaja di atas Python (lihat alamatPublik di unduh.ts).
for (const [teks, publik] of [
  ["224.0.0.1", false], ["ff02::1", false], ["fec0::1", false], ["::7f00:1", false], ["::ffff:224.0.0.1", false],
  ["64:ff9b::a00:1", false], ["64:ff9b::808:808", true], ["8.8.8.8", true], ["2a03:2880:f12f:83:face:b00c:0:25de", true],
  ["100.64.0.1", false], ["::ffff:10.0.0.1", false], ["fd00::1", false],
] as const) {
  cek(`alamatPublik ${teks} = ${publik}`, unduh.alamatPublik(unduh.ipDariTeks(teks)!) === publik);
}

// ------------------------------------------------------------------
console.log("\n[C] periksa_url (DNS ditiru, sama dengan buat_emas.py)");
const emasUrl = bacaJson(path.join(EMAS, "url.json"));
const petaDns = emasUrl.dns as Record<string, string[] | null>;
unduh.pasangPenyelesaiDns(async (inang) => {
  const a = Object.prototype.hasOwnProperty.call(petaDns, inang) ? petaDns[inang] : ["157.240.1.1"];
  if (a === null) throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
  return a;
});
// Satu-satunya beda yang DISENGAJA: multicast dianggap "global" oleh Python.
const SENGAJA_BEDA: Record<string, string> = {
  "https://mc.tiktok.com/x": "Link ini mengarah ke alamat yang tidak diizinkan.",
};
for (const [bagian, daftar] of [["bawaan", undefined], ["semua", ["*"]]] as const) {
  for (const k of emasUrl[bagian] as { url: unknown; ok?: string; error?: string }[]) {
    let ts: { ok?: string; error?: string };
    try {
      ts = { ok: await unduh.periksaUrl(k.url, daftar ?? undefined) };
    } catch (e) {
      ts = { error: e instanceof GalatVideo ? e.message : `BUKAN GalatVideo: ${e}` };
    }
    const harap = Object.prototype.hasOwnProperty.call(SENGAJA_BEDA, String(k.url))
      ? { error: SENGAJA_BEDA[String(k.url)] }
      : { ok: k.ok, error: k.error };
    cek(`[${bagian}] ${JSON.stringify(k.url)}`, kanonik(ts) === kanonik(harap), { py: harap, ts });
  }
}

// ------------------------------------------------------------------
console.log("\n[D] Fungsi kecil (_posisi, _escape_filter, _situs, _pesan_ramah, _klip, probe)");
const emasFungsi = bacaJson(path.join(EMAS, "fungsi.json"));
for (const k of emasFungsi.posisi as { nilai: unknown; hasil?: string; error?: string }[]) {
  let ts: { hasil?: string; error?: string };
  try {
    ts = { hasil: perintah.posisi(k.nilai, "(W-w)/2") };
  } catch (e) {
    ts = { error: (e as Error).message };
  }
  cek(`posisi ${JSON.stringify(k.nilai)}`, kanonik(ts) === kanonik({ hasil: k.hasil, error: k.error }), { py: k, ts });
}
for (const k of emasFungsi.escape) cek(`escape ${k.nilai}`, perintah.escapeFilter(k.nilai) === k.hasil, perintah.escapeFilter(k.nilai));
for (const k of emasFungsi.situs) cek(`situs ${k.url}`, unduh.situs(k.url) === k.hasil, unduh.situs(k.url));
for (const k of emasFungsi.ramah) cek(`ramah ${k.teks}`, unduh.pesanRamah(k.teks) === k.hasil, unduh.pesanRamah(k.teks));
cek("klip", kanonik(perintah.klip("x.mp4", 720, 1280, 30, 3, "introv")) === kanonik(emasFungsi.klip));
for (const k of emasFungsi.probe as { nama: string; hasil?: unknown; alpha?: boolean; error?: string }[]) {
  const berkas = path.join(MEDIA_UJI, k.nama);
  let ts: unknown;
  try {
    ts = { hasil: await media.probe(berkas), alpha: await media.punyaAlpha(berkas) };
  } catch (e) {
    ts = { error: normal((e as Error).message) };
  }
  cek(`probe ${k.nama}`, kanonik(ts) === kanonik({ hasil: k.hasil, alpha: k.alpha, error: k.error }), { py: k, ts });
}

// ------------------------------------------------------------------
console.log("\n[E] _bangun_perintah: argumen ffmpeg identik");
type Kasus = { nama: string; sumber: string; template: Record<string, unknown>; texts?: Record<string, string>; render?: boolean };
const daftarKasus = bacaJson(path.join(EMAS, "perintah", "kasus.json")).kasus as Kasus[];
const folderSumber = path.join(MEDIA, "sumber");
fs.mkdirSync(folderSumber, { recursive: true });
for (const n of ["sumber.mp4", "sumber_bisu.mp4", "sumber_panjang.mp4"]) {
  fs.copyFileSync(path.join(MEDIA_UJI, n), path.join(folderSumber, n));
}
function siapkanTemplate(nama: string, isi: Record<string, unknown>) {
  const folder = jalur.templatePath(nama);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(path.join(folder, "assets"), { recursive: true });
  for (const n of fs.readdirSync(MEDIA_UJI)) fs.copyFileSync(path.join(MEDIA_UJI, n), path.join(folder, "assets", n));
  fs.writeFileSync(path.join(folder, "template.json"), JSON.stringify(isi, null, 2));
  return loadTemplate(nama);
}
for (const k of daftarKasus) {
  const emas = bacaJson(path.join(EMAS, "perintah", `${k.nama}.json`));
  const template = siapkanTemplate(k.nama, k.template);
  const kerja = path.join(MEDIA, "kerja", k.nama);
  fs.rmSync(kerja, { recursive: true, force: true });
  fs.mkdirSync(kerja, { recursive: true });
  const panggilan: unknown[] = [];
  const palsu: typeof import("../../src/mesin-video/teks").gambarTeks = async (teks, isi, lebar, tinggi, tujuan) => {
    panggilan.push({ teks, isi, lebar, tinggi, tujuan: path.basename(tujuan) });
    return tujuan;
  };
  let ts: Record<string, unknown>;
  try {
    const h = await perintah.bangunPerintah(template, path.join(folderSumber, k.sumber), path.join(kerja, "output.mp4"), k.texts ?? {}, kerja, {
      gambarTeks: palsu,
    });
    ts = { args: h.args.map(normal), total: h.total };
  } catch (e) {
    ts = { error: (e as Error).message, jenis: e instanceof GalatVideo ? "VideoError" : (e as Error).name };
  }
  if (emas.error) {
    cek(`${k.nama}: galat sama`, ts.error === emas.error && ts.jenis === emas.jenis, { py: emas.error, ts: ts.error });
  } else {
    const selisih = ts.args ? beda(emas.args, ts.args as unknown[]) : String(ts.error);
    cek(`${k.nama}: ${emas.args.length} argumen identik`, !selisih, selisih);
    cek(`${k.nama}: total ${emas.total}`, ts.total === emas.total, { py: emas.total, ts: ts.total });
  }
  cek(`${k.nama}: ${emas.teks.length} panggilan teks identik`, kanonik(panggilan) === kanonik(emas.teks), beda(emas.teks, panggilan));
}

// ------------------------------------------------------------------
console.log("\n[F] Render sungguhan: TS vs Python (durasi, ukuran, audio, PSNR)");
const adaPython = fs.existsSync(PYTHON);
function psnr(a: string, b: string): number {
  const h = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", a, "-i", b, "-lavfi", "psnr", "-f", "null", "-"], {
    encoding: "utf8",
  });
  const m = /average:(inf|[\d.]+)/.exec(h.stderr);
  return !m ? NaN : m[1] === "inf" ? Infinity : Number(m[1]);
}
function renderPython(nama: string, sumber: string, keluar: string, texts: Record<string, string>) {
  const h = spawnSync(PYTHON, [path.join(DIR, "render_py.py"), nama, sumber, keluar, JSON.stringify(texts)], {
    encoding: "utf8",
    env: { ...process.env, MEDIA_DIR: MEDIA },
  });
  const baris = h.stdout.trim().split(/\r?\n/).pop() ?? "";
  try {
    return JSON.parse(baris) as { ok?: string; error?: string; progress?: number[] };
  } catch {
    return { error: `render_py gagal: ${h.stderr.slice(-400)}` };
  }
}
if (!adaPython) {
  console.log("  (dilewati: Python pembanding tidak ada di", PYTHON, ")");
  gagal++;
} else {
  const kasusRender = daftarKasus.filter((k) => k.render);
  for (const k of kasusRender) {
    const template = loadTemplate(k.nama);
    const sumber = path.join(folderSumber, k.sumber);
    const dirPy = path.join(MEDIA, "render-py", k.nama);
    const dirTs = path.join(MEDIA, "render-ts", k.nama);
    const py = renderPython(k.nama, sumber, dirPy, k.texts ?? {});
    if (!py.ok) {
      cek(`${k.nama}: render Python`, false, py);
      continue;
    }
    const kemajuan: number[] = [];
    const log: string[] = [];
    // PNG teks memakai hasil Python, supaya beda perender teks tidak ikut dinilai.
    const salinTeks: typeof import("../../src/mesin-video/teks").gambarTeks = async (_t, _i, _l, _tg, tujuan) => {
      fs.copyFileSync(path.join(dirPy, path.basename(tujuan)), tujuan);
      return tujuan;
    };
    const keluaran = await render(template, sumber, dirTs, {
      texts: k.texts ?? {},
      log: (p) => log.push(p),
      progress: (p) => {
        kemajuan.push(p);
      },
      gambarTeks: salinTeks,
    });
    const a = await media.probe(py.ok);
    const b = await media.probe(keluaran);
    const nilaiPsnr = psnr(py.ok, keluaran);
    cek(`${k.nama}: durasi ${a.duration} vs ${b.duration}`, Math.abs(a.duration - b.duration) <= 0.1);
    cek(`${k.nama}: ukuran ${a.width}x${a.height} vs ${b.width}x${b.height}`, a.width === b.width && a.height === b.height);
    cek(`${k.nama}: audio ${a.has_audio} vs ${b.has_audio}`, a.has_audio === b.has_audio);
    cek(`${k.nama}: PSNR rata-rata ${nilaiPsnr} dB ≥ 35`, nilaiPsnr >= 35, nilaiPsnr);
    const perintahPy = fs.readFileSync(path.join(dirPy, "ffmpeg-command.txt"), "utf8").split(dirPy).join("{KELUAR}");
    const perintahTs = fs.readFileSync(path.join(dirTs, "ffmpeg-command.txt"), "utf8").split(dirTs).join("{KELUAR}");
    cek(`${k.nama}: ffmpeg-command.txt identik`, perintahPy === perintahTs, { py: perintahPy.slice(0, 200), ts: perintahTs.slice(0, 200) });
    cek(
      `${k.nama}: kemajuan naik, ≤99 lalu 100 (py ${py.progress?.length} kabar, ts ${kemajuan.length})`,
      kemajuan.at(-1) === 100 && kemajuan.slice(0, -1).every((p, i, s) => p <= 99 && (i === 0 || p > s[i - 1])),
      kemajuan,
    );
    cek(`${k.nama}: log "Menyusun video" & "Video jadi"`, /^Menyusun video: kanvas 360x640, perkiraan hasil [\d.]+ detik$/.test(log[0]) && /^Video jadi: [\d.]+ detik, 360x640, [\d.]+ MB$/.test(log[1]), log);
  }

  // Gagal di tengah: overlay yang bukan gambar. Pesannya harus sama.
  const tGagal = siapkanTemplate("render_gagal", {
    name: "Gagal", width: 360, height: 640, fps: 30, overlays: [{ file: "assets/rusak.png" }], texts: [],
  });
  const pyGagal = renderPython("render_gagal", path.join(folderSumber, "sumber.mp4"), path.join(MEDIA, "render-py", "gagal"), {});
  let tsGagal = "";
  try {
    await render(tGagal, path.join(folderSumber, "sumber.mp4"), path.join(MEDIA, "render-ts", "gagal"));
  } catch (e) {
    tsGagal = e instanceof GalatVideo ? e.message : `bukan GalatVideo: ${e}`;
  }
  // Alamat memori di log ffmpeg ("[out#0/mp4 @ 000002cd...]") beda tiap proses.
  const tanpaAlamat = (s = "") => s.replace(/ @ (0x)?[0-9a-fA-F]{6,}\]/g, " @ ADDR]");
  cek(
    "render gagal: pesan sama dengan Python",
    Boolean(pyGagal.error) && tanpaAlamat(tsGagal) === tanpaAlamat(pyGagal.error),
    { py: pyGagal.error, ts: tsGagal },
  );
}

// ------------------------------------------------------------------
console.log("\n[G] Berhenti & batas waktu");
{
  const panjang = path.join(AKAR, "panjang.mp4");
  spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30:duration=40",
    "-f", "lavfi", "-i", "sine=duration=40", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", panjang]);
  const t = siapkanTemplate("berat", { name: "Berat", width: 1080, height: 1920, fps: 30, overlays: [], texts: [] });

  let dibalik = 0;
  const mulai = Date.now();
  let galat: unknown = null;
  try {
    await render(t, panjang, path.join(MEDIA, "render-ts", "batal"), {
      batal: () => {
        if (Date.now() - mulai > 1500) {
          if (!dibalik) dibalik = Date.now();
          return true;
        }
        return false;
      },
    });
  } catch (e) {
    galat = e;
  }
  const jeda = Date.now() - dibalik;
  cek(`batal() → Dibatalkan dalam ${jeda} ms (≤ 2000)`, galat instanceof Dibatalkan && dibalik > 0 && jeda <= 2000, String(galat));
  cek("pesan Dibatalkan", galat instanceof Dibatalkan && (galat as Error).message === "Pembuatan video dihentikan.");

  const mulai2 = Date.now();
  let galat2: unknown = null;
  try {
    await render(t, panjang, path.join(MEDIA, "render-ts", "waktu"), { batasWaktuDetik: 1 });
  } catch (e) {
    galat2 = e;
  }
  const lama2 = Date.now() - mulai2;
  cek(
    `batas waktu → GalatVideo dalam ${lama2} ms`,
    galat2 instanceof GalatVideo && !(galat2 instanceof Dibatalkan) &&
      (galat2 as Error).message === "Render melewati batas waktu 0 menit dan dihentikan." && lama2 < 6000,
    String(galat2),
  );
}

// ------------------------------------------------------------------
console.log("\n[H] yt-dlp palsu: argumen, jeda 429, pesan, log (vs Python)");
{
  const kerja = path.join(AKAR, "palsu");
  fs.mkdirSync(kerja, { recursive: true });
  process.env.PALSU_MEDIA = MEDIA_UJI;
  process.env.PALSU_LOG = path.join(kerja, "log.jsonl");
  process.env.PALSU_STATUS = path.join(kerja, "status");
  process.env.PALSU_SKENARIO = path.join(kerja, "skenario.json");
  unduh.pasangPerintahYtdlp([process.execPath, PALSU]);
  const tidur: number[] = [];
  unduh.pasangTidur(async (d) => {
    tidur.push(d);
  });
  const folderUp = path.join(jalur.uploadsDir(), "abc123");
  fs.mkdirSync(folderUp, { recursive: true });
  fs.copyFileSync(path.join(MEDIA_UJI, "sumber.mp4"), path.join(folderUp, "source.mp4"));

  const kasusY = bacaJson(path.join(EMAS, "ytdlp-kasus.json")).kasus as { nama: string; aksi: string; url: string; respon: unknown[] }[];
  const emasY = bacaJson(path.join(EMAS, "ytdlp.json")) as Record<string, unknown>[];
  for (let i = 0; i < kasusY.length; i++) {
    const k = kasusY[i];
    const py = emasY[i];
    fs.writeFileSync(path.join(kerja, "skenario.json"), JSON.stringify(k.respon));
    fs.writeFileSync(path.join(kerja, "log.jsonl"), "");
    fs.writeFileSync(path.join(kerja, "status"), "0");
    tidur.length = 0;
    const log: string[] = [];
    const ts: Record<string, unknown> = { nama: k.nama };
    try {
      if (k.aksi === "unduh") {
        const berkas = await unduh.downloadSource(k.url, path.join(jalur.jobsDir(), k.nama), (p) => log.push(p));
        ts.berkas = normal(berkas);
        ts.audio = (await media.probe(berkas)).has_audio;
      } else {
        ts.pratinjau = await unduh.previewSource(k.url);
      }
    } catch (e) {
      ts.error = e instanceof GalatVideo ? e.message : `BUKAN GalatVideo: ${(e as Error).stack}`;
    }
    const argv = fs
      .readFileSync(path.join(kerja, "log.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((b) => (JSON.parse(b) as string[]).map(normal));
    ts.argv = argv;
    ts.tidur = [...tidur];
    ts.log = log.map(normal);
    const kunci = ["error", "berkas", "audio", "pratinjau", "argv", "tidur", "log"];
    const salah = kunci.filter((n) => kanonik(ts[n]) !== kanonik(py[n]));
    cek(`${k.nama}: ${py.error ? "galat" : "hasil"} + ${argv.length} panggilan + log identik`, !salah.length,
      salah.map((n) => `${n}: py=${kanonik(py[n])} ts=${kanonik(ts[n])}`).join(" | "));
  }
  unduh.pasangPerintahYtdlp(null);
  unduh.pasangTidur(null);
}

// ------------------------------------------------------------------
console.log("\n[I] Penahan situs lewat Redis (antarmuka ioredis)");
{
  const isi = new Map<string, { nilai: string; habis: number }>();
  const panggilan: string[] = [];
  const palsu = {
    get: async (k: string) => isi.get(k)?.nilai ?? null,
    set: async (k: string, v: string, mode: "EX", detik: number) => {
      panggilan.push(`set ${k} ${v} ${mode} ${detik}`);
      isi.set(k, { nilai: v, habis: Date.now() + detik * 1000 });
      return "OK";
    },
    del: async (k: string) => {
      panggilan.push(`del ${k}`);
      return isi.delete(k) ? 1 : 0;
    },
    ttl: async (k: string) => {
      const e = isi.get(k);
      return e ? Math.ceil((e.habis - Date.now()) / 1000) : -2;
    },
  };
  unduh.pasangRedisBatas(palsu);
  await unduh.tahanSitus("https://www.facebook.com/x");
  cek("tahan → SET videojob:batas:facebook.com 1 EX 180", panggilan[0] === "set videojob:batas:facebook.com 1 EX 180", panggilan);
  cek("sisa_tahanan = TTL Redis", (await unduh.sisaTahanan("https://m.facebook.com/y")) === 180);
  let pesan = "";
  try {
    await unduh.tolakKalauDitahan("https://facebook.com/z");
  } catch (e) {
    pesan = (e as Error).message;
  }
  cek("ditolak saat ditahan", pesan === "facebook.com sedang membatasi permintaan dari server ini (429). Tunggu 181 detik lagi, atau unggah berkas videonya langsung.", pesan);
  cek("Instagram + Session ID tidak ditolak", await unduh.tahanSitus("https://instagram.com/a").then(() => unduh.tolakKalauDitahan("https://instagram.com/a")).then(() => true, () => false));
  await unduh.bebaskanSitus("https://www.facebook.com/x");
  cek("bebas → DEL & TTL -2 → 0", panggilan.includes("del videojob:batas:facebook.com") && (await unduh.sisaTahanan("https://facebook.com")) === 0);
  unduh.pasangRedisBatas({
    ...palsu,
    ttl: async () => {
      throw new Error("redis mati");
    },
    set: async () => {
      throw new Error("redis mati");
    },
  });
  await unduh.tahanSitus("https://www.threads.net/q");
  const sisa = await unduh.sisaTahanan("https://www.threads.net/q");
  cek(`Redis galat → jatuh ke penahan lokal (${sisa.toFixed(2)} dtk)`, sisa > 179 && sisa <= 180);
  unduh.pasangRedisBatas(null);
}

// ------------------------------------------------------------------
console.log("\n[J] Perapian, isi media, penyapu cache");
{
  const besar = path.join(AKAR, "raksasa.mp4");
  spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=2560x1440:rate=10:duration=0.5",
    "-f", "lavfi", "-i", "sine=duration=0.5", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", besar]);
  const ukuran = await media.rapikanVideo(besar);
  const info = await media.probe(besar);
  cek(`rapikanVideo 2560x1440 → ${info.width}x${info.height}`, typeof ukuran === "number" && info.width === 1920 && info.height === 1080 && info.has_audio);
  cek("rapikanVideo: sudah kecil → null", (await media.rapikanVideo(besar)) === null);
  cek("rapikanVideo: bukan video → null", (await media.rapikanVideo(path.join(MEDIA_UJI, "logo.png"))) === null);
  const galatIsi = async (p: string) => {
    try {
      await media.pastikanIsiMedia(p);
      return "ok";
    } catch (e) {
      return `${(e as { status?: number }).status} ${(e as Error).message}`;
    }
  };
  cek("pastikanIsiMedia: png asli", (await galatIsi(path.join(MEDIA_UJI, "logo.png"))) === "ok");
  cek("pastikanIsiMedia: png palsu → 415 gambar", (await galatIsi(path.join(MEDIA_UJI, "rusak.png"))) === "415 Berkas ini bukan gambar yang bisa dibaca.");
  const mp4Palsu = path.join(AKAR, "palsu.mp4");
  fs.writeFileSync(mp4Palsu, "bukan video");
  cek("pastikanIsiMedia: mp4 palsu → 415 video", (await galatIsi(mp4Palsu)) === "415 Berkas ini bukan video yang bisa dibaca.");
  cek("pastikanIsiMedia: audio saja → 415 tanpa gambar", (await galatIsi(path.join(MEDIA_UJI, "audio.m4a"))) === "415 Video ini tidak punya gambar.");
  cek("pastikanIsiMedia: video asli", (await galatIsi(path.join(MEDIA_UJI, "stiker.mp4"))) === "ok");

  const cache = jalur.cacheDir();
  const lama = Date.now() / 1000 - 100_000;
  for (const n of ["basi", "basi.lock"]) {
    fs.mkdirSync(path.join(cache, n), { recursive: true });
    fs.utimesSync(path.join(cache, n), lama, lama);
  }
  fs.writeFileSync(path.join(cache, "berkas-basi"), "x");
  fs.utimesSync(path.join(cache, "berkas-basi"), lama, lama);
  fs.mkdirSync(path.join(cache, "segar"), { recursive: true });
  const sebelum = fs.readdirSync(cache).length;
  const dibuang = unduh.bersihkanCacheUnduhan();
  cek(`bersihkanCacheUnduhan: 3 basi dibuang (${dibuang}), sisanya utuh`, dibuang === 3 && fs.readdirSync(cache).length === sebelum - 3 && fs.existsSync(path.join(cache, "segar")));
  const tersisa = fs.readdirSync(cache).length;
  cek(`bersihkanCacheUnduhan(-1): ${tersisa} sisanya dibuang`, unduh.bersihkanCacheUnduhan(-1) === tersisa && fs.readdirSync(cache).length === 0);
  const up = jalur.uploadsDir();
  fs.mkdirSync(path.join(up, "lama"), { recursive: true });
  fs.utimesSync(path.join(up, "lama"), lama, lama);
  fs.writeFileSync(path.join(up, "berkas-lepas"), "x");
  fs.utimesSync(path.join(up, "berkas-lepas"), lama, lama);
  cek("bersihkanUnggahanLama: hanya folder tua", unduh.bersihkanUnggahanLama(3600) === 1 && !fs.existsSync(path.join(up, "lama")) && fs.existsSync(path.join(up, "berkas-lepas")));
}

console.log(`\n${lulus} lulus, ${gagal} gagal`);
try {
  fs.rmSync(AKAR, { recursive: true, force: true });
} catch {
  // berkas bisa masih terkunci di Windows; folder sementara saja
}
process.exit(gagal ? 1 : 0);
