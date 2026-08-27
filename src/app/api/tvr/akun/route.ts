// GET/POST/PATCH/DELETE /api/tvr/akun — akun TV Rakyat MILIK ANGGOTA.
//
// Terpisah dari dua hal yang mirip tapi berbeda:
// - akun_sosmed_user: akun pribadi untuk QC komentar (IG/TikTok saja).
// - Akun TV Rakyat OFFICIAL yang dikelola tim mandiri lewat Ayrshare.
// Yang ini adalah akun TV Rakyat yang dikelola tiap anggota sendiri di
// 6 platform, tempat mereka mengunggah video lalu melaporkan linknya.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { beriKoin } from "@/lib/koin";

export const dynamic = "force-dynamic";

// "website" (spek 3.2): domain situs TV Rakyat, didaftarkan lewat form
// kecil terpisah dari akun sosmed; username-nya = nama domain.
const PLATFORM_SAH = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
  "twitter",
  "website",
] as const;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Rapikan username: buang @, spasi, dan URL profil yang ditempel utuh. */
function rapikanUsername(mentah: string): string {
  let u = (mentah ?? "").trim();
  const cocok =
    /(?:instagram\.com|tiktok\.com|youtube\.com|facebook\.com|threads\.net|x\.com|twitter\.com)\/@?([A-Za-z0-9._-]+)/i.exec(
      u,
    );
  if (cocok) u = cocok[1];
  return u.replace(/^@+/, "").replace(/\/+$/, "").trim().toLowerCase();
}

function periksaMasukan(platformMentah: string, usernameMentah: string) {
  const platform = (platformMentah ?? "").toLowerCase();
  if (!(PLATFORM_SAH as readonly string[]).includes(platform)) {
    throw Object.assign(new Error("Platform tidak dikenali."), { status: 400 });
  }
  const username = rapikanUsername(usernameMentah);
  if (platform === "website") {
    // Terima juga tempelan URL lengkap — ambil host-nya saja.
    const tanpaProtokol = username.replace(/^https?:\/\//, "").split("/")[0];
    const domain = tanpaProtokol.toLowerCase();
    // Domain situs: wajib berbentuk host yang sah (mis. tvrakyat.id).
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
      throw Object.assign(
        new Error("Tulis nama domain yang benar, contoh: tvrakyat.id"),
        { status: 400 },
      );
    }
    return { platform, username: domain };
  }
  if (!/^[a-z0-9._-]{2,60}$/.test(username)) {
    throw Object.assign(
      new Error("Username hanya boleh huruf, angka, titik, strip, dan garis bawah."),
      { status: 400 },
    );
  }
  return { platform, username };
}

/** Melempar bila username sudah diklaim orang lain di platform yang sama. */
async function pastikanBelumDiklaim(
  platform: string,
  username: string,
  userId: number,
  kecualiId?: number,
) {
  const { data } = await supabase()
    .from("akun_tvr_user")
    .select("id, user_id")
    .eq("platform", platform)
    .ilike("username", username)
    .maybeSingle();
  if (!data) return;
  if (kecualiId && Number(data.id) === kecualiId) return;
  throw Object.assign(
    new Error(
      Number(data.user_id) === userId
        ? `@${username} sudah ada di daftar Anda.`
        : `@${username} sudah didaftarkan anggota lain. Hubungi pengurus bila ini milik Anda.`,
    ),
    { status: 409 },
  );
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const { data, error } = await supabase()
      .from("akun_tvr_user")
      .select("id, platform, username, aktif")
      .eq("user_id", Number(user.id))
      .order("platform")
      .order("id");
    if (error) throw new Error("Gagal memuat akun TV Rakyat.");
    return { data: (data ?? []).map((a) => ({ ...a, id: String(a.id) })) };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      platform?: string;
      username?: string;
    };
    const { platform, username } = periksaMasukan(body.platform ?? "", body.username ?? "");
    await pastikanBelumDiklaim(platform, username, Number(user.id));

    const { data, error } = await supabase()
      .from("akun_tvr_user")
      .insert({ user_id: Number(user.id), platform, username, aktif: true })
      .select("id, platform, username, aktif")
      .single();
    if (error) {
      // Constraint unik menjaga balapan dua permintaan bersamaan.
      if (error.code === "23505") {
        throw Object.assign(
          new Error(`@${username} sudah didaftarkan anggota lain.`),
          { status: 409 },
        );
      }
      console.error("[tvr/akun] tambah:", error.message);
      throw new Error("Gagal menambahkan akun.");
    }
    // Koin tambah akun sosmed (spek 1.16) — sekali per akun.
    await beriKoin(Number(user.id), "akun_sosmed", `tvr-${data.id}`);
    return { sukses: true, data: { ...data, id: String(data.id) } };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      platform?: string;
      username?: string;
    };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Akun tidak disebutkan."), { status: 400 });
    const { platform, username } = periksaMasukan(body.platform ?? "", body.username ?? "");

    const { data: milik } = await supabase()
      .from("akun_tvr_user")
      .select("id")
      .eq("id", id)
      .eq("user_id", Number(user.id))
      .maybeSingle();
    if (!milik) throw Object.assign(new Error("Akun tidak ditemukan."), { status: 404 });

    await pastikanBelumDiklaim(platform, username, Number(user.id), id);
    const { error } = await supabase()
      .from("akun_tvr_user")
      .update({ platform, username })
      .eq("id", id);
    if (error) throw new Error("Gagal menyimpan perubahan.");
    return { sukses: true };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Akun tidak disebutkan."), { status: 400 });
    const { error } = await supabase()
      .from("akun_tvr_user")
      .delete()
      .eq("id", id)
      .eq("user_id", Number(user.id));
    if (error) throw new Error("Gagal menghapus akun.");
    return { sukses: true };
  });
}
