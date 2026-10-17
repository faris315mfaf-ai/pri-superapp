// Pustaka Video — perpustakaan video milik tim TV Rakyat (17 Okt 2026).
//
// Tim TV Rakyat & pimpinan (bolehKelolaTvr) atau master menaruh video di
// sini; anggota TVR Saya memilihnya lewat /api/tvr/video-internal dan
// memostingnya ke akun sosmed masing-masing tanpa unggah ulang.
// Tabel: tvr_pustaka_video (sql/83 — jalankan sebelum deploy).
//
// GET    → { item: [...semua termasuk nonaktif, + pratinjau], boleh }
//          (bukan pengelola: { item: [], boleh: false })
// POST   { aksi:"siapkan", nama, ukuran } → { cara, key, url, token? }
//          URL PUT bertanda tangan, awalan pustaka-video/<uid>/
// POST   { aksi:"simpan", judul, keterangan, kategori, berkas_cara,
//          berkas_key, berkas_nama, berkas_ukuran } → baris baru
// PATCH  { id, aktif? , judul?, keterangan?, kategori? }
// DELETE { id } — berkasnya ikut dihapus dari penyimpanan
//
// Berkasnya MILIK BERSAMA: riwayat anggota yang memakainya ditulis dengan
// video_path "" sehingga penyapu media TVR Saya tidak menyentuhnya.
import { randomBytes } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { bungkus, tabelBelumAda } from "@/lib/api-helper";
import { pastikanMasuk, type UserPublik } from "@/lib/sesi";
import { bolehKelolaTvr } from "@/lib/tv-tim";
import { maksUploadMb } from "@/lib/pengaturan-tv";
import { hapusVideoR2, presignR2, r2Siap, ukuranObjekR2 } from "@/lib/r2";
import { catatAudit } from "@/lib/audit";
import { pastikanKategoriBolehDipakai } from "@/lib/kategori-status";
import { kunciPustakaSah, normalIdInternal, urlPratinjauBerkas } from "@/lib/video-internal";

export const dynamic = "force-dynamic";

const BUCKET = "tvrku";
const TABEL = "tvr_pustaka_video";
/** Batas berkas bucket Supabase "tvrku" (FILE_SIZE_LIMIT) — cadangan bila R2 belum diatur. */
const BATAS_BUCKET_MB = 100;
const KOLOM =
  "id, judul, keterangan, kategori, berkas_cara, berkas_key, berkas_nama, berkas_ukuran, aktif, dibuat_oleh_id, dibuat_pada";
const PESAN_SQL = "Tabel Pustaka Video belum ada di database: jalankan sql/83_pustaka_video.sql dulu.";

type Baris = {
  id: string;
  judul: string;
  keterangan: string | null;
  kategori: string | null;
  berkas_cara: string;
  berkas_key: string;
  berkas_nama: string | null;
  berkas_ukuran: number | string | null;
  aktif: boolean;
  dibuat_oleh_id: number | string | null;
  dibuat_pada: string;
};

function galat(pesan: string, status: number, pesanAman = false): Error {
  return Object.assign(new Error(pesan), { status, ...(pesanAman ? { pesanAman: true } : {}) });
}

function teks(v: unknown, maks: number): string {
  return String(v ?? "").trim().slice(0, maks);
}

async function bolehKelola(user: UserPublik): Promise<boolean> {
  return user.role === "master" || (await bolehKelolaTvr(user));
}

async function pastikanPengelola(request: Request): Promise<UserPublik> {
  const user = await pastikanMasuk(request);
  if (!(await bolehKelola(user))) {
    throw galat("Hanya tim TV Rakyat, pimpinan, atau master yang boleh mengelola Pustaka Video.", 403);
  }
  return user;
}

function bentuk(b: Baris, pratinjau = "") {
  return {
    id: String(b.id),
    judul: b.judul,
    keterangan: b.keterangan ?? "",
    kategori: b.kategori ?? null,
    berkas_cara: b.berkas_cara,
    berkas_nama: b.berkas_nama ?? "",
    berkas_ukuran: Number(b.berkas_ukuran ?? 0) || null,
    aktif: b.aktif === true,
    dibuat_oleh_id: b.dibuat_oleh_id !== null && b.dibuat_oleh_id !== undefined ? String(b.dibuat_oleh_id) : null,
    dibuat_pada: b.dibuat_pada,
    pratinjau: pratinjau || null,
  };
}

async function hapusBerkas(cara: string, key: string): Promise<void> {
  if (!key) return;
  try {
    if (cara === "r2") await hapusVideoR2(key);
    else if (cara === "supabase") await supabase().storage.from(BUCKET).remove([key]);
  } catch (e) {
    // Berkas yatim lebih murah daripada baris yang gagal dihapus.
    console.error("[pustaka-video] hapus berkas:", e);
  }
}

/**
 * Ukuran berkas yang benar-benar ada di penyimpanan (byte).
 * null = tidak bisa dipastikan (galat baca bucket) — dianggap ada.
 * Melempar 400 bila berkas terbukti belum ada.
 */
async function ukuranTersimpan(cara: string, key: string): Promise<number | null> {
  if (cara === "r2") {
    // HEAD bertanda tangan: null berarti tidak ada ATAU galat — keduanya
    // berarti baris tak boleh dibuat (bisa diulang setelah unggah selesai).
    const n = await ukuranObjekR2(key);
    if (n === null) throw galat("Berkas video belum selesai terunggah. Tunggu sebentar lalu simpan lagi.", 400);
    return n;
  }
  const potong = key.lastIndexOf("/");
  const folder = key.slice(0, potong);
  const nama = key.slice(potong + 1);
  const { data, error } = await supabase().storage.from(BUCKET).list(folder, { search: nama, limit: 10 });
  if (error) {
    console.error("[pustaka-video] periksa berkas:", error.message);
    return null;
  }
  const obj = (data ?? []).find((o) => o.name === nama);
  if (!obj) throw galat("Berkas video belum selesai terunggah. Tunggu sebentar lalu simpan lagi.", 400);
  const n = Number((obj.metadata as { size?: unknown } | null)?.size);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Kategori opsional: kosong → null; terisi harus bisa dipakai anggota saat mengunggah. */
async function bersihkanKategori(v: unknown): Promise<string | null> {
  const k = teks(v, 120);
  if (!k) return null;
  await pastikanKategoriBolehDipakai(k);
  return k;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!(await bolehKelola(user))) return { item: [], boleh: false };
    const { data, error } = await supabase()
      .from(TABEL)
      .select(KOLOM)
      .order("dibuat_pada", { ascending: false })
      .limit(300);
    if (error) {
      if (tabelBelumAda(error)) return { item: [], boleh: true, perlu_sql: true };
      console.error("[pustaka-video] daftar:", error.code, error.message);
      throw new Error("Gagal memuat Pustaka Video.");
    }
    const baris = (data ?? []) as unknown as Baris[];
    const url = await urlPratinjauBerkas(baris.map((b) => ({ cara: b.berkas_cara, key: b.berkas_key })));
    return { item: baris.map((b, i) => bentuk(b, url[i])), boleh: true };
  });
}

/** Langkah 1 unggah: URL PUT bertanda tangan (R2 utama, bucket cadangan). */
async function siapkan(uid: number, body: Record<string, unknown>) {
  const maksMb = Math.min(await maksUploadMb(), r2Siap() ? Infinity : BATAS_BUCKET_MB);
  const ukuran = Number(body.ukuran ?? 0);
  if (!Number.isFinite(ukuran) || ukuran <= 0) throw galat("Ukuran berkas tidak dikenal.", 400);
  if (ukuran > maksMb * 1024 * 1024) {
    throw galat(`Video ${Math.round(ukuran / 1048576)} MB terlalu besar. Maksimal ${maksMb} MB — kecilkan dulu.`, 400);
  }
  const ext = /\.(mp4|mov|m4v|webm)$/i.exec(String(body.nama ?? ""))?.[1]?.toLowerCase() ?? "mp4";
  // Awalan sendiri: penyapu media TVR Saya bekerja per baris tvrku_post dan
  // tidak pernah menyentuh awalan ini.
  const key = `pustaka-video/${uid}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  if (r2Siap()) return { sukses: true, cara: "r2" as const, key, url: presignR2("PUT", key, 15 * 60) };
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(key);
  if (error || !data) {
    console.error("[pustaka-video] siapkan:", error?.message);
    throw new Error("Gagal menyiapkan unggahan. Coba lagi.");
  }
  return { sukses: true, cara: "supabase" as const, key, url: data.signedUrl, token: data.token };
}

async function simpan(user: UserPublik, body: Record<string, unknown>, request: Request) {
  const uid = Number(user.id);
  const judul = teks(body.judul, 200);
  if (judul.length < 3) throw galat("Judul video minimal 3 huruf.", 400);
  const keterangan = teks(body.keterangan, 2000);
  const cara = body.berkas_cara === "r2" || body.berkas_cara === "supabase" ? body.berkas_cara : "";
  if (!cara) throw galat("Cara penyimpanan berkas tidak dikenal.", 400);
  if (cara === "r2" && !r2Siap()) throw galat("Penyimpanan video (R2) belum diatur. Hubungi pengelola.", 503);
  const key = teks(body.berkas_key, 300);
  // Kunci harus di awalan milik pengunggah ini — tidak boleh menunjuk berkas
  // orang lain (mis. video TVR Saya anggota) lalu menghapusnya lewat DELETE.
  if (!kunciPustakaSah(key, uid)) throw galat("Kunci berkas tidak sah.", 400);
  const kategori = await bersihkanKategori(body.kategori);

  const db = supabase();
  const { data: kembar, error: errKembar } = await db.from(TABEL).select("id").eq("berkas_key", key).limit(1);
  if (tabelBelumAda(errKembar)) throw galat(PESAN_SQL, 503, true);
  if ((kembar ?? []).length > 0) throw galat("Berkas ini sudah tersimpan di Pustaka Video.", 409);

  const batasMb = await maksUploadMb();
  const nyata = await ukuranTersimpan(cara, key);
  if (nyata !== null && nyata > batasMb * 1_048_576 + 1_048_576) {
    // Presigned PUT tidak mengikat ukuran — berkas raksasa dibuang.
    await hapusBerkas(cara, key);
    throw galat(`Berkas video terlalu besar (${Math.round(nyata / 1_048_576)} MB, maksimal ${batasMb} MB).`, 413);
  }
  const ukuranKlien = Number(body.berkas_ukuran ?? 0);
  const ukuran = nyata ?? (Number.isFinite(ukuranKlien) && ukuranKlien > 0 ? Math.floor(ukuranKlien) : null);

  const { data, error } = await db
    .from(TABEL)
    .insert({
      judul,
      keterangan,
      kategori,
      berkas_cara: cara,
      berkas_key: key,
      berkas_nama: teks(body.berkas_nama, 160),
      berkas_ukuran: ukuran,
      aktif: true,
      dibuat_oleh_id: uid,
    })
    .select(KOLOM)
    .single();
  if (tabelBelumAda(error)) throw galat(PESAN_SQL, 503, true);
  if (error || !data) {
    console.error("[pustaka-video] simpan:", error?.code, error?.message);
    throw new Error("Gagal menyimpan video ke Pustaka.");
  }
  const baris = data as unknown as Baris;
  catatAudit(user.id, "pustaka_video", `Menambah "${judul}" ke Pustaka Video`, {
    request,
    detail: { pustaka_id: String(baris.id), judul, kategori, ukuran },
  });
  const [pratinjau] = await urlPratinjauBerkas([{ cara: baris.berkas_cara, key: baris.berkas_key }]);
  return bentuk(baris, pratinjau);
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPengelola(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.aksi === "siapkan") return siapkan(Number(user.id), body);
    if (body.aksi === "simpan") return simpan(user, body, request);
    throw galat("aksi harus 'siapkan' atau 'simpan'.", 400);
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPengelola(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = normalIdInternal("pustaka", body.id);
    if (!id) throw galat("id tidak sah.", 400);
    const ubah: Record<string, unknown> = {};
    if (typeof body.aktif === "boolean") ubah.aktif = body.aktif;
    if (body.judul !== undefined) {
      const judul = teks(body.judul, 200);
      if (judul.length < 3) throw galat("Judul video minimal 3 huruf.", 400);
      ubah.judul = judul;
    }
    if (body.keterangan !== undefined) ubah.keterangan = teks(body.keterangan, 2000);
    if (body.kategori !== undefined) ubah.kategori = await bersihkanKategori(body.kategori);
    if (Object.keys(ubah).length === 0) throw galat("Tidak ada yang diubah.", 400);
    const { data, error } = await supabase().from(TABEL).update(ubah).eq("id", id).select(KOLOM).maybeSingle();
    if (tabelBelumAda(error)) throw galat(PESAN_SQL, 503, true);
    if (error) {
      console.error("[pustaka-video] ubah:", error.code, error.message);
      throw new Error("Gagal mengubah video pustaka.");
    }
    if (!data) throw galat("Video pustaka tidak ditemukan.", 404);
    const baris = data as unknown as Baris;
    catatAudit(user.id, "pustaka_video", `Mengubah "${baris.judul}" di Pustaka Video`, {
      request,
      detail: { pustaka_id: id, ubah: Object.keys(ubah), aktif: baris.aktif },
    });
    const [pratinjau] = await urlPratinjauBerkas([{ cara: baris.berkas_cara, key: baris.berkas_key }]);
    return bentuk(baris, pratinjau);
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPengelola(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = normalIdInternal("pustaka", body.id);
    if (!id) throw galat("id tidak sah.", 400);
    const db = supabase();
    const { data: lama, error: errLama } = await db
      .from(TABEL)
      .select("id, judul, berkas_cara, berkas_key")
      .eq("id", id)
      .maybeSingle();
    if (tabelBelumAda(errLama)) throw galat(PESAN_SQL, 503, true);
    if (!lama) throw galat("Video pustaka tidak ditemukan.", 404);
    const { error } = await db.from(TABEL).delete().eq("id", id);
    if (error) {
      console.error("[pustaka-video] hapus:", error.code, error.message);
      throw new Error("Gagal menghapus video pustaka.");
    }
    await hapusBerkas(String(lama.berkas_cara), String(lama.berkas_key));
    catatAudit(user.id, "pustaka_video", `Menghapus "${String(lama.judul)}" dari Pustaka Video`, {
      request,
      detail: { pustaka_id: id },
    });
    return { ok: true };
  });
}
