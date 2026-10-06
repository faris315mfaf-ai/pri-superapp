// RIWAYAT VIDEO TV RAKYAT OFFICIAL (7 Okt 2026, sql/65).
//
// GET   /api/tv/riwayat?halaman=1&saring=gagal
//   → { data: RiwayatTv[], ada_lagi, perlu_manual }
//   Tiap video: siapa yang mengedit, mengirim, memposting + hasil per
//   platform. `perlu_manual` = jumlah video yang gagal tayang (sebagian/
//   seluruhnya) dan belum ditangani — angka lencana notifikasi.
// PATCH /api/tv/riwayat { kode } → tandai kegagalan sudah diposting manual.
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehUploadVideo } from "@/lib/tv-tim";
import { tayangAtauDiproses } from "@/lib/ayrshare-status";
import { catatAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PER_HALAMAN = 30;
/** Jendela pencarian kegagalan untuk lencana (video lebih lama dianggap usang). */
const JENDELA_GAGAL_HARI = 30;

type HasilPlatform = { platform?: string; status?: string; id?: string; postUrl?: string; pesan?: string };

type Baris = {
  kode: string;
  judul: string | null;
  judul_overlay: string | null;
  highlight: string | null;
  caption_asli: string | null;
  caption_platform: Record<string, string> | null;
  thumbnail_url: string | null;
  hasil_render_url: string | null;
  video_asli: string | null;
  link: string | null;
  link_instagram: string | null;
  jenis: string | null;
  status: string;
  persetujuan: string | null;
  persetujuan_oleh: string | null;
  sumber_upload: string | null;
  jam_tanggal: string;
  diunggah_pada: string | null;
  diupload_oleh: string | null;
  digenerate_oleh: string | null;
  diedit_oleh: string | null;
  diposting_oleh: string | null;
  platform_terunggah: string[] | null;
  ayrshare_hasil: HasilPlatform[] | null;
  gagal_ditangani_pada: string | null;
  gagal_ditangani_oleh: string | null;
};

const KOLOM =
  "kode, judul, judul_overlay, highlight, caption_asli, caption_platform, thumbnail_url, hasil_render_url, video_asli, link, link_instagram, jenis, status, persetujuan, persetujuan_oleh, sumber_upload, jam_tanggal, diunggah_pada, diupload_oleh, digenerate_oleh, diedit_oleh, diposting_oleh, platform_terunggah, ayrshare_hasil, gagal_ditangani_pada, gagal_ditangani_oleh";

/** Platform yang gagal dan BELUM tayang lewat percobaan lain. */
function platformGagal(b: Pick<Baris, "ayrshare_hasil" | "platform_terunggah">): HasilPlatform[] {
  const tayang = new Set((b.platform_terunggah ?? []).map((p) => p.toLowerCase()));
  return (Array.isArray(b.ayrshare_hasil) ? b.ayrshare_hasil : []).filter(
    (h) => !tayangAtauDiproses(h.status, h.id, h.postUrl) && !tayang.has(String(h.platform ?? "").toLowerCase()),
  );
}

function ringkas(b: Baris) {
  const gagal = platformGagal(b);
  const hasil = Array.isArray(b.ayrshare_hasil) ? b.ayrshare_hasil : [];
  const tayang = hasil.filter((h) => tayangAtauDiproses(h.status, h.id, h.postUrl));
  const adaTayang = tayang.length > 0 || (b.platform_terunggah ?? []).length > 0;
  const hasilAkhir = gagal.length === 0 ? (adaTayang ? "berhasil" : "belum") : adaTayang ? "sebagian" : "gagal";
  return {
    // Bentuk VideoAntrian (id = kode) — baris bisa langsung dibuka di pratinjau.
    id: b.kode,
    judul: b.judul ?? "",
    judul_overlay: b.judul_overlay ?? "",
    highlight: b.highlight ?? "",
    caption_asli: b.caption_asli ?? "",
    caption_platform: b.caption_platform,
    thumbnail_url: b.thumbnail_url ?? "",
    hasil_render_url: b.hasil_render_url ?? "",
    video_asli: b.video_asli ?? "",
    link: b.link ?? "",
    link_instagram: b.link_instagram ?? "",
    jenis: b.jenis ?? "INSTAGRAM",
    status: b.status,
    persetujuan: b.persetujuan ?? "menunggu",
    persetujuan_oleh: b.persetujuan_oleh,
    sumber_upload: b.sumber_upload ?? "manual",
    jam_tanggal: b.jam_tanggal,
    platform_terunggah: b.platform_terunggah ?? [],
    ayrshare_hasil: hasil,
    diupload_oleh: b.diupload_oleh,
    // Riwayat
    diedit_oleh: b.diedit_oleh || b.digenerate_oleh || b.diupload_oleh,
    diposting_oleh: b.diposting_oleh,
    diunggah_pada: b.diunggah_pada,
    hasil_akhir: hasilAkhir as "berhasil" | "sebagian" | "gagal" | "belum",
    platform: hasil.map((h) => ({
      platform: String(h.platform ?? ""),
      berhasil: tayangAtauDiproses(h.status, h.id, h.postUrl),
      url: h.postUrl ?? "",
      pesan: h.pesan ?? "",
    })),
    perlu_manual: gagal.length > 0 && !b.gagal_ditangani_pada,
    ditangani_oleh: b.gagal_ditangani_pada ? b.gagal_ditangani_oleh : null,
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    const url = new URL(request.url);
    const halaman = Math.min(50, Math.max(1, Number(url.searchParams.get("halaman")) || 1));
    const hanyaGagal = url.searchParams.get("saring") === "gagal";
    const db = supabase();

    // Kandidat gagal: punya hasil unggah & belum ditangani, dalam jendela waktu.
    const batasGagal = new Date(Date.now() - JENDELA_GAGAL_HARI * 86_400_000).toISOString();
    const { data: kandidat, error: galatKandidat } = await db
      .from("video_antrian")
      .select(KOLOM)
      .not("diunggah_pada", "is", null)
      .is("gagal_ditangani_pada", null)
      .gte("diunggah_pada", batasGagal)
      .order("diunggah_pada", { ascending: false })
      .limit(300);
    if (galatKandidat) throw new Error("Riwayat gagal dimuat.");
    const gagal = ((kandidat ?? []) as Baris[]).filter((b) => platformGagal(b).length > 0);

    if (hanyaGagal) {
      return { data: gagal.map(ringkas), ada_lagi: false, perlu_manual: gagal.length };
    }

    const awal = (halaman - 1) * PER_HALAMAN;
    const { data, error } = await db
      .from("video_antrian")
      .select(KOLOM)
      .order("jam_tanggal", { ascending: false })
      .range(awal, awal + PER_HALAMAN); // +1 untuk tahu masih ada lanjutan
    if (error) throw new Error("Riwayat gagal dimuat.");
    const baris = (data ?? []) as Baris[];
    return {
      data: baris.slice(0, PER_HALAMAN).map(ringkas),
      ada_lagi: baris.length > PER_HALAMAN,
      perlu_manual: gagal.length,
    };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!(await bolehUploadVideo(user))) {
      throw Object.assign(new Error("Anda belum berhak mengelola unggahan TV Rakyat Official."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { kode?: string };
    const kode = String(body.kode ?? "").trim();
    if (!kode || kode.length > 80) throw Object.assign(new Error("Video tidak disebutkan."), { status: 400 });
    const { data, error } = await supabase()
      .from("video_antrian")
      .update({ gagal_ditangani_pada: new Date().toISOString(), gagal_ditangani_oleh: user.nama })
      .eq("kode", kode)
      .select("judul_overlay, judul")
      .maybeSingle();
    if (error) throw new Error("Gagal menyimpan tanda.");
    if (!data) throw Object.assign(new Error("Video tidak ditemukan."), { status: 404 });
    catatAudit(user.id, "tv_riwayat", `Menandai video sudah diposting manual: "${data.judul_overlay || data.judul || kode}"`, {
      request,
      detail: { kode },
    });
    return { sukses: true };
  });
}
