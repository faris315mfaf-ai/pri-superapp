// SUMBU GAYA outro (cermin bagian "SUMBU GAYA" outro.py).
//
// Tiap outro mode "biasa" memilih satu nilai di tiap sumbu, ditentukan seed
// lewat random.Random(seed) — urutan pemanggilan choice()/random() di
// pilihGaya() WAJIB sama dengan dict literal Python, karena tiap panggilan
// memajukan aliran MT19937.
import path from "node:path";
import { ASET_DIR, FONT_BUNDLED } from "../konfig";
import { AcakPython } from "./prng";

export type RGB = readonly [number, number, number];

export const KUNCI_AKUN = ["instagram", "youtube", "facebook", "tiktok", "x", "threads"] as const;
export type KunciAkun = (typeof KUNCI_AKUN)[number];

export const NAMA_TAMPIL: Record<KunciAkun, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  threads: "Threads",
  facebook: "Facebook",
  youtube: "YouTube",
};

export const WARNA_MEREK: Record<KunciAkun, RGB> = {
  instagram: [225, 48, 108],
  youtube: [255, 0, 0],
  facebook: [24, 119, 242],
  tiktok: [0, 0, 0],
  x: [0, 0, 0],
  threads: [0, 0, 0],
};

/** assets/outro (font, ikon, audio, dpp). */
export const ASET = path.join(ASET_DIR, "outro");
export const DENTING = path.join(ASET, "denting.m4a");

/** Urutan kunci = urutan dict FONT Python (tuple(FONT) dipakai undian). */
export const FONT: Record<string, string> = {
  poppins: FONT_BUNDLED,
  montserrat: path.join(ASET, "font", "Montserrat.ttf"),
  oswald: path.join(ASET, "font", "Oswald.ttf"),
  bebas: path.join(ASET, "font", "BebasNeue.ttf"),
  anton: path.join(ASET, "font", "Anton.ttf"),
  righteous: path.join(ASET, "font", "Righteous.ttf"),
  archivo: path.join(ASET, "font", "ArchivoBlack.ttf"),
};
/** Font di luar undian gaya acak (dipakai mode DPP). */
export const FONT_LAIN: Record<string, string> = {
  "poppins-regular": path.join(ASET, "font", "Poppins-Regular.ttf"),
};
export const NAMA_FONT = Object.keys(FONT);

/** colorsys.hsv_to_rgb Python. */
function hsvKeRgb(h: number, s: number, v: number): [number, number, number] {
  if (s === 0.0) return [v, v, v];
  let i = Math.trunc(h * 6.0);
  const f = h * 6.0 - i;
  const p = v * (1.0 - s);
  const q = v * (1.0 - s * f);
  const t = v * (1.0 - s * (1.0 - f));
  i = ((i % 6) + 6) % 6;
  switch (i) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

function modPy(a: number, b: number): number {
  const m = a % b;
  return m !== 0 && m < 0 !== b < 0 ? m + b : m;
}

/** _rgb(h, s, v) -> tuple int (dipotong, bukan dibulatkan). */
function rgb(h: number, s: number, v: number): RGB {
  s = Math.max(0.0, Math.min(1.0, s));
  v = Math.max(0.0, Math.min(1.0, v));
  const [r, g, b] = hsvKeRgb(modPy(h, 1.0), s, v);
  return [Math.trunc(r * 255), Math.trunc(g * 255), Math.trunc(b * 255)];
}

export type Palet = {
  nama: string;
  atas: RGB;
  bawah: RGB;
  aksen: RGB;
  aksen2: RGB;
  dekor1: RGB;
  dekor2: RGB;
  glow: RGB;
  teks: RGB;
};

function buatPalet(): Palet[] {
  const palet: Palet[] = [];
  const namaRona = [
    "merah", "jingga", "kuning", "lemon", "hijau", "zamrud", "teal", "sian",
    "biru", "laut", "nila", "ungu", "magenta", "merah-muda", "marun",
  ];
  namaRona.forEach((nama, i) => {
    const h = i / namaRona.length;
    palet.push({
      nama: `${nama} pekat`,
      atas: rgb(h, 0.55, 0.07),
      bawah: rgb(h, 0.6, 0.2),
      aksen: rgb(h, 0.85, 0.85),
      aksen2: rgb(h, 0.08, 0.96),
      dekor1: rgb(h, 0.7, 0.45),
      dekor2: rgb(h, 0.75, 0.65),
      glow: rgb(h, 0.7, 0.3),
      teks: [245, 245, 245],
    });
    const h2 = modPy(h + 0.5, 1.0);
    palet.push({
      nama: `${nama} lembut`,
      atas: [9, 9, 12],
      bawah: rgb(h, 0.35, 0.16),
      aksen: rgb(h, 0.45, 0.95),
      aksen2: rgb(h, 0.6, 0.35),
      dekor1: rgb(h2, 0.5, 0.35),
      dekor2: rgb(h, 0.4, 0.5),
      glow: rgb(h, 0.5, 0.25),
      teks: [240, 240, 240],
    });
  });
  palet.push(
    { nama: "mono putih", atas: [8, 8, 8], bawah: [26, 26, 26], aksen: [242, 242, 242], aksen2: [30, 30, 30],
      dekor1: [60, 60, 60], dekor2: [120, 120, 120], glow: [36, 36, 36], teks: [236, 236, 236] },
    { nama: "mono arang", atas: [16, 16, 18], bawah: [40, 40, 44], aksen: [70, 70, 76], aksen2: [220, 220, 225],
      dekor1: [90, 90, 96], dekor2: [140, 140, 150], glow: [50, 50, 56], teks: [240, 240, 240] },
    { nama: "emas hitam", atas: [10, 8, 4], bawah: [30, 24, 8], aksen: [214, 170, 50], aksen2: [250, 240, 210],
      dekor1: [120, 90, 20], dekor2: [200, 160, 60], glow: [60, 44, 10], teks: [250, 244, 225] },
    { nama: "perak biru", atas: [8, 12, 20], bawah: [24, 34, 52], aksen: [190, 210, 235], aksen2: [20, 30, 48],
      dekor1: [60, 84, 120], dekor2: [130, 160, 200], glow: [30, 44, 70], teks: [236, 242, 250] },
  );
  return palet;
}

export const PALET: readonly Palet[] = buatPalet();
export const LATAR = ["gradien", "sapuan", "partikel", "titik", "sinar", "gumpal", "garis-miring", "heks",
  "butir", "radial", "pita-halus", "sorot", "kotak", "bokeh"] as const;
export const DEKOR = ["gelombang-kanan", "gelombang-kiri", "pita", "cincin", "sudut", "garis", "tanpa", "bingkai",
  "segitiga", "bar", "lingkaran", "diagonal-ganda", "busur", "titik-sudut"] as const;
export const BENTUK = ["oktagon", "lingkaran", "kotak", "heksagon", "perisai", "berlian", "pil", "lencana", "bintang"] as const;
export const TATA = ["acuan", "tengah", "grid", "dua-kolom", "baris-ikon", "kiri-atas", "bawah", "kolom-kanan",
  "melingkar", "dua-baris"] as const;
export const IKON = ["warna", "mono", "garis", "lingkaran"] as const;
export const MASUK_BADGE = ["lenting", "turun", "putar", "zoom", "kiri", "kedip"] as const;
export const MASUK_HANDLE = ["kiri", "atas", "pop", "fade", "kanan", "ketik"] as const;
export const GERAK_LATAR = ["diam", "zoom", "geser"] as const;
const DURASI = [4.5, 5.0, 5.5, 6.0, 6.5] as const;

export type Gaya = Palet & {
  seed: number;
  palet: string;
  latar: (typeof LATAR)[number];
  dekor: (typeof DEKOR)[number];
  bentuk: (typeof BENTUK)[number];
  tata: (typeof TATA)[number];
  ikon: (typeof IKON)[number];
  font_badge: string;
  font_teks: string;
  masuk_badge: (typeof MASUK_BADGE)[number];
  masuk_handle: (typeof MASUK_HANDLE)[number];
  gerak_latar: (typeof GERAK_LATAR)[number];
  glow_badge: boolean;
  huruf_besar: boolean;
  miring: boolean;
  durasi: number;
  sudut_sapuan: number;
  denting_detik: number;
  acak: number;
  acak2: number;
};

const radian = (d: number) => d * (Math.PI / 180.0);

/** pilih_gaya(seed): sama seed, sama tampilan — di Python maupun di sini. */
export function pilihGaya(seed: number): Gaya {
  const rnd = new AcakPython(seed);
  const p = rnd.choice(PALET);
  // Urutan evaluasi = urutan kunci dict di outro.py.
  const latar = rnd.choice(LATAR);
  const dekor = rnd.choice(DEKOR);
  const bentuk = rnd.choice(BENTUK);
  const tata = rnd.choice(TATA);
  const ikon = rnd.choice(IKON);
  const fontBadge = rnd.choice(NAMA_FONT);
  const fontTeks = rnd.choice(NAMA_FONT);
  const masukBadge = rnd.choice(MASUK_BADGE);
  const masukHandle = rnd.choice(MASUK_HANDLE);
  const gerakLatar = rnd.choice(GERAK_LATAR);
  const glowBadge = rnd.random() < 0.5;
  const hurufBesar = rnd.random() < 0.55;
  const miring = rnd.random() < 0.3;
  const durasi = rnd.choice(DURASI);
  const sudutSapuan = rnd.uniform(radian(18), radian(62));
  const acak = rnd.random();
  const acak2 = rnd.random();
  return {
    seed,
    ...p,
    palet: p.nama,
    latar,
    dekor,
    bentuk,
    tata,
    ikon,
    font_badge: fontBadge,
    font_teks: fontTeks,
    masuk_badge: masukBadge,
    masuk_handle: masukHandle,
    gerak_latar: gerakLatar,
    glow_badge: glowBadge,
    huruf_besar: hurufBesar,
    miring,
    durasi,
    sudut_sapuan: sudutSapuan,
    denting_detik: 1.9,
    acak,
    acak2,
  };
}

export function ringkasGaya(g: Gaya): string {
  return (
    `palet ${g.palet} · latar ${g.latar} · dekor ${g.dekor} · badge ${g.bentuk} · ` +
    `tata ${g.tata} · ikon ${g.ikon} · font ${g.font_badge}/${g.font_teks} · ` +
    `masuk ${g.masuk_badge}/${g.masuk_handle}`
  );
}
