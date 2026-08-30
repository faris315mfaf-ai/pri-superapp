// POST /api/analisis/ayrshare — ANALISIS ULANG QC berbasis data Ayrshare
// (tanpa scraping TikHub, tanpa n8n). Tombol "Mulai Analisis" di layar QC.
//
// Logika intinya kini ada di lib/analisis-ayrshare (dipakai bersama jalur
// OTOMATIS: sinkronisasi konten TV Rakyat). Route ini hanya menjaga
// wewenang + memanggil mesinnya, lalu membersihkan komentar kedaluwarsa.
//
// Hanya menjangkau akun wajib yang TERTAUT di profil Ayrshare
// (mis. tvrakyat.official). Akun wajib lain tetap lewat pipeline n8n.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { adalahHR } from "@/lib/hr";
import { userDariToken } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { bersihkanKomentarKedaluwarsa } from "@/lib/qc-komentar";
import { ayrshareSiap } from "@/lib/ayrshare";
import { jalankanAnalisisAyrshare, kumpulkanAkunTertaut } from "@/lib/analisis-ayrshare";

export const dynamic = "force-dynamic";
// Banyak panggilan Ayrshare beruntun; beri napas lebih panjang.
export const maxDuration = 120;

const BOLEH = new Set(["master", "super_admin", "admin_hr"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/**
 * GET /api/analisis/ayrshare — CAKUPAN saja, tanpa menjalankan apa pun.
 *
 * Dipakai layar QC untuk menampilkan DINAMIS akun wajib mana yang sudah
 * bisa dibaca lewat Ayrshare dan mana yang belum. ?riwayat=1 → riwayat
 * kapan komentar terakhir diperbarui.
 */
export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!BOLEH.has(user.role) && !adalahHR(user)) {
      throw Object.assign(new Error("Hanya pengurus QC yang boleh melihat cakupan."), {
        status: 403,
      });
    }

    if (new URL(request.url).searchParams.get("riwayat") === "1") {
      const { data } = await supabase()
        .from("qc_analisis_riwayat")
        .select("id, dijalankan_pada, periode, sumber, postingan, komentar, comply, gagal_cek, selesai")
        .order("dijalankan_pada", { ascending: false })
        .limit(30);
      return {
        riwayat: (data ?? []).map((r) => ({
          id: String(r.id),
          dijalankan_pada: r.dijalankan_pada,
          periode: r.periode,
          sumber: r.sumber,
          postingan: r.postingan,
          komentar: r.komentar,
          comply: r.comply,
          gagal_cek: r.gagal_cek,
          selesai: r.selesai === true,
        })),
      };
    }

    if (!ayrshareSiap()) return { siap: false, tercakup: [], terlewat: [] };

    const { data: akunWajib } = await supabase()
      .from("akun_wajib")
      .select("username, platform")
      .eq("aktif", true);

    const semuaTertaut = await kumpulkanAkunTertaut();
    if (semuaTertaut.length === 0) {
      return { siap: false, tercakup: [], terlewat: [] };
    }

    const cocok = (a: { username: string; platform: string }) =>
      semuaTertaut.some(
        (t) => t.platform === a.platform && t.username === a.username.toLowerCase(),
      );

    return {
      siap: true,
      tercakup: (akunWajib ?? []).filter(cocok),
      terlewat: (akunWajib ?? []).filter((a) => !cocok(a)),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!BOLEH.has(user.role) && !adalahHR(user)) {
      throw Object.assign(new Error("Hanya pengurus QC yang boleh menjalankan analisis."), {
        status: 403,
      });
    }
    await pastikanFiturAktif(user, "qc.analisis", "Fitur analisis sedang dimatikan untuk peran Anda.");
    if (!ayrshareSiap()) {
      throw Object.assign(new Error("Ayrshare belum diatur (AYRSHARE_API_KEY kosong)."), {
        status: 503,
      });
    }

    const hasil = await jalankanAnalisisAyrshare({ olehUserId: Number(user.id) });
    // Retensi: komentar > 2 hari dibersihkan oportunistik (tanpa cron).
    after(bersihkanKomentarKedaluwarsa);
    return hasil;
  });
}
