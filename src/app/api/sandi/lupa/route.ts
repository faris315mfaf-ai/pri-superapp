// LUPA KATA SANDI — tanpa perlu masuk.
//
// PUT  /api/sandi/lupa  {identitas}                     → kirim kode OTP
// POST /api/sandi/lupa  {identitas, kode, sandi_baru}   → setel sandi baru
//
// Bukti kepemilikan = memegang WhatsApp yang TERDAFTAR pada akun:
// kode selalu dikirim ke nomor terdaftar, tidak pernah ke nomor yang
// diketik penyerang. Jawaban PUT sengaja sama untuk akun yang ada
// maupun tidak — supaya endpoint ini tidak bisa dipakai menebak
// username siapa saja yang terdaftar.
//
// Batas "ganti sandi 1x/minggu" milik pengguna yang MASIH bisa masuk
// tidak berlaku di sini: orang lupa sandi justru sedang terkunci.
// Penyalahgunaan dicegah lapisan lain: jeda kirim OTP 60 detik,
// kode 6 digit berumur 5 menit, maksimal 5 percobaan.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { buatHashSandi } from "@/lib/sandi";
import { normalkanNomorWa, FonnteBelumDiaturError } from "@/lib/fonnte";
import { kirimOtp, verifikasiOtp } from "@/lib/otp";
import { hapusCacheUser, cabutSemuaSesi } from "@/lib/sesi";

export const dynamic = "force-dynamic";

type BarisAkun = {
  id: number;
  nomor_wa: string | null;
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
    .select("id, nomor_wa, status, aktif")
    .or(
      `username.eq.${identitas},email.eq.${identitas},nomor_wa.eq.${sebagaiNomor || "-"}`,
    )
    .limit(1)
    .maybeSingle();
  return (data as BarisAkun) ?? null;
}

const PESAN_NETRAL =
  "Bila akunnya terdaftar, kode sudah dikirim ke WhatsApp yang terpasang pada akun itu.";

export async function PUT(request: Request) {
  // Rate limit SEBELUM query database: 3 permintaan kode / jam / IP.
  const tolak = await pastikanTidakMelebihiBatas(request, "sandi-lupa", 3, 60 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as { identitas?: string };
    const akun = await cariAkun(body.identitas ?? "");

    // Akun tidak ada / tanpa nomor / diblokir → jawaban tetap netral.
    if (akun && akun.aktif && akun.status !== "ditolak" && akun.nomor_wa) {
      try {
        await kirimOtp(akun.nomor_wa, "ganti_sandi");
      } catch (e) {
        if (e instanceof FonnteBelumDiaturError) {
          throw Object.assign(new Error(e.message), { status: 503 });
        }
        // Jeda 60 detik antar kiriman perlu disampaikan apa adanya —
        // tanpa itu pengguna mengira kodenya hilang dan panik.
        throw e;
      }
    }

    return { sukses: true, pesan: PESAN_NETRAL };
  });
}

export async function POST(request: Request) {
  // Penyetelan sandi ikut jendela yang sama dengan permintaan kodenya.
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
    if (!akun || !akun.aktif || akun.status === "ditolak" || !akun.nomor_wa) {
      // Di tahap POST orang sudah memegang kode; pesan boleh terus terang.
      throw Object.assign(new Error("Akun tidak ditemukan."), { status: 404 });
    }

    const hasil = await verifikasiOtp(akun.nomor_wa, body.kode ?? "");
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
    // Baris app_user berubah → buang cache sesinya supaya perubahan
    // (termasuk pencabutan akses) berlaku seketika, bukan menunggu TTL.
    await hapusCacheUser(akun.id);

    // Semua perangkat lama keluar — pemegang sandi baru yang berkuasa.
    await cabutSemuaSesi(akun.id);

    return { sukses: true };
  });
}
