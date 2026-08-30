// LUPA KATA SANDI — tanpa perlu masuk.
//
// PUT  /api/sandi/lupa  {identitas}                     → kirim kode OTP EMAIL
// POST /api/sandi/lupa  {identitas, kode, sandi_baru}   → setel sandi baru
//
// Bukti kepemilikan = memegang EMAIL yang TERDAFTAR pada akun: kode
// selalu dikirim ke email terdaftar, tidak pernah ke alamat yang diketik
// penyerang. Jawaban PUT sengaja sama untuk akun yang ada maupun tidak,
// supaya endpoint ini tak bisa dipakai menebak username yang terdaftar.
//
// CATATAN: pengguna LAMA yang emailnya masih sintetis (<username>@pri.internal)
// tak bisa reset lewat email — mereka minta reset ke pengurus. Ini
// konsekuensi disengaja dari mematikan OTP WhatsApp.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { buatHashSandi } from "@/lib/sandi";
import { normalkanNomorWa } from "@/lib/fonnte";
import { kirimOtpEmail, verifikasiOtpEmail, emailSah } from "@/lib/otp-email";
import { EmailBelumDiaturError } from "@/lib/email";
import { hapusCacheUser, cabutSemuaSesi } from "@/lib/sesi";

export const dynamic = "force-dynamic";

type BarisAkun = {
  id: number;
  email: string | null;
  status: string;
  aktif: boolean;
};

/** Cari akun dari username / nomor WA / email yang diketik. */
async function cariAkun(identitasMentah: string): Promise<BarisAkun | null> {
  const identitas = (identitasMentah ?? "").trim().toLowerCase();
  if (!identitas) return null;

  const db = supabase();
  const sebagaiNomor = normalkanNomorWa(identitas);
  const { data } = await db
    .from("app_user")
    .select("id, email, status, aktif")
    .or(`username.eq.${identitas},email.eq.${identitas},nomor_wa.eq.${sebagaiNomor || "-"}`)
    .limit(1)
    .maybeSingle();
  return (data as BarisAkun) ?? null;
}

/** Akun boleh menerima OTP reset: aktif, tidak ditolak, punya email SAH. */
function bolehReset(akun: BarisAkun | null): akun is BarisAkun {
  return Boolean(
    akun && akun.aktif && akun.status !== "ditolak" && akun.email && emailSah(akun.email),
  );
}

const PESAN_NETRAL =
  "Bila akunnya terdaftar, kode sudah dikirim ke email yang terpasang pada akun itu.";

export async function PUT(request: Request) {
  // Rate limit SEBELUM query database: 3 permintaan kode / jam / IP.
  const tolak = await pastikanTidakMelebihiBatas(request, "sandi-lupa", 3, 60 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as { identitas?: string };
    const akun = await cariAkun(body.identitas ?? "");

    // Akun tidak ada / tanpa email sah / diblokir → jawaban tetap netral.
    if (bolehReset(akun)) {
      try {
        await kirimOtpEmail(akun.email!, "ganti_sandi");
      } catch (e) {
        if (e instanceof EmailBelumDiaturError) {
          throw Object.assign(new Error(e.message), { status: 503 });
        }
        // Jeda 60 detik antar kiriman perlu disampaikan apa adanya.
        throw e;
      }
    }

    return { sukses: true, pesan: PESAN_NETRAL };
  });
}

export async function POST(request: Request) {
  const tolak = await pastikanTidakMelebihiBatas(request, "sandi-lupa-setel", 3, 60 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      identitas?: string;
      kode?: string;
      sandi_baru?: string;
    };

    const sandiBaru = body.sandi_baru ?? "";
    if (sandiBaru.length < 8) {
      throw Object.assign(new Error("Kata sandi baru minimal 8 karakter."), { status: 400 });
    }

    const akun = await cariAkun(body.identitas ?? "");
    if (!bolehReset(akun)) {
      // Di tahap POST orang sudah memegang kode; pesan boleh terus terang.
      throw Object.assign(new Error("Akun tidak ditemukan atau tak punya email."), {
        status: 404,
      });
    }

    const hasil = await verifikasiOtpEmail(akun.email!, body.kode ?? "");
    if (!hasil.sah) {
      throw Object.assign(new Error(hasil.pesan), { status: hasil.status ?? 400 });
    }

    const { error } = await supabase()
      .from("app_user")
      .update({
        password_hash: await buatHashSandi(sandiBaru),
        sandi_diubah_pada: new Date().toISOString(),
      })
      .eq("id", akun.id);
    if (error) {
      console.error("[sandi/lupa] simpan:", error.message);
      throw new Error("Gagal menyimpan kata sandi baru.");
    }
    await hapusCacheUser(akun.id);

    // Semua perangkat lama keluar — pemegang sandi baru yang berkuasa.
    await cabutSemuaSesi(akun.id);

    return { sukses: true };
  });
}
