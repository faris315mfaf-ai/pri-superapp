// ============================================================
// VIDEO INTERNAL untuk TVR Saya (17 Okt 2026) — KHUSUS SISI SERVER.
//
// Anggota bisa memposting video yang SUDAH ADA di sistem ke akun
// upload-post miliknya sendiri, tanpa mengunggah ulang berkas:
//   • "wajib"    — bahan perintah Video Wajib (tvr_video_wajib) yang aktif
//                  dan punya berkas (atau tautan langsung ke berkas video);
//   • "official" — video TV Rakyat Official yang siap tayang
//                  (video_antrian: hasil_render_url terisi + disetujui);
//   • "pustaka"  — Pustaka Video yang dikelola tim TV (tvr_pustaka_video, sql/83).
//
// BERKASNYA MILIK BERSAMA, BUKAN MILIK ANGGOTA: riwayat tvrku_post yang
// memakai sumber ini ditulis dengan video_path "" dan hapus_media_pada null
// (sama dengan Siaran Serentak, lib/siaran.ts) — penyapu media TVR Saya
// hanya menghapus berkas yang video_path-nya terisi, jadi berkas bersama
// tidak pernah ikut tersapu oleh unggahan satu anggota.
//
// Bagian murni (validasi masukan, penanda, umur tautan) diekspor terpisah
// dan diuji di tests/uji-video-internal.mts. Bagian yang menyentuh database
// memanggil supabase() hanya di dalam fungsi, jadi impor berkas ini aman
// untuk pengujian tanpa .env.
// ============================================================
import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import { MAKS_UMUR_URL_DETIK, presignR2, r2Siap } from "@/lib/r2";
import type { UserPublik } from "@/lib/sesi";

export type JenisInternal = "wajib" | "official" | "pustaka";

export const JENIS_INTERNAL: readonly JenisInternal[] = ["wajib", "official", "pustaka"];

export type ItemInternal = {
  jenis: JenisInternal;
  id: string;
  judul: string;
  caption: string;
  kategori: string | null;
  perintah_id: string | null;
  thumbnail: string | null;
  ukuran: number | null;
  /** URL bertanda tangan ±1 jam untuk <video> pratinjau (Official: tautan aslinya). */
  pratinjau: string | null;
  dibuat_pada: string | null;
};

export type SumberInternal = {
  /** URL yang diserahkan ke penyedia (bertanda tangan ≤7 hari, atau publik). */
  url: string;
  judul: string;
  caption: string;
  kategori: string | null;
  perintah_id: string | null;
  /** Penanda stabil untuk pagar posting dobel, mis. "wajib:12". */
  penanda: string;
  /** true bila `url` bertanda tangan → jadwal dibatasi 7 hari (periksaJadwal). */
  bertanda: boolean;
  /**
   * Batas KERAS berlakunya berkas (ISO) bila lebih pendek dari umur tautan
   * biasa — dipakai Official, yang berkasnya disapu 1–6 hari setelah dibuat.
   * null = tidak ada batas tambahan.
   */
  berlaku_sampai: string | null;
};

type PenggunaInternal = Pick<UserPublik, "id">;

const BUCKET = "tvrku";
/** Umur URL pratinjau di daftar pilihan. */
const UMUR_PRATINJAU_DETIK = 3600;
/** Video Official yang berkasnya akan hilang dalam waktu dekat tidak ditawarkan. */
export const MARGIN_SIAP_MS = 20 * 60_000;
/** Jadwal harus jatuh paling lambat sekian sebelum berkas Official hilang. */
export const MARGIN_JADWAL_MS = 30 * 60_000;
/** Video Official yang ditawarkan: yang dibuat dalam 30 hari terakhir. */
const JENDELA_OFFICIAL_MS = 30 * 86_400_000;
const MAKS_OFFICIAL = 50;
const MAKS_PUSTAKA = 100;
const MAKS_WAJIB = 50;

function galat(pesan: string, status: number): Error {
  return Object.assign(new Error(pesan), { status });
}

// ------------------------------------------------------------
// Bagian MURNI
// ------------------------------------------------------------

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLA_KODE = /^[\w.-]{1,120}$/;

/** Format id per jenis; null bila tidak sah. */
export function normalIdInternal(jenis: JenisInternal, id: unknown): string | null {
  const s = String(id ?? "").trim();
  if (!s) return null;
  if (jenis === "wajib") return /^[1-9]\d{0,17}$/.test(s) ? s : null;
  if (jenis === "pustaka") return POLA_UUID.test(s) ? s.toLowerCase() : null;
  return POLA_KODE.test(s) ? s : null;
}

export function jenisInternalSah(v: unknown): v is JenisInternal {
  return typeof v === "string" && (JENIS_INTERNAL as readonly string[]).includes(v);
}

/**
 * Baca `sumber_internal` dari body. undefined/null → null (tidak dipakai).
 * Bentuk lain yang tidak sah → galat 400.
 */
export function bacaSumberInternal(v: unknown): { jenis: JenisInternal; id: string } | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw galat("Sumber video internal tidak dikenal.", 400);
  const o = v as Record<string, unknown>;
  if (!jenisInternalSah(o.jenis)) throw galat("Jenis sumber video internal tidak dikenal.", 400);
  const id = normalIdInternal(o.jenis, o.id);
  if (!id) throw galat("Video internal tidak dikenal.", 400);
  return { jenis: o.jenis, id };
}

/** Penanda stabil satu video internal — kunci pagar posting dobel. */
export function penandaInternal(jenis: JenisInternal, id: string): string {
  return `${jenis}:${id}`;
}

/** Alamat https publik (bukan localhost / jaringan dalam). */
export function httpsPublik(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      !/^(localhost|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(u.hostname) &&
      !/\.(local|internal|localhost)$/i.test(u.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Tautan bahan (link_doksli) yang langsung menunjuk BERKAS video — hanya
 * itu yang bisa diunduh penyedia. Tautan Drive/YouTube/folder ditolak.
 */
export function linkVideoLangsung(url: string | null | undefined): boolean {
  const s = String(url ?? "").trim();
  if (!s || !httpsPublik(s)) return false;
  try {
    return /\.(mp4|mov|m4v|webm)$/i.test(new URL(s).pathname);
  } catch {
    return false;
  }
}

/**
 * Kapan URL bertanda tangan kedaluwarsa (epoch ms), atau null bila tidak
 * diketahui / tidak bertanda tangan. Mengenali SigV4 (R2/S3:
 * X-Amz-Date + X-Amz-Expires) dan tautan bertanda Supabase Storage
 * (JWT `token` dengan klaim exp).
 */
export function kedaluwarsaUrlMs(url: string | null | undefined): number | null {
  let u: URL;
  try {
    u = new URL(String(url ?? ""));
  } catch {
    return null;
  }
  const amzDate = u.searchParams.get("X-Amz-Date");
  const amzExp = u.searchParams.get("X-Amz-Expires");
  if (amzDate && amzExp) {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate);
    const detik = Number(amzExp);
    if (!m || !Number.isFinite(detik)) return null;
    const mulai = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return mulai + detik * 1000;
  }
  const token = u.searchParams.get("token");
  if (token && u.pathname.includes("/object/sign/")) {
    const bagian = token.split(".");
    if (bagian.length !== 3) return null;
    try {
      const isi = JSON.parse(Buffer.from(bagian[1], "base64url").toString("utf8")) as { exp?: unknown };
      const exp = Number(isi.exp);
      return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Batas berlaku video Official (epoch ms): yang paling awal antara jadwal
 * sapu berkasnya dan kedaluwarsa tautannya. null = tidak ada batas yang diketahui.
 */
export function batasBerlakuOfficial(hapusMediaPada: string | null | undefined, url: string): number | null {
  const kandidat: number[] = [];
  const h = hapusMediaPada ? Date.parse(hapusMediaPada) : NaN;
  if (Number.isFinite(h)) kandidat.push(h);
  const k = kedaluwarsaUrlMs(url);
  if (k !== null) kandidat.push(k);
  return kandidat.length ? Math.min(...kandidat) : null;
}

/**
 * Periksa jadwal terhadap batas berlaku berkas. Mengembalikan pesan galat,
 * atau null bila aman. `jadwalMs` null = posting langsung.
 */
export function cekBatasBerlaku(batasMs: number | null, jadwalMs: number | null, sekarangMs: number = Date.now()): string | null {
  if (batasMs === null) return null;
  if (batasMs < sekarangMs + MARGIN_SIAP_MS) {
    return "Berkas video ini sudah/hampir dihapus dari penyimpanan. Pilih video lain.";
  }
  if (jadwalMs !== null && jadwalMs > batasMs - MARGIN_JADWAL_MS) {
    const batas = new Date(batasMs - MARGIN_JADWAL_MS);
    const teks = batas.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Berkas video ini hanya tersimpan sampai sekitar ${teks} WIB — jadwalkan sebelum itu atau posting sekarang.`;
  }
  return null;
}

/** Kunci berkas Pustaka Video milik pengunggah ini (anti menunjuk berkas orang lain). */
export function kunciPustakaSah(key: string, uid: number | string): boolean {
  const k = String(key ?? "");
  return (
    k.startsWith(`pustaka-video/${uid}/`) &&
    !k.includes("..") &&
    /^[\w./-]+$/.test(k) &&
    k.length <= 300
  );
}

// ------------------------------------------------------------
// Penyimpanan (R2 / bucket Supabase "tvrku")
// ------------------------------------------------------------

type Berkas = { cara: string | null | undefined; key: string | null | undefined };

/** URL bertanda tangan untuk banyak berkas sekaligus; peta indeks → URL. */
async function tandaiBanyak(berkas: Berkas[], detik: number): Promise<Map<number, string>> {
  const hasil = new Map<number, string>();
  const dariBucket: { i: number; key: string }[] = [];
  berkas.forEach((b, i) => {
    const key = String(b.key ?? "");
    if (!key) return;
    if (b.cara === "r2") {
      if (r2Siap()) hasil.set(i, presignR2("GET", key, detik));
    } else if (b.cara === "supabase") {
      dariBucket.push({ i, key });
    }
  });
  if (dariBucket.length > 0) {
    const { data, error } = await supabase()
      .storage.from(BUCKET)
      .createSignedUrls(
        dariBucket.map((b) => b.key),
        detik,
      );
    if (error) console.error("[video-internal] tanda tangan:", error.message);
    for (const [j, b] of dariBucket.entries()) {
      const u = data?.[j]?.signedUrl;
      if (u) hasil.set(b.i, u);
    }
  }
  return hasil;
}

/** URL pratinjau (±1 jam) untuk banyak berkas; urutan sama dengan masukan, "" bila gagal. */
export async function urlPratinjauBerkas(berkas: Berkas[]): Promise<string[]> {
  const peta = await tandaiBanyak(berkas, UMUR_PRATINJAU_DETIK);
  return berkas.map((_, i) => peta.get(i) ?? "");
}

async function tandaiSatu(b: Berkas, detik: number): Promise<string> {
  return (await tandaiBanyak([b], detik)).get(0) ?? "";
}

// ------------------------------------------------------------
// Baris per jenis
// ------------------------------------------------------------

type BarisWajib = {
  id: number | string;
  judul: string;
  keterangan: string | null;
  link_doksli: string | null;
  kategori: string | null;
  aktif: boolean;
  dibuat_pada: string | null;
  berkas_cara?: string | null;
  berkas_key?: string | null;
  berkas_ukuran?: number | string | null;
};
const KOLOM_WAJIB = "id, judul, keterangan, link_doksli, kategori, aktif, dibuat_pada, berkas_cara, berkas_key, berkas_ukuran";
/** sql/52 (kolom berkas) belum dijalankan → hanya tautan. */
const KOLOM_WAJIB_LAMA = "id, judul, keterangan, link_doksli, kategori, aktif, dibuat_pada";

function kolomHilang(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

async function bacaWajib(filter: { id?: number }): Promise<BarisWajib[]> {
  const db = supabase();
  for (const kolom of [KOLOM_WAJIB, KOLOM_WAJIB_LAMA]) {
    let q = db.from("tvr_video_wajib").select(kolom);
    q = filter.id !== undefined ? q.eq("id", filter.id) : q.eq("aktif", true).order("dibuat_pada", { ascending: false }).limit(MAKS_WAJIB);
    const { data, error } = await q;
    if (!error) return (data ?? []) as unknown as BarisWajib[];
    if (tabelBelumAda(error)) return [];
    if (!kolomHilang(error)) {
      console.error("[video-internal] wajib:", error.code, error.message);
      throw new Error("Gagal memuat video wajib.");
    }
  }
  return [];
}

/** Berkas perintah: berkas unggahan dulu, tautan langsung sebagai cadangan. */
function sumberWajib(b: BarisWajib): { berkas: Berkas | null; link: string | null } {
  const key = String(b.berkas_key ?? "");
  const cara = String(b.berkas_cara ?? "");
  if (key && (cara === "supabase" || (cara === "r2" && r2Siap()))) return { berkas: { cara, key }, link: null };
  if (linkVideoLangsung(b.link_doksli)) return { berkas: null, link: String(b.link_doksli).trim() };
  return { berkas: null, link: null };
}

type BarisOfficial = {
  kode: string;
  judul: string | null;
  judul_overlay: string | null;
  caption_asli: string | null;
  thumbnail_url: string | null;
  hasil_render_url: string | null;
  persetujuan: string | null;
  jam_tanggal: string | null;
  hapus_media_pada: string | null;
};
const KOLOM_OFFICIAL =
  "kode, judul, judul_overlay, caption_asli, thumbnail_url, hasil_render_url, persetujuan, jam_tanggal, hapus_media_pada";

function judulOfficial(b: BarisOfficial): string {
  return String(b.judul || b.judul_overlay || "Video TV Rakyat Official").trim();
}

type BarisPustaka = {
  id: string;
  judul: string;
  keterangan: string | null;
  kategori: string | null;
  berkas_cara: string;
  berkas_key: string;
  berkas_ukuran: number | string | null;
  aktif: boolean;
  dibuat_pada: string | null;
};
const KOLOM_PUSTAKA = "id, judul, keterangan, kategori, berkas_cara, berkas_key, berkas_ukuran, aktif, dibuat_pada";

function angkaAtauNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

// ------------------------------------------------------------
// API publik
// ------------------------------------------------------------

/**
 * Daftar video internal yang bisa dipilih anggota. Hanya yang BENAR-BENAR
 * punya berkas yang bisa diunduh penyedia.
 */
export async function daftarVideoInternal(user: PenggunaInternal, jenis: JenisInternal): Promise<ItemInternal[]> {
  if (jenis === "wajib") {
    const baris = await bacaWajib({});
    const siap = baris
      .filter((b) => b.aktif === true)
      .map((b) => ({ b, s: sumberWajib(b) }))
      .filter(({ s }) => s.berkas !== null || s.link !== null);
    const url = await tandaiBanyak(
      siap.map(({ s }) => s.berkas ?? { cara: null, key: null }),
      UMUR_PRATINJAU_DETIK,
    );
    return siap.map(({ b, s }, i) => ({
      jenis: "wajib" as const,
      id: String(b.id),
      judul: String(b.judul ?? ""),
      caption: String(b.keterangan ?? ""),
      kategori: b.kategori ? String(b.kategori) : null,
      perintah_id: String(b.id),
      thumbnail: null,
      ukuran: s.berkas ? angkaAtauNull(b.berkas_ukuran) : null,
      pratinjau: s.berkas ? (url.get(i) ?? null) : s.link,
      dibuat_pada: b.dibuat_pada ?? null,
    }));
  }

  if (jenis === "official") {
    const kini = Date.now();
    const { data, error } = await supabase()
      .from("video_antrian")
      .select(KOLOM_OFFICIAL)
      .eq("persetujuan", "disetujui")
      .not("hasil_render_url", "is", null)
      .neq("hasil_render_url", "")
      .gte("jam_tanggal", new Date(kini - JENDELA_OFFICIAL_MS).toISOString())
      // Nilai berkutip: ISO memuat ":" dan "." yang bermakna di pohon logika PostgREST.
      .or(`hapus_media_pada.is.null,hapus_media_pada.gt."${new Date(kini + MARGIN_SIAP_MS).toISOString()}"`)
      .order("jam_tanggal", { ascending: false })
      .limit(MAKS_OFFICIAL);
    if (error) {
      console.error("[video-internal] official:", error.code, error.message);
      if (tabelBelumAda(error)) return [];
      throw new Error("Gagal memuat video TV Rakyat Official.");
    }
    return ((data ?? []) as unknown as BarisOfficial[])
      .filter((b) => {
        const url = String(b.hasil_render_url ?? "").trim();
        if (!httpsPublik(url)) return false;
        return cekBatasBerlaku(batasBerlakuOfficial(b.hapus_media_pada, url), null, kini) === null;
      })
      .map((b) => ({
        jenis: "official" as const,
        id: String(b.kode),
        judul: judulOfficial(b),
        caption: String(b.caption_asli ?? ""),
        kategori: null,
        perintah_id: null,
        thumbnail: b.thumbnail_url ? String(b.thumbnail_url) : null,
        ukuran: null,
        pratinjau: String(b.hasil_render_url).trim(),
        dibuat_pada: b.jam_tanggal ?? null,
      }));
  }

  // pustaka
  const { data, error } = await supabase()
    .from("tvr_pustaka_video")
    .select(KOLOM_PUSTAKA)
    .eq("aktif", true)
    .order("dibuat_pada", { ascending: false })
    .limit(MAKS_PUSTAKA);
  if (error) {
    if (tabelBelumAda(error)) return []; // sql/83 belum dijalankan
    console.error("[video-internal] pustaka:", error.code, error.message);
    throw new Error("Gagal memuat Pustaka Video.");
  }
  const baris = ((data ?? []) as unknown as BarisPustaka[]).filter(
    (b) => b.berkas_key && (b.berkas_cara === "supabase" || (b.berkas_cara === "r2" && r2Siap())),
  );
  const url = await tandaiBanyak(
    baris.map((b) => ({ cara: b.berkas_cara, key: b.berkas_key })),
    UMUR_PRATINJAU_DETIK,
  );
  return baris.map((b, i) => ({
    jenis: "pustaka" as const,
    id: String(b.id),
    judul: String(b.judul ?? ""),
    caption: String(b.keterangan ?? ""),
    kategori: b.kategori ? String(b.kategori) : null,
    perintah_id: null,
    thumbnail: null,
    ukuran: angkaAtauNull(b.berkas_ukuran),
    pratinjau: url.get(i) ?? null,
    dibuat_pada: b.dibuat_pada ?? null,
  }));
}

/**
 * URL sumber satu video internal untuk diserahkan ke penyedia. Melempar
 * galat ber-`status` (400/403/404/409/410/503) dengan pesan berbahasa Indonesia.
 */
export async function urlSumberInternal(
  user: PenggunaInternal,
  sumber: { jenis: JenisInternal; id: string },
): Promise<SumberInternal> {
  if (!jenisInternalSah(sumber?.jenis)) throw galat("Jenis sumber video internal tidak dikenal.", 400);
  const id = normalIdInternal(sumber.jenis, sumber.id);
  if (!id) throw galat("Video internal tidak dikenal.", 400);
  const penanda = penandaInternal(sumber.jenis, id);

  if (sumber.jenis === "wajib") {
    const [b] = await bacaWajib({ id: Number(id) });
    if (!b) throw galat("Perintah video wajib ini tidak ditemukan.", 404);
    if (b.aktif !== true) throw galat("Perintah video wajib ini sudah tidak aktif.", 404);
    const s = sumberWajib(b);
    let url = "";
    let bertanda = false;
    if (s.berkas) {
      url = await tandaiSatu(s.berkas, MAKS_UMUR_URL_DETIK);
      bertanda = true;
      if (!url) throw galat("Tautan bahan video wajib gagal dibuat. Coba lagi.", 503);
    } else if (s.link) {
      url = s.link;
    } else {
      throw galat("Perintah ini tidak punya berkas video yang bisa langsung diposting.", 404);
    }
    return {
      url,
      judul: String(b.judul ?? ""),
      caption: String(b.keterangan ?? ""),
      kategori: b.kategori ? String(b.kategori) : null,
      perintah_id: String(b.id),
      penanda,
      bertanda,
      berlaku_sampai: null,
    };
  }

  if (sumber.jenis === "official") {
    const { data, error } = await supabase()
      .from("video_antrian")
      .select(KOLOM_OFFICIAL)
      .eq("kode", id)
      .maybeSingle();
    if (error) {
      console.error("[video-internal] official satu:", error.code, error.message);
      throw new Error("Gagal memuat video TV Rakyat Official.");
    }
    const b = data as unknown as BarisOfficial | null;
    if (!b) throw galat("Video TV Rakyat Official ini tidak ditemukan.", 404);
    if (b.persetujuan !== "disetujui") throw galat("Video TV Rakyat Official ini belum disetujui Pimpinan Redaksi.", 403);
    const url = String(b.hasil_render_url ?? "").trim();
    if (!url || !httpsPublik(url)) throw galat("Berkas video Official ini sudah tidak tersedia.", 404);
    const batas = batasBerlakuOfficial(b.hapus_media_pada, url);
    if (batas !== null && batas < Date.now() + MARGIN_SIAP_MS) {
      throw galat("Berkas video Official ini sudah/hampir dihapus dari penyimpanan. Pilih video lain.", 410);
    }
    return {
      url,
      judul: judulOfficial(b),
      caption: String(b.caption_asli ?? ""),
      kategori: null,
      perintah_id: null,
      penanda,
      bertanda: kedaluwarsaUrlMs(url) !== null,
      berlaku_sampai: batas !== null ? new Date(batas).toISOString() : null,
    };
  }

  // pustaka
  const { data, error } = await supabase()
    .from("tvr_pustaka_video")
    .select(KOLOM_PUSTAKA)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) throw galat("Pustaka Video belum aktif.", 404);
    console.error("[video-internal] pustaka satu:", error.code, error.message);
    throw new Error("Gagal memuat Pustaka Video.");
  }
  const b = data as unknown as BarisPustaka | null;
  if (!b || b.aktif !== true) throw galat("Video pustaka ini tidak ditemukan atau sudah dinonaktifkan.", 404);
  if (b.berkas_cara === "r2" && !r2Siap()) throw galat("Penyimpanan video (R2) belum diatur. Hubungi pengelola.", 503);
  const url = await tandaiSatu({ cara: b.berkas_cara, key: b.berkas_key }, MAKS_UMUR_URL_DETIK);
  if (!url) throw galat("Tautan video pustaka gagal dibuat. Coba lagi.", 503);
  return {
    url,
    judul: String(b.judul ?? ""),
    caption: String(b.keterangan ?? ""),
    kategori: b.kategori ? String(b.kategori) : null,
    perintah_id: null,
    penanda,
    bertanda: true,
    berlaku_sampai: null,
  };
}
