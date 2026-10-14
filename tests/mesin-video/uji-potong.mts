// Uji "pilih bagian video" + bingkai hitam landscape (14 Okt 2026). Memakai ffmpeg/ffprobe sungguhan.
// Jalankan: npx tsx tests/mesin-video/uji-potong.mts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const AKAR = fs.mkdtempSync(path.join(os.tmpdir(), "uji-potong-"));
process.env.MEDIA_DIR = path.join(AKAR, "media");
fs.mkdirSync(process.env.MEDIA_DIR, { recursive: true });
delete process.env.REDIS_URL;

const { rentangPotong, filterBadan, bangunPerintah, yBingkaiHitam, areaHook } = await import("../../src/mesin-video/perintah");
const { ukuranTampil, probe } = await import("../../src/mesin-video/media");
const { opsiPotongDari } = await import("../../src/mesin-video/server/bantu");
const { GalatVideo } = await import("../../src/mesin-video/jenis");

let lulus = 0;
let gagal = 0;
const cek = (nama: string, ok: boolean, info?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", nama);
  } else {
    gagal++;
    console.log("  ✘", nama, info !== undefined ? JSON.stringify(info) : "");
  }
};
const melempar = (fn: () => unknown, jenis: new (...a: never[]) => Error): boolean => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof jenis;
  }
};
const ffmpeg = (args: string[]) => {
  const h = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  if (h.status !== 0) throw new Error(h.stderr);
};

console.log("\n[A] rentangPotong");
cek("tanpa potong = 0..batas (perilaku lama)", JSON.stringify(rentangPotong(258, 180)) === JSON.stringify({ mulai: 0, durasi: 180 }));
cek("tanpa potong, sumber pendek", JSON.stringify(rentangPotong(40, 180)) === JSON.stringify({ mulai: 0, durasi: 40 }));
cek("potong biasa", JSON.stringify(rentangPotong(258, 180, { mulai: 42, akhir: 117.5 })) === JSON.stringify({ mulai: 42, durasi: 75.5 }));
cek("dipangkas ke batas template", rentangPotong(600, 180, { mulai: 10, akhir: 400 }).durasi === 180);
cek("dipangkas ke sisa sumber", rentangPotong(100, 180, { mulai: 90, akhir: 150 }).durasi === 10);
cek("mulai di luar video ditolak", melempar(() => rentangPotong(100, 180, { mulai: 120, akhir: 130 }), GalatVideo));
cek("rentang terbalik ditolak", melempar(() => rentangPotong(100, 180, { mulai: 50, akhir: 40 }), GalatVideo));
cek("durasi sumber tak diketahui: pakai rentang", rentangPotong(0, 180, { mulai: 5, akhir: 25 }).durasi === 20);

console.log("\n[B] opsiPotongDari (body API)");
cek("kosong = tanpa opsi", JSON.stringify(opsiPotongDari({})) === "{}");
cek("rentang dibulatkan 0,1", JSON.stringify(opsiPotongDari({ mulai: 1.234, akhir: 9.876 }).potong) === JSON.stringify({ mulai: 1.2, akhir: 9.9 }));
cek("bingkai hitam diteruskan", opsiPotongDari({ bingkai: "hitam" }).bingkai === "hitam");
cek("bingkai penuh = bawaan (tidak dikirim)", opsiPotongDari({ bingkai: "penuh" }).bingkai === undefined);
const status400 = (b: Record<string, number>) => {
  try {
    opsiPotongDari(b);
    return false;
  } catch (e) {
    return (e as { status?: number }).status === 400;
  }
};
cek("hanya mulai ditolak 400", status400({ mulai: 3 }));
cek("kurang dari 1 detik ditolak 400", status400({ mulai: 3, akhir: 3.5 }));

console.log("\n[C] filterBadan");
cek("penuh = scale increase + crop (lama)", filterBadan(720, 1280, 30, false) === "[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setsar=1,format=yuv420p[b0]");
cek("hitam = scale decrease + pad tengah", filterBadan(720, 1280, 30, true) === "[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1,format=yuv420p[b0]");

console.log("\n[D] ukuranTampil (rotasi HP)");
const lebar = path.join(AKAR, "lebar.mp4");
const putar = path.join(AKAR, "potret-diputar.mp4");
const potret = path.join(AKAR, "potret.mp4");
ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=12", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", lebar]);
ffmpeg(["-display_rotation", "90", "-i", lebar, "-c", "copy", putar]);
ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", potret]);
const u1 = await ukuranTampil(lebar);
const u2 = await ukuranTampil(putar);
const u3 = await ukuranTampil(potret);
cek("landscape 640x360", u1.width === 640 && u1.height === 360, u1);
cek("disimpan 640x360 + rotasi 90 = tampil 360x640", u2.width === 360 && u2.height === 640, u2);
cek("potret 360x640", u3.width === 360 && u3.height === 640, u3);
cek("berkas rusak = 0x0", JSON.stringify(await ukuranTampil(path.join(AKAR, "tidak-ada.mp4"))) === JSON.stringify({ width: 0, height: 0 }));

console.log("\n[E] bangunPerintah + render nyata");
const template = { id: "uji", name: "uji", owner: "uji", width: 360, height: 640, fps: 30, max_duration: 180, overlays: [], texts: [] };
async function jalankan(sumber: string, opsi: Parameters<typeof bangunPerintah>[5]) {
  const kerja = fs.mkdtempSync(path.join(AKAR, "kerja-"));
  const keluar = path.join(kerja, "output.mp4");
  const { args } = await bangunPerintah(template, sumber, keluar, {}, kerja, opsi);
  const h = spawnSync(args[0], args.slice(1), { encoding: "utf8" });
  if (h.status !== 0) throw new Error(h.stderr.slice(-600));
  return { args, info: await probe(keluar), keluar };
}
const r1 = await jalankan(lebar, { potong: { mulai: 4, akhir: 7.5 }, bingkaiHitam: true });
const fc = r1.args[r1.args.indexOf("-filter_complex") + 1] ?? "";
cek("-ss sebelum -i sumber", r1.args.indexOf("-ss") >= 0 && r1.args.indexOf("-ss") < r1.args.indexOf(lebar) && r1.args[r1.args.indexOf("-ss") + 1] === "4.000", r1.args.slice(0, 8));
cek("filter memakai pad", fc.includes("pad=360:640"), fc.slice(0, 160));
cek("hasil 360x640", r1.info.width === 360 && r1.info.height === 640, r1.info);
cek("durasi hasil ±0,15 dtk dari 3,5", Math.abs(r1.info.duration - 3.5) < 0.15, r1.info.duration);
// Baris paling atas hasil letterbox harus hitam; baris tengah tidak.
const piksel = (y: number) => {
  const h = spawnSync("ffmpeg", ["-v", "error", "-i", r1.keluar, "-frames:v", "1", "-vf", `crop=360:2:0:${y},scale=1:1`, "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  return h.stdout[0] ?? -1;
};
cek("bingkai atas hitam", piksel(4) < 24, piksel(4));
cek("gambar di tengah tidak hitam", piksel(320) > 24, piksel(320));

const r2 = await jalankan(putar, { bingkaiHitam: true });
const fc2 = r2.args[r2.args.indexOf("-filter_complex") + 1] ?? "";
cek("rekaman potret berotasi TIDAK diberi bingkai", fc2.includes("crop=360:640") && !fc2.includes("pad="), fc2.slice(0, 160));
cek("tanpa potong: tanpa -ss", !r2.args.includes("-ss"));

const r3 = await jalankan(lebar, {});
const fc3 = r3.args[r3.args.indexOf("-filter_complex") + 1] ?? "";
cek("tanpa opsi: crop seperti dulu", fc3.includes("crop=360:640") && !fc3.includes("pad="));

console.log("\n[F] Video menjauhi kotak hook (hook & bingkai di area hitam)");
type T = Parameters<typeof yBingkaiHitam>[0];
const tvr = { width: 720, height: 1280, text_box: { x: 42, y: 698, w: 636, h: 208 }, texts: [{ name: "hook", y: 783, size: 38, max_lines: 4, line_height: 1.15 }] } as unknown as T;
cek("area hook dari text_box", JSON.stringify(areaHook(tvr)) === JSON.stringify({ atas: 698, bawah: 906 }));
cek("16:9 di kanvas TVR: video y=229 (bawahnya 634 < 698)", yBingkaiHitam(tvr, 720, 1280, 1920, 1080) === 229, yBingkaiHitam(tvr, 720, 1280, 1920, 1080));
cek("1:1: dijepit ke atas kanvas (y=0)", yBingkaiHitam(tvr, 720, 1280, 1080, 1080) === 0);
const hookAtas = { texts: [{ name: "hook", y: 120, size: 40, max_lines: 3, line_height: 1.2 }] } as unknown as T;
cek("hook di atas: video di bawahnya, tidak melewati tengah", yBingkaiHitam(hookAtas, 720, 1280, 1920, 1080) === 438, yBingkaiHitam(hookAtas, 720, 1280, 1920, 1080));
const hookAtasTinggi = { text_box: { x: 0, y: 300, w: 700, h: 300 } } as unknown as T;
cek("hook atas yang panjang: video tepat di bawahnya", yBingkaiHitam(hookAtasTinggi, 720, 1280, 1920, 1080) === 664);
cek("tanpa hook: tengah", yBingkaiHitam({} as T, 720, 1280, 1920, 1080) === 438);
cek("filter pad memakai y dijepit", filterBadan(720, 1280, 30, true, 229).includes("pad=720:1280:(ow-iw)/2:min(229\\,oh-ih):color=black"));

const tTvr = { id: "uji-tvr", name: "uji", owner: "uji", width: 360, height: 640, fps: 30, max_duration: 180, overlays: [], texts: [], text_box: { x: 21, y: 349, w: 318, h: 104 } };
const kerja4 = fs.mkdtempSync(path.join(AKAR, "kerja-"));
const keluar4 = path.join(kerja4, "output.mp4");
const { args: a4 } = await bangunPerintah(tTvr, lebar, keluar4, {}, kerja4, { bingkaiHitam: true });
const h4 = spawnSync(a4[0], a4.slice(1), { encoding: "utf8" });
cek("render dengan posisi geser sukses", h4.status === 0, h4.stderr?.slice(-300));
const piksel4 = (y: number) => {
  const h = spawnSync("ffmpeg", ["-v", "error", "-i", keluar4, "-frames:v", "1", "-vf", `crop=360:2:0:${y},scale=1:1`, "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  return h.stdout[0] ?? -1;
};
// 360x640: video 360x203 di y = 349 - 32 - 203 = 114 -> gambar 114..317, kotak hook 349.. hitam.
cek("gambar di y=200", piksel4(200) > 24, piksel4(200));
cek("area kotak hook (y=360) hitam", piksel4(360) < 24, piksel4(360));
cek("atas (y=60) hitam", piksel4(60) < 24, piksel4(60));

fs.rmSync(AKAR, { recursive: true, force: true });
console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
