// POST /api/tv-nasional/kategori-segar { kategori }
//
// Tombol "Tarik Sekarang" di halaman Insight per Kategori (25 Sep 2026):
// menarik angka video kategori itu dari upload-post SAAT ITU JUGA,
// sepotong demi sepotong (maks ±15 permintaan per panggilan). Layar
// memanggil berulang sampai `sisa` nol atau `direm` — sisanya tetap
// diperbarui otomatis oleh penyegar harian (/api/cron/metrik-video).
//
// Video yang angkanya < 6 jam dilewati; jatah tombol manual dibagi untuk
// semua orang (20 permintaan / 5 menit) supaya kuota upload-post tetap
// cukup untuk unggahan & rekonsiliasi KPI anggota.
//
// Akses: jabatan TV Rakyat Nasional, Pimpinan Redaksi, master.
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred, adalahTvrNasional } from "@/lib/jabatan";
import { polaPersis } from "@/lib/insight-kategori";
import { segarkanKategori } from "@/lib/segar-metrik-video";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    if (!adalahTvrNasional(user) && !adalahPimred(user)) {
      throw Object.assign(
        new Error("Hanya jabatan TV Rakyat Nasional & Pimpinan Redaksi yang bisa menarik data kategori."),
        { status: 403 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as { kategori?: string };
    const kategori = String(body.kategori ?? "").trim().slice(0, 120);
    if (!kategori) throw Object.assign(new Error("Sebutkan kategorinya."), { status: 400 });
    return segarkanKategori(kategori, polaPersis(kategori));
  });
}
