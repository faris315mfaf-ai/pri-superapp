// /api/absensi/sadar/pencocokan — pencocokan akun SuperApp ↔ pegawai SADAR
// (HR Center → Database Anggota, 14 Sep 2026; dirombak 28 Sep 2026).
//
// GET    → tiap anggota aktif + cara cocoknya (manual / email / belum),
//          SARAN pasangan untuk yang belum (nama lengkap, email/username
//          — lib/sadar-pasangan), dan pegawai SADAR (14–31 hari
//          terakhir) yang belum terpasang ke akun mana pun.
// POST   { user_id, kode_pegawai }            → pasangkan satu.
//        { pasangan: [{ user_id, kode_pegawai }] } → pasangkan banyak
//          sekaligus (tombol "Pasangkan semua saran kuat").
// DELETE { user_id } → lepas pemetaan manual; pencocokan email berlaku lagi.
//
// Pemetaan disimpan di tabel sadar_pemetaan bila sudah ada, atau di
// pengaturan_sistem bila belum (lib/sadar-pemetaan) — dulu tanpa tabel
// itu POST selalu gagal 503 dan tidak ada yang bisa dipasangkan.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahHR } from "@/lib/hr";
import {
  cerminkanUlangKode,
  daftarPegawaiSadar,
  petaEmailKeUser,
  type PegawaiSadar,
} from "@/lib/absensi-sadar";
import { lepasPemetaan, pasangPemetaan, semuaPemetaan } from "@/lib/sadar-pemetaan";
import { susunSaran } from "@/lib/sadar-pasangan";
import { sadarSiap } from "@/lib/sadar";
import { hapusCacheBersama } from "@/lib/cache-bersama";
import { tanggalWibHariIni } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PENGURUS = new Set(["master", "super_admin", "admin_hr", "superadmin"]);
const MAKS_SEKALIGUS = 300;

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

/** Email sintetis (daftar tanpa email) bukan email sungguhan — jangan dipakai mencocokkan. */
function emailAsli(email: unknown): string {
  const e = String(email ?? "").trim().toLowerCase();
  return e && !/@pri\.internal$/.test(e) ? e : "";
}

/** Tulis ulang cermin absensi & kosongkan cache hari ini setelah pemetaan berubah. */
async function segarkanSetelahUbah(perubahan: { kode: string; userId: number | null }[]) {
  for (const p of perubahan) await cerminkanUlangKode(p.kode, p.userId);
  await hapusCacheBersama(`sadar:sinkron:${tanggalWibHariIni()}`);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanHR(request);
    if (!sadarSiap()) {
      throw Object.assign(new Error("Server belum tersambung ke SADAR (SADAR_API_TOKEN belum diatur)."), {
        status: 503,
        pesanAman: true,
      });
    }
    const db = supabase();
    const [{ data: anggota }, pemetaan, pegawai] = await Promise.all([
      db
        .from("app_user")
        .select("id, nama, email, avatar_url, divisi, username")
        .eq("aktif", true)
        .eq("status", "aktif")
        .order("nama")
        .limit(3000),
      semuaPemetaan(),
      daftarPegawaiSadar(),
    ]);
    const manualPerUser = new Map(pemetaan.map((m) => [m.user_id, m]));
    const kodeTerpakai = new Set<string>(pemetaan.map((m) => m.kode_pegawai));

    // Pencocokan email: satu pegawai per email (yang terbaru).
    const pegawaiPerEmail = new Map<string, PegawaiSadar>();
    for (const p of pegawai.values()) if (p.email && !pegawaiPerEmail.has(p.email)) pegawaiPerEmail.set(p.email, p);

    const daftar = (anggota ?? []).map((u) => {
      const dasar = {
        id: String(u.id),
        nama: String(u.nama ?? ""),
        email: emailAsli(u.email),
        username: String(u.username ?? ""),
        divisi: String(u.divisi ?? ""),
        avatar_url: String(u.avatar_url ?? ""),
      };
      const manual = manualPerUser.get(Number(u.id));
      if (manual) {
        const p = pegawai.get(manual.kode_pegawai);
        return {
          ...dasar,
          cara: "manual" as const,
          kode_sadar: manual.kode_pegawai,
          nama_sadar: p?.nama || manual.nama_sadar,
          email_sadar: p?.email || manual.email_sadar,
        };
      }
      const lewatEmail = dasar.email ? pegawaiPerEmail.get(dasar.email) : undefined;
      if (lewatEmail && !kodeTerpakai.has(lewatEmail.kode)) {
        kodeTerpakai.add(lewatEmail.kode);
        return { ...dasar, cara: "email" as const, kode_sadar: lewatEmail.kode, nama_sadar: lewatEmail.nama, email_sadar: lewatEmail.email };
      }
      return { ...dasar, cara: "belum" as const, kode_sadar: "", nama_sadar: "", email_sadar: "" };
    });
    const sadarBelum = Array.from(pegawai.values())
      .filter((p) => !kodeTerpakai.has(p.kode))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
    // Saran untuk yang belum cocok — HR yang memutuskan.
    const saran = susunSaran(
      daftar.filter((d) => d.cara === "belum").map((d) => ({ id: d.id, nama: d.nama, email: d.email, username: d.username })),
      sadarBelum.map((p) => ({ kode: p.kode, nama: p.nama, email: p.email })),
    );
    return {
      anggota: daftar,
      sadar_belum: sadarBelum,
      saran,
      ringkasan: {
        anggota: daftar.length,
        cocok_email: daftar.filter((d) => d.cara === "email").length,
        cocok_manual: daftar.filter((d) => d.cara === "manual").length,
        belum: daftar.filter((d) => d.cara === "belum").length,
        sadar_belum: sadarBelum.length,
        pegawai_sadar: pegawai.size,
        saran_kuat: saran.filter((s) => s.keyakinan === "kuat").length,
        saran_mirip: saran.filter((s) => s.keyakinan === "mirip").length,
      },
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const hr = await pastikanHR(request);
    const body = (await request.json().catch(() => ({}))) as {
      user_id?: unknown;
      kode_pegawai?: unknown;
      pasangan?: unknown;
    };
    const mentah: { user_id?: unknown; kode_pegawai?: unknown }[] = Array.isArray(body.pasangan)
      ? (body.pasangan as { user_id?: unknown; kode_pegawai?: unknown }[]).slice(0, MAKS_SEKALIGUS)
      : [{ user_id: body.user_id, kode_pegawai: body.kode_pegawai }];
    const diminta = mentah
      .map((m) => ({ user_id: Number(m.user_id), kode: String(m.kode_pegawai ?? "").trim().slice(0, 60) }))
      .filter((m) => Number.isFinite(m.user_id) && m.user_id > 0 && m.kode);
    if (diminta.length === 0) throw Object.assign(new Error("Pilih anggota dan pegawai SADAR-nya."), { status: 400 });

    const db = supabase();
    const idUnik = [...new Set(diminta.map((d) => d.user_id))];
    const [akunAda, pegawai] = await Promise.all([
      (async () => {
        const ada = new Map<number, string>();
        for (let i = 0; i < idUnik.length; i += 300) {
          const { data } = await db.from("app_user").select("id, nama").in("id", idUnik.slice(i, i + 300));
          for (const u of data ?? []) ada.set(Number(u.id), String(u.nama ?? ""));
        }
        return ada;
      })(),
      daftarPegawaiSadar(),
    ]);
    const ditolak: { user_id: string; kode_pegawai: string; alasan: string }[] = [];
    const sah = diminta.filter((d) => {
      if (!akunAda.has(d.user_id)) {
        ditolak.push({ user_id: String(d.user_id), kode_pegawai: d.kode, alasan: "Akun tidak ditemukan." });
        return false;
      }
      if (!pegawai.has(d.kode)) {
        ditolak.push({ user_id: String(d.user_id), kode_pegawai: d.kode, alasan: "Kode pegawai SADAR tidak dikenal (tidak muncul di SADAR belakangan ini)." });
        return false;
      }
      return true;
    });
    if (sah.length === 0) {
      throw Object.assign(new Error(ditolak[0]?.alasan ?? "Tidak ada pasangan yang sah."), { status: diminta.length === 1 ? 404 : 400 });
    }
    const tergantikan = await pasangPemetaan(
      sah.map((d) => {
        const p = pegawai.get(d.kode)!;
        return { user_id: d.user_id, kode_pegawai: d.kode, email_sadar: p.email, nama_sadar: p.nama };
      }),
      Number(hr.id),
    );
    // Kode lama yang kehilangan akunnya (atau pindah orang) dilepas dulu,
    // lalu cermin kode yang baru dipasang ditulis ulang untuk pemiliknya.
    const kodeBaru = new Set(sah.map((d) => d.kode));
    await segarkanSetelahUbah([
      ...tergantikan.filter((t) => !kodeBaru.has(t.kode_pegawai)).map((t) => ({ kode: t.kode_pegawai, userId: null })),
      ...sah.map((d) => ({ kode: d.kode, userId: d.user_id })),
    ]);
    const pertama = sah[0];
    return {
      sukses: true,
      dipasangkan: sah.length,
      ditolak,
      // Bentuk lama (satu pasangan) tetap ada untuk layar yang memakainya.
      user_id: String(pertama.user_id),
      kode_pegawai: pertama.kode,
      nama_sadar: pegawai.get(pertama.kode)?.nama ?? "",
    };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    await pastikanHR(request);
    const body = (await request.json().catch(() => ({}))) as { user_id?: unknown };
    const userId = Number(body.user_id);
    if (!Number.isFinite(userId) || userId <= 0) throw Object.assign(new Error("Anggota tidak disebutkan."), { status: 400 });
    const lama = await lepasPemetaan(userId);
    if (!lama) throw Object.assign(new Error("Anggota ini tidak punya pemetaan manual."), { status: 404 });
    // Setelah dilepas, pencocokan email berlaku lagi untuk kode itu.
    const kode = lama.kode_pegawai;
    const pegawai = await daftarPegawaiSadar();
    const email = emailAsli(pegawai.get(kode)?.email || lama.email_sadar);
    const lewatEmail = email ? ((await petaEmailKeUser([email])).get(email) ?? null) : null;
    await segarkanSetelahUbah([{ kode, userId: lewatEmail }]);
    return { sukses: true, kode_pegawai: kode, kini_lewat_email: lewatEmail !== null };
  });
}
