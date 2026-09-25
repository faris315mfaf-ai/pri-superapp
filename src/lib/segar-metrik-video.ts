// ============================================================
// PENYEGAR ANGKA PER VIDEO — HARIAN (25 Sep 2026). KHUSUS SERVER.
//
// Dipanggil penjadwal VPS tiap 5 menit (/api/cron/metrik-video). Tiap
// putaran mengerjakan sepotong antrean, lalu berhenti; putaran berikutnya
// melanjutkan dari kursor tersimpan (pengaturan_sistem). Satu SIKLUS =
// seluruh video sudah ditanyakan sekali → siklus berikutnya mulai ±20 jam
// setelah siklus itu mulai. Hasilnya: angka tiap video diperbarui tiap hari.
//
// Dua jalur video:
//   1. UNGGAHAN SuperApp (tvrku_post + request_id) → satu permintaan
//      per unggahan, semua platformnya sekaligus.
//   2. LAPORAN berkategori (laporan_video.keyword) yang BUKAN unggahan
//      SuperApp → video di akun tertaut anggota, ditanyakan lewat ID
//      aslinya. Video di akun yang tidak tersambung ke upload-post
//      dilewati — upload-post memang tidak bisa membacanya.
// Masing-masing punya jalur SEGAR (video yang muncul setelah siklus mulai)
// supaya video hari ini tidak menunggu siklus besok.
//
// Rem kuota (upload-post: 100 permintaan / 5 menit, dipakai bersama
// rekonsiliasi KPI & unggahan anggota):
//   • maksimal MAKS_PERMINTAAN per putaran (bawaan 40);
//   • berhenti bila header x-ratelimit-remaining menipis;
//   • ditolak 429 → seluruh penyegar berhenti sampai kuota pulih.
//
// Angka disimpan di tvr_video_metrik (kunci: kode video = platform + ID).
// Blok platform yang galat TIDAK menimpa angka bagus sebelumnya.
// ============================================================
import { supabase } from "@/lib/supabase";
import { kolomTabelAda } from "@/lib/kolom-struktur";
import { kodeMetrik } from "@/lib/insight-kategori";
import { akunDariTautan, idVideo, kanonikTautan } from "@/lib/tautan-video";
import { klienCache } from "@/lib/redis";
import { semuaBaris } from "@/lib/semua-baris";
import { KATEGORI_TETAP } from "@/lib/kategori-tetap";
import { analitikPostAsliUp, analitikPostLiveUp, daftarMediaUp, uploadPostSiap } from "@/lib/upload-post";
import {
  aturSiklus,
  bacaSiklus,
  bagiKuota,
  barisMetrikVideo,
  batasUtama,
  idPlatformDariUrl,
  kuotaMenipis,
  majukanSegar,
  majukanUtama,
  perluDaftarMedia,
  platformApp,
  platformDidukung,
  type BarisLama,
  type BatasUp,
  type BlokLive,
  type JalurSiklus,
  type JawabanLive,
  type KolomTambahan,
  type SiklusMetrik,
} from "@/lib/metrik-video-up";
import type { MetrikPost } from "@/lib/metrik-post-up";

type Db = ReturnType<typeof supabase>;

const KUNCI_SIKLUS = "metrik_video_siklus";
const KUNCI_LEASE = "metrik_video_lease";
/** Umur lease: sedikit di atas lama satu putaran + panggilan yang masih jalan. */
const UMUR_LEASE_MS = 290_000;
/** Maks permintaan analitik per putaran (5 menit). */
const MAKS_PERMINTAAN = Math.max(5, Math.min(90, Number(process.env.METRIK_VIDEO_PER_PUTARAN) || 40));
/** Anggaran waktu satu putaran (penjadwal memutus di 280 dtk). */
const ANGGARAN_MS = 200_000;
/** Permintaan yang berjalan bersamaan. */
const PARALEL = 4;
/** Unggahan semuda ini belum ditanya: platform masih memproses/menerbitkan. */
const UMUR_MIN_UNGGAHAN_MS = 30 * 60_000;
/** Baris yang dibaca per jendela kueri. */
const JENDELA = 100;
/** Ditolak 429 tanpa keterangan kapan pulih → tunggu selama ini. */
const JEDA_TOLAK_MS = 5 * 60_000;
/** Umur peta "alamat → ID media" per akun (Instagram/Threads/Facebook). */
const UMUR_PETA_MEDIA_MS = 20 * 3600_000;
/** Halaman daftar media maksimal per akun (100 video per halaman). */
const MAKS_HALAMAN_MEDIA = 2;

// ------------------------------------------------------------
// pengaturan_sistem: status siklus & lease
// ------------------------------------------------------------

async function bacaNilai(db: Db, kunci: string): Promise<string | null> {
  const { data } = await db.from("pengaturan_sistem").select("nilai").eq("kunci", kunci).maybeSingle();
  return data?.nilai == null ? null : String(data.nilai);
}

async function simpanSiklus(db: Db, s: SiklusMetrik): Promise<void> {
  const { error } = await db
    .from("pengaturan_sistem")
    .upsert({ kunci: KUNCI_SIKLUS, nilai: JSON.stringify(s) }, { onConflict: "kunci" });
  if (error) console.error("[metrik-video] simpan siklus:", error.message);
}

/** Status siklus terakhir (untuk ditampilkan di panel). */
export async function statusSiklusMetrik(): Promise<SiklusMetrik | null> {
  return bacaSiklus(await bacaNilai(supabase(), KUNCI_SIKLUS));
}

/** Ambil lease secara atomik; null bila sedang dipegang putaran lain. */
async function ambilLease(db: Db): Promise<string | null> {
  const kini = new Date().toISOString();
  const sampai = new Date(Date.now() + UMUR_LEASE_MS).toISOString();
  await db
    .from("pengaturan_sistem")
    .upsert({ kunci: KUNCI_LEASE, nilai: "" }, { onConflict: "kunci", ignoreDuplicates: true });
  // Menang hanya bila lease kosong ATAU sudah kedaluwarsa (ISO dibanding leksikal).
  const { data } = await db
    .from("pengaturan_sistem")
    .update({ nilai: sampai })
    .eq("kunci", KUNCI_LEASE)
    .lt("nilai", kini)
    .select("kunci");
  return data && data.length > 0 ? sampai : null;
}

async function lepasLease(db: Db, lease: string): Promise<void> {
  await db
    .from("pengaturan_sistem")
    .update({ nilai: "" })
    .eq("kunci", KUNCI_LEASE)
    .eq("nilai", lease)
    .then(
      () => undefined,
      () => undefined,
    );
}

// ------------------------------------------------------------
// Pengendali kuota satu putaran
// ------------------------------------------------------------

class Pengendali {
  private sisa: number;
  private sisaJalur = Number.POSITIVE_INFINITY;
  readonly tenggat: number;
  berhenti = false;
  alasanBerhenti = "";
  /** Diisi bila upload-post menolak/kuota menipis: jangan bertanya sampai … */
  jedaSampai: number | null = null;
  batasTerakhir: BatasUp | null = null;
  diminta = 0;
  /** Dipanggil tiap permintaan diklaim (pencatat jatah tombol manual). */
  private readonly saatAmbil?: () => void;
  /** Seberapa jauh satu panggilan boleh melewati tenggat putaran. */
  private readonly lebihMs: number;

  constructor(maks: number, anggaranMs: number, opsi: { saatAmbil?: () => void; lebihMs?: number } = {}) {
    this.sisa = maks;
    this.tenggat = Date.now() + anggaranMs;
    this.saatAmbil = opsi.saatAmbil;
    this.lebihMs = opsi.lebihMs ?? 60_000;
  }

  mulaiJalur(jatah: number) {
    this.sisaJalur = Math.max(0, jatah);
  }

  get sisaPermintaan(): number {
    return Math.max(0, Math.min(this.sisa, this.sisaJalur));
  }

  /** Sisa waktu (ms) — dipakai sebagai batas waktu tiap panggilan. */
  sisaWaktu(): number {
    return this.tenggat - Date.now();
  }

  /**
   * Klaim satu permintaan. false = kuota/waktu habis atau sedang direm.
   * `minWaktuMs`: permintaan hanya dimulai bila sisa waktu putaran masih
   * cukup — memulai lalu memutusnya di tengah jalan membuang kuota.
   */
  ambil(minWaktuMs = 8_000): boolean {
    if (this.berhenti || this.sisa <= 0 || this.sisaJalur <= 0) return false;
    if (this.sisaWaktu() < minWaktuMs) return false;
    this.sisa -= 1;
    this.sisaJalur -= 1;
    this.diminta += 1;
    this.saatAmbil?.();
    return true;
  }

  /** Batas waktu satu panggilan: boleh melewati tenggat sedikit (lebihMs). */
  batasPanggilan(maksMs: number): number {
    return Math.max(8_000, Math.min(maksMs, this.sisaWaktu() + this.lebihMs));
  }

  catatBatas(b: BatasUp | undefined | null) {
    if (!b) return;
    this.batasTerakhir = b;
    if (kuotaMenipis(b)) {
      this.rem("kuota upload-post menipis", b.reset_ms);
    }
  }

  rem(alasan: string, sampaiMs: number | null | undefined) {
    this.berhenti = true;
    if (!this.alasanBerhenti) this.alasanBerhenti = alasan;
    const sampai = sampaiMs && sampaiMs > Date.now() ? Math.min(sampaiMs, Date.now() + 30 * 60_000) : Date.now() + JEDA_TOLAK_MS;
    this.jedaSampai = Math.max(this.jedaSampai ?? 0, sampai);
  }

  /** Tangani galat panggilan upload-post. true = galat karena kuota (item ditunda). */
  tanganiGalat(e: unknown): boolean {
    const g = e as { status?: number; batas?: BatasUp };
    if (g?.batas) this.batasTerakhir = g.batas;
    if (g?.status === 429) {
      this.rem("upload-post menolak (429)", g.batas?.reset_ms ?? null);
      return true;
    }
    return false;
  }
}

// ------------------------------------------------------------
// Konteks: kolom opsional, profil & akun tertaut
// ------------------------------------------------------------

type Konteks = {
  kolom: KolomTambahan;
  /** user_id → profile_key upload-post */
  profilPer: Map<number, string>;
  /** "user_id|platform" → username akun tertaut */
  akunUser: Map<string, string>;
  /** "platform|username" → user_id pemilik (hanya akun yang tersambung) */
  pemilikAkun: Map<string, number>;
  /** "user_id|platform" yang tersambung ke upload-post */
  tersambung: Set<string>;
  /** Kategori yang bisa tampil di halaman (huruf besar). */
  kategori: Set<string>;
};

async function muatKonteks(db: Db): Promise<Konteks> {
  const [fav, sum, men] = await Promise.all([
    kolomTabelAda("tvr_video_metrik", "favorit"),
    kolomTabelAda("tvr_video_metrik", "sumber"),
    kolomTabelAda("tvr_video_metrik", "mentah"),
  ]);
  const [{ data: profil }, akun, { data: kw }] = await Promise.all([
    db
      .from("sosmed_profile")
      .select("id, user_id, profile_key")
      .eq("jenis", "pengguna")
      .eq("penyedia", "upload-post")
      .order("id", { ascending: true }),
    semuaBaris<{ user_id: number | string; platform: string; username: string | null; terhubung: boolean | null }>(
      (dari, sampai) =>
        db
          .from("akun_tvr_user")
          .select("user_id, platform, username, terhubung")
          .eq("aktif", true)
          .order("id", { ascending: true })
          .range(dari, sampai) as unknown as PromiseLike<{
          data: { user_id: number | string; platform: string; username: string | null; terhubung: boolean | null }[] | null;
          error: { message: string } | null;
        }>,
      10_000,
    ),
    db.from("keyword_wajib").select("keyword"),
  ]);
  const profilPer = new Map<number, string>();
  for (const p of profil ?? []) {
    const uid = Number(p.user_id);
    if (uid > 0 && p.profile_key && !profilPer.has(uid)) profilPer.set(uid, String(p.profile_key));
  }
  const akunUser = new Map<string, string>();
  const pemilikAkun = new Map<string, number>();
  const tersambung = new Set<string>();
  for (const a of akun) {
    const uid = Number(a.user_id);
    const pf = platformApp(String(a.platform ?? ""));
    const nama = String(a.username ?? "").replace(/^@/, "").trim();
    if (!uid || !pf) continue;
    const k = `${uid}|${pf}`;
    // Akun yang tersambung didahulukan sebagai nama akun video.
    if (nama && (!akunUser.has(k) || a.terhubung === true)) akunUser.set(k, nama);
    if (a.terhubung === true) {
      tersambung.add(k);
      if (nama) pemilikAkun.set(`${pf}|${nama.toLowerCase()}`, uid);
    }
  }
  const kategori = new Set<string>(KATEGORI_TETAP.map((k) => k.toUpperCase()));
  for (const k of kw ?? []) {
    const n = String(k.keyword ?? "").trim().toUpperCase();
    if (n) kategori.add(n);
  }
  return { kolom: { favorit: fav, sumber: sum, mentah: men }, profilPer, akunUser, pemilikAkun, tersambung, kategori };
}

// ------------------------------------------------------------
// Penulisan tvr_video_metrik
// ------------------------------------------------------------

type DraftBaris = {
  kode: string;
  platform: string;
  url: string;
  metrik: MetrikPost;
  mentah: Record<string, unknown> | null;
  akun_username: string;
  user_id: number | null;
  judul: string;
  waktu_posting: string | null;
};

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

/** Simpan draf (satu baris per kode; draf terakhir menang). Mengembalikan jumlah tersimpan. */
async function tulisDraf(db: Db, draf: DraftBaris[], kolom: KolomTambahan): Promise<number> {
  const perKode = new Map<string, DraftBaris>();
  for (const d of draf) perKode.set(d.kode, d);
  if (perKode.size === 0) return 0;
  const kini = new Date().toISOString();
  let tersimpan = 0;
  for (const bagian of potong([...perKode.values()], 200)) {
    const { data: lama } = await db
      .from("tvr_video_metrik")
      .select("kode, akun_username, nama_akun, judul, url, waktu_posting, user_id")
      .in(
        "kode",
        bagian.map((d) => d.kode),
      );
    const petaLama = new Map<string, BarisLama>();
    for (const l of lama ?? []) petaLama.set(String(l.kode), l as BarisLama);
    const baris = bagian.map((d) =>
      barisMetrikVideo({ ...d, kini, lama: petaLama.get(d.kode) ?? null, kolom }),
    );
    const { error } = await db.from("tvr_video_metrik").upsert(baris, { onConflict: "kode" });
    if (error) {
      console.error("[metrik-video] simpan angka:", error.message);
      continue;
    }
    tersimpan += baris.length;
  }
  return tersimpan;
}

/** Draf dari satu blok "ok". null = alamatnya tidak memuat ID video. */
function drafDariBlok(
  blok: BlokLive,
  o: { kodeDikenal?: string; urlCadangan?: string; user_id: number | null; akun: string; judul: string; waktu: string | null },
): DraftBaris | null {
  if (blok.status !== "ok" || !blok.metrik) return null;
  const mentahUrl = blok.post_url || blok.metrik.post_url || o.urlCadangan || "";
  const kode = o.kodeDikenal ?? (mentahUrl ? kodeMetrik(blok.platform, mentahUrl) : null);
  if (!kode || !mentahUrl) return null;
  // Bentuk kanonik (tanpa ?utm_… dan sejenisnya), sama dengan yang dicatat laporan.
  const url = kanonikTautan(blok.platform, mentahUrl, o.akun || null);
  return {
    kode,
    platform: blok.platform,
    url,
    metrik: blok.metrik,
    mentah: blok.mentah,
    akun_username: o.akun || akunDariTautan(blok.platform, url) || "",
    user_id: o.user_id,
    judul: o.judul,
    waktu_posting: o.waktu,
  };
}

// ------------------------------------------------------------
// Jalur 1: unggahan SuperApp
// ------------------------------------------------------------

type BarisUnggahan = {
  id: number | string;
  user_id: number | string;
  judul: string | null;
  request_id: string | null;
  jadwal: string | null;
  dibuat_pada: string;
};

const POLA_REQUEST_UP = /^[0-9a-f]{32}$/i;

type HasilItem = "selesai" | "tunda";

export type HasilSatuUnggahan = {
  post_id: number;
  profil: string;
  judul: string;
  per_platform: { platform: string; status: string; galat: string; tayangan: number | null; post_url: string }[];
  tersimpan: number;
};

/**
 * Tanya SATU unggahan ke upload-post, kumpulkan drafnya. "tunda" hanya
 * bila ditolak karena kuota (dicoba lagi putaran berikutnya); galat lain
 * (dihapus, token kedaluwarsa) = selesai untuk siklus ini.
 */
async function kerjakanUnggahan(
  p: BarisUnggahan,
  ctx: Konteks,
  ctrl: Pengendali,
  draf: DraftBaris[],
  catat: { terisi: number; galat: number },
): Promise<{ hasil: HasilItem; jawaban?: JawabanLive; galat?: string }> {
  const rid = String(p.request_id ?? "").trim();
  if (!POLA_REQUEST_UP.test(rid)) return { hasil: "selesai" };
  if (p.jadwal && Date.parse(String(p.jadwal)) > Date.now()) return { hasil: "selesai" };
  // Satu unggahan = semua platform sekaligus (biasanya 3–10 dtk, Facebook
  // yang lambat bisa > 1 menit) → hanya dimulai bila waktunya masih lapang.
  if (!ctrl.ambil(30_000)) return { hasil: "tunda" };
  try {
    const { jawaban, batas } = await analitikPostLiveUp(rid, ctrl.batasPanggilan(90_000));
    ctrl.catatBatas(batas);
    const uid = Number(p.user_id) || null;
    for (const b of jawaban.blok) {
      if (b.status !== "ok") {
        if (b.status === "galat") catat.galat += 1;
        continue;
      }
      const d = drafDariBlok(b, {
        user_id: uid,
        akun: uid ? (ctx.akunUser.get(`${uid}|${b.platform}`) ?? "") : "",
        judul: jawaban.judul || String(p.judul ?? ""),
        waktu: jawaban.waktu_unggah ?? (p.jadwal ? String(p.jadwal) : String(p.dibuat_pada)),
      });
      if (d) {
        draf.push(d);
        catat.terisi += 1;
      }
    }
    return { hasil: "selesai", jawaban };
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    if (ctrl.tanganiGalat(e)) return { hasil: "tunda", galat: pesan };
    catat.galat += 1;
    return { hasil: "selesai", galat: pesan };
  }
}

// ------------------------------------------------------------
// Jalur 2: video laporan berkategori (bukan lewat SuperApp)
// ------------------------------------------------------------

type BarisLaporan = {
  id: number | string;
  user_id: number | string;
  platform: string;
  url_video: string;
  keyword: string | null;
  tvrku_post_id: number | string | null;
};

/**
 * Mode UJI KERING (dry-run): baca database & tanya upload-post sungguhan,
 * tetapi TIDAK menulis apa pun (tanpa lease, status siklus, angka, cache
 * Redis). Dipakai memeriksa pencocokan data asli sebelum rilis.
 */
let ujiKeringAktif = false;

/** Peta "kode video → ID media" per akun (Instagram/Threads/Facebook). */
const petaMedia = new Map<string, { sampai: number; peta: Record<string, string> }>();
/** Satu penyusunan peta per akun pada satu waktu (bukan empat bersamaan). */
const sedangSusun = new Map<string, Promise<Record<string, string> | "tunda">>();

async function bacaPetaMedia(kunci: string): Promise<Record<string, string> | null> {
  const m = petaMedia.get(kunci);
  if (m && m.sampai > Date.now()) return m.peta;
  const redis = klienCache();
  if (!redis) return null;
  try {
    const r = await redis.get<Record<string, string>>(`mv:media:${kunci}`);
    if (r && typeof r === "object" && !Array.isArray(r)) {
      petaMedia.set(kunci, { sampai: Date.now() + UMUR_PETA_MEDIA_MS, peta: r });
      return r;
    }
  } catch {
    // Redis bermasalah → susun ulang dari upload-post.
  }
  return null;
}

async function simpanPetaMedia(kunci: string, peta: Record<string, string>, umurMs: number, keRedis: boolean): Promise<void> {
  if (petaMedia.size > 2000) petaMedia.clear();
  petaMedia.set(kunci, { sampai: Date.now() + umurMs, peta });
  const redis = keRedis && !ujiKeringAktif ? klienCache() : null;
  if (!redis) return;
  try {
    await redis.set(`mv:media:${kunci}`, peta, { ex: Math.floor(umurMs / 1000) });
  } catch {
    // Gagal menyimpan cache bukan alasan menghentikan penyegaran.
  }
}

/**
 * Susun peta satu akun dari daftar medianya (maks 2 halaman = 200 video
 * terbaru). Peta hanya disimpan bila UTUH — kuota yang habis di tengah
 * jalan = "tunda" (dicoba lagi putaran berikutnya), bukan peta setengah
 * yang membuat video di halaman kedua dianggap tidak ada.
 */
async function susunPetaMedia(profil: string, platform: string, kunci: string, ctrl: Pengendali): Promise<Record<string, string> | "tunda"> {
  const peta: Record<string, string> = {};
  let cursor: string | null = null;
  for (let halaman = 0; halaman < MAKS_HALAMAN_MEDIA; halaman++) {
    if (!ctrl.ambil(15_000)) return "tunda";
    try {
      const r = await daftarMediaUp(profil, platform, {
        limit: 100,
        cursor,
        timeoutMs: ctrl.batasPanggilan(25_000),
      });
      ctrl.catatBatas(r.batas);
      for (const m of r.media) {
        const k = m.permalink ? kodeMetrik(platform, m.permalink) : null;
        if (k && m.id) peta[k] = m.id;
      }
      if (!r.next_cursor || r.media.length === 0) break;
      cursor = r.next_cursor;
    } catch (e) {
      if (ctrl.tanganiGalat(e)) return "tunda";
      // Akun tidak bisa dibaca (token kedaluwarsa, akun dilepas, …): ingat
      // SEJAM di memori saja, supaya tidak ditanya berulang tiap laporan
      // tetapi segera dicoba lagi bila ternyata hanya gangguan sesaat.
      await simpanPetaMedia(kunci, {}, 3600_000, false);
      return {};
    }
  }
  await simpanPetaMedia(kunci, peta, UMUR_PETA_MEDIA_MS, true);
  return peta;
}

/**
 * ID media Instagram/Threads/Facebook untuk satu kode video, dicari lewat
 * daftar media akun pemiliknya. "tunda" = kuota habis/direm; null = tidak
 * ditemukan di 200 video terbaru akun itu.
 */
async function idMediaUntuk(
  profil: string,
  platform: string,
  kode: string,
  ctrl: Pengendali,
): Promise<string | null | "tunda"> {
  const kunci = `${profil}|${platform}`;
  const ada = await bacaPetaMedia(kunci);
  if (ada) return ada[kode] ?? null;
  let jalan = sedangSusun.get(kunci);
  if (!jalan) {
    jalan = susunPetaMedia(profil, platform, kunci, ctrl).finally(() => sedangSusun.delete(kunci));
    sedangSusun.set(kunci, jalan);
  }
  const peta = await jalan;
  if (peta === "tunda") return "tunda";
  return peta[kode] ?? null;
}

type ItemLaporan = { laporan: BarisLaporan; kode: string; platform: string; pemilik: number; profil: string };

/** Saring & lengkapi laporan: hanya video akun tersambung yang bisa ditanyakan. */
function siapkanLaporan(l: BarisLaporan, ctx: Konteks): ItemLaporan | null {
  if (l.tvrku_post_id != null && Number(l.tvrku_post_id) > 0) return null; // ditangani jalur unggahan
  if (!ctx.kategori.has(String(l.keyword ?? "").trim().toUpperCase())) return null;
  const platform = platformApp(String(l.platform ?? ""));
  const url = String(l.url_video ?? "");
  if (!platformDidukung(platform) || !url) return null;
  const kode = kodeMetrik(platform, url);
  if (!kode) return null;
  // Link bagikan Facebook (/share/r/<kode acak>) tidak memuat ID video,
  // jadi tidak mungkin cocok dengan daftar media — jangan buang kuota.
  if (platform === "facebook" && !/^fb_\d{6,}$/.test(kode)) return null;
  const pelapor = Number(l.user_id);
  const nama = akunDariTautan(platform, url);
  let pemilik = 0;
  if (nama) {
    // Alamat menyebut akunnya: pemiliknya harus anggota yang akunnya
    // tersambung — bukan sekadar si pelapor (video bisa milik orang lain).
    pemilik = ctx.pemilikAkun.get(`${platform}|${nama.toLowerCase()}`) ?? 0;
  } else if (ctx.tersambung.has(`${pelapor}|${platform}`)) {
    pemilik = pelapor;
  }
  const profil = pemilik ? ctx.profilPer.get(pemilik) : undefined;
  if (!pemilik || !profil) return null;
  return { laporan: l, kode, platform, pemilik, profil };
}

async function kerjakanLaporan(
  it: ItemLaporan,
  ctx: Konteks,
  ctrl: Pengendali,
  draf: DraftBaris[],
  catat: { terisi: number; galat: number; dilewati: number },
): Promise<HasilItem> {
  const url = String(it.laporan.url_video);
  let ppid: string | null = idPlatformDariUrl(it.platform, idVideo(it.platform, url));
  if (!ppid && perluDaftarMedia(it.platform)) {
    const r = await idMediaUntuk(it.profil, it.platform, it.kode, ctrl);
    if (r === "tunda") return "tunda";
    ppid = r;
  }
  if (!ppid) {
    catat.dilewati += 1;
    return "selesai";
  }
  if (!ctrl.ambil(15_000)) return "tunda";
  try {
    const { jawaban, batas } = await analitikPostAsliUp(ppid, it.platform, it.profil, ctrl.batasPanggilan(30_000));
    ctrl.catatBatas(batas);
    const blok = jawaban.blok.find((b) => b.platform === it.platform) ?? jawaban.blok[0];
    const d = blok
      ? drafDariBlok(blok, {
          kodeDikenal: it.kode,
          urlCadangan: url,
          user_id: it.pemilik,
          akun: ctx.akunUser.get(`${it.pemilik}|${it.platform}`) ?? "",
          judul: jawaban.judul,
          waktu: jawaban.waktu_unggah,
        })
      : null;
    if (d) {
      draf.push(d);
      catat.terisi += 1;
    } else {
      catat.galat += 1;
    }
    return "selesai";
  } catch (e) {
    if (ctrl.tanganiGalat(e)) return "tunda";
    catat.galat += 1;
    return "selesai";
  }
}

// ------------------------------------------------------------
// Penggerak jalur
// ------------------------------------------------------------

/**
 * Kerjakan daftar item berurutan dalam kelompok PARALEL. Mengembalikan
 * hasil per item (sejajar). Item setelah berhenti = "tunda".
 */
async function kerjakanKelompok<T>(
  items: T[],
  kerja: (t: T) => Promise<HasilItem>,
  ctrl: Pengendali,
): Promise<HasilItem[]> {
  const hasil: HasilItem[] = new Array(items.length).fill("tunda");
  for (let i = 0; i < items.length; i += PARALEL) {
    if (ctrl.berhenti || ctrl.sisaWaktu() < 8_000) break;
    const kelompok = items.slice(i, i + PARALEL);
    const r = await Promise.all(kelompok.map((t) => kerja(t)));
    r.forEach((h, j) => (hasil[i + j] = h));
    // Kuota jalur habis → sisa item tidak akan mendapat jatah.
    if (ctrl.sisaPermintaan <= 0 && r.some((h) => h === "tunda")) break;
  }
  return hasil;
}

/** id terakhir dari awalan item yang "selesai" berturut-turut; null bila tak ada. */
function ujungSelesai<T extends { id: number | string }>(items: T[], hasil: HasilItem[]): number | null {
  let ujung: number | null = null;
  for (let i = 0; i < items.length; i++) {
    if (hasil[i] !== "selesai") break;
    ujung = Number(items[i].id);
  }
  return ujung;
}

type Catatan = { terisi: number; galat: number; dilewati: number };

/** Satu jalur UNGGAHAN (segar: menaik di atas batas_atas; utama: menurun). */
async function jalurUnggahan(
  db: Db,
  jalur: JalurSiklus,
  segar: boolean,
  ctx: Konteks,
  ctrl: Pengendali,
  draf: DraftBaris[],
  catat: Catatan,
): Promise<JalurSiklus> {
  let j = jalur;
  for (let putar = 0; putar < 20; putar++) {
    if (ctrl.berhenti || ctrl.sisaPermintaan <= 0 || ctrl.sisaWaktu() < 8_000) break;
    if (!segar && (j.habis || batasUtama(j) < 1)) {
      j = { ...j, habis: true };
      break;
    }
    let q = db
      .from("tvrku_post")
      .select("id, user_id, judul, request_id, jadwal, dibuat_pada")
      .not("request_id", "is", null);
    q = segar
      ? q.gt("id", j.kursor_segar).order("id", { ascending: true })
      : q.lte("id", batasUtama(j)).order("id", { ascending: false });
    const { data, error } = await q.limit(JENDELA);
    if (error) {
      console.error("[metrik-video] baca unggahan:", error.message);
      break;
    }
    let baris = (data ?? []) as BarisUnggahan[];
    if (segar) {
      // Unggahan yang terlalu muda menghentikan jalur segar (urut naik):
      // yang di belakangnya pasti lebih muda lagi.
      const batasMuda = Date.now() - UMUR_MIN_UNGGAHAN_MS;
      const i = baris.findIndex((b) => Date.parse(String(b.dibuat_pada)) > batasMuda);
      if (i >= 0) baris = baris.slice(0, i);
    }
    if (baris.length === 0) {
      if (!segar) j = majukanUtama(j, null, true);
      break;
    }
    const hasil = await kerjakanKelompok(
      baris,
      async (p) => (await kerjakanUnggahan(p, ctx, ctrl, draf, catat)).hasil,
      ctrl,
    );
    const ujung = ujungSelesai(baris, hasil);
    const semuaSelesai = hasil.every((h) => h === "selesai");
    if (segar) {
      j = majukanSegar(j, ujung);
    } else {
      j = majukanUtama(j, ujung, semuaSelesai && (data ?? []).length < JENDELA);
    }
    if (!semuaSelesai) break;
  }
  return j;
}

/** Satu jalur LAPORAN berkategori. */
async function jalurLaporan(
  db: Db,
  jalur: JalurSiklus,
  segar: boolean,
  siklusMulai: string,
  ctx: Konteks,
  ctrl: Pengendali,
  draf: DraftBaris[],
  catat: Catatan,
  sudahKode: Set<string>,
): Promise<JalurSiklus> {
  let j = jalur;
  for (let putar = 0; putar < 30; putar++) {
    if (ctrl.berhenti || ctrl.sisaWaktu() < 8_000) break;
    if (!segar && (j.habis || batasUtama(j) < 1)) {
      j = { ...j, habis: true };
      break;
    }
    let q = db
      .from("laporan_video")
      .select("id, user_id, platform, url_video, keyword, tvrku_post_id")
      .not("keyword", "is", null);
    q = segar
      ? q.gt("id", j.kursor_segar).order("id", { ascending: true })
      : q.lte("id", batasUtama(j)).order("id", { ascending: false });
    const { data, error } = await q.limit(JENDELA);
    if (error) {
      console.error("[metrik-video] baca laporan:", error.message);
      break;
    }
    const baris = (data ?? []) as BarisLaporan[];
    if (baris.length === 0) {
      if (!segar) j = majukanUtama(j, null, true);
      break;
    }
    // Video yang sudah disegarkan siklus ini (oleh jalur unggahan atau
    // laporan lain atas video yang sama) tidak ditanya lagi.
    const siap = baris.map((l) => siapkanLaporan(l, ctx));
    const kodeCek = [...new Set(siap.filter((x): x is ItemLaporan => x !== null).map((x) => x.kode))].filter(
      (k) => !sudahKode.has(k),
    );
    if (kodeCek.length > 0) {
      const { data: segarData } = await db
        .from("tvr_video_metrik")
        .select("kode, diperbarui_pada")
        .in("kode", kodeCek)
        .gte("diperbarui_pada", siklusMulai);
      for (const m of segarData ?? []) sudahKode.add(String(m.kode));
    }
    // Tanpa kuota tersisa, jendela tetap disaring: laporan yang memang
    // tidak butuh permintaan boleh dilewati kursornya.
    const hasil = await kerjakanKelompok(
      baris.map((l, i) => ({ l, it: siap[i] })),
      async ({ it }) => {
        if (!it) {
          catat.dilewati += 1;
          return "selesai";
        }
        if (sudahKode.has(it.kode)) {
          catat.dilewati += 1;
          return "selesai";
        }
        const h = await kerjakanLaporan(it, ctx, ctrl, draf, catat);
        if (h === "selesai") sudahKode.add(it.kode);
        return h;
      },
      ctrl,
    );
    const ujung = ujungSelesai(baris, hasil);
    const semuaSelesai = hasil.every((h) => h === "selesai");
    if (segar) {
      j = majukanSegar(j, ujung);
    } else {
      j = majukanUtama(j, ujung, semuaSelesai && baris.length < JENDELA);
    }
    if (!semuaSelesai) break;
  }
  return j;
}

// ------------------------------------------------------------
// Putaran (dipanggil cron)
// ------------------------------------------------------------

export type RingkasanPutaran = {
  jalan: boolean;
  alasan?: string;
  siklus?: number;
  siklus_baru?: boolean;
  siklus_selesai?: boolean;
  diminta: number;
  terisi: number;
  tersimpan: number;
  galat: number;
  dilewati: number;
  jeda_sampai?: string | null;
  sisa_kuota?: number | null;
  durasi_ms: number;
  /** Hanya mode uji kering: baris yang AKAN disimpan + status siklus. */
  uji?: { baris: DraftBaris[]; siklus: SiklusMetrik };
};

async function idTerbesar(db: Db, tabel: "tvrku_post" | "laporan_video"): Promise<number> {
  let q = db.from(tabel).select("id").order("id", { ascending: false }).limit(1);
  if (tabel === "laporan_video") q = q.not("keyword", "is", null);
  const { data, error } = await q;
  if (error) return 0;
  return Number(data?.[0]?.id ?? 0) || 0;
}

export async function putaranSegarMetrik(
  opsi: { anggaranMs?: number; maksPermintaan?: number; ujiKering?: boolean } = {},
): Promise<RingkasanPutaran> {
  const mulai = Date.now();
  const kosong: RingkasanPutaran = { jalan: false, diminta: 0, terisi: 0, tersimpan: 0, galat: 0, dilewati: 0, durasi_ms: 0 };
  if (!uploadPostSiap()) return { ...kosong, alasan: "upload-post belum tersambung" };
  const kering = opsi.ujiKering === true;
  ujiKeringAktif = kering;
  const db = supabase();
  const lease = kering ? "uji-kering" : await ambilLease(db);
  if (!lease) return { ...kosong, alasan: "putaran lain masih berjalan", durasi_ms: Date.now() - mulai };
  const ujiBaris: DraftBaris[] = [];
  try {
    const [maksUnggahan, maksLaporan, tersimpan] = await Promise.all([
      idTerbesar(db, "tvrku_post"),
      idTerbesar(db, "laporan_video"),
      bacaNilai(db, KUNCI_SIKLUS),
    ]);
    const { siklus, baru } = aturSiklus(tersimpan, Date.now(), maksUnggahan, maksLaporan);
    if (siklus.jeda_sampai && Date.parse(siklus.jeda_sampai) > Date.now()) {
      if (!kering) await simpanSiklus(db, siklus);
      return {
        ...kosong,
        alasan: "menunggu kuota upload-post pulih",
        siklus: siklus.nomor,
        jeda_sampai: siklus.jeda_sampai,
        durasi_ms: Date.now() - mulai,
      };
    }
    siklus.jeda_sampai = null;
    const ctx = await muatKonteks(db);
    const ctrl = new Pengendali(opsi.maksPermintaan ?? MAKS_PERMINTAAN, opsi.anggaranMs ?? ANGGARAN_MS);
    const catat: Catatan = { terisi: 0, galat: 0, dilewati: 0 };
    const sudahKode = new Set<string>();
    let tersimpanN = 0;
    const draf: DraftBaris[] = [];
    const simpanSementara = async () => {
      const potongan = draf.splice(0, draf.length);
      siklus.terakhir = new Date().toISOString();
      if (kering) {
        ujiBaris.push(...potongan);
        return;
      }
      tersimpanN += await tulisDraf(db, potongan, ctx.kolom);
      await simpanSiklus(db, siklus);
    };

    const kuota = bagiKuota(ctrl.sisaPermintaan);
    // 1. Video BARU dulu (muncul setelah siklus mulai).
    ctrl.mulaiJalur(kuota.segar);
    siklus.unggahan = await jalurUnggahan(db, siklus.unggahan, true, ctx, ctrl, draf, catat);
    siklus.laporan = await jalurLaporan(db, siklus.laporan, true, siklus.mulai, ctx, ctrl, draf, catat, sudahKode);
    await simpanSementara();
    // 2. Laporan berkategori (yang tampil di halaman TV Rakyat Nasional).
    ctrl.mulaiJalur(Math.max(kuota.utamaLaporan, 0));
    siklus.laporan = await jalurLaporan(db, siklus.laporan, false, siklus.mulai, ctx, ctrl, draf, catat, sudahKode);
    await simpanSementara();
    // 3. Seluruh unggahan SuperApp — memakai semua sisa kuota.
    ctrl.mulaiJalur(Number.POSITIVE_INFINITY);
    siklus.unggahan = await jalurUnggahan(db, siklus.unggahan, false, ctx, ctrl, draf, catat);
    // Laporan utama boleh memakai kuota yang tersisa bila unggahan sudah habis.
    if (!ctrl.berhenti && ctrl.sisaPermintaan > 0 && !siklus.laporan.habis) {
      siklus.laporan = await jalurLaporan(db, siklus.laporan, false, siklus.mulai, ctx, ctrl, draf, catat, sudahKode);
    }

    siklus.hitung = {
      diminta: siklus.hitung.diminta + ctrl.diminta,
      terisi: siklus.hitung.terisi + catat.terisi,
      galat: siklus.hitung.galat + catat.galat,
      dilewati: siklus.hitung.dilewati + catat.dilewati,
    };
    if (ctrl.jedaSampai) siklus.jeda_sampai = new Date(ctrl.jedaSampai).toISOString();
    const habis = siklus.unggahan.habis && siklus.laporan.habis;
    if (habis && !siklus.selesai) siklus.selesai = new Date().toISOString();
    await simpanSementara();
    return {
      jalan: true,
      alasan: ctrl.alasanBerhenti || undefined,
      siklus: siklus.nomor,
      siklus_baru: baru,
      siklus_selesai: habis,
      diminta: ctrl.diminta,
      terisi: catat.terisi,
      tersimpan: tersimpanN,
      galat: catat.galat,
      dilewati: catat.dilewati,
      jeda_sampai: siklus.jeda_sampai,
      sisa_kuota: ctrl.batasTerakhir?.sisa ?? null,
      durasi_ms: Date.now() - mulai,
      uji: kering ? { baris: ujiBaris, siklus } : undefined,
    };
  } catch (e) {
    console.error("[metrik-video] putaran:", e);
    return { ...kosong, jalan: true, alasan: e instanceof Error ? e.message : "gagal", durasi_ms: Date.now() - mulai };
  } finally {
    if (!kering) await lepasLease(db, lease);
    ujiKeringAktif = false;
  }
}

// ------------------------------------------------------------
// Tarik SEKARANG (tombol di panel) — satu unggahan / satu kategori
// ------------------------------------------------------------

/** Angka yang lebih muda dari ini tidak ditarik ulang oleh tombol kategori. */
const SEGAR_KATEGORI_MS = 6 * 3600_000;
/** Maks permintaan satu tekan tombol kategori. */
const MAKS_PER_TEKAN = 15;

/** Rem bersama tombol manual: maks 20 permintaan / 5 menit untuk semua orang. */
const jejakManual: number[] = [];
const MAKS_MANUAL = 20;
const JENDELA_MANUAL_MS = 5 * 60_000;

function jatahManual(n: number): number {
  const kini = Date.now();
  while (jejakManual.length > 0 && kini - jejakManual[0] > JENDELA_MANUAL_MS) jejakManual.shift();
  return Math.max(0, Math.min(n, MAKS_MANUAL - jejakManual.length));
}

function pakaiJatahManual() {
  jejakManual.push(Date.now());
}

/**
 * Video yang BARU SAJA dicoba tombol kategori tapi gagal (dihapus, token
 * kedaluwarsa, …): jangan dicoba lagi selama 6 jam — tanpa ini tiap klik
 * menghabiskan jatah untuk video yang sama yang pasti gagal lagi.
 */
const gagalManual = new Map<string, number>();

function baruGagal(kunci: string): boolean {
  const sampai = gagalManual.get(kunci);
  if (sampai === undefined) return false;
  if (sampai > Date.now()) return true;
  gagalManual.delete(kunci);
  return false;
}

function tandaiGagal(kunci: string) {
  if (gagalManual.size > 5000) gagalManual.clear();
  gagalManual.set(kunci, Date.now() + SEGAR_KATEGORI_MS);
}

/** Tarik angka satu unggahan SuperApp sekarang juga (1 permintaan). */
export async function segarkanSatuUnggahan(postId: number): Promise<HasilSatuUnggahan> {
  if (!uploadPostSiap()) throw Object.assign(new Error("Kunci upload-post belum terpasang."), { status: 503, pesanAman: true });
  const db = supabase();
  const { data: p } = await db
    .from("tvrku_post")
    .select("id, user_id, judul, request_id, jadwal, dibuat_pada")
    .eq("id", postId)
    .maybeSingle();
  if (!p) throw Object.assign(new Error("Unggahan tidak ditemukan."), { status: 404 });
  if (!POLA_REQUEST_UP.test(String(p.request_id ?? ""))) {
    throw Object.assign(new Error("Unggahan ini tidak tercatat di upload-post (tanpa ID permintaan)."), { status: 422 });
  }
  if (p.jadwal && Date.parse(String(p.jadwal)) > Date.now()) {
    throw Object.assign(new Error("Unggahan ini masih terjadwal — angkanya ada setelah tayang."), { status: 409 });
  }
  if (jatahManual(1) < 1) {
    throw Object.assign(
      new Error("Terlalu banyak tarikan manual. Tunggu beberapa menit — angka juga diperbarui otomatis tiap hari."),
      { status: 429 },
    );
  }
  const ctx = await muatKonteks(db);
  const ctrl = new Pengendali(1, 60_000, { saatAmbil: pakaiJatahManual, lebihMs: 15_000 });
  const draf: DraftBaris[] = [];
  const catat = { terisi: 0, galat: 0 };
  const r = await kerjakanUnggahan(p as BarisUnggahan, ctx, ctrl, draf, catat);
  if (!r.jawaban) {
    if (ctrl.berhenti) {
      throw Object.assign(new Error("upload-post sedang membatasi permintaan. Coba lagi beberapa menit lagi."), {
        status: 429,
      });
    }
    // Pesan upload-post (mis. "No post found") aman & berguna ditampilkan.
    throw Object.assign(new Error(r.galat ? `upload-post: ${r.galat}` : "upload-post tidak menjawab untuk unggahan ini."), {
      status: 502,
      pesanAman: true,
    });
  }
  const jawaban = r.jawaban;
  const tersimpan = await tulisDraf(db, draf, ctx.kolom);
  return {
    post_id: postId,
    profil: jawaban.profil,
    judul: jawaban.judul || String(p.judul ?? ""),
    per_platform: jawaban.blok.map((b) => ({
      platform: b.platform,
      status: b.status,
      galat: b.galat,
      tayangan: b.metrik ? (b.metrik.tayangan ?? (b.platform === "twitter" ? b.metrik.impresi : null)) : null,
      post_url: b.post_url,
    })),
    tersimpan,
  };
}

export type HasilSegarKategori = {
  kategori: string;
  /** Video kategori yang bisa ditanyakan ke upload-post (unggahan + akun tersambung). */
  total: number;
  dikerjakan: number;
  terisi: number;
  galat: number;
  /** Masih perlu ditarik setelah panggilan ini; panggil lagi sampai 0. */
  sisa: number;
  /** true = direm kuota; tunggu beberapa menit sebelum menekan lagi. */
  direm: boolean;
  lama_ms: number;
};

/**
 * Tarik angka SATU KATEGORI sekarang, potong demi potong (tombol di
 * halaman kategori). Memakai jatah manual bersama supaya tombol yang
 * ditekan berulang tidak menghabiskan kuota upload-post.
 */
export async function segarkanKategori(kategori: string, polaIlike: string): Promise<HasilSegarKategori> {
  if (!uploadPostSiap()) throw Object.assign(new Error("Kunci upload-post belum terpasang."), { status: 503, pesanAman: true });
  const mulai = Date.now();
  const db = supabase();
  const ctx = await muatKonteks(db);
  // Kategori yang diminta selalu dianggap tampil (mis. baru dibuat).
  ctx.kategori.add(kategori.trim().toUpperCase());

  const laporan = await semuaBaris<BarisLaporan>(
    (dari, sampai) =>
      db
        .from("laporan_video")
        .select("id, user_id, platform, url_video, keyword, tvrku_post_id")
        .ilike("keyword", polaIlike)
        .order("id", { ascending: false })
        .range(dari, sampai) as unknown as PromiseLike<{ data: BarisLaporan[] | null; error: { message: string } | null }>,
    20_000,
  );
  // Unggahan kategori ini: hasil.kategori (sejak 25 Sep 2026) + unggahan
  // yang laporannya berkategori ini.
  const idPost = new Set<number>();
  for (const l of laporan) if (l.tvrku_post_id && Number(l.tvrku_post_id) > 0) idPost.add(Number(l.tvrku_post_id));
  const { data: postKategori } = await db.from("tvrku_post").select("id").ilike("hasil->>kategori", polaIlike).limit(1000);
  for (const p of postKategori ?? []) idPost.add(Number(p.id));

  const unggahan: BarisUnggahan[] = [];
  const kodePerPost = new Map<number, string[]>();
  for (const bagian of potong([...idPost], 200)) {
    const [{ data }, { data: tautan }] = await Promise.all([
      db.from("tvrku_post").select("id, user_id, judul, request_id, jadwal, dibuat_pada").in("id", bagian),
      db.from("laporan_video").select("tvrku_post_id, platform, url_video").in("tvrku_post_id", bagian),
    ]);
    for (const p of (data ?? []) as BarisUnggahan[]) {
      if (POLA_REQUEST_UP.test(String(p.request_id ?? ""))) unggahan.push(p);
    }
    for (const t of tautan ?? []) {
      const k = kodeMetrik(String(t.platform ?? ""), String(t.url_video ?? ""));
      if (!k) continue;
      const pid = Number(t.tvrku_post_id);
      kodePerPost.set(pid, [...(kodePerPost.get(pid) ?? []), k]);
    }
  }
  const itemLaporan = new Map<string, ItemLaporan>();
  for (const l of laporan) {
    const it = siapkanLaporan(l, ctx);
    if (it && !itemLaporan.has(it.kode)) itemLaporan.set(it.kode, it);
  }

  // Yang angkanya masih segar (< 6 jam) atau baru saja gagal dilewati.
  const semuaKode = [...new Set([...itemLaporan.keys(), ...[...kodePerPost.values()].flat()])];
  const segarPada = new Map<string, number>();
  for (const bagian of potong(semuaKode, 200)) {
    const { data } = await db.from("tvr_video_metrik").select("kode, diperbarui_pada").in("kode", bagian);
    for (const m of data ?? []) segarPada.set(String(m.kode), Date.parse(String(m.diperbarui_pada ?? "")) || 0);
  }
  const masihSegar = (kode: string) => Date.now() - (segarPada.get(kode) ?? 0) < SEGAR_KATEGORI_MS;
  const antreUnggahan = unggahan.filter((p) => {
    if (baruGagal(`u:${p.id}`)) return false;
    if (p.jadwal && Date.parse(String(p.jadwal)) > Date.now()) return false;
    const kode = kodePerPost.get(Number(p.id)) ?? [];
    return kode.length === 0 || !kode.every(masihSegar);
  });
  const antreLaporan = [...itemLaporan.values()].filter((it) => !baruGagal(`l:${it.kode}`) && !masihSegar(it.kode));
  const total = unggahan.length + itemLaporan.size;
  const perlu = antreUnggahan.length + antreLaporan.length;

  const jatah = jatahManual(MAKS_PER_TEKAN);
  if (perlu > 0 && jatah < 1) {
    return { kategori, total, dikerjakan: 0, terisi: 0, galat: 0, sisa: perlu, direm: true, lama_ms: Date.now() - mulai };
  }
  const ctrl = new Pengendali(jatah, 55_000, { saatAmbil: pakaiJatahManual, lebihMs: 15_000 });
  const draf: DraftBaris[] = [];
  let dikerjakan = 0;
  let terisi = 0;
  let galat = 0;
  const hasilU = await kerjakanKelompok(
    antreUnggahan,
    async (p) => {
      const catat = { terisi: 0, galat: 0 };
      const r = await kerjakanUnggahan(p, ctx, ctrl, draf, catat);
      if (r.hasil === "selesai") {
        dikerjakan += 1;
        if (catat.terisi === 0) tandaiGagal(`u:${p.id}`);
      }
      terisi += catat.terisi;
      galat += catat.galat;
      return r.hasil;
    },
    ctrl,
  );
  const hasilL = await kerjakanKelompok(
    antreLaporan,
    async (it) => {
      const catat = { terisi: 0, galat: 0, dilewati: 0 };
      const h = await kerjakanLaporan(it, ctx, ctrl, draf, catat);
      if (h === "selesai") {
        dikerjakan += 1;
        if (catat.terisi === 0) tandaiGagal(`l:${it.kode}`);
      }
      terisi += catat.terisi;
      galat += catat.galat;
      return h;
    },
    ctrl,
  );
  await tulisDraf(db, draf, ctx.kolom);
  const sisa = [...hasilU, ...hasilL].filter((h) => h === "tunda").length;
  return {
    kategori,
    total,
    dikerjakan,
    terisi,
    galat,
    sisa,
    direm: ctrl.berhenti || (sisa > 0 && jatahManual(1) < 1),
    lama_ms: Date.now() - mulai,
  };
}
