// POST /api/otp        — verifikasi kode yang dikirim ke WhatsApp
// PUT  /api/otp        — kirim ulang kode
//
// Verifikasi yang berhasil menandai nomor terverifikasi dan mengembalikan
// token perangkat, supaya pengguna bisa langsung lanjut melengkapi profil
// tanpa disuruh masuk lagi.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { normalkanNomorWa, FonnteBelumDiaturError } from "@/lib/fonnte";
import { kirimOtp, verifikasiOtp } from "@/lib/otp";
import { buatSesi, keUserPublik, KOLOM_USER, type BarisUser } from "@/lib/sesi";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Rate limit SEBELUM query database: 5 verifikasi / 15 menit / IP.
  const tolak = await pastikanTidakMelebihiBatas(request, "otp-verifikasi", 5, 15 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      nomor_wa?: string;
      kode?: string;
      nama_perangkat?: string;
    };

    const nomor = normalkanNomorWa(body.nomor_wa ?? "");
    if (!nomor) {
      throw Object.assign(new Error("Nomor WhatsApp tidak disebutkan."), { status: 400 });
    }

    const hasil = await verifikasiOtp(nomor, body.kode ?? "");
    if (!hasil.sah) {
      throw Object.assign(new Error(hasil.pesan), { status: hasil.status ?? 400 });
    }

    const db = supabase();
    const { data } = await db
      .from("app_user")
      .select(KOLOM_USER)
      .eq("nomor_wa", nomor)
      .maybeSingle();

    const user = data as BarisUser | null;
    if (!user) {
      // ANTI-ENUMERASI: dulu jalur ini membalas 404 "akun tidak
      // ditemukan" — artinya siapa pun bisa memetakan nomor mana saja
      // yang terdaftar. Kini jawabannya generik dan berstatus sama
      // dengan salah kode, PLUS kerja tiruan yang menyerupai jalur
      // sukses (satu update + satu pembuatan sesi ≈ dua query) supaya
      // bedanya tidak bisa diendus lewat selisih waktu respons.
      await db.from("app_user").update({ wa_terverifikasi: true }).eq("id", -1);
      await db.from("sesi_perangkat").select("id").eq("id", -1).maybeSingle();
      throw Object.assign(new Error("Nomor atau kode OTP tidak sesuai."), {
        status: 401,
      });
    }

    await db
      .from("app_user")
      .update({ wa_terverifikasi: true })
      .eq("id", user.id);

    // Token diberikan meski status masih 'menunggu' — pengguna perlu
    // bisa melengkapi profil dan melihat layar "menunggu persetujuan".
    // Akses ke data partai tetap dijaga terpisah lewat status akun.
    const token = await buatSesi(user.id, body.nama_perangkat);

    return {
      sukses: true,
      token,
      user: keUserPublik({ ...user, wa_terverifikasi: true } as BarisUser),
    };
  });
}

export async function PUT(request: Request) {
  // Kirim ulang kode: 3 / 15 menit per PASANGAN nomor+IP — badan
  // permintaan dibaca dulu (sekali) karena nomornya bagian dari kunci.
  const body = (await request.json().catch(() => ({}))) as { nomor_wa?: string };
  const tolak = await pastikanTidakMelebihiBatas(
    request,
    "otp-kirim-ulang",
    3,
    15 * 60,
    normalkanNomorWa(body.nomor_wa ?? ""),
  );
  if (tolak) return tolak;

  return bungkus(async () => {
    const nomor = normalkanNomorWa(body.nomor_wa ?? "");
    if (!nomor) {
      throw Object.assign(new Error("Nomor WhatsApp tidak disebutkan."), { status: 400 });
    }

    try {
      await kirimOtp(nomor, "daftar");
    } catch (e) {
      if (e instanceof FonnteBelumDiaturError) {
        throw Object.assign(new Error(e.message), { status: 503 });
      }
      throw e;
    }
    return { sukses: true };
  });
}
