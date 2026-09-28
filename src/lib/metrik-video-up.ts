// ============================================================
// ANGKA PER VIDEO DARI UPLOAD-POST, DISEGARKAN TIAP HARI (25 Sep 2026)
//
// Permintaan: "seluruh video yang terhubung di akun upload-post tiap hari
// datanya terupdate … jumlah tayangan, like, komen, dsb … lalu
// dikelompokkan berdasarkan kategori di halaman TV Rakyat Nasional".
//
// Sumber angka (diverifikasi langsung ke api.upload-post.com, 25 Sep 2026):
//   • GET /uploadposts/post-analytics/{request_id}
//       LIVE, satu unggahan SuperApp, SEMUA platformnya sekaligus
//       (3–10 dtk). Angka langsung dari API tiap platform.
//   • GET /uploadposts/post-analytics?platform_post_id=&platform=&user=
//       LIVE, satu video di akun tertaut yang TIDAK lewat SuperApp —
//       dipakai untuk video yang dilaporkan anggota ke sebuah kategori.
//   • /post-analytics/cached TIDAK dipakai untuk penyegaran: ia hanya
//     memutar ulang bacaan live terakhir, tanpa penyegaran di latar
//     (captured_at berhenti ±5 menit setelah unggah — itulah sebabnya
//     angka di panel kategori dulu tidak pernah bergerak).
// Keduanya live dibatasi upload-post (100 permintaan / 5 menit menurut
// dokumentasinya) dan dipakai bersama rekonsiliasi KPI — pengaturan laju
// ada di lib/segar-metrik-video.ts.
//
// Berkas ini MURNI (tanpa jaringan/database) supaya bisa diuji.
// ============================================================
import { adaAngka, angkaLain, uraiMetrikPost, type MetrikPost } from "@/lib/metrik-post-up";

/** Nama platform upload-post → nama di aplikasi ("x" kita sebut "twitter"). */
export function platformApp(namaUp: string): string {
  const n = namaUp.trim().toLowerCase();
  return n === "x" ? "twitter" : n;
}

/** Nama platform aplikasi → nama di upload-post. */
export function platformUp(namaApp: string): string {
  const n = namaApp.trim().toLowerCase();
  return n === "twitter" ? "x" : n;
}

/**
 * Potong teks dengan AMAN untuk database: per karakter utuh (emoji tidak
 * terbelah), tanpa karakter NUL dan tanpa separuh-emoji (surrogate
 * tunggal). Insiden 26 Sep 2026: caption yang dipotong .slice() di tengah
 * emoji membuat Postgres menolak SELURUH kiriman ("invalid input syntax
 * for type json") — 200 video sekaligus gagal masuk katalog.
 */
export function potongAman(teks: unknown, maks: number): string {
  const s = teks == null ? "" : String(teks);
  let hasil = "";
  let n = 0;
  for (let i = 0; i < s.length && n < maks; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) continue;
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        hasil += s[i] + s[i + 1];
        i++;
        n++;
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    hasil += s[i];
    n++;
  }
  return hasil;
}

function objek(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Waktu dari upload-post → ISO. Bentuknya tidak seragam:
 * "2026-09-24 11:21:36.503000" (UTC tanpa zona), ISO biasa, atau unix
 * detik/milidetik. Tak terbaca → null (bukan "sekarang").
 */
export function waktuUp(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d{9,14}$/.test(String(v).trim())) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  let s = String(v).trim();
  // "YYYY-MM-DD HH:MM:SS(.ffffff)" tanpa zona = UTC (dicocokkan dengan
  // dibuat_pada unggahan yang sama). Pecahan detik dipangkas ke milidetik.
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/.exec(s);
  if (m) s = `${m[1]}T${m[2]}${m[3] ? m[3].slice(0, 4) : ""}Z`;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export type StatusBlok = "ok" | "galat" | "tidak_terbit";

/** Satu platform dari jawaban post-analytics live. */
export type BlokLive = {
  platform: string;
  status: StatusBlok;
  post_url: string;
  platform_post_id: string;
  /** Angka seragam (null = platform tidak melaporkannya). Hanya untuk status "ok". */
  metrik: MetrikPost | null;
  /** Angka lain di luar kolom baku (reach, new_followers, …). */
  lain: Record<string, number>;
  /** post_metrics apa adanya (untuk kolom `mentah` bila ada). */
  mentah: Record<string, unknown> | null;
  /** Alasan bila status bukan "ok" — ditampilkan apa adanya. */
  galat: string;
};

export type JawabanLive = {
  profil: string;
  judul: string;
  /** Waktu unggah menurut upload-post (ISO) — dipakai sebagai waktu posting. */
  waktu_unggah: string | null;
  /** post.source: "api_uploaded" | "organic" | "" */
  asal: string;
  request_id: string;
  blok: BlokLive[];
};

/**
 * Urai jawaban post-analytics LIVE (baik versi request_id maupun
 * platform_post_id — bentuknya sama). Aturan yang menjaga angka tetap
 * jujur:
 *   • success:false        → "tidak_terbit" (video tidak ada di platform itu)
 *   • post_metrics_error   → "galat" (token kedaluwarsa, video dihapus, …)
 *   • post_metrics tanpa satu angka pun → "galat"
 * Hanya blok "ok" yang boleh menimpa angka tersimpan; blok galat tidak
 * boleh mengubah angka bagus kemarin menjadi nol.
 */
export function uraiJawabanLive(jawaban: unknown): JawabanLive {
  const d = objek(jawaban) ?? {};
  const post = objek(d.post) ?? {};
  const hasil: JawabanLive = {
    profil: String(post.profile_username ?? ""),
    judul: potongAman(String(post.post_title ?? post.post_caption ?? "").trim(), 300),
    waktu_unggah: waktuUp(post.upload_timestamp),
    asal: String(post.source ?? ""),
    request_id: String(post.request_id ?? ""),
    blok: [],
  };
  const wadah = objek(d.platforms) ?? {};
  for (const [namaUp, isi] of Object.entries(wadah)) {
    const b = objek(isi);
    if (!b) continue;
    const platform = platformApp(namaUp);
    if (!platform) continue;
    const post_url = typeof b.post_url === "string" && /^https?:\/\//i.test(b.post_url) ? b.post_url : "";
    const platform_post_id = b.platform_post_id == null ? "" : String(b.platform_post_id);
    const dasar = { platform, post_url, platform_post_id, metrik: null, lain: {}, mentah: null };
    if (b.success === false) {
      hasil.blok.push({
        ...dasar,
        status: "tidak_terbit",
        // Kosong bila upload-post tidak menyebut alasannya — layar sudah
        // menulis "tidak terbit di platform ini" sendiri.
        galat: potongAman(b.error ?? b.message ?? "", 300),
      });
      continue;
    }
    const galat = typeof b.post_metrics_error === "string" ? b.post_metrics_error.trim() : "";
    if (galat) {
      hasil.blok.push({ ...dasar, status: "galat", galat: potongAman(galat, 300) });
      continue;
    }
    const pm = objek(b.post_metrics);
    const m = pm ? uraiMetrikPost(pm) : null;
    if (!pm || !m || !adaAngka(m)) {
      hasil.blok.push({ ...dasar, status: "galat", galat: "upload-post tidak memberi angka untuk video ini" });
      continue;
    }
    hasil.blok.push({
      ...dasar,
      status: "ok",
      metrik: { ...m, post_url: m.post_url || post_url },
      lain: angkaLain(pm),
      mentah: pm,
      galat: "",
    });
  }
  return hasil;
}

/** Bilangan bulat ≥ 0 untuk kolom bigint (null/aneh → 0). */
function bulat(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/**
 * Angka yang disimpan ke tvr_video_metrik. X tidak punya "views" di
 * upload-post — tayangan tweet di X memang disebut impressions, jadi itu
 * yang dipakai sebagai tayangannya.
 */
export function angkaSimpan(
  platform: string,
  m: MetrikPost,
): { tayangan: number; suka: number; komentar: number; bagikan: number; favorit: number } {
  const p = platformApp(platform);
  const tayangan = m.tayangan ?? (p === "twitter" ? m.impresi : null);
  return {
    tayangan: bulat(tayangan),
    suka: bulat(m.suka),
    komentar: bulat(m.komentar),
    bagikan: bulat(m.bagikan),
    favorit: bulat(m.simpan),
  };
}

/** Kolom sql/50 yang belum tentu ada di database. */
export type KolomTambahan = { favorit: boolean; sumber: boolean; mentah: boolean };

export type BarisLama = {
  akun_username?: string | null;
  nama_akun?: string | null;
  judul?: string | null;
  url?: string | null;
  waktu_posting?: string | null;
  user_id?: number | string | null;
};

/**
 * Satu baris tvr_video_metrik. KUNCINYA SELALU SAMA (PostgREST menyisipkan
 * banyak baris sekaligus dengan satu daftar kolom — kunci yang hilang di
 * satu baris akan diisi NULL dan melanggar NOT NULL). Nilai teks yang
 * kosong tidak menimpa isi lama (judul/akun dari TikHub tetap).
 */
export function barisMetrikVideo(o: {
  kode: string;
  platform: string;
  url: string;
  metrik: MetrikPost;
  mentah: Record<string, unknown> | null;
  akun_username: string;
  user_id: number | null;
  judul: string;
  waktu_posting: string | null;
  kini: string;
  lama?: BarisLama | null;
  kolom: KolomTambahan;
}): Record<string, unknown> {
  const lama = o.lama ?? {};
  const teks = (baru: string, dulu: unknown) => (baru.trim() ? baru.trim() : String(dulu ?? "").trim());
  const a = angkaSimpan(o.platform, o.metrik);
  const baris: Record<string, unknown> = {
    kode: o.kode,
    platform: platformApp(o.platform),
    akun_username: potongAman(teks(o.akun_username.replace(/^@/, ""), lama.akun_username), 120),
    user_id: o.user_id ?? (lama.user_id == null ? null : Number(lama.user_id)),
    nama_akun: potongAman(lama.nama_akun ?? "", 200),
    judul: potongAman(teks(o.judul, lama.judul), 300),
    // URL lama dipertahankan: bentuknya sudah dipakai laporan/embed.
    url: potongAman(teks(String(lama.url ?? ""), o.url), 500),
    waktu_posting: lama.waktu_posting ? String(lama.waktu_posting) : o.waktu_posting,
    tayangan: a.tayangan,
    suka: a.suka,
    komentar: a.komentar,
    bagikan: a.bagikan,
    diperbarui_pada: o.kini,
  };
  if (o.kolom.favorit) baris.favorit = a.favorit;
  if (o.kolom.sumber) baris.sumber = "upload-post";
  if (o.kolom.mentah) baris.mentah = o.mentah;
  return baris;
}

// ------------------------------------------------------------
// Sisa kuota dari header jawaban upload-post
// ------------------------------------------------------------

export type BatasUp = { batas: number | null; sisa: number | null; reset_ms: number | null };

/** Baca x-ratelimit-* (diverifikasi ada di jawaban live, 25 Sep 2026). */
export function bacaBatasUp(ambil: (nama: string) => string | null): BatasUp {
  const angka = (nama: string) => {
    const v = ambil(nama);
    if (v == null || v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const reset = angka("x-ratelimit-reset");
  return {
    batas: angka("x-ratelimit-limit"),
    sisa: angka("x-ratelimit-remaining"),
    // Detik epoch (bila > 1e12 sudah milidetik).
    reset_ms: reset == null ? null : reset > 1e12 ? reset : reset * 1000,
  };
}

/**
 * true bila kuota upload-post tinggal sedikit — penyegar harus berhenti
 * dulu supaya unggahan & rekonsiliasi KPI anggota tidak ikut ditolak.
 * Cadangan: seperempat batas, minimal 20 permintaan.
 */
export function kuotaMenipis(b: BatasUp): boolean {
  if (b.sisa == null) return false;
  const cadangan = Math.max(20, Math.ceil((b.batas ?? 0) * 0.25));
  return b.sisa <= cadangan;
}

// ------------------------------------------------------------
// TINGKAT KESEGARAN (26 Sep 2026) — "hari ini dulu, lalu kemarin, lalu
// yang lalu-lalu" (permintaan user).
// ------------------------------------------------------------
//
// Tiap video di katalog (tvr_video_metrik) disegarkan menurut umurnya
// (tanggal posting WIB): video hari ini paling sering, video lama paling
// jarang. Antrean dihitung ulang tiap putaran dari database (kolom
// waktu_posting & diperbarui_pada), jadi tidak ada kursor yang bisa
// macet: video yang belum sempat dikerjakan tetap "jatuh tempo" dan
// menjadi yang paling basi di putaran berikutnya.

/**
 * diperbarui_pada untuk video yang BARU DIKENALI (dari daftar media /
 * laporan) tapi angkanya belum ditarik. Kolomnya NOT NULL, jadi dipakai
 * tanggal yang mustahil — layar menganggapnya "belum ada angka", dan
 * antrean menganggapnya paling basi (dikerjakan duluan).
 */
export const BELUM_DITARIK = "1970-01-01T00:00:00.000Z";

/** true bila baris angka ini hanya penanda "belum ditarik". */
export function belumDitarik(diperbaruiPada: string | null | undefined): boolean {
  if (!diperbaruiPada) return true;
  const t = Date.parse(diperbaruiPada);
  return !Number.isFinite(t) || t < Date.parse("2000-01-01T00:00:00Z");
}

const JAM = 3600_000;
const HARI = 24 * JAM;
const WIB = 7 * JAM;

/** 00:00 WIB hari itu (milidetik epoch). */
export function awalHariWib(ms: number): number {
  return Math.floor((ms + WIB) / HARI) * HARI - WIB;
}

/** "YYYY-MM-DD" menurut WIB. */
export function tanggalWib(ms: number): string {
  return new Date(ms + WIB).toISOString().slice(0, 10);
}

/** ISO tanpa milidetik — aman dipakai di filter or() PostgREST. */
export function isoDetik(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

export type NamaTingkat = "hari_ini" | "kemarin" | "pekan" | "lama";

export type Tingkat = {
  nama: NamaTingkat;
  /** Batas bawah waktu_posting (ISO, inklusif); null = tanpa batas. */
  dari: string | null;
  /** Batas atas waktu_posting (ISO, eksklusif); null = tanpa batas. */
  sampai: string | null;
  /** Video tanpa waktu_posting ikut tingkat ini (hanya "lama"). */
  tanpaWaktu: boolean;
  /** Jatuh tempo bila diperbarui_pada lebih tua dari ini (ISO). */
  basiSebelum: string;
  /** Selang penyegaran tingkat ini (ms). */
  selangMs: number;
};

/** Selang penyegaran per tingkat. */
export const SELANG_TINGKAT: Record<NamaTingkat, number> = {
  hari_ini: 15 * 60_000,
  kemarin: JAM,
  pekan: 6 * JAM,
  lama: HARI,
};

/**
 * Empat tingkat, urut prioritas: hari ini, kemarin, 2–6 hari lalu, lebih
 * lama (termasuk yang tanggal postingnya tidak diketahui).
 */
export function tingkatKesegaran(kiniMs: number): Tingkat[] {
  const awal = awalHariWib(kiniMs);
  const buat = (nama: NamaTingkat, dari: number | null, sampai: number | null, tanpaWaktu = false): Tingkat => ({
    nama,
    dari: dari == null ? null : isoDetik(dari),
    sampai: sampai == null ? null : isoDetik(sampai),
    tanpaWaktu,
    basiSebelum: isoDetik(kiniMs - SELANG_TINGKAT[nama]),
    selangMs: SELANG_TINGKAT[nama],
  });
  return [
    buat("hari_ini", awal, null),
    buat("kemarin", awal - HARI, awal),
    buat("pekan", awal - 6 * HARI, awal - HARI),
    buat("lama", null, awal - 6 * HARI, true),
  ];
}

/** Tingkat sebuah video menurut waktu postingnya. */
export function tingkatVideo(waktuPosting: string | null | undefined, kiniMs: number): NamaTingkat {
  const t = waktuPosting ? Date.parse(waktuPosting) : NaN;
  if (!Number.isFinite(t)) return "lama";
  const awal = awalHariWib(kiniMs);
  if (t >= awal) return "hari_ini";
  if (t >= awal - HARI) return "kemarin";
  if (t >= awal - 6 * HARI) return "pekan";
  return "lama";
}

/**
 * Perkiraan waktu posting video dari barisan laporan: laporan otomatis
 * dicatat ±15 menit setelah terbit (dibuat_pada), laporan manual bisa
 * berhari-hari kemudian — maka bila tanggalnya beda, pakai tengah hari
 * tanggal_wib laporan.
 */
export function waktuDariLaporan(tanggalWibLaporan: string | null | undefined, dibuatPada: string | null | undefined): string | null {
  const dibuat = dibuatPada ? Date.parse(dibuatPada) : NaN;
  const tgl = /^\d{4}-\d{2}-\d{2}$/.test(tanggalWibLaporan ?? "") ? String(tanggalWibLaporan) : "";
  if (Number.isFinite(dibuat) && (!tgl || tanggalWib(dibuat) === tgl)) return new Date(dibuat).toISOString();
  if (tgl) return new Date(Date.parse(`${tgl}T12:00:00+07:00`)).toISOString();
  return null;
}

// ------------------------------------------------------------
// Galat upload-post → tindakan
// ------------------------------------------------------------

export type JenisGalat = "akun" | "batas" | "video" | "waktu" | "lain";

/**
 * Golongkan pesan galat upload-post/platform:
 *   akun  — token kedaluwarsa / izin dicabut → seluruh akun dijeda lama;
 *   batas — batas laju platform → akun dijeda sebentar;
 *   video — video dihapus / tidak ada → video itu saja yang dilewati;
 *   waktu — upload-post tidak menjawab tepat waktu.
 */
export function golonganGalat(pesan: string | null | undefined): JenisGalat {
  const p = String(pesan ?? "").toLowerCase();
  if (!p) return "lain";
  if (/abort|timeout|timed out|waktu habis/.test(p)) return "waktu";
  if (/rate limit|too many|limit reached|request limit|quota|\(#4\)|\(#17\)|\(#32\)|\(#613\)|\b429\b|throttl/.test(p)) return "batas";
  // Pesan RAGU dari upload-post ("…may have been deleted or the token
  // expired", HTTP 400/401) = satu video dulu; akunnya baru dijeda bila
  // banyak video akun itu gagal beruntun (dihitung penyegar).
  if (/may have been deleted or the token/.test(p)) return "video";
  if (/token|expired|kedaluwarsa|http 401|\b401\b|http 403|\b403\b|permission|not authori[sz]ed|unauthori[sz]ed|reconnect|missing or expired|access denied/.test(p)) {
    return "akun";
  }
  if (/not found|deleted|does not exist|no longer|unavailable|http 400|\b400\b|\b404\b|invalid (media|post|video)|cannot be found/.test(p)) {
    return "video";
  }
  return "lain";
}

// ------------------------------------------------------------
// Urutan bergilir antar akun
// ------------------------------------------------------------

/**
 * Susun ulang daftar supaya akun-akun bergiliran (A1, B1, C1, A2, B2, …)
 * — beban ke tiap akun sosmed tersebar, bukan 300 video satu akun
 * berturut-turut (platform membatasi laju per akun). Urutan dalam satu
 * akun dipertahankan (yang paling basi duluan). `batasPerAkun` memotong
 * jatah tiap akun.
 */
export function selangSeling<T>(daftar: T[], kunci: (t: T) => string, batasPerAkun = Number.POSITIVE_INFINITY): T[] {
  const perAkun = new Map<string, T[]>();
  for (const t of daftar) {
    const k = kunci(t);
    const l = perAkun.get(k);
    if (l) l.push(t);
    else perAkun.set(k, [t]);
  }
  const antre = [...perAkun.values()].map((l) => l.slice(0, Math.max(0, batasPerAkun)));
  const hasil: T[] = [];
  for (let i = 0; ; i++) {
    let ada = false;
    for (const l of antre) {
      if (i < l.length) {
        hasil.push(l[i]);
        ada = true;
      }
    }
    if (!ada) break;
  }
  return hasil;
}

/** Posisi keyset di antrean tingkat: (diperbarui_pada, kode) baris terakhir. */
export type PosisiAntrean = { d: string; k: string };

/**
 * Menjelajah antrean satu tingkat per jendela, MELANJUTKAN dari posisi
 * putaran sebelumnya (29 Sep 2026). Tanpa posisi ini tiap putaran mulai
 * dari depan, dan video yang selalu dilewati (akun dijeda, ID media belum
 * ada) memenuhi jendela-jendela pertama — video di belakangnya tidak
 * pernah terjangkau (terbukti: 27 ribu TikTok & 10 ribu YouTube).
 *
 * - Sampai ujung antrean → lanjut dari depan (sekali per putaran).
 * - Jendela tidak tuntas (waktu putaran habis) → posisi dikembalikan ke
 *   awal jendela itu; yang sudah disegarkan keluar sendiri dari antrean
 *   (waktunya baru), jadi tetap maju tanpa melompati sisanya.
 *
 * Mengembalikan posisi untuk putaran berikutnya (null = dari depan).
 */
export async function jelajahiAntrean<B extends { kode: string; diperbarui_pada: string }>(o: {
  kursor: PosisiAntrean | null;
  ukuran: number;
  maksJendela: number;
  boleh: () => boolean;
  ambil: (setelah: PosisiAntrean | null) => Promise<B[]>;
  /** true = seluruh jendela sudah dikerjakan. */
  kerjakan: (baris: B[]) => Promise<boolean>;
}): Promise<PosisiAntrean | null> {
  const mulai = o.kursor;
  let setelah = o.kursor;
  let simpan = o.kursor;
  let sudahPutar = !setelah;
  /** Sudah berputar dari posisi tersimpan ke depan antrean. */
  let dariDepanLagi = false;
  for (let j = 0; j < o.maksJendela; j++) {
    if (!o.boleh()) return simpan;
    const awal = setelah;
    let baris = await o.ambil(setelah);
    let ujung = baris.length < o.ukuran;
    if (dariDepanLagi && mulai && baris.length > 0 && !posisiSebelum(baris[baris.length - 1], mulai)) {
      // Satu lingkaran penuh: sisanya sudah dilihat di awal putaran ini.
      baris = baris.filter((b) => !posisiSetelah(b, mulai));
      ujung = true;
    }
    if (baris.length > 0) {
      if (!(await o.kerjakan(baris))) return awal;
      const akhir = baris[baris.length - 1];
      setelah = { d: akhir.diperbarui_pada, k: akhir.kode };
    }
    simpan = ujung ? null : setelah;
    if (ujung) {
      if (sudahPutar) return null;
      sudahPutar = true;
      dariDepanLagi = true;
      setelah = null;
    }
  }
  return simpan;
}

function bandingPosisi(b: { kode: string; diperbarui_pada: string }, p: PosisiAntrean): number {
  const tb = Date.parse(b.diperbarui_pada);
  const tp = Date.parse(p.d);
  if (Number.isFinite(tb) && Number.isFinite(tp) && tb !== tp) return tb < tp ? -1 : 1;
  return b.kode < p.k ? -1 : b.kode > p.k ? 1 : 0;
}
/** Baris ada SEBELUM posisi (urutan antrean). */
function posisiSebelum(b: { kode: string; diperbarui_pada: string }, p: PosisiAntrean): boolean {
  return bandingPosisi(b, p) < 0;
}
/** Baris ada SESUDAH posisi (urutan antrean). */
function posisiSetelah(b: { kode: string; diperbarui_pada: string }, p: PosisiAntrean): boolean {
  return bandingPosisi(b, p) > 0;
}

// ------------------------------------------------------------
// Daftar media → video
// ------------------------------------------------------------

/**
 * true bila item daftar media adalah VIDEO. TikTok & YouTube selalu
 * video; platform lain memberi media_type (diverifikasi 26 Sep 2026:
 * VIDEO / TEXT / IMAGE / CAROUSEL_ALBUM) — teks & foto dilewati karena
 * yang diminta angka tayangan per video.
 */
export function adalahMediaVideo(platform: string, jenis: string | null | undefined): boolean {
  const p = platformApp(platform);
  if (p === "tiktok" || p === "youtube") return true;
  const j = String(jenis ?? "").toUpperCase();
  return j.includes("VIDEO") || j.includes("REEL");
}

// ------------------------------------------------------------
// Video laporan (bukan lewat SuperApp) → siapa pemilik & ID platformnya
// ------------------------------------------------------------

/**
 * ID asli video di platformnya yang BISA diturunkan dari URL tanpa
 * bertanya: TikTok/YouTube/X memakai ID yang sama dengan yang ada di
 * alamatnya. Instagram/Threads/Facebook memakai ID media API yang
 * berbeda dari kode di alamat → harus dicari lewat daftar media profil.
 */
export function idPlatformDariUrl(platform: string, idDariUrl: string | null): string | null {
  const p = platformApp(platform);
  if (!idDariUrl) return null;
  if (p === "tiktok") return /^\d{15,22}$/.test(idDariUrl) ? idDariUrl : null;
  if (p === "youtube" || p === "twitter") return idDariUrl;
  return null;
}

/** Platform yang ID media API-nya harus dicari lewat daftar media profil. */
export function perluDaftarMedia(platform: string): boolean {
  const p = platformApp(platform);
  return p === "instagram" || p === "threads" || p === "facebook";
}

/** Platform yang bisa ditanyakan ke upload-post per video. */
export const PLATFORM_ANALITIK = ["tiktok", "instagram", "youtube", "facebook", "twitter", "threads"] as const;

export function platformDidukung(platform: string): boolean {
  return (PLATFORM_ANALITIK as readonly string[]).includes(platformApp(platform));
}
