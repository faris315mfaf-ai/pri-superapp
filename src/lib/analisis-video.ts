// ============================================================
// ANALISIS VIDEO (29 Sep 2026) — ringkasan katalog tvr_video_metrik.
//
// "Grafik di dalam aplikasi: tren, akun terbaik, platform terbaik, jam
// posting terbaik" (pilihan user). Katalog berisi ±110 ribu video dari
// ±640 akun tersambung upload-post; mengirim semuanya ke HP jelas tidak
// mungkin, jadi server meringkasnya di sini lalu hanya mengirim hasilnya
// (belasan KB).
//
// Berkas ini MURNI (tanpa database/jaringan) supaya bisa diuji tuntas.
// Pengambilan baris & penyimpanan sementara ada di analisis-video-data.
//
// Aturan hitung:
//  • "Video" = semua video yang terbit di rentang itu (tanggal posting WIB).
//  • Angka (tayangan dst.) hanya dari video yang SUDAH ditarik angkanya —
//    video "belum ada angka" tidak dihitung sebagai 0, supaya rata-rata
//    tidak jatuh semu. Cakupannya (berangka/video) selalu ditampilkan.
//  • ER (tingkat interaksi) = (suka + komentar + bagikan) / tayangan.
//  • Jam posting terbaik memakai MEDIAN tayangan (satu video viral tidak
//    boleh menyulap satu jam jadi "terbaik"), dan melewatkan waktu
//    perkiraan (tepat 12.00.00 WIB = waktu tebakan dari laporan manual,
//    lihat waktuDariLaporan). Sel baru dinilai bila isinya cukup: minimal
//    5 video DAN separuh median isi sel yang berisi. Data asli 29 Sep: tanpa
//    syarat kedua, "terbaik" jatuh ke Kamis 05.00 berisi 21 video —
//    sel sepi yang kebetulan berisi satu-dua video ramai.
// ============================================================
import { belumDitarik, platformApp } from "./metrik-video-up";

export type BarisAnalisis = {
  kode: string;
  platform: string | null;
  user_id: number | string | null;
  akun_username: string | null;
  waktu_posting: string | null;
  tayangan: number | string | null;
  suka: number | string | null;
  komentar: number | string | null;
  bagikan: number | string | null;
  diperbarui_pada: string | null;
};

/** Baris ringkas yang disimpan di memori (waktu sudah diurai sekali). */
export type BarisSiap = {
  kode: string;
  platform: string;
  uid: number;
  username: string;
  /** Tanggal posting WIB "YYYY-MM-DD" ("" = tidak diketahui). */
  tanggal: string;
  /** 0 = Minggu … 6 = Sabtu (WIB); -1 = tidak diketahui. */
  hari: number;
  /** Jam WIB 0–23; -1 = tidak diketahui / waktu perkiraan. */
  jam: number;
  berangka: boolean;
  tayangan: number;
  suka: number;
  komentar: number;
  bagikan: number;
};

export type Rentang = "7" | "30" | "90" | "semua";
/** Titik tren: per hari (7/30/90), per pekan (semua ≤ 6 bulan), per bulan (lebih panjang). */
export type SatuanTren = "hari" | "pekan" | "bulan";
export const DAFTAR_RENTANG: Rentang[] = ["7", "30", "90", "semua"];

export type Ringkas = {
  video: number;
  berangka: number;
  tayangan: number;
  suka: number;
  komentar: number;
  bagikan: number;
  /** Rata-rata tayangan per video berangka. */
  rata_tayangan: number;
  median_tayangan: number;
  /** Persen, 2 desimal. */
  er: number;
};
export type TitikTren = { t: string; video: number; berangka: number; tayangan: number; interaksi: number };
export type BarisPlatform = Ringkas & { platform: string };
export type BarisAkun = {
  kunci: string;
  user_id: string;
  platform: string;
  username: string;
  video: number;
  berangka: number;
  tayangan: number;
  interaksi: number;
  rata_tayangan: number;
  er: number;
};
export type SelJam = { hari: number; jam: number; video: number; median: number };
export type VideoTeratas = {
  kode: string;
  platform: string;
  user_id: string;
  username: string;
  tanggal: string;
  tayangan: number;
  suka: number;
  komentar: number;
  bagikan: number;
};

export type TampilanAnalisis = {
  rentang: Rentang;
  platform: string;
  akun: string;
  /** Tanggal WIB pertama & terakhir rentang (inklusif). */
  dari: string;
  sampai: string;
  satuan_tren: SatuanTren;
  ringkas: Ringkas;
  tren: TitikTren[];
  per_platform: BarisPlatform[];
  /** Jumlah akun yang punya video di rentang ini. */
  jumlah_akun: number;
  akun_teratas: BarisAkun[];
  jam: SelJam[];
  jam_terbaik: SelJam[];
  /** Isi minimal sebuah sel jam untuk dinilai (lihat keterangan atas). */
  min_video_sel: number;
  /** Video berangka yang waktunya perkiraan / tanpa jam (tak masuk peta jam). */
  jam_tak_pasti: number;
  video_teratas: VideoTeratas[];
};

const JAM_MS = 3_600_000;
const HARI_MS = 86_400_000;
const WIB_MS = 7 * JAM_MS;
export const MIN_VIDEO_SEL_JAM = 5;
const MAKS_AKUN_TERATAS = 30;
const MAKS_VIDEO_TERATAS = 10;

function angka(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Urai satu baris katalog jadi baris siap (sekali per pemuatan). */
export function siapkanBaris(b: BarisAnalisis): BarisSiap {
  const ms = b.waktu_posting ? Date.parse(b.waktu_posting) : NaN;
  let tanggal = "";
  let hari = -1;
  let jam = -1;
  if (Number.isFinite(ms)) {
    const w = new Date(ms + WIB_MS);
    tanggal = w.toISOString().slice(0, 10);
    hari = w.getUTCDay();
    // Tepat 12:00:00.000 WIB = waktu tebakan dari laporan manual.
    const tebakan = w.getUTCHours() === 12 && w.getUTCMinutes() === 0 && w.getUTCSeconds() === 0 && w.getUTCMilliseconds() === 0;
    jam = tebakan ? -1 : w.getUTCHours();
  }
  return {
    kode: b.kode,
    platform: platformApp(String(b.platform ?? "")),
    uid: Number(b.user_id) || 0,
    username: String(b.akun_username ?? ""),
    tanggal,
    hari,
    jam,
    berangka: !belumDitarik(b.diperbarui_pada),
    tayangan: angka(b.tayangan),
    suka: angka(b.suka),
    komentar: angka(b.komentar),
    bagikan: angka(b.bagikan),
  };
}

export function tanggalWibDari(ms: number): string {
  return new Date(ms + WIB_MS).toISOString().slice(0, 10);
}
function geser(tanggal: string, hari: number): string {
  return new Date(Date.parse(`${tanggal}T00:00:00Z`) + hari * HARI_MS).toISOString().slice(0, 10);
}
/** Senin pekan tanggal itu (pekan Senin–Minggu). */
function awalPekan(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
  return geser(tanggal, -((d + 6) % 7));
}

/** "YYYY-MM-01" bulan berikutnya. */
function bulanBerikut(t: string): string {
  const d = new Date(`${t.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function median(daftar: number[]): number {
  if (daftar.length === 0) return 0;
  const u = [...daftar].sort((a, b) => a - b);
  const t = Math.floor(u.length / 2);
  return u.length % 2 ? u[t] : Math.round((u[t - 1] + u[t]) / 2);
}

function persen(bagian: number, total: number): number {
  return total > 0 ? Math.round((bagian / total) * 10_000) / 100 : 0;
}

type Akumulator = { video: number; berangka: number; tayangan: number; suka: number; komentar: number; bagikan: number; daftar: number[] };
const akumBaru = (): Akumulator => ({ video: 0, berangka: 0, tayangan: 0, suka: 0, komentar: 0, bagikan: 0, daftar: [] });
function tambahAkum(a: Akumulator, b: BarisSiap) {
  a.video += 1;
  if (!b.berangka) return;
  a.berangka += 1;
  a.tayangan += b.tayangan;
  a.suka += b.suka;
  a.komentar += b.komentar;
  a.bagikan += b.bagikan;
  a.daftar.push(b.tayangan);
}
function keRingkas(a: Akumulator): Ringkas {
  return {
    video: a.video,
    berangka: a.berangka,
    tayangan: a.tayangan,
    suka: a.suka,
    komentar: a.komentar,
    bagikan: a.bagikan,
    rata_tayangan: a.berangka ? Math.round(a.tayangan / a.berangka) : 0,
    median_tayangan: median(a.daftar),
    er: persen(a.suka + a.komentar + a.bagikan, a.tayangan),
  };
}

/**
 * Susun satu tampilan analisis. `akun` = "user_id|platform" (kosong =
 * semua akun). `platform` kosong = semua platform.
 */
export function susunTampilan(
  baris: BarisSiap[],
  o: { rentang: Rentang; platform?: string; akun?: string; kiniMs: number },
): TampilanAnalisis {
  const platform = o.platform ? platformApp(o.platform) : "";
  const akun = o.akun ?? "";
  const sampai = tanggalWibDari(o.kiniMs);
  const cocok = (b: BarisSiap) =>
    (!platform || b.platform === platform) && (!akun || `${b.uid}|${b.platform}` === akun);

  let dari: string;
  if (o.rentang === "semua") {
    let min = sampai;
    for (const b of baris) if (b.tanggal && b.tanggal < min && cocok(b)) min = b.tanggal;
    dari = min;
  } else {
    dari = geser(sampai, -(Number(o.rentang) - 1));
  }
  // "Semua" bisa 3 tahun: 160 titik pekan tak terbaca di layar HP → per bulan.
  const rentangHari = (Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / HARI_MS;
  const satuan: SatuanTren = o.rentang !== "semua" ? "hari" : rentangHari > 180 ? "bulan" : "pekan";
  const kunciTren = (t: string) => (satuan === "pekan" ? awalPekan(t) : satuan === "bulan" ? `${t.slice(0, 7)}-01` : t);
  const langkah = (t: string) => (satuan === "bulan" ? bulanBerikut(t) : geser(t, satuan === "pekan" ? 7 : 1));

  const total = akumBaru();
  const tren = new Map<string, TitikTren>();
  const perPlatform = new Map<string, Akumulator>();
  const perAkun = new Map<string, Akumulator & { uid: number; platform: string; username: string }>();
  const perSel = new Map<number, number[]>();
  let jamTakPasti = 0;
  const kandidatTeratas: BarisSiap[] = [];

  for (const b of baris) {
    if (!b.tanggal || b.tanggal < dari || b.tanggal > sampai || !cocok(b)) continue;
    tambahAkum(total, b);
    const kt = kunciTren(b.tanggal);
    const p = tren.get(kt) ?? { t: kt, video: 0, berangka: 0, tayangan: 0, interaksi: 0 };
    p.video += 1;
    if (b.berangka) {
      p.berangka += 1;
      p.tayangan += b.tayangan;
      p.interaksi += b.suka + b.komentar + b.bagikan;
    }
    tren.set(kt, p);
    const pp = perPlatform.get(b.platform) ?? akumBaru();
    tambahAkum(pp, b);
    perPlatform.set(b.platform, pp);
    const ka = `${b.uid}|${b.platform}`;
    const a = perAkun.get(ka) ?? { ...akumBaru(), uid: b.uid, platform: b.platform, username: b.username };
    if (!a.username && b.username) a.username = b.username;
    tambahAkum(a, b);
    perAkun.set(ka, a);
    if (b.berangka) {
      if (b.jam >= 0 && b.hari >= 0) {
        const s = b.hari * 24 + b.jam;
        const l = perSel.get(s);
        if (l) l.push(b.tayangan);
        else perSel.set(s, [b.tayangan]);
      } else jamTakPasti += 1;
      kandidatTeratas.push(b);
    }
  }

  // Tren lengkap tanpa bolong (hari/pekan tanpa video = 0).
  const titik: TitikTren[] = [];
  for (let t = kunciTren(dari); t <= sampai; t = langkah(t)) {
    titik.push(tren.get(t) ?? { t, video: 0, berangka: 0, tayangan: 0, interaksi: 0 });
  }

  const akunSemua: BarisAkun[] = [...perAkun.entries()].map(([kunci, a]) => ({
    kunci,
    user_id: String(a.uid),
    platform: a.platform,
    username: a.username,
    video: a.video,
    berangka: a.berangka,
    tayangan: a.tayangan,
    interaksi: a.suka + a.komentar + a.bagikan,
    rata_tayangan: a.berangka ? Math.round(a.tayangan / a.berangka) : 0,
    er: persen(a.suka + a.komentar + a.bagikan, a.tayangan),
  }));
  // Teratas menurut tayangan + teratas menurut jumlah video (paling rajin),
  // supaya layar bisa berganti urutan tanpa meminta ulang.
  const pilih = new Map<string, BarisAkun>();
  for (const a of [...akunSemua].sort((x, y) => y.tayangan - x.tayangan || y.video - x.video).slice(0, MAKS_AKUN_TERATAS)) pilih.set(a.kunci, a);
  for (const a of [...akunSemua].sort((x, y) => y.video - x.video || y.tayangan - x.tayangan).slice(0, MAKS_AKUN_TERATAS)) pilih.set(a.kunci, a);
  for (const a of akunSemua.filter((x) => x.berangka >= MIN_VIDEO_SEL_JAM).sort((x, y) => y.er - x.er || y.tayangan - x.tayangan).slice(0, MAKS_AKUN_TERATAS)) {
    pilih.set(a.kunci, a);
  }

  const jam: SelJam[] = [];
  for (const [s, l] of perSel) jam.push({ hari: Math.floor(s / 24), jam: s % 24, video: l.length, median: median(l) });
  jam.sort((x, y) => x.hari - y.hari || x.jam - y.jam);
  const isiSel = jam.map((s) => s.video);
  const minSel = Math.max(MIN_VIDEO_SEL_JAM, Math.round(median(isiSel) / 2));
  const jamTerbaik = jam
    .filter((s) => s.video >= minSel)
    .sort((x, y) => y.median - x.median || y.video - x.video)
    .slice(0, 3);

  kandidatTeratas.sort((x, y) => y.tayangan - x.tayangan);
  const urutPlatform = ["tiktok", "instagram", "youtube", "facebook", "threads", "twitter"];

  return {
    rentang: o.rentang,
    platform,
    akun,
    dari,
    sampai,
    satuan_tren: satuan,
    ringkas: keRingkas(total),
    tren: titik,
    per_platform: [...perPlatform.entries()]
      .map(([p, a]) => ({ platform: p, ...keRingkas(a) }))
      .sort((x, y) => urutPlatform.indexOf(x.platform) - urutPlatform.indexOf(y.platform)),
    jumlah_akun: perAkun.size,
    akun_teratas: [...pilih.values()].sort((x, y) => y.tayangan - x.tayangan),
    jam,
    jam_terbaik: jamTerbaik,
    min_video_sel: minSel,
    jam_tak_pasti: jamTakPasti,
    video_teratas: kandidatTeratas.slice(0, MAKS_VIDEO_TERATAS).map((b) => ({
      kode: b.kode,
      platform: b.platform,
      user_id: String(b.uid),
      username: b.username,
      tanggal: b.tanggal,
      tayangan: b.tayangan,
      suka: b.suka,
      komentar: b.komentar,
      bagikan: b.bagikan,
    })),
  };
}
