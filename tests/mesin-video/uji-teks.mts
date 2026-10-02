// Uji paritas perender teks, komposit, deteksi kotak teks, dan
// _rapikan_gambar versi TypeScript terhadap data emas dari Python produksi
// (Pillow 12.3 + libraqm; dibuat oleh emas/teks/buat_emas.py di container).
//
//   npx tsx tests/mesin-video/uji-teks.mts
//
// Keluar dengan kode bukan-nol bila ada kasus yang gagal.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.resolve(DI_SINI, "..", "..");
const EMAS = path.join(DI_SINI, "emas", "teks");

// Konfigurasi dibaca saat modul dimuat — set environment SEBELUM impor.
const MEDIA = fs.mkdtempSync(path.join(os.tmpdir(), "uji-teks-"));
fs.cpSync(path.join(EMAS, "templates"), path.join(MEDIA, "templates"), { recursive: true });
process.env.MEDIA_DIR = MEDIA;
process.env.AUTOEDIT_ASET_DIR = path.join(AKAR, "autoedit", "assets");
delete process.env.VIDEO_FONT;
delete process.env.VIDEO_MAX_IMAGE_SIDE;

const teks = await import("../../src/mesin-video/teks");
const gambar = await import("../../src/mesin-video/gambar");
const komposit = await import("../../src/mesin-video/komposit");
const deteksi = await import("../../src/mesin-video/deteksi");
const template = await import("../../src/mesin-video/template");

type Rekam = { op: string; xy: number[]; teks?: string; ukuran?: number; fill?: number[] | null; stroke?: number; stroke_fill?: number[] | null };
type Kasus = { id: string; teks: Record<string, unknown>; isi: string; lebar: number; tinggi: number; png: boolean; rekam: Rekam[]; log: string[]; kotak_tinta?: number[] };
const emas = JSON.parse(fs.readFileSync(path.join(EMAS, "emas.json"), "utf8"));

let gagal = 0;
let lulus = 0;
function hasil(nama: string, ok: boolean, rinci = ""): void {
  if (ok) lulus++;
  else gagal++;
  console.log(`${ok ? "LULUS" : "GAGAL"}  ${nama}${rinci ? `  — ${rinci}` : ""}`);
}
const sama = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Persentase piksel yang keempat kanalnya berselisih <= toleransi. */
function bandingPiksel(a: { width: number; height: number; data: Uint8Array }, b: { width: number; height: number; data: Uint8Array }, tol: number) {
  if (a.width !== b.width || a.height !== b.height) return { semua: 0, tinta: 0, nTinta: 0, maks: 255, identik: 0 };
  let cocok = 0;
  let identik = 0;
  let tinta = 0;
  let cocokTinta = 0;
  let maks = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n * 4; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a.data[i + c] - b.data[i + c]));
    maks = Math.max(maks, d);
    if (d <= tol) cocok++;
    if (d === 0) identik++;
    if (a.data[i + 3] || b.data[i + 3]) {
      tinta++;
      if (d <= tol) cocokTinta++;
    }
  }
  return { semua: (100 * cocok) / n, tinta: tinta ? (100 * cocokTinta) / tinta : 100, nTinta: tinta, maks, identik: (100 * identik) / n };
}
const persen = (v: number) => `${v.toFixed(3)}%`;

// Tangkap console.warn supaya pesan log Python ikut dibandingkan.
const tangkapan: string[] = [];
const warnAsli = console.warn;
console.warn = (...a: unknown[]) => {
  tangkapan.push(a.map(String).join(" "));
};

// ------------------------------------------------------------------
console.log(`Emas: Pillow ${emas.lingkungan.pillow}, raqm ${emas.lingkungan.raqm}, FreeType ${emas.lingkungan.freetype}`);
console.log("\n== Metrik font ==");
{
  const m = emas.metrik;
  let salahAsc = 0;
  for (const s of Object.keys(m.asc)) if (teks.ukurTeks("A", Number(s)).asc !== m.asc[s]) salahAsc++;
  hasil(`ascender ukuran 6..200 (${Object.keys(m.asc).length})`, salahAsc === 0, `${salahAsc} salah`);
  let salah = 0;
  let n = 0;
  for (const s of Object.keys(m.lebar)) {
    m.huruf.forEach((h: string, i: number) => {
      n++;
      if (Math.round(teks.ukurTeks(h, Number(s)).panjang * 64) !== m.lebar[s][i]) salah++;
    });
  }
  hasil(`advance 26.6 per karakter (${n})`, salah === 0, `${salah} salah`);

  // Kotak tinta autohint (informasi + pagar longgar): ukuran 10..120.
  let persis = 0;
  let satu = 0;
  let total = 0;
  let persisRealistis = 0;
  let totalRealistis = 0;
  let selisihMaks = 0;
  for (const s of Object.keys(m.kotak_badge)) {
    m.kata_badge.forEach((w: string, i: number) => {
      const k = teks.ukurTeks(w, Number(s)).kotak;
      const e = m.kotak_badge[s][i];
      const d = Math.max(...k.map((v: number, j: number) => Math.abs(v - e[j])));
      selisihMaks = Math.max(selisihMaks, d);
      total++;
      if (d === 0) persis++;
      if (d <= 1) satu++;
      if (Number(s) <= 74) {
        totalRealistis++;
        if (d === 0) persisRealistis++;
      }
    });
  }
  hasil(
    `textbbox kata badge ukuran 10..120 (${total})`,
    satu === total,
    `persis ${persis}/${total} (${persen((100 * persis) / total)}), ±1 ${satu}/${total}, ukuran<=74 persis ${persisRealistis}/${totalRealistis}, selisih maks ${selisihMaks}`,
  );
}

// ------------------------------------------------------------------
const kasus: Kasus[] = emas.kasus;
console.log("\n== Tata letak berita ==");
let selisihXMaks = 0;
for (const k of kasus.filter((c) => c.teks.style === "berita")) {
  tangkapan.length = 0;
  const tata = teks.tataLetakBerita(k.teks, k.isi, k.lebar, k.tinggi);
  const harap = k.rekam.filter((r) => r.op === "text");
  const salah: string[] = [];
  const dapat = tata?.kata ?? [];
  if (dapat.length !== harap.length) salah.push(`jumlah kata ${dapat.length} vs ${harap.length}`);
  if (tata && harap.length && harap.some((r) => r.ukuran !== tata.ukuran)) salah.push(`ukuran ${tata.ukuran} vs ${harap[0].ukuran}`);
  let dx = 0;
  harap.forEach((r, i) => {
    const d = dapat[i];
    if (!d) return;
    if (d.teks !== r.teks) salah.push(`kata[${i}] '${d.teks}' vs '${r.teks}'`);
    if (d.y !== r.xy[1]) salah.push(`y[${i}] ${d.y} vs ${r.xy[1]}`);
    dx = Math.max(dx, Math.abs(d.x - r.xy[0]));
    const warnaD = d.pembuka ? tata?.warnaPembuka : tata?.warnaIsi;
    if (!sama(warnaD, r.fill)) salah.push(`warna[${i}] ${warnaD} vs ${r.fill}`);
  });
  if (dx > 0.5) salah.push(`x selisih ${dx}`);
  selisihXMaks = Math.max(selisihXMaks, dx);
  if (!sama(tangkapan, k.log)) salah.push(`log ${JSON.stringify(tangkapan)} vs ${JSON.stringify(k.log)}`);
  const barisDapat = tata ? tata.baris.length : 0;
  hasil(`berita ${k.id}`, salah.length === 0, salah.length ? salah.slice(0, 4).join("; ") : `ukuran ${tata?.ukuran ?? "-"}, ${barisDapat} baris, ${dapat.length} kata, |dx| maks ${dx.toExponential(1)}`);
}
console.log(`   (selisih x terbesar semua kasus berita: ${selisihXMaks})`);

console.log("\n== Badge kategori ==");
for (const k of kasus.filter((c) => c.teks.style === "kategori")) {
  const tata = teks.tataLetakKategori(k.teks, k.isi);
  const r = k.rekam.find((x) => x.op === "text");
  if (!r) {
    hasil(`kategori ${k.id}`, tata === null, tata ? "TS menggambar, Python tidak" : "kosong di keduanya");
    continue;
  }
  const salah: string[] = [];
  if (!tata) salah.push("TS tidak menggambar");
  else {
    if (tata.ukuran !== r.ukuran) salah.push(`ukuran ${tata.ukuran} vs ${r.ukuran}`);
    if (tata.isi !== r.teks) salah.push(`isi ${tata.isi} vs ${r.teks}`);
    if (Math.abs(tata.x - r.xy[0]) > 1 || Math.abs(tata.y - r.xy[1]) > 1) salah.push(`posisi ${tata.x},${tata.y} vs ${r.xy}`);
    const kt = k.kotak_tinta ?? [];
    if (tata.kotak.some((v, j) => Math.abs(v - kt[j]) > 1)) salah.push(`kotak ${tata.kotak} vs ${kt}`);
  }
  hasil(
    `kategori ${k.id}`,
    salah.length === 0,
    salah.length ? salah.join("; ") : `ukuran ${tata?.ukuran}, posisi (${tata?.x},${tata?.y}) vs (${r.xy}), kotak ${tata?.kotak} vs ${k.kotak_tinta}`,
  );
}

console.log("\n== Teks biasa ==");
for (const k of kasus.filter((c) => !["berita", "kategori"].includes(String(c.teks.style ?? "")))) {
  const tata = teks.tataLetakBiasa(k.teks, k.isi, k.lebar, k.tinggi);
  const harapTeks = k.rekam.filter((r) => r.op === "text");
  const harapKotak = k.rekam.find((r) => r.op === "rect");
  const dapat: Rekam[] = [];
  for (const b of tata.baris) {
    if (tata.tintaGaris) {
      dapat.push({ op: "text", xy: [b.x, b.y], teks: b.teks, ukuran: tata.ukuran, fill: tata.tinta, stroke: tata.tebalGaris, stroke_fill: tata.tintaGaris });
    } else {
      dapat.push({ op: "text", xy: [b.x, b.y], teks: b.teks, ukuran: tata.ukuran, fill: tata.tinta, stroke: 0, stroke_fill: null });
    }
  }
  const salah: string[] = [];
  if (!sama(dapat, harapTeks)) salah.push(`teks ${JSON.stringify(dapat).slice(0, 200)} vs ${JSON.stringify(harapTeks).slice(0, 200)}`);
  const kotakDapat = tata.kotak ? { op: "rect", xy: tata.kotak.xy, fill: tata.kotak.isi } : undefined;
  if (!sama(kotakDapat, harapKotak)) salah.push(`kotak ${JSON.stringify(kotakDapat)} vs ${JSON.stringify(harapKotak)}`);
  hasil(`biasa ${k.id}`, salah.length === 0, salah.join("; ") || `${tata.baris.length} baris, ukuran ${tata.ukuran}`);
}

console.log("\n== PNG lapisan teks (piksel ±16, syarat >= 98%) ==");
for (const k of kasus.filter((c) => c.png)) {
  const dapat = teks.renderLapisanTeks(k.teks, k.isi, k.lebar, k.tinggi);
  const harap = await gambar.bacaGambarRgba(path.join(EMAS, "png", `${k.id}.png`));
  const b = bandingPiksel(dapat, harap, 16);
  hasil(
    `png ${k.id}`,
    b.semua >= 98,
    `kanvas ${persen(b.semua)} (identik ${persen(b.identik)}), area tinta ${persen(b.tinta)} dari ${b.nTinta} px, selisih maks ${b.maks}`,
  );
}

// ------------------------------------------------------------------
console.log("\n== komposit_statis + deteksi_kotak_teks (piksel ±8, syarat >= 99%) ==");
for (const tid of Object.keys(emas.komposit)) {
  const t = template.loadTemplate(tid);
  const kanvas = await komposit.kompositStatis(t);
  const harap = await gambar.bacaGambarRgba(path.join(EMAS, "png", `komposit-${tid}.png`));
  const b = bandingPiksel(kanvas, harap, 8);
  hasil(`komposit ${tid}`, b.semua >= 99, `${persen(b.semua)} (identik ${persen(b.identik)}), selisih maks ${b.maks}`);
  const kotak = deteksi.deteksiKotakTeks(kanvas);
  hasil(`deteksi ${tid}`, sama(kotak, emas.komposit[tid].deteksi), `${JSON.stringify(kotak)} vs ${JSON.stringify(emas.komposit[tid].deteksi)}`);
  // Deteksi juga dijalankan pada komposit emas Python: memisahkan selisih
  // algoritma deteksi dari selisih komposit.
  const kotakEmas = deteksi.deteksiKotakTeks(harap);
  hasil(`deteksi ${tid} (atas komposit Python)`, sama(kotakEmas, emas.komposit[tid].deteksi));
}
{
  const t = template.loadTemplate("uji-t1");
  const kanvas = await komposit.kompositStatis(t, { hook: "VIRAL! CONTOH TULISAN BERITA UNTUK MELIHAT LETAK DAN UKURANNYA", sumber: "SUMBER: CONTOH" });
  const harap = await gambar.bacaGambarRgba(path.join(EMAS, "png", "komposit-uji-t1-contoh.png"));
  const b = bandingPiksel(kanvas, harap, 16);
  hasil("komposit uji-t1 + teks contoh (±16, >= 98%)", b.semua >= 98, `${persen(b.semua)} (identik ${persen(b.identik)}), selisih maks ${b.maks}`);
  const png = await komposit.pngRgb(kanvas);
  hasil("pngRgb menghasilkan PNG RGB", png.subarray(1, 4).toString() === "PNG" && png[25] === 2);
}

// ------------------------------------------------------------------
console.log("\n== _rapikan_gambar (dimensi identik, piksel ±8 >= 99%) ==");
{
  const kerja = fs.mkdtempSync(path.join(os.tmpdir(), "uji-rapikan-"));
  for (const [nama, e] of Object.entries(emas.rapikan as Record<string, { berubah: boolean; w: number; h: number }>)) {
    const berkas = path.join(kerja, nama);
    fs.copyFileSync(path.join(EMAS, "rapikan", "masuk", nama), berkas);
    const ukuran = await gambar.rapikanGambar(berkas);
    const salah: string[] = [];
    if ((ukuran !== null) !== e.berubah) salah.push(`berubah ${ukuran !== null} vs ${e.berubah}`);
    const dapat = await gambar.bacaGambarRgba(berkas);
    if (dapat.width !== e.w || dapat.height !== e.h) salah.push(`ukuran ${dapat.width}x${dapat.height} vs ${e.w}x${e.h}`);
    let rinci = `${dapat.width}x${dapat.height}`;
    if (e.berubah) {
      const harap = await gambar.bacaGambarRgba(path.join(EMAS, "rapikan", "keluar", nama));
      const b = bandingPiksel(dapat, harap, 8);
      if (b.semua < 99) salah.push(`piksel ${persen(b.semua)}`);
      rinci += `, piksel ${persen(b.semua)} (identik ${persen(b.identik)}), selisih maks ${b.maks}`;
      // Isi berkas memang PNG walau namanya .jpg/.webp (im.save(format="PNG")).
      if (fs.readFileSync(berkas).subarray(1, 4).toString() !== "PNG") salah.push("bukan PNG");
    }
    hasil(`rapikan ${nama}`, salah.length === 0, salah.join("; ") || rinci);
  }
  fs.rmSync(kerja, { recursive: true, force: true });
}

console.log("\n== _pastikan_isi_media bagian gambar ==");
for (const [nama, pesan] of Object.entries(emas.pastikan as Record<string, string | null>)) {
  let dapat: string | null = null;
  try {
    await gambar.pastikanIsiGambar(path.join(EMAS, "pastikan", nama));
  } catch (e) {
    dapat = e instanceof Error ? `${e.name}:${e.message}` : String(e);
  }
  const harap = pesan === null ? null : `GalatVideo:${pesan}`;
  hasil(`pastikan ${nama}`, dapat === harap, `${dapat} vs ${harap}`);
}

// ------------------------------------------------------------------
console.log("\n== Lain-lain ==");
hasil("warna black@0.5", sama(teks.warna(null, "black@0.5"), [0, 0, 0, 127]));
hasil("warna #fc0 & nama", sama(teks.warna("#fc0"), [255, 204, 0, 255]) && sama(teks.warna(" Red @ 0.25 "), [255, 0, 0, 63]));
hasil("warna tak dikenal -> bawaan", sama(teks.warna("bukanwarna@2", "white"), [255, 255, 255, 255]));
hasil("warna hsl/rgba", sama(teks.warna("hsl(120, 100%, 25%)"), [0, 128, 0, 255]) && sama(teks.warna("rgba(1,2,3,4)"), [1, 2, 3, 255]));
hasil("kotakKategoriBawaan", sama(teks.kotakKategoriBawaan({ x: 60, y: 1380, w: 960, h: 320 }), { x: 66, y: 1300, w: 393, h: 80 }) && teks.kotakKategoriBawaan({ x: 1, y: 2, w: 3 }) === null && teks.kotakKategoriBawaan([1, 2]) === null);
hasil("angkaPosisi", [
  komposit.angkaPosisi(null, 1080, 300) === 390,
  komposit.angkaPosisi(" main_w-w ", 1080, 300) === 780,
  komposit.angkaPosisi("(H-h)/2", 1920, 101) === 909,
  komposit.angkaPosisi("12.9", 100, 1) === 12,
  komposit.angkaPosisi("abc", 100, 1) === 0,
  komposit.angkaPosisi(-7.8, 100, 1) === -7,
  komposit.angkaPosisi(null, 100, 101) === -1,
].every(Boolean));
{
  const tujuan = path.join(MEDIA, "t.png");
  await teks.gambarTeks({ style: "kategori", box: { x: 0, y: 0, w: 200, h: 60 } }, "news", 300, 100, tujuan);
  const g = await gambar.bacaGambarRgba(tujuan);
  hasil("gambarTeks menulis PNG", g.width === 300 && g.height === 100);
}

console.warn = warnAsli;
fs.rmSync(MEDIA, { recursive: true, force: true });
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
