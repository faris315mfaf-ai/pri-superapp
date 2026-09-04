// ============================================================
// KATALOG PET v5 (5 Sep 2026) — MODULAR & BERKATEGORI.
//
// • Aksesoris dibagi 4 KATEGORI (kepala, tangan, tubuh, kaki). Tiap kategori
//   memetakan ke slot RobotSvg: satu item per slot, item baru yang dipasang
//   otomatis menggantikan yang lama (modular).
// • Slot baru "kaki" (33 item), tangan +26, kepala +5, 30 JAKET PRI / TV
//   Rakyat (putih & merah), dan 50 ITEM LANGKA (`langka: true`) yang hanya
//   bisa didapat saat master membuka event-nya (Panel Master → Toko Pet).
// • 3 hewan robot baru (kelinci, gajah, kangguru) + 5 skin per hewan.
//
// Berkas ini hanya DATA (tanpa React) supaya bisa diuji di Node dan dipakai
// server maupun klien. Kode item TIDAK boleh diubah (tersimpan di DB).
// Gambar tiap keluarga ada di features/pet/robot-aksesoris-v5.tsx.
// ============================================================

import type { Aksesoris, JenisHewan, SlotAksesoris } from "./pet";

// ------------------------------------------------------------
// Kategori aksesoris
// ------------------------------------------------------------
export type KategoriAksesoris = "kepala" | "tangan" | "tubuh" | "kaki";

export const KATEGORI_SLOT: Record<KategoriAksesoris, readonly SlotAksesoris[]> = {
  kepala: ["kepala", "mata"],
  tangan: ["tangan"],
  tubuh: ["badan", "leher", "punggung", "aura"],
  kaki: ["kaki"],
};

export const KATEGORI_LABEL: Record<KategoriAksesoris, string> = {
  kepala: "Kepala",
  tangan: "Tangan",
  tubuh: "Tubuh",
  kaki: "Kaki",
};

export const KATEGORI_URUT: readonly KategoriAksesoris[] = ["kepala", "tangan", "tubuh", "kaki"];

export function kategoriDariSlot(slot: SlotAksesoris): KategoriAksesoris {
  for (const k of KATEGORI_URUT) if (KATEGORI_SLOT[k].includes(slot)) return k;
  return "tubuh";
}

// ------------------------------------------------------------
// Pembangkit keluarga item (satu gambar, banyak warna)
// ------------------------------------------------------------
type Warna = readonly [nama: string, hex: string];

const MERAH: Warna = ["Merah", "#DC2626"];
const PUTIH: Warna = ["Putih", "#F8FAFC"];
const HITAM: Warna = ["Hitam", "#1F2937"];
const BIRU: Warna = ["Biru", "#2563EB"];
const HIJAU: Warna = ["Hijau", "#16A34A"];
const KUNING: Warna = ["Kuning", "#F59E0B"];
const UNGU: Warna = ["Ungu", "#7C3AED"];
const PINK: Warna = ["Pink", "#EC4899"];
const ORANYE: Warna = ["Oranye", "#F97316"];
const COKLAT: Warna = ["Coklat", "#92400E"];
const EMAS: Warna = ["Emas", "#EAB308"];
const PERAK: Warna = ["Perak", "#9CA3AF"];
const CYAN: Warna = ["Cyan", "#06B6D4"];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function keluarga(o: {
  awalan: string;
  nama: string;
  slot: SlotAksesoris;
  gambar: string;
  harga: number;
  keterangan: string;
  warna: readonly Warna[];
  langka?: boolean;
}): Aksesoris[] {
  return o.warna.map(([namaWarna, hex]) => ({
    kode: `${o.awalan}_${slug(namaWarna)}`,
    nama: `${o.nama} ${namaWarna}`,
    slot: o.slot,
    harga: o.harga,
    keterangan: o.keterangan,
    gambar: o.gambar,
    warna: hex,
    ...(o.langka ? { langka: true } : {}),
  }));
}

// ------------------------------------------------------------
// KAKI — 33 item (slot baru)
// ------------------------------------------------------------
const KAKI: Aksesoris[] = [
  ...keluarga({
    awalan: "sepatukets",
    nama: "Sepatu Kets",
    slot: "kaki",
    gambar: "kets",
    harga: 45,
    keterangan: "Sneaker klasik bertali, nyaman dipakai keliling beranda.",
    warna: [MERAH, PUTIH, HITAM, BIRU, HIJAU, KUNING, UNGU, PINK],
  }),
  ...keluarga({
    awalan: "sepatubot",
    nama: "Sepatu Bot",
    slot: "kaki",
    gambar: "bot",
    harga: 60,
    keterangan: "Bot tinggi bersol tebal, siap medan berat.",
    warna: [HITAM, COKLAT, MERAH, BIRU, PUTIH],
  }),
  ...keluarga({
    awalan: "sandal",
    nama: "Sandal Jepit",
    slot: "kaki",
    gambar: "sandal",
    harga: 30,
    keterangan: "Santai ala pantai — robot pun butuh liburan.",
    warna: [BIRU, HIJAU, KUNING, PINK],
  }),
  ...keluarga({
    awalan: "kauskaki",
    nama: "Kaus Kaki",
    slot: "kaki",
    gambar: "kauskaki",
    harga: 25,
    keterangan: "Kaus kaki tinggi bergaris, hangat dan rapi.",
    warna: [MERAH, PUTIH, BIRU, HIJAU],
  }),
  ...keluarga({
    awalan: "sepatuled",
    nama: "Sepatu LED",
    slot: "kaki",
    gambar: "sepatuled",
    harga: 90,
    keterangan: "Sol menyala berkedip tiap melangkah.",
    warna: [BIRU, PINK, HIJAU],
  }),
  ...keluarga({
    awalan: "sepaturoda",
    nama: "Sepatu Roda",
    slot: "kaki",
    gambar: "sepaturoda",
    harga: 85,
    keterangan: "Empat roda kecil, meluncur mulus.",
    warna: [MERAH, BIRU, HITAM],
  }),
  ...keluarga({
    awalan: "pelindunglutut",
    nama: "Pelindung Lutut",
    slot: "kaki",
    gambar: "pelindunglutut",
    harga: 40,
    keterangan: "Bantalan lutut sporty, aman saat jatuh.",
    warna: [HITAM, MERAH, BIRU],
  }),
  ...keluarga({
    awalan: "sepaturoket",
    nama: "Sepatu Roket",
    slot: "kaki",
    gambar: "sepaturoket",
    harga: 120,
    keterangan: "Pendorong mini di tumit — melayang sejenak.",
    warna: [MERAH, BIRU, EMAS],
  }),
];

// ------------------------------------------------------------
// TANGAN — +26 item (total 33 bersama 7 item lama)
// ------------------------------------------------------------
const TANGAN: Aksesoris[] = [
  ...keluarga({
    awalan: "sarungtangan",
    nama: "Sarung Tangan",
    slot: "tangan",
    gambar: "sarungtangan",
    harga: 35,
    keterangan: "Sarung tangan rajut, sepasang.",
    warna: [MERAH, PUTIH, HITAM, BIRU, HIJAU, KUNING, UNGU, PINK],
  }),
  ...keluarga({
    awalan: "gelang",
    nama: "Gelang",
    slot: "tangan",
    gambar: "gelang",
    harga: 30,
    keterangan: "Gelang logam berkilau di pergelangan.",
    warna: [EMAS, PERAK, MERAH, BIRU, UNGU],
  }),
  ...keluarga({
    awalan: "jamtangan",
    nama: "Jam Tangan",
    slot: "tangan",
    gambar: "jamtangan",
    harga: 55,
    keterangan: "Jam digital, selalu tepat waktu (WIB).",
    warna: [HITAM, MERAH, BIRU, EMAS],
  }),
  ...keluarga({
    awalan: "tameng",
    nama: "Tameng",
    slot: "tangan",
    gambar: "tameng",
    harga: 95,
    keterangan: "Perisai bulat berlambang bintang.",
    warna: [MERAH, BIRU, HIJAU],
  }),
  ...keluarga({
    awalan: "pedangled",
    nama: "Pedang LED",
    slot: "tangan",
    gambar: "pedangled",
    harga: 110,
    keterangan: "Bilah cahaya berdengung pelan.",
    warna: [BIRU, MERAH, UNGU],
  }),
  {
    kode: "bola_sepak",
    nama: "Bola Sepak",
    slot: "tangan",
    harga: 40,
    keterangan: "Bola hitam-putih klasik, siap ditendang.",
    gambar: "bolasepak",
    warna: "#F8FAFC",
  },
  {
    kode: "bola_basket",
    nama: "Bola Basket",
    slot: "tangan",
    harga: 40,
    keterangan: "Bola oranye bergaris, siap dunk.",
    gambar: "bolabasket",
    warna: "#F97316",
  },
  {
    kode: "raket_tenis",
    nama: "Raket Tenis",
    slot: "tangan",
    harga: 50,
    keterangan: "Raket bersenar rapat, servis kencang.",
    gambar: "raket",
    warna: "#16A34A",
  },
];

// ------------------------------------------------------------
// KEPALA — +5 item (total 34 bersama 29 item lama)
// ------------------------------------------------------------
const KEPALA: Aksesoris[] = [
  ...keluarga({
    awalan: "helm",
    nama: "Helm",
    slot: "kepala",
    gambar: "helm",
    harga: 70,
    keterangan: "Helm motor mengilap dengan visor bening.",
    warna: [MERAH, BIRU, HITAM],
  }),
  ...keluarga({
    awalan: "mahkotabunga",
    nama: "Mahkota Bunga",
    slot: "kepala",
    gambar: "mahkotabunga",
    harga: 60,
    keterangan: "Rangkaian bunga segar melingkar di kepala.",
    warna: [PINK, KUNING],
  }),
];

// ------------------------------------------------------------
// JAKET PRI & TV RAKYAT — 30 item (slot badan)
// ------------------------------------------------------------
const GAYA_JAKET: readonly [kode: string, nama: string, keterangan: string][] = [
  ["bomber", "Jaket Bomber", "Kerah rib dan ritsleting depan."],
  ["hoodie", "Hoodie", "Bertudung dengan tali serut."],
  ["varsity", "Jaket Varsity", "Lengan kontras gaya kampus."],
  ["parka", "Parka", "Kerah bulu tebal, tahan angin."],
  ["windbreaker", "Windbreaker", "Tipis ringan bergaris sporty."],
  ["blazer", "Blazer", "Kerah lapel rapi untuk acara resmi."],
  ["denim", "Jaket Denim", "Bahan jins dengan kantong dada."],
];
const TEKS_JAKET: readonly [kode: string, label: string, nama: string][] = [
  ["pri", "PRI", "PRI"],
  ["tvr", "TV Rakyat", "TV Rakyat"],
];
const WARNA_JAKET: readonly Warna[] = [PUTIH, MERAH];

const JAKET: Aksesoris[] = [
  ...GAYA_JAKET.flatMap(([gaya, namaGaya, ket]) =>
    TEKS_JAKET.flatMap(([kTeks, label, namaTeks]) =>
      WARNA_JAKET.map(([namaWarna, hex]): Aksesoris => ({
        kode: `jaket_${gaya}_${kTeks}_${slug(namaWarna)}`,
        nama: `${namaGaya} ${namaTeks} ${namaWarna}`,
        slot: "badan",
        harga: namaWarna === "Merah" ? 120 : 110,
        keterangan: `${ket} Bertuliskan "${label}" di dada.`,
        gambar: `jaket_${gaya}`,
        warna: hex,
        label,
      })),
    ),
  ),
  {
    kode: "jaket_kapten_pri_merah",
    nama: "Jaket Kapten PRI Merah",
    slot: "badan",
    harga: 200,
    keterangan: 'Epolet emas dan lencana dada. Bertuliskan "PRI".',
    gambar: "jaket_kapten",
    warna: "#DC2626",
    label: "PRI",
  },
  {
    kode: "jaket_kapten_tvr_putih",
    nama: "Jaket Kapten TV Rakyat Putih",
    slot: "badan",
    harga: 200,
    keterangan: 'Epolet emas dan lencana dada. Bertuliskan "TV Rakyat".',
    gambar: "jaket_kapten",
    warna: "#F8FAFC",
    label: "TV Rakyat",
  },
];

// ------------------------------------------------------------
// LANGKA — 50 item (hanya saat event yang dibuka master)
// ------------------------------------------------------------
const API: Warna = ["Api", "#F97316"];
const ES: Warna = ["Es", "#67E8F9"];
const PETIR: Warna = ["Petir", "#FDE047"];
const BAYANGAN: Warna = ["Bayangan", "#6D28D9"];
const RUBI: Warna = ["Rubi", "#E11D48"];
const SAFIR: Warna = ["Safir", "#2563EB"];
const ZAMRUD: Warna = ["Zamrud", "#10B981"];
const BERLIAN: Warna = ["Berlian", "#E0F2FE"];
const NAGA: Warna = ["Naga", "#DC2626"];
const GALAKSI: Warna = ["Galaksi", "#8B5CF6"];
const SURGA: Warna = ["Surga", "#FDE68A"];
const ROSE: Warna = ["Rose Gold", "#F9A8D4"];

const LANGKA: Aksesoris[] = [
  ...keluarga({ awalan: "langka_sayapapi", nama: "Sayap Elemen", slot: "punggung", gambar: "sayapapi", harga: 900, langka: true, keterangan: "Sayap raksasa berkobar dari elemen murni, mengepak pelan.", warna: [API, ES, PETIR, BAYANGAN] }),
  ...keluarga({ awalan: "langka_mahkotapermata", nama: "Mahkota Permata", slot: "kepala", gambar: "mahkotapermata", harga: 800, langka: true, keterangan: "Mahkota emas bertahtakan permata besar yang berkilau.", warna: [RUBI, SAFIR, ZAMRUD, BERLIAN] }),
  ...keluarga({ awalan: "langka_aura", nama: "Aura Legenda", slot: "aura", gambar: "auralangka", harga: 700, langka: true, keterangan: "Lingkaran energi berlapis yang berputar mengelilingi tubuh.", warna: [NAGA, GALAKSI, SURGA, PETIR, ES] }),
  ...keluarga({ awalan: "langka_helmastronot", nama: "Helm Astronot", slot: "kepala", gambar: "helmastronot", harga: 650, langka: true, keterangan: "Helm kaca kubah dengan pantulan bintang.", warna: [PUTIH, EMAS, HITAM] }),
  ...keluarga({ awalan: "langka_topengnaga", nama: "Topeng Naga", slot: "mata", gambar: "topengnaga", harga: 600, langka: true, keterangan: "Topeng bertanduk dengan mata menyala.", warna: [MERAH, HITAM, EMAS] }),
  ...keluarga({ awalan: "langka_jubahraja", nama: "Jubah Raja", slot: "badan", gambar: "jubahraja", harga: 850, langka: true, keterangan: "Jubah beludru berkerah bulu dan bros emas.", warna: [MERAH, UNGU, HITAM, PUTIH] }),
  ...keluarga({ awalan: "langka_pedanglegenda", nama: "Pedang Legenda", slot: "tangan", gambar: "pedanglegenda", harga: 900, langka: true, keterangan: "Bilah elemen yang berdenyut, gagang emas berukir.", warna: [API, ES, PETIR, BAYANGAN] }),
  ...keluarga({ awalan: "langka_sepatuterbang", nama: "Sepatu Terbang", slot: "kaki", gambar: "sepatuterbang", harga: 750, langka: true, keterangan: "Sepatu bersayap kecil yang mengepak.", warna: [EMAS, PERAK, MERAH, BIRU] }),
  ...keluarga({ awalan: "langka_tamengnaga", nama: "Tameng Naga", slot: "tangan", gambar: "tamengnaga", harga: 800, langka: true, keterangan: "Perisai bersisik naga dengan inti menyala.", warna: [MERAH, HITAM, EMAS] }),
  ...keluarga({ awalan: "langka_kalungpermata", nama: "Kalung Permata", slot: "leher", gambar: "kalungpermata", harga: 500, langka: true, keterangan: "Rantai emas dengan liontin permata besar.", warna: [RUBI, SAFIR, ZAMRUD, BERLIAN] }),
  ...keluarga({ awalan: "langka_sayapmalaikat", nama: "Sayap Malaikat", slot: "punggung", gambar: "sayapmalaikat", harga: 1000, langka: true, keterangan: "Sayap berbulu lembut yang bercahaya.", warna: [PUTIH, EMAS, HITAM] }),
  ...keluarga({ awalan: "langka_rodapetir", nama: "Roda Petir", slot: "kaki", gambar: "rodapetir", harga: 700, langka: true, keterangan: "Roda bercahaya dengan kilatan petir.", warna: [KUNING, BIRU, MERAH] }),
  ...keluarga({ awalan: "langka_jamemas", nama: "Jam Emas Kolektor", slot: "tangan", gambar: "jamemas", harga: 600, langka: true, keterangan: "Jam mewah bertatahkan permata kecil.", warna: [EMAS, ROSE, HITAM] }),
  ...keluarga({ awalan: "langka_kacamatalaser", nama: "Kacamata Laser", slot: "mata", gambar: "kacamatalaser", harga: 550, langka: true, keterangan: "Visor laser yang memancar tipis.", warna: [MERAH, BIRU, HIJAU] }),
];

/** Semua aksesoris v5 — ditempel ke KATALOG_AKSESORIS di lib/pet. */
export const AKSESORIS_V5: readonly Aksesoris[] = [...KAKI, ...TANGAN, ...KEPALA, ...JAKET, ...LANGKA];

/** Jumlah per kelompok (dipakai uji & keterangan toko). */
export const RINGKAS_V5 = {
  kaki: KAKI.length,
  tangan: TANGAN.length,
  kepala: KEPALA.length,
  jaket: JAKET.length,
  langka: LANGKA.length,
} as const;

export function adalahJaket(a: Aksesoris): boolean {
  return a.kode.startsWith("jaket_") && Boolean(a.label);
}

// ------------------------------------------------------------
// HEWAN BARU + SKIN HEWAN (5 per hewan, 6 hewan = 30)
// ------------------------------------------------------------
export type PaletHewan = { badan: string; aksen: string; perut: string; mata: string };

export type SkinHewan = {
  kode: string;
  nama: string;
  hewan: JenisHewan;
  harga: number;
  keterangan: string;
  palet: PaletHewan;
};

function skinHewan(hewan: JenisHewan, daftar: readonly [nama: string, harga: number, ket: string, palet: PaletHewan][]): SkinHewan[] {
  return daftar.map(([nama, harga, keterangan, palet]) => ({
    kode: `hs_${hewan}_${slug(nama)}`,
    nama,
    hewan,
    harga,
    keterangan,
    palet,
  }));
}

const NEON: PaletHewan = { badan: "#0F172A", aksen: "#22D3EE", perut: "#1E293B", mata: "#F472B6" };
const EMAS_P: PaletHewan = { badan: "#EAB308", aksen: "#FEF3C7", perut: "#FDE68A", mata: "#F97316" };
const SALJU: PaletHewan = { badan: "#E2E8F0", aksen: "#93C5FD", perut: "#F8FAFC", mata: "#38BDF8" };

export const KATALOG_SKIN_HEWAN: readonly SkinHewan[] = [
  ...skinHewan("kucing", [
    ["Salju", 150, "Bulu logam putih salju, mata biru es.", SALJU],
    ["Malam", 180, "Hitam pekat dengan aksen ungu.", { badan: "#1E1B4B", aksen: "#A78BFA", perut: "#312E81", mata: "#C4B5FD" }],
    ["Sakura", 200, "Merah muda lembut bertabur kelopak.", { badan: "#F9A8D4", aksen: "#FDF2F8", perut: "#FCE7F3", mata: "#DB2777" }],
    ["Emas", 260, "Kucing emas keberuntungan.", EMAS_P],
    ["Neon", 300, "Gelap dengan garis neon cyan.", NEON],
  ]),
  ...skinHewan("anjing", [
    ["Coklat", 150, "Coklat hangat klasik.", { badan: "#92400E", aksen: "#FDE68A", perut: "#D6B370", mata: "#22C55E" }],
    ["Salju", 180, "Husky putih, mata biru.", SALJU],
    ["Api", 200, "Oranye menyala bertelinga merah.", { badan: "#EA580C", aksen: "#DC2626", perut: "#FDBA74", mata: "#FDE047" }],
    ["Emas", 260, "Anjing emas juara.", EMAS_P],
    ["Neon", 300, "Gelap dengan garis neon cyan.", NEON],
  ]),
  ...skinHewan("kapibara", [
    ["Hijau Sawah", 150, "Hijau lumut, betah di air.", { badan: "#4D7C0F", aksen: "#D9F99D", perut: "#A3E635", mata: "#FDE047" }],
    ["Salju", 180, "Kapibara putih bersih.", SALJU],
    ["Ungu Senja", 200, "Ungu senja bertabur jingga.", { badan: "#6D28D9", aksen: "#FB923C", perut: "#C4B5FD", mata: "#FDE68A" }],
    ["Emas", 260, "Kapibara emas santai.", EMAS_P],
    ["Neon", 300, "Gelap dengan garis neon cyan.", NEON],
  ]),
  ...skinHewan("kelinci", [
    ["Salju", 150, "Kelinci putih bersih, mata biru.", SALJU],
    ["Cokelat", 180, "Cokelat susu dengan perut krem.", { badan: "#A16207", aksen: "#FEF3C7", perut: "#FDE68A", mata: "#F472B6" }],
    ["Sakura", 200, "Merah muda lembut.", { badan: "#F9A8D4", aksen: "#FDF2F8", perut: "#FCE7F3", mata: "#DB2777" }],
    ["Emas", 260, "Kelinci emas pembawa rezeki.", EMAS_P],
    ["Neon", 300, "Gelap dengan garis neon cyan.", NEON],
  ]),
  ...skinHewan("gajah", [
    ["Biru Laut", 150, "Biru laut dengan gading krem.", { badan: "#1D4ED8", aksen: "#FEF3C7", perut: "#93C5FD", mata: "#FDE047" }],
    ["Merah Bata", 180, "Merah bata hangat.", { badan: "#B91C1C", aksen: "#FEF3C7", perut: "#FCA5A5", mata: "#FDE047" }],
    ["Hijau Hutan", 200, "Hijau hutan tenang.", { badan: "#166534", aksen: "#FEF3C7", perut: "#86EFAC", mata: "#FDE047" }],
    ["Emas", 260, "Gajah emas kerajaan.", EMAS_P],
    ["Neon", 300, "Gelap dengan garis neon cyan.", NEON],
  ]),
  ...skinHewan("kangguru", [
    ["Merah", 150, "Merah tanah Australia.", { badan: "#B91C1C", aksen: "#FDE68A", perut: "#FCA5A5", mata: "#FDE047" }],
    ["Biru", 180, "Biru langit ceria.", { badan: "#2563EB", aksen: "#FEF3C7", perut: "#93C5FD", mata: "#FDE047" }],
    ["Salju", 200, "Kangguru putih langka.", SALJU],
    ["Emas", 260, "Kangguru emas petinju.", EMAS_P],
    ["Neon", 300, "Gelap dengan garis neon cyan.", NEON],
  ]),
];

export function skinHewanDariKode(kode: string): SkinHewan | undefined {
  return KATALOG_SKIN_HEWAN.find((s) => s.kode === kode);
}

// ------------------------------------------------------------
// TOKO: harga override & event item langka (diatur master)
// ------------------------------------------------------------
export const KUNCI_PET_TOKO = "pet_toko";

export type PengaturanToko = {
  /** kode → harga koin yang ditetapkan master (menimpa harga katalog). */
  harga: Record<string, number>;
  /** kode item langka → batas waktu event (ISO) atau null = tanpa batas. Tidak ada = tertutup. */
  event: Record<string, string | null>;
};

export const TOKO_KOSONG: PengaturanToko = { harga: {}, event: {} };

export function tokoDariJson(mentah: unknown): PengaturanToko {
  try {
    const j = (typeof mentah === "string" ? JSON.parse(mentah) : mentah) as Partial<PengaturanToko> | null;
    const harga: Record<string, number> = {};
    for (const [k, v] of Object.entries(j?.harga ?? {})) {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n) && n >= 0) harga[k] = n;
    }
    const event: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(j?.event ?? {})) event[k] = v == null ? null : String(v);
    return { harga, event };
  } catch {
    return { harga: {}, event: {} };
  }
}

/** Harga efektif: ketetapan master bila ada, kalau tidak harga katalog. */
export function hargaEfektif(kode: string, hargaKatalog: number, toko: PengaturanToko): number {
  const h = toko.harga[kode];
  return h != null && Number.isFinite(h) ? h : hargaKatalog;
}

/** Item langka sedang dibuka event-nya? */
export function eventAktif(kode: string, toko: PengaturanToko, kini = Date.now()): boolean {
  if (!(kode in toko.event)) return false;
  const sampai = toko.event[kode];
  if (sampai == null) return true;
  const t = Date.parse(sampai);
  return !Number.isFinite(t) || t > kini;
}
