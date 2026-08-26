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
import { userDariToken } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";

export const dynamic = "force-dynamic";

const KPI_VIDEO_HARIAN = 5;

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
      if (!BOLEH_LIHAT_SEMUA.has(user.role)) {
        throw Object.assign(new Error("Hanya admin yang boleh melihat rekap semua anggota."), {
          status: 403,
        });
      }
      const [{ data: baris }, { data: bebas }] = await Promise.all([
        db
          .from("laporan_video")
          .select("user_id, platform, app_user(nama)")
          .eq("tanggal_wib", tanggal),
        db
          .from("perizinan")
          .select("user_id, jenis")
          .eq("tanggal_wib", tanggal)
          .eq("status", "disetujui"),
      ]);

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
        data: Array.from(rekap.entries()).map(([user_id, r]) => ({
          user_id: String(user_id),
          nama: r.nama,
          jumlah: r.jumlah,
          tercapai: r.jumlah >= KPI_VIDEO_HARIAN,
          dibebaskan: bebasPer.get(user_id) ?? null,
        })),
        dibebaskan: Array.from(bebasPer.entries()).map(([user_id, jenis]) => ({
          user_id: String(user_id),
          jenis,
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
      return { data: riwayat, kpi_target: KPI_VIDEO_HARIAN };
    }

    // --- Laporan milik sendiri ---
    const [{ data, error }, jenisBebas] = await Promise.all([
      db
        .from("laporan_video")
        .select("id, platform, url_video, tanggal_wib, dibuat_pada")
        .eq("user_id", Number(user.id))
        .eq("tanggal_wib", tanggal)
        .order("id"),
      kpiDibebaskan(Number(user.id), tanggal),
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
      kpi_target: KPI_VIDEO_HARIAN,
      kpi_tercapai: daftar.length >= KPI_VIDEO_HARIAN,
      dibebaskan: jenisBebas,
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      platform?: string;
      url?: string;
    };

    await pastikanFiturAktif(user, "tvrku", "TV Rakyat Saya sedang dimatikan untuk peran Anda.");

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

    const urlBersih = (/^https?:\/\//i.test(url) ? url : `https://${url}`).slice(0, 500);
    const { data, error } = await supabase()
      .from("laporan_video")
      .insert({
        user_id: Number(user.id),
        platform,
        url_video: urlBersih,
        tanggal_wib: tanggalWibSekarang(),
      })
      .select("id, platform, url_video, tanggal_wib, dibuat_pada")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw Object.assign(new Error("Link ini sudah pernah Anda laporkan."), { status: 409 });
      }
      console.error("[tvr/laporan] tambah:", error.message);
      throw new Error("Gagal menyimpan laporan.");
    }
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
    };
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
      })
      .eq("id", id)
      .eq("user_id", Number(user.id))
      .eq("tanggal_wib", tanggalWibSekarang())
      .select("id, platform, url_video, tanggal_wib, dibuat_pada")
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
