// ============================================================
// PROFIL UPLOAD-POST AKUN TV RAKYAT OFFICIAL (16 Okt 2026) — satu-satunya
// jalur akun Official sejak Ayrshare dihapus: unggah, jadwal, insight,
// dan daftar postingan memakai profil ini. Profil dibuat & ditautkan dari
// kartu "Tautkan ke upload-post" (/api/tv/official-up).
// ============================================================

import { supabase } from "@/lib/supabase";
import { statusAkunUp, uploadPostSiap } from "@/lib/upload-post";

export const KUNCI_PROFIL_OFFICIAL = "upload_post_profil_official";
export const PROFIL_OFFICIAL_BAWAAN = "tvrakyat-official";

/** Username profil upload-post Official ("" bila belum pernah ditautkan). */
export async function profilOfficialUp(): Promise<string> {
  const { data } = await supabase().from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI_PROFIL_OFFICIAL).maybeSingle();
  return String(data?.nilai ?? "").trim();
}

/** Pesan untuk layar bila Official belum siap dipakai mengunggah. */
export const PESAN_OFFICIAL_BELUM_TERTAUT =
  "Akun TV Rakyat Official belum ditautkan ke upload-post. Buka TV Rakyat → kartu \"Tautkan ke upload-post\" lalu tautkan akun sosmednya.";

/**
 * Profil + platform yang tertaut & sehat untuk akun Official.
 * Galat 503 bila upload-post belum diatur, 409 bila profil belum ada / tidak ada akun tertaut.
 */
export async function pastikanOfficialUp(): Promise<{ profil: string; platform: string[]; perluUlang: string[] }> {
  if (!uploadPostSiap()) throw Object.assign(new Error("upload-post belum diatur di server."), { status: 503 });
  const profil = await profilOfficialUp();
  if (!profil) throw Object.assign(new Error(PESAN_OFFICIAL_BELUM_TERTAUT), { status: 409 });
  const { akun, perluUlang } = await statusAkunUp(profil);
  const platform = Object.keys(akun).filter((p) => !perluUlang.includes(p));
  if (platform.length === 0) throw Object.assign(new Error(PESAN_OFFICIAL_BELUM_TERTAUT), { status: 409 });
  return { profil, platform, perluUlang };
}
