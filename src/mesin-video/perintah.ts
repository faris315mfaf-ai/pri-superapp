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
  opsi: { gambarTeks?: PenggambarTeks } = {},
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
  const durasiBadan = infoSumber.duration ? Math.min(infoSumber.duration, batas) : batas;
  if (durasiBadan <= 0) throw new GalatVideo("Durasi video sumber terbaca 0 detik");

  const inputs: string[] = ["-t", formatF(durasiBadan, 3), "-i", source];
  const filters: string[] = [];
  let idx = 1; // indeks input berikutnya

  // ---------- BADAN: video sumber dipasang ke kanvas ----------
  filters.push(
    `[0:v]scale=${lebar}:${tinggi}:force_original_aspect_ratio=increase,` +
      `crop=${lebar}:${tinggi},fps=${fps},setsar=1,format=yuv420p[b0]`,
  );
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
