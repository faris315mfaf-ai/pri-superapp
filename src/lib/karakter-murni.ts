// ============================================================
// KARAKTER SAYA (16 Okt 2026) — logika murni: katalog, validasi, rupa bawaan,
// preset, dan gerbang akun. Aman server & klien.
//
// Rupa dirakit dari aset pixel art di public/karakter/v1 (alat/sprite/potong-karakter.mjs):
// badan (diam/jalan/duduk/kerja, 4 arah) + atasan (pose diam) + rambut, lalu
// kulit / rambut / pakaian diwarnai ulang di klien. Yang disimpan hanya
// konfigurasi kecil ini (tabel karakter_pengguna, sql/78), bukan gambar.
//
// Tahap 1 dibuka bertahap: mula-mula hanya akun uji coba Faris (#4, #176).
// ============================================================

export const VERSI_KONFIG = 1;

/** Akun yang sudah boleh memilih karakter (uji coba bertahap). */
const AKUN_UJI_KARAKTER = new Set(["4", "176"]);

export function bolehKarakterSaya(u: { id?: string | number | null } | null | undefined): boolean {
  return u?.id != null && AKUN_UJI_KARAKTER.has(String(u.id));
}

export type Warna = readonly [hex: string, nama: string];

/** 8 warna kulit kit TV Rakyat (asset_catalog_planned.json, skin_01..08). */
export const KULIT: readonly Warna[] = [
  ["#F6D3BE", "Porselen"], ["#E9B99B", "Terang"], ["#DAA17C", "Kuning langsat"], ["#C88763", "Sawo matang"],
  ["#B87552", "Sawo"], ["#95583E", "Cokelat"], ["#78412F", "Gelap"], ["#543124", "Sangat gelap"],
];

/** 12 warna rambut kit (hair_color_01..12). Dipakai juga untuk warna hijab. */
export const WARNA_RAMBUT: readonly Warna[] = [
  ["#24252B", "Hitam"], ["#443129", "Cokelat tua"], ["#784832", "Cokelat"], ["#B27349", "Karamel"],
  ["#D7AD71", "Pirang"], ["#BABCBD", "Perak"], ["#9E382F", "Merah bata"], ["#BF6B6F", "Merah muda"],
  ["#334F80", "Biru"], ["#48755C", "Hijau"], ["#764C80", "Ungu"], ["#DCCBB4", "Krem"],
];

export const WARNA_ATASAN: readonly Warna[] = [
  ["#ECE8DE", "Putih"], ["#2C2F3A", "Hitam"], ["#8D95A3", "Abu"], ["#2F3F6B", "Navy"],
  ["#3B82C4", "Biru"], ["#DC2626", "Merah"], ["#8A2A3A", "Marun"], ["#3F7F5A", "Hijau"],
  ["#6B7A3A", "Zaitun"], ["#8A5A3A", "Cokelat"], ["#D9C3A0", "Krem"], ["#E5B423", "Kuning"],
];

export const WARNA_CELANA: readonly Warna[] = [
  ["#3A4A78", "Denim"], ["#6F8FB8", "Denim muda"], ["#2C2F3A", "Hitam"], ["#6B7280", "Abu"],
  ["#B59B6E", "Khaki"], ["#6B4A32", "Cokelat"], ["#2F3F6B", "Navy"], ["#5B6A3A", "Zaitun"], ["#D9C3A0", "Krem"],
];

export const WARNA_SEPATU: readonly Warna[] = [
  ["#F2F0EA", "Putih"], ["#22222A", "Hitam"], ["#C2302F", "Merah"], ["#3B6FB0", "Biru"], ["#7A4E2E", "Cokelat"], ["#3F7F5A", "Hijau"],
];

/** Gaya rambut sesuai urutan baris lembar sumber (rambut_01..20). 0 = tanpa rambut. */
export const GAYA_RAMBUT: readonly string[] = [
  "Tanpa rambut",
  "Cepak", "Pendek rapi", "Pendek acak", "Belah samping", "Poni samping",
  "Jabrik", "Jabrik tebal", "Mangkuk", "Poni miring", "Berlapis",
  "Keriting", "Bob berponi", "Bob", "Bob samping", "Panjang lurus",
  "Panjang berlapis", "Kuncir dua", "Sanggul", "Hijab", "Hijab panjang",
];

/** Model atasan sesuai baris lembar sumber (atasan_01..09). 0 = kaus dasar dari lembar badan. */
export const MODEL_ATASAN: readonly string[] = [
  "Kaus dasar", "Kaus", "Polo", "Kemeja", "Hoodie", "Jaket", "Flanel", "Blazer", "Rompi rajut", "Kaus raglan",
];

export const JUMLAH_RAMBUT = GAYA_RAMBUT.length - 1;
export const JUMLAH_ATASAN = MODEL_ATASAN.length - 1;

export type KonfigKarakter = {
  v: typeof VERSI_KONFIG;
  kulit: string;
  /** 0 = tanpa rambut, 1..JUMLAH_RAMBUT. */
  rambut: number;
  warnaRambut: string;
  /** 0 = kaus dasar, 1..JUMLAH_ATASAN (gambar atasan hanya pose diam). */
  atasan: number;
  warnaAtasan: string;
  warnaCelana: string;
  warnaSepatu: string;
};

const adaDi = (daftar: readonly Warna[], hex: unknown): hex is string =>
  typeof hex === "string" && daftar.some(([h]) => h.toLowerCase() === hex.toLowerCase());
const kanonik = (daftar: readonly Warna[], hex: string): string => daftar.find(([h]) => h.toLowerCase() === hex.toLowerCase())![0];
const bulatDalam = (x: unknown, min: number, max: number): x is number => typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;

export type HasilValidasi = { ok: true; konfig: KonfigKarakter } | { ok: false; pesan: string };

/** Validasi ketat masukan klien: tiap pilihan harus ada di katalog. */
export function validasiKonfig(x: unknown): HasilValidasi {
  if (!x || typeof x !== "object") return { ok: false, pesan: "Data karakter tidak valid." };
  const k = x as Record<string, unknown>;
  if (!adaDi(KULIT, k.kulit)) return { ok: false, pesan: "Warna kulit tidak dikenal." };
  if (!bulatDalam(k.rambut, 0, JUMLAH_RAMBUT)) return { ok: false, pesan: "Gaya rambut tidak dikenal." };
  if (!adaDi(WARNA_RAMBUT, k.warnaRambut)) return { ok: false, pesan: "Warna rambut tidak dikenal." };
  if (!bulatDalam(k.atasan, 0, JUMLAH_ATASAN)) return { ok: false, pesan: "Model atasan tidak dikenal." };
  if (!adaDi(WARNA_ATASAN, k.warnaAtasan)) return { ok: false, pesan: "Warna atasan tidak dikenal." };
  if (!adaDi(WARNA_CELANA, k.warnaCelana)) return { ok: false, pesan: "Warna celana tidak dikenal." };
  if (!adaDi(WARNA_SEPATU, k.warnaSepatu)) return { ok: false, pesan: "Warna sepatu tidak dikenal." };
  return {
    ok: true,
    konfig: {
      v: VERSI_KONFIG,
      kulit: kanonik(KULIT, k.kulit),
      rambut: k.rambut,
      warnaRambut: kanonik(WARNA_RAMBUT, k.warnaRambut),
      atasan: k.atasan,
      warnaAtasan: kanonik(WARNA_ATASAN, k.warnaAtasan),
      warnaCelana: kanonik(WARNA_CELANA, k.warnaCelana),
      warnaSepatu: kanonik(WARNA_SEPATU, k.warnaSepatu),
    },
  };
}

/** Baca konfig tersimpan dengan toleran: nilai rusak/usang → null (dipakai rupa bawaan). */
export function bacaKonfig(x: unknown): KonfigKarakter | null {
  const h = validasiKonfig(x);
  return h.ok ? h.konfig : null;
}

/** Rupa bawaan yang stabil per akun (sebelum pengguna memilih sendiri). */
export function konfigBawaan(userId: number | string): KonfigKarakter {
  let n = Math.abs(Math.trunc(Number(userId) || 0)) * 2654435761;
  const ambil = <T,>(d: readonly T[]): T => {
    n = (n ^ (n >>> 15)) * 2246822519;
    n = (n ^ (n >>> 13)) >>> 0;
    return d[n % d.length]!;
  };
  const rambutBiasa = [1, 2, 3, 4, 5, 6, 8, 9, 12, 13, 15];
  return {
    v: VERSI_KONFIG,
    kulit: ambil(KULIT)[0],
    rambut: ambil(rambutBiasa),
    warnaRambut: ambil(WARNA_RAMBUT.slice(0, 5))[0],
    atasan: 0,
    warnaAtasan: ambil(WARNA_ATASAN)[0],
    warnaCelana: ambil(WARNA_CELANA)[0],
    warnaSepatu: ambil(WARNA_SEPATU)[0],
  };
}

export type PresetKarakter = { id: string; nama: string; konfig: KonfigKarakter };

const pr = (id: string, nama: string, k: Omit<KonfigKarakter, "v">): PresetKarakter => ({ id, nama, konfig: { v: VERSI_KONFIG, ...k } });

export const PRESET: readonly PresetKarakter[] = [
  pr("kreator", "Kreator", { kulit: "#C88763", rambut: 3, warnaRambut: "#24252B", atasan: 4, warnaAtasan: "#ECE8DE", warnaCelana: "#3A4A78", warnaSepatu: "#F2F0EA" }),
  pr("reporter", "Reporter lapangan", { kulit: "#DAA17C", rambut: 4, warnaRambut: "#443129", atasan: 3, warnaAtasan: "#3B82C4", warnaCelana: "#2C2F3A", warnaSepatu: "#22222A" }),
  pr("editor", "Editor malam", { kulit: "#E9B99B", rambut: 13, warnaRambut: "#24252B", atasan: 4, warnaAtasan: "#2C2F3A", warnaCelana: "#2C2F3A", warnaSepatu: "#22222A" }),
  pr("kameramen", "Kameramen", { kulit: "#95583E", rambut: 1, warnaRambut: "#24252B", atasan: 8, warnaAtasan: "#6B7A3A", warnaCelana: "#B59B6E", warnaSepatu: "#7A4E2E" }),
  pr("pimred", "Pimred", { kulit: "#B87552", rambut: 2, warnaRambut: "#BABCBD", atasan: 7, warnaAtasan: "#2F3F6B", warnaCelana: "#2F3F6B", warnaSepatu: "#22222A" }),
  pr("relawan", "Relawan TV Rakyat", { kulit: "#C88763", rambut: 19, warnaRambut: "#DCCBB4", atasan: 0, warnaAtasan: "#DC2626", warnaCelana: "#2C2F3A", warnaSepatu: "#F2F0EA" }),
  pr("desainer", "Desainer", { kulit: "#F6D3BE", rambut: 17, warnaRambut: "#9E382F", atasan: 6, warnaAtasan: "#DC2626", warnaCelana: "#6F8FB8", warnaSepatu: "#C2302F" }),
  pr("mahasiswa", "Mahasiswa", { kulit: "#78412F", rambut: 11, warnaRambut: "#24252B", atasan: 5, warnaAtasan: "#3F7F5A", warnaCelana: "#B59B6E", warnaSepatu: "#7A4E2E" }),
];

export function samaKonfig(a: KonfigKarakter | null | undefined, b: KonfigKarakter | null | undefined): boolean {
  if (!a || !b) return false;
  return a.kulit === b.kulit && a.rambut === b.rambut && a.warnaRambut === b.warnaRambut && a.atasan === b.atasan
    && a.warnaAtasan === b.warnaAtasan && a.warnaCelana === b.warnaCelana && a.warnaSepatu === b.warnaSepatu;
}

const urut = (daftar: readonly Warna[], hex: string) => String(daftar.findIndex(([h]) => h === hex) + 1).padStart(2, "0");

/** Bentuk characterConfig kit TV Rakyat (untuk renderer atlas tahap berikutnya). */
export function keKonfigKit(k: KonfigKarakter, userId: number | string) {
  return {
    schemaVersion: 1,
    characterId: `user_${userId}`,
    bodyType: "regular",
    skinTone: `skin_${urut(KULIT, k.kulit)}`,
    hairStyle: k.rambut ? `hair_${String(k.rambut).padStart(2, "0")}` : null,
    hairColor: `hair_color_${urut(WARNA_RAMBUT, k.warnaRambut)}`,
    top: `top_${String(k.atasan).padStart(2, "0")}`,
    topColor: k.warnaAtasan,
    bottomColor: k.warnaCelana,
    shoesColor: k.warnaSepatu,
    accessories: [] as string[],
  };
}

// ---------- rupa bot lama → sprite (dunia v2) ----------

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Warna palet terdekat (jarak RGB berbobot persepsi). */
export function warnaTerdekat(daftar: readonly Warna[], hex: string): string {
  const [r, g, b] = rgb(hex);
  let terbaik = daftar[0]![0];
  let jarak = Infinity;
  for (const [h] of daftar) {
    const [r2, g2, b2] = rgb(h);
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (d < jarak) { jarak = d; terbaik = h; }
  }
  return terbaik;
}

/** Rupa bot (bot_redaksi.rupa, digambar kode) → konfigurasi sprite dunia v2. */
export function konfigDariRupaBot(r: { kaus: string; celana: string; kulit: string; rambut: string; gayaRambut: "pendek" | "panjang" | "topi"; berhud?: boolean }): KonfigKarakter {
  return {
    v: VERSI_KONFIG,
    kulit: warnaTerdekat(KULIT, r.kulit),
    rambut: r.gayaRambut === "panjang" ? 15 : r.gayaRambut === "topi" ? 1 : 2,
    warnaRambut: warnaTerdekat(WARNA_RAMBUT, r.rambut),
    atasan: r.berhud ? 4 : 1,
    warnaAtasan: warnaTerdekat(WARNA_ATASAN, r.kaus),
    warnaCelana: warnaTerdekat(WARNA_CELANA, r.celana),
    warnaSepatu: "#22222A",
  };
}

/** Rupa Nara (koordinator) di dunia v2: blazer navy, rambut bob hitam. */
export const KONFIG_NARA: KonfigKarakter = { v: VERSI_KONFIG, kulit: "#DAA17C", rambut: 13, warnaRambut: "#24252B", atasan: 7, warnaAtasan: "#2F3F6B", warnaCelana: "#2C2F3A", warnaSepatu: "#22222A" };

/** Batas simpan per akun (anti spam tulis). */
export const BATAS_SIMPAN = 30;
export const JENDELA_SIMPAN_DETIK = 3600;
