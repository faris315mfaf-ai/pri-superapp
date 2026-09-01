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
import { adalahHR } from "@/lib/hr";

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
    if (!HR.has(user.role) && !adalahHR(user) && !(await bolehDashboard(user, "anggota"))) {
      throw Object.assign(
        new Error("Jabatan Anda tidak punya akses dashboard Database Anggota."),
        { status: 403 },
      );
    }

    const db = supabase();
    const [
      { data: roster },
      { data: sosmed },
      { data: tvr },
      { data: wajah },
      { data: sidik },
    ] = await Promise.all([
      db
        .from("app_user")
        .select(
          "id, nama, email, nomor_wa, avatar_url, divisi, last_login_at, google_linked, email_verified_at, wa_terverifikasi, created_at",
        )
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("role", "master")
        .limit(500),
      // Username sosmed yang dipakai komentar QC (per user, lengkap).
      db
        .from("akun_sosmed_user")
        .select("user_id, platform, username")
        .eq("aktif", true)
        .limit(3000),
      // SEMUA akun TV Rakyat pribadi yang sudah login (upload-post).
      db
        .from("akun_tvr_user")
        .select("user_id, platform, username")
        .eq("terhubung", true)
        .neq("platform", "website")
        .limit(3000),
      // Fitur login: face recognition (punya template wajah).
      db.from("wajah_template").select("user_id").limit(2000),
      // Fitur login: sidik jari (punya kredensial WebAuthn).
      db.from("kredensial_webauthn").select("user_id").limit(2000),
    ]);

    const qcPer = new Map<number, { platform: string; username: string }[]>();
    for (const b of sosmed ?? []) {
      const id = Number(b.user_id);
      const arr = qcPer.get(id) ?? [];
      arr.push({ platform: String(b.platform), username: String(b.username) });
      qcPer.set(id, arr);
    }
    const tvrPer = new Map<number, { platform: string; username: string }[]>();
    for (const b of tvr ?? []) {
      const id = Number(b.user_id);
      const arr = tvrPer.get(id) ?? [];
      arr.push({ platform: String(b.platform), username: String(b.username) });
      tvrPer.set(id, arr);
    }
    const punyaWajah = new Set((wajah ?? []).map((w) => Number(w.user_id)));
    const punyaSidik = new Set((sidik ?? []).map((w) => Number(w.user_id)));

    // Email sintetis pendaftaran-WA lama bukan email sungguhan — jangan
    // ditampilkan seolah-olah kontak yang bisa dihubungi.
    const emailAsli = (e: string) => (e.endsWith("@pri.internal") ? "" : e);

    const anggota = (roster ?? []).map((u) => {
      const id = Number(u.id);
      const dimensi = {
        login: u.last_login_at != null,
        sosmed: (qcPer.get(id)?.length ?? 0) > 0,
        google: u.google_linked === true,
        email: u.email_verified_at != null,
        wa: u.wa_terverifikasi === true,
      };
      const terpenuhi = Object.values(dimensi).filter(Boolean).length;
      return {
        id: String(u.id),
        nama: u.nama as string,
        // Detail kontak (permintaan 31 Agu 2026 — dashboard ini memang
        // khusus HR/pengurus, gerbangnya di atas).
        email: emailAsli(String(u.email ?? "")),
        nomor_wa: (u.nomor_wa as string | null) ?? null,
        avatar_url: (u.avatar_url as string) ?? "",
        divisi: (u.divisi as string) ?? "",
        // Untuk grafik pertumbuhan pendaftar (kumulatif per tanggal).
        bergabung: (u.created_at as string) ?? null,
        // Fitur login yang AKTIF untuk akun ini.
        login_aktif: {
          email: u.email_verified_at != null,
          google: u.google_linked === true,
          wajah: punyaWajah.has(id),
          sidik_jari: punyaSidik.has(id),
        },
        // Akun TV Rakyat pribadi yang sudah login (nama + platform).
        tvr_akun: tvrPer.get(id) ?? [],
        tvr_tertaut: tvrPer.get(id)?.length ?? 0,
        // Username sosmed yang dipakai berkomentar (QC).
        qc_akun: qcPer.get(id) ?? [],
        dimensi,
        terpenuhi,
        persen: Math.round((terpenuhi / 5) * 100),
      };
    });

    return { anggota };
  });
}
