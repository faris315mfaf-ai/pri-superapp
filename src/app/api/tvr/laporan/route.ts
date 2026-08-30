// GET    /api/tvr/laporan — laporan video sendiri per tanggal
//         ?semua=1&tanggal=…  → rekap semua anggota (HR/atasan/admin)
// POST   /api/tvr/laporan — laporkan satu link video (platform + url)
// DELETE /api/tvr/laporan — hapus laporan sendiri (hari yang sama)
//
// KPI: minimal 5 video per anggota per hari. Kewajiban ini DIBEBASKAN
// bila pengajuan izin/sakit anggota untuk hari itu sudah disetujui —
// orang sakit tidak ditagih video.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { adalahHR } from "@/lib/hr";
import { userDariToken } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { beriKoin } from "@/lib/koin";

export const dynamic = "force-dynamic";

// Bawaan 5 video/hari; per akun bisa disetel HR/QC/Pengawas lewat
// kolom app_user.kpi_video (spek 3.1) — mis. diturunkan saat suspend.
const KPI_VIDEO_HARIAN = 5;

/** Target KPI seorang user: kolom kpi_video, NULL = bawaan. */
async function targetKpiUser(userId: number): Promise<number> {
  try {
    const { data } = await supabase()
      .from("app_user")
      .select("kpi_video")
      .eq("id", userId)
      .maybeSingle();
    const n = Number(data?.kpi_video);
    return Number.isFinite(n) && data?.kpi_video != null ? n : KPI_VIDEO_HARIAN;
  } catch {
    return KPI_VIDEO_HARIAN;
  }
}

const PLATFORM_SAH = new Set([
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
  "twitter",
]);
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
      const [{ data: baris }, { data: bebas }, { data: targetRows }] = await Promise.all([
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
      ]);
      const targetPer = new Map(
        (targetRows ?? []).map((t) => [Number(t.id), Number(t.kpi_video)]),
      );

      const bebasPer = new Map((bebas ?? []).map((b) => [Number(b.user_id), b.jenis as string]));
      const rekap = new Map<number, { nama: string; jumlah: number }>();
      for (const b of baris ?? []) {
        const id = Number(b.user_id);
        const ada = rekap.get(id);
        if (ada) ada.jumlah += 1;
        else {
          const embedded = b.app_user as { nama?: string } | { nama?: string }[] | null;
          const nama = Array.isArray(embedded) ? embedded[0]?.nama : embedded?.nama;
          rekap.set(id, { nama: nama ?? "", jumlah: 1 });
        }
      }
      return {
        tanggal,
        kpi_target: KPI_VIDEO_HARIAN,
        data: Array.from(rekap.entries()).map(([user_id, r]) => {
          const target = targetPer.get(user_id) ?? KPI_VIDEO_HARIAN;
          return {
            user_id: String(user_id),
            nama: r.nama,
            jumlah: r.jumlah,
            kpi_target: target,
            tercapai: r.jumlah >= target,
            dibebaskan: bebasPer.get(user_id) ?? null,
          };
        }),
        dibebaskan: Array.from(bebasPer.entries()).map(([user_id, jenis]) => ({
          user_id: String(user_id),
          jenis,
        })),
        // Target khusus SEMUA akun yang disetel (termasuk yang belum
        // melapor hari ini) — dipakai UI untuk menampilkan x/target.
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
      return { data: riwayat, kpi_target: await targetKpiUser(Number(user.id)) };
    }

    // --- Laporan milik sendiri ---
    const [{ data, error }, jenisBebas, targetKu] = await Promise.all([
      db
        .from("laporan_video")
        .select("id, platform, url_video, keyword, tanggal_wib, dibuat_pada")
        .eq("user_id", Number(user.id))
        .eq("tanggal_wib", tanggal)
        .order("id"),
      kpiDibebaskan(Number(user.id), tanggal),
      targetKpiUser(Number(user.id)),
    ]);
    if (error) {
      console.error("[tvr/laporan] baca:", error.message);
      throw new Error("Gagal memuat laporan video.");
    }
    const daftar = (data ?? []).map((d) => ({ ...d, id: String(d.id) }));
    return {
      tanggal,
      hari_ini: tanggalWibSekarang(),
      data: daftar,
      kpi_target: targetKu,
      kpi_tercapai: daftar.length >= targetKu,
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

    // --- Mode BATCH: simpan banyak link sekali klik (spek 3.3). ---
    // Tiap link diproses sendiri-sendiri supaya satu link jelek tidak
    // membatalkan seluruh kiriman; hasil per link dilaporkan balik.
    if (Array.isArray(body.banyak)) {
      const daftar = body.banyak.slice(0, 30); // pagar wajar per kiriman
      if (daftar.length === 0) {
        throw Object.assign(new Error("Tidak ada link untuk disimpan."), { status: 400 });
      }
      const tersimpan: { id: string; platform: string; url_video: string }[] = [];
      const gagal: { url: string; alasan: string }[] = [];
      for (const item of daftar) {
        try {
          const { platform, urlBersih } = validasiLink(item.platform ?? "", item.url ?? "");
          const { data, error } = await db
            .from("laporan_video")
            .insert({
              user_id: Number(user.id),
              platform,
              url_video: urlBersih,
              keyword: bersihkanKeyword(item.keyword),
              tanggal_wib: tanggal,
            })
            .select("id, platform, url_video, keyword")
            .single();
          if (error) {
            gagal.push({
              url: (item.url ?? "").slice(0, 120),
              alasan: error.code === "23505" ? "sudah pernah dilaporkan" : "gagal tersimpan",
            });
          } else {
            tersimpan.push({ ...data, id: String(data.id) });
            // Koin laporan video (spek 1.16) — referensi id laporan.
            await beriKoin(Number(user.id), "laporan_video", `laporan-${data.id}`);
          }
        } catch (e) {
          gagal.push({
            url: (item.url ?? "").slice(0, 120),
            alasan: e instanceof Error ? e.message : "tidak valid",
          });
        }
      }
      return { sukses: true, tersimpan, gagal };
    }

    // --- Mode satu link (cara lama tetap ada). ---
    const platformDiminta = (body.platform ?? "").toLowerCase();
    if (!PLATFORM_SAH.has(platformDiminta)) {
      throw Object.assign(new Error("Pilih platform tempat video diunggah."), { status: 400 });
    }
    const { platform, urlBersih } = validasiLink(platformDiminta, body.url ?? "");
    const { data, error } = await db
      .from("laporan_video")
      .insert({
        user_id: Number(user.id),
        platform,
        url_video: urlBersih,
        keyword: bersihkanKeyword(body.keyword),
        tanggal_wib: tanggal,
      })
      .select("id, platform, url_video, keyword, tanggal_wib, dibuat_pada")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw Object.assign(new Error("Link ini sudah pernah Anda laporkan."), { status: 409 });
      }
      console.error("[tvr/laporan] tambah:", error.message);
      throw new Error("Gagal menyimpan laporan.");
    }
    await beriKoin(Number(user.id), "laporan_video", `laporan-${data.id}`);
    return { sukses: true, data: { ...data, id: String(data.id) } };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Laporan tidak disebutkan."), { status: 400 });

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
    //     (spek 3.1). Dibedakan dari edit laporan lewat adanya user_id
    //     tanpa id laporan. kpi null = kembali ke bawaan 5. ---
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
      return { sukses: true, kpi_target: kpi ?? KPI_VIDEO_HARIAN };
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
