// GET /api/dashboard/kpi — data sub-dashboard "KPI Anggota"
// (fitur 1.19/3.3.b). BACA-SAJA: satu endpoint menyuplai semua
// kebutuhan layar supaya tidak perlu melonggarkan banyak endpoint.
//
// ?tanggal=YYYY-MM-DD  → anggap "hari itu" (bawaan: hari ini WIB)
// ?user=<id>           → detail satu anggota: riwayat 7 hari + SEMUA
//                        link video jendela itu (untuk embed) + rincian
//                        per platform + platform banned
// ?cek=1&user=<id>     → periksa hidup/matinya link anggota (deteksi
//                        link bodong via oEmbed — YouTube/TikTok/X pasti;
//                        IG/FB/Threads tak bisa dicek robot → "tak_terverifikasi")
// ?tren=30             → tren 30 hari: total video/hari + % anggota
//                        tercapai/hari + rincian per platform/hari
//
// Akses: HR (admin_hr/super_admin/master) ATAU jabatan yang diberi
// master akses dashboard "kpi".
//
// Aturan KPI 31 Agu 2026: KETAT PER PLATFORM (5 video x 6 platform;
// platform banned dikecualikan) — lihat lib/kpi-video.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";
import { adalahHR } from "@/lib/hr";
import {
  bannedAktifPerUser,
  hitungKpi,
  KPI_PER_PLATFORM,
  PLATFORM_KPI,
  targetPerPlatformDari,
} from "@/lib/kpi-video";

export const dynamic = "force-dynamic";
// Cabang ?cek=1 memeriksa sampai 40 link ke situs luar (oEmbed).
export const maxDuration = 60;

const HR = new Set(["master", "super_admin", "admin_hr"]);

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

/**
 * Cek satu link video hidup/mati lewat oEmbed publik.
 * - youtube/tiktok/twitter: jawaban 200 = hidup; 400/404 = BODONG.
 * - instagram/facebook/threads: platform menolak pengecekan robot →
 *   "tak_terverifikasi" (JUJUR: kita tidak menuduh tanpa bukti).
 */
async function cekLink(platform: string, url: string): Promise<"hidup" | "bodong" | "tak_terverifikasi"> {
  const oembed =
    platform === "youtube"
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
      : platform === "tiktok"
        ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
        : platform === "twitter"
          ? `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`
          : null;
  if (!oembed) return "tak_terverifikasi";
  try {
    const res = await fetch(oembed, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (res.ok) return "hidup";
    // 400/404 = konten tidak ada → bodong. Status lain (429/5xx) =
    // layanan sedang rewel, bukan bukti link mati.
    return res.status === 404 || res.status === 400 ? "bodong" : "tak_terverifikasi";
  } catch {
    return "tak_terverifikasi";
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!HR.has(user.role) && !adalahHR(user) && !(await bolehDashboard(user, "kpi"))) {
      throw Object.assign(
        new Error("Jabatan Anda tidak punya akses dashboard KPI."),
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const qTanggal = url.searchParams.get("tanggal") ?? "";
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(qTanggal) ? qTanggal : tanggalWibSekarang();
    const db = supabase();

    // --- Cek link bodong milik satu anggota (jendela 7 hari) ---
    if (url.searchParams.get("cek") === "1") {
      const id = Number(url.searchParams.get("user"));
      if (!Number.isFinite(id) || !id) {
        throw Object.assign(new Error("Anggota tidak dikenal."), { status: 400 });
      }
      const awal = tanggalMundur(tanggal, 6);
      const { data } = await db
        .from("laporan_video")
        .select("id, platform, url_video")
        .eq("user_id", id)
        .gte("tanggal_wib", awal)
        .lte("tanggal_wib", tanggal)
        .order("id", { ascending: false })
        .limit(40); // pagar biaya: maksimal 40 pemeriksaan sekali jalan
      const hasil = await Promise.all(
        (data ?? []).map(async (b) => ({
          id: String(b.id),
          status: await cekLink(String(b.platform), String(b.url_video)),
        })),
      );
      return { data: hasil };
    }

    // --- Detail satu anggota: riwayat 7 hari + link video + platform ---
    const qUser = url.searchParams.get("user");
    if (qUser) {
      const id = Number(qUser);
      if (!Number.isFinite(id)) {
        throw Object.assign(new Error("Anggota tidak dikenal."), { status: 400 });
      }
      const awal = tanggalMundur(tanggal, 6);
      const [{ data }, { data: links }, bannedPer, { data: akun }] = await Promise.all([
        db
          .from("v_app_video_harian_user")
          .select("tanggal_wib, jumlah")
          .eq("user_id", id)
          .gte("tanggal_wib", awal)
          .lte("tanggal_wib", tanggal),
        // SEMUA link jendela 7 hari — untuk daftar embed di modal.
        db
          .from("laporan_video")
          .select("id, platform, url_video, keyword, tanggal_wib")
          .eq("user_id", id)
          .gte("tanggal_wib", awal)
          .lte("tanggal_wib", tanggal)
          .order("id", { ascending: false })
          .limit(250),
        bannedAktifPerUser([id]),
        db.from("app_user").select("kpi_video").eq("id", id).maybeSingle(),
      ]);
      const per = new Map((data ?? []).map((b) => [String(b.tanggal_wib), Number(b.jumlah)]));
      // Tujuh hari penuh (termasuk nol) supaya grafiknya tidak melompat.
      const riwayat: { tanggal: string; jumlah: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const t = tanggalMundur(tanggal, i);
        riwayat.push({ tanggal: t, jumlah: per.get(t) ?? 0 });
      }
      // Rincian per platform untuk TANGGAL terpilih (aturan 5x6).
      const perPlatform = new Map<string, number>();
      for (const l of links ?? []) {
        if (l.tanggal_wib === tanggal) {
          perPlatform.set(l.platform, (perPlatform.get(l.platform) ?? 0) + 1);
        }
      }
      const kpi = hitungKpi(
        perPlatform,
        bannedPer.get(id) ?? new Set(),
        targetPerPlatformDari(akun?.kpi_video),
      );
      return {
        riwayat,
        links: (links ?? []).map((l) => ({ ...l, id: String(l.id) })),
        per_platform: kpi.per_platform,
        target_total: kpi.target_total,
        tercapai: kpi.tercapai,
        banned: [...(bannedPer.get(id) ?? [])],
      };
    }

    // --- Tren 30 hari: total/hari + % tercapai/hari + per platform ---
    if (url.searchParams.get("tren") === "30") {
      const awal = tanggalMundur(tanggal, 29);
      const [{ data: baris }, { data: roster }, bannedPer, { data: targetRows }] =
        await Promise.all([
          db
            .from("laporan_video")
            .select("user_id, platform, tanggal_wib")
            .gte("tanggal_wib", awal)
            .lte("tanggal_wib", tanggal)
            .range(0, 19999),
          db
            .from("app_user")
            .select("id")
            .eq("aktif", true)
            .eq("status", "aktif")
            .neq("role", "master")
            .limit(500),
          bannedAktifPerUser(),
          db.from("app_user").select("id, kpi_video").not("kpi_video", "is", null),
        ]);
      const targetPer = new Map(
        (targetRows ?? []).map((t) => [Number(t.id), Number(t.kpi_video)]),
      );
      const totalAnggota = (roster ?? []).length || 1;

      // tanggal → user → platform → jumlah
      const perHari = new Map<string, Map<number, Map<string, number>>>();
      const platformHari = new Map<string, Map<string, number>>();
      for (const b of baris ?? []) {
        const t = String(b.tanggal_wib);
        const uid = Number(b.user_id);
        const p = String(b.platform);
        let perUser = perHari.get(t);
        if (!perUser) perHari.set(t, (perUser = new Map()));
        let perP = perUser.get(uid);
        if (!perP) perUser.set(uid, (perP = new Map()));
        perP.set(p, (perP.get(p) ?? 0) + 1);
        let ph = platformHari.get(t);
        if (!ph) platformHari.set(t, (ph = new Map()));
        ph.set(p, (ph.get(p) ?? 0) + 1);
      }

      const tren: {
        tanggal: string;
        total: number;
        persen_tercapai: number;
        per_platform: Record<string, number>;
      }[] = [];
      for (let i = 29; i >= 0; i--) {
        const t = tanggalMundur(tanggal, i);
        const perUser = perHari.get(t) ?? new Map<number, Map<string, number>>();
        let total = 0;
        let capai = 0;
        for (const [uid, perP] of perUser) {
          const kpi = hitungKpi(
            perP,
            bannedPer.get(uid) ?? new Set(),
            targetPer.get(uid) ?? KPI_PER_PLATFORM,
          );
          total += kpi.jumlah;
          if (kpi.tercapai) capai += 1;
        }
        const ph = platformHari.get(t) ?? new Map<string, number>();
        tren.push({
          tanggal: t,
          total,
          persen_tercapai: Math.round((capai / totalAnggota) * 100),
          per_platform: Object.fromEntries(
            PLATFORM_KPI.map((p) => [p, ph.get(p) ?? 0]),
          ),
        });
      }
      return { tren };
    }

    // --- Data utama: roster + laporan hari itu (per platform) + tren ---
    const awalTren = tanggalMundur(tanggal, 6);
    const [
      { data: roster },
      { data: laporanHariItu },
      { data: tren },
      { data: bebas },
      { data: rencana },
      bannedPer,
    ] = await Promise.all([
      db
        .from("app_user")
        .select("id, nama, avatar_url, divisi, kpi_video")
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("role", "master")
        .limit(500),
      // Baris mentah hari itu (~ratusan) — perlu kolom platform untuk
      // aturan 5x6; view agregat tidak memuat platform.
      db
        .from("laporan_video")
        .select("user_id, platform")
        .eq("tanggal_wib", tanggal)
        .range(0, 4999),
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
      bannedAktifPerUser(),
    ]);

    const perUserPlatform = new Map<number, Map<string, number>>();
    for (const b of laporanHariItu ?? []) {
      const uid = Number(b.user_id);
      let perP = perUserPlatform.get(uid);
      if (!perP) perUserPlatform.set(uid, (perP = new Map()));
      const p = String(b.platform);
      perP.set(p, (perP.get(p) ?? 0) + 1);
    }
    const bebasPer = new Map(
      (bebas ?? []).map((b) => [Number(b.user_id), String(b.jenis)]),
    );

    const anggota = (roster ?? []).map((u) => {
      const kpi = hitungKpi(
        perUserPlatform.get(Number(u.id)) ?? new Map(),
        bannedPer.get(Number(u.id)) ?? new Set(),
        targetPerPlatformDari(u.kpi_video),
      );
      return {
        id: String(u.id),
        nama: u.nama as string,
        avatar_url: (u.avatar_url as string) ?? "",
        divisi: (u.divisi as string) ?? "",
        jumlah: kpi.jumlah,
        // target = TOTAL (per-platform x platform aktif) — kolom Target
        // dan % di tabel langsung benar tanpa mengubah komponennya.
        target: kpi.target_total,
        tercapai: kpi.tercapai,
        dibebaskan: bebasPer.get(Number(u.id)) ?? null,
        banned: [...(bannedPer.get(Number(u.id)) ?? [])],
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
      target_bawaan: KPI_PER_PLATFORM * PLATFORM_KPI.length, // 30
      anggota,
      tren: tren7,
      rencana: (rencana ?? []).map((k) => ({ ...k, id: String(k.id) })),
    };
  });
}
