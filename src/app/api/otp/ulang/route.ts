// VERIFIKASI WHATSAPP untuk akun yang SUDAH masuk (89 anggota lama
// terdaftar sebelum verifikasi diwajibkan — mereka diverifikasi
// belakangan lewat sini, tanpa perlu daftar ulang).
//
// PUT  /api/otp/ulang        → siapkan kode arah masuk (pengguna kirim ke
//                               gateway; {wa}) atau kirim kode ke nomor TERDAFTAR
// POST /api/otp/ulang {kode} → cocokkan kode; sukses = wa_terverifikasi
//
// Kode selalu ke nomor yang tercatat di akun — bukan nomor kiriman
// klien — supaya endpoint ini tidak bisa dipakai membajak akun ke
// nomor lain.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import {
  hapusCacheUser,
  userDariToken,
  keUserPublik,
  kolomUser,
  type BarisUser,
} from "@/lib/sesi";
import { FonnteBelumDiaturError } from "@/lib/fonnte";
import { kirimOtp, otpMasukSiap, siapkanOtpMasuk, verifikasiOtp } from "@/lib/otp";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!user.nomor_wa) {
    throw Object.assign(
      new Error("Akun ini belum punya nomor WhatsApp terdaftar. Hubungi pengurus."),
      { status: 400 },
    );
  }
  return user;
}

export async function PUT(request: Request) {
  // Batas kirim kode (7 Okt 2026, gateway WA sendiri): 3 / 15 mnt / IP.
  const tolak = await pastikanTidakMelebihiBatas(request, "otp-ulang-kirim", 3, 15 * 60);
  if (tolak) return tolak;
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    // Arah masuk (sql/64): pengguna yang mengirim kode ke nomor gateway —
    // gateway tak bisa memulai chat ke nomor asing (WhatsApp error 463).
    if (otpMasukSiap()) {
      return { sukses: true, wa: await siapkanOtpMasuk(user.nomor_wa!, "daftar") };
    }
    try {
      await kirimOtp(user.nomor_wa!, "daftar");
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
  const tolak = await pastikanTidakMelebihiBatas(request, "otp-ulang-verifikasi", 8, 15 * 60);
  if (tolak) return tolak;
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as { kode?: string };

    const hasil = await verifikasiOtp(user.nomor_wa!, body.kode ?? "");
    if (!hasil.sah) {
      throw Object.assign(new Error(hasil.pesan), { status: hasil.status ?? 400 });
    }

    const db = supabase();
    const { error } = await db
      .from("app_user")
      .update({ wa_terverifikasi: true })
      .eq("id", Number(user.id));
    // Baris app_user berubah → buang cache sesinya supaya perubahan
    // (termasuk pencabutan akses) berlaku seketika, bukan menunggu TTL.
    await hapusCacheUser(user.id);
    if (error) throw new Error("Gagal menyimpan status verifikasi.");

    const { data: segar } = await db
      .from("app_user")
      .select(await kolomUser())
      .eq("id", Number(user.id))
      .maybeSingle();

    return { sukses: true, user: keUserPublik(segar as unknown as BarisUser) };
  });
}
