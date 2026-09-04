// /api/tvr/kendali — daftar akun anggota Divisi PALUGODAM yang bisa
// DIKENDALIKAN Admin PALUGODAM di modul TV Rakyat Saya (4 Sep 2026).
// GET → { anggota: [{id, nama, username, avatar_url, posisi, profil, tertaut}] }
// Hanya admin Studio (master / super_admin / kepala Divisi PALUGODAM).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
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
