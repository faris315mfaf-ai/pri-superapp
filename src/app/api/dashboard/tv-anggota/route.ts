// GET /api/dashboard/tv-anggota — PENGENDALI akun TV Rakyat anggota
// (upload-post) untuk dashboard TV: daftar semua profil anggota +
// akun tertaut (x/6) + ringkasan insight, dan detail per profil.
//
// ?profil=<username>          → insight lengkap satu profil (cache 15 mnt)
// ?profil=<username>&paksa=1  → tarik ulang langsung dari upload-post
//
// Gabungan "Official + anggota" dirakit klien: sisi Official dari
// endpoint insight Ayrshare yang sudah ada, sisi anggota dari sini.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";
import {
  analitikProfilUp,
  buatProfilUp,
  daftarProfilUp,
  hapusProfilUp,
  tautanHubungkanUp,
  uploadPostSiap,
} from "@/lib/upload-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PENGATUR = new Set(["master", "super_admin"]);
const TTL_MENIT = 15;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/**
 * Ambil angka "pengikut" dari objek analitik satu platform secara
 * TOLERAN — tiap platform memakai nama kolom berbeda. Tak ketemu = null
 * (jujur: tampilkan strip, bukan nol palsu).
 */
function angkaPengikut(obj: unknown): number | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const k of [
    "followers",
    "follower_count",
    "followers_count",
    "subscribers",
    "subscriber_count",
    "fans",
    "fan_count",
    "page_fans",
  ]) {
    const n = Number(o[k]);
    if (Number.isFinite(n) && o[k] != null) return n;
  }
  return null;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!PENGATUR.has(user.role) && !(await bolehDashboard(user, "tv"))) {
      throw Object.assign(new Error("Jabatan Anda tidak punya akses dashboard TV."), {
        status: 403,
      });
    }
    if (!uploadPostSiap()) return { siap: false, profil: [], kuota: 0 };

    const url = new URL(request.url);
    const db = supabase();

    // --- Detail satu profil (cache 15 menit) ---
    const qProfil = url.searchParams.get("profil");
    if (qProfil) {
      const { data: baris } = await db
        .from("sosmed_profile")
        .select("id, profile_key, insight_cache, insight_pada")
        .eq("penyedia", "upload-post")
        .eq("jenis", "pengguna")
        .eq("profile_key", qProfil)
        .maybeSingle();
      if (!baris) throw Object.assign(new Error("Profil tidak ditemukan."), { status: 404 });

      const paksa = url.searchParams.get("paksa") === "1";
      const umur = baris.insight_pada
        ? (Date.now() - new Date(baris.insight_pada as string).getTime()) / 60_000
        : Infinity;
      let insight = baris.insight_cache as Record<string, unknown> | null;
      let pada = (baris.insight_pada as string) ?? null;
      if (paksa || !insight || umur >= TTL_MENIT) {
        insight = await analitikProfilUp(qProfil);
        pada = new Date().toISOString();
        await db
          .from("sosmed_profile")
          .update({ insight_cache: insight, insight_pada: pada })
          .eq("id", baris.id);
      }
      return { profil: qProfil, insight, diperbarui_pada: pada };
    }

    // --- Daftar semua profil anggota + x/6 + ringkasan pengikut ---
    const [{ profil: diUp, kuota, paket }, { data: barisDb }, { data: roster }] =
      await Promise.all([
        daftarProfilUp(),
        db
          .from("sosmed_profile")
          .select("user_id, profile_key, insight_cache, insight_pada")
          .eq("penyedia", "upload-post")
          .eq("jenis", "pengguna"),
        db
          .from("app_user")
          .select("id, nama, avatar_url, divisi")
          .eq("aktif", true)
          .eq("status", "aktif"),
      ]);

    const orangPer = new Map(
      (roster ?? []).map((r) => [Number(r.id), r as { nama: string; avatar_url: string; divisi: string }]),
    );
    const akunPer = new Map(diUp.map((p) => [p.username, p.akun]));

    const daftar = (barisDb ?? []).map((b) => {
      const orang = orangPer.get(Number(b.user_id));
      const akun = akunPer.get(String(b.profile_key)) ?? {};
      const cache = (b.insight_cache ?? {}) as Record<string, unknown>;
      // Ringkasan pengikut per platform dari cache (null = belum ditarik).
      const pengikut: Record<string, number | null> = {};
      for (const [platform, obj] of Object.entries(cache)) {
        pengikut[platform] = angkaPengikut(obj);
      }
      return {
        user_id: String(b.user_id),
        nama: orang?.nama ?? "(nonaktif)",
        avatar_url: orang?.avatar_url ?? "",
        divisi: orang?.divisi ?? "",
        profil: String(b.profile_key),
        akun, // platform → username
        tertaut: Object.keys(akun).length,
        pengikut,
        insight_pada: (b.insight_pada as string) ?? null,
      };
    });

    // Profil yang ADA di upload-post tapi belum dikenal aplikasi (dibuat
    // langsung di dashboard upload-post) — bisa ditautkan ke anggota (2 Sep 2026).
    const dikenal = new Set((barisDb ?? []).map((b) => String(b.profile_key)));
    const belumTertaut = diUp
      .filter((p) => p.username && !dikenal.has(p.username))
      .map((p) => ({ profil: p.username, akun: p.akun, tertaut: Object.keys(p.akun).length }))
      .sort((a, b) => a.profil.localeCompare(b.profil));

    return {
      siap: true,
      kuota,
      paket,
      terpakai: diUp.length,
      profil: daftar.sort((a, b) => b.tertaut - a.tertaut || a.nama.localeCompare(b.nama)),
      belum_tertaut: belumTertaut,
    };
  });
}

// ------------------------------------------------------------
// POST — menautkan profil upload-post ke anggota (2 Sep 2026).
//   { aksi: "tautkan", profil, user_id, ganti? }  → profil yang SUDAH ADA di
//        upload-post (dibuat di dashboard mereka) dijadikan profil TVR Saya
//        milik anggota itu.
//   { aksi: "buat", username, user_id, ganti? }    → buat profil BERNAMA
//        (bukan slug otomatis <nama>-pri-<id>) lalu tautkan.
//   { aksi: "tautan", profil }                     → tautan login 48 jam
//        untuk menyambungkan akun sosmed ke profil itu (dikirim ke anggota).
// Satu anggota = satu profil (indeks unik penyedia+user_id). Bila anggota
// sudah punya profil → 409 kecuali ganti=true (baris lama dialihkan; profil
// lama di upload-post TIDAK dihapus — biar admin yang memutuskan).
// Akses: master & super_admin saja.
// ------------------------------------------------------------
const PLATFORM6 = new Set(["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"]);
const POLA_USERNAME = /^[a-z0-9][a-z0-9-]{2,39}$/;

/** Sinkron akun tertaut profil → akun_tvr_user (pola sama dengan tvr/hubungkan). */
async function sinkronAkunTertaut(
  db: ReturnType<typeof supabase>,
  userId: number,
  akun: Record<string, string>,
): Promise<{ tersinkron: number; konflik: string[] }> {
  let tersinkron = 0;
  const konflik: string[] = [];
  for (const [platform, mentah] of Object.entries(akun)) {
    if (!PLATFORM6.has(platform)) continue;
    const username = String(mentah).toLowerCase().replace(/^@+/, "");
    if (!username) continue;
    const { data: ada } = await db
      .from("akun_tvr_user")
      .select("id, user_id")
      .eq("platform", platform)
      .ilike("username", username)
      .maybeSingle();
    if (!ada) {
      const { error } = await db
        .from("akun_tvr_user")
        .insert({ user_id: userId, platform, username, terhubung: true });
      if (!error) tersinkron += 1;
    } else if (Number(ada.user_id) === userId) {
      await db.from("akun_tvr_user").update({ terhubung: true }).eq("id", ada.id);
    } else {
      konflik.push(`@${username} (${platform}) sudah terdaftar milik anggota lain`);
    }
  }
  return { tersinkron, konflik };
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const admin = await userDariToken(tokenDari(request));
    if (!admin) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!PENGATUR.has(admin.role)) {
      throw Object.assign(new Error("Hanya master / Ketua Umum yang boleh menautkan profil."), {
        status: 403,
      });
    }
    if (!uploadPostSiap()) throw new Error("upload-post belum tersambung (kunci API kosong).");

    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      profil?: string;
      username?: string;
      user_id?: string;
      ganti?: boolean;
    };
    const db = supabase();

    // --- Tautan login untuk profil apa pun ---
    if (body.aksi === "tautan") {
      const profil = (body.profil ?? "").trim();
      if (!profil) throw Object.assign(new Error("Profil tidak disebutkan."), { status: 400 });
      return { url: await tautanHubungkanUp(profil) };
    }

    if (body.aksi !== "tautkan" && body.aksi !== "buat") {
      throw Object.assign(new Error("aksi harus tautkan / buat / tautan."), { status: 400 });
    }
    const userId = Number(body.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw Object.assign(new Error("Pilih anggotanya dulu."), { status: 400 });
    }
    const { data: orang } = await db
      .from("app_user")
      .select("id, nama, aktif, status")
      .eq("id", userId)
      .maybeSingle();
    if (!orang || orang.aktif !== true || orang.status !== "aktif") {
      throw Object.assign(new Error("Anggota tidak ditemukan / tidak aktif."), { status: 404 });
    }

    // Profil milik anggota ini saat ini (kalau ada).
    const { data: milik } = await db
      .from("sosmed_profile")
      .select("id, profile_key")
      .eq("penyedia", "upload-post")
      .eq("jenis", "pengguna")
      .eq("user_id", userId)
      .maybeSingle();

    const { profil: diUp } = await daftarProfilUp();
    let profil = "";
    let akun: Record<string, string> = {};
    let dibuatBaru = false;

    if (body.aksi === "tautkan") {
      profil = (body.profil ?? "").trim();
      const ada = diUp.find((p) => p.username === profil);
      if (!ada) {
        throw Object.assign(new Error(`Profil "${profil}" tidak ada di upload-post.`), { status: 404 });
      }
      akun = ada.akun;
      // Sudah dikenal & milik orang lain? Tolak — jangan merebut diam-diam.
      const { data: pemilikLain } = await db
        .from("sosmed_profile")
        .select("user_id")
        .eq("profile_key", profil)
        .maybeSingle();
      if (pemilikLain && Number(pemilikLain.user_id) !== userId) {
        throw Object.assign(
          new Error(`Profil "${profil}" sudah tertaut ke anggota lain (id ${pemilikLain.user_id}).`),
          { status: 409 },
        );
      }
      if (pemilikLain && Number(pemilikLain.user_id) === userId) {
        // Sudah tertaut ke orang yang sama — idempoten.
        const sink = await sinkronAkunTertaut(db, userId, akun);
        return { sukses: true, profil, user_id: String(userId), ...sink };
      }
    } else {
      profil = (body.username ?? "").trim().toLowerCase();
      if (!POLA_USERNAME.test(profil)) {
        throw Object.assign(
          new Error("Nama profil: huruf kecil, angka, strip; 3–40 karakter."),
          { status: 400 },
        );
      }
      if (diUp.some((p) => p.username === profil)) {
        throw Object.assign(
          new Error(`Profil "${profil}" sudah ada di upload-post — pakai tombol Tautkan.`),
          { status: 409 },
        );
      }
    }

    if (milik && String(milik.profile_key) !== profil && body.ganti !== true) {
      throw Object.assign(
        new Error(`${orang.nama} sudah punya profil "${milik.profile_key}". Kirim ganti=true untuk mengalihkannya ke "${profil}".`),
        { status: 409 },
      );
    }

    if (body.aksi === "buat") {
      await buatProfilUp(profil);
      dibuatBaru = true;
    }

    const kolom = {
      penyedia: "upload-post",
      jenis: "pengguna",
      judul: profil,
      profile_key: profil,
      ref_id: profil,
      user_id: userId,
      dibuat_oleh: Number(admin.id),
      insight_cache: null,
      insight_pada: null,
    };
    const { error } = milik
      ? await db.from("sosmed_profile").update(kolom).eq("id", milik.id)
      : await db.from("sosmed_profile").insert(kolom);
    if (error) {
      if (dibuatBaru) await hapusProfilUp(profil).catch(() => {});
      console.error("[tv-anggota] tautkan:", error.message);
      throw new Error("Gagal menyimpan penautan profil.");
    }

    const sink = await sinkronAkunTertaut(db, userId, akun);
    return { sukses: true, profil, user_id: String(userId), dibuat: dibuatBaru, ...sink };
  });
}
