// GET    /api/akun-sosmed — daftar akun sosmed milik pengguna yang masuk
// POST   /api/akun-sosmed — tambah akun baru
// PATCH  /api/akun-sosmed — ubah akun yang sudah ada
// DELETE /api/akun-sosmed — hapus akun
//
// Satu orang boleh punya BANYAK akun per platform (akun pribadi + akun
// kepengurusan). Yang dijaga adalah sebaliknya: satu username hanya
// boleh diklaim satu orang — kalau tidak, komentar yang sama akan
// dikreditkan ke dua anggota sekaligus saat QC berjalan.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { beriKoin } from "@/lib/koin";
import { userDariToken } from "@/lib/sesi";

export const dynamic = "force-dynamic";

const PLATFORM_SAH = ["instagram", "tiktok"] as const;
type Platform = (typeof PLATFORM_SAH)[number];

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/**
 * Rapikan username: buang @, spasi, dan URL lengkap kalau pengguna
 * menempelkan tautan profil alih-alih mengetik namanya saja.
 */
function rapikanUsername(mentah: string): string {
  let u = (mentah ?? "").trim();
  const cocok = /(?:instagram\.com|tiktok\.com)\/@?([A-Za-z0-9._]+)/i.exec(u);
  if (cocok) u = cocok[1];
  return u.replace(/^@+/, "").replace(/\/+$/, "").trim().toLowerCase();
}

function periksaMasukan(platformMentah: string, usernameMentah: string) {
  const platform = (platformMentah ?? "").toLowerCase() as Platform;
  if (!PLATFORM_SAH.includes(platform)) {
    throw Object.assign(new Error("Platform harus Instagram atau TikTok."), {
      status: 400,
    });
  }
  const username = rapikanUsername(usernameMentah);
  if (!/^[a-z0-9._]{2,30}$/.test(username)) {
    throw Object.assign(
      new Error(
        "Username hanya boleh huruf, angka, titik, dan garis bawah (2–30 karakter).",
      ),
      { status: 400 },
    );
  }
  return { platform, username };
}

/** Melempar bila username sudah diklaim orang lain (atau baris lain milik sendiri) */
async function pastikanBelumDiklaim(
  platform: string,
  username: string,
  userId: number,
  kecualiId?: number,
) {
  const { data } = await supabase()
    .from("akun_sosmed_user")
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
    // --- Anggota yang BELUM menautkan akun sosmed (spek 1.18/2.1c) ---
    // Khusus pengurus HR: dipakai seksi "Analisis Akun yang Belum
    // Tertaut" supaya tahu siapa yang komentarnya tidak akan pernah
    // terhitung karena akunnya belum terdaftar.
    {
      const url = new URL(request.url);
      if (url.searchParams.get("tanpa") === "1") {
        const user = await pastikanMasuk(request);
        if (!["master", "super_admin", "admin_hr"].includes(user.role)) {
          throw Object.assign(new Error("Hanya pengurus yang boleh melihat daftar ini."), {
            status: 403,
          });
        }
        const db = supabase();
        const [{ data: semua }, { data: punya }] = await Promise.all([
          db
            .from("app_user")
            .select("id, nama, divisi")
            .eq("aktif", true)
            .eq("status", "aktif")
            .order("nama")
            .limit(1000),
          db.from("akun_sosmed_user").select("user_id").limit(2000),
        ]);
        const adaAkun = new Set((punya ?? []).map((r) => Number(r.user_id)));
        return {
          data: (semua ?? [])
            .filter((u) => !adaAkun.has(Number(u.id)))
            .map((u) => ({ id: String(u.id), nama: u.nama, divisi: u.divisi ?? "" })),
        };
      }
    }

    const user = await pastikanMasuk(request);

    const { data, error } = await supabase()
      .from("akun_sosmed_user")
      .select("id, platform, username, catatan, aktif")
      .eq("user_id", Number(user.id))
      .order("platform")
      .order("id");

    if (error) throw new Error("Gagal memuat akun sosmed");
    return { data: (data ?? []).map((a) => ({ ...a, id: String(a.id) })) };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      platform?: string;
      username?: string;
      catatan?: string;
    };

    const { platform, username } = periksaMasukan(body.platform ?? "", body.username ?? "");
    await pastikanBelumDiklaim(platform, username, Number(user.id));

    const { data, error } = await supabase()
      .from("akun_sosmed_user")
      .insert({
        user_id: Number(user.id),
        platform,
        username,
        catatan: (body.catatan ?? "").trim() || null,
        aktif: true,
      })
      .select("id, platform, username, catatan, aktif")
      .single();

    if (error) {
      // Jaring pengaman balapan (bug #8 1.15): dua permintaan bisa lolos
      // pemeriksaan pra-insert bersamaan — unique index database yang
      // menahannya, dan di sini pesannya dibuat sama ramahnya.
      if (error.code === "23505") {
        throw Object.assign(
          new Error(`@${username} sudah didaftarkan. Periksa daftar akun Anda.`),
          { status: 409 },
        );
      }
      console.error("[akun-sosmed] tambah:", error.message);
      throw new Error("Gagal menambahkan akun.");
    }
    await beriKoin(Number(user.id), "akun_sosmed", `qc-${data.id}`);
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
      catatan?: string;
    };

    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Akun tidak disebutkan."), { status: 400 });

    const { platform, username } = periksaMasukan(body.platform ?? "", body.username ?? "");

    // Pastikan baris ini memang milik pemanggil — id bisa saja ditebak.
    const { data: milik } = await supabase()
      .from("akun_sosmed_user")
      .select("id")
      .eq("id", id)
      .eq("user_id", Number(user.id))
      .maybeSingle();
    if (!milik) {
      throw Object.assign(new Error("Akun tidak ditemukan."), { status: 404 });
    }

    await pastikanBelumDiklaim(platform, username, Number(user.id), id);

    const { error } = await supabase()
      .from("akun_sosmed_user")
      .update({
        platform,
        username,
        catatan: (body.catatan ?? "").trim() || null,
      })
      .eq("id", id);

    if (error) {
      if (error.code === "23505") {
        throw Object.assign(
          new Error(`@${username} sudah didaftarkan. Periksa daftar akun Anda.`),
          { status: 409 },
        );
      }
      throw new Error("Gagal menyimpan perubahan.");
    }
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
      .from("akun_sosmed_user")
      .delete()
      .eq("id", id)
      .eq("user_id", Number(user.id));

    if (error) throw new Error("Gagal menghapus akun.");
    return { sukses: true };
  });
}
