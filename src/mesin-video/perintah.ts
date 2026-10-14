// Perakit perintah ffmpeg — cermin bagian "SUSUN PERINTAH FFMPEG" di
// video_edit.py (_posisi, _escape_filter, _klip, _bangun_perintah).
//
// Argumen yang dihasilkan HARUS sama persis dengan versi Python, urutan dan
// format angkanya juga (uji emas di tests/mesin-video/emas/perintah/). Itu
// sebabnya angka dicetak lewat formatF/pyFloatRepr, bukan toFixed/String.
import path from "node:path";
import { FFMPEG_BIN, MAX_SOURCE_SECONDS, VIDEO_CRF, VIDEO_PRESET, VIDEO_THREADS } from "./konfig";
import { GalatVideo, type Kotak, type LapisanTeks, type Template } from "./jenis";
import { asetTemplate } from "./template";
import { gambarTeks, kotakKategoriBawaan } from "./teks";
import {
  adalahDict,
  ambil,
  asetRingan,
  formatF,
  pencatat,
  potongPy,
  probe,
  pyFloat,
  pyFloatRepr,
  pyInt,
  pyOr,
  pyRepr,
  pyStr,
  pyStrip,
  pyTruthy,
  teksBulat,
  ukuranTampil,
} from "./media";

/** Tanda tangan perender teks (teks.ts); bisa diganti untuk uji. */
export type PenggambarTeks = typeof gambarTeks;

// Rumus posisi yang boleh dipakai template. Sengaja dibatasi: nilai ini masuk
// ke perintah ffmpeg, jadi hanya bentuk yang dikenali yang diteruskan.
export const POSISI_RUMUS: ReadonlySet<string> = new Set([
  "main_w-w", "main_h-h", "(main_w-w)/2", "(main_h-h)/2",
  "W-w", "H-h", "(W-w)/2", "(H-h)/2", "0",
]);

// Sama dengan POLA_CROP di konfig, tetapi \d versi Python (re pada str)
// mencocokkan digit Unicode apa pun, bukan hanya 0-9. Supaya template yang
// ditolak/diterima sama persis dengan mesin Python, pola ini yang dipakai.
const POLA_CROP_PY = /^\p{Nd}{1,5}:\p{Nd}{1,5}:\p{Nd}{1,5}:\p{Nd}{1,5}$/u;

/** Ubah x/y template jadi nilai posisi untuk filter overlay. */
export function posisi(nilai: unknown, bawaan: string): string {
  if (nilai === null || nilai === undefined) return bawaan;
  if (typeof nilai === "string") {
    const teks = pyStrip(nilai);
    if (POSISI_RUMUS.has(teks)) return teks;
    let angka: number;
    try {
      angka = pyFloat(teks);
    } catch {
      pencatat.warning(`Posisi '${teks}' tidak dikenali, dipakai ${bawaan}`);
      return bawaan;
    }
    // int(float("nan")) di Python = ValueError (ditangkap → bawaan), sedangkan
    // int(float("inf")) = OverflowError yang lolos ke atas. Ditiru apa adanya.
    if (Number.isNaN(angka)) {
      pencatat.warning(`Posisi '${teks}' tidak dikenali, dipakai ${bawaan}`);
      return bawaan;
    }
    return teksBulat(pyInt(angka));
  }
  return teksBulat(pyInt(nilai));
}

/** Amankan path/nilai yang dipakai di dalam filtergraph ffmpeg. */
export function escapeFilter(nilai: unknown): string {
  return pyStr(nilai).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/** Filter untuk menyeragamkan satu klip (intro/outro) ke ukuran kanvas. */
export function klip(
  _berkas: string,
  lebar: number,
  tinggi: number,
  fps: number,
  idx: number,
  nama: string,
): [string[], string] {
  return [
    [
      `[${idx}:v]scale=${lebar}:${tinggi}:force_original_aspect_ratio=increase,` +
        `crop=${lebar}:${tinggi},fps=${fps},setsar=1,format=yuv420p[${nama}]`,
    ],
    nama,
  ];
}

type Lapisan = Record<string, unknown> & { path: string };

/** Durasi potongan terpendek yang diterima (detik). */
export const POTONG_MIN_DETIK = 1;

/**
 * Rentang sumber yang dirender (14 Okt 2026). Tanpa `potong`: dari 0 sampai batas (perilaku lama).
 * Dengan `potong`: mulai di `mulai`, panjang `akhir - mulai`, tetap dipangkas ke batas durasi template
 * dan ke sisa durasi sumber. Mulai di luar video = galat yang bisa dibaca pengguna.
 */
export function rentangPotong(
  durasiSumber: number,
  batas: number,
  potong?: { mulai: number; akhir: number } | null,
): { mulai: number; durasi: number } {
  if (!potong) {
    const durasi = durasiSumber ? Math.min(durasiSumber, batas) : batas;
    return { mulai: 0, durasi };
  }
  const mulai = Math.max(0, Number(potong.mulai) || 0);
  const akhir = Number(potong.akhir) || 0;
  if (durasiSumber && mulai >= durasiSumber - POTONG_MIN_DETIK / 2) {
    throw new GalatVideo("Bagian yang dipilih berada di luar durasi video. Pilih ulang bagian videonya.");
  }
  let durasi = Math.min(akhir - mulai, batas);
  if (durasiSumber) durasi = Math.min(durasi, durasiSumber - mulai);
  if (!(durasi >= POTONG_MIN_DETIK / 2)) {
    throw new GalatVideo("Bagian video yang dipilih terlalu pendek. Pilih minimal 1 detik.");
  }
  return { mulai, durasi };
}

/**
 * Rentang tegak area hook (kotak tulisan berita) di kanvas: text_box bila ada, selain itu lapisan teks
 * "hook" (tinggi diperkirakan dari ukuran huruf × baris). null = template tanpa hook.
 */
export function areaHook(template: Template): { atas: number; bawah: number } | null {
  const kotak = ambil(template, "text_box");
  if (adalahDict(kotak)) {
    const y = Number(ambil(kotak, "y"));
    const h = Number(ambil(kotak, "h"));
    if (Number.isFinite(y) && Number.isFinite(h) && h > 0) return { atas: y, bawah: y + h };
  }
  const teks = (pyOr(ambil(template, "texts"), []) as Record<string, unknown>[]) ?? [];
  const hook = teks.find((t) => ambil(t, "name") === "hook");
  const y = Number(ambil(hook ?? {}, "y"));
  if (!hook || !Number.isFinite(y)) return null;
  const ukuran = Number(ambil(hook, "size")) || 40;
  const baris = Number(ambil(hook, "max_lines")) || 3;
  const jarak = Number(ambil(hook, "line_height")) || 1.2;
  return { atas: y, bawah: y + ukuran * jarak * baris };
}

/**
 * Posisi tegak (y) video lebar berbingkai hitam (14 Okt 2026). Video digeser menjauhi kotak hook supaya
 * hook (dan bingkai/kotak template di sekitarnya) jatuh di area hitam, bukan menutupi gambar:
 * hook di separuh bawah -> video tepat DI ATAS kotak hook; hook di separuh atas -> tepat DI BAWAHnya.
 * Tidak pernah melewati posisi tengah, dan tetap di dalam kanvas. `ruang` = jarak untuk tab/hiasan kotak
 * (64 px pada kanvas 1280).
 */
export function yBingkaiHitam(
  template: Template,
  lebar: number,
  tinggi: number,
  lebarSumber: number,
  tinggiSumber: number,
): number {
  const tinggiVideo = Math.min(tinggi, Math.round((lebar * tinggiSumber) / Math.max(1, lebarSumber)));
  const tengah = Math.round((tinggi - tinggiVideo) / 2);
  const hook = areaHook(template);
  if (!hook) return tengah;
  const ruang = Math.round((64 * tinggi) / 1280);
  const y =
    hook.atas + hook.bawah > tinggi
      ? Math.min(tengah, hook.atas - ruang - tinggiVideo)
      : Math.max(tengah, hook.bawah + ruang);
  return Math.max(0, Math.min(tinggi - tinggiVideo, y));
}

/**
 * Video sumber -> kanvas: penuh (diperbesar lalu dipotong tengah), atau utuh dengan bingkai hitam di posisi
 * tegak `yHitam` (null = tengah). Ekspresi pad dijepit ke kanvas karena tinggi hasil scale bisa beda 1 px.
 */
export function filterBadan(lebar: number, tinggi: number, fps: number, bingkaiHitam: boolean, yHitam: number | null = null): string {
  const yPad = yHitam === null ? "(oh-ih)/2" : `min(${Math.max(0, Math.round(yHitam))}\\,oh-ih)`;
  const ukur = bingkaiHitam
    ? `scale=${lebar}:${tinggi}:force_original_aspect_ratio=decrease,pad=${lebar}:${tinggi}:(ow-iw)/2:${yPad}:color=black`
    : `scale=${lebar}:${tinggi}:force_original_aspect_ratio=increase,crop=${lebar}:${tinggi}`;
  return `[0:v]${ukur},fps=${fps},setsar=1,format=yuv420p[b0]`;
}

export type HasilPerintah = { args: string[]; total: number };

/**
 * Rakit satu perintah ffmpeg yang mengerjakan seluruh template sekaligus:
 * video sumber, overlay, teks, lalu sambungan intro/outro dalam satu kali
 * encode (hemat CPU, tanpa penurunan kualitas berlapis).
 */
export async function bangunPerintah(
  template: Template,
  source: string,
  keluaran: string,
  texts: Record<string, string>,
  kerja: string,
  opsi: {
    gambarTeks?: PenggambarTeks;
    /** Bagian sumber yang dipakai (detik). */
    potong?: { mulai: number; akhir: number } | null;
    /** Video lebar (lebar >= tinggi saat ditampilkan) tidak dipotong: utuh di tengah, atas-bawah hitam. */
    bingkaiHitam?: boolean;
  } = {},
): Promise<HasilPerintah> {
  const penggambar = opsi.gambarTeks ?? gambarTeks;
  const lebar = pyInt(pyOr(template.width, 1080));
  const tinggi = pyInt(pyOr(template.height, 1920));
  const fps = pyInt(pyOr(template.fps, 30));

  const infoSumber = await probe(source);
  if (infoSumber.duration && infoSumber.duration > MAX_SOURCE_SECONDS + 1) {
    throw new GalatVideo(
      `Videonya ${formatF(infoSumber.duration / 60, 0)} menit, lebih panjang dari ` +
        `batas ${formatF(MAX_SOURCE_SECONDS / 60, 0)} menit. Potong dulu videonya, ` +
        "atau pakai sumber yang lebih pendek.",
    );
  }
  let batas = MAX_SOURCE_SECONDS;
  if (pyTruthy(ambil(template, "max_duration"))) batas = Math.min(batas, pyFloat(template.max_duration));
  const { mulai: mulaiBadan, durasi: durasiBadan } = rentangPotong(infoSumber.duration, batas, opsi.potong);
  if (durasiBadan <= 0) throw new GalatVideo("Durasi video sumber terbaca 0 detik");

  // -ss sebelum -i = lompat cepat ke titik mulai (akurat karena videonya di-encode ulang).
  const inputs: string[] = [
    ...(mulaiBadan > 0 ? ["-ss", formatF(mulaiBadan, 3)] : []),
    "-t", formatF(durasiBadan, 3), "-i", source,
  ];
  const filters: string[] = [];
  let idx = 1; // indeks input berikutnya

  // ---------- BADAN: video sumber dipasang ke kanvas ----------
  let bingkaiHitam = false;
  let yHitam: number | null = null;
  if (opsi.bingkaiHitam) {
    const tampil = await ukuranTampil(source).catch(() => ({ width: 0, height: 0 }));
    bingkaiHitam = tampil.width > 0 && tampil.height > 0 && tampil.width >= tampil.height;
    if (bingkaiHitam) yHitam = yBingkaiHitam(template, lebar, tinggi, tampil.width, tampil.height);
  }
  filters.push(filterBadan(lebar, tinggi, fps, bingkaiHitam, yHitam));
  let sekarang = "b0";

  // ---------- LAPISAN: overlay PNG template + teks yang digambar sendiri ----------
  const lapisan: Lapisan[] = [];
  for (const overlay of (pyOr(ambil(template, "overlays"), []) as Record<string, unknown>[]) ?? []) {
    const berkas = asetTemplate(template, ambil(overlay, "file") as string | null | undefined);
    if (berkas === null) continue;
    lapisan.push({ ...overlay, path: berkas });
  }

  const kotakTeks = adalahDict(ambil(template, "text_box")) ? (template.text_box as Kotak) : null;
  let kotakBadge: Kotak | null = adalahDict(ambil(template, "badge_box")) ? (template.badge_box as Kotak) : null;
  if (kotakBadge === null) kotakBadge = kotakKategoriBawaan(kotakTeks);
  const daftarTeks = pyOr(ambil(template, "texts"), []) as LapisanTeks[];
  for (let nomor = 0; nomor < daftarTeks.length; nomor++) {
    let teks = daftarTeks[nomor];
    const nama = pyStr(pyOr(ambil(teks, "name"), `teks${nomor}`));
    let isi: unknown = ambil(texts, nama);
    // Layer dengan "source" mengambil isinya dari field template, mis.
    // kategori (NEWS/HIBURAN) yang memang milik set layer, bukan per video.
    if (!pyTruthy(isi) && pyTruthy(ambil(teks, "source"))) isi = ambil(template, pyStr(teks.source));
    isi = pyStrip(pyStr(pyOr(pyOr(isi, ambil(teks, "default")), "")));
    if (!isi) continue;
    const gaya = pyStr(pyOr(ambil(teks, "style"), "")).toLowerCase();
    if (gaya === "berita") {
      // Satu-satunya sumber kebenaran warna tulisan berita adalah setelan
      // template (teks_warna); bawaannya PUTIH. Dulu jatuh ke warna layer
      // (hitam) sehingga halaman menampilkan "Putih" tapi videonya hitam.
      let warna = pyStrip(pyStr(pyOr(ambil(template, "teks_warna"), "white"))).toLowerCase();
      if (warna !== "black" && warna !== "white") warna = "white";
      teks = { ...teks, color: warna };
      if (pyTruthy(kotakTeks) && !pyTruthy(ambil(teks, "box"))) teks = { ...teks, box: kotakTeks };
    }
    if (gaya === "kategori" && !pyTruthy(ambil(teks, "box"))) {
      if (!pyTruthy(kotakBadge)) continue; // belum ada tempatnya
      teks = { ...teks, box: kotakBadge };
    }
    const png = await penggambar(teks, isi as string, lebar, tinggi, path.join(kerja, `text_${nomor}.png`));
    // PNG teks sudah seukuran kanvas, jadi cukup ditempel di 0,0.
    lapisan.push({ path: png, x: 0, y: 0, start: ambil(teks, "start"), end: ambil(teks, "end") });
  }

  for (let nomor = 0; nomor < lapisan.length; nomor++) {
    const item = lapisan[nomor];
    // Overlay video diputar berulang ("loop"); "-t" wajib menyertai
    // pengulangan tak terbatas, kalau tidak ffmpeg menggantung saat menutup.
    if (pyTruthy(item.loop)) inputs.push("-stream_loop", "-1", "-t", formatF(durasiBadan, 3));
    const w = item.w;
    const h = item.h;
    // Aset yang jauh lebih besar dari tempatnya digambar dikecilkan dulu.
    const jalurOv = await asetRingan(item.path, pyInt(pyOr(w, 0)), pyInt(pyOr(h, 0)));
    inputs.push("-i", jalurOv);
    let sumberOv = `${idx}:v`;
    // "crop" opsional "lebar:tinggi:x:y"; selain bentuk itu ditolak karena
    // nilainya masuk filtergraph (bisa menyisipkan filter lain).
    const potong = pyStrip(pyStr(pyOr(item.crop, "")));
    if (potong && !POLA_CROP_PY.test(potong)) {
      throw new GalatVideo(`Nilai crop layer tidak sah: ${pyRepr(potongPy(potong, 40))} (bentuknya lebar:tinggi:x:y)`);
    }
    const rantai: string[] = [];
    // Green screen: hijaunya dibuang jadi transparan sebelum dipotong/diskala.
    if (pyTruthy(item.kunci_hijau)) rantai.push("chromakey=0x00FF00:0.25:0.05");
    if (potong) rantai.push(`crop=${potong}`);
    if (pyTruthy(w) || pyTruthy(h)) {
      // -2 dan bukan -1: sisi otomatis dibulatkan genap (yuv420p menolak ganjil).
      rantai.push(`scale=${pyTruthy(w) ? teksBulat(pyInt(w)) : -2}:${pyTruthy(h) ? teksBulat(pyInt(h)) : -2}`);
    }
    if (rantai.length) {
      filters.push(`[${sumberOv}]${rantai.join(",")}[ov${nomor}]`);
      sumberOv = `ov${nomor}`;
    }
    const posisiX = posisi(item.x, "(W-w)/2");
    const posisiY = posisi(item.y, "(H-h)/2");
    let opsiOv = `overlay=${posisiX}:${posisiY}`;
    const mulai = item.start;
    const selesai = item.end;
    const ada = (v: unknown) => v !== null && v !== undefined;
    if (ada(mulai) || ada(selesai)) {
      opsiOv +=
        `:enable='between(t\\,${pyFloatRepr(pyFloat(pyOr(mulai, 0)))}` +
        `\\,${pyFloatRepr(pyFloat(pyOr(selesai, durasiBadan)))})'`;
    }
    filters.push(`[${sekarang}][${sumberOv}]${opsiOv}[b${nomor + 1}]`);
    sekarang = `b${nomor + 1}`;
    idx += 1;
  }

  const potonganV = [sekarang];
  const potonganA: string[] = [];

  // ---------- AUDIO BADAN ----------
  if (infoSumber.has_audio) {
    filters.push("[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[ba]");
  } else {
    // Klip tanpa audio tetap butuh jalur audio, kalau tidak concat gagal.
    inputs.push("-f", "lavfi", "-t", formatF(durasiBadan, 3), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    filters.push(`[${idx}:a]anull[ba]`);
    idx += 1;
  }
  potonganA.push("ba");

  // ---------- INTRO & OUTRO ----------
  let total = durasiBadan;
  for (const bagian of ["intro", "outro"] as const) {
    let berkas = asetTemplate(template, ambil(template, bagian) as string | null | undefined);
    if (berkas === null) continue;
    berkas = await asetRingan(berkas, lebar, tinggi);
    const info = await probe(berkas);
    total += info.duration;
    inputs.push("-i", berkas);
    const idxKlip = idx;
    idx += 1;
    const [potongan, namaV] = klip(berkas, lebar, tinggi, fps, idxKlip, `${bagian}v`);
    filters.push(...potongan);
    if (info.has_audio) {
      filters.push(
        `[${idxKlip}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[${bagian}a]`,
      );
    } else {
      inputs.push(
        "-f", "lavfi", "-t", formatF(Math.max(info.duration, 0.1), 3),
        "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      );
      filters.push(`[${idx}:a]anull[${bagian}a]`);
      idx += 1;
    }
    if (bagian === "intro") {
      potonganV.unshift(namaV);
      potonganA.unshift(`${bagian}a`);
    } else {
      potonganV.push(namaV);
      potonganA.push(`${bagian}a`);
    }
  }

  // ---------- SAMBUNG ----------
  let petaV: string;
  let petaA: string;
  if (potonganV.length > 1) {
    const pasangan = potonganV.map((v, i) => `[${v}][${potonganA[i]}]`).join("");
    filters.push(`${pasangan}concat=n=${potonganV.length}:v=1:a=1[outv][outa]`);
    petaV = "[outv]";
    petaA = "[outa]";
  } else {
    petaV = `[${potonganV[0]}]`;
    petaA = `[${potonganA[0]}]`;
  }

  const args = [
    FFMPEG_BIN, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    // Ditulis SEBELUM masukan supaya berlaku untuk semua pembaca video;
    // tiap utas pembaca menyimpan framenya sendiri (ratusan MB).
    "-threads", VIDEO_THREADS !== "0" ? VIDEO_THREADS : "1",
    "-filter_complex_threads", "1",
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", petaV, "-map", petaA,
    "-c:v", "libx264", "-preset", VIDEO_PRESET, "-crf", VIDEO_CRF,
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(fps),
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
    "-movflags", "+faststart", "-threads", VIDEO_THREADS,
    "-progress", "pipe:1", "-nostats",
    keluaran,
  ];
  return { args, total };
}
