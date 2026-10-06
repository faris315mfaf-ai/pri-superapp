// ============================================================
// Status koneksi akun sosmed TVR Saya (5 Okt 2026).
//
// Dipakai GET /api/tvr/hubungkan: layar TVR Saya menampilkan berapa akun
// terhubung dan mana yang perlu disambung ulang.
//
// "Sehat" = tertaut di penyedia DAN tidak ditandai perlu login ulang
// (upload-post: reauth_required). Hasilnya disimpan 10 menit per orang
// (cache bersama); tombol Segarkan dan Hubungkan memaksa data baru.
// ============================================================
import { supabase } from "@/lib/supabase";
import { sinkronkanAkunTertaut } from "@/lib/sinkron-akun-tertaut";
import { penyediaUntukAnggota } from "@/lib/sosmed-penyedia";
import { denganCache, hapusCacheBersama } from "@/lib/cache-bersama";

/** Enam sosmed TVR Saya, urut seperti di layar. */
export const PLATFORM_TVR = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"] as const;
const SAH = new Set<string>(PLATFORM_TVR);

export type KeadaanAkunTvr = "terhubung" | "ulang" | "belum";

export type StatusAkunTvr = {
  platform: string;
  /** null bila belum tertaut */
  username: string | null;
  keadaan: KeadaanAkunTvr;
};

export type KoneksiTvr = {
  /** Semua akun tertaut (termasuk yang perlu login ulang). */
  terhubung: { platform: string; username: string }[];
  tersinkron: number;
  konflik: string[];
  /** Satu baris per platform TVR, urut PLATFORM_TVR. */
  status: StatusAkunTvr[];
  /** Akun terhubung yang sehat (tidak perlu login ulang). */
  jumlah_terhubung: number;
};

function bersihkan(u: string): string {
  return u.toLowerCase().replace(/^@+/, "");
}

function susunStatus(
  tertaut: { platform: string; username: string; perluSambungUlang?: boolean }[],
): Pick<KoneksiTvr, "status" | "jumlah_terhubung"> {
  const per = new Map(tertaut.map((a) => [a.platform, a]));
  const status: StatusAkunTvr[] = PLATFORM_TVR.map((platform) => {
    const a = per.get(platform);
    if (!a) return { platform, username: null, keadaan: "belum" };
    return { platform, username: bersihkan(a.username), keadaan: a.perluSambungUlang ? "ulang" : "terhubung" };
  });
  return {
    status,
    jumlah_terhubung: status.filter((s) => s.keadaan === "terhubung").length,
  };
}

/**
 * Kunci cache akun tertaut seseorang (28 Sep 2026, rencana "200 orang tanpa
 * lag" #7): akun tertaut baru berubah saat orangnya menautkan akun, jadi
 * tidak perlu bertanya ke penyedia di setiap buka layar.
 */
export function kunciCacheTertaut(userId: number): string {
  return `tvr-hubungkan:${userId}`;
}

export function lupakanKoneksiTvr(userId: number): Promise<void> {
  return hapusCacheBersama(kunciCacheTertaut(userId));
}

/** Profil penyedia milik user ini (baris database), atau null. */
export async function profilPenyediaKu(userId: number, penyediaId: string) {
  const { data } = await supabase()
    .from("sosmed_profile")
    .select("id, profile_key")
    .eq("jenis", "pengguna")
    .eq("penyedia", penyediaId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** Akun yang tersimpan terhubung di database — cadangan bila penyedia tak bisa ditanya. */
async function tertautTersimpan(userId: number): Promise<{ platform: string; username: string }[]> {
  const { data } = await supabase()
    .from("akun_tvr_user")
    .select("platform, username")
    .eq("user_id", userId)
    .eq("terhubung", true);
  return (data ?? [])
    .filter((a) => SAH.has(String(a.platform)))
    .map((a) => ({ platform: String(a.platform), username: bersihkan(String(a.username ?? "")) }));
}

async function bacaDanSinkron(userId: number): Promise<KoneksiTvr> {
  const penyedia = await penyediaUntukAnggota(userId);
  const profil = await profilPenyediaKu(userId, penyedia.id);
  if (!profil) return { terhubung: [], tersinkron: 0, konflik: [], ...susunStatus([]) };

  let tertaut: { platform: string; username: string; perluSambungUlang?: boolean }[];
  try {
    tertaut = (await penyedia.akunTertaut(profil.profile_key as string)).filter((a) => SAH.has(a.platform));
  } catch (e) {
    // Kuota upload-post habis sesaat: jangan gagalkan layar unggah. Akun yang
    // sudah tersimpan tetap ditampilkan (tanpa tahu mana yang perlu login ulang).
    if ((e as { status?: number }).status !== 429) throw e;
    const simpanan = await tertautTersimpan(userId);
    return { terhubung: simpanan, tersinkron: 0, konflik: [], ...susunStatus(simpanan) };
  }

  // Sinkron ke akun_tvr_user: tambah yang belum ada (terhubung=true); yang
  // sudah kupunya ditandai terhubung; milik orang lain = konflik.
  const { tersinkron, konflik } = await sinkronkanAkunTertaut(supabase(), userId, tertaut);
  return {
    terhubung: tertaut.map((a) => ({ platform: a.platform, username: bersihkan(a.username) })),
    tersinkron,
    konflik,
    ...susunStatus(tertaut),
  };
}

/**
 * Status koneksi seseorang, dari simpanan 10 menit bila ada. `segar` membuang
 * simpanan dulu (tombol Segarkan). `tersinkron` hanya bermakna pada panggilan
 * yang benar-benar bertanya ke penyedia.
 */
export async function koneksiTvr(userId: number, opsi: { segar?: boolean } = {}): Promise<KoneksiTvr> {
  const kunci = kunciCacheTertaut(userId);
  if (opsi.segar) await hapusCacheBersama(kunci);
  let dihitung = false;
  const hasil = await denganCache(kunci, 600, async () => {
    dihitung = true;
    return bacaDanSinkron(userId);
  });
  // Simpanan dari versi lama (sebelum 5 Okt 2026) belum membawa status.
  if (!Array.isArray(hasil.status)) {
    return { ...hasil, ...susunStatus(hasil.terhubung ?? []), tersinkron: dihitung ? hasil.tersinkron : 0 };
  }
  return dihitung ? hasil : { ...hasil, tersinkron: 0 };
}

