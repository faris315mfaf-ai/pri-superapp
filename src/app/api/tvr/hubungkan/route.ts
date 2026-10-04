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
import { userEfektifTvr } from "@/lib/sebagai";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { penyediaUntukAnggota } from "@/lib/sosmed-penyedia";
import { koneksiTvr, lupakanKoneksiTvr, profilPenyediaKu, PLATFORM_TVR as URUTAN_PLATFORM } from "@/lib/koneksi-tvr";

export const dynamic = "force-dynamic";

const PLATFORM_TVR = new Set<string>(URUTAN_PLATFORM);

async function pastikanMasuk(request: Request) {
  // 4 Sep 2026: admin PALUGODAM bisa mengendalikan akun anggota (header X-Sebagai).
  return userEfektifTvr(request);
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    // Sesudah menautkan, pembacaan berikutnya harus bertanya ke penyedia lagi.
    await lupakanKoneksiTvr(Number(user.id));
    const penyedia = await penyediaUntukAnggota(Number(user.id));
    const db = supabase();

    let profil = await profilPenyediaKu(Number(user.id), penyedia.id);
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
 * Baca akun tertaut + sinkron ke akun_tvr_user, beserta status per platform
 * (terhubung / perlu sambung ulang / belum) dan jumlah akun sehat untuk
 * syarat Edit Otomatis (5 Okt 2026). Disimpan 10 menit; ?segar=1 (tombol
 * Segarkan) dan POST (Hubungkan) memaksa bertanya ke penyedia lagi.
 */
export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const segar = new URL(request.url).searchParams.get("segar") === "1";
    return koneksiTvr(Number(user.id), { segar });
  });
}
