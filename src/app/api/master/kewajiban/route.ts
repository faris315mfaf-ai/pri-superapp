// /api/master/kewajiban — BEBAS KEWAJIBAN (Panel Master, 3 Sep 2026).
// Pengguna yang dibebaskan tidak melihat KPI, absensi, kepatuhan komentar,
// dan kewajiban upload video (kolom app_user.sembunyi_kewajiban; dibaca
// klien lewat lib/jabatan.bebasKewajiban).
//
// GET  ?cari=<nama/username>  → hasil pencarian (maks 30) + daftar yang sudah dibebaskan
// POST { user_id, sembunyi }  → set/lepas
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { hapusCacheUser } from "@/lib/cache-sesi";

export const dynamic = "force-dynamic";

const PENGELOLA = new Set(["master", "super_admin"]);
const KOLOM = "id, nama, username, jabatan, divisi, avatar_url, sembunyi_kewajiban";

type BarisRingkas = {
  id: number;
  nama: string;
  username: string | null;
  jabatan: string | null;
  divisi: string | null;
  avatar_url: string | null;
  sembunyi_kewajiban: boolean | null;
};

function rapikan(b: BarisRingkas) {
  return {
    id: String(b.id),
    nama: String(b.nama ?? ""),
    username: String(b.username ?? ""),
    jabatan: String(b.jabatan ?? ""),
    divisi: String(b.divisi ?? ""),
    avatar_url: String(b.avatar_url ?? ""),
    sembunyi: b.sembunyi_kewajiban === true,
  };
}

async function pastikanPengelola(request: Request) {
  const user = await pastikanMasuk(request);
  if (!PENGELOLA.has(user.role)) {
    throw Object.assign(new Error("Khusus master / Ketua Umum."), { status: 403 });
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanPengelola(request);
    const db = supabase();
    const cari = (new URL(request.url).searchParams.get("cari") ?? "").trim().slice(0, 60);
    // Karakter khusus pola ilike dinetralkan supaya pencarian apa adanya.
    const pola = `%${cari.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const [{ data: hasil }, { data: dibebaskan }] = await Promise.all([
      cari.length >= 2
        ? db
            .from("app_user")
            .select(KOLOM)
            .eq("aktif", true)
            .eq("status", "aktif")
            .or(`nama.ilike.${pola},username.ilike.${pola}`)
            .order("nama", { ascending: true })
            .limit(30)
        : Promise.resolve({ data: [] as BarisRingkas[] }),
      db.from("app_user").select(KOLOM).eq("sembunyi_kewajiban", true).order("nama", { ascending: true }).limit(300),
    ]);
    return {
      hasil: ((hasil ?? []) as BarisRingkas[]).map(rapikan),
      dibebaskan: ((dibebaskan ?? []) as BarisRingkas[]).map(rapikan),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const admin = await pastikanPengelola(request);
    const db = supabase();
    const body = (await request.json().catch(() => ({}))) as { user_id?: string; sembunyi?: boolean };
    const id = Number(body.user_id);
    if (!Number.isFinite(id) || id <= 0) throw Object.assign(new Error("Pengguna tidak disebutkan."), { status: 400 });
    const nilai = body.sembunyi === true;
    const { data, error } = await db
      .from("app_user")
      .update({ sembunyi_kewajiban: nilai })
      .eq("id", id)
      .select(KOLOM)
      .maybeSingle();
    if (error) throw new Error("Gagal menyimpan.");
    if (!data) throw Object.assign(new Error("Pengguna tidak ditemukan."), { status: 404 });
    // Sesi orang itu di-cache; kosongkan supaya perubahan langsung terasa
    // saat aplikasinya menyegarkan data akun.
    await hapusCacheUser(id).catch(() => {});
    console.info(`[master/kewajiban] ${admin.nama} ${nilai ? "membebaskan" : "mengaktifkan kembali"} kewajiban ${data.nama} (#${id})`);
    return { sukses: true, pengguna: rapikan(data as BarisRingkas) };
  });
}
