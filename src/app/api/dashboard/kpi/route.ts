// GET /api/dashboard/kpi — data sub-dashboard "KPI Anggota"
// (fitur 1.19/3.3.b). BACA-SAJA: satu endpoint menyuplai semua
// kebutuhan layar supaya tidak perlu melonggarkan banyak endpoint.
//
// ?tanggal=YYYY-MM-DD  → anggap "hari itu" (bawaan: hari ini WIB)
// ?user=<id>           → detail satu anggota: riwayat video 7 hari
//
// Akses: HR (admin_hr/super_admin/master) ATAU jabatan yang diberi
// master akses dashboard "kpi".
//
// Jumlah video dihitung dari VIEW v_app_video_harian_user (agregat
// di database — laporan mentah bisa melebihi cap 1000 baris PostgREST).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";

export const dynamic = "force-dynamic";

const HR = new Set(["master", "super_admin", "admin_hr"]);
// Selaras dengan KPI_VIDEO_HARIAN di /api/tvr/laporan.
const TARGET_BAWAAN = 5;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function tanggalWibSekarang(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Tanggal `mundur` hari sebelum `tanggal` (aritmetika UTC aman). */
function tanggalMundur(tanggal: string, mundur: number): string {
  const t = new Date(`${tanggal}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - mundur);
  return t.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!HR.has(user.role) && !(await bolehDashboard(user.role, "kpi"))) {
      throw Object.assign(
        new Error("Jabatan Anda tidak punya akses dashboard KPI."),
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const qTanggal = url.searchParams.get("tanggal") ?? "";
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(qTanggal) ? qTanggal : tanggalWibSekarang();
    const db = supabase();

    // --- Detail satu anggota: riwayat 7 hari (dipanggil dari modal) ---
    const qUser = url.searchParams.get("user");
    if (qUser) {
      const id = Number(qUser);
      if (!Number.isFinite(id)) {
        throw Object.assign(new Error("Anggota tidak dikenal."), { status: 400 });
      }
      const awal = tanggalMundur(tanggal, 6);
      const { data } = await db
        .from("v_app_video_harian_user")
        .select("tanggal_wib, jumlah")
        .eq("user_id", id)
        .gte("tanggal_wib", awal)
        .lte("tanggal_wib", tanggal);
      const per = new Map((data ?? []).map((b) => [String(b.tanggal_wib), Number(b.jumlah)]));
      // Tujuh hari penuh (termasuk nol) supaya grafiknya tidak melompat.
      const riwayat: { tanggal: string; jumlah: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const t = tanggalMundur(tanggal, i);
        riwayat.push({ tanggal: t, jumlah: per.get(t) ?? 0 });
      }
      return { riwayat };
    }

    // --- Data utama: roster + video hari itu + tren + rencana besar ---
    const awalTren = tanggalMundur(tanggal, 6);
    const [
      { data: roster },
      { data: videoHariItu },
      { data: tren },
      { data: bebas },
      { data: rencana },
    ] = await Promise.all([
      db
        .from("app_user")
        .select("id, nama, avatar_url, divisi, kpi_video")
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("role", "master")
        .limit(500),
      db
        .from("v_app_video_harian_user")
        .select("user_id, jumlah")
        .eq("tanggal_wib", tanggal),
      db
        .from("v_app_video_harian")
        .select("tanggal_wib, jumlah")
        .gte("tanggal_wib", awalTren)
        .lte("tanggal_wib", tanggal),
      db
        .from("perizinan")
        .select("user_id, jenis")
        .eq("tanggal_wib", tanggal)
        .eq("status", "disetujui"),
      db
        .from("kpi_tugas")
        .select(
          "id, judul, deskripsi, divisi, tanggal_mulai, tenggat, prioritas, target_indikator, untuk_semua, status, progress, catatan_progress",
        )
        .order("tenggat", { ascending: true })
        .limit(300),
    ]);

    const videoPer = new Map(
      (videoHariItu ?? []).map((b) => [Number(b.user_id), Number(b.jumlah)]),
    );
    const bebasPer = new Map(
      (bebas ?? []).map((b) => [Number(b.user_id), String(b.jenis)]),
    );

    const anggota = (roster ?? []).map((u) => {
      const target =
        u.kpi_video != null && Number.isFinite(Number(u.kpi_video))
          ? Number(u.kpi_video)
          : TARGET_BAWAAN;
      const jumlah = videoPer.get(Number(u.id)) ?? 0;
      return {
        id: String(u.id),
        nama: u.nama as string,
        avatar_url: (u.avatar_url as string) ?? "",
        divisi: (u.divisi as string) ?? "",
        jumlah,
        target,
        tercapai: jumlah >= target,
        dibebaskan: bebasPer.get(Number(u.id)) ?? null,
      };
    });

    const trenPer = new Map(
      (tren ?? []).map((b) => [String(b.tanggal_wib), Number(b.jumlah)]),
    );
    const tren7: { tanggal: string; jumlah: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const t = tanggalMundur(tanggal, i);
      tren7.push({ tanggal: t, jumlah: trenPer.get(t) ?? 0 });
    }

    return {
      tanggal,
      target_bawaan: TARGET_BAWAAN,
      anggota,
      tren: tren7,
      rencana: (rencana ?? []).map((k) => ({ ...k, id: String(k.id) })),
    };
  });
}
