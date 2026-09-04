// ============================================================
// BERALIH AKUN / KENDALI (4 Sep 2026) — "senjata utama" Admin PALUGODAM.
//
// Admin Studio (master, super_admin, kepala Divisi PALUGODAM) bisa
// MENGENDALIKAN akun anggota Divisi PALUGODAM mana pun, TETAPI hanya di
// modul TV Rakyat Saya. Caranya: klien tetap memakai token admin sendiri,
// lalu menambah header `X-Sebagai: <user_id>` pada panggilan API. Hanya
// endpoint modul TVR Saya yang memanggil `userEfektifTvr()`; endpoint lain
// memakai `pastikanMasuk()` biasa dan tidak pernah melihat header itu —
// jadi kendali TIDAK bisa merembet ke chat, absensi, koin, dsb.
// ============================================================
import { supabase } from "@/lib/supabase";
import { keUserPublik, pastikanMasuk, type UserPublik } from "@/lib/sesi";
import { adalahAdminStudio, DIVISI_PALUGODAM } from "@/lib/struktur";

export const HEADER_SEBAGAI = "x-sebagai";

const KOLOM_USER =
  "id, email, nama, role, jabatan, avatar_url, status, profil_lengkap, aktif, username, nomor_wa, wa_terverifikasi, divisi, sub_divisi, posisi_divisi, nama_panggilan, tanggal_lahir, google_linked, google_avatar, sembunyi_kewajiban";

export type UserEfektif = UserPublik & {
  /** Terisi bila akun ini sedang dikendalikan admin (bukan pemiliknya sendiri). */
  dikendalikan?: { oleh_id: string; oleh_nama: string };
};

function galat(pesan: string, status: number): never {
  throw Object.assign(new Error(pesan), { status });
}

/**
 * Pengguna EFEKTIF untuk endpoint modul TVR Saya: pemilik token, atau —
 * bila admin Studio mengirim header X-Sebagai — anggota PALUGODAM yang
 * dikendalikan. Target wajib aktif dan anggota Divisi PALUGODAM.
 */
export async function userEfektifTvr(request: Request): Promise<UserEfektif> {
  const asli = await pastikanMasuk(request);
  const mentah = (request.headers.get(HEADER_SEBAGAI) ?? "").trim();
  if (!mentah) return asli;
  const targetId = Number(mentah);
  if (!Number.isFinite(targetId) || targetId <= 0) galat("Header X-Sebagai tidak sah.", 400);
  if (targetId === Number(asli.id)) return asli;
  if (!adalahAdminStudio(asli)) galat("Beralih akun hanya untuk Admin PALUGODAM / pengurus.", 403);
  const { data } = await supabase().from("app_user").select(KOLOM_USER).eq("id", targetId).maybeSingle();
  if (!data) galat("Akun yang dikendalikan tidak ditemukan.", 404);
  const b = data as unknown as Parameters<typeof keUserPublik>[0];
  if (b.aktif !== true || String(b.status) !== "aktif") galat("Akun itu tidak aktif.", 403);
  if (String(b.divisi ?? "").trim() !== DIVISI_PALUGODAM) galat("Hanya akun anggota Divisi PALUGODAM yang bisa dikendalikan.", 403);
  return { ...keUserPublik(b), dikendalikan: { oleh_id: String(asli.id), oleh_nama: asli.nama } };
}
