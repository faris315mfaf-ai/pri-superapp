// GET /api/tv-nasional/analisis?rentang=7|30|90|semua[&platform=][&akun=<user_id>|<platform>]
//
// ANALISIS VIDEO (29 Sep 2026) — ringkasan seluruh katalog video akun
// yang tersambung ke upload-post: tren, perbandingan platform, akun
// terbaik, jam posting terbaik, video teratas. Lihat lib/analisis-video.
//
// Hanya MEMBACA katalog (tidak memanggil upload-post). Katalog dibaca
// utuh paling sering sekali per 30 menit, dan hanya bila ada yang membuka.
//
// Akses: jabatan TV Rakyat Nasional, Pimpinan Redaksi, master.
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred, adalahTvrNasional } from "@/lib/jabatan";
import { platformApp } from "@/lib/metrik-video-up";
import { DAFTAR_RENTANG, type Rentang } from "@/lib/analisis-video";
import { katalogAnalisis, tampilanAnalisis } from "@/lib/analisis-video-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    if (!adalahTvrNasional(user) && !adalahPimred(user)) {
      throw Object.assign(new Error("Hanya jabatan TV Rakyat Nasional & Pimpinan Redaksi yang bisa membuka analisis ini."), {
        status: 403,
      });
    }
    const url = new URL(request.url);
    const r = url.searchParams.get("rentang") ?? "30";
    const rentang: Rentang = (DAFTAR_RENTANG as string[]).includes(r) ? (r as Rentang) : "30";
    const platform = platformApp(url.searchParams.get("platform") ?? "");
    const akunMentah = (url.searchParams.get("akun") ?? "").trim();
    const akun = /^\d+\|[a-z]+$/.test(akunMentah) ? akunMentah : "";

    const { katalog, menyusun } = await katalogAnalisis(20_000);
    if (!katalog) return { menyusun: true as const };

    const t = await tampilanAnalisis(katalog, { rentang, platform, akun });
    const idPerlu = new Set<number>([
      ...t.akun_teratas.map((a) => Number(a.user_id)),
      ...t.video_teratas.map((v) => Number(v.user_id)),
      ...(akun ? [Number(akun.split("|")[0])] : []),
    ]);
    const nama: Record<string, string> = {};
    for (const id of idPerlu) {
      const n = katalog.nama.get(id);
      if (n) nama[String(id)] = n;
    }
    return {
      menyusun,
      dimuat_pada: new Date(katalog.dimuat).toISOString(),
      katalog: { video: katalog.baris.length },
      nama,
      ...t,
    };
  });
}
