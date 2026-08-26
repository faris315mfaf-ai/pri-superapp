// POST /api/login — masuk dengan username, nomor WA, atau email.
//
// Kata sandi dicocokkan dengan hash scrypt; teks aslinya tidak pernah
// ada di database. Berhasil masuk = dapat token perangkat, yang dipakai
// aplikasi untuk masuk otomatis di pembukaan berikutnya.
import { supabase } from "@/lib/supabase";
import { cocokkanSandi } from "@/lib/sandi";
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { pastikanBukanPerbaikan } from "@/lib/perbaikan";
import { normalkanNomorWa } from "@/lib/fonnte";
import { buatSesi, keUserPublik, KOLOM_USER, type BarisUser } from "@/lib/sesi";

export const dynamic = "force-dynamic";

/** Jeda kecil agar percobaan tebak-sandi tidak bisa dilakukan cepat */
const jeda = () => new Promise((r) => setTimeout(r, 300));

function errorStatus(pesan: string, status: number): Error {
  return Object.assign(new Error(pesan), { status });
}

export async function POST(request: Request) {
  // Rate limit SEBELUM menyentuh database: 8 percobaan / 10 menit / IP.
  const tolak = await pastikanTidakMelebihiBatas(request, "login", 8, 10 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      // `identitas` = apa saja yang diketik pengguna di kolom pertama:
      // username, nomor WA, atau email. `email` dipertahankan agar
      // pemanggil versi lama tidak rusak.
      identitas?: string;
      email?: string;
      password?: string;
      nama_perangkat?: string;
    };

    const identitas = (body.identitas ?? body.email ?? "").trim();
    const password = body.password ?? "";

    if (!identitas || !password) {
      throw errorStatus("Nomor WhatsApp/username dan kata sandi wajib diisi", 400);
    }

    const db = supabase();

    // Tebak jenis identitasnya, lalu cari dengan cara yang sesuai.
    // Nomor dinormalkan dulu supaya 0812… dan 62812… menemukan akun
    // yang sama.
    const adaHuruf = /[a-zA-Z@]/.test(identitas);
    let baris: BarisUser | null = null;

    if (!adaHuruf) {
      const nomor = normalkanNomorWa(identitas);
      const { data } = await db
        .from("app_user")
        .select(KOLOM_USER + ", password_hash")
        .eq("nomor_wa", nomor)
        .maybeSingle();
      baris = data as BarisUser | null;
    } else if (identitas.includes("@")) {
      const { data } = await db
        .from("app_user")
        .select(KOLOM_USER + ", password_hash")
        .eq("email", identitas.toLowerCase())
        .maybeSingle();
      baris = data as BarisUser | null;
    } else {
      const { data } = await db
        .from("app_user")
        .select(KOLOM_USER + ", password_hash")
        .ilike("username", identitas)
        .maybeSingle();
      baris = data as BarisUser | null;
    }

    await jeda();

    // Pesan sengaja sama untuk "akun tidak ada" maupun "sandi salah",
    // supaya tidak bisa dipakai menebak akun mana yang terdaftar.
    const pesanGagal = "Nomor/username atau kata sandi salah";
    if (!baris) throw errorStatus(pesanGagal, 401);

    const hash = (baris as BarisUser & { password_hash: string }).password_hash;
    const cocok = await cocokkanSandi(password, hash);
    if (!cocok) throw errorStatus(pesanGagal, 401);

    if (!baris.aktif) {
      throw errorStatus("Akun ini dinonaktifkan. Hubungi pengurus.", 403);
    }
    if (baris.status === "ditolak") {
      throw errorStatus("Permohonan akun Anda ditolak. Hubungi pengurus.", 403);
    }

    // Mode perbaikan: sandi benar pun, selain master ditolak masuk.
    await pastikanBukanPerbaikan(baris.role);

    const token = await buatSesi(baris.id, body.nama_perangkat);

    return { user: keUserPublik(baris), token };
  });
}
