// GET /api/dashboard/anggota — data sub-dashboard "Database Anggota"
// (fitur 1.19/3.3.e). BACA-SAJA: kelengkapan data tiap anggota pada
// LIMA dimensi (spek):
//   1. login    — pernah masuk aplikasi (app_user.last_login_at terisi;
//                 kolom ini mulai dicatat rilis 1.19)
//   2. sosmed   — punya minimal 1 akun sosmed tertaut (akun_sosmed_user)
//   3. google   — akun Google tertaut (google_linked)
//   4. email    — email terverifikasi (email_verified_at; saat ini
//                 satu-satunya jalur verifikasi adalah login Google)
//   5. wa       — nomor WhatsApp terverifikasi OTP (wa_terverifikasi)
//
// Akses: HR (admin_hr/super_admin/master) atau jabatan yang diberi
// master akses dashboard "anggota".
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";

export const dynamic = "force-dynamic";

const HR = new Set(["master", "super_admin", "admin_hr"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!HR.has(user.role) && !(await bolehDashboard(user.role, "anggota"))) {
      throw Object.assign(
        new Error("Jabatan Anda tidak punya akses dashboard Database Anggota."),
        { status: 403 },
      );
    }

    const db = supabase();
    const [{ data: roster }, { data: sosmed }] = await Promise.all([
      db
        .from("app_user")
        .select(
          "id, nama, avatar_url, divisi, last_login_at, google_linked, email_verified_at, wa_terverifikasi",
        )
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("role", "master")
        .limit(500),
      db.from("akun_sosmed_user").select("user_id").limit(2000),
    ]);

    const punyaSosmed = new Set((sosmed ?? []).map((s) => Number(s.user_id)));

    const anggota = (roster ?? []).map((u) => {
      const dimensi = {
        login: u.last_login_at != null,
        sosmed: punyaSosmed.has(Number(u.id)),
        google: u.google_linked === true,
        email: u.email_verified_at != null,
        wa: u.wa_terverifikasi === true,
      };
      const terpenuhi = Object.values(dimensi).filter(Boolean).length;
      return {
        id: String(u.id),
        nama: u.nama as string,
        avatar_url: (u.avatar_url as string) ?? "",
        divisi: (u.divisi as string) ?? "",
        dimensi,
        terpenuhi,
        persen: Math.round((terpenuhi / 5) * 100),
      };
    });

    return { anggota };
  });
}
