// POST /api/wajah/masuk — masuk dengan WAJAH tanpa username (fitur 1.22/3).
//
// Alur 1:N: pengguna hanya menyorotkan wajahnya. Server menjalankan
// anti-foto (liveness) lalu mengidentifikasi siapa pemilik wajah itu
// (nama subjek deterministik pri_<userId> di Luxand). LOLOS hanya bila
// wajah ASLI dan cocok kuat dengan seseorang yang terdaftar. Identifikasi
// terjadi di SERVER — klien tak bisa memalsukan hasilnya.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { pastikanBukanPerbaikan } from "@/lib/perbaikan";
import { buatSesi, keUserPublik, KOLOM_USER, type BarisUser } from "@/lib/sesi";
import { identifikasiWajah, WajahBelumDiaturError, wajahSiap } from "@/lib/wajah";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function errorStatus(pesan: string, status: number): Error {
  return Object.assign(new Error(pesan), { status });
}

export async function POST(request: Request) {
  // Ketat: percobaan wajah mahal & sensitif (per IP).
  const tolak = await pastikanTidakMelebihiBatas(request, "wajah-masuk", 12, 10 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    if (!wajahSiap()) throw errorStatus("Masuk dengan wajah belum diaktifkan.", 503);

    const body = (await request.json().catch(() => ({}))) as { image?: string };
    const image = String(body.image ?? "");
    if (!image.startsWith("data:image/")) throw errorStatus("Foto wajah tidak sah.", 400);

    let hasil;
    try {
      hasil = await identifikasiWajah(image);
    } catch (e) {
      if (e instanceof WajahBelumDiaturError) throw errorStatus(e.message, 503);
      throw e;
    }

    // Keaslian gagal → pesan spesifik (mis. foto/kualitas). Selain itu,
    // pesan seragam supaya tak bocor siapa yang terdaftar.
    if (!hasil.live) {
      throw errorStatus(hasil.alasan ?? "Keaslian wajah tak terbukti. Ambil ulang dari kamera.", 401);
    }
    if (!hasil.userId) {
      throw errorStatus("Wajah tidak dikenali. Coba lagi atau masuk dengan sandi.", 401);
    }

    const db = supabase();
    const { data } = await db
      .from("app_user")
      .select(KOLOM_USER)
      .eq("id", Number(hasil.userId))
      .maybeSingle();
    const baris = data as BarisUser | null;
    if (!baris) throw errorStatus("Wajah tidak dikenali. Coba lagi atau masuk dengan sandi.", 401);

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

    const token = await buatSesi(baris.id, "Masuk Wajah");
    return { user: keUserPublik(baris), token };
  });
}
