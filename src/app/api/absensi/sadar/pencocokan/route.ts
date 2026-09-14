// /api/absensi/sadar/pencocokan — pencocokan akun SuperApp ↔ pegawai SADAR
// (HR Center → Database Anggota, 14 Sep 2026).
//
// GET    → tiap anggota aktif + cara cocoknya (email / manual / belum),
//          dan daftar pegawai SADAR (31 hari terakhir) yang belum
//          terpasang ke akun mana pun.
// POST   { user_id, kode_pegawai } → pasangkan manual (tanpa mengubah
//          email di kedua aplikasi). Pemetaan manual menang atas email.
// DELETE { user_id } → lepas pemetaan manual; pencocokan email berlaku lagi.
//
// Setelah pasang/lepas, cermin absensi kode itu ditulis ulang saat itu
// juga (60 hari) — HR langsung melihat hasilnya, tidak menunggu cron.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahHR } from "@/lib/hr";
import { cerminkanUlangKode, petaEmailKeUser } from "@/lib/absensi-sadar";

export const dynamic = "force-dynamic";

const PENGURUS = new Set(["master", "super_admin", "admin_hr", "superadmin"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanHR(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!PENGURUS.has(user.role) && !adalahHR(user)) {
    throw Object.assign(new Error("Hanya HR yang boleh mencocokkan akun dengan SADAR."), { status: 403 });
  }
  return user;
}

type Pegawai = { kode: string; nama: string; email: string; terakhir: string };

/** Pegawai SADAR yang muncul 31 hari terakhir (unik per kode, terbaru). */
async function pegawaiSadar(): Promise<Map<string, Pegawai>> {
  const awal = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase()
    .from("absensi_sadar")
    .select("kode_pegawai, nama, email, tanggal")
    .gte("tanggal", awal)
    .order("tanggal", { ascending: false })
    .limit(5000);
  const peta = new Map<string, Pegawai>();
  for (const r of data ?? []) {
    const kode = String(r.kode_pegawai);
    if (!peta.has(kode)) {
      peta.set(kode, { kode, nama: String(r.nama ?? ""), email: String(r.email ?? "").toLowerCase(), terakhir: String(r.tanggal) });
    }
  }
  return peta;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanHR(request);
    const db = supabase();
    const [{ data: anggota }, { data: pemetaan, error: ePemetaan }, pegawai] = await Promise.all([
      db
        .from("app_user")
        .select("id, nama, email, avatar_url, divisi, username")
        .eq("aktif", true)
        .eq("status", "aktif")
        .order("nama")
        .limit(3000),
      db.from("sadar_pemetaan").select("user_id, kode_pegawai, email_sadar, nama_sadar"),
      pegawaiSadar(),
    ]);
    if (ePemetaan && ePemetaan.code === "42P01") {
      throw Object.assign(new Error("Tabel pemetaan belum ada: jalankan pri-sql 54_sadar_pemetaan.sql dulu."), { status: 503 });
    }
    const manualPerUser = new Map((pemetaan ?? []).map((m) => [Number(m.user_id), m]));
    const kodeTerpakai = new Set<string>((pemetaan ?? []).map((m) => String(m.kode_pegawai)));

    // Pencocokan email: satu pegawai per email (yang terbaru).
    const pegawaiPerEmail = new Map<string, Pegawai>();
    for (const p of pegawai.values()) if (p.email && !pegawaiPerEmail.has(p.email)) pegawaiPerEmail.set(p.email, p);

    const daftar = (anggota ?? []).map((u) => {
      const manual = manualPerUser.get(Number(u.id));
      if (manual) {
        const p = pegawai.get(String(manual.kode_pegawai));
        return {
          id: String(u.id),
          nama: String(u.nama),
          email: String(u.email ?? ""),
          username: String(u.username ?? ""),
          divisi: String(u.divisi ?? ""),
          avatar_url: String(u.avatar_url ?? ""),
          cara: "manual" as const,
          kode_sadar: String(manual.kode_pegawai),
          nama_sadar: p?.nama || String(manual.nama_sadar ?? ""),
          email_sadar: p?.email || String(manual.email_sadar ?? ""),
        };
      }
      const lewatEmail = pegawaiPerEmail.get(String(u.email ?? "").toLowerCase());
      if (lewatEmail && !kodeTerpakai.has(lewatEmail.kode)) {
        kodeTerpakai.add(lewatEmail.kode);
        return {
          id: String(u.id),
          nama: String(u.nama),
          email: String(u.email ?? ""),
          username: String(u.username ?? ""),
          divisi: String(u.divisi ?? ""),
          avatar_url: String(u.avatar_url ?? ""),
          cara: "email" as const,
          kode_sadar: lewatEmail.kode,
          nama_sadar: lewatEmail.nama,
          email_sadar: lewatEmail.email,
        };
      }
      return {
        id: String(u.id),
        nama: String(u.nama),
        email: String(u.email ?? ""),
        username: String(u.username ?? ""),
        divisi: String(u.divisi ?? ""),
        avatar_url: String(u.avatar_url ?? ""),
        cara: "belum" as const,
        kode_sadar: "",
        nama_sadar: "",
        email_sadar: "",
      };
    });
    const sadarBelum = Array.from(pegawai.values())
      .filter((p) => !kodeTerpakai.has(p.kode))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
    return {
      anggota: daftar,
      sadar_belum: sadarBelum,
      ringkasan: {
        anggota: daftar.length,
        cocok_email: daftar.filter((d) => d.cara === "email").length,
        cocok_manual: daftar.filter((d) => d.cara === "manual").length,
        belum: daftar.filter((d) => d.cara === "belum").length,
        sadar_belum: sadarBelum.length,
        pegawai_sadar: pegawai.size,
      },
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const hr = await pastikanHR(request);
    const body = (await request.json().catch(() => ({}))) as { user_id?: unknown; kode_pegawai?: unknown };
    const userId = Number(body.user_id);
    const kode = String(body.kode_pegawai ?? "").trim().slice(0, 60);
    if (!Number.isFinite(userId) || userId <= 0 || !kode) {
      throw Object.assign(new Error("Pilih anggota dan pegawai SADAR-nya."), { status: 400 });
    }
    const db = supabase();
    const [{ data: akun }, pegawai] = await Promise.all([
      db.from("app_user").select("id, nama").eq("id", userId).maybeSingle(),
      pegawaiSadar(),
    ]);
    if (!akun) throw Object.assign(new Error("Akun tidak ditemukan."), { status: 404 });
    const p = pegawai.get(kode);
    if (!p) throw Object.assign(new Error("Kode pegawai SADAR tidak dikenal (belum muncul 31 hari terakhir)."), { status: 404 });

    // Satu akun satu pegawai, satu pegawai satu akun: pemetaan lama di
    // kedua sisi dilepas dulu, cerminnya ditulis ulang.
    const { data: lamaKode } = await db.from("sadar_pemetaan").select("user_id").eq("kode_pegawai", kode).maybeSingle();
    const { data: lamaUser } = await db.from("sadar_pemetaan").select("kode_pegawai").eq("user_id", userId).maybeSingle();
    await db.from("sadar_pemetaan").delete().eq("kode_pegawai", kode);
    await db.from("sadar_pemetaan").delete().eq("user_id", userId);
    const { error } = await db.from("sadar_pemetaan").insert({
      user_id: userId,
      kode_pegawai: kode,
      email_sadar: p.email,
      nama_sadar: p.nama,
      dibuat_oleh_id: Number(hr.id),
    });
    if (error) {
      if (error.code === "42P01") {
        throw Object.assign(new Error("Tabel pemetaan belum ada: jalankan pri-sql 54_sadar_pemetaan.sql dulu."), { status: 503 });
      }
      throw new Error("Gagal menyimpan pemetaan.");
    }
    if (lamaUser && String(lamaUser.kode_pegawai) !== kode) await cerminkanUlangKode(String(lamaUser.kode_pegawai), null);
    if (lamaKode && Number(lamaKode.user_id) !== userId) {
      // Kode ini pindah orang: pemilik lama kehilangan cerminnya.
      await cerminkanUlangKode(kode, null);
    }
    await cerminkanUlangKode(kode, userId);
    return { sukses: true, user_id: String(userId), kode_pegawai: kode, nama_sadar: p.nama };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    await pastikanHR(request);
    const body = (await request.json().catch(() => ({}))) as { user_id?: unknown };
    const userId = Number(body.user_id);
    if (!Number.isFinite(userId) || userId <= 0) throw Object.assign(new Error("Anggota tidak disebutkan."), { status: 400 });
    const db = supabase();
    const { data: lama } = await db.from("sadar_pemetaan").select("kode_pegawai").eq("user_id", userId).maybeSingle();
    if (!lama) throw Object.assign(new Error("Anggota ini tidak punya pemetaan manual."), { status: 404 });
    await db.from("sadar_pemetaan").delete().eq("user_id", userId);
    // Setelah dilepas, pencocokan email berlaku lagi untuk kode itu.
    const kode = String(lama.kode_pegawai);
    const { data: contoh } = await db
      .from("absensi_sadar")
      .select("email")
      .eq("kode_pegawai", kode)
      .gte("tanggal", new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10))
      .order("tanggal", { ascending: false })
      .limit(1)
      .maybeSingle();
    const email = String(contoh?.email ?? "").toLowerCase();
    const lewatEmail = email ? (await petaEmailKeUser([email])).get(email) ?? null : null;
    await cerminkanUlangKode(kode, lewatEmail);
    return { sukses: true, kode_pegawai: kode, kini_lewat_email: lewatEmail !== null };
  });
}
