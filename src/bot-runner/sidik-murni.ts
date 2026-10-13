// BOT REDAKSI 3F tahap B — SIDIK VISUAL video (13 Okt 2026). MURNI: tanpa jaringan/berkas.
//
// Tujuan: mengenali "rekaman yang sama" walau URL, akun, kompresi, resolusi, atau logo berbeda.
// Cara: tiap video diwakili deretan hash perseptual 64-bit (dHash 9x8 abu-abu) dari bingkai tiap detik,
// setelah tepinya dipotong (logo/teks biasanya di tepi). Dua video dibandingkan lewat jarak Hamming per
// bingkai, boleh bergeser waktu (dipotong mulai di detik berbeda) dan dicoba versi CERMIN.
//
// Dipakai runner (menghitung dari bingkai mentah) dan aplikasi (membandingkan). Nilai ambang adalah
// TEBAKAN AWAL konservatif — dikalibrasi dengan himpunan uji berlabel (docs/BOT-REDAKSI-ASAL-VIDEO.md §8).

export const LEBAR_BINGKAI = 9;
export const TINGGI_BINGKAI = 8;
export const BYTE_PER_BINGKAI = LEBAR_BINGKAI * TINGGI_BINGKAI; // 72 piksel abu-abu
export const MAKS_BINGKAI = 24;
export const MIN_BINGKAI = 6;

/** Satu bingkai dipecah jadi dua bilangan 32-bit (cepat dibandingkan, tanpa BigInt). */
export type Hash = readonly [number, number];

const POLA_HASH = /^[0-9a-f]{16}$/;

/** dHash dari satu bingkai 9x8 abu-abu: tiap baris 8 bit (piksel kiri > kanan). Hasil 16 heks. */
export function dHashBingkai(piksel: Uint8Array, mulai = 0): string {
  let hasil = "";
  for (let y = 0; y < TINGGI_BINGKAI; y++) {
    let b = 0;
    for (let x = 0; x < LEBAR_BINGKAI - 1; x++) {
      const kiri = piksel[mulai + y * LEBAR_BINGKAI + x];
      const kanan = piksel[mulai + y * LEBAR_BINGKAI + x + 1];
      b = (b << 1) | (kiri > kanan ? 1 : 0);
    }
    hasil += b.toString(16).padStart(2, "0");
  }
  return hasil;
}

/** Keluaran ffmpeg rawvideo (bingkai 72 byte berturut-turut) → deretan hash (maks MAKS_BINGKAI). */
export function sidikDariRaw(raw: Uint8Array): string[] {
  const n = Math.min(MAKS_BINGKAI, Math.floor(raw.length / BYTE_PER_BINGKAI));
  const hasil: string[] = [];
  for (let i = 0; i < n; i++) hasil.push(dHashBingkai(raw, i * BYTE_PER_BINGKAI));
  return hasil;
}

export function hashSah(x: unknown): x is string {
  return typeof x === "string" && POLA_HASH.test(x);
}

/** Validasi larik hash dari runner: 6..24 hash heks 16 karakter. */
export function validasiSidik(x: unknown): string[] | null {
  if (!Array.isArray(x) || x.length < MIN_BINGKAI || x.length > MAKS_BINGKAI) return null;
  for (const h of x) if (!hashSah(h)) return null;
  return x as string[];
}

function urai(h: string): Hash {
  return [parseInt(h.slice(0, 8), 16) >>> 0, parseInt(h.slice(8, 16), 16) >>> 0];
}

function popcount(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function jarak(a: Hash, b: Hash): number {
  return popcount((a[0] ^ b[0]) >>> 0) + popcount((a[1] ^ b[1]) >>> 0);
}

function balikBit8(b: number): number {
  let r = 0;
  for (let i = 0; i < 8; i++) r |= ((b >> i) & 1) << (7 - i);
  return r;
}

/**
 * Hash versi CERMIN horizontal: tiap baris dibalik urutannya dan setiap bit dibalik maknanya
 * (kiri>kanan menjadi kanan>kiri). Pendekatan: bingkai berpiksel sama-persis (seri) tidak dibahas.
 */
export function cerminkan(h: string): string {
  let hasil = "";
  for (let i = 0; i < 16; i += 2) {
    const b = parseInt(h.slice(i, i + 2), 16);
    hasil += (~balikBit8(b) & 0xff).toString(16).padStart(2, "0");
  }
  return hasil;
}

/** Ambang jarak Hamming (dari 64 bit) agar dua bingkai dianggap sama. */
export const AMBANG_JARAK = 10;
/** Geseran waktu maksimal (bingkai ≈ detik) yang dicoba. */
export const MAKS_GESER = 8;
/** Tumpang-tindih minimal (bingkai) agar perbandingan dipercaya. */
export const MIN_TUMPANG = 6;
/** Sidik dengan terlalu sedikit bingkai berbeda (layar hitam/diam) tidak informatif. */
export const MIN_KERAGAMAN = 0.3;

/** Porsi bingkai yang berbeda satu sama lain (0..1). Video statis/hitam ≈ rendah. */
export function keragaman(sidik: readonly string[]): number {
  if (sidik.length === 0) return 0;
  const unik = new Set<string>();
  const h = sidik.map(urai);
  for (const x of h) {
    // Bingkai "sama" bila jaraknya kecil terhadap yang sudah dihitung unik.
    let mirip = false;
    for (const u of unik) {
      if (jarak(urai(u), x) <= 3) {
        mirip = true;
        break;
      }
    }
    if (!mirip) unik.add(heks(x));
  }
  return unik.size / sidik.length;
}

function heks(h: Hash): string {
  return h[0].toString(16).padStart(8, "0") + h[1].toString(16).padStart(8, "0");
}

export const sidikInformatif = (sidik: readonly string[]): boolean => sidik.length >= MIN_BINGKAI && keragaman(sidik) >= MIN_KERAGAMAN;

export type HasilBanding = {
  /** Porsi bingkai yang cocok pada geseran terbaik (0..1); 0 bila tak bisa dibandingkan. */
  skor: number;
  /** Geseran terbaik (bingkai): positif = b dimulai lebih lambat dari a. */
  geser: number;
  cermin: boolean;
  tumpang: number;
};

const TAK_BISA: HasilBanding = { skor: 0, geser: 0, cermin: false, tumpang: 0 };

function bandingSatuArah(a: readonly Hash[], b: readonly Hash[]): HasilBanding {
  let terbaik: HasilBanding = TAK_BISA;
  for (let s = -MAKS_GESER; s <= MAKS_GESER; s++) {
    let cocok = 0;
    let tumpang = 0;
    for (let i = 0; i < a.length; i++) {
      const j = i + s;
      if (j < 0 || j >= b.length) continue;
      tumpang++;
      if (jarak(a[i], b[j]) <= AMBANG_JARAK) cocok++;
    }
    if (tumpang < MIN_TUMPANG) continue;
    const skor = cocok / tumpang;
    // Utamakan skor tertinggi; bila sama, tumpang-tindih lebih panjang (lebih dipercaya).
    if (skor > terbaik.skor || (skor === terbaik.skor && tumpang > terbaik.tumpang)) terbaik = { skor, geser: s, cermin: false, tumpang };
  }
  return terbaik;
}

/**
 * Bandingkan dua sidik. Sidik yang tidak informatif (hitam/diam) atau terlalu pendek → skor 0
 * (TIDAK dianggap sama; mencegah salah-cocok antar-layar hitam).
 */
export function bandingkanSidik(a: readonly string[], b: readonly string[]): HasilBanding {
  if (!sidikInformatif(a) || !sidikInformatif(b)) return TAK_BISA;
  const ha = a.map(urai);
  const hb = b.map(urai);
  const lurus = bandingSatuArah(ha, hb);
  const cermin = bandingSatuArah(ha, b.map((h) => urai(cerminkan(h))));
  return cermin.skor > lurus.skor ? { ...cermin, cermin: true } : lurus;
}

export type PutusanSidik = "sama" | "mungkin" | "beda";
export const AMBANG_SAMA = 0.8;
export const AMBANG_MUNGKIN = 0.5;

export function putusanSidik(skor: number): PutusanSidik {
  if (skor >= AMBANG_SAMA) return "sama";
  if (skor >= AMBANG_MUNGKIN) return "mungkin";
  return "beda";
}

export type KembaranTerbaik<T> = { id: T; hasil: HasilBanding; putusan: PutusanSidik };

/** Calon dengan skor tertinggi di antara `kumpulan` (kecuali `kecualiId`), atau null bila tak ada yang ≥ "mungkin". */
export function cariKembaran<T>(sidik: readonly string[], kumpulan: readonly { id: T; sidik: readonly string[] }[], kecualiId?: T): KembaranTerbaik<T> | null {
  let terbaik: KembaranTerbaik<T> | null = null;
  for (const k of kumpulan) {
    if (kecualiId !== undefined && k.id === kecualiId) continue;
    const hasil = bandingkanSidik(sidik, k.sidik);
    const putusan = putusanSidik(hasil.skor);
    if (putusan === "beda") continue;
    if (!terbaik || hasil.skor > terbaik.hasil.skor) terbaik = { id: k.id, hasil, putusan };
  }
  return terbaik;
}
