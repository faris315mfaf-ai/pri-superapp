// GET /api/login/google/callback — akhir alur Google OAuth (1.19/3.1).
//
// Menukar `code` menjadi id_token, MEMVERIFIKASI-nya dengan
// google-auth-library (tanda tangan + audience — BUKAN verifikasi
// manual), lalu:
// - mode TAUTKAN (state membawa user id): tautkan google_id ke akun
//   yang sedang masuk;
// - email SUDAH terdaftar → langsung login (lengkapi kolom google_*);
// - email BELUM terdaftar → BUAT AKUN OTOMATIS berstatus "menunggu"
//   (diubah 1.19.1): role anggota, username dari email (+angka bila
//   bentrok), email terverifikasi Google. Pengurus dikabari; pendaftar
//   diantar ke HALAMAN TUNGGU yang berpindah sendiri saat disetujui.
//
// Token sesi diantarkan lewat redirect /?gtoken=... (dibaca aplikasi
// lalu dibersihkan dari URL).
import { OAuth2Client } from "google-auth-library";
import { supabase } from "@/lib/supabase";
import { buatSesi } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { bacaStateGoogle, urlAplikasi } from "@/lib/google-oauth";
import { buatHashSandi } from "@/lib/sandi";
import { pastikanBukanPerbaikan } from "@/lib/perbaikan";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

function keBeranda(request: Request, param: string): Response {
  return Response.redirect(`${urlAplikasi(request)}/?${param}`, 302);
}

function gagal(request: Request, pesan: string): Response {
  return keBeranda(request, `gerror=${encodeURIComponent(pesan)}`);
}

/** Username unik dari bagian lokal email; +angka acak bila terpakai. */
async function usernameUnik(email: string): Promise<string> {
  const db = supabase();
  const dasar =
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, "")
      .slice(0, 16) || "pengguna";
  let calon = dasar.length >= 3 ? dasar : `${dasar}123`;
  for (let i = 0; i < 5; i++) {
    const { data } = await db
      .from("app_user")
      .select("id")
      .eq("username", calon)
      .maybeSingle();
    if (!data) return calon;
    calon = `${dasar.slice(0, 14)}${Math.floor(100 + Math.random() * 900)}`;
  }
  return `${dasar.slice(0, 10)}${Date.now() % 100000}`;
}

export async function GET(request: Request) {
  const tolak = await pastikanTidakMelebihiBatas(request, "google-callback", 20, 10 * 60);
  if (tolak) return tolak;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!code) return gagal(request, "Login Google dibatalkan.");

  // Anti-CSRF: state wajib bertanda tangan sah & belum kedaluwarsa.
  const isiState = bacaStateGoogle(state);
  if (!isiState) return gagal(request, "Sesi Google tidak sah. Coba lagi.");

  try {
    // --- Tukar code -> token, lalu VERIFIKASI id_token ---
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${urlAplikasi(request)}/api/login/google/callback`,
    );
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) return gagal(request, "Google tidak mengirim identitas.");
    const tiket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const info = tiket.getPayload();
    const email = (info?.email ?? "").toLowerCase();
    if (!info?.sub || !email || info.email_verified !== true) {
      return gagal(request, "Email Google belum terverifikasi.");
    }

    const db = supabase();
    const kini = new Date().toISOString();
    const kolomGoogle = {
      google_id: info.sub,
      google_avatar: info.picture ?? "",
      google_linked: true,
      google_verified_at: kini,
      email_verified_at: kini,
    };

    // --- Mode TAUTKAN: sambungkan ke akun yang sedang masuk ---
    if (isiState.u) {
      const { data: sudahDipakai } = await db
        .from("app_user")
        .select("id")
        .eq("google_id", info.sub)
        .maybeSingle();
      if (sudahDipakai && String(sudahDipakai.id) !== isiState.u) {
        return gagal(request, "Akun Google ini sudah tertaut ke anggota lain.");
      }
      const { error } = await db
        .from("app_user")
        .update(kolomGoogle)
        .eq("id", Number(isiState.u));
      if (error) return gagal(request, "Gagal menautkan akun Google.");
      return keBeranda(request, "gtautkan=1");
    }

    // --- Login / daftar otomatis ---
    // Aturan blokir SAMA dengan login biasa: hanya akun nonaktif dan
    // "ditolak" yang ditahan — status "menunggu" tetap boleh masuk.
    const { data: lewatGoogleId } = await db
      .from("app_user")
      .select("id, aktif, status, role")
      .eq("google_id", info.sub)
      .maybeSingle();
    const { data: lewatEmail } = lewatGoogleId
      ? { data: null }
      : await db
          .from("app_user")
          .select("id, aktif, status, role")
          .eq("email", email)
          .maybeSingle();

    const lama = lewatGoogleId ?? lewatEmail;
    let userId: number;
    if (lama) {
      userId = Number(lama.id);
      if (!lama.aktif) {
        return gagal(request, "Akun ini dinonaktifkan. Hubungi pengurus.");
      }
      if (lama.status === "ditolak") {
        return gagal(request, "Permohonan akun Anda ditolak. Hubungi pengurus.");
      }
      // Mode perbaikan menahan semua selain master — sama seperti login
      // biasa; pesannya instruktif jadi diteruskan apa adanya.
      try {
        await pastikanBukanPerbaikan(lama.role);
      } catch (e) {
        return gagal(request, e instanceof Error ? e.message : "Sedang perbaikan.");
      }
      // Lengkapi kolom Google bila masuk lewat kecocokan email.
      if (!lewatGoogleId) await db.from("app_user").update(kolomGoogle).eq("id", userId);
    } else {
      // DAFTAR BARU lewat Google (diubah 1.19.1 atas permintaan user):
      // akun dibuat berstatus "MENUNGGU" — sama seperti pendaftaran
      // biasa, harus disetujui pengurus dulu. Pendaftar diantar ke
      // halaman tunggu yang berpindah sendiri begitu disetujui.
      // Saat mode perbaikan, pendaftaran baru juga ditahan.
      try {
        await pastikanBukanPerbaikan("anggota");
      } catch (e) {
        return gagal(request, e instanceof Error ? e.message : "Sedang perbaikan.");
      }
      const username = await usernameUnik(email);
      const { data: baru, error } = await db
        .from("app_user")
        .insert({
          email,
          username,
          nama: info.name || username,
          avatar_url: info.picture ?? "",
          // Sandi acak tak tertebak — masuknya lewat Google; bisa
          // di-reset pengurus bila mau login biasa.
          password_hash: await buatHashSandi(randomBytes(24).toString("base64url")),
          role: "anggota",
          jabatan: "",
          status: "menunggu",
          aktif: true,
          profil_lengkap: false,
          wa_terverifikasi: false,
          ...kolomGoogle,
        })
        .select("id")
        .single();
      if (error || !baru) {
        console.error("[google] daftar:", error?.message);
        return gagal(request, "Gagal membuat akun dari Google.");
      }
      userId = Number(baru.id);
      // Pengurus dikabari supaya pendaftar tidak menunggu terlalu lama.
      await kirimKabar({
        judul: "Pendaftar baru lewat Google",
        isi: `${info.name || email} (${email}) mendaftar via Google — menunggu persetujuan di Kelola Pengguna.`,
        kategori: "peringatan",
        jenis_peristiwa: "keamanan",
        untukRole: ["admin_hr", "super_admin", "master"],
      });
    }

    await db.from("app_user").update({ last_login_at: kini }).eq("id", userId);
    const token = await buatSesi(userId, "Login Google");
    return keBeranda(request, `gtoken=${encodeURIComponent(token)}`);
  } catch (e) {
    console.error("[google] callback:", e);
    return gagal(request, "Gagal masuk dengan Google. Silakan coba lagi.");
  }
}
