// GET /api/dashboard/peringkat?hari=7|30 — papan peringkat SELURUH
// pengguna aktif, 4 kategori sekaligus (baca-saja):
//
//  - komen   : % kewajiban komentar akun wajib yang terpenuhi (rekap QC)
//  - video   : % tugas interaksi video TV Rakyat (komen+share) yang
//              ditandai selesai atas video yang tayang pada jendela itu
//  - absensi : % hari hadir (pembagi = hari yang ADA absensinya di
//              jendela — hari libur/sebelum sistem jalan tidak menghukum)
//  - kpi     : % capaian laporan video vs target total (aturan 5x6;
//              platform banned dikecualikan)
//
// Skor 0-100; urutan skor desc → detail desc → nama. Peringkat 1 emas,
// 2 perak, 3 perunggu di layar. Akses: siapa pun yang punya >= 1
// sub-dashboard (atau HR/master/super) — konsisten dengan tab Dashboard.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { aksesDashboardRole } from "@/lib/dashboard-akses";
import { adalahHR } from "@/lib/hr";
import {
  bannedAktifPerUser,
  hitungKpi,
  KPI_PER_PLATFORM,
  targetPerPlatformDari,
} from "@/lib/kpi-video";
import { labelPeriodeUntukTanggal } from "@/lib/periode-qc";

export const dynamic = "force-dynamic";

const HR = new Set(["master", "super_admin", "admin_hr"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function tanggalWibSekarang(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function tanggalMundur(tanggal: string, mundur: number): string {
  const t = new Date(`${tanggal}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - mundur);
  return t.toISOString().slice(0, 10);
}

type BarisPeringkat = {
  id: string;
  nama: string;
  avatar_url: string;
  divisi: string;
  /** Skor 0-100 (persentase kepatuhan kategori itu) */
  skor: number;
  /** Keterangan singkat, mis. "42/60 kewajiban" */
  detail: string;
};

function urutkan(daftar: BarisPeringkat[]): BarisPeringkat[] {
  return daftar.sort((a, b) => b.skor - a.skor || a.nama.localeCompare(b.nama));
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (
      !HR.has(user.role) &&
      !adalahHR(user) &&
      (await aksesDashboardRole(user)).length === 0
    ) {
      throw Object.assign(new Error("Jabatan Anda tidak punya akses dashboard."), {
        status: 403,
      });
    }

    const url = new URL(request.url);
    const hari = url.searchParams.get("hari") === "30" ? 30 : 7;
    const hariIni = tanggalWibSekarang();
    const awal = tanggalMundur(hariIni, hari - 1);
    const db = supabase();

    // Jendela QC 17:00-16:59 (31 Agu 2026) + label lama utk riwayat.
    const daftarPeriode: string[] = [];
    for (let i = hari - 1; i >= 0; i--) {
      daftarPeriode.push(...labelPeriodeUntukTanggal(tanggalMundur(hariIni, i)));
    }

    const [
      { data: roster },
      { data: komenAgg },
      { data: videoTayang },
      { data: interaksi },
      { data: absen },
      { data: laporan },
      bannedPer,
      { data: targetRows },
    ] = await Promise.all([
      db
        .from("app_user")
        .select("id, nama, avatar_url, divisi")
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("role", "master")
        .limit(500),
      // Kategori KOMEN: agregat per kader per periode (view DB).
      db
        .from("v_app_kepatuhan_kader")
        .select("nama_kader, periode, total, sudah")
        .in("periode", daftarPeriode)
        .range(0, 9999),
      // Kategori VIDEO: video resmi yang tayang pada jendela.
      db
        .from("video_antrian")
        .select("kode")
        .eq("status", "SUDAH DIPROSES")
        .gte("diunggah_pada", `${awal}T00:00:00+07:00`)
        .limit(1000),
      db
        .from("interaksi_video")
        .select("user_id, video_kode, jenis")
        .gte("pada", `${awal}T00:00:00+07:00`)
        .range(0, 9999),
      // Kategori ABSENSI: hari hadir per user.
      db
        .from("absensi")
        .select("user_id, tanggal_wib")
        .eq("jenis", "masuk")
        .gte("tanggal_wib", awal)
        .lte("tanggal_wib", hariIni)
        .range(0, 9999),
      // Kategori KPI: laporan video per platform per hari.
      db
        .from("laporan_video")
        .select("user_id, platform, tanggal_wib")
        .gte("tanggal_wib", awal)
        .lte("tanggal_wib", hariIni)
        .range(0, 19999),
      bannedAktifPerUser(),
      db.from("app_user").select("id, kpi_video").not("kpi_video", "is", null),
    ]);

    const orang = (roster ?? []).map((u) => ({
      id: String(u.id),
      nama: String(u.nama),
      avatar_url: String(u.avatar_url ?? ""),
      divisi: String(u.divisi ?? ""),
    }));
    const targetPer = new Map(
      (targetRows ?? []).map((t) => [Number(t.id), Number(t.kpi_video)]),
    );

    // ---- KOMEN: sum(sudah)/sum(total) per nama_kader ----
    const komenPer = new Map<string, { total: number; sudah: number }>();
    for (const b of komenAgg ?? []) {
      const nama = String(b.nama_kader);
      const ada = komenPer.get(nama) ?? { total: 0, sudah: 0 };
      ada.total += Number(b.total) || 0;
      ada.sudah += Number(b.sudah) || 0;
      komenPer.set(nama, ada);
    }
    const komen = urutkan(
      orang.map((o) => {
        const d = komenPer.get(o.nama) ?? { total: 0, sudah: 0 };
        return {
          ...o,
          skor: d.total > 0 ? Math.round((d.sudah / d.total) * 100) : 0,
          detail: `${d.sudah}/${d.total} kewajiban komen`,
        };
      }),
    );

    // ---- VIDEO: interaksi (komen+share) atas video tayang jendela ini ----
    const kodeTayang = new Set((videoTayang ?? []).map((v) => String(v.kode)));
    const wajibPerOrang = kodeTayang.size * 2; // komen + share per video
    const interaksiPer = new Map<number, number>();
    for (const b of interaksi ?? []) {
      if (!kodeTayang.has(String(b.video_kode))) continue;
      if (b.jenis !== "komen" && b.jenis !== "share") continue;
      const id = Number(b.user_id);
      interaksiPer.set(id, (interaksiPer.get(id) ?? 0) + 1);
    }
    const video = urutkan(
      orang.map((o) => {
        const selesai = Math.min(interaksiPer.get(Number(o.id)) ?? 0, wajibPerOrang);
        return {
          ...o,
          skor: wajibPerOrang > 0 ? Math.round((selesai / wajibPerOrang) * 100) : 0,
          detail: `${selesai}/${wajibPerOrang} tugas video`,
        };
      }),
    );

    // ---- ABSENSI: hari hadir / hari kerja terpantau ----
    const hariAdaAbsen = new Set<string>();
    const hadirPer = new Map<number, Set<string>>();
    for (const b of absen ?? []) {
      const t = String(b.tanggal_wib);
      hariAdaAbsen.add(t);
      const id = Number(b.user_id);
      const set = hadirPer.get(id) ?? new Set<string>();
      set.add(t);
      hadirPer.set(id, set);
    }
    const hariKerja = hariAdaAbsen.size;
    const absensi = urutkan(
      orang.map((o) => {
        const hadir = hadirPer.get(Number(o.id))?.size ?? 0;
        return {
          ...o,
          skor: hariKerja > 0 ? Math.round((hadir / hariKerja) * 100) : 0,
          detail: `${hadir}/${hariKerja} hari hadir`,
        };
      }),
    );

    // ---- KPI: total laporan / (target_total x hari), plafon 100 ----
    const laporanPer = new Map<number, Map<string, number>>(); // user → platform → n
    for (const b of laporan ?? []) {
      const id = Number(b.user_id);
      let per = laporanPer.get(id);
      if (!per) laporanPer.set(id, (per = new Map()));
      const p = String(b.platform);
      per.set(p, (per.get(p) ?? 0) + 1);
    }
    const kpi = urutkan(
      orang.map((o) => {
        const id = Number(o.id);
        const hasil = hitungKpi(
          laporanPer.get(id) ?? new Map(),
          bannedPer.get(id) ?? new Set(),
          targetPer.get(id) ?? KPI_PER_PLATFORM,
        );
        const targetJendela = hasil.target_total * hari;
        return {
          ...o,
          skor:
            targetJendela > 0
              ? Math.min(100, Math.round((hasil.jumlah / targetJendela) * 100))
              : 100, // target 0 = dibebaskan penuh
          detail: `${hasil.jumlah}/${targetJendela} link video`,
        };
      }),
    );

    return { hari, komen, video, absensi, kpi };
  });
}
