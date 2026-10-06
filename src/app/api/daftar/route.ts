// POST /api/daftar — pendaftaran akun baru.
//
// ALUR BARU (24 Sep 2026): TANPA EMAIL. Pendaftar memilih kategori dulu —
// SEKRETARIAT, DPD, atau DPC — lalu mengisi nama (KTP), username, sandi,
// nomor WA (opsional). DPD/DPC ikut mengisi nama DPD/DPC-nya, yang langsung
// menjadi struktur akunnya (divisi "DPD"/"DPC", sub_divisi = nama daerah).
// Akun dibuat berstatus 'menunggu' (kecuali sakelar bypass menyala) dan
// sesi langsung diberikan supaya pendaftar bisa melengkapi profil lalu
// menunggu persetujuan HR — pengganti verifikasi email.
//
// ALUR LAMA (masih diterima demi klien lama yang tersimpan di cache): bila
// `email` dikirim, perilakunya sama seperti sebelumnya (OTP ke email).
//
// OTP kini dikirim ke EMAIL (bukan WhatsApp). Akun dibuat berstatus
// 'menunggu' dengan email_verified_at kosong, lalu kode OTP dikirim ke
// emailnya. Akun belum bisa dipakai masuk sampai (a) OTP email
// terverifikasi, dan (b) super admin menyetujui.
//
// Nomor WA sekarang hanya kolom data (untuk basis data & sebagai
// identitas login alternatif bagi pengguna lama) — TIDAK ada OTP ke WA.
import { supabase } from "@/lib/supabase";
import { periksaUsername } from "@/lib/username";
import { bungkus } from "@/lib/api-helper";
import { hapusCacheUser } from "@/lib/cache-sesi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { buatHashSandi } from "@/lib/sandi";
import { normalkanNomorWa, nomorWaSah } from "@/lib/fonnte";
import { kirimOtpEmail, emailSah, normalkanEmail } from "@/lib/otp-email";
import { EmailBelumDiaturError } from "@/lib/email";
import { kirimKabar } from "@/lib/notifikasi";
import { buatSesi, keUserPublik, kolomUser, type BarisUser } from "@/lib/sesi";
import { penerimaKabarHR } from "@/lib/penerima-hr";
import {
  DIVISI_DPC,
  DIVISI_DPD,
  DIVISI_SAYAP,
  NAMA_DAERAH_MIN,
  SUB_SAYAP,
  jabatanSayapSah,
  rapikanNamaDaerah,
} from "@/lib/struktur";
import { kotaSah, provinsiSah } from "@/lib/wilayah";
import { catatAudit } from "@/lib/audit";

/** Kategori pendaftar (24 Sep 2026; "sayap" 7 Okt 2026). */
const KATEGORI_DAFTAR = ["sekretariat", "dpd", "dpc", "sayap"] as const;
type KategoriDaftar = (typeof KATEGORI_DAFTAR)[number];

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
      /** sekretariat | dpd | dpc (alur baru tanpa email) */
      kategori?: string;
      /** Nama DPD/DPC, mis. "Jawa Barat" */
      nama_daerah?: string;
      /** Kategori sayap: nilai SUB_SAYAP (mis. "PATRIOT") */
      sayap?: string;
      /** Opsional untuk sayap: provinsi, kota/kabupaten, jabatan sayap */
      provinsi?: string;
      kota?: string;
      jabatan_sayap?: string;
      nama_perangkat?: string;
    };

    // Username TIDAK BOLEH berspasi (24 Sep 2026): spasi di mana pun ditolak
    // tegas — bukan dibuang diam-diam — supaya pendaftar tahu username yang
    // dipakainya masuk persis seperti yang ia ketik.
    if (/\s/.test((body.username ?? "").trim())) {
      throw Object.assign(new Error("Username tidak boleh memakai spasi."), { status: 400 });
    }
    let username = (body.username ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const email = normalkanEmail(body.email ?? "");
    // Tanpa email = alur baru (kategori + sesi langsung).
    const alurBaru = !(body.email ?? "").trim();
    const nama = (body.nama ?? "").trim();
    // Nomor WA OPSIONAL: dinormalkan hanya bila diisi.
    const nomorMentah = (body.nomor_wa ?? "").trim();
    const nomor = nomorMentah ? normalkanNomorWa(nomorMentah) : "";

    // --- Validasi: 4 kolom WAJIB (nama, username, sandi, email) ---
    if (nama.length < 2) {
      throw Object.assign(new Error("Nama (sesuai KTP) wajib diisi."), { status: 400 });
    }
    // Aturan username dipakai BERSAMA dengan penggantian username
    // (lib/username) supaya keduanya tidak pernah berbeda pendapat.
    // Dulu di sini username yang seluruhnya angka lolos — padahal login
    // membaca masukan tanpa huruf sebagai NOMOR WHATSAPP, sehingga
    // pemiliknya tidak akan pernah bisa masuk dengan username itu.
    const periksaNama = periksaUsername(username);
    if (!periksaNama.sah) {
      throw Object.assign(new Error(periksaNama.pesan), { status: 400 });
    }
    username = periksaNama.bersih;
    if (password.length < 8) {
      throw Object.assign(new Error("Kata sandi minimal 8 karakter."), { status: 400 });
    }
    if (alurBaru) {
      return await daftarTanpaEmail({
        nama,
        username,
        password,
        nomor,
        kategori: String(body.kategori ?? "").trim().toLowerCase(),
        namaDaerah: rapikanNamaDaerah(String(body.nama_daerah ?? "")),
        sayap: String(body.sayap ?? "").trim(),
        provinsi: String(body.provinsi ?? "").trim(),
        kota: String(body.kota ?? "").trim(),
        jabatanSayap: String(body.jabatan_sayap ?? "").trim(),
        namaPerangkat: body.nama_perangkat,
      });
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
        isi: `${nama} mendaftar, tetapi OTP email gagal terkirim. Periksa dan setujui manual di HR Center → Database Anggota bila memang sah.`,
        kategori: "peringatan",
        jenis_peristiwa: "pendaftar_tanpa_verifikasi",
        untukRole: ["admin_hr", "super_admin", "master"],
      });
    }

    return { sukses: true, email, otp_terkirim: otpTerkirim, auto_aktif: autoAktif };
  });
}

/**
 * Alur baru (24 Sep 2026): tanpa email & tanpa OTP. Akun dibuat, sesi
 * diberikan (pendaftar melengkapi profil lalu menunggu persetujuan), dan
 * HR dikabari — persetujuan HR menggantikan verifikasi email.
 */
async function daftarTanpaEmail(isian: {
  nama: string;
  username: string;
  password: string;
  nomor: string;
  kategori: string;
  namaDaerah: string;
  sayap: string;
  provinsi: string;
  kota: string;
  jabatanSayap: string;
  namaPerangkat?: string;
}) {
  const { nama, username, password, nomor, namaPerangkat } = isian;
  if (!(KATEGORI_DAFTAR as readonly string[]).includes(isian.kategori)) {
    throw Object.assign(new Error("Pilih dulu: SEKRETARIAT, DPD, DPC, atau SAYAP PARTAI."), { status: 400 });
  }
  const kategori = isian.kategori as KategoriDaftar;
  const daerah = kategori === "dpd" || kategori === "dpc" ? isian.namaDaerah : "";
  if ((kategori === "dpd" || kategori === "dpc") && daerah.length < NAMA_DAERAH_MIN) {
    throw Object.assign(
      new Error(`Isi nama ${kategori.toUpperCase()}-nya (mis. ${kategori === "dpd" ? "Jawa Barat" : "Kota Bandung"}).`),
      { status: 400 },
    );
  }
  // SAYAP PARTAI (7 Okt 2026): sayap wajib dipilih dari daftar bawaan;
  // provinsi, kota/kabupaten, dan jabatan sayap opsional — tapi bila
  // diisi harus nilai yang sah (data Kepmendagri / JABATAN_SAYAP).
  const sayap = kategori === "sayap" ? isian.sayap : "";
  const provinsi = kategori === "sayap" ? isian.provinsi : "";
  const kota = kategori === "sayap" && provinsi ? isian.kota : "";
  const jabatanSayap = kategori === "sayap" ? isian.jabatanSayap : "";
  if (kategori === "sayap") {
    if (!SUB_SAYAP.some((s) => s.nilai === sayap)) {
      throw Object.assign(new Error("Pilih sayap partai Anda."), { status: 400 });
    }
    if (provinsi && !provinsiSah(provinsi)) {
      throw Object.assign(new Error("Provinsi tidak dikenal. Pilih dari daftar."), { status: 400 });
    }
    if (kota && !kotaSah(provinsi, kota)) {
      throw Object.assign(new Error("Kota/kabupaten tidak ada di provinsi itu."), { status: 400 });
    }
    if (jabatanSayap && !jabatanSayapSah(jabatanSayap)) {
      throw Object.assign(new Error("Jabatan sayap tidak dikenal. Pilih dari daftar."), { status: 400 });
    }
  }
  if (password.length < 8) {
    throw Object.assign(new Error("Kata sandi minimal 8 karakter."), { status: 400 });
  }
  if (nomor && !nomorWaSah(nomor)) {
    throw Object.assign(
      new Error("Nomor WhatsApp tidak benar. Kosongkan bila tidak ingin mengisi."),
      { status: 400 },
    );
  }

  const db = supabase();
  // Jabatan sayap membuka modul Dashboard, jadi yang mengajukannya SELALU
  // menunggu persetujuan HR — walau sakelar daftar-langsung-aktif menyala.
  const autoAktif = (await daftarAutoAktif(db)) && !jabatanSayap;

  // Tanpa email tidak ada bukti kepemilikan, jadi pendaftaran yang
  // bentrok TIDAK boleh ditimpa (dulu boleh bila emailnya belum
  // terverifikasi) — siapa pun bisa mengambil alih pendaftaran orang lain.
  const orFilter = [`username.eq.${username}`];
  if (nomor) orFilter.push(`nomor_wa.eq.${nomor}`);
  const { data: bentrok } = await db
    .from("app_user")
    .select("id, username, nomor_wa")
    .or(orFilter.join(","))
    .limit(1)
    .maybeSingle();
  if (bentrok) {
    throw Object.assign(
      new Error(
        nomor && bentrok.nomor_wa === nomor
          ? "Nomor WhatsApp ini sudah terdaftar. Silakan masuk."
          : "Username ini sudah dipakai. Pilih yang lain.",
      ),
      { status: 409 },
    );
  }

  // Kolom email wajib & unik di database: diisi alamat SINTETIS
  // @pri.internal — seluruh aplikasi sudah mengenalinya sebagai "bukan
  // email sungguhan" (tidak ditampilkan, tidak dikirimi OTP).
  const acak = Math.random().toString(36).slice(2, 8);
  const emailSintetis = `${username}.${Date.now().toString(36)}${acak}@pri.internal`;
  const { data: baru, error } = await db
    .from("app_user")
    .insert({
      email: emailSintetis,
      username,
      nomor_wa: nomor || null,
      nama,
      password_hash: await buatHashSandi(password),
      role: "anggota",
      jabatan: "",
      avatar_url: "",
      status: autoAktif ? "aktif" : "menunggu",
      profil_lengkap: false,
      wa_terverifikasi: false,
      aktif: true,
      // DPD/DPC/Sayap langsung menjadi struktur akunnya.
      divisi:
        kategori === "dpd" ? DIVISI_DPD : kategori === "dpc" ? DIVISI_DPC : kategori === "sayap" ? DIVISI_SAYAP : "",
      sub_divisi: kategori === "sayap" ? sayap : daerah,
      // Hanya kategori sayap yang mengisi kolom ini (sql/61); pendaftar
      // lain tidak menyentuhnya, jadi database lama tetap aman.
      ...(kategori === "sayap" ? { jabatan_sayap: jabatanSayap, provinsi, kota } : {}),
    })
    .select(await kolomUser())
    .single();
  if (error || !baru) {
    if (error?.code === "23505") {
      throw Object.assign(new Error("Username ini sudah dipakai. Pilih yang lain."), { status: 409 });
    }
    console.error("[daftar] gagal insert (tanpa email):", error?.message);
    throw new Error("Gagal membuat akun. Coba lagi sebentar.");
  }
  const user = baru as unknown as BarisUser;
  const token = await buatSesi(user.id, namaPerangkat);
  catatAudit(user.id, "daftar", "Mendaftar akun baru", { detail: { perangkat: namaPerangkat ?? "" } });

  if (!autoAktif) {
    const label =
      kategori === "sekretariat"
        ? "Sekretariat"
        : kategori === "sayap"
          ? [
              `Sayap ${sayap}`,
              // Jabatan sayap DIAJUKAN SENDIRI — HR memastikannya saat ACC.
              jabatanSayap && `mengajukan jabatan ${jabatanSayap}`,
              [kota, provinsi].filter(Boolean).join(", "),
            ]
              .filter(Boolean)
              .join(" · ")
          : `${kategori.toUpperCase()} ${daerah}`;
    const penerima = await penerimaKabarHR();
    await kirimKabar({
      judul: "Pendaftar baru menunggu persetujuan",
      isi: `${nama} (@${username}, ${label}) mendaftar. Setujui di HR Center → Database Anggota.`,
      kategori: "info",
      jenis_peristiwa: "pendaftar_baru",
      ...(penerima.length > 0 ? { untukUserIds: penerima } : { untukRole: ["master"] }),
    });
  }

  return {
    sukses: true,
    tanpa_email: true,
    otp_terkirim: false,
    auto_aktif: autoAktif,
    token,
    user: keUserPublik(user),
  };
}

