// Pengulang emas primitif Pillow (emas/outro/primitif.json) untuk port TS.
// Dipakai uji-outro.mts; bisa juga dijalankan sendiri:
//   npx tsx tests/mesin-video/outro-primitif.mts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  alphaComposite,
  baru,
  BICUBIC,
  BILINEAR,
  gaussianBlur,
  Gambar,
  LANCZOS,
  NEAREST,
  potong,
  putar,
  salin,
  thumbnail,
  transformAffine,
  ubahUkuran,
  type Filter,
  type Mode,
} from "../../src/mesin-video/outro/gambar";
import { Kuas } from "../../src/mesin-video/outro/kuas";

const FILTER: Record<string, Filter> = { lanczos: LANCZOS, bicubic: BICUBIC, bilinear: BILINEAR, nearest: NEAREST };

const md5 = (im: Gambar) => crypto.createHash("md5").update(im.data).digest("hex");

/** Sama dengan buat_gambar() di buat-emas-primitif.py (LCG 32-bit). */
function buatGambar(mode: Mode, w: number, h: number, seed: number): Gambar {
  const b = mode === "RGBA" ? 4 : 1;
  const data = new Uint8Array(w * h * b);
  let s = seed >>> 0;
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    data[i] = (s >>> 16) & 0xff;
  }
  if (mode === "RGBA") {
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 60) data[i] = 0;
      else if (data[i] > 200) data[i] = 255;
    }
  }
  return new Gambar(mode, w, h, data);
}

type Kasus = Record<string, any> & { jenis: string; md5: string };

function jalankan(k: Kasus): Gambar {
  const W = 97;
  const H = 83;
  const kanvas = (mode: Mode) => baru(mode, W, H, mode === "RGBA" ? [0, 0, 0, 0] : 0);
  switch (k.jenis) {
    case "polygon": {
      const im = kanvas(k.mode);
      const isi = typeof k.isi === "number" ? k.isi : k.isi;
      if (k.garis) new Kuas(im).polygon(k.pts, null, isi);
      else new Kuas(im).polygon(k.pts, isi);
      return im;
    }
    case "line": {
      const im = kanvas("RGBA");
      new Kuas(im).line(k.pts, k.isi, k.lebar, k.joint);
      return im;
    }
    case "ellipse": {
      const im = kanvas(k.mode);
      if (k.lebar === 0) new Kuas(im).ellipse(k.kotak, k.isi);
      else new Kuas(im).ellipse(k.kotak, null, k.isi, k.lebar);
      return im;
    }
    case "rectangle": {
      const im = kanvas("RGBA");
      if (k.lebar === 0) new Kuas(im).rectangle(k.kotak, [255, 255, 255, 8]);
      else new Kuas(im).rectangle(k.kotak, null, [1, 2, 3, 200], k.lebar);
      return im;
    }
    case "rounded": {
      const im = kanvas(k.mode);
      const kuas = new Kuas(im);
      if (k.pilihan === "isi") kuas.roundedRectangle(k.kotak, k.radius, k.isi);
      else if (k.pilihan === "garis") kuas.roundedRectangle(k.kotak, k.radius, null, k.garis, k.lebar);
      else kuas.roundedRectangle(k.kotak, k.radius, k.isi, k.garis, k.lebar);
      return im;
    }
    case "arc": {
      const im = kanvas("RGBA");
      new Kuas(im).arc(k.kotak, k.a0, k.a1, [232, 232, 232, 255], k.lebar);
      return im;
    }
    case "pieslice": {
      const im = kanvas("RGBA");
      new Kuas(im).pieslice(k.kotak, k.a0, k.a1, [232, 232, 232, 255]);
      return im;
    }
    case "blur":
      return gaussianBlur(buatGambar(k.mode, k.w, k.h, k.seed), k.radius);
    case "resize":
      return ubahUkuran(buatGambar(k.mode, k.w, k.h, k.seed), k.w2, k.h2, FILTER[k.filter]);
    case "rotate":
      return putar(buatGambar(k.mode, k.w, k.h, k.seed), k.sudut, FILTER[k.filter], k.expand);
    case "affine":
      return transformAffine(buatGambar(k.mode, k.w, k.h, k.seed), k.w, k.h, k.data, FILTER[k.filter]);
    case "komposit": {
      const a = salin(buatGambar("RGBA", 30, 20, k.s1));
      const b = buatGambar("RGBA", 17, 13, k.s2);
      const sx0 = Math.max(0, -k.dx);
      const sy0 = Math.max(0, -k.dy);
      const sx1 = Math.min(b.w, a.w - k.dx);
      const sy1 = Math.min(b.h, a.h - k.dy);
      if (sx1 > sx0 && sy1 > sy0) alphaComposite(a, potong(b, sx0, sy0, sx1, sy1), k.dx + sx0, k.dy + sy0);
      return a;
    }
    case "thumbnail": {
      const kecil = buatGambar("RGBA", k.w, k.h, k.seed);
      const besar = ubahUkuran(kecil, k.besar[0], k.besar[1], NEAREST);
      return thumbnail(besar, k.maks[0], k.maks[1], LANCZOS);
    }
    default:
      throw new Error(`jenis kasus tak dikenal: ${k.jenis}`);
  }
}

export function ujiPrimitif(): { total: number; gagal: { jenis: string; i: number; info: string }[] } {
  const berkas = path.join(path.dirname(fileURLToPath(import.meta.url)), "emas", "outro", "primitif.json");
  const { kasus } = JSON.parse(fs.readFileSync(berkas, "utf8")) as { kasus: Kasus[] };
  const gagal: { jenis: string; i: number; info: string }[] = [];
  kasus.forEach((k, i) => {
    try {
      const im = jalankan(k);
      if (k.w2 !== undefined && (im.w !== k.w2 || im.h !== k.h2)) {
        gagal.push({ jenis: k.jenis, i, info: `ukuran ${im.w}x${im.h} != ${k.w2}x${k.h2}` });
      } else if (md5(im) !== k.md5) {
        gagal.push({ jenis: k.jenis, i, info: JSON.stringify({ ...k, md5: undefined }).slice(0, 300) });
      }
    } catch (e) {
      gagal.push({ jenis: k.jenis, i, info: `galat: ${e instanceof Error ? e.stack : e}` });
    }
  });
  return { total: kasus.length, gagal };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { total, gagal } = ujiPrimitif();
  const perJenis: Record<string, number> = {};
  for (const g of gagal) perJenis[g.jenis] = (perJenis[g.jenis] ?? 0) + 1;
  console.log(`primitif: ${total - gagal.length}/${total} identik`, perJenis);
  for (const g of gagal.slice(0, 15)) console.log(" ", g.jenis, g.i, g.info);
  process.exit(gagal.length ? 1 : 0);
}
