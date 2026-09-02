// GET    /api/tvr/laporan — laporan video sendiri per tanggal
//         ?semua=1&tanggal=…  → rekap semua anggota (HR/atasan/admin)
// POST   /api/tvr/laporan — laporkan satu link video (platform + url)
// DELETE /api/tvr/laporan — hapus laporan sendiri (hari yang sama)
//
// KPI (aturan 31 Agu 2026): 5 video x 6 platform = 30 link/hari,
// KETAT PER PLATFORM — tercapai hanya bila TIAP platform aktif berisi
// minimal 5 link (lihat lib/kpi-video). Platform yang akunnya kena
// banned (tabel tvr_banned, dengan bukti) otomatis dikecualikan.
// Kewajiban DIBEBASKAN bila izin/sakit hari itu disetujui.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { adalahHR } from "@/lib/hr";
import { userDariToken } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { beriKoin } from "@/lib/koin";
import { kirimKabar } from "@/lib/notifikasi";
import { rekonsiliasiKpiOtomatis } from "@/lib/kpi-otomatis";
import {
  bannedAktifPerUser,
  hitungKpi,
  KPI_PER_PLATFORM,
  PLATFORM_KPI,
  targetPerPlatformDari,
} from "@/lib/kpi-video";

export const dynamic = "force-dynamic";

/** Target per platform seorang user: kolom kpi_video, NULL = bawaan 5. */
async function targetKpiUser(userId: number): Promise<number> {
  try {
    const { data } = await supabase()
      .from("app_user")
      .select("kpi_video")
      .eq("id", userId)
      .maybeSingle();
    return targetPerPlatformDari(data?.kpi_video);
  } catch {
    return KPI_PER_PLATFORM;
  }
}

const PLATFORM_SAH = new Set<string>(PLATFORM_KPI);
const BOLEH_LIHAT_SEMUA = new Set(["admin_hr", "super_admin", "master"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

function tanggalWibSekarang(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function tanggalDariQuery(url: URL): string {
  const t = url.searchParams.get("tanggal") ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : tanggalWibSekarang();
}

/** true bila izin/sakit user pada tanggal itu DISETUJUI (KPI bebas). */
async function kpiDibebaskan(userId: number, tanggal: string): Promise<string | null> {
  const { data } = await supabase()
    .from("perizinan")
    .select("jenis")
    .eq("user_id", userId)
    .eq("tanggal_wib", tanggal)
    .eq("status", "disetujui")
    .maybeSingle();
  return data?.jenis ?? null;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const url = new URL(request.url);
    const tanggal = tanggalDariQuery(url);
    const db = supabase();

    // --- Rekap semua anggota (untuk dashboard admin / pemantauan) ---
    if (url.searchParams.get("semua") === "1") {
      if (!BOLEH_LIHAT_SEMUA.has(user.role) && !adalahHR(user)) {
        throw Object.assign(new Error("Hanya admin yang boleh melihat rekap semua anggota."), {
          status: 403,
        });
      }
      const [{ data: baris }, { data: bebas }, { data: targetRows }, bannedPer] =
        await Promise.all([
          db
            .from("laporan_video")
            .select("user_id, platform, app_user(nama)")
            .eq("tanggal_wib", tanggal),
          db
            .from("perizinan")
            .select("user_id, jenis")
            .eq("tanggal_wib", tanggal)
            .eq("status", "disetujui"),
          // Target khusus per akun (spek 3.1) — hanya yang disetel.
          db.from("app_user").select("id, kpi_video").not("kpi_video", "is", null),
          bannedAktifPerUser(),
        ]);
      const targetPer = new Map(
        (targetRows ?? []).map((t) => [Number(t.id), Number(t.kpi_video)]),
      );

      const bebasPer = new Map((bebas ?? []).map((b) => [Number(b.user_id), b.jenis as string]));
      // Hitung PER PLATFORM per orang (aturan ketat 5x6).
      const rekap = new Map<number, { nama: string; per: Map<string, number> }>();
      for (const b of baris ?? []) {
        const id = Number(b.user_id);
        let ada = rekap.get(id);
        if (!ada) {
          const embedded = b.app_user as { nama?: string } | { nama?: string }[] | null;
          const nama = Array.isArray(embedded) ? embedded[0]?.nama : embedded?.nama;
          ada = { nama: nama ?? "", per: new Map() };
          rekap.set(id, ada);
        }
        const p = String(b.platform);
        ada.per.set(p, (ada.per.get(p) ?? 0) + 1);
      }
      return {
        tanggal,
        kpi_target: KPI_PER_PLATFORM * PLATFORM_KPI.length, // 30 bawaan
        data: Array.from(rekap.entries()).map(([user_id, r]) => {
          const kpi = hitungKpi(
            r.per,
            bannedPer.get(user_id) ?? new Set(),
            targetPer.get(user_id) ?? KPI_PER_PLATFORM,
          );
          return {
            user_id: String(user_id),
            nama: r.nama,
            jumlah: kpi.jumlah,
            kpi_target: kpi.target_total,
            tercapai: kpi.tercapai,
            dibebaskan: bebasPer.get(user_id) ?? null,
            per_platform: kpi.per_platform,
          };
        }),
        dibebaskan: Array.from(bebasPer.entries()).map(([user_id, jenis]) => ({
          user_id: String(user_id),
          jenis,
        })),
        // Target khusus (per platform) semua akun yang disetel.
        target_khusus: Array.from(targetPer.entries()).map(([user_id, kpi]) => ({
          user_id: String(user_id),
          kpi,
        })),
      };
    }

    // --- Riwayat 7 hari milik sendiri (grafik perkembangan) ---
    if (url.searchParams.get("riwayat") === "1") {
      const batas = new Date(Date.now() + 7 * 60 * 60 * 1000 - 6 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const { data: baris } = await db
        .from("laporan_video")
        .select("tanggal_wib")
        .eq("user_id", Number(user.id))
        .gte("tanggal_wib", batas);
      const per = new Map<string, number>();
      for (const b of baris ?? []) {
        per.set(b.tanggal_wib, (per.get(b.tanggal_wib) ?? 0) + 1);
      }
      // Tujuh hari penuh dikembalikan (termasuk yang nol) supaya grafik
      // tidak melompati hari kosong dan terlihat lebih bagus dari nyatanya.
      const hariIni = tanggalWibSekarang();
      const riwayat: { tanggal: string; jumlah: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(`${hariIni}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - i);
        const t = d.toISOString().slice(0, 10);
        riwayat.push({ tanggal: t, jumlah: per.get(t) ?? 0 });
      }
      // Garis target di grafik = target TOTAL (per-platform x platform aktif).
      const [tpp, bannedKu] = await Promise.all([
        targetKpiUser(Number(user.id)),
        bannedAktifPerUser([Number(user.id)]),
      ]);
      const aktif = PLATFORM_KPI.length - (bannedKu.get(Number(user.id))?.size ?? 0);
      return { data: riwayat, kpi_target: tpp * aktif };
    }

    // --- Laporan milik sendiri ---
    const [{ data, error }, jenisBebas, targetKu, bannedKu] = await Promise.all([
      db
        .from("laporan_video")
        .select("id, platform, url_video, keyword, tanggal_wib, dibuat_pada")
        .eq("user_id", Number(user.id))
        .eq("tanggal_wib", tanggal)
        .order("id"),
      kpiDibebaskan(Number(user.id), tanggal),
      targetKpiUser(Number(user.id)),
      bannedAktifPerUser([Number(user.id)]),
    ]);
    if (error) {
      console.error("[tvr/laporan] baca:", error.message);
      throw new Error("Gagal memuat laporan video.");
    }
    const daftar = (data ?? []).map((d) => ({ ...d, id: String(d.id) }));

    // Laporan MANUAL yang masih menunggu ACC HR (+ yang ditolak 7 hari
    // terakhir supaya alasannya terbaca) — TIDAK dihitung KPI (2 Sep 2026).
    const batasTolak = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: pending } = await db
      .from("laporan_video_pending")
      .select("id, platform, url_video, keyword, tanggal_wib, dibuat_pada, status, catatan")
      .eq("user_id", Number(user.id))
      .or(`status.eq.menunggu,and(status.eq.ditolak,diputus_pada.gte.${batasTolak})`)
      .order("dibuat_pada", { ascending: false })
      .limit(50);

    // Aturan ketat 5x6: hitung per platform, platform banned dikecualikan.
    const perPlatform = new Map<string, number>();
    for (const d of daftar) {
      perPlatform.set(d.platform, (perPlatform.get(d.platform) ?? 0) + 1);
    }
    const kpi = hitungKpi(perPlatform, bannedKu.get(Number(user.id)) ?? new Set(), targetKu);

    // KPI OTOMATIS: unggahan lewat aplikasi yang URL postingannya sudah
    // terbit dicatat sendiri (hasilnya tampak pada pembukaan berikutnya).
    after(() => rekonsiliasiKpiOtomatis(Number(user.id)));

    return {
      tanggal,
      hari_ini: tanggalWibSekarang(),
      data: daftar,
      menunggu: (pending ?? []).map((d) => ({ ...d, id: String(d.id) })),
      // kpi_target kini TOTAL (per-platform x platform aktif) supaya
      // tampilan "x/target" langsung benar tanpa mengubah pemanggil lama.
      kpi_target: kpi.target_total,
      kpi_tercapai: kpi.tercapai,
      per_platform: kpi.per_platform,
      dibebaskan: jenisBebas,
    };
  });
}

/**
 * Validasi satu link laporan. Mengembalikan URL bersih + platform yang
 * DITEBAK dari host bila pemanggil tidak menyebutkannya (untuk mode
 * tempel-banyak-link). Melempar dengan pesan jelas bila tidak sah.
 */
function validasiLink(platformMentah: string, urlMentah: string): {
  platform: string;
  urlBersih: string;
} {
  const url = (urlMentah ?? "").trim();
  let host = "";
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
  } catch {
    throw Object.assign(new Error("Link video tidak valid."), { status: 400 });
  }
  // Link harus menuju platform video yang dikenal — laporan berisi
  // tautan sembarang hanya mengotori rekap yang dipantau atasan.
  const hostSah =
    /(instagram|tiktok|youtube|youtu\.be|facebook|fb\.watch|threads|twitter|x)\.(com|net|be)$/i.test(
      host,
    ) || /^(youtu\.be|fb\.watch|x\.com)$/i.test(host);
  if (!hostSah) {
    throw Object.assign(
      new Error("Link harus menuju Instagram, TikTok, YouTube, Facebook, Threads, atau X."),
      { status: 400 },
    );
  }

  let platform = (platformMentah ?? "").toLowerCase();
  if (!PLATFORM_SAH.has(platform)) {
    // Tebak dari host — dipakai mode tempel banyak link (spek 3.3),
    // di mana meminta pengguna memilih platform per link merepotkan.
    const h = host.toLowerCase();
    platform = h.includes("instagram")
      ? "instagram"
      : h.includes("tiktok")
        ? "tiktok"
        : h.includes("youtu")
          ? "youtube"
          : h.includes("facebook") || h.includes("fb.watch")
            ? "facebook"
            : h.includes("threads")
              ? "threads"
              : "twitter";
  }

  return {
    platform,
    urlBersih: (/^https?:\/\//i.test(url) ? url : `https://${url}`).slice(0, 500),
  };
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      platform?: string;
      url?: string;
      /** Keyword/tema wajib (fitur 1.22.x/keyword) — kunci pencarian utama */
      keyword?: string;
      /** Mode batch (spek 3.3): banyak link sekaligus */
      banyak?: { platform?: string; url?: string; keyword?: string }[];
    };
    const bersihkanKeyword = (k?: string) => (k ?? "").trim().slice(0, 60) || null;

    await pastikanFiturAktif(user, "tvrku", "TV Rakyat Saya sedang dimatikan untuk peran Anda.");
    const db = supabase();
    const tanggal = tanggalWibSekarang();

    // ALUR BARU (2 Sep 2026): laporan MANUAL lewat link TIDAK langsung
    // dihitung KPI. Ia masuk `laporan_video_pending` (menunggu ACC HR);
    // disetujui → disalin ke laporan_video oleh /api/tvr/persetujuan.
    // Latar belakang: deteksi otomatis kadang luput, jadi jalur manual
    // tetap ada — tapi harus diverifikasi HR supaya tak disalahgunakan.
    async function ajukan(platformMentah: string, urlMentah: string, keywordMentah?: string) {
      const { platform, urlBersih } = validasiLink(platformMentah, urlMentah);
      // Sudah tercatat (otomatis/ACC sebelumnya)? Jangan minta ACC ulang.
      const { data: sudahAda } = await db
        .from("laporan_video")
        .select("id")
        .eq("user_id", Number(user.id))
        .eq("url_video", urlBersih)
        .maybeSingle();
      if (sudahAda) throw Object.assign(new Error("sudah tercatat di KPI Anda"), { status: 409 });
      const { data: sudahMenunggu } = await db
        .from("laporan_video_pending")
        .select("id")
        .eq("user_id", Number(user.id))
        .eq("url_video", urlBersih)
        .eq("status", "menunggu")
        .maybeSingle();
      if (sudahMenunggu) throw Object.assign(new Error("sudah menunggu ACC HR"), { status: 409 });
      const { data, error } = await db
        .from("laporan_video_pending")
        .insert({
          user_id: Number(user.id),
          platform,
          url_video: urlBersih,
          keyword: bersihkanKeyword(keywordMentah),
          tanggal_wib: tanggal,
        })
        .select("id, platform, url_video, keyword, tanggal_wib, dibuat_pada, status")
        .single();
      if (error || !data) throw new Error("gagal tersimpan");
      return { ...data, id: String(data.id) };
    }

    async function kabariHR(jumlah: number) {
      await kirimKabar({
        judul: "Laporan video manual menunggu ACC",
        isi: `${user.nama} mengirim ${jumlah} link video untuk disetujui. Periksa di HR Center → ACC KPI.`,
        kategori: "info",
        jenis_peristiwa: "laporan_video_acc",
        // Ketua Umum (super_admin) SENGAJA tidak dikabari (permintaan 2 Sep 2026).
        untukRole: ["admin_hr", "master"],
      });
    }

    // --- Mode BATCH: banyak link sekali klik (spek 3.3). Tiap link
    //     diproses sendiri supaya satu link jelek tak membatalkan sisanya.
    if (Array.isArray(body.banyak)) {
      const daftar = body.banyak.slice(0, 30); // pagar wajar per kiriman
      if (daftar.length === 0) {
        throw Object.assign(new Error("Tidak ada link untuk disimpan."), { status: 400 });
      }
      const tersimpan: { id: string; platform: string; url_video: string }[] = [];
      const gagal: { url: string; alasan: string }[] = [];
      for (const item of daftar) {
        try {
          const d = await ajukan(item.platform ?? "", item.url ?? "", item.keyword);
          tersimpan.push({ id: d.id, platform: d.platform, url_video: d.url_video });
        } catch (e) {
          gagal.push({
            url: (item.url ?? "").slice(0, 120),
            alasan: e instanceof Error ? e.message : "tidak valid",
          });
        }
      }
      if (tersimpan.length > 0) await kabariHR(tersimpan.length);
      return { sukses: true, menunggu: true, tersimpan, gagal };
    }

    // --- Mode satu link. ---
    const platformDiminta = (body.platform ?? "").toLowerCase();
    if (!PLATFORM_SAH.has(platformDiminta)) {
      throw Object.assign(new Error("Pilih platform tempat video diunggah."), { status: 400 });
    }
    let data;
    try {
      data = await ajukan(platformDiminta, body.url ?? "", body.keyword);
    } catch (e) {
      if (e instanceof Error && (e as { status?: number }).status === 409) {
        throw Object.assign(new Error(`Link ini ${e.message}.`), { status: 409 });
      }
      throw e;
    }
    await kabariHR(1);
    return { sukses: true, menunggu: true, data };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string; pending?: boolean };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Laporan tidak disebutkan."), { status: 400 });

    // Laporan yang masih MENUNGGU ACC boleh ditarik kapan saja oleh pemiliknya.
    if (body.pending) {
      const { data, error } = await supabase()
        .from("laporan_video_pending")
        .delete()
        .eq("id", id)
        .eq("user_id", Number(user.id))
        .eq("status", "menunggu")
        .select("id")
        .maybeSingle();
      if (error) throw new Error("Gagal menarik laporan.");
      if (!data) throw Object.assign(new Error("Laporan tidak ditemukan / sudah diputus."), { status: 400 });
      return { sukses: true };
    }

    // Hanya laporan sendiri dan hanya hari ini — rekap kemarin sudah
    // dibaca atasan, menghapusnya diam-diam mengubah sejarah.
    const { data, error } = await supabase()
      .from("laporan_video")
      .delete()
      .eq("id", id)
      .eq("user_id", Number(user.id))
      .eq("tanggal_wib", tanggalWibSekarang())
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Gagal menghapus laporan.");
    if (!data) {
      throw Object.assign(new Error("Laporan tidak bisa dihapus (bukan milik Anda atau bukan hari ini)."), {
        status: 400,
      });
    }
    return { sukses: true };
  });
}

/**
 * PATCH — perbaiki laporan sendiri (salah tempel link / salah pilih
 * platform). Hanya laporan HARI INI: rekap kemarin sudah dibaca
 * atasan dan tidak boleh berubah diam-diam.
 * Body: { id, platform, url }
 */
export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      platform?: string;
      url?: string;
      /** Cabang KPI (spek 3.1): {user_id, kpi} tanpa id laporan */
      user_id?: string;
      kpi?: number | null;
    };

    // --- Cabang 1: HR/QC/Pengawas menyetel target KPI per akun
    //     (spek 3.1). Sejak aturan 5x6, nilai ini = target PER PLATFORM
    //     (bawaan 5; 0 = bebas KPI). kpi null = kembali ke bawaan. ---
    if (body.user_id != null && body.id == null) {
      if (!BOLEH_LIHAT_SEMUA.has(user.role) && user.role !== "admin_tv" && !adalahHR(user)) {
        throw Object.assign(new Error("Anda tidak berwenang mengatur KPI."), { status: 403 });
      }
      const targetId = Number(body.user_id);
      if (!targetId) throw Object.assign(new Error("Akun tidak disebutkan."), { status: 400 });

      let kpi: number | null = null;
      if (body.kpi != null) {
        const n = Number(body.kpi);
        if (!Number.isInteger(n) || n < 0 || n > 30) {
          throw Object.assign(new Error("KPI harus bilangan bulat 0-30."), { status: 400 });
        }
        kpi = n;
      }

      const { error } = await supabase()
        .from("app_user")
        .update({ kpi_video: kpi })
        .eq("id", targetId);
      if (error) {
        console.error("[tvr/laporan] setel kpi:", error.message);
        throw new Error("Gagal menyimpan KPI.");
      }
      return { sukses: true, kpi_target: kpi ?? KPI_PER_PLATFORM };
    }

    // --- Cabang 2: edit laporan sendiri (perilaku lama). ---
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Laporan tidak disebutkan."), { status: 400 });

    const platform = (body.platform ?? "").toLowerCase();
    if (!PLATFORM_SAH.has(platform)) {
      throw Object.assign(new Error("Pilih platform tempat video diunggah."), { status: 400 });
    }
    const url = (body.url ?? "").trim();
    let host = "";
    try {
      host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
    } catch {
      throw Object.assign(new Error("Link video tidak valid."), { status: 400 });
    }
    const hostSah =
      /(instagram|tiktok|youtube|youtu\.be|facebook|fb\.watch|threads|twitter|x)\.(com|net|be)$/i.test(
        host,
      ) || /^(youtu\.be|fb\.watch|x\.com)$/i.test(host);
    if (!hostSah) {
      throw Object.assign(
        new Error("Link harus menuju Instagram, TikTok, YouTube, Facebook, Threads, atau X."),
        { status: 400 },
      );
    }

    const { data, error } = await supabase()
      .from("laporan_video")
      .update({
        platform,
        url_video: (/^https?:\/\//i.test(url) ? url : `https://${url}`).slice(0, 500),
        keyword: ((body as { keyword?: string }).keyword ?? "").trim().slice(0, 60) || null,
      })
      .eq("id", id)
      .eq("user_id", Number(user.id))
      .eq("tanggal_wib", tanggalWibSekarang())
      .select("id, platform, url_video, keyword, tanggal_wib, dibuat_pada")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        throw Object.assign(new Error("Link ini sudah ada di laporan Anda."), { status: 409 });
      }
      throw new Error("Gagal menyimpan perubahan.");
    }
    if (!data) {
      throw Object.assign(
        new Error("Laporan tidak bisa diubah (bukan milik Anda atau bukan hari ini)."),
        { status: 400 },
      );
    }
    return { sukses: true, data: { ...data, id: String(data.id) } };
  });
}
