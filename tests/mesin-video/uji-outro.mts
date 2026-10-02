// Uji port Auto Outro (src/mesin-video/outro) terhadap outro.py.
// Jalankan: npx tsx tests/mesin-video/uji-outro.mts   (keluar != 0 bila gagal)
//
// Emas dibuat dari Python (numpy + Pillow 12) oleh skrip di emas/outro/:
//   buat-emas-primitif.py -> primitif.json (resize/blur/rotate/ImageDraw ... md5)
//   buat-emas-outro.py    -> outro.json + bingkai/*.png (gaya, frame, probe, indeks)
// Opsional: OUTRO_PYTHON=<python dengan numpy+Pillow> menambah uji silang
// (outro.py membaca indeks.json yang ditulis versi TS).
//
// Yang diuji:
//  1. primitif Pillow identik bit-per-bit (303 kasus);
//  2. pilih_gaya(seed) identik untuk semua nilai (MT19937 + choice/uniform);
//  3. frame: frame 0 identik, SEMUA frame tanpa glyph teks identik, frame
//     lengkap PSNR >= 30 dB terhadap gambar kecil Python (selisih tersisa =
//     rasterisasi glyph FreeType berhinting vs Skia);
//  4. jalur job penuh dengan ffmpeg: durasi +-0,05 dtk, ukuran, ada audio;
//  5. indeks.json pulang-pergi format Python, sapuan umur, batal, antrean,
//     penjaga ruang disk, dan kontrak API (status HTTP + pesan).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ujiPrimitif } from "./outro-primitif.mts";

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const EMAS = path.join(DI_SINI, "emas", "outro");
const emas = JSON.parse(fs.readFileSync(path.join(EMAS, "outro.json"), "utf8"));

// Semua modul outro membaca env saat dimuat: atur dulu, impor belakangan.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "uji-outro-"));
// Anak proses membawa MEDIA_DIR sendiri; selain itu SELALU folder sementara
// (jangan pernah menulis ke MEDIA_DIR sungguhan milik pengguna).
if (process.env.UJI_OUTRO_ANAK !== "ruang") process.env.MEDIA_DIR = path.join(TMP, "media");
process.env.OUTRO_VIDEO_W = String(emas.w);
process.env.OUTRO_VIDEO_H = String(emas.h);

const outro = await import("../../src/mesin-video/outro/index");
const pekerjaan = await import("../../src/mesin-video/outro/pekerjaan");
const render = await import("../../src/mesin-video/outro/render");
const huruf = await import("../../src/mesin-video/outro/huruf");
const { keRgb } = await import("../../src/mesin-video/outro/gambar");
const { pilihGaya, ringkasGaya } = await import("../../src/mesin-video/outro/gaya");

// ------------------------------------------------------------------
//  Anak proses: penjaga ruang disk (OUTRO_RUANG_MIN_MB dibaca saat impor)
// ------------------------------------------------------------------
if (process.env.UJI_OUTRO_ANAK === "ruang") {
  const id = outro.mulaiJob("Aceh Barat", {}, 1, "dpp");
  await outro.tungguJob(id);
  console.log(JSON.stringify(outro.statusOutro(id)));
  process.exit(0);
}

let lulus = 0;
let gagal = 0;
function cek(nama: string, ok: boolean, info?: unknown): void {
  if (ok) {
    lulus++;
    console.log("  ✔", nama);
  } else {
    gagal++;
    console.log("  ✘", nama, info !== undefined ? JSON.stringify(info).slice(0, 600) : "");
  }
}
const bagian = (judul: string) => console.log(`\n== ${judul}`);

async function harapGalat(fn: () => unknown, status: number, detail?: (d: unknown) => boolean): Promise<[boolean, unknown]> {
  try {
    await fn();
    return [false, "tidak melempar"];
  } catch (e) {
    const g = e as { status?: number; detail?: unknown };
    const ok = g.status === status && (!detail || detail(g.detail));
    return [ok, { status: g.status, detail: g.detail }];
  }
}

function psnr(a: Uint8Array, b: Uint8Array): number {
  let se = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    se += d * d;
  }
  return se === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10(65025 / (se / a.length));
}

/** Sama dengan kecil() di buat-emas-outro.py: rata-rata 4x4, floor((jumlah+8)/16). */
function kecil(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const kw = Math.floor(w / 4);
  const kh = Math.floor(h / 4);
  const out = new Uint8Array(kw * kh * 3);
  for (let y = 0; y < kh; y++) {
    for (let x = 0; x < kw; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) s += rgb[((y * 4 + yy) * w + x * 4 + xx) * 3 + c];
        out[(y * kw + x) * 3 + c] = Math.floor((s + 8) / 16);
      }
    }
  }
  return out;
}

const md5 = async (buf: Uint8Array) => (await import("node:crypto")).createHash("md5").update(buf).digest("hex");

function ffprobe(berkas: string): { durasi: number; w: number; h: number; audio: boolean } {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", berkas], { encoding: "utf8" });
  const data = JSON.parse(r.stdout);
  const video = data.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  return { durasi: Number(data.format.duration), w: video.width, h: video.height, audio: data.streams.some((s: { codec_type: string }) => s.codec_type === "audio") };
}

const tunggu = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

try {
  // ------------------------------------------------------------------
  bagian("1. Primitif Pillow (resize, blur, rotate, alpha_composite, ImageDraw)");
  const prim = ujiPrimitif();
  cek(`${prim.total - prim.gagal.length}/${prim.total} kasus identik bit-per-bit`, prim.gagal.length === 0, prim.gagal.slice(0, 5));

  // ------------------------------------------------------------------
  bagian("2. pilih_gaya(seed) — PRNG MT19937 Python");
  for (const k of emas.kasus.filter((k: { mode: string }) => k.mode === "biasa")) {
    const g = pilihGaya(k.seed) as unknown as Record<string, unknown>;
    const beda = Object.keys(k.gaya).filter((kunci) => JSON.stringify(k.gaya[kunci]) !== JSON.stringify(g[kunci]));
    cek(`seed ${k.seed}: ${Object.keys(k.gaya).length} nilai gaya identik`, beda.length === 0, beda);
    cek(`seed ${k.seed}: ringkas_gaya sama`, ringkasGaya(pilihGaya(k.seed)) === k.ringkas && k.gaya_job === k.ringkas);
  }

  // ------------------------------------------------------------------
  bagian("3. Frame (emas Python, mencegat pipa ffmpeg)");
  huruf.aturKerning(Boolean(emas.raqm));
  for (const k of emas.kasus) {
    const job = { channel: k.channel, akun: k.akun, seed: k.seed, mode: k.mode };
    for (const tanpaGlyph of [true, false]) {
      huruf.aturTanpaGlyph(tanpaGlyph);
      const s = k.mode === "dpp" ? await render.siapkanDpp(job) : await render.siapkanBiasa(job, pilihGaya(k.seed));
      for (const f of k.frame) {
        const fr = s.frameKe(f.n);
        const rgb = keRgb(fr);
        const h = await md5(rgb);
        if (tanpaGlyph) {
          cek(`${k.nama} frame ${f.n} tanpa glyph identik`, h === f.md5_tanpa_glyph);
        } else if (f.n === 0) {
          cek(`${k.nama} frame 0 identik`, h === f.md5);
        } else if (f.kecil) {
          const { data } = await sharp(path.join(EMAS, "bingkai", f.kecil)).raw().toBuffer({ resolveWithObject: true });
          const p = psnr(kecil(rgb, fr.w, fr.h), new Uint8Array(data));
          cek(`${k.nama} frame ${f.n} PSNR ${p.toFixed(2)} dB >= 30 (1/4 resolusi)`, p >= 30, p);
        }
      }
    }
  }
  huruf.aturTanpaGlyph(false);
  huruf.aturKerning(true);

  // ------------------------------------------------------------------
  bagian("4. Kontrak API (validasi, 400/404/409/422)");
  {
    let r = await harapGalat(() => outro.buatOutro({}), 422, (d) => JSON.stringify(d).includes('"channel"'));
    cek("body tanpa channel -> 422", r[0], r[1]);
    r = await harapGalat(() => outro.buatOutro({ channel: "   " }), 400, (d) => d === "Nama channel wajib diisi.");
    cek("channel hanya spasi -> 400 'Nama channel wajib diisi.'", r[0], r[1]);
    r = await harapGalat(() => outro.buatOutro({ channel: "x".repeat(81) }), 422);
    cek("channel 81 karakter -> 422", r[0], r[1]);
    r = await harapGalat(() => outro.buatOutro({ channel: "A", seed: -1 }), 422);
    cek("seed < 0 -> 422", r[0], r[1]);
    r = await harapGalat(() => outro.buatOutro({ channel: "A", seed: 2 ** 31 }), 422);
    cek("seed > 2^31-1 -> 422", r[0], r[1]);
    r = await harapGalat(() => outro.buatOutro({ channel: "A", mode: "lain" }), 422);
    cek("mode tak dikenal -> 422", r[0], r[1]);
    r = await harapGalat(() => outro.buatOutro({ channel: "A", akun: { instagram: 5 } }), 422);
    cek("akun bukan teks -> 422", r[0], r[1]);
    r = await harapGalat(() => outro.daftarOutro(0), 422);
    cek("batas 0 -> 422", r[0], r[1]);
    r = await harapGalat(() => outro.daftarOutro(201), 422);
    cek("batas 201 -> 422", r[0], r[1]);
    r = await harapGalat(() => outro.statusOutro("tidakada"), 404, (d) => d === "Pekerjaan tidak ditemukan.");
    cek("status job tak ada -> 404", r[0], r[1]);
    r = await harapGalat(() => outro.hentikanOutro("tidakada"), 409, (d) => d === "Pekerjaan sudah selesai atau tidak ada.");
    cek("stop job tak ada -> 409", r[0], r[1]);
    r = await harapGalat(() => outro.videoOutro("tidakada"), 404, (d) => d === "Videonya belum ada.");
    cek("video job tak ada -> 404 'Videonya belum ada.'", r[0], r[1]);
    cek("nama unduhan ASCII", outro.namaBerkasUnduhan("Bandâ Aceh!") === "outro-Band-Aceh.mp4" && outro.namaBerkasUnduhan("Aceh Barat") === "outro-Aceh-Barat.mp4", [outro.namaBerkasUnduhan("Bandâ Aceh!")]);
    let gal: unknown = null;
    try {
      // "dpp " dirapikan menjadi "dpp" (sah) — job-nya langsung dihentikan.
      const sah = outro.mulaiJob("A", {}, 1, "dpp ");
      outro.hentikanOutro(sah);
      await outro.tungguJob(sah);
      cek("mode dirapikan (strip+lower)", outro.statusOutro(sah).mode === "dpp");
      outro.mulaiJob("A", {}, 1, "xx");
    } catch (e) {
      gal = e;
    }
    cek("mode 'xx' -> OutroError \"Mode 'xx' tidak dikenal.\"", gal instanceof outro.OutroError && (gal as Error).message === "Mode 'xx' tidak dikenal.");
  }

  // ------------------------------------------------------------------
  bagian("5. Jalur job penuh (render + ffmpeg + audio)");
  const pekerjaanUji: { id: string; k: (typeof emas.kasus)[number] }[] = [];
  for (const nama of ["biasa-1-aceh", "dpp-1-kabupaten"]) {
    const k = emas.kasus.find((x: { nama: string }) => x.nama === nama);
    const hasil = outro.buatOutro({ channel: k.channel, akun: k.akun, seed: k.seed, mode: k.mode });
    cek(`${nama}: respons buat {job_id,status,mode,seed,gaya}`, hasil.status === "queued" && hasil.mode === k.mode && hasil.seed === k.seed && hasil.gaya === k.gaya_job, hasil);
    pekerjaanUji.push({ id: hasil.job_id, k });
  }
  // Antrean: tidak pernah lebih dari satu yang "running".
  let palingBanyakJalan = 0;
  const pantau = setInterval(() => {
    const jalan = outro.daftarOutro(200).jobs.filter((j) => j.status === "running").length;
    palingBanyakJalan = Math.max(palingBanyakJalan, jalan);
  }, 20);
  for (const { id } of pekerjaanUji) await outro.tungguJob(id);
  clearInterval(pantau);
  cek("antrean: maksimal 1 render berjalan bersamaan", palingBanyakJalan <= 1, palingBanyakJalan);
  for (const { id, k } of pekerjaanUji) {
    const st = outro.statusOutro(id);
    cek(`${k.nama}: status done, progress 100, punya_video`, st.status === "done" && st.progress === 100 && st.punya_video === true && st.langkah === "selesai", st);
    const logs = st.logs as string[];
    cek(
      `${k.nama}: log berbahasa Indonesia sesuai urutan Python`,
      logs[0] === "Pekerjaan masuk antrean." &&
        logs[1] === `Merender outro (${k.gaya_job}) ...` &&
        logs.includes("Merender outro ... 0%") &&
        logs.includes("Merender outro ... 100%") &&
        logs.includes("Menempel audio ...") &&
        /^Video outro siap \(\d+\.\d MB\)\.$/.test(String(st.message)),
      logs,
    );
    const v = outro.videoOutro(id);
    const p = ffprobe(v.jalur);
    cek(
      `${k.nama}: durasi ${p.durasi.toFixed(3)} vs Python ${k.probe.durasi.toFixed(3)} (±0,05), ${p.w}x${p.h}, audio ${p.audio}`,
      Math.abs(p.durasi - k.probe.durasi) <= 0.05 && p.w === k.probe.w && p.h === k.probe.h && p.audio === k.probe.audio,
      { ts: p, py: k.probe },
    );
    cek(`${k.nama}: video tanpa audio mentah sudah dibuang`, !fs.existsSync(path.join(path.dirname(v.jalur), "video-tanpa-audio.mp4")));
    cek(`${k.nama}: nama unduhan`, v.namaBerkas === outro.namaBerkasUnduhan(k.channel) && v.mediaType === "video/mp4");
  }
  {
    const r = await harapGalat(() => outro.hentikanOutro(pekerjaanUji[0].id), 409);
    cek("stop job yang sudah selesai -> 409", r[0], r[1]);
  }

  // ------------------------------------------------------------------
  bagian("6. Batal (sebelum mulai & di tengah render)");
  {
    const a = outro.mulaiJob("TV Rakyat", { instagram: "@a" }, 4, "biasa");
    const b = outro.mulaiJob("TV Rakyat", { instagram: "@b" }, 4, "biasa");
    cek("job antre: status queued, 'Menunggu giliran.'", outro.statusOutro(b).status === "queued" && outro.statusOutro(b).message === "Menunggu giliran.");
    outro.hentikanOutro(b);
    cek("permintaan stop tercatat", (outro.statusOutro(b).logs as string[]).includes("Diminta berhenti; menunggu langkah yang sedang berjalan selesai."));
    // a: tunggu sampai benar-benar merender, lalu hentikan.
    for (let i = 0; i < 400; i++) {
      const st = outro.statusOutro(a);
      if (st.status === "running" && Number(st.progress) > 10) break;
      await tunggu(25);
    }
    outro.hentikanOutro(a);
    await outro.tungguJob(a);
    await outro.tungguJob(b);
    const sa = outro.statusOutro(a);
    const sb = outro.statusOutro(b);
    cek("di tengah render -> dibatalkan 'Render dihentikan.'", sa.status === "dibatalkan" && sa.langkah === "berhenti" && sa.message === "Render dihentikan.", sa);
    cek("sebelum mulai -> dibatalkan 'Dihentikan sebelum mulai.'", sb.status === "dibatalkan" && sb.message === "Dihentikan sebelum mulai.", sb);
    cek("job batal tidak punya video", !sa.punya_video && !sb.punya_video);
  }

  // ------------------------------------------------------------------
  bagian("7. indeks.json pulang-pergi dengan format Python");
  const akar = pekerjaan.folderOutro();
  const berkasIndeks = path.join(akar, "indeks.json");
  fs.copyFileSync(berkasIndeks, path.join(TMP, "indeks-ts.json"));
  {
    const mentah = fs.readFileSync(berkasIndeks, "utf8");
    const daftar = JSON.parse(mentah);
    cek("TS menulis indeks: hanya job done, terbaru dulu", Array.isArray(daftar) && daftar.length === 2 && daftar.every((j: { status: string }) => j.status === "done") && daftar[0].created >= daftar[1].created);
    cek("pemisah json.dumps Python (', ' dan ': ')", mentah.startsWith('[{"job_id": "') && !mentah.includes('","'));
    const kunciPy = Object.keys(emas.indeks[0]).sort().join(",");
    cek("kunci entri sama dengan indeks Python", daftar.every((j: object) => Object.keys(j).sort().join(",") === kunciPy), { ts: Object.keys(daftar[0]).sort(), py: kunciPy });
    cek("log di indeks dipotong 20 terakhir", daftar.every((j: { logs: string[] }) => j.logs.length <= 20));
    cek("berkas sementara .json.baru tidak tertinggal", !fs.existsSync(`${berkasIndeks}.baru`) && !fs.existsSync(path.join(akar, "indeks.json.baru")));
  }
  const python = process.env.OUTRO_PYTHON;
  if (python) {
    const mediaSilang = path.join(TMP, "media-silang");
    fs.mkdirSync(path.join(mediaSilang, "outro"), { recursive: true });
    const isiTs = JSON.parse(fs.readFileSync(path.join(TMP, "indeks-ts.json"), "utf8"));
    fs.copyFileSync(path.join(TMP, "indeks-ts.json"), path.join(mediaSilang, "outro", "indeks.json"));
    const r = spawnSync(
      python,
      ["-c", "import sys, json, outro; print(json.dumps([[j['job_id'], j['status'], j['seed'], bool(outro.ambil_video(j['job_id']))] for j in outro.daftar_job(50)]))"],
      { env: { ...process.env, MEDIA_DIR: mediaSilang, PYTHONPATH: path.resolve(DI_SINI, "..", "..", "autoedit") }, encoding: "utf8" },
    );
    let hasil: [string, string, number, boolean][] = [];
    try {
      hasil = JSON.parse(r.stdout.trim().split("\n").pop() ?? "[]");
    } catch {
      /* dicek di bawah */
    }
    cek(
      "outro.py memuat semua entri TS (id, status, seed, video ada)",
      hasil.length === isiTs.length && isiTs.every((j: { job_id: string; seed: number }) => hasil.some((h) => h[0] === j.job_id && h[1] === "done" && h[2] === j.seed && h[3])),
      { hasil, stderr: r.stderr?.slice(-400) },
    );
  } else {
    console.log("  (uji silang Python dilewati: set OUTRO_PYTHON untuk menjalankannya)");
  }
  // Indeks tulisan Python dibaca TS (jalur <MEDIA> dipetakan ke folder uji).
  const mediaPy = path.join(TMP, "media-python");
  // Jalur di emas memakai pemisah mesin pembuatnya (Windows "\\" atau "/");
  // dipetakan ulang ke folder uji dengan pemisah mesin ini.
  // Di teks JSON mentah, "\" Windows tertulis sebagai dua karakter "\\".
  const mentahPy = String(emas.indeks_mentah).replace(/<MEDIA>((?:(?:\\\\|\/)[^"\\/]+)+)/g, (_m: string, sisa: string) =>
    JSON.stringify(path.join(mediaPy, ...sisa.split(/\\\\|\//).filter(Boolean))).slice(1, -1),
  );
  const daftarPy = JSON.parse(mentahPy) as { job_id: string; video: string; channel: string }[];
  for (const j of daftarPy) {
    fs.mkdirSync(path.dirname(j.video), { recursive: true });
    fs.writeFileSync(j.video, "video");
  }
  fs.writeFileSync(berkasIndeks, mentahPy, "utf8");
  pekerjaan.aturUlangUntukUji();
  {
    const semua = outro.daftarOutro(200).jobs;
    cek(`TS membaca ${daftarPy.length} entri indeks Python`, daftarPy.every((j) => semua.some((s) => s.job_id === j.job_id && s.status === "done")), semua.length);
    const contoh = daftarPy[0];
    const st = outro.statusOutro(contoh.job_id);
    cek("status job dari indeks Python lengkap", st.punya_video === true && st.channel === contoh.channel && Array.isArray(st.logs));
    cek("video job dari indeks Python dapat diambil", outro.videoOutro(contoh.job_id).jalur === contoh.video);
  }

  // ------------------------------------------------------------------
  bagian("8. Sapuan umur (bersihkan_lama)");
  {
    const lama = daftarPy[0];
    const folderLama = path.dirname(lama.video);
    // Folder outro Python ada di media-python; pindahkan satu ke akar outro TS lalu tuakan.
    const tujuan = path.join(akar, path.basename(folderLama));
    fs.cpSync(folderLama, tujuan, { recursive: true });
    const isi = JSON.parse(fs.readFileSync(berkasIndeks, "utf8"));
    for (const j of isi) if (j.job_id === lama.job_id) j.video = path.join(tujuan, path.basename(lama.video));
    fs.writeFileSync(berkasIndeks, JSON.stringify(isi));
    pekerjaan.aturUlangUntukUji();
    const segar = path.join(akar, "folder-segar");
    fs.mkdirSync(segar, { recursive: true });
    const duaHari = Date.now() / 1000 - 48 * 3600;
    fs.utimesSync(tujuan, duaHari, duaHari);
    const dibuang = outro.bersihkanLama(24);
    cek("folder > 24 jam dibuang, yang segar tetap", dibuang === 1 && !fs.existsSync(tujuan) && fs.existsSync(segar), dibuang);
    cek("entri yang videonya terbuang dilupakan", !outro.daftarOutro(200).jobs.some((j) => j.job_id === lama.job_id));
    const indeksBaru = JSON.parse(fs.readFileSync(berkasIndeks, "utf8"));
    cek("indeks ditulis ulang tanpa entri itu", !indeksBaru.some((j: { job_id: string }) => j.job_id === lama.job_id));
    cek("bersihkan_lama(0) membuang semua folder (indeks.json tetap)", outro.bersihkanLama(0) >= 1 && fs.existsSync(berkasIndeks));
  }

  // ------------------------------------------------------------------
  bagian("9. Seed acak dari job_id & gaya DPP");
  {
    const id = outro.mulaiJob("Aceh", {}, null, "dpp");
    const st = outro.statusOutro(id);
    cek("seed kosong = int(job_id, 16) % 2^31", st.seed === Number.parseInt(id, 16) % 2 ** 31, { id, seed: st.seed });
    cek("gaya DPP = 'DPP - meniru outro TV Rakyat'", st.gaya === "DPP - meniru outro TV Rakyat");
    outro.hentikanOutro(id);
    await outro.tungguJob(id);
  }

  // ------------------------------------------------------------------
  bagian("10. Penjaga ruang disk (OUTRO_RUANG_MIN_MB)");
  {
    const anak = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url)], {
      env: { ...process.env, UJI_OUTRO_ANAK: "ruang", OUTRO_RUANG_MIN_MB: "1e15", MEDIA_DIR: path.join(TMP, "media-ruang") },
      encoding: "utf8",
      timeout: 120000,
    });
    let st: Record<string, unknown> = {};
    try {
      st = JSON.parse(anak.stdout.trim().split("\n").filter((b) => b.startsWith("{")).pop() ?? "{}");
    } catch {
      st = { stdout: anak.stdout, stderr: anak.stderr };
    }
    cek(
      "disk penuh -> error 'Penyimpanan server penuh (sisa N MB). ...'",
      st.status === "error" && /^Gagal: Penyimpanan server penuh \(sisa \d+ MB\)\. Hapus beberapa hasil lama dulu, lalu coba lagi\.$/.test(String(st.message)),
      st,
    );
  }

  // ------------------------------------------------------------------
} catch (e) {
  gagal++;
  console.log("  ✘ galat tak terduga:", e instanceof Error ? e.stack : e);
} finally {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* berkas mungkin masih dipegang ffmpeg di Windows */
  }
}

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
