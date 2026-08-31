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
import { analitikProfilUp, daftarProfilUp, uploadPostSiap } from "@/lib/upload-post";

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
    if (!PENGATUR.has(user.role) && !(await bolehDashboard(user.role, "tv"))) {
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

    return {
      siap: true,
      kuota,
      paket,
      terpakai: diUp.length,
      profil: daftar.sort((a, b) => b.tertaut - a.tertaut || a.nama.localeCompare(b.nama)),
    };
  });
}
