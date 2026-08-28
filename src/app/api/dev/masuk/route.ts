// POST /api/dev/masuk — Mode Developer (fitur 1.22/1).
//
// Impersonasi SESI: masuk sebagai akun __dev__ tersembunyi dengan
// peran/jabatan/divisi pilihan. Tidak mengubah data akun mana pun;
// keluar = sesi dihapus = kembali normal.
//
// ⚠️ Sesuai keputusan pemilik aplikasi: tombolnya terlihat semua orang
// dan gerbangnya hanya password "1". Ini memang pintu belakang yang
// disadari — dijaga rate-limit agar tak jadi alat brute-force massal.
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { buatSesiDev, keUserPublik, KOLOM_USER, type BarisUser } from "@/lib/sesi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { JABATAN_PARTAI } from "@/lib/jabatan";
import { DIVISI, pilihanSubDivisi } from "@/lib/struktur";

export const dynamic = "force-dynamic";

const PERAN_SAH = new Set(["master", "super_admin", "admin_hr", "admin_tv", "ketua", "anggota"]);
const KATA_SANDI_DEV = "1";

export async function POST(request: Request) {
  const tolak = await pastikanTidakMelebihiBatas(request, "dev-masuk", 15, 10 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      password?: string;
      peran?: string;
      jabatan?: string;
      divisi?: string;
      sub_divisi?: string;
    };

    if (String(body.password ?? "") !== KATA_SANDI_DEV) {
      throw Object.assign(new Error("Kata sandi developer salah."), { status: 401 });
    }

    const peran = String(body.peran ?? "anggota");
    if (!PERAN_SAH.has(peran)) {
      throw Object.assign(new Error("Peran tidak dikenal."), { status: 400 });
    }
    const jabatan = String(body.jabatan ?? "").trim();
    if (jabatan && !(JABATAN_PARTAI as readonly string[]).includes(jabatan)) {
      throw Object.assign(new Error("Jabatan tidak dikenal."), { status: 400 });
    }
    const divisi = String(body.divisi ?? "").trim();
    if (divisi && !(DIVISI as readonly string[]).includes(divisi)) {
      throw Object.assign(new Error("Divisi tidak dikenal."), { status: 400 });
    }
    let subdivisi = String(body.sub_divisi ?? "").trim();
    if (divisi) {
      const pilihan = pilihanSubDivisi(divisi);
      if (pilihan.length > 0 && subdivisi && !pilihan.some((p) => p.nilai === subdivisi)) {
        throw Object.assign(new Error("Sub-divisi tidak cocok."), { status: 400 });
      }
      if (pilihan.length === 0) subdivisi = "";
    } else {
      subdivisi = "";
    }

    const db = supabase();
    const { data: dev } = await db
      .from("app_user")
      .select(KOLOM_USER)
      .eq("username", "__dev__")
      .maybeSingle();
    if (!dev) {
      throw Object.assign(new Error("Akun developer belum disiapkan."), { status: 500 });
    }

    const token = await buatSesiDev(dev.id, { peran, jabatan, divisi, subdivisi });

    // User publik yang DILIHAT klien = akun dev dengan override.
    const baris = { ...(dev as BarisUser), role: peran, jabatan, divisi, sub_divisi: subdivisi };
    return { user: keUserPublik(baris), token };
  });
}
