// POST /api/otp-email — verifikasi kode yang dikirim ke EMAIL
// PUT  /api/otp-email — kirim ulang kode
//
// Menggantikan /api/otp (WhatsApp) untuk pendaftaran. Verifikasi yang
// berhasil menandai email terverifikasi (email_verified_at) dan
// mengembalikan token perangkat, supaya pengguna langsung lanjut
// melengkapi profil tanpa disuruh masuk lagi.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { kirimOtpEmail, verifikasiOtpEmail, normalkanEmail } from "@/lib/otp-email";
import { EmailBelumDiaturError } from "@/lib/email";
import {
  hapusCacheUser,
  buatSesi,
  keUserPublik,
  KOLOM_USER,
  type BarisUser,
} from "@/lib/sesi";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Rate limit SEBELUM query database: 5 verifikasi / 15 menit / IP.
  const tolak = await pastikanTidakMelebihiBatas(request, "otp-email-verifikasi", 5, 15 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      kode?: string;
      nama_perangkat?: string;
    };

    const email = normalkanEmail(body.email ?? "");
    if (!email) {
      throw Object.assign(new Error("Email tidak disebutkan."), { status: 400 });
    }

    const hasil = await verifikasiOtpEmail(email, body.kode ?? "");
    if (!hasil.sah) {
      throw Object.assign(new Error(hasil.pesan), { status: hasil.status ?? 400 });
    }

    const db = supabase();
    const { data } = await db
      .from("app_user")
      .select(KOLOM_USER)
      .eq("email", email)
      .maybeSingle();

    const user = data as BarisUser | null;
    if (!user) {
      // ANTI-ENUMERASI: jawaban generik + kerja tiruan yang menyerupai
      // jalur sukses (satu update + satu pembuatan sesi ≈ dua query)
      // supaya bedanya tak bisa diendus lewat selisih waktu respons.
      await db.from("app_user").update({ email_verified_at: new Date().toISOString() }).eq("id", -1);
      await db.from("sesi_perangkat").select("id").eq("id", -1).maybeSingle();
      throw Object.assign(new Error("Email atau kode OTP tidak sesuai."), { status: 401 });
    }

    await db
      .from("app_user")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("id", user.id);
    await hapusCacheUser(user.id);

    // Token diberikan meski status masih 'menunggu' — pengguna perlu bisa
    // melengkapi profil dan melihat layar "menunggu persetujuan".
    const token = await buatSesi(user.id, body.nama_perangkat);

    return { sukses: true, token, user: keUserPublik(user) };
  });
}

export async function PUT(request: Request) {
  // Kirim ulang: 3 / 15 menit per PASANGAN email+IP.
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalkanEmail(body.email ?? "");
  const tolak = await pastikanTidakMelebihiBatas(
    request,
    "otp-email-kirim-ulang",
    3,
    15 * 60,
    email,
  );
  if (tolak) return tolak;

  return bungkus(async () => {
    if (!email) {
      throw Object.assign(new Error("Email tidak disebutkan."), { status: 400 });
    }
    try {
      await kirimOtpEmail(email, "daftar");
    } catch (e) {
      if (e instanceof EmailBelumDiaturError) {
        throw Object.assign(new Error(e.message), { status: 503 });
      }
      throw e;
    }
    return { sukses: true };
  });
}
