// GET /api/dashboard/ringkas — 4 angka ringkasan dashboard utama
// (permintaan 1 Sep 2026): Kepatuhan Komen QC, Absensi hari ini,
// KPI Kerja (laporan kerja), dan KPI Video 5x6. Satu endpoint satu
// tembakan supaya kartu ringkasan tidak menembak 4 API terpisah
// tiap 30 detik (kartu ini ikut penyegaran otomatis).
//
// Akses: pengurus / Divisi HR / jabatan yang diberi akses dashboard
// apa pun oleh master — sama dengan siapa yang melihat dashboard.
import { waktuAmbilKomentarTerakhir } from "@/lib/kepatuhan";
import { semuaBarisData } from "@/lib/semua-baris";
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { adalahPengurus, userDariToken } from "@/lib/sesi";
import { adalahHR } from "@/lib/hr";
import { aksesDashboardRole } from "@/lib/dashboard-akses";
import { periodeSaatIni } from "@/lib/periode-qc";
import {
  bannedAktifPerUser,
  hitungKpi,
  targetPerPlatformDari,
} from "@/lib/kpi-video";

export const dynamic = "force-dynamic";

/** Cache mikro per-instance (lihat catatan di dalam GET). */
let hasilCache: { isi: Record<string, unknown>; pada: number } | null = null;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** Tanggal hari ini menurut WIB (bukan zona server). */
function tanggalWibSekarang(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (
      !adalahPengurus(user.role) &&
      !adalahHR(user) &&
      (await aksesDashboardRole(user)).length === 0
    ) {
      throw Object.assign(new Error("Jabatan Anda tidak punya akses dashboard."), {
        status: 403,
      });
    }

    // Cache mikro per-instance (persiapan lonjakan, 1 Sep 2026): angka
    // ringkasan sama untuk semua pengurus — 6 query cukup sekali per
    // 20 dtk per instance, bukan setiap penyegaran layar.
    if (hasilCache && Date.now() - hasilCache.pada < 20_000) {
      return hasilCache.isi;
    }

    const db = supabase();
    const periode = periodeSaatIni();
    const tanggal = tanggalWibSekarang();

    const [rKepatuhan, rAbsen, rRoster, rKerja, rVideo, bannedPer] = await Promise.all([
      // 1. Kepatuhan komen periode QC berjalan — view per kader
      //    (total & sudah per orang, <=200 baris, aman dari cap 1000).
      db.from("v_app_kepatuhan_kader").select("total, sudah").eq("periode", periode),
      // 2. Absensi hari ini (yang penting kehadiran = jenis "masuk").
      db
        .from("absensi")
        .select("user_id, jenis")
        .eq("tanggal_wib", tanggal)
        .limit(2000),
      // Roster aktif — penyebut absensi/kerja/video.
      db
        .from("app_user")
        .select("id, kpi_video")
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("role", "master")
        .limit(500),
      // 3. KPI kerja hari ini — view harian per orang.
      db
        .from("v_kerja_kpi")
        .select("user_id, kpi_persen")
        .eq("tanggal_wib", tanggal)
        .limit(1000),
      // 4. Laporan video hari ini (aturan 5x6 per platform).
      //    Anti-batas-1000 (2 Sep 2026): dibaca per halaman.
      semuaBarisData((a, b) =>
        db
          .from("laporan_video")
          .select("user_id, platform")
          .eq("tanggal_wib", tanggal)
          .range(a, b),
      ),
      bannedAktifPerUser(),
    ]);
    const kepatuhan = pastikanSukses(rKepatuhan, "kepatuhan komen") as {
      total: unknown;
      sudah: unknown;
    }[];
    const absen = pastikanSukses(rAbsen, "absensi") as {
      user_id: unknown;
      jenis: string;
    }[];
    const roster = pastikanSukses(rRoster, "roster") as {
      id: unknown;
      kpi_video: unknown;
    }[];
    const kerja = pastikanSukses(rKerja, "kpi kerja") as { kpi_persen: unknown }[];
    const video = pastikanSukses(rVideo, "laporan video") as {
      user_id: unknown;
      platform: unknown;
    }[];

    // --- 1. Kepatuhan komen: % (orang x postingan) + kader yang aktif ---
    const barisQc = kepatuhan;
    const komenDiperbarui = await waktuAmbilKomentarTerakhir(periode);
    const totalUnit = barisQc.reduce((a, b) => a + Number(b.total ?? 0), 0);
    const sudahUnit = barisQc.reduce((a, b) => a + Number(b.sudah ?? 0), 0);
    const kaderAktifKomen = barisQc.filter((b) => Number(b.sudah ?? 0) > 0).length;

    // --- 2. Absensi: orang unik yang sudah absen masuk hari ini ---
    const hadir = new Set(
      absen.filter((a) => a.jenis === "masuk").map((a) => Number(a.user_id)),
    );
    const totalAnggota = roster.length;

    // --- 3. KPI kerja: yang sudah menyusun rencana/laporan + rata skor ---
    const barisKerja = kerja;
    const rataKerja =
      barisKerja.length > 0
        ? Math.round(
            barisKerja.reduce((a, b) => a + Number(b.kpi_persen ?? 0), 0) /
              barisKerja.length,
          )
        : 0;

    // --- 4. KPI video: berapa anggota yang SUDAH memenuhi target 5x6
    //        hari ini (target per orang menghormati kpi_video & banned) ---
    const perUser = new Map<number, Map<string, number>>();
    for (const v of video) {
      const id = Number(v.user_id);
      const m = perUser.get(id) ?? new Map<string, number>();
      m.set(String(v.platform), (m.get(String(v.platform)) ?? 0) + 1);
      perUser.set(id, m);
    }
    let videoTercapai = 0;
    let totalVideoHariIni = 0;
    for (const u of roster) {
      const id = Number(u.id);
      const jumlah = perUser.get(id) ?? new Map<string, number>();
      const hasil = hitungKpi(
        jumlah,
        bannedPer.get(id) ?? new Set(),
        targetPerPlatformDari(u.kpi_video),
      );
      if (hasil.tercapai && hasil.target_total > 0) videoTercapai++;
      totalVideoHariIni += hasil.jumlah;
    }

    const isi = {
      periode,
      tanggal,
      komen: {
        persen: totalUnit > 0 ? Math.round((sudahUnit / totalUnit) * 100) : 0,
        kader_aktif: kaderAktifKomen,
        total_kader: barisQc.length,
        diperbarui: komenDiperbarui,
      },
      absensi: { hadir: hadir.size, total: totalAnggota },
      kerja: { sudah_lapor: barisKerja.length, total: totalAnggota, rata: rataKerja },
      video: {
        tercapai: videoTercapai,
        total: totalAnggota,
        video_hari_ini: totalVideoHariIni,
      },
    };
    hasilCache = { isi, pada: Date.now() };
    return isi;
  });
}
