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
    judul: String(post.post_title ?? post.post_caption ?? "").trim().slice(0, 300),
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
        galat: String(b.error ?? b.message ?? "").slice(0, 300),
      });
      continue;
    }
    const galat = typeof b.post_metrics_error === "string" ? b.post_metrics_error.trim() : "";
    if (galat) {
      hasil.blok.push({ ...dasar, status: "galat", galat: galat.slice(0, 300) });
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
    akun_username: teks(o.akun_username.replace(/^@/, ""), lama.akun_username).slice(0, 120),
    user_id: o.user_id ?? (lama.user_id == null ? null : Number(lama.user_id)),
    nama_akun: String(lama.nama_akun ?? "").slice(0, 200),
    judul: teks(o.judul, lama.judul).slice(0, 300),
    // URL lama dipertahankan: bentuknya sudah dipakai laporan/embed.
    url: teks(String(lama.url ?? ""), o.url).slice(0, 500),
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
// SIKLUS HARIAN — satu putaran penuh atas semua video, lalu ulang.
// ------------------------------------------------------------
//
// Tiap jalur berjalan dari id TERBARU ke terlama (jalur utama, kursor
// menurun). Video yang muncul SETELAH siklus mulai ditangani jalur SEGAR
// (kursor menaik) supaya unggahan hari ini tidak menunggu siklus besok.
// Siklus baru dimulai bila siklus lama sudah habis DAN sudah lewat
// JARAK_SIKLUS_MS sejak ia mulai. Bila suatu hari videonya terlalu banyak
// untuk kuota, siklus hanya memanjang (semua video tetap kebagian, tidak
// ada yang terlantar) — bukan memotong video terlama.

/** Siklus baru paling cepat 20 jam setelah siklus sebelumnya mulai (≈ tiap hari). */
export const JARAK_SIKLUS_MS = 20 * 3600_000;

export type JalurSiklus = {
  /** id tertinggi saat siklus mulai — batas atas jalur utama. */
  batas_atas: number;
  /** id terakhir yang dikerjakan jalur utama (menurun); null = belum mulai. */
  kursor: number | null;
  /** Jalur utama sudah sampai id terbawah. */
  habis: boolean;
  /** id tertinggi yang sudah dikerjakan jalur segar (di atas batas_atas). */
  kursor_segar: number;
};

export type HitungSiklus = {
  /** Permintaan analitik yang dikirim ke upload-post. */
  diminta: number;
  /** Video (per platform) yang angkanya tersimpan. */
  terisi: number;
  /** Video yang dijawab galat oleh upload-post (token kedaluwarsa, dihapus, …). */
  galat: number;
  /** Laporan yang dilewati karena bukan video akun tertaut / sudah segar. */
  dilewati: number;
};

export type SiklusMetrik = {
  v: 1;
  nomor: number;
  mulai: string;
  selesai: string | null;
  unggahan: JalurSiklus;
  laporan: JalurSiklus;
  /** Setelah upload-post menolak/kuota menipis: jangan bertanya sampai … */
  jeda_sampai: string | null;
  hitung: HitungSiklus;
  terakhir: string | null;
};

function jalurBaru(maksId: number): JalurSiklus {
  const atas = Math.max(0, Math.floor(maksId));
  return { batas_atas: atas, kursor: null, habis: atas <= 0, kursor_segar: atas };
}

export function siklusBaru(nomor: number, kiniMs: number, maksIdUnggahan: number, maksIdLaporan: number): SiklusMetrik {
  return {
    v: 1,
    nomor,
    mulai: new Date(kiniMs).toISOString(),
    selesai: null,
    unggahan: jalurBaru(maksIdUnggahan),
    laporan: jalurBaru(maksIdLaporan),
    jeda_sampai: null,
    hitung: { diminta: 0, terisi: 0, galat: 0, dilewati: 0 },
    terakhir: null,
  };
}

function angkaAtau(v: unknown, cadangan: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : cadangan;
}

function bacaJalur(v: unknown): JalurSiklus | null {
  const o = objek(v);
  if (!o) return null;
  const atas = Number(o.batas_atas);
  if (!Number.isFinite(atas) || atas < 0) return null;
  const kursor = o.kursor == null ? null : Number(o.kursor);
  if (kursor !== null && !Number.isFinite(kursor)) return null;
  return {
    batas_atas: Math.floor(atas),
    kursor,
    habis: o.habis === true,
    kursor_segar: Math.max(Math.floor(atas), Math.floor(angkaAtau(o.kursor_segar, atas))),
  };
}

/** Baca status tersimpan (teks JSON / objek). Bentuk rusak → null (mulai ulang). */
export function bacaSiklus(v: unknown): SiklusMetrik | null {
  let o: Record<string, unknown> | null = null;
  if (typeof v === "string") {
    try {
      o = objek(JSON.parse(v));
    } catch {
      return null;
    }
  } else {
    o = objek(v);
  }
  if (!o || o.v !== 1) return null;
  const unggahan = bacaJalur(o.unggahan);
  const laporan = bacaJalur(o.laporan);
  const mulai = typeof o.mulai === "string" && Number.isFinite(Date.parse(o.mulai)) ? o.mulai : null;
  if (!unggahan || !laporan || !mulai) return null;
  const h = objek(o.hitung) ?? {};
  return {
    v: 1,
    nomor: Math.max(1, Math.floor(angkaAtau(o.nomor, 1))),
    mulai,
    selesai: typeof o.selesai === "string" ? o.selesai : null,
    unggahan,
    laporan,
    jeda_sampai: typeof o.jeda_sampai === "string" ? o.jeda_sampai : null,
    hitung: {
      diminta: Math.max(0, angkaAtau(h.diminta, 0)),
      terisi: Math.max(0, angkaAtau(h.terisi, 0)),
      galat: Math.max(0, angkaAtau(h.galat, 0)),
      dilewati: Math.max(0, angkaAtau(h.dilewati, 0)),
    },
    terakhir: typeof o.terakhir === "string" ? o.terakhir : null,
  };
}

/**
 * Tentukan siklus yang berlaku sekarang: lanjutkan yang lama, atau mulai
 * yang baru bila yang lama sudah habis dan sudah ≥ JARAK_SIKLUS_MS.
 * Jeda karena kuota tetap dibawa ke siklus baru.
 */
export function aturSiklus(
  tersimpan: unknown,
  kiniMs: number,
  maksIdUnggahan: number,
  maksIdLaporan: number,
): { siklus: SiklusMetrik; baru: boolean } {
  const lama = bacaSiklus(tersimpan);
  if (!lama) return { siklus: siklusBaru(1, kiniMs, maksIdUnggahan, maksIdLaporan), baru: true };
  const habis = lama.unggahan.habis && lama.laporan.habis;
  if (habis && kiniMs - Date.parse(lama.mulai) >= JARAK_SIKLUS_MS) {
    const s = siklusBaru(lama.nomor + 1, kiniMs, maksIdUnggahan, maksIdLaporan);
    s.jeda_sampai = lama.jeda_sampai;
    return { siklus: s, baru: true };
  }
  if (habis && !lama.selesai) lama.selesai = new Date(kiniMs).toISOString();
  return { siklus: lama, baru: false };
}

/** id maksimum (inklusif) yang boleh diambil jalur utama berikutnya; < 1 = habis. */
export function batasUtama(j: JalurSiklus): number {
  return j.kursor == null ? j.batas_atas : j.kursor - 1;
}

/**
 * Majukan kursor jalur utama setelah satu jendela dikerjakan. `idTerkecil`
 * = id terkecil yang DIKERJAKAN di jendela itu (bukan sekadar dibaca).
 * `habisJendela` = kueri mengembalikan kurang dari yang diminta (dasar).
 */
export function majukanUtama(j: JalurSiklus, idTerkecil: number | null, sampaiDasar: boolean): JalurSiklus {
  const kursor = idTerkecil == null ? j.kursor : Math.min(idTerkecil, j.kursor ?? Number.POSITIVE_INFINITY);
  const habis = sampaiDasar || (kursor != null && kursor <= 1);
  return { ...j, kursor, habis };
}

/** Majukan kursor jalur segar (menaik). */
export function majukanSegar(j: JalurSiklus, idTerbesar: number | null): JalurSiklus {
  if (idTerbesar == null) return j;
  return { ...j, kursor_segar: Math.max(j.kursor_segar, idTerbesar) };
}

// ------------------------------------------------------------
// Pembagian kuota satu putaran
// ------------------------------------------------------------

/**
 * Bagi kuota permintaan satu putaran: jalur segar dulu (video baru harus
 * cepat punya angka), sisanya dibagi dua untuk kedua jalur utama; jatah
 * yang tak terpakai satu jalur dipakai jalur lain.
 */
export function bagiKuota(total: number): { segar: number; utamaLaporan: number } {
  const t = Math.max(0, Math.floor(total));
  const segar = Math.min(t, Math.max(1, Math.ceil(t * 0.3)));
  return { segar, utamaLaporan: Math.ceil((t - segar) / 2) };
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
