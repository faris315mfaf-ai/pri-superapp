// Penautan sosmed SUNGGUHAN untuk TVR Saya (spek 1.17):
// 1 pengguna = 1 profil penyedia (Ayrshare; nanti upload-post).
//
// POST → pastikan profilku ada (buat bila belum), lalu kembalikan URL
//        halaman penautan white-label — pengguna login sosmednya di
//        sana TANPA membuka dashboard penyedia.
// GET  → baca akun yang sudah tertaut di profilku, lalu SINKRONKAN ke
//        akun_tvr_user (terhubung=true). Akun yang sudah diklaim
//        anggota lain dilaporkan, bukan direbut.
import { supabase } from "@/lib/supabase";
import { sinkronkanAkunTertaut } from "@/lib/sinkron-akun-tertaut";
import { userEfektifTvr } from "@/lib/sebagai";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { penyediaUntukAnggota } from "@/lib/sosmed-penyedia";
import { denganCache, hapusCacheBersama } from "@/lib/cache-bersama";

export const dynamic = "force-dynamic";

const PLATFORM_TVR = new Set([
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
  "twitter",
]);

async function pastikanMasuk(request: Request) {
  // 4 Sep 2026: admin PALUGODAM bisa mengendalikan akun anggota (header X-Sebagai).
  return userEfektifTvr(request);
}

/** Profil penyedia milik user ini (baris database), atau null. */
async function profilKu(userId: number, penyediaId: string) {
  const { data } = await supabase()
    .from("sosmed_profile")
    .select("id, profile_key")
    .eq("jenis", "pengguna")
    .eq("penyedia", penyediaId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    // Sesudah menautkan, pembacaan berikutnya harus bertanya ke penyedia lagi.
    await hapusCacheBersama(kunciCacheTertaut(Number(user.id)));
    const penyedia = await penyediaUntukAnggota(Number(user.id));
    const db = supabase();

    let profil = await profilKu(Number(user.id), penyedia.id);
    if (!profil) {
      const dibuat = await penyedia.buatProfil(
        `${user.username || user.nama} (PRI ${user.id})`,
      );
      const { data: baris, error } = await db
        .from("sosmed_profile")
        .insert({
          penyedia: penyedia.id,
          jenis: "pengguna",
          judul: user.username || user.nama,
          profile_key: dibuat.profileKey,
          ref_id: dibuat.refId,
          user_id: Number(user.id),
          dibuat_oleh: Number(user.id),
        })
        .select("id, profile_key")
        .single();
      if (error) {
        await penyedia.hapusProfil(dibuat.profileKey).catch(() => {});
        console.error("[tvr/hubungkan] simpan profil:", error.message);
        throw new Error("Gagal menyiapkan profil penautan.");
      }
      profil = baris;
    }

    // 12 Sep 2026: tombol "Facebook Page" meminta halaman penautan yang
    // HANYA Facebook, supaya langsung ke pemilihan Halaman — bukan
    // tersangkut di profil pribadi yang tidak diterima upload-post.
    const body = (await request.json().catch(() => ({}))) as { platform?: string };
    const platform = String(body.platform ?? "").trim().toLowerCase();
    const platforms = PLATFORM_TVR.has(platform) ? [platform] : undefined;
    return { url: await penyedia.tautanHubungkan(profil.profile_key as string, platforms) };
  });
}

/**
 * Kunci cache akun tertaut seseorang (28 Sep 2026, rencana "200 orang tanpa
 * lag" #7). Dulu SETIAP penyegaran layar TVR Saya bertanya ke penyedia
 * sosmed (upload-post/Postiz) lalu menulis sinkron ke database — padahal
 * akun tertaut baru berubah saat orang itu menautkan akun. Kini disimpan
 * 10 menit; tombol "Segarkan" (?segar=1) dan tombol "Hubungkan" (POST)
 * selalu memaksa data baru.
 */
function kunciCacheTertaut(userId: number): string {
  return `tvr-hubungkan:${userId}`;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const kunci = kunciCacheTertaut(Number(user.id));
    if (new URL(request.url).searchParams.get("segar") === "1") await hapusCacheBersama(kunci);
    let dihitung = false;
    const hasil = await denganCache(kunci, 600, async () => {
      dihitung = true;
      return bacaDanSinkronTertaut(user);
    });
    // Dari simpanan: tidak ada yang "baru ditambahkan" pada panggilan ini.
    return dihitung ? hasil : { ...hasil, tersinkron: 0 };
  });
}

async function bacaDanSinkronTertaut(user: { id: string | number }): Promise<{
  terhubung: { platform: string; username: string }[];
  tersinkron: number;
  konflik: string[];
}> {
  const penyedia = await penyediaUntukAnggota(Number(user.id));
  const db = supabase();

  const profil = await profilKu(Number(user.id), penyedia.id);
  if (!profil) return { terhubung: [], tersinkron: 0, konflik: [] };

  let tertaut: { platform: string; username: string }[];
  try {
    tertaut = (await penyedia.akunTertaut(profil.profile_key as string)).filter((a) =>
      PLATFORM_TVR.has(a.platform),
    );
  } catch (e) {
    // Kuota upload-post habis sesaat: jangan gagalkan layar unggah.
    // Akun yang sudah tersimpan di database tetap ditampilkan.
    if ((e as { status?: number }).status !== 429) throw e;
    const { data: simpanan } = await db
      .from("akun_tvr_user")
      .select("platform, username")
      .eq("user_id", Number(user.id))
      .eq("terhubung", true);
    return {
      terhubung: (simpanan ?? [])
        .filter((a) => PLATFORM_TVR.has(String(a.platform)))
        .map((a) => ({
          platform: String(a.platform),
          username: String(a.username ?? "").toLowerCase().replace(/^@+/, ""),
        })),
      tersinkron: 0,
      konflik: [],
    };
  }

  // Sinkron ke akun_tvr_user: tambah yang belum ada (terhubung=true);
  // yang sudah kupunya ditandai terhubung; milik orang lain = konflik.
  // Kueri tetap berapa pun jumlah akunnya (lib/sinkron-akun-tertaut).
  const { tersinkron, konflik } = await sinkronkanAkunTertaut(db, Number(user.id), tertaut);

  return {
    terhubung: tertaut.map((a) => ({
      platform: a.platform,
      username: a.username.toLowerCase().replace(/^@+/, ""),
    })),
    tersinkron,
    konflik,
  };
}
