// GET /api/berita/hasil — SEMUA hasil scraping berita + STATUS tiap item
// (fitur 1.22.x/5-bug): sudah dijadikan tugas? penanggung jawab siapa?
// videonya sudah dibuat / sudah tayang? Dipakai panel "Hasil Scraping".
//
// Status diturunkan dengan mencocokkan berita.link_video → tugas_link.url
// → (video_kode) → video_antrian.status. Read-only, khusus tim TV/Pimred.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehProsesVideo } from "@/types";
import { adalahPimred } from "@/lib/jabatan";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    if (!bolehProsesVideo(user.role) && !adalahPimred(user)) {
      throw Object.assign(new Error("Hanya tim TV Rakyat/Pimred."), { status: 403 });
    }
    const db = supabase();

    const { data: berita } = await db
      .from("berita")
      .select("kode, judul, sumber, platform_asal, sumber_akun, link_video, thumbnail_url, jenis, dipakai, waktu_terbit")
      .order("waktu_terbit", { ascending: false })
      .limit(200);
    const daftar = berita ?? [];
    const urls = daftar.map((b) => b.link_video).filter(Boolean) as string[];

    // Tugas yang sumbernya salah satu berita (dicocokkan lewat url).
    const petaTugas = new Map<
      string,
      { status: string; video_kode: string | null; penanggung: string }
    >();
    if (urls.length > 0) {
      const { data: tugas } = await db
        .from("tugas_link")
        .select("url, status, video_kode, app_user:app_user!tugas_link_untuk_fkey(nama, nama_panggilan)")
        .in("url", urls);
      for (const t of tugas ?? []) {
        const u = Array.isArray(t.app_user) ? t.app_user[0] : t.app_user;
        petaTugas.set(String(t.url), {
          status: String(t.status),
          video_kode: (t.video_kode as string) ?? null,
          penanggung: (u?.nama_panggilan || u?.nama || "") as string,
        });
      }
    }

    // Status video untuk tugas yang sudah punya video_kode.
    const kodeVideo = [...petaTugas.values()].map((t) => t.video_kode).filter(Boolean) as string[];
    const petaVideo = new Map<string, string>();
    if (kodeVideo.length > 0) {
      const { data: vid } = await db
        .from("video_antrian")
        .select("kode, status")
        .in("kode", kodeVideo);
      for (const v of vid ?? []) petaVideo.set(String(v.kode), String(v.status));
    }

    const data = daftar.map((b) => {
      const tugas = b.link_video ? petaTugas.get(String(b.link_video)) : undefined;
      const statusVideo = tugas?.video_kode ? petaVideo.get(tugas.video_kode) : undefined;
      // Tahap terjauh yang tercapai untuk berita ini.
      let tahap: "baru" | "ditugaskan" | "video_dibuat" | "tayang" = "baru";
      if (statusVideo === "SUDAH DIPROSES") tahap = "tayang";
      else if (tugas?.video_kode) tahap = "video_dibuat";
      else if (tugas) tahap = "ditugaskan";
      else if (b.dipakai) tahap = "ditugaskan";
      return {
        kode: b.kode,
        judul: b.judul,
        sumber: b.sumber,
        platform: b.platform_asal,
        sumber_akun: b.sumber_akun,
        link: b.link_video,
        thumbnail_url: b.thumbnail_url,
        jenis: b.jenis,
        waktu_terbit: b.waktu_terbit,
        tahap,
        penanggung: tugas?.penanggung ?? "",
        status_tugas: tugas?.status ?? null,
      };
    });

    return { data };
  });
}
