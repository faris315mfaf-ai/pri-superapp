// PUT  /api/sandi — minta kode OTP untuk mengganti kata sandi
// POST /api/sandi — ganti kata sandi dengan kode tersebut
//
// Dua penjaga yang disengaja:
//  1. Kode dikirim ke nomor WhatsApp yang TERDAFTAR pada akun, bukan ke
//     nomor yang diketik. Kalau tidak, siapa pun yang sempat memegang
//     ponsel yang masih masuk bisa memindahkan akun ke nomornya sendiri.
//  2. Ganti sandi dibatasi 1x per minggu — membatasi kerusakan bila
//     sebuah sesi dicuri, dan mencegah nomor dibanjiri kode.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { buatHashSandi } from "@/lib/sandi";
import { normalkanNomorWa, FonnteBelumDiaturError } from "@/lib/fonnte";
import { kirimOtp, verifikasiOtp } from "@/lib/otp";
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

    const body = (await request.json().catch(() => ({}))) as { nomor_wa?: string };
    const diketik = normalkanNomorWa(body.nomor_wa ?? "");

    if (!user.nomor_wa) {
      throw Object.assign(
        new Error(
          "Akun ini belum punya nomor WhatsApp terdaftar. Hubungi pengurus untuk mengaturnya.",
        ),
        { status: 400 },
      );
    }

    // Nomor yang diketik harus COCOK dengan yang terdaftar. Kodenya
    // tetap dikirim ke nomor terdaftar, apa pun yang diketik.
    if (diketik !== normalkanNomorWa(user.nomor_wa)) {
      throw Object.assign(
        new Error("Nomor tidak cocok dengan yang terdaftar pada akun ini."),
        { status: 403 },
      );
    }

    try {
      await kirimOtp(user.nomor_wa, "ganti_sandi");
    } catch (e) {
      if (e instanceof FonnteBelumDiaturError) {
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
      nomor_wa?: string;
      kode?: string;
      sandi_baru?: string;
    };

    const sandiBaru = body.sandi_baru ?? "";
    if (sandiBaru.length < 8) {
      throw Object.assign(new Error("Kata sandi baru minimal 8 karakter."), {
        status: 400,
      });
    }
    if (!user.nomor_wa) {
      throw Object.assign(new Error("Akun ini belum punya nomor WhatsApp."), {
        status: 400,
      });
    }

    const hasil = await verifikasiOtp(user.nomor_wa, body.kode ?? "");
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
    // Baris app_user berubah → buang cache sesinya supaya perubahan
    // (termasuk pencabutan akses) berlaku seketika, bukan menunggu TTL.
    await hapusCacheUser(user.id);

    // Sandi berganti = semua perangkat lain harus keluar. Kalau tidak,
    // perangkat yang mungkin sudah disusupi tetap memegang akses meski
    // sandinya sudah diganti.
    await cabutSemuaSesi(Number(user.id));

    return { sukses: true };
  });
}
