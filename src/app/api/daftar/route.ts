// POST /api/daftar — langkah 1 pendaftaran: NAMA (KTP), USERNAME, sandi,
// EMAIL (wajib), nomor WA (OPSIONAL, hanya database — tak dikirimi OTP).
//
// OTP kini dikirim ke EMAIL (bukan WhatsApp). Akun dibuat berstatus
// 'menunggu' dengan email_verified_at kosong, lalu kode OTP dikirim ke
// emailnya. Akun belum bisa dipakai masuk sampai (a) OTP email
// terverifikasi, dan (b) super admin menyetujui.
//
// Nomor WA sekarang hanya kolom data (untuk basis data & sebagai
// identitas login alternatif bagi pengguna lama) — TIDAK ada OTP ke WA.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { hapusCacheUser } from "@/lib/cache-sesi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { buatHashSandi } from "@/lib/sandi";
import { normalkanNomorWa, nomorWaSah } from "@/lib/fonnte";
import { kirimOtpEmail, emailSah, normalkanEmail } from "@/lib/otp-email";
import { EmailBelumDiaturError } from "@/lib/email";
import { kirimKabar } from "@/lib/notifikasi";

export const dynamic = "force-dynamic";

/**
 * BYPASS persetujuan (fitur "daftar tanpa persetujuan"): bila sakelar
 * `daftar_auto_aktif` menyala (diatur master), pendaftar baru langsung
 * berstatus 'aktif' tanpa menunggu persetujuan pengurus. Default mati.
 */
async function daftarAutoAktif(db: ReturnType<typeof supabase>): Promise<boolean> {
  const { data } = await db
    .from("pengaturan_sistem")
    .select("nilai")
    .eq("kunci", "daftar_auto_aktif")
    .maybeSingle();
  return data?.nilai === "true";
}

export async function POST(request: Request) {
  // Rate limit SEBELUM query database: 5 pendaftaran / jam / IP.
  const tolak = await pastikanTidakMelebihiBatas(request, "daftar", 5, 60 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
      email?: string;
      nomor_wa?: string;
      nama?: string;
    };

    const username = (body.username ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const email = normalkanEmail(body.email ?? "");
    const nama = (body.nama ?? "").trim();
    // Nomor WA OPSIONAL: dinormalkan hanya bila diisi.
    const nomorMentah = (body.nomor_wa ?? "").trim();
    const nomor = nomorMentah ? normalkanNomorWa(nomorMentah) : "";

    // --- Validasi: 4 kolom WAJIB (nama, username, sandi, email) ---
    if (nama.length < 2) {
      throw Object.assign(new Error("Nama (sesuai KTP) wajib diisi."), { status: 400 });
    }
    if (!/^[a-z0-9._]{3,20}$/.test(username)) {
      throw Object.assign(
        new Error("Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah."),
        { status: 400 },
      );
    }
    if (password.length < 8) {
      throw Object.assign(new Error("Kata sandi minimal 8 karakter."), { status: 400 });
    }
    if (!emailSah(email)) {
      throw Object.assign(
        new Error("Email tidak benar. Pastikan alamat email Anda ditulis dengan benar."),
        { status: 400 },
      );
    }
    // Nomor WA hanya divalidasi bila diisi (opsional).
    if (nomor && !nomorWaSah(nomor)) {
      throw Object.assign(
        new Error("Nomor WhatsApp tidak benar. Kosongkan bila tidak ingin mengisi."),
        { status: 400 },
      );
    }

    const db = supabase();
    // Bypass persetujuan: status awal 'aktif' bila sakelar menyala.
    const autoAktif = await daftarAutoAktif(db);
    const statusAwal = autoAktif ? "aktif" : "menunggu";

    // Tolak duplikat lebih dulu supaya pesannya jelas. Nomor WA ikut
    // dicek HANYA bila diisi.
    const orFilter = [`email.eq.${email}`, `username.eq.${username}`];
    if (nomor) orFilter.push(`nomor_wa.eq.${nomor}`);
    const { data: bentrok } = await db
      .from("app_user")
      .select("id, email, username, nomor_wa, status, email_verified_at")
      .or(orFilter.join(","))
      .limit(1)
      .maybeSingle();

    if (bentrok) {
      // Pendaftaran yang belum sempat verifikasi email boleh diulang —
      // kalau tidak, orang yang kehilangan kode akan terkunci selamanya.
      const belumSelesai = !bentrok.email_verified_at && bentrok.status === "menunggu";
      if (!belumSelesai) {
        throw Object.assign(
          new Error(
            bentrok.email === email
              ? "Email ini sudah terdaftar. Silakan masuk."
              : nomor && bentrok.nomor_wa === nomor
                ? "Nomor WhatsApp ini sudah terdaftar. Silakan masuk."
                : "Username ini sudah dipakai. Pilih yang lain.",
          ),
          { status: 409 },
        );
      }
      await hapusCacheUser(bentrok.id);
      await db
        .from("app_user")
        .update({
          email,
          username,
          nomor_wa: nomor || null,
          password_hash: await buatHashSandi(password),
          nama,
          status: statusAwal,
        })
        .eq("id", bentrok.id);
    } else {
      const { error } = await db.from("app_user").insert({
        email,
        username,
        nomor_wa: nomor || null,
        nama,
        password_hash: await buatHashSandi(password),
        // Peran sementara terendah; super admin yang menentukan peran
        // sebenarnya (Ketua/Anggota) saat menyetujui.
        role: "anggota",
        jabatan: "",
        avatar_url: "",
        status: statusAwal,
        profil_lengkap: false,
        wa_terverifikasi: false,
        aktif: true,
      });
      if (error) {
        console.error("[daftar] gagal insert:", error.message);
        throw new Error("Gagal membuat akun. Coba lagi sebentar.");
      }
    }

    // Coba kirim OTP EMAIL. BILA GAGAL, pendaftaran TIDAK dibatalkan:
    // akunnya sudah dibuat berstatus 'menunggu', jadi pengguna tetap bisa
    // lanjut — hanya saja emailnya belum terverifikasi dan HR/master WAJIB
    // menyetujuinya manual.
    let otpTerkirim = true;
    try {
      await kirimOtpEmail(email, "daftar");
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 429) {
        // Jeda 60 detik (kode belum kedaluwarsa) BUKAN kegagalan kirim.
        return { sukses: true, email, otp_terkirim: true, auto_aktif: autoAktif };
      }
      // Termasuk EmailBelumDiaturError (SMTP belum diatur di server):
      // JANGAN menggagalkan pendaftaran. Akunnya sudah dibuat 'menunggu',
      // jadi pengguna tetap bisa lanjut ke layar menunggu — persetujuan
      // manusia menggantikan verifikasi email sampai SMTP dipasang.
      otpTerkirim = false;
      const belumDiatur = e instanceof EmailBelumDiaturError;
      console.error(
        belumDiatur
          ? "[daftar] SMTP belum diatur — pendaftaran lanjut tanpa verifikasi email."
          : "[daftar] OTP email gagal terkirim, lanjut tanpa verifikasi:",
        e instanceof Error ? e.message : e,
      );
      // HR/master WAJIB diberi tahu — pendaftar tanpa email terverifikasi
      // tidak boleh terlewat.
      await kirimKabar({
        judul: "Pendaftar baru tanpa verifikasi email",
        isi: `${nama} mendaftar, tetapi OTP email gagal terkirim. Periksa dan setujui manual di Kelola Pengguna bila memang sah.`,
        kategori: "peringatan",
        jenis_peristiwa: "pendaftar_tanpa_verifikasi",
        untukRole: ["admin_hr", "super_admin", "master"],
      });
    }

    return { sukses: true, email, otp_terkirim: otpTerkirim, auto_aktif: autoAktif };
  });
}
