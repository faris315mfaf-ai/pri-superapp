// POST /api/daftar — langkah 1 pendaftaran: USERNAME, sandi, nomor WA.
//
// Email tidak diminta lagi. Kolom email diisi alamat sintetis
// <username>@pri.internal — kolomnya wajib unik & dipakai penanda
// pemilik perangkat push, jadi tetap diisi walau tak pernah dikirimi
// surat. Login memakai username atau nomor WhatsApp.
//
// Akun dibuat dengan status 'menunggu' dan wa_terverifikasi=false, lalu
// kode OTP dikirim ke nomornya. Akun belum bisa dipakai masuk sampai
// (a) OTP terverifikasi, dan (b) super admin menyetujui.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { hapusCacheUser } from "@/lib/cache-sesi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { buatHashSandi } from "@/lib/sandi";
import { normalkanNomorWa, nomorWaSah, FonnteBelumDiaturError } from "@/lib/fonnte";
import { kirimOtp } from "@/lib/otp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Rate limit SEBELUM query database: 5 pendaftaran / jam / IP.
  const tolak = await pastikanTidakMelebihiBatas(request, "daftar", 5, 60 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
      nomor_wa?: string;
      nama?: string;
    };

    const username = (body.username ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const nomor = normalkanNomorWa(body.nomor_wa ?? "");
    const nama = (body.nama ?? "").trim();

    if (!/^[a-z0-9._]{3,20}$/.test(username)) {
      throw Object.assign(
        new Error("Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah."),
        { status: 400 },
      );
    }
    const email = `${username}@pri.internal`;
    if (password.length < 8) {
      throw Object.assign(new Error("Kata sandi minimal 8 karakter."), { status: 400 });
    }
    if (!nomorWaSah(nomor)) {
      throw Object.assign(
        new Error("Nomor WhatsApp tidak benar. Contoh: 0812xxxxxxx"),
        { status: 400 },
      );
    }

    const db = supabase();

    // Tolak duplikat lebih dulu supaya pesannya jelas, bukan sekadar
    // error unique constraint dari database.
    const { data: bentrok } = await db
      .from("app_user")
      .select("id, email, username, nomor_wa, status, wa_terverifikasi")
      .or(`email.eq.${email},username.eq.${username},nomor_wa.eq.${nomor}`)
      .limit(1)
      .maybeSingle();

    if (bentrok) {
      // Pendaftaran yang belum sempat verifikasi boleh diulang —
      // kalau tidak, orang yang kehilangan kode akan terkunci selamanya.
      const belumSelesai = !bentrok.wa_terverifikasi && bentrok.status === "menunggu";
      if (!belumSelesai) {
        throw Object.assign(
          new Error(
            bentrok.nomor_wa === nomor
              ? "Nomor WhatsApp ini sudah terdaftar. Silakan masuk."
              : "Username ini sudah dipakai. Pilih yang lain.",
          ),
          { status: 409 },
        );
      }
      // Baris app_user berubah → buang cache sesinya supaya perubahan
      // (termasuk pencabutan akses) berlaku seketika, bukan menunggu TTL.
      await hapusCacheUser(bentrok.id);
      await db
        .from("app_user")
        .update({
          email,
          username,
          nomor_wa: nomor,
          password_hash: await buatHashSandi(password),
          nama: nama || username,
        })
        .eq("id", bentrok.id);
    } else {
      const { error } = await db.from("app_user").insert({
        email,
        username,
        nomor_wa: nomor,
        nama: nama || username,
        password_hash: await buatHashSandi(password),
        // Peran sementara terendah; super admin yang menentukan
        // peran sebenarnya (Ketua/Anggota) saat menyetujui.
        role: "anggota",
        jabatan: "",
        avatar_url: "",
        status: "menunggu",
        profil_lengkap: false,
        wa_terverifikasi: false,
        aktif: true,
      });
      if (error) {
        console.error("[daftar] gagal insert:", error.message);
        throw new Error("Gagal membuat akun. Coba lagi sebentar.");
      }
    }

    try {
      await kirimOtp(nomor, "daftar");
    } catch (e) {
      if (e instanceof FonnteBelumDiaturError) {
        throw Object.assign(new Error(e.message), { status: 503 });
      }
      throw e;
    }

    return { sukses: true, nomor_wa: nomor };
  });
}
