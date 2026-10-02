// Tebakan kotak teks otomatis — cermin deteksi_kotak_teks di video_edit.py.
// Ambang dan urutan langkahnya sengaja identik (perkecil BOX 4x, konversi
// L ITU-R 601, filter FIND_EDGES 3x3, komponen terhubung 4-arah), supaya
// tombol "Deteksi" memberi kotak yang sama persis dengan versi Python.
import type { Kotak } from "./jenis";
import { keRgb, resampel, type GambarRgba } from "./gambar";

/**
 * Tebak kotak teks: daerah terang yang rata dan paling luas di kanvas.
 *
 * Kotak lower-third pada umumnya berupa bidang polos berwarna terang (putih,
 * biru muda) yang jauh lebih luas dari elemen lain. Gambar diperkecil dulu
 * supaya pencarian komponen terhubung cepat, lalu hasilnya dikembalikan ke
 * ukuran kanvas dan disisipkan sedikit ke dalam.
 */
export function deteksiKotakTeks(kanvas: GambarRgba): Kotak | null {
  const faktor = 4;
  const w = Math.max(1, Math.floor(kanvas.width / faktor));
  const h = Math.max(1, Math.floor(kanvas.height / faktor));
  // convert("RGB") membuang alpha tanpa latar, lalu resize BOX tanpa premultiply.
  const kecil = resampel(keRgb(kanvas), kanvas.width, kanvas.height, 3, w, h, "box");

  // convert("L"): (R*19595 + G*38470 + B*7471 + 0x8000) >> 16.
  const terang = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    terang[i] = (kecil[i * 3] * 19595 + kecil[i * 3 + 1] * 38470 + kecil[i * 3 + 2] * 7471 + 0x8000) >> 16;
  }

  // ImageFilter.FIND_EDGES: kernel 3x3 (8 di tengah, -1 sekelilingnya),
  // dibatasi 0..255. Baris & kolom tepi gambar disalin apa adanya — persis
  // ImagingFilter3x3, dan itu ikut memengaruhi kandidat di pinggir kanvas.
  const tepi = terang.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let ss = 8 * terang[i];
      ss -= terang[i - w - 1] + terang[i - w] + terang[i - w + 1];
      ss -= terang[i - 1] + terang[i + 1];
      ss -= terang[i + w - 1] + terang[i + w] + terang[i + w + 1];
      tepi[i] = ss < 0 ? 0 : ss > 255 ? 255 : ss;
    }
  }

  const kandidat = (i: number): boolean => {
    const r = kecil[i * 3];
    const g = kecil[i * 3 + 1];
    const b = kecil[i * 3 + 2];
    // Terang dan cukup polos (bukan tepian). Kejenuhan warna diberi
    // kelonggaran agar kotak berwarna muda dengan gradasi (mis. biru muda)
    // tetap terhitung utuh, sementara bidang latar yang pekat tersaring
    // oleh ambang terangnya.
    return terang[i] > 140 && tepi[i] < 16 && Math.max(r, g, b) - Math.min(r, g, b) < 160;
  };

  const dikunjungi = new Uint8Array(w * h);
  let terbaik: { jumlah: number; kotak: [number, number, number, number] } | null = null;
  const antrean: number[] = [];
  for (let y0 = 0; y0 < h; y0++) {
    for (let x0 = 0; x0 < w; x0++) {
      const awal = y0 * w + x0;
      if (dikunjungi[awal] || !kandidat(awal)) continue;
      // Komponen terhubung 4-arah. Urutan kunjungan tidak memengaruhi hasil
      // (hanya jumlah piksel & batas kotaknya yang dipakai).
      antrean.length = 0;
      antrean.push(awal);
      dikunjungi[awal] = 1;
      let jumlah = 0;
      let minx = x0;
      let maxx = x0;
      let miny = y0;
      let maxy = y0;
      while (antrean.length) {
        const p = antrean.pop() as number;
        const x = p % w;
        const y = (p - x) / w;
        jumlah += 1;
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
        const tetangga: [number, number][] = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ];
        for (const [nx, ny] of tetangga) {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const q = ny * w + nx;
          if (!dikunjungi[q] && kandidat(q)) {
            dikunjungi[q] = 1;
            antrean.push(q);
          }
        }
      }
      const luasKotak = (maxx - minx + 1) * (maxy - miny + 1);
      // Harus cukup besar dan cukup "persegi" (bukan garis tipis)
      if (jumlah < w * h * 0.01 || jumlah / luasKotak < 0.55) continue;
      if (maxy - miny + 1 < 6 || maxx - minx + 1 < 12) continue;
      if (terbaik === null || jumlah > terbaik.jumlah) terbaik = { jumlah, kotak: [minx, miny, maxx, maxy] };
    }
  }
  if (terbaik === null) return null;
  const [minx, miny, maxx, maxy] = terbaik.kotak;
  const x = minx * faktor;
  const y = miny * faktor;
  const bw = (maxx - minx + 1) * faktor;
  const bh = (maxy - miny + 1) * faktor;
  // sisipkan sedikit ke dalam supaya tidak menempel tepi kotak
  const sisip = Math.max(4, Math.trunc(Math.min(bw, bh) * 0.03));
  return { x: x + sisip, y: y + sisip, w: Math.max(20, bw - 2 * sisip), h: Math.max(20, bh - 2 * sisip) };
}
