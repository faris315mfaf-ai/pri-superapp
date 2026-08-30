// GET /api/tv/wajib-komen — daftar postingan yang WAJIB dikomentari kader
// hari ini + status komentar SAYA (terverifikasi dari rekap QC).
//
// Sumbernya `postingan` periode hari ini (semua akun wajib, termasuk TV
// Rakyat yang di-scrape Ayrshare) DIGABUNG dengan `rekap` milik pemanggil.
// Postingan yang baru terdaftar (belum sempat dicek komentarnya) otomatis
// tampil "belum" — benar, karena memang belum ada yang komentar.
//
// Beda dari kartu "Video Baru TV Rakyat" (interaksi_video, laporan-diri):
// di sini status "sudah komentar" DIVERIFIKASI dari komentar asli (rekap),
// bukan sekadar tombol yang ditandai sendiri.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { periodeHariIni } from "@/lib/analisis-ayrshare";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });

    const db = supabase();
    const periode = periodeHariIni();

    // Postingan periode ini + rekap SAYA (dua query, digabung di sini —
    // klien Supabase tak menggabung tabel yang tak berelasi FK).
    const [{ data: posts }, { data: rekap }] = await Promise.all([
      db
        .from("postingan")
        .select(
          "id_postingan, platform, akun_wajib, url_postingan, caption_asli, thumbnail_url, waktu_posting",
        )
        .eq("periode", periode)
        .not("url_postingan", "is", null)
        .neq("url_postingan", "")
        .order("waktu_posting", { ascending: false })
        .limit(40),
      db
        .from("rekap")
        .select("id_postingan, status")
        .eq("periode", periode)
        .eq("nama_kader", user.nama),
    ]);

    // id_postingan yang komentar SAYA-nya sudah ketemu (Comply).
    const sudahSet = new Set(
      (rekap ?? [])
        .filter((r) => r.status === "Comply")
        .map((r) => String(r.id_postingan)),
    );

    const data = (posts ?? []).map((p) => ({
      id_postingan: String(p.id_postingan),
      platform: String(p.platform ?? ""),
      akun: String(p.akun_wajib ?? ""),
      url: String(p.url_postingan ?? ""),
      caption: String(p.caption_asli ?? ""),
      thumbnail: String(p.thumbnail_url ?? ""),
      waktu_posting: (p.waktu_posting as string) ?? null,
      sudah_komentar: sudahSet.has(String(p.id_postingan)),
    }));

    // Yang BELUM dulu (itu yang perlu dikerjakan), lalu terbaru.
    data.sort((a, b) => {
      if (a.sudah_komentar !== b.sudah_komentar) return a.sudah_komentar ? 1 : -1;
      return (b.waktu_posting ?? "").localeCompare(a.waktu_posting ?? "");
    });

    return {
      periode,
      belum: data.filter((d) => !d.sudah_komentar).length,
      data,
    };
  });
}
