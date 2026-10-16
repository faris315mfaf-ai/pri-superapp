// GET /api/analisis/riwayat — riwayat KAPAN komentar QC terakhir diperbarui
// (fitur 1.22.x/3-perbaikan), BACA-SAJA.
//
// 16 Okt 2026: dipindah dari /api/analisis/ayrshare?riwayat=1 saat Ayrshare
// dihapus. Pemeriksaan komentar otomatis sudah dimatikan (upload-post tidak
// punya API komentar), jadi tabel qc_analisis_riwayat tidak bertambah dari
// jalur otomatis lagi — baris lama (sumber 'ayrshare' / 'ayrshare-otomatis')
// tetap disajikan sebagai sejarah.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { adalahHR } from "@/lib/hr";
import { userDariToken } from "@/lib/sesi";

export const dynamic = "force-dynamic";

const BOLEH = new Set(["master", "super_admin", "admin_hr"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!BOLEH.has(user.role) && !adalahHR(user)) {
      throw Object.assign(new Error("Hanya pengurus QC yang boleh melihat riwayat."), { status: 403 });
    }
    const { data } = await supabase()
      .from("qc_analisis_riwayat")
      .select("id, dijalankan_pada, periode, sumber, postingan, komentar, comply, gagal_cek, selesai")
      .order("dijalankan_pada", { ascending: false })
      .limit(30);
    return {
      // Penanda untuk layar: tidak ada pembaruan komentar otomatis lagi.
      komentar_otomatis: false,
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
  });
}
