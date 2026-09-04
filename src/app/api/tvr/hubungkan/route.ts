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
import { penyediaAnggota } from "@/lib/sosmed-penyedia";

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
    const penyedia = penyediaAnggota();
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

    return { url: await penyedia.tautanHubungkan(profil.profile_key as string) };
  });
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const penyedia = penyediaAnggota();
    const db = supabase();

    const profil = await profilKu(Number(user.id), penyedia.id);
    if (!profil) return { terhubung: [], tersinkron: 0, konflik: [] };

    const tertaut = (await penyedia.akunTertaut(profil.profile_key as string)).filter((a) =>
      PLATFORM_TVR.has(a.platform),
    );

    // Sinkron ke akun_tvr_user: tambah yang belum ada (terhubung=true);
    // yang sudah kupunya ditandai terhubung; milik orang lain = konflik.
    let tersinkron = 0;
    const konflik: string[] = [];
    for (const a of tertaut) {
      const username = a.username.toLowerCase().replace(/^@+/, "");
      if (!username) continue;
      const { data: ada } = await db
        .from("akun_tvr_user")
        .select("id, user_id")
        .eq("platform", a.platform)
        .ilike("username", username)
        .maybeSingle();
      if (!ada) {
        const { error } = await db.from("akun_tvr_user").insert({
          user_id: Number(user.id),
          platform: a.platform,
          username,
          terhubung: true,
        });
        if (!error) tersinkron += 1;
      } else if (Number(ada.user_id) === Number(user.id)) {
        await db.from("akun_tvr_user").update({ terhubung: true }).eq("id", ada.id);
      } else {
        konflik.push(`@${username} (${a.platform}) sudah terdaftar milik anggota lain`);
      }
    }

    return {
      terhubung: tertaut.map((a) => ({
        platform: a.platform,
        username: a.username.toLowerCase().replace(/^@+/, ""),
      })),
      tersinkron,
      konflik,
    };
  });
}
