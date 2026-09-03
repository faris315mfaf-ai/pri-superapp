// ============================================================
// PET ROBOT (percobaan master, 3 Sep 2026) — aturan permainan yang dipakai
// SERVER dan KLIEN bersama (tanpa akses DB di sini):
//   • katalog aksesoris + harga koin + slot,
//   • rumus penurunan kebutuhan seiring waktu,
//   • efek tiap perawatan, XP → level, suasana hati.
// Terinspirasi POU: robot dirawat (makan, main, mandi, tidur) supaya bahagia.
// ============================================================

export type JenisRobot = "pria" | "wanita";
export type SlotAksesoris = "kepala" | "mata" | "leher" | "badan" | "punggung" | "tangan" | "aura";
export type Suasana = "senang" | "biasa" | "lapar" | "lelah" | "sedih" | "kotor" | "tidur";
export type Perawatan = "makan" | "main" | "mandi";

export type Aksesoris = {
  kode: string;
  nama: string;
  slot: SlotAksesoris;
  harga: number;
  keterangan: string;
};

/** Katalog toko — urut per slot lalu harga. Kode TIDAK boleh diubah (tersimpan di DB). */
export const KATALOG_AKSESORIS: readonly Aksesoris[] = [
  { kode: "topi_pesta", nama: "Topi Pesta", slot: "kepala", harga: 30, keterangan: "Kerucut warna-warni, siap merayakan apa saja." },
  { kode: "bandana", nama: "Bandana Merah", slot: "kepala", harga: 40, keterangan: "Ikat kepala sporty." },
  { kode: "pita_besar", nama: "Pita Besar", slot: "kepala", harga: 45, keterangan: "Pita manis di sisi kepala." },
  { kode: "topi_baseball", nama: "Topi Baseball", slot: "kepala", harga: 60, keterangan: "Topi santai bervisor." },
  { kode: "mahkota", nama: "Mahkota Emas", slot: "kepala", harga: 150, keterangan: "Untuk robot yang berkuasa." },
  { kode: "kacamata_bulat", nama: "Kacamata Bulat", slot: "mata", harga: 40, keterangan: "Gaya cendekia." },
  { kode: "kacamata_hitam", nama: "Kacamata Hitam", slot: "mata", harga: 50, keterangan: "Terlalu keren untuk silau." },
  { kode: "monokel", nama: "Monokel", slot: "mata", harga: 70, keterangan: "Satu lensa, seribu wibawa." },
  { kode: "dasi_kupu", nama: "Dasi Kupu-kupu", slot: "leher", harga: 35, keterangan: "Rapi untuk acara resmi." },
  { kode: "syal_merah", nama: "Syal Merah", slot: "leher", harga: 45, keterangan: "Hangat dan gagah." },
  { kode: "kalung_bintang", nama: "Kalung Bintang", slot: "leher", harga: 80, keterangan: "Bintang kecil yang berkilau." },
  { kode: "kaos_pri", nama: "Kaos PRI", slot: "badan", harga: 60, keterangan: "Kaos merah kebanggaan partai." },
  { kode: "rompi", nama: "Rompi Kulit", slot: "badan", harga: 90, keterangan: "Rompi cokelat berkelas." },
  { kode: "jubah", nama: "Jubah Pahlawan", slot: "badan", harga: 120, keterangan: "Jubah ungu berkibar." },
  { kode: "balon", nama: "Balon", slot: "tangan", harga: 25, keterangan: "Balon merah di tangan kanan." },
  { kode: "bendera", nama: "Bendera Merah Putih", slot: "tangan", harga: 40, keterangan: "Dikibarkan dengan bangga." },
  { kode: "sayap", nama: "Sayap Malaikat", slot: "punggung", harga: 200, keterangan: "Sepasang sayap putih." },
  { kode: "jetpack", nama: "Jetpack", slot: "punggung", harga: 250, keterangan: "Semburan api biru di punggung." },
  { kode: "aura_emas", nama: "Aura Emas", slot: "aura", harga: 300, keterangan: "Cahaya keemasan mengelilingi robot." },
];

export const SLOT_LABEL: Record<SlotAksesoris, string> = {
  kepala: "Kepala",
  mata: "Mata",
  leher: "Leher",
  badan: "Badan",
  punggung: "Punggung",
  tangan: "Tangan",
  aura: "Aura",
};

export function aksesorisDariKode(kode: string): Aksesoris | undefined {
  return KATALOG_AKSESORIS.find((a) => a.kode === kode);
}

/** Batas nama robot. */
export const NAMA_MAKS = 16;
/** Hadiah koin harian saat merawat robot (sekali per hari WIB). */
export const HADIAH_HARIAN_KOIN = 10;
/** XP per level. */
export const XP_PER_LEVEL = 100;

export type Kebutuhan = { kenyang: number; energi: number; senang: number; bersih: number };

function jepit(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Penurunan kebutuhan per JAM (linier terhadap waktu, kecil supaya robot tidak
 * "mati" saat ditinggal semalam): kenyang −6, senang −5, bersih −4, energi −3
 * (bila tidur: energi +15/jam). Jarak ≥ 0 dan dibatasi 72 jam.
 */
export function hitungPenurunan(k: Kebutuhan, tidur: boolean, jamBerlalu: number): Kebutuhan {
  const j = Math.max(0, Math.min(72, jamBerlalu));
  return {
    kenyang: jepit(k.kenyang - 6 * j),
    senang: jepit(k.senang - 5 * j),
    bersih: jepit(k.bersih - 4 * j),
    energi: jepit(tidur ? k.energi + 15 * j : k.energi - 3 * j),
  };
}

/** Efek perawatan (dipakai server; klien hanya menampilkan labelnya). */
export const EFEK_PERAWATAN: Record<Perawatan, { label: string; efek: Partial<Kebutuhan>; xp: number; syarat?: string }> = {
  makan: { label: "Beri makan", efek: { kenyang: 30, senang: 5 }, xp: 5 },
  main: { label: "Ajak main", efek: { senang: 25, energi: -10, kenyang: -5 }, xp: 8, syarat: "energi ≥ 15" },
  mandi: { label: "Mandikan", efek: { bersih: 40, senang: 3 }, xp: 5 },
};

export function terapkanPerawatan(k: Kebutuhan, jenis: Perawatan): Kebutuhan {
  const e = EFEK_PERAWATAN[jenis].efek;
  return {
    kenyang: jepit(k.kenyang + (e.kenyang ?? 0)),
    energi: jepit(k.energi + (e.energi ?? 0)),
    senang: jepit(k.senang + (e.senang ?? 0)),
    bersih: jepit(k.bersih + (e.bersih ?? 0)),
  };
}

export function levelDariXp(xp: number): { level: number; xpDiLevel: number; xpBerikut: number } {
  const level = Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
  return { level, xpDiLevel: Math.max(0, xp) % XP_PER_LEVEL, xpBerikut: XP_PER_LEVEL };
}

/** Suasana hati dari kebutuhan (yang paling mendesak menang). */
export function suasanaDari(k: Kebutuhan, tidur: boolean): Suasana {
  if (tidur) return "tidur";
  const terendah = Math.min(k.kenyang, k.energi, k.senang, k.bersih);
  if (terendah < 25) {
    if (k.kenyang === terendah) return "lapar";
    if (k.energi === terendah) return "lelah";
    if (k.bersih === terendah) return "kotor";
    return "sedih";
  }
  const rata = (k.kenyang + k.energi + k.senang + k.bersih) / 4;
  return rata >= 70 ? "senang" : "biasa";
}

export const LABEL_SUASANA: Record<Suasana, string> = {
  senang: "Senang sekali!",
  biasa: "Baik-baik saja",
  lapar: "Lapar… beri makan dong",
  lelah: "Lelah, ingin tidur",
  sedih: "Sedih, ajak main yuk",
  kotor: "Kotor, perlu dimandikan",
  tidur: "Zzz… sedang tidur",
};

/** Palet warna per jenis (dipakai SVG & UI). */
export const PALET: Record<JenisRobot, { utama: string; utamaGelap: string; aksen: string; aksenTerang: string; badan: string; badanGelap: string; layar: string; mata: string; label: string }> = {
  pria: {
    utama: "#3B82F6",
    utamaGelap: "#1D4ED8",
    aksen: "#111827",
    aksenTerang: "#374151",
    badan: "#1F2937",
    badanGelap: "#0F172A",
    layar: "#0B1220",
    mata: "#67E8F9",
    label: "Robot Pria · biru-hitam",
  },
  wanita: {
    utama: "#EC4899",
    utamaGelap: "#BE185D",
    aksen: "#F9FAFB",
    aksenTerang: "#FFFFFF",
    badan: "#FDF2F8",
    badanGelap: "#FBCFE8",
    layar: "#3B0A2A",
    mata: "#FDA4AF",
    label: "Robot Wanita · pink-putih",
  },
};

/** Bentuk state yang dikirim API ke klien. */
export type PetState = {
  ada: boolean;
  jenis: JenisRobot | null;
  nama: string;
  kebutuhan: Kebutuhan;
  tidur: boolean;
  suasana: Suasana;
  xp: number;
  level: number;
  xp_di_level: number;
  xp_berikut: number;
  dimiliki: string[];
  terpasang: Partial<Record<SlotAksesoris, string>>;
  saldo_koin: number;
  hadiah_hari_ini: boolean;
  dibuat_pada: string | null;
};
