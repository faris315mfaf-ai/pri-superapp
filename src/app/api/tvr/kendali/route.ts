// /api/tvr/kendali — daftar akun anggota Divisi PALUGODAM yang bisa
// DIKENDALIKAN Admin PALUGODAM di modul TV Rakyat Saya (4 Sep 2026).
// GET → { anggota: [{id, nama, username, avatar_url, posisi, profil, tertaut}] }
// Hanya admin Studio (master / super_admin / kepala Divisi PALUGODAM).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { buatSesi, keUserPublik, KOLOM_USER, pastikanMasuk, type BarisUser } from "@/lib/sesi";
import { adalahAdminStudio, DIVISI_PALUGODAM } from "@/lib/struktur";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!adalahAdminStudio(user)) {
      throw Object.assign(new Error("Kendali akun hanya untuk Admin PALUGODAM / pengurus."), { status: 403 });
    }
    const db = supabase();
    const [{ data: orang }, { data: profil }, { data: akun }] = await Promise.all([
      db
        .from("app_user")
        .select("id, nama, username, avatar_url, posisi_divisi")
        .eq("divisi", DIVISI_PALUGODAM)
        .eq("aktif", true)
        .eq("status", "aktif")
        .order("nama", { ascending: true }),
      db.from("sosmed_profile").select("user_id, profile_key").eq("penyedia", "upload-post").eq("jenis", "pengguna").not("user_id", "is", null),
      db.from("akun_tvr_user").select("user_id").eq("terhubung", true),
    ]);
    const profilPer = new Map<number, string>();
    for (const p of profil ?? []) profilPer.set(Number(p.user_id), String(p.profile_key));
    const tertautPer = new Map<number, number>();
    for (const a of akun ?? []) tertautPer.set(Number(a.user_id), (tertautPer.get(Number(a.user_id)) ?? 0) + 1);
    return {
      anggota: (orang ?? [])
        .map((o) => ({
          id: String(o.id),
          nama: String(o.nama ?? ""),
          username: String(o.username ?? ""),
          avatar_url: String(o.avatar_url ?? ""),
          posisi: String(o.posisi_divisi ?? "anggota"),
          profil: profilPer.get(Number(o.id)) ?? "",
          tertaut: tertautPer.get(Number(o.id)) ?? 0,
        }))
        // Kepala dulu, lalu nama.
        .sort((a, b) => Number(b.posisi === "kepala") - Number(a.posisi === "kepala") || a.nama.localeCompare(b.nama)),
    };
  });
}

// ------------------------------------------------------------
// POST {aksi:"masuk", user_id} — BERALIH AKUN PENUH (6 Sep 2026).
// Server membuat SESI PERANGKAT untuk akun tujuan (tanpa kata sandi) dan
// mengembalikan tokennya; peramban memasangnya sebagai token aktif →
// seluruh aplikasi berjalan sebagai akun itu. Syarat sama dengan kendali
// lama: pemanggil admin Studio; tujuan aktif & anggota Divisi PALUGODAM;
// tidak boleh menyasar master/super_admin. Sesi diberi nama jelas
// ("Kendali PALUGODAM oleh …") sehingga terlihat di daftar perangkat
// pemilik akun dan dicabut saat admin menekan "Kembali ke akun saya".
// ------------------------------------------------------------
export async function POST(request: Request) {
  return bungkus(async () => {
    const admin = await pastikanMasuk(request);
    if (!adalahAdminStudio(admin)) {
      throw Object.assign(new Error("Beralih akun hanya untuk Admin PALUGODAM / pengurus."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { aksi?: string; user_id?: string | number };
    if (body.aksi !== "masuk") throw Object.assign(new Error("aksi harus 'masuk'."), { status: 400 });
    const targetId = Number(body.user_id ?? 0);
    if (!Number.isFinite(targetId) || targetId <= 0) throw Object.assign(new Error("user_id tidak sah."), { status: 400 });
    if (targetId === Number(admin.id)) throw Object.assign(new Error("Itu akun Anda sendiri."), { status: 400 });
    const { data } = await supabase().from("app_user").select(KOLOM_USER).eq("id", targetId).maybeSingle();
    if (!data) throw Object.assign(new Error("Akun tujuan tidak ditemukan."), { status: 404 });
    const b = data as unknown as BarisUser;
    if (b.aktif !== true || String(b.status) !== "aktif") throw Object.assign(new Error("Akun itu tidak aktif."), { status: 403 });
    if (String(b.divisi ?? "").trim() !== DIVISI_PALUGODAM) throw Object.assign(new Error("Hanya akun anggota Divisi PALUGODAM yang bisa dimasuki."), { status: 403 });
    if (b.role === "master" || b.role === "super_admin") throw Object.assign(new Error("Akun pengurus tertinggi tidak bisa dimasuki."), { status: 403 });
    const token = await buatSesi(targetId, `Kendali PALUGODAM oleh ${admin.nama}`.slice(0, 120));
    console.log(`[kendali] ${admin.nama} (#${admin.id}) masuk sebagai #${targetId}`);
    return { sukses: true, token, user: keUserPublik(b) };
  });
}
