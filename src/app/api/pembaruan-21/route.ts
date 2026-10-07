// =====================================================================
// /api/pembaruan-21 — alur wajib PEMBARUAN 2.1 (7 Okt 2026, lib/rilis).
//
//   PUT  { nomor }                               → siapkan OTP arah masuk
//   POST { aksi:"wa", nomor, kode }              → nomor terverifikasi
//   POST { aksi:"profil", nama, username, email? } → data diri dikonfirmasi
//                                                    (verifikasi_21_pada)
//   POST { aksi:"selesai" }                      → tutorial selesai
//                                                    (tutorial_21_pada)
//
// Verifikasi ARAH MASUK (sql/64): pengguna mengirim kode DARI nomornya ke
// gateway — itu bukti kepemilikan, jadi di sini nomor lama boleh
// dikonfirmasi ATAU diganti (beda dengan /api/verifikasi/wa-nomor yang
// hanya untuk akun tanpa nomor). Satu nomor tetap hanya untuk satu akun.
// Username boleh diganti tanpa mengetik sandi: pemiliknya baru saja
// membuktikan nomor WhatsApp-nya pada alur yang sama.
// =====================================================================
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { hapusCacheUser, keUserPublik, kolomUser, pastikanMasuk, type BarisUser } from "@/lib/sesi";
import { normalkanNomorWa, nomorWaSah } from "@/lib/fonnte";
import { otpMasukSiap, siapkanOtpMasuk, verifikasiOtp } from "@/lib/otp";
import { periksaUsername } from "@/lib/username";
import { emailSah } from "@/lib/otp-email";
import { bebasPembaruan21, rilis21Untuk } from "@/lib/rilis";

export const dynamic = "force-dynamic";

function galat(pesan: string, status: number): never {
  throw Object.assign(new Error(pesan), { status });
}

async function penggunaPembaruan(request: Request) {
  const user = await pastikanMasuk(request);
  if (bebasPembaruan21(user)) galat("Akun ini tidak memerlukan pembaruan 2.1.", 400);
  if (!rilis21Untuk(user, Date.now())) galat("Pembaruan 2.1 belum dirilis untuk akun ini.", 400);
  return user;
}

async function nomorBebas(nomor: string, kecuali: number): Promise<void> {
  const { data } = await supabase().from("app_user").select("id").eq("nomor_wa", nomor).neq("id", kecuali).maybeSingle();
  if (data) galat("Nomor WhatsApp ini sudah dipakai akun lain.", 409);
}

/**
 * Pembeda batas laju = id akun: pengguna HP satu operator sering berbagi
 * IP (CGNAT) — saat rilis ratusan orang verifikasi bersamaan, batas per IP
 * saja akan saling memblokir.
 */
async function idPembeda(request: Request): Promise<string> {
  try {
    return String((await pastikanMasuk(request)).id);
  } catch {
    return "";
  }
}

async function userSegar(id: number) {
  await hapusCacheUser(String(id));
  const { data } = await supabase().from("app_user").select(await kolomUser()).eq("id", id).maybeSingle();
  return keUserPublik(data as unknown as BarisUser);
}

export async function PUT(request: Request) {
  const tolak = await pastikanTidakMelebihiBatas(request, "pembaruan21-wa", 5, 15 * 60, await idPembeda(request));
  if (tolak) return tolak;
  return bungkus(async () => {
    const user = await penggunaPembaruan(request);
    const body = (await request.json().catch(() => ({}))) as { nomor?: string };
    const nomor = normalkanNomorWa(body.nomor ?? "");
    if (!nomorWaSah(nomor)) galat("Nomor WhatsApp tidak sah. Contoh: 08123456789.", 400);
    await nomorBebas(nomor, Number(user.id));
    if (!otpMasukSiap()) galat("Verifikasi WhatsApp sedang tidak tersedia. Coba lagi beberapa saat.", 503);
    return { wa: await siapkanOtpMasuk(nomor, "daftar") };
  });
}

export async function POST(request: Request) {
  const tolak = await pastikanTidakMelebihiBatas(request, "pembaruan21", 30, 15 * 60, await idPembeda(request));
  if (tolak) return tolak;
  return bungkus(async () => {
    const user = await penggunaPembaruan(request);
    const uid = Number(user.id);
    const db = supabase();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const aksi = String(body.aksi ?? "");

    if (aksi === "wa") {
      const nomor = normalkanNomorWa(String(body.nomor ?? ""));
      if (!nomorWaSah(nomor)) galat("Nomor WhatsApp tidak sah.", 400);
      await nomorBebas(nomor, uid);
      const hasil = await verifikasiOtp(nomor, String(body.kode ?? ""));
      if (!hasil.sah) galat(hasil.pesan, hasil.status ?? 400);
      const { error } = await db.from("app_user").update({ nomor_wa: nomor, wa_terverifikasi: true }).eq("id", uid);
      if (error) {
        if ((error as { code?: string }).code === "23505") galat("Nomor WhatsApp ini sudah dipakai akun lain.", 409);
        throw new Error("Gagal menyimpan nomor WhatsApp.");
      }
      return { user: await userSegar(uid) };
    }

    if (aksi === "profil") {
      const { data: kini } = await db.from("app_user").select("wa_terverifikasi, nomor_wa, username, email").eq("id", uid).maybeSingle();
      if (!kini?.wa_terverifikasi || !kini.nomor_wa) galat("Verifikasi nomor WhatsApp dulu.", 400);
      const nama = String(body.nama ?? "").replace(/\s+/g, " ").trim();
      if (nama.length < 3 || nama.length > 80) galat("Nama lengkap 3–80 huruf.", 400);
      const un = periksaUsername(String(body.username ?? ""));
      if (!un.sah) galat(un.pesan, 400);
      const emailMasuk = String(body.email ?? "").trim().toLowerCase();
      if (emailMasuk && !emailSah(emailMasuk)) galat("Alamat email tidak sah.", 400);

      const ubah: Record<string, unknown> = { nama, verifikasi_21_pada: new Date().toISOString() };
      if (un.bersih !== String(kini.username ?? "").toLowerCase()) {
        const { data: dipakai } = await db.from("app_user").select("id").ilike("username", un.bersih).neq("id", uid).maybeSingle();
        if (dipakai) galat("Username ini sudah dipakai. Pilih yang lain.", 409);
        ubah.username = un.bersih;
      }
      // Email opsional: kosong = biarkan yang lama.
      if (emailMasuk && emailMasuk !== String(kini.email ?? "").toLowerCase()) {
        const { data: dipakai } = await db.from("app_user").select("id").eq("email", emailMasuk).neq("id", uid).maybeSingle();
        if (dipakai) galat("Email ini sudah dipakai akun lain.", 409);
        ubah.email = emailMasuk;
      }
      const { error } = await db.from("app_user").update(ubah).eq("id", uid);
      if (error) {
        if ((error as { code?: string }).code === "23505") galat("Username atau email sudah dipakai akun lain.", 409);
        console.error("[pembaruan-21] profil:", error.message);
        throw new Error("Gagal menyimpan data diri.");
      }
      if (ubah.username) {
        // Hitung sebagai penggantian username (jeda 30 hari, sql/55); abaikan bila kolomnya belum ada.
        await db.from("app_user").update({ username_diubah_pada: new Date().toISOString() }).eq("id", uid).then(() => undefined, () => undefined);
      }
      return { user: await userSegar(uid) };
    }

    if (aksi === "selesai") {
      const { data: kini } = await db.from("app_user").select("verifikasi_21_pada").eq("id", uid).maybeSingle();
      if (!kini?.verifikasi_21_pada) galat("Selesaikan verifikasi akun dulu.", 400);
      const { error } = await db.from("app_user").update({ tutorial_21_pada: new Date().toISOString() }).eq("id", uid);
      if (error) throw new Error("Gagal menyimpan. Coba lagi.");
      return { user: await userSegar(uid) };
    }

    galat("Aksi tidak dikenal.", 400);
  });
}
