// GET /api/tv-nasional/kenaikan?rentang=hari_ini|kemarin|minggu|bulan|semua
//
// Angka KENAIKAN nasional TV Rakyat — bukan totalnya. Dipakai panel
// paling atas modul TV Rakyat Nasional.
//
// Yang boleh membuka: pemegang jabatan TV Rakyat Nasional, Pimpinan
// Redaksi, dan master. Angka ini gabungan seluruh akun anggota — bukan
// bahan yang pantas dibuka untuk siapa saja.
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred, adalahTvrNasional } from "@/lib/jabatan";
import { hitungKenaikan, rentangSah, RENTANG_KENAIKAN } from "@/lib/tvr-nasional";

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
      throw Object.assign(
        new Error("Hanya jabatan TV Rakyat Nasional & Pimpinan Redaksi yang bisa membuka angka ini."),
        { status: 403 },
      );
    }
    const rentang = rentangSah(new URL(request.url).searchParams.get("rentang"));
    const hasil = await hitungKenaikan(rentang);
    return {
      ...hasil,
      // Daftar pilihan ikut dikirim supaya panel tidak perlu menyalin
      // definisi rentang — satu tempat saja yang menentukannya.
      pilihan: RENTANG_KENAIKAN.map((r) => ({ kunci: r.kunci, label: r.label })),
    };
  });
}
