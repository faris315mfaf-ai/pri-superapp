// Pratinjau statis template — cermin _angka_posisi, komposit_statis, dan
// _tempel_contoh_teks di video_edit.py. Hasilnya dipakai halaman editor
// (gambar pratinjau) dan deteksi kotak teks otomatis, jadi susunan pikselnya
// sengaja mengikuti Pillow (LANCZOS + alpha_composite) bit demi bit.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { asetTemplate } from "./template";
import { GalatVideo, type LapisanTeks, type Template } from "./jenis";
import { alphaComposite, bacaGambarRgba, bulatPython, gambarKosong, keRgb, potong, ubahUkuranRgba, type GambarRgba } from "./gambar";
import { benar, floatPy, intPy, kotakKategoriBawaan, rapikanTepi, renderLapisanTeks } from "./teks";

const JENIS_LAYER_GAMBAR = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const RUMUS_UJUNG = new Set(["main_w-w", "main_h-h", "W-w", "H-h"]);
const RUMUS_TENGAH = new Set(["(main_w-w)/2", "(main_h-h)/2", "(W-w)/2", "(H-h)/2"]);


/** Versi piksel dari rumus posisi overlay ffmpeg (untuk pratinjau). */
export function angkaPosisi(nilai: unknown, ukuranKanvas: number, ukuranLayer: number): number {
  if (nilai === null || nilai === undefined) return Math.floor((ukuranKanvas - ukuranLayer) / 2);
  if (typeof nilai === "string") {
    const t = rapikanTepi(nilai);
    if (RUMUS_UJUNG.has(t)) return ukuranKanvas - ukuranLayer;
    if (RUMUS_TENGAH.has(t)) return Math.floor((ukuranKanvas - ukuranLayer) / 2);
    let f: number;
    try {
      f = floatPy(t);
    } catch {
      return 0;
    }
    // int(float("nan")) -> ValueError (ditangkap -> 0); int(inf) -> OverflowError (tidak ditangkap).
    if (Number.isNaN(f)) return 0;
    return intPy(f);
  }
  return intPy(nilai);
}

/**
 * Susun layer gambar template di atas kanvas gelap, tanpa video.
 *
 * Dipakai halaman untuk menggambar kotak teks di atas tampilan sebenarnya,
 * dan oleh deteksi otomatis. Layer video dilewati.
 *
 * `contoh` berisi teks contoh per nama layer (mis. {hook: "VIRAL! ..."}).
 * Kalau diisi, teksnya ikut digambar memakai perender yang SAMA dengan yang
 * dipakai saat membuat video. Deteksi otomatis memanggilnya tanpa `contoh`
 * supaya yang dianalisis tetap gambar layer polos.
 */
export async function kompositStatis(template: Template, contoh?: Record<string, string> | null): Promise<GambarRgba> {
  const lebar = intPy(benar(template.width) ? template.width : 1080);
  const tinggi = intPy(benar(template.height) ? template.height : 1920);
  let kanvas = gambarKosong(lebar, tinggi, [24, 24, 24, 255]);
  for (const overlay of template.overlays ?? []) {
    const nama = String(benar(overlay.file) ? overlay.file : "");
    if (!JENIS_LAYER_GAMBAR.has(path.extname(nama).toLowerCase())) continue;
    let berkas: string | null;
    try {
      berkas = asetTemplate(template, nama);
    } catch (error) {
      if (error instanceof GalatVideo) continue;
      throw error;
    }
    if (!berkas) continue;
    let im = await bacaGambarRgba(fs.readFileSync(berkas));
    const w = overlay.w;
    const h = overlay.h;
    if (benar(w) || benar(h)) {
      const tw = benar(w) ? intPy(w) : Math.max(1, bulatPython((im.width * intPy(h)) / im.height));
      const th = benar(h) ? intPy(h) : Math.max(1, bulatPython((im.height * intPy(w)) / im.width));
      im = ubahUkuranRgba(im, tw, th, "lanczos");
    }
    const x = angkaPosisi(overlay.x, lebar, im.width);
    const y = angkaPosisi(overlay.y, tinggi, im.height);
    // Potong bagian yang keluar kanvas; alpha_composite menolak itu.
    const kiri = Math.max(0, -x);
    const atas = Math.max(0, -y);
    const kanan = Math.min(im.width, lebar - x);
    const bawah = Math.min(im.height, tinggi - y);
    if (kanan <= kiri || bawah <= atas) continue;
    alphaComposite(kanvas, potong(im, kiri, atas, kanan, bawah), x + kiri, y + atas);
  }
  if (contoh && benar(contoh)) kanvas = tempelContohTeks(template, kanvas, contoh, lebar, tinggi);
  return kanvas;
}

/** Gambar teks contoh di atas komposit, lewat jalur render yang sama. */
export function tempelContohTeks(
  template: Template,
  kanvas: GambarRgba,
  contoh: Record<string, string>,
  lebar: number,
  tinggi: number,
): GambarRgba {
  const t = template as Record<string, unknown>;
  const kotakTeks = typeof t.text_box === "object" && t.text_box !== null && !Array.isArray(t.text_box) ? t.text_box : null;
  let kotakBadge: unknown =
    typeof t.badge_box === "object" && t.badge_box !== null && !Array.isArray(t.badge_box) ? t.badge_box : null;
  if (!benar(kotakBadge)) kotakBadge = kotakKategoriBawaan(kotakTeks);

  (template.texts ?? []).forEach((asli, nomor) => {
    let teks: LapisanTeks = asli;
    const nama = String(benar(teks.name) ? teks.name : `teks${nomor}`);
    let isi: unknown = contoh[nama];
    if (!benar(isi) && benar(teks.source)) isi = t[String(teks.source)];
    const isiTeks = rapikanTepi(String(benar(isi) ? isi : ""));
    if (!isiTeks) return;
    const gaya = String(benar(teks.style) ? teks.style : "").toLowerCase();
    if (gaya === "berita") {
      const w = rapikanTepi(String(benar(t.teks_warna) ? t.teks_warna : "white")).toLowerCase();
      teks = { ...teks, color: w === "black" || w === "white" ? w : "white" };
      if (benar(kotakTeks) && !benar(teks.box)) teks = { ...teks, box: kotakTeks as LapisanTeks["box"] };
    }
    if (gaya === "kategori" && !benar(teks.box)) {
      if (!benar(kotakBadge)) return;
      teks = { ...teks, box: kotakBadge as LapisanTeks["box"] };
    }
    try {
      alphaComposite(kanvas, renderLapisanTeks(teks, isiTeks, lebar, tinggi));
    } catch (error) {
      // pratinjau tidak boleh menggagalkan halaman
      console.error(`Teks contoh '${nama}' gagal digambar di pratinjau`, error);
    }
  });
  return kanvas;
}

/**
 * PNG pratinjau untuk halaman: `kanvas.convert("RGB").save(buf, "PNG",
 * optimize=True)` — alpha dibuang (kanvas komposit selalu buram).
 */
export async function pngRgb(kanvas: GambarRgba): Promise<Buffer> {
  return sharp(Buffer.from(keRgb(kanvas)), {
    raw: { width: kanvas.width, height: kanvas.height, channels: 3 },
    limitInputPixels: false,
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
