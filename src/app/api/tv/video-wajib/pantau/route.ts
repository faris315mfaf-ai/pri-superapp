// GET /api/tv/video-wajib/pantau?id=<perintah>&tanggal=YYYY-MM-DD
//
// Lembar "Pantau" video wajib (15 Okt 2026): siapa yang sudah memposting
// perintah ini pada tanggal itu — per anggota, per platform, per wilayah,
// plus grafik 7 hari. Dihitung dari catatan yang sudah ada (unggahan &
// laporan bernomor perintah): TIDAK memanggil platform mana pun.
//
// Akses: yang berwenang atas TV Rakyat (sama dengan menerbitkan perintah).
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehKelolaTvr } from "@/lib/tv-tim";
import {
  catatanPosting,
  hitungKepatuhan,
  muatPerintah,
  roster,
  tanggalTerbit,
  tujuhHari,
} from "@/lib/video-wajib-pantau";
import { geserTanggal, tanggalSah, tanggalWibWajib } from "@/lib/video-wajib-perintah";

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
    if (!(await bolehKelolaTvr(user))) {
      throw Object.assign(new Error("Hanya tim TV Rakyat & pimpinan yang boleh memantau video wajib."), { status: 403 });
    }
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id") ?? 0);
    if (!Number.isFinite(id) || id <= 0) throw Object.assign(new Error("id perintah tidak sah."), { status: 400 });
    const perintah = await muatPerintah(id);
    if (!perintah) throw Object.assign(new Error("Perintah tidak ditemukan."), { status: 404 });

    const hariIni = tanggalWibWajib(Date.now());
    const terbit = tanggalTerbit(perintah);
    let tanggal = tanggalSah(url.searchParams.get("tanggal")) ?? hariIni;
    // Tanggal di luar rentang perintah dijepit: sebelum terbit tidak ada kewajiban, masa depan belum ada data.
    if (tanggal > hariIni) tanggal = hariIni;
    if (terbit && tanggal < terbit) tanggal = terbit;

    const [anggota, { siap, catatan }] = await Promise.all([roster(), catatanPosting(id)]);
    const { daftar, ringkas } = hitungKepatuhan(perintah, tanggal, anggota, catatan);
    return {
      perintah,
      tanggal,
      hari_ini: hariIni,
      kemarin: geserTanggal(hariIni, -1),
      terbit,
      /** false = sql/76 belum dijalankan: angka pasti nol, bukan kelalaian anggota. */
      siap,
      ringkas,
      daftar,
      tujuh_hari: tujuhHari(perintah, tanggal, anggota, catatan),
    };
  });
}
