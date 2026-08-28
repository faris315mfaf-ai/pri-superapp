// POST /api/wajah/masuk — masuk dengan WAJAH (fitur 1.22/3).
//
// Alur 1:1: pengguna menyebut identitas (username/nomor/email) lalu
// menyorotkan wajahnya. Server memuat face_id akun itu dan meminta
// penyedia memverifikasi — LOLOS hanya bila cocok DAN live (anti-foto),
// dijaga di lib/wajah. Verifikasi terjadi di SERVER, jadi klien tak bisa
// memalsukan "lolos".
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { pastikanBukanPerbaikan } from "@/lib/perbaikan";
import { normalkanNomorWa } from "@/lib/fonnte";
import { buatSesi, keUserPublik, KOLOM_USER, type BarisUser } from "@/lib/sesi";
import { verifikasiWajahPenyedia, WajahBelumDiaturError, wajahSiap } from "@/lib/wajah";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const jeda = () => new Promise((r) => setTimeout(r, 300));
function errorStatus(pesan: string, status: number): Error {
  return Object.assign(new Error(pesan), { status });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    identitas?: string;
    image?: string;
    nama_perangkat?: string;
  };

  const sasaran = (body.identitas ?? "").trim().toLowerCase();
  // Lebih ketat dari login sandi: percobaan wajah lebih mahal & sensitif.
  const tolak = await pastikanTidakMelebihiBatas(request, "wajah-masuk", 6, 10 * 60, sasaran.slice(0, 64));
  if (tolak) return tolak;

  return bungkus(async () => {
    if (!wajahSiap()) {
      throw errorStatus("Masuk dengan wajah belum diaktifkan.", 503);
    }
    const identitas = (body.identitas ?? "").trim();
    const image = String(body.image ?? "");
    if (!identitas) throw errorStatus("Sebutkan username atau nomor WhatsApp Anda.", 400);
    if (!image.startsWith("data:image/")) throw errorStatus("Foto wajah tidak sah.", 400);

    const db = supabase();
    const adaHuruf = /[a-zA-Z@]/.test(identitas);
    let baris: BarisUser | null = null;
    if (!adaHuruf) {
      const { data } = await db
        .from("app_user")
        .select(KOLOM_USER)
        .eq("nomor_wa", normalkanNomorWa(identitas))
        .maybeSingle();
      baris = data as BarisUser | null;
    } else if (identitas.includes("@")) {
      const { data } = await db
        .from("app_user")
        .select(KOLOM_USER)
        .eq("email", identitas.toLowerCase())
        .maybeSingle();
      baris = data as BarisUser | null;
    } else {
      const { data } = await db
        .from("app_user")
        .select(KOLOM_USER)
        .ilike("username", identitas)
        .maybeSingle();
      baris = data as BarisUser | null;
    }

    await jeda();

    // Pesan gagal seragam supaya tak bisa dipakai menebak akun/wajah.
    const pesanGagal = "Wajah tidak cocok atau akun tidak ditemukan.";
    if (!baris) throw errorStatus(pesanGagal, 401);

    const { data: tpl } = await db
      .from("wajah_template")
      .select("face_id")
      .eq("user_id", baris.id)
      .maybeSingle();
    if (!tpl?.face_id) throw errorStatus(pesanGagal, 401);

    let hasil;
    try {
      hasil = await verifikasiWajahPenyedia(baris.id, image, String(tpl.face_id));
    } catch (e) {
      if (e instanceof WajahBelumDiaturError) throw errorStatus(e.message, 503);
      throw e;
    }
    if (!hasil.lolos) throw errorStatus(pesanGagal, 401);

    if (!baris.aktif) throw errorStatus("Akun ini dinonaktifkan. Hubungi pengurus.", 403);
    if (baris.status === "ditolak") throw errorStatus("Permohonan akun Anda ditolak.", 403);
    await pastikanBukanPerbaikan(baris.role);

    await db
      .from("wajah_template")
      .update({ terakhir_verifikasi_pada: new Date().toISOString() })
      .eq("user_id", baris.id)
      .then(() => {}, () => {});
    await db
      .from("app_user")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", baris.id)
      .then(() => {}, () => {});

    const token = await buatSesi(baris.id, body.nama_perangkat);
    return { user: keUserPublik(baris), token };
  });
}
