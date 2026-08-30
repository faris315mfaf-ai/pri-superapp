// PUT  /api/sandi — minta kode OTP EMAIL untuk mengganti kata sandi
// POST /api/sandi — ganti kata sandi dengan kode tersebut
//
// Dua penjaga yang disengaja:
//  1. Kode dikirim ke EMAIL yang TERDAFTAR pada akun (bukan alamat yang
//     diketik). Pemegang sesi yang dicuri pun tak bisa mengalihkan kode
//     ke email miliknya.
//  2. Ganti sandi dibatasi 1x per minggu — membatasi kerusakan bila sebuah
//     sesi dicuri, dan mencegah email dibanjiri kode.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { buatHashSandi } from "@/lib/sandi";
import { kirimOtpEmail, verifikasiOtpEmail, emailSah, normalkanEmail } from "@/lib/otp-email";
import { EmailBelumDiaturError } from "@/lib/email";
import { hapusCacheUser, cabutSemuaSesi, userDariToken } from "@/lib/sesi";

export const dynamic = "force-dynamic";

/** Jarak minimum antar penggantian sandi */
const JEDA_HARI = 7;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Ambil email terdaftar akun; melempar bila belum punya email yang sah. */
async function emailAkun(userId: number): Promise<string> {
  const { data } = await supabase()
    .from("app_user")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  const email = normalkanEmail(data?.email ?? "");
  if (!emailSah(email)) {
    throw Object.assign(
      new Error(
        "Akun ini belum punya email yang bisa diverifikasi. Hubungi pengurus untuk menambah email.",
      ),
      { status: 400 },
    );
  }
  return email;
}

/** Melempar bila sandi baru diganti kurang dari JEDA_HARI yang lalu */
async function pastikanBolehGanti(userId: number) {
  const { data } = await supabase()
    .from("app_user")
    .select("sandi_diubah_pada")
    .eq("id", userId)
    .maybeSingle();

  const terakhir = data?.sandi_diubah_pada;
  if (!terakhir) return;

  const selisihHari = (Date.now() - new Date(terakhir).getTime()) / 86_400_000;
  if (selisihHari < JEDA_HARI) {
    const sisa = Math.ceil(JEDA_HARI - selisihHari);
    throw Object.assign(
      new Error(
        `Kata sandi baru bisa diganti lagi dalam ${sisa} hari. Batas ini menjaga akun dari perubahan beruntun.`,
      ),
      { status: 429 },
    );
  }
}

export async function PUT(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    await pastikanBolehGanti(Number(user.id));
    const email = await emailAkun(Number(user.id));

    try {
      await kirimOtpEmail(email, "ganti_sandi");
    } catch (e) {
      if (e instanceof EmailBelumDiaturError) {
        throw Object.assign(new Error(e.message), { status: 503 });
      }
      throw e;
    }

    return { sukses: true };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    await pastikanBolehGanti(Number(user.id));

    const body = (await request.json().catch(() => ({}))) as {
      kode?: string;
      sandi_baru?: string;
    };

    const sandiBaru = body.sandi_baru ?? "";
    if (sandiBaru.length < 8) {
      throw Object.assign(new Error("Kata sandi baru minimal 8 karakter."), { status: 400 });
    }

    const email = await emailAkun(Number(user.id));
    const hasil = await verifikasiOtpEmail(email, body.kode ?? "");
    if (!hasil.sah) {
      throw Object.assign(new Error(hasil.pesan), { status: hasil.status ?? 400 });
    }

    const { error } = await supabase()
      .from("app_user")
      .update({
        password_hash: await buatHashSandi(sandiBaru),
        sandi_diubah_pada: new Date().toISOString(),
      })
      .eq("id", Number(user.id));

    if (error) {
      console.error("[sandi] ganti:", error.message);
      throw new Error("Gagal menyimpan kata sandi baru.");
    }
    await hapusCacheUser(user.id);

    // Sandi berganti = semua perangkat lain harus keluar.
    await cabutSemuaSesi(Number(user.id));

    return { sukses: true };
  });
}
