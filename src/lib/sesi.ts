// Sesi perangkat — dasar fitur "otomatis login".
//
// Yang disimpan aplikasi di ponsel adalah TOKEN ACAK, bukan kata sandi.
// Bedanya penting: token bisa dicabut satu per satu (tombol "Keluar dari
// semua perangkat") tanpa memaksa semua orang mengganti sandi, dan
// bocornya isi ponsel tidak membocorkan sandi aslinya.
//
// Di database hanya tersimpan hash token, sama seperti perlakuan
// terhadap kata sandi.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { supabase } from "@/lib/supabase";
import type { Role, User } from "@/types";
import { after } from "next/server";
import {
  ambilCacheSesi,
  hapusCacheToken,
  hapusCacheUser,
  simpanCacheSesi,
} from "@/lib/cache-sesi";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Buat sesi baru untuk sebuah akun; mengembalikan token mentahnya. */
export async function buatSesi(
  userId: number | string,
  namaPerangkat?: string,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await supabase().from("sesi_perangkat").insert({
    user_id: Number(userId),
    token_hash: hashToken(token),
    nama_perangkat: namaPerangkat?.slice(0, 120) ?? null,
  });
  if (error) throw new Error("Gagal membuat sesi perangkat.");
  return token;
}

type BarisUser = {
  id: number;
  email: string;
  nama: string;
  role: string;
  jabatan: string;
  avatar_url: string;
  status: string;
  profil_lengkap: boolean;
  aktif: boolean;
  username: string | null;
  nomor_wa: string | null;
  wa_terverifikasi: boolean | null;
  divisi: string | null;
  sub_divisi: string | null;
  posisi_divisi: string | null;
  nama_panggilan: string | null;
  tanggal_lahir: string | null;
};

export type UserPublik = User & {
  status: string;
  profil_lengkap: boolean;
  username: string | null;
  nomor_wa: string | null;
};

export function keUserPublik(b: BarisUser): UserPublik {
  return {
    id: String(b.id),
    nama: b.nama,
    email: b.email,
    role: b.role as Role,
    avatar_url: b.avatar_url ?? "",
    jabatan: b.jabatan ?? "",
    status: b.status,
    profil_lengkap: b.profil_lengkap,
    username: b.username,
    nomor_wa: b.nomor_wa,
    wa_terverifikasi: b.wa_terverifikasi === true,
    divisi: b.divisi ?? "",
    sub_divisi: b.sub_divisi ?? "",
    posisi_divisi: b.posisi_divisi === "kepala" ? "kepala" : "anggota",
    nama_panggilan: b.nama_panggilan ?? "",
    tanggal_lahir: b.tanggal_lahir ?? null,
  };
}

const KOLOM_USER =
  "id, email, nama, role, jabatan, avatar_url, status, profil_lengkap, aktif, username, nomor_wa, wa_terverifikasi, divisi, sub_divisi, posisi_divisi, nama_panggilan, tanggal_lahir";

/**
 * Tukar token perangkat dengan data akun.
 *
 * Mengembalikan null bila token tidak dikenal, akunnya dinonaktifkan,
 * atau statusnya belum disetujui — sehingga akun yang dicabut haknya
 * langsung kehilangan akses tanpa perlu menunggu tokennya kedaluwarsa.
 */
export async function userDariToken(token: string): Promise<UserPublik | null> {
  const bersih = (token ?? "").trim();
  if (!bersih) return null;

  const hash = hashToken(bersih);

  // Jalur cepat: profil yang baru saja diambil dipakai ulang, sehingga
  // dua query di bawah tidak perlu dijalankan lagi. Aman karena setiap
  // perubahan/pencabutan akses membuang entri ini seketika (lihat
  // hapusCacheUser di src/lib/cache-sesi.ts).
  const dariCache = await ambilCacheSesi(hash);
  if (dariCache) {
    // Pemakaian tetap dicatat — tapi lewat penahan 5 menit, jadi
    // jalur cepat ini benar-benar tanpa query di kebanyakan permintaan.
    await catatPemakaianToken(hash);
    return dariCache;
  }

  const db = supabase();
  const { data: sesi } = await db
    .from("sesi_perangkat")
    .select("id, user_id, token_hash")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!sesi) return null;

  // Perbandingan waktu-tetap: mencegah penebakan token lewat selisih
  // waktu respons.
  const a = Buffer.from(sesi.token_hash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const { data: user } = await db
    .from("app_user")
    .select(KOLOM_USER)
    .eq("id", sesi.user_id)
    .maybeSingle();

  const u = user as BarisUser | null;
  if (!u || !u.aktif || u.status !== "aktif") return null;

  // Catat pemakaian terakhir (berguna untuk daftar perangkat di profil).
  //
  // KENAPA TIDAK `void db...` SEPERTI SEBELUMNYA: query builder supabase-js
  // adalah "thenable malas" — seluruh permintaan HTTP-nya baru dikirim ketika
  // .then() dipanggil (lihat PostgrestBuilder di @supabase/postgrest-js).
  // Operator `void` hanya mengevaluasi lalu membuang ekspresinya dan TIDAK
  // pernah memanggil .then(), sehingga pembaruan ini diam-diam TIDAK PERNAH
  // terkirim — kolom dipakai_pada tak pernah terisi dan daftar perangkat di
  // layar Profil selalu menampilkan waktu yang basi.
  //
  // after() menjalankannya SETELAH respons dikirim: query-nya benar-benar
  // jalan (karena di-await di dalam callback), tapi pengguna tidak ikut
  // menunggu satu round-trip tambahan di setiap permintaan.
  await catatPemakaian(db, sesi.id);

  const publik = keUserPublik(u);
  // Ingat pasangan hash → sesi supaya jalur cepat berikutnya juga bisa
  // mencatat pemakaian tanpa mencari ulang id sesinya.
  idSesiPerHash.set(hash, String(sesi.id));
  await simpanCacheSesi(hash, publik);
  return publik;
}

/**
 * Tandai kapan sesi ini terakhir dipakai, tanpa membuat pengguna menunggu.
 *
 * after() hanya sah di dalam konteks permintaan. Bila fungsi sesi dipanggil
 * dari luar itu (mis. skrip perawatan), after() melempar — maka pembaruannya
 * dijalankan langsung supaya tetap tercatat, bukan hilang diam-diam.
 */
async function catatPemakaian(
  db: ReturnType<typeof supabase>,
  idSesi: string,
): Promise<void> {
  // Penahan 5 menit: kolom dipakai_pada hanya ditulis bila tulisan
  // terakhir untuk sesi ini sudah lewat JEDA_CATAT_MS. Layar "perangkat
  // aktif" di Profil tetap masuk akal karena presisinya memang
  // menit-an, bukan detik-an — sementara satu penulisan per permintaan
  // menjadi satu penulisan per lima menit.
  const terakhir = catatanTerakhir.get(idSesi) ?? 0;
  if (Date.now() - terakhir < JEDA_CATAT_MS) return;
  catatanTerakhir.set(idSesi, Date.now());
  bersihkanCatatanBasi();

  const tulis = async () => {
    await db
      .from("sesi_perangkat")
      .update({ dipakai_pada: new Date().toISOString() })
      .eq("id", idSesi);
  };

  try {
    after(tulis);
  } catch {
    await tulis();
  }
}

/** Jarak minimum antar penulisan dipakai_pada untuk satu sesi. */
const JEDA_CATAT_MS = 5 * 60_000;

/** id sesi → kapan terakhir dipakai_pada ditulis. */
const catatanTerakhir = new Map<string, number>();

/** token_hash → id sesi, supaya jalur cache tidak perlu query lagi. */
const idSesiPerHash = new Map<string, string>();

/** Jaga kedua Map di atas tidak tumbuh tanpa batas. */
function bersihkanCatatanBasi(): void {
  if (catatanTerakhir.size <= 5000) return;
  const batas = Date.now() - JEDA_CATAT_MS * 2;
  for (const [id, waktu] of catatanTerakhir) {
    if (waktu < batas) catatanTerakhir.delete(id);
  }
  if (idSesiPerHash.size > 5000) idSesiPerHash.clear();
}

/**
 * Catat pemakaian pada jalur cache, saat id sesi belum tentu diketahui.
 * Bila hash-nya belum pernah dipetakan, pencatatan dilewati saja —
 * permintaan berikutnya yang meleset dari cache akan memetakannya.
 */
async function catatPemakaianToken(hash: string): Promise<void> {
  const idSesi = idSesiPerHash.get(hash);
  if (!idSesi) return;
  await catatPemakaian(supabase(), idSesi);
}

/** Cabut satu sesi (keluar dari perangkat ini saja). */
export async function cabutSesi(token: string): Promise<void> {
  const bersih = (token ?? "").trim();
  if (!bersih) return;
  const hash = hashToken(bersih);
  await supabase().from("sesi_perangkat").delete().eq("token_hash", hash);
  // Tanpa baris ini, token yang baru dicabut masih diterima sampai TTL
  // cache habis — persis lubang yang tidak boleh ada.
  await hapusCacheToken(hash);
  idSesiPerHash.delete(hash);
}

/** Cabut SEMUA sesi milik satu akun (keluar dari semua perangkat). */
export async function cabutSemuaSesi(userId: number | string): Promise<void> {
  await supabase().from("sesi_perangkat").delete().eq("user_id", Number(userId));
  await hapusCacheUser(userId);
}

export { KOLOM_USER };
// Diekspor ulang agar route API cukup mengimpor dari satu tempat.
export { hapusCacheUser } from "@/lib/cache-sesi";
export type { BarisUser };

/**
 * Ambil token perangkat dari header Authorization: Bearer <token>.
 * Dipakai bersama pastikanMasuk() di route API.
 */
export function tokenDariRequest(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/**
 * Penjaga bawaan route API: kembalikan pengguna, atau lempar 401.
 *
 * Sengaja dibuat satu tempat supaya tidak ada lagi endpoint yang lupa
 * memasang penjaga — sebelumnya 12 endpoint terbuka tanpa login dan
 * salah satunya membocorkan seluruh daftar anggota beserta nomor WA.
 */
export async function pastikanMasuk(request: Request): Promise<UserPublik> {
  const user = await userDariToken(tokenDariRequest(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** true untuk peran yang boleh melihat data seluruh anggota (mis. nomor WA). */
export function adalahPengurus(peran: string): boolean {
  return peran === "master" || peran === "super_admin" || peran === "admin_hr";
}
