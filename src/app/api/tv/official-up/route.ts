// PENAUTAN AKUN TV RAKYAT OFFICIAL KE UPLOAD-POST (7 Okt 2026).
//
// GET  /api/tv/official-up              → { profil, akun, perlu_ulang }
// POST /api/tv/official-up {platform?}  → { url } halaman penautan (48 jam)
//
// Profil upload-post "tvrakyat-official" dibuat saat pertama kali tim
// menekan "Tautkan", lalu disimpan di pengaturan_sistem
// (upload_post_profil_official) — galeri Konten (/api/konten/galeri)
// otomatis memakai profil ini untuk video Official terbaru. Hanya untuk
// yang berhak unggah ke akun Official (lib/tv-tim).
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehUploadVideo } from "@/lib/tv-tim";
import { buatProfilUp, daftarProfilUp, statusAkunUp, tautanHubungkanUp, uploadPostSiap } from "@/lib/upload-post";
import { catatAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const KUNCI = "upload_post_profil_official";
const PROFIL_BAWAAN = "tvrakyat-official";
const PLATFORM_BOLEH = new Set(["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"]);

async function profilTersimpan(): Promise<string> {
  const { data } = await supabase().from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI).maybeSingle();
  return String(data?.nilai ?? "").trim();
}

async function pastikanBerhak(request: Request) {
  const user = await pastikanMasuk(request);
  if (!(await bolehUploadVideo(user))) {
    throw Object.assign(new Error("Hanya tim yang berhak mengunggah ke akun TV Rakyat Official."), { status: 403 });
  }
  if (!uploadPostSiap()) throw Object.assign(new Error("upload-post belum diatur di server."), { status: 503 });
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanBerhak(request);
    const profil = await profilTersimpan();
    if (!profil) return { profil: "", akun: {}, perlu_ulang: [] };
    const { akun, perluUlang } = await statusAkunUp(profil);
    return { profil, akun, perlu_ulang: perluUlang };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanBerhak(request);
    const body = (await request.json().catch(() => ({}))) as { platform?: string };
    const platform = String(body.platform ?? "").toLowerCase();

    let profil = await profilTersimpan();
    if (!profil) {
      profil = PROFIL_BAWAAN;
      const { profil: semua } = await daftarProfilUp();
      if (!semua.some((p) => p.username === profil)) await buatProfilUp(profil);
      const { error } = await supabase()
        .from("pengaturan_sistem")
        .upsert({ kunci: KUNCI, nilai: profil, diubah_pada: new Date().toISOString() }, { onConflict: "kunci" });
      if (error) throw new Error("Profil Official gagal disimpan.");
    }

    const url = await tautanHubungkanUp(profil, PLATFORM_BOLEH.has(platform) ? [platform] : undefined);
    catatAudit(user.id, "tv_official_up", "Membuka penautan akun TV Rakyat Official ke upload-post", {
      request,
      detail: { profil, platform: platform || "semua" },
    });
    return { url };
  });
}
