// Unggahan video MANUAL anggota (hasil edit sendiri) via Cloudinary.
//
// GET  ?konfig=1  — konfigurasi upload langsung peramban→Cloudinary
//                   (cloud name + unsigned preset; bukan rahasia).
// GET             — daftar kiriman manual MILIK SENDIRI + statusnya.
// POST            — catat hasil upload (secure_url + public_id) sebagai
//                   antrean "MENUNGGU ACC" untuk diputus Pimred.
//
// Kenapa peramban mengunggah LANGSUNG ke Cloudinary: video hasil edit
// berukuran puluhan MB, sedangkan badan permintaan fungsi Vercel
// dibatasi ±4,5 MB. Server hanya mencatat metadata-nya.
//
// Retensi: media di Cloudinary dihapus PERMANEN 2 hari setelah unggah
// (pembersihan berjalan di sini setiap kali fitur dipakai — tanpa
// cron). Barisnya tetap ada sebagai riwayat; kalau videonya sudah
// telanjur diunggah ke sosmed lewat Ayrshare sebelum jatuh tempo,
// tayangannya aman — sosmed menyimpan salinannya sendiri.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { BATAS_BERKAS_CLOUDINARY_MB, BATAS_KOMPRES_MB, konfigUploadCloudinary, hapusVideoCloudinary, siapHapusCloudinary } from "@/lib/cloudinary";
import { adalahPimred } from "@/lib/jabatan";
import { kirimKabar } from "@/lib/notifikasi";
import { maksUploadMb } from "@/lib/pengaturan-tv";

export const dynamic = "force-dynamic";

const RETENSI_JAM = 48;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Hapus media yang jatuh tempo (>2 hari) dari Cloudinary. */
async function bersihkanMediaKedaluwarsa() {
  if (!siapHapusCloudinary()) return;
  try {
    const db = supabase();
    const { data } = await db
      .from("video_antrian")
      .select("kode, cloudinary_public_id")
      .not("cloudinary_public_id", "is", null)
      .lt("hapus_media_pada", new Date().toISOString())
      .limit(20);
    for (const baris of data ?? []) {
      const terhapus = await hapusVideoCloudinary(baris.cloudinary_public_id as string);
      if (terhapus) {
        await db
          .from("video_antrian")
          .update({ cloudinary_public_id: null })
          .eq("kode", baris.kode);
      }
    }
  } catch (e) {
    // Gagal bersih-bersih dicoba lagi pada pemakaian berikutnya.
    console.error("[tv/manual] bersihkan media:", e);
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const url = new URL(request.url);
    after(bersihkanMediaKedaluwarsa);

    if (url.searchParams.get("konfig") === "1") {
      const konfig = konfigUploadCloudinary();
      if (!konfig) {
        throw Object.assign(
          new Error("Penyimpanan video belum diatur. Isi CLOUDINARY_CLOUD_NAME dan CLOUDINARY_UPLOAD_PRESET."),
          { status: 503 },
        );
      }
      // Batas ukuran diatur Pimred (fitur 1.20/6, 1-200 MB) — dipakai
      // klien untuk menolak berkas SEBELUM upload dimulai.
      return { ...konfig, retensi_jam: RETENSI_JAM, maks_upload_mb: await maksUploadMb(), kompres_mb: BATAS_KOMPRES_MB, berkas_maks_mb: BATAS_BERKAS_CLOUDINARY_MB };
    }

    const { data, error } = await supabase()
      .from("video_antrian")
      .select("kode, judul, status, persetujuan, persetujuan_oleh, thumbnail_url, hasil_render_url, jam_tanggal, hapus_media_pada, cloudinary_public_id, platform_terunggah")
      .eq("sumber_upload", "manual")
      .eq("diupload_oleh_id", Number(user.id))
      .order("jam_tanggal", { ascending: false })
      .limit(30);
    if (error) throw new Error("Gagal memuat kiriman video Anda.");

    return {
      data: (data ?? []).map((v) => ({
        ...v,
        media_masih_ada: Boolean(v.cloudinary_public_id),
        cloudinary_public_id: undefined,
      })),
      retensi_jam: RETENSI_JAM,
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      secure_url?: string;
      public_id?: string;
      judul?: string;
      caption?: string;
      tugas_id?: string | number;
      /** Ukuran berkas (byte) dari respons Cloudinary — diperiksa ulang */
      bytes?: number;
    };

    // Pagar ukuran sisi server (fitur 1.20/6): klien sudah menolak
    // berkas kebesaran sebelum upload, tapi batasnya tetap ditegakkan
    // di sini juga — batas yang hanya hidup di layar bukan batas.
    const batasMb = await maksUploadMb();
    const bytes = Number(body.bytes ?? 0);
    if (Number.isFinite(bytes) && bytes > batasMb * 1024 * 1024) {
      throw Object.assign(
        new Error(
          `Video ${(bytes / 1024 / 1024).toFixed(1)} MB melebihi batas ${batasMb} MB yang ditetapkan Pimred.`,
        ),
        { status: 400 },
      );
    }

    const konfig = konfigUploadCloudinary();
    const secureUrl = (body.secure_url ?? "").trim();
    const publicId = (body.public_id ?? "").trim();

    // Terima HANYA URL dari cloud Cloudinary milik kita — bukan tautan
    // sembarang yang mengaku-aku hasil upload.
    const polaSah = konfig
      ? new RegExp(`^https://res\\.cloudinary\\.com/${konfig.cloudName}/video/upload/`)
      : null;
    if (!polaSah || !polaSah.test(secureUrl) || !publicId || publicId.length > 200) {
      throw Object.assign(new Error("Hasil upload tidak dikenali. Ulangi unggahannya."), {
        status: 400,
      });
    }

    // ---- Tautan ke Tugas Link dari Pimred ----
    // Aturan: anggota yang PUNYA tugas terbuka WAJIB menautkan
    // unggahannya ke salah satu tugas itu; yang tidak punya tugas
    // boleh mengunggah bebas seperti biasa.
    const tugasId = Number(body.tugas_id ?? 0);
    const { data: tugasTerbuka } = await supabase()
      .from("tugas_link")
      .select("id, status")
      .eq("untuk_user_id", Number(user.id))
      .in("status", ["baru", "dikerjakan"]);
    const daftarTugas = tugasTerbuka ?? [];
    if (daftarTugas.length > 0 && !tugasId) {
      throw Object.assign(
        new Error(
          "Anda punya tugas link dari Pimred — pilih tugas mana yang dikerjakan video ini.",
        ),
        { status: 400 },
      );
    }
    if (tugasId && !daftarTugas.some((t) => Number(t.id) === tugasId)) {
      throw Object.assign(
        new Error("Tugas itu bukan milik Anda atau sudah selesai."),
        { status: 400 },
      );
    }

    const judul = (body.judul ?? "").trim().slice(0, 60) || `Video ${user.nama.split(" ")[0]}`;
    const acak = Math.random().toString(36).slice(2, 8);
    const kode = `vid-man-${Date.now().toString(36)}-${acak}`;
    const jatuhTempo = new Date(Date.now() + RETENSI_JAM * 60 * 60 * 1000).toISOString();

    const { error } = await supabase().from("video_antrian").insert({
      kode,
      judul,
      judul_overlay: judul,
      caption_asli: (body.caption ?? "").trim().slice(0, 2200),
      jenis: "INSTAGRAM",
      link: "",
      video_asli: secureUrl,
      status: "MENUNGGU ACC",
      persetujuan: "menunggu",
      sumber_upload: "manual",
      diupload_oleh: user.nama,
      diupload_oleh_id: Number(user.id),
      cloudinary_url: secureUrl,
      cloudinary_public_id: publicId,
      // Modal pratinjau memutar hasil_render_url — untuk video manual,
      // berkas mentahnya itulah yang ditinjau Pimred.
      hasil_render_url: secureUrl,
      hapus_media_pada: jatuhTempo,
      tahap: 5,
      persen: 100,
      tahap_nama: "Menunggu persetujuan Pimred",
      jam_tanggal: new Date().toISOString(),
      tugas_id: tugasId || null,
    });
    if (error) {
      console.error("[tv/manual] simpan:", error.message);
      throw new Error("Gagal mencatat video. Coba lagi.");
    }

    // Tugas yang ditautkan naik status jadi "dikerjakan" + membawa
    // kode videonya, supaya Pimred melihat kemajuannya.
    if (tugasId) {
      await supabase()
        .from("tugas_link")
        .update({ status: "dikerjakan", video_kode: kode })
        .eq("id", tugasId);
    }

    // Kabari para Pimpinan Redaksi (dan master sebagai cadangan).
    const { data: pimred } = await supabase()
      .from("app_user")
      .select("id, jabatan, role")
      .eq("aktif", true);
    const idPimred = (pimred ?? [])
      .filter((p) => adalahPimred({ role: p.role as string, jabatan: p.jabatan as string }))
      .map((p) => Number(p.id));
    if (idPimred.length > 0) {
      await kirimKabar({
        judul: "Video manual menunggu ACC",
        isi: `${user.nama} mengunggah "${judul}". Buka TV Rakyat untuk menyetujui atau menolak.`,
        kategori: "peringatan",
        jenis_peristiwa: "tv_manual",
        untukUserIds: idPimred,
      });
    }

    after(bersihkanMediaKedaluwarsa);
    return { sukses: true, kode };
  });
}
