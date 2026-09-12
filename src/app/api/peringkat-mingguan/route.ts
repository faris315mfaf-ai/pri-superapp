// GET /api/peringkat-mingguan?metrik=laporan|pengikut
//
// TOP MINGGUAN (12 Sep 2026): siapa yang NAIK paling banyak pekan ini
// (Senin–Minggu WIB) dibanding rentang yang sama pekan lalu.
//
//   • laporan  — jumlah laporan video per orang (laporan_video).
//                Sejarahnya sudah ada, jadi langsung terisi.
//   • pengikut — total pengikut per orang dari rekaman harian (sql/48).
//                Baru bermakna setelah rekamannya terkumpul; sebelum itu
//                jawabannya berkata terus terang, bukan menampilkan nol.
//
// Hitungannya di lib/peringkat-mingguan (murni, teruji); rute ini hanya
// membaca dan menyusun.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { PERAN_TERSEMBUNYI } from "@/lib/peran";
import { semuaBaris } from "@/lib/semua-baris";
import {
  jendelaMingguan,
  kenaikanDariKejadian,
  kenaikanDariRekaman,
  type BarisKenaikan,
} from "@/lib/peringkat-mingguan";

export const dynamic = "force-dynamic";

const MAKS_TAMPIL = 50;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    const metrik = new URL(request.url).searchParams.get("metrik") === "pengikut" ? "pengikut" : "laporan";
    const j = jendelaMingguan();
    const db = supabase();

    let baris: BarisKenaikan[] = [];
    let catatan = "";
    let tersedia = true;

    if (metrik === "laporan") {
      const kejadian = await semuaBaris<{ user_id: unknown; tanggal_wib: unknown }>(
        (dari, sampai) =>
          db
            .from("laporan_video")
            .select("user_id, tanggal_wib")
            .gte("tanggal_wib", j.lalu.dari)
            .lte("tanggal_wib", j.ini.sampai)
            .range(dari, sampai) as unknown as PromiseLike<{
              data: { user_id: unknown; tanggal_wib: unknown }[] | null;
              error: { message: string } | null;
            }>,
        30_000,
      );
      baris = kenaikanDariKejadian(
        kejadian.map((k) => ({ user_id: String(k.user_id), tanggal_wib: String(k.tanggal_wib) })),
        j,
      );
      catatan = `Laporan video ${j.ini.dari} s.d. ${j.ini.sampai}, dibanding ${j.lalu.dari} s.d. ${j.lalu.sampai}.`;
    } else {
      const rekaman = await semuaBaris<{ user_id: unknown; tanggal_wib: unknown; pengikut: unknown }>(
        (dari, sampai) =>
          db
            .from("tvr_metrik_anggota_harian")
            .select("user_id, tanggal_wib, pengikut")
            .gte("tanggal_wib", j.akhir_dua_pekan_lalu)
            .lte("tanggal_wib", j.ini.sampai)
            .range(dari, sampai) as unknown as PromiseLike<{
              data: { user_id: unknown; tanggal_wib: unknown; pengikut: unknown }[] | null;
              error: { message: string } | null;
            }>,
        50_000,
      );
      const hasil = kenaikanDariRekaman(
        rekaman.map((r) => ({
          user_id: String(r.user_id),
          tanggal_wib: String(r.tanggal_wib),
          nilai: Number(r.pengikut ?? 0),
        })),
        j,
      );
      baris = hasil.baris;
      if (!hasil.ada_rekaman) {
        tersedia = false;
        catatan = "Rekaman pengikut harian belum ada. Angka pekan ini mulai terisi setelah rekaman berjalan beberapa hari.";
      } else if (baris.length === 0) {
        tersedia = false;
        catatan = `Rekaman baru dimulai — belum ada pembanding dari akhir pekan lalu (${j.akhir_pekan_lalu}).`;
      } else {
        catatan = `Pengikut sekarang dibanding rekaman akhir pekan lalu (${j.akhir_pekan_lalu}).`;
      }
    }

    // Nama & avatar; akun tersembunyi/nonaktif disaring.
    const ids = [...new Set(baris.map((b) => Number(b.user_id)).filter((n) => n > 0))];
    const orang = new Map<string, { nama: string; avatar_url: string; role: string; aktif: boolean }>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db
        .from("app_user")
        .select("id, nama, avatar_url, role, aktif")
        .in("id", ids.slice(i, i + 300));
      for (const u of data ?? []) {
        orang.set(String(u.id), {
          nama: String(u.nama ?? ""),
          avatar_url: String(u.avatar_url ?? ""),
          role: String(u.role ?? ""),
          aktif: u.aktif !== false,
        });
      }
    }
    const tersembunyi = new Set<string>(PERAN_TERSEMBUNYI);
    const daftar = baris
      .filter((b) => {
        const o = orang.get(b.user_id);
        return o && o.aktif && !tersembunyi.has(o.role);
      })
      .map((b, i) => ({
        peringkat: i + 1,
        user_id: b.user_id,
        nama: orang.get(b.user_id)?.nama ?? "",
        avatar_url: orang.get(b.user_id)?.avatar_url ?? "",
        ini: b.ini,
        lalu: b.lalu,
        naik: b.naik,
      }));

    return {
      metrik,
      tersedia,
      catatan,
      jendela: { ini: j.ini, lalu: j.lalu, hari_ke: j.hari_ke },
      daftar: daftar.slice(0, MAKS_TAMPIL),
      jumlah: daftar.length,
      saya: daftar.find((d) => d.user_id === String(user.id)) ?? null,
    };
  });
}
