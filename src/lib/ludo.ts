// ============================================================
// LUDO ROBOT (percobaan, 3 Sep 2026) — MESIN ATURAN MURNI (tanpa DB, tanpa
// React) yang dipakai server (/api/ludo) dan klien (papan) bersama.
//
// Aturan yang dipakai (Ludo standar):
//   • 2–4 pemain, tiap pemain 4 token; warna = kursi 0..3 (merah, hijau,
//     kuning, biru) searah jarum jam.
//   • Lintasan 52 petak. Token keluar dari markas hanya dengan dadu 6.
//   • Posisi token relatif terhadap petak awal warnanya:
//       -1 = markas, 0..50 = lintasan, 51..55 = jalur rumah (5 petak),
//       56 = RUMAH (harus pas, tidak boleh lebih).
//   • Petak aman: 4 petak awal + 4 petak bintang — token di sana tak bisa dimakan.
//   • Mendarat di petak tidak aman yang ditempati lawan → token lawan pulang
//     ke markas (dimakan).
//   • Giliran tambahan bila: dadu 6, memakan token, atau token sampai RUMAH.
//     Tiga kali 6 berturut-turut → giliran hangus.
//   • Pemenang = yang pertama memasukkan 4 token ke RUMAH.
// ============================================================

export const JUMLAH_TOKEN = 4;
export const PANJANG_LINTASAN = 52;
export const POS_MARKAS = -1;
export const POS_RUMAH = 56;
export const POS_AKHIR_LINTASAN = 50;
/** Petak awal tiap warna pada lintasan absolut. */
export const PETAK_AWAL = [0, 13, 26, 39] as const;
/** Petak aman (absolut): awal tiap warna + bintang. */
export const PETAK_AMAN = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);
/** Batas waktu satu giliran (ms) — lewat itu server menjalankan langkah otomatis. */
export const BATAS_GILIRAN_MS = 60_000;
export const MAKS_PEMAIN = 4;

export const WARNA = [
  { nama: "Merah", utama: "#EF4444", gelap: "#B91C1C", terang: "#FECACA" },
  { nama: "Hijau", utama: "#22C55E", gelap: "#15803D", terang: "#BBF7D0" },
  { nama: "Kuning", utama: "#F59E0B", gelap: "#B45309", terang: "#FDE68A" },
  { nama: "Biru", utama: "#3B82F6", gelap: "#1D4ED8", terang: "#BFDBFE" },
] as const;

/**
 * Koordinat (kolom, baris) 52 petak lintasan pada papan 15×15, indeks 0 =
 * petak awal MERAH (kiri), searah jarum jam. Diverifikasi: 13 = awal hijau
 * (8,1), 26 = awal kuning (13,8), 39 = awal biru (6,13).
 */
export const KOORDINAT_LINTASAN: readonly (readonly [number, number])[] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7],
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14],
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7],
  [0, 6],
];

/** Jalur rumah tiap warna (5 petak, urut menuju pusat). */
export const KOORDINAT_JALUR_RUMAH: readonly (readonly (readonly [number, number])[])[] = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];

/** Tempat token di markas tiap warna (4 titik). */
export const KOORDINAT_MARKAS: readonly (readonly (readonly [number, number])[])[] = [
  [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]],
  [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]],
  [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]],
  [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]],
];

/** Titik RUMAH (pusat) per warna — sedikit digeser ke arah warnanya. */
export const KOORDINAT_RUMAH: readonly (readonly [number, number])[] = [
  [6.6, 7.5],
  [7.5, 6.6],
  [8.4, 7.5],
  [7.5, 8.4],
];

export type RobotPemain = {
  jenis: "pria" | "wanita";
  terpasang: Record<string, string>;
  sparepart: Record<string, string>;
  nama: string;
};

export type Pemain = {
  user_id: number;
  nama: string;
  avatar_url: string;
  /** kursi 0..3 = warna */
  warna: number;
  robot: RobotPemain;
};

export type Fase = "lempar" | "pilih";

export type StateLudo = {
  /** indeks pemain yang sedang giliran (ke array pemain) */
  giliran: number;
  fase: Fase;
  /** dadu terakhir (1..6) — dipakai saat fase "pilih" */
  dadu: number | null;
  enam_beruntun: number;
  /** posisi 4 token tiap pemain, indeks = urutan pemain */
  token: number[][];
  /** token yang boleh digerakkan saat fase "pilih" */
  boleh: number[];
  /** batas waktu giliran (ISO) */
  batas: string;
  /** catatan singkat (maks 30) */
  log: string[];
  pemenang: number | null;
  /** langkah terakhir untuk animasi klien */
  terakhir: { pemain: number; token: number; dari: number; ke: number; makan: number[] } | null;
};

export function petakAbsolut(warna: number, posRel: number): number {
  return (PETAK_AWAL[warna] + posRel) % PANJANG_LINTASAN;
}

/** Koordinat papan (kolom, baris; satuan petak, pusat) untuk posisi token. */
export function koordinatToken(warna: number, pos: number, indeksToken: number): [number, number] {
  if (pos === POS_MARKAS) {
    const k = KOORDINAT_MARKAS[warna][indeksToken];
    return [k[0], k[1]];
  }
  if (pos >= POS_RUMAH) {
    const k = KOORDINAT_RUMAH[warna];
    return [k[0], k[1]];
  }
  if (pos > POS_AKHIR_LINTASAN) {
    const k = KOORDINAT_JALUR_RUMAH[warna][pos - POS_AKHIR_LINTASAN - 1];
    return [k[0] + 0.5, k[1] + 0.5];
  }
  const k = KOORDINAT_LINTASAN[petakAbsolut(warna, pos)];
  return [k[0] + 0.5, k[1] + 0.5];
}

export function stateAwal(jumlahPemain: number): StateLudo {
  return {
    giliran: 0,
    fase: "lempar",
    dadu: null,
    enam_beruntun: 0,
    token: Array.from({ length: jumlahPemain }, () => Array(JUMLAH_TOKEN).fill(POS_MARKAS)),
    boleh: [],
    batas: new Date(Date.now() + BATAS_GILIRAN_MS).toISOString(),
    log: ["Permainan dimulai. Merah lempar dadu dulu."],
    pemenang: null,
    terakhir: null,
  };
}

/** Token mana yang boleh digerakkan dengan dadu ini. */
export function tokenBoleh(token: number[], dadu: number): number[] {
  const hasil: number[] = [];
  token.forEach((pos, i) => {
    if (pos === POS_MARKAS) {
      if (dadu === 6) hasil.push(i);
      return;
    }
    if (pos >= POS_RUMAH) return;
    if (pos + dadu <= POS_RUMAH) hasil.push(i);
  });
  return hasil;
}

function catat(st: StateLudo, pesan: string) {
    st.log = [...st.log.slice(-29), pesan];
}

function giliranBerikut(st: StateLudo, jumlahPemain: number) {
  st.giliran = (st.giliran + 1) % jumlahPemain;
  st.fase = "lempar";
  st.dadu = null;
  st.boleh = [];
  st.enam_beruntun = 0;
  st.batas = new Date(Date.now() + BATAS_GILIRAN_MS).toISOString();
}

function giliranLagi(st: StateLudo) {
  st.fase = "lempar";
  st.dadu = null;
  st.boleh = [];
  st.batas = new Date(Date.now() + BATAS_GILIRAN_MS).toISOString();
}

/**
 * Terapkan hasil lemparan dadu pemain yang sedang giliran.
 * Mengembalikan state baru (immutable) + apakah harus memilih token.
 */
export function terapkanLemparan(asal: StateLudo, pemain: Pemain[], dadu: number): StateLudo {
  const st: StateLudo = structuredClone(asal);
  const n = pemain.length;
  const p = pemain[st.giliran];
  st.dadu = dadu;
  st.terakhir = null;
  if (dadu === 6) st.enam_beruntun += 1;
  else st.enam_beruntun = 0;
  if (st.enam_beruntun >= 3) {
    catat(st, `${p.nama} melempar 6 tiga kali berturut — giliran hangus.`);
    giliranBerikut(st, n);
    return st;
  }
  const boleh = tokenBoleh(st.token[st.giliran], dadu);
  if (boleh.length === 0) {
    catat(st, `${p.nama} melempar ${dadu} — tidak ada token yang bisa jalan.`);
    giliranBerikut(st, n);
    return st;
  }
  st.fase = "pilih";
  st.boleh = boleh;
  st.batas = new Date(Date.now() + BATAS_GILIRAN_MS).toISOString();
  catat(st, `${p.nama} melempar ${dadu}.`);
  // Satu-satunya pilihan → langsung jalan (tak perlu klik).
  if (boleh.length === 1) return terapkanGerak(st, pemain, boleh[0]);
  return st;
}

/** Gerakkan token terpilih pemain yang sedang giliran (fase "pilih"). */
export function terapkanGerak(asal: StateLudo, pemain: Pemain[], indeksToken: number): StateLudo {
  const st: StateLudo = structuredClone(asal);
  const n = pemain.length;
  const g = st.giliran;
  const p = pemain[g];
  const dadu = st.dadu ?? 0;
  if (st.fase !== "pilih" || !st.boleh.includes(indeksToken)) {
    throw new Error("Langkah tidak sah.");
  }
  const dari = st.token[g][indeksToken];
  const ke = dari === POS_MARKAS ? 0 : dari + dadu;
  st.token[g][indeksToken] = ke;
  const makan: number[] = [];
  let giliranTambahan = dadu === 6;

  if (ke <= POS_AKHIR_LINTASAN) {
    const abs = petakAbsolut(p.warna, ke);
    if (!PETAK_AMAN.has(abs)) {
      pemain.forEach((lawan, j) => {
        if (j === g) return;
        st.token[j].forEach((pos, t) => {
          if (pos >= 0 && pos <= POS_AKHIR_LINTASAN && petakAbsolut(lawan.warna, pos) === abs) {
            st.token[j][t] = POS_MARKAS;
            makan.push(j);
          }
        });
      });
    }
  }
  if (makan.length > 0) {
    giliranTambahan = true;
    const nama = [...new Set(makan)].map((j) => pemain[j].nama).join(", ");
    catat(st, `${p.nama} memakan token ${nama}!`);
  } else if (dari === POS_MARKAS) {
    catat(st, `${p.nama} mengeluarkan robot dari markas.`);
  } else if (ke === POS_RUMAH) {
    catat(st, `Robot ${p.nama} sampai di RUMAH!`);
    giliranTambahan = true;
  }
  st.terakhir = { pemain: g, token: indeksToken, dari, ke, makan };

  if (st.token[g].every((pos) => pos >= POS_RUMAH)) {
    st.pemenang = g;
    st.fase = "lempar";
    st.dadu = null;
    st.boleh = [];
    catat(st, `🏆 ${p.nama} MENANG!`);
    return st;
  }
  if (giliranTambahan) {
    giliranLagi(st);
    catat(st, `${p.nama} dapat giliran lagi.`);
  } else {
    giliranBerikut(st, n);
  }
  return st;
}

/** Langkah otomatis bila giliran kedaluwarsa: pilih token terdepan yang boleh. */
export function pilihanOtomatis(st: StateLudo): number {
  const token = st.token[st.giliran];
  let terbaik = st.boleh[0];
  for (const i of st.boleh) if (token[i] > token[terbaik]) terbaik = i;
  return terbaik;
}

export function labelPosisi(pos: number): string {
  if (pos === POS_MARKAS) return "markas";
  if (pos >= POS_RUMAH) return "rumah";
  if (pos > POS_AKHIR_LINTASAN) return `jalur rumah ${pos - POS_AKHIR_LINTASAN}`;
  return `petak ${pos + 1}`;
}

/** Bentuk ruang permainan yang dikirim ke klien. */
export type RuangLudo = {
  id: string;
  kode: string;
  host_id: string;
  status: "menunggu" | "berjalan" | "selesai";
  pemain: Pemain[];
  undangan: { user_id: string; nama: string }[];
  state: StateLudo | null;
  versi: number;
  pemenang_id: string | null;
  saya_host: boolean;
  saya_ikut: boolean;
  dibuat_pada: string;
};
