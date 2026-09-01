// TV RAKYAT SAYA — unggah video ke SOSMED PRIBADI anggota via upload-post
// (rombakan 31 Agu 2026; jalur media pindah ke CLOUDINARY 1 Sep 2026).
// Cermin fitur unggah TV Rakyat Official, tapi per anggota (profil
// upload-post masing-masing, kuota 225).
//
// Alur (1 Sep 2026): peramban mengunggah video LANGSUNG ke Cloudinary
// (unsigned preset — jalur yang sama dan sudah terbukti dengan
// kirim-video-manual; batas body Vercel 4,5 MB tak berlaku), lalu:
// POST {aksi:"post", video_url, public_id, judul, caption, platforms[],
//   jadwal?} → validasi URL milik cloud kita → serahkan ke upload-post
//   (schedule_date bila jadwal) → simpan riwayat tvrku_post +
//   hapus_media_pada = tayang + 2 jam.
// GET  → riwayat post saya (+ status berkas).
//
// Media DIHAPUS otomatis dari Cloudinary 2 jam setelah tayang (postingan
// di sosmed TETAP) — penyapu tanpa-cron. Jalur lama {aksi:"siapkan"} +
// bucket "tvrku" dipertahankan untuk klien yang masih memuat JS lama;
// penyapu mengenali kedua jenis berkas dari bentuk video_url-nya.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { maksUploadMb } from "@/lib/pengaturan-tv";
import { unggahVideoUp, uploadPostSiap } from "@/lib/upload-post";
import { PLATFORM_KPI } from "@/lib/kpi-video";
import { rekonsiliasiKpiOtomatis } from "@/lib/kpi-otomatis";
import { hapusVideoCloudinary, konfigUploadCloudinary } from "@/lib/cloudinary";
import {
  dariR2,
  hapusVideoR2,
  MAKS_UMUR_URL_DETIK,
  presignR2,
  r2Siap,
} from "@/lib/r2";

export const dynamic = "force-dynamic";
// upload-post mengunduh video dari URL kita lalu memposting ke banyak
// platform — beri napas panjang (pelajaran maxDuration TV Official).
export const maxDuration = 300;

/** Umur berkas video di penyimpanan setelah tayang: 2 jam (permintaan). */
const UMUR_MEDIA_JAM = 2;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Profil upload-post milik user (dibuat lewat alur Hubungkan). */
async function profilUp(userId: number): Promise<string | null> {
  const { data } = await supabase()
    .from("sosmed_profile")
    .select("profile_key")
    .eq("jenis", "pengguna")
    .eq("penyedia", "upload-post")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.profile_key as string) ?? null;
}

/**
 * Penyapu tanpa-cron: hapus berkas video yang lewat umur (postingan
 * sosmed TIDAK disentuh). Batch kecil, dipanggil lewat after().
 */
async function bersihkanVideoKedaluwarsa(): Promise<void> {
  try {
    const db = supabase();
    const { data } = await db
      .from("tvrku_post")
      .select("id, video_path, video_url")
      .not("hapus_media_pada", "is", null)
      .lt("hapus_media_pada", new Date().toISOString())
      .limit(20);
    if (!data || data.length === 0) return;
    // TIGA generasi berkas hidup berdampingan, dibedakan dari bentuk
    // video_url (tanpa migrasi kolom): R2 (baru) → key objek,
    // Cloudinary → public_id, lama → path bucket "tvrku".
    const dariCloudinary = data.filter((b) =>
      String(b.video_url ?? "").includes("res.cloudinary.com"),
    );
    const dariStorage = data.filter(
      (b) =>
        !String(b.video_url ?? "").includes("res.cloudinary.com") &&
        !dariR2(String(b.video_url ?? "")),
    );
    for (const b of data) {
      if (b.video_path && dariR2(String(b.video_url ?? ""))) {
        await hapusVideoR2(String(b.video_path));
      }
    }
    for (const b of dariCloudinary) {
      if (b.video_path) await hapusVideoCloudinary(String(b.video_path));
    }
    const jalur = dariStorage.map((b) => String(b.video_path)).filter(Boolean);
    if (jalur.length > 0) await db.storage.from("tvrku").remove(jalur);
    await db
      .from("tvrku_post")
      .update({ hapus_media_pada: null, video_path: "" })
      .in("id", data.map((b) => b.id));
  } catch (e) {
    console.error("[tvrku/unggah] penyapu:", e);
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const { data } = await supabase()
      .from("tvrku_post")
      .select("id, judul, caption, platforms, video_url, video_path, jadwal, hasil, dibuat_pada")
      .eq("user_id", Number(user.id))
      .order("id", { ascending: false })
      .limit(30);
    // KPI OTOMATIS: tiap membuka riwayat, unggahan yang URL postingannya
    // sudah terbit dicatat jadi laporan_video — tanpa lapor manual.
    after(() => rekonsiliasiKpiOtomatis(Number(user.id)));
    after(bersihkanVideoKedaluwarsa);
    return {
      data: (data ?? []).map((b) => ({
        ...b,
        id: String(b.id),
        // Berkas yang sudah disapu → video_url tak berlaku lagi.
        video_url: b.video_path ? b.video_url : "",
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    await pastikanFiturAktif(user, "tvrku", "TV Rakyat Saya sedang dimatikan untuk peran Anda.");
    if (!uploadPostSiap()) {
      throw Object.assign(
        new Error("upload-post belum diatur (UPLOAD_POST_API_KEY kosong). Hubungi pengelola."),
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      nama?: string;
      ukuran?: number;
      path?: string;
      video_url?: string;
      public_id?: string;
      r2_key?: string;
      judul?: string;
      caption?: string;
      platforms?: string[];
      jadwal?: string;
    };
    const db = supabase();

    // ---- Langkah 1: siapkan URL unggah tertandatangan ----
    if (body.aksi === "siapkan") {
      const maksMb = await maksUploadMb();
      const ukuran = Number(body.ukuran ?? 0);
      if (!Number.isFinite(ukuran) || ukuran <= 0) {
        throw Object.assign(new Error("Ukuran berkas tidak dikenal."), { status: 400 });
      }
      if (ukuran > maksMb * 1024 * 1024) {
        throw Object.assign(
          new Error(`Video terlalu besar. Batasnya ${maksMb} MB.`),
          { status: 400 },
        );
      }
      const ext = /\.(mp4|mov|m4v|webm)$/i.exec(body.nama ?? "")?.[1]?.toLowerCase() ?? "mp4";
      const path = `${user.id}/${Date.now()}.${ext}`;

      // JALUR UTAMA (1 Sep 2026): Cloudflare R2 — bandwidth keluar
      // gratis, jadi video yang cuma numpang 2 jam nyaris tanpa biaya.
      if (r2Siap()) {
        return {
          sukses: true,
          cara: "r2" as const,
          r2_key: path,
          url: presignR2("PUT", path, 15 * 60),
        };
      }

      // Cadangan: bucket Supabase (dipakai bila R2 belum dipasang).
      const { data, error } = await db.storage
        .from("tvrku")
        .createSignedUploadUrl(path);
      if (error || !data) {
        console.error("[tvrku/unggah] siapkan:", error?.message);
        throw new Error("Gagal menyiapkan unggahan. Coba lagi.");
      }
      return { sukses: true, cara: "supabase" as const, path, url: data.signedUrl, token: data.token };
    }

    // ---- Langkah 2: post ke sosmed via upload-post ----
    if (body.aksi === "post") {
      // Jalur BARU (1 Sep 2026): media sudah di Cloudinary — klien
      // mengirim secure_url + public_id. Jalur LAMA (path bucket)
      // tetap diterima untuk klien yang masih memuat JS versi lama.
      const videoUrlCloud = String(body.video_url ?? "").trim();
      const publicId = String(body.public_id ?? "").trim();
      const r2Key = String(body.r2_key ?? "").trim();
      const path = String(body.path ?? "");
      const pakaiR2 = Boolean(r2Key);
      const pakaiCloudinary = !pakaiR2 && Boolean(videoUrlCloud);
      if (pakaiR2) {
        // Jalur milik user ini (anti memposting berkas orang lain).
        if (!r2Key.startsWith(`${user.id}/`) || !/^[\w./-]+$/.test(r2Key)) {
          throw Object.assign(new Error("Berkas video tidak dikenal."), { status: 400 });
        }
        if (!r2Siap()) {
          throw Object.assign(
            new Error("Penyimpanan video (R2) belum diatur. Hubungi pengelola."),
            { status: 503 },
          );
        }
      } else if (pakaiCloudinary) {
        const konfig = konfigUploadCloudinary();
        if (!konfig) {
          throw Object.assign(
            new Error("Penyimpanan video (Cloudinary) belum diatur. Hubungi pengelola."),
            { status: 503 },
          );
        }
        // URL wajib milik cloud KITA — mencegah orang menyodorkan URL
        // sembarangan untuk diposting lewat kuota upload-post partai.
        if (
          !videoUrlCloud.startsWith(`https://res.cloudinary.com/${konfig.cloudName}/`)
        ) {
          throw Object.assign(new Error("URL video tidak dikenal."), { status: 400 });
        }
        if (!publicId || !/^[\w/-]+$/.test(publicId)) {
          throw Object.assign(new Error("Berkas video tidak dikenal."), { status: 400 });
        }
      } else if (!path.startsWith(`${user.id}/`)) {
        // Jalur lama: harus milik user ini (anti memposting berkas orang lain).
        throw Object.assign(new Error("Berkas video tidak dikenal."), { status: 400 });
      }
      const judul = (body.judul ?? "").trim();
      if (judul.length < 3) {
        throw Object.assign(new Error("Judul video wajib diisi."), { status: 400 });
      }
      const platforms = (body.platforms ?? [])
        .map((p) => String(p).toLowerCase())
        .filter((p) => (PLATFORM_KPI as readonly string[]).includes(p));
      if (platforms.length === 0) {
        throw Object.assign(new Error("Pilih minimal satu platform tujuan."), { status: 400 });
      }

      const profil = await profilUp(Number(user.id));
      if (!profil) {
        throw Object.assign(
          new Error("Hubungkan akun sosmed Anda dulu (tombol Hubungkan di Akun TV Rakyat)."),
          { status: 409 },
        );
      }

      // Jadwal (opsional): ISO dari klien; harus di masa depan < 30 hari.
      let jadwal: string | undefined;
      if (body.jadwal) {
        const t = Date.parse(body.jadwal);
        if (!Number.isFinite(t) || t < Date.now() + 4 * 60_000) {
          throw Object.assign(
            new Error("Waktu jadwal harus minimal 5 menit dari sekarang."),
            { status: 400 },
          );
        }
        // Maksimal 7 hari: URL video bertanda tangan R2 juga berumur
        // 7 hari (batas SigV4), jadi jadwal tak boleh melewatinya.
        if (t > Date.now() + 7 * 86_400_000) {
          throw Object.assign(new Error("Jadwal maksimal 7 hari ke depan."), { status: 400 });
        }
        jadwal = new Date(t).toISOString();
      }

      // URL yang diserahkan ke upload-post. R2: tautan bertanda tangan
      // berumur 7 hari (batas SigV4) — cukup untuk post langsung maupun
      // terjadwal, karena jadwal dibatasi 7 hari juga.
      const videoUrl = pakaiR2
        ? presignR2("GET", r2Key, MAKS_UMUR_URL_DETIK)
        : pakaiCloudinary
          ? videoUrlCloud
          : db.storage.from("tvrku").getPublicUrl(path).data.publicUrl;
      const hasil = await unggahVideoUp({
        profil,
        videoUrl,
        judul,
        caption: body.caption ?? "",
        platforms,
        scheduleDate: jadwal,
      });

      // Berkas dihapus 2 jam setelah TAYANG: post langsung = sekarang+2j;
      // terjadwal = jadwal+2j (upload-post butuh URL-nya masih hidup
      // saat menerbitkan).
      const dasarMs = jadwal ? Date.parse(jadwal) : Date.now();
      const hapusPada = new Date(dasarMs + UMUR_MEDIA_JAM * 3600_000).toISOString();

      const { data: baris, error } = await db
        .from("tvrku_post")
        .insert({
          user_id: Number(user.id),
          judul,
          caption: (body.caption ?? "").slice(0, 2200),
          platforms,
          // video_path menampung penunjuk berkas sesuai generasinya:
          // R2 → key objek, Cloudinary → public_id, lama → path bucket.
          video_path: pakaiR2 ? r2Key : pakaiCloudinary ? publicId : path,
          video_url: videoUrl,
          jadwal: jadwal ?? null,
          hasil: hasil.mentah,
          request_id: hasil.request_id,
          hapus_media_pada: hapusPada,
        })
        .select("id")
        .single();
      if (error) console.error("[tvrku/unggah] simpan riwayat:", error.message);

      // Coba catat KPI segera (platform cepat seperti YouTube/TikTok
      // biasanya sudah punya URL); sisanya menyusul saat layar dibuka.
      if (!jadwal) after(() => rekonsiliasiKpiOtomatis(Number(user.id)));
      after(bersihkanVideoKedaluwarsa);
      return {
        sukses: hasil.sukses,
        id: baris ? String(baris.id) : null,
        terjadwal: Boolean(jadwal),
        hasil: hasil.mentah,
      };
    }

    throw Object.assign(new Error("aksi harus 'siapkan' atau 'post'."), { status: 400 });
  });
}
