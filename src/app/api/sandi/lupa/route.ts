// LUPA KATA SANDI — tanpa perlu masuk.
//
// PUT  /api/sandi/lupa  {identitas}                     → kirim kode OTP / {wa} arah masuk
// POST /api/sandi/lupa  {identitas, kode, sandi_baru}   → setel sandi baru
//
// Bukti kepemilikan = memegang WHATSAPP atau EMAIL yang TERDAFTAR pada
// akun: kode selalu dikirim ke kontak terdaftar, tidak pernah ke nomor/
// alamat yang diketik penyerang. Jawaban PUT sengaja sama untuk akun yang
// ada maupun tidak, supaya endpoint ini tak bisa dipakai menebak username.
//
// SALURAN (7 Okt 2026, gateway WhatsApp sendiri — lib/gowa): WhatsApp
// terverifikasi → email sah → WhatsApp tersimpan (belum terverifikasi;
// satu-satunya jalan bagi akun tanpa email). Pemilihan saluran
// deterministik dari data akun, jadi PUT & POST selalu sepakat.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { buatHashSandi } from "@/lib/sandi";
import { normalkanNomorWa } from "@/lib/fonnte";
import { kirimOtpEmail, verifikasiOtpEmail, emailSah } from "@/lib/otp-email";
import { kirimOtp, otpMasukSiap, otpMasukTiruan, siapkanOtpMasuk, verifikasiOtp, type OtpMasuk } from "@/lib/otp";
import { FonnteBelumDiaturError, nomorWaSah } from "@/lib/fonnte";
import { EmailBelumDiaturError } from "@/lib/email";
import { hapusCacheUser, cabutSemuaSesi } from "@/lib/sesi";

export const dynamic = "force-dynamic";

type BarisAkun = {
  id: number;
  email: string | null;
  nomor_wa: string | null;
  wa_terverifikasi: boolean | null;
  status: string;
  aktif: boolean;
};

type Saluran = { jenis: "wa"; nomor: string } | { jenis: "email"; email: string };

/** Ke mana kode reset dikirim (null = akun tak bisa reset sendiri). */
function pilihSaluran(akun: BarisAkun): Saluran | null {
  const nomor = akun.nomor_wa ? normalkanNomorWa(akun.nomor_wa) : "";
  const waAda = nomorWaSah(nomor) && waTersedia();
  if (waAda && akun.wa_terverifikasi) return { jenis: "wa", nomor };
  if (akun.email && emailSah(akun.email)) return { jenis: "email", email: akun.email };
  if (waAda) return { jenis: "wa", nomor };
  return null;
}

/** Ada pengirim WhatsApp yang diatur (gateway sendiri / Convia / Fonnte). */
function waTersedia(): boolean {
  return Boolean(process.env.GOWA_URL || process.env.FONNTE_TOKEN || process.env.CONVIA_API_KEY);
}

/** Cari akun dari username / nomor WA / email yang diketik. */
async function cariAkun(identitasMentah: string): Promise<BarisAkun | null> {
  const identitas = (identitasMentah ?? "").trim().toLowerCase();
  if (!identitas) return null;
  // Nilai ini dirangkai ke filter `.or(...)` PostgREST. Koma, kurung, dan
  // kutip memecah sintaks filter → bisa menyisipkan kondisi tambahan
  // (mis. "x,status.eq.aktif"). Username/email/nomor WA yang sah tidak
  // pernah memuat karakter itu, jadi tolak (jawaban tetap netral di PUT).
  if (/[,()"\s]/.test(identitas) || identitas.length > 120) return null;

  const db = supabase();
  const sebagaiNomor = normalkanNomorWa(identitas);
  const { data } = await db
    .from("app_user")
    .select("id, email, nomor_wa, wa_terverifikasi, status, aktif")
    .or(`username.eq.${identitas},email.eq.${identitas},nomor_wa.eq.${sebagaiNomor || "-"}`)
    .limit(1)
    .maybeSingle();
  return (data as BarisAkun) ?? null;
}

/** Akun boleh menerima OTP reset: aktif, tidak ditolak, punya WA/email. */
function bolehReset(akun: BarisAkun | null): akun is BarisAkun {
  return Boolean(akun && akun.aktif && akun.status !== "ditolak" && pilihSaluran(akun));
}

const PESAN_NETRAL =
  "Bila akunnya terdaftar: verifikasi lewat WhatsApp dari nomor terdaftar, atau masukkan kode yang dikirim ke email akun itu.";

export async function PUT(request: Request) {
  // Rate limit SEBELUM query database: 3 permintaan kode / jam / IP.
  const tolak = await pastikanTidakMelebihiBatas(request, "sandi-lupa", 3, 60 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as { identitas?: string };
    const akun = await cariAkun(body.identitas ?? "");

    // Arah masuk (sql/64): untuk saluran WA, kode + tautan wa.me DITAMPILKAN
    // dan pengguna mengirimnya dari nomor terdaftar. Supaya netral, SETIAP
    // jawaban memuat {wa} — tiruan bila akun tak ada / bersaluran email
    // (tiruan tak pernah terkonfirmasi).
    let wa: OtpMasuk | null = otpMasukSiap() ? otpMasukTiruan("ganti_sandi") : null;

    // Akun tidak ada / tanpa email sah / diblokir → jawaban tetap netral.
    if (bolehReset(akun)) {
      const saluran = pilihSaluran(akun)!;
      try {
        if (saluran.jenis === "wa" && otpMasukSiap()) wa = await siapkanOtpMasuk(saluran.nomor, "ganti_sandi");
        else if (saluran.jenis === "wa") await kirimOtp(saluran.nomor, "ganti_sandi");
        else await kirimOtpEmail(saluran.email, "ganti_sandi");
      } catch (e) {
        if (e instanceof EmailBelumDiaturError || e instanceof FonnteBelumDiaturError) {
          throw Object.assign(new Error(e.message), { status: 503 });
        }
        // Jeda 60 detik antar kiriman perlu disampaikan apa adanya.
        throw e;
      }
    }

    return { sukses: true, pesan: PESAN_NETRAL, ...(wa ? { wa } : {}) };
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
      throw Object.assign(new Error("Akun tidak ditemukan atau tak punya WhatsApp/email."), {
        status: 404,
      });
    }

    const saluran = pilihSaluran(akun)!;
    const hasil =
      saluran.jenis === "wa"
        ? await verifikasiOtp(saluran.nomor, body.kode ?? "", "ganti_sandi")
        : await verifikasiOtpEmail(saluran.email, body.kode ?? "");
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
