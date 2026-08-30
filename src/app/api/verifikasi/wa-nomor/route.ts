// SET + verifikasi nomor WhatsApp BARU untuk akun yang BELUM punya nomor
// (fitur 1.22.x/1). Berbeda dari /api/otp/ulang yang sengaja hanya bisa
// mengirim ke nomor TERDAFTAR (anti-bajak): endpoint ini menerima nomor
// yang diketik pengguna, TAPI hanya bila akunnya memang belum punya nomor.
//
// PUT  { nomor }        → kirim OTP ke nomor yang diketik
// POST { nomor, kode }  → cocokkan; sukses = set nomor_wa + wa_terverifikasi
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import {
  hapusCacheUser,
  userDariToken,
  keUserPublik,
  KOLOM_USER,
  type BarisUser,
} from "@/lib/sesi";
import { FonnteBelumDiaturError, normalkanNomorWa, nomorWaSah } from "@/lib/fonnte";
import { kirimOtp, verifikasiOtp } from "@/lib/otp";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanBelumPunyaNomor(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  // Yang SUDAH punya nomor memakai /api/otp/ulang (tak boleh ganti nomor
  // sembarangan lewat sini) — inilah yang menjaga sifat anti-bajak.
  if (user.nomor_wa) {
    throw Object.assign(
      new Error("Akun Anda sudah punya nomor WhatsApp. Gunakan tombol Verifikasi biasa."),
      { status: 409 },
    );
  }
  return user;
}

/** Tolak bila nomor sudah dipakai akun AKTIF lain (indeks unik menjaga di DB). */
async function pastikanNomorBelumDipakai(
  db: ReturnType<typeof supabase>,
  nomor: string,
  kecualiUserId: number,
): Promise<void> {
  const { data } = await db
    .from("app_user")
    .select("id")
    .eq("nomor_wa", nomor)
    .neq("id", kecualiUserId)
    .maybeSingle();
  if (data) {
    throw Object.assign(new Error("Nomor WhatsApp ini sudah dipakai akun lain."), {
      status: 409,
    });
  }
}

export async function PUT(request: Request) {
  return bungkus(async () => {
    const user = await pastikanBelumPunyaNomor(request);
    const body = (await request.json().catch(() => ({}))) as { nomor?: string };
    const nomor = normalkanNomorWa(body.nomor ?? "");
    if (!nomorWaSah(nomor)) {
      throw Object.assign(new Error("Nomor WhatsApp tidak sah. Contoh: 08123456789."), {
        status: 400,
      });
    }
    await pastikanNomorBelumDipakai(supabase(), nomor, Number(user.id));
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

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanBelumPunyaNomor(request);
    const body = (await request.json().catch(() => ({}))) as { nomor?: string; kode?: string };
    const nomor = normalkanNomorWa(body.nomor ?? "");
    if (!nomorWaSah(nomor)) {
      throw Object.assign(new Error("Nomor WhatsApp tidak sah."), { status: 400 });
    }

    const db = supabase();
    await pastikanNomorBelumDipakai(db, nomor, Number(user.id));

    const hasil = await verifikasiOtp(nomor, body.kode ?? "");
    if (!hasil.sah) {
      throw Object.assign(new Error(hasil.pesan), { status: hasil.status ?? 400 });
    }

    // Kode benar → tautkan nomor ke akun sekaligus tandai terverifikasi.
    const { error } = await db
      .from("app_user")
      .update({ nomor_wa: nomor, wa_terverifikasi: true })
      .eq("id", Number(user.id));
    await hapusCacheUser(user.id);
    if (error) {
      // Indeks unik nomor_wa: nomor direbut akun lain persis di sela proses.
      if ((error as { code?: string }).code === "23505") {
        throw Object.assign(new Error("Nomor WhatsApp ini sudah dipakai akun lain."), {
          status: 409,
        });
      }
      throw new Error("Gagal menyimpan nomor WhatsApp.");
    }

    const { data: segar } = await db
      .from("app_user")
      .select(KOLOM_USER)
      .eq("id", Number(user.id))
      .maybeSingle();
    return { sukses: true, user: keUserPublik(segar as BarisUser) };
  });
}
