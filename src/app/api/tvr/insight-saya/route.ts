// GET /api/tvr/insight-saya — analitik akun sosmed PRIBADI anggota
// (profil upload-post miliknya): pengikut/tayangan/dll per platform,
// seperti insight TV Rakyat Official tapi untuk akunnya sendiri.
//
// ?paksa=1 → abaikan cache (tarik langsung dari upload-post).
// Cache 15 menit per profil di sosmed_profile.insight_cache — analitik
// enam platform butuh beberapa detik; tanpa cache tiap buka layar
// membakar kuota API.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { analitikProfilUp, uploadPostSiap } from "@/lib/upload-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TTL_MENIT = 15;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!uploadPostSiap()) return { siap: false, profil: null, insight: null };

    const db = supabase();
    const { data: profil } = await db
      .from("sosmed_profile")
      .select("id, profile_key, insight_cache, insight_pada")
      .eq("jenis", "pengguna")
      .eq("penyedia", "upload-post")
      .eq("user_id", Number(user.id))
      .maybeSingle();
    if (!profil) return { siap: true, profil: null, insight: null };

    const paksa = new URL(request.url).searchParams.get("paksa") === "1";
    const umurMenit = profil.insight_pada
      ? (Date.now() - new Date(profil.insight_pada as string).getTime()) / 60_000
      : Infinity;

    let insight = profil.insight_cache as Record<string, unknown> | null;
    let diperbarui = (profil.insight_pada as string) ?? null;
    if (paksa || !insight || umurMenit >= TTL_MENIT) {
      insight = await analitikProfilUp(profil.profile_key as string);
      diperbarui = new Date().toISOString();
      await db
        .from("sosmed_profile")
        .update({ insight_cache: insight, insight_pada: diperbarui })
        .eq("id", profil.id);
    }

    return {
      siap: true,
      profil: profil.profile_key as string,
      insight,
      diperbarui_pada: diperbarui,
    };
  });
}
