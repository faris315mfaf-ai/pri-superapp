// TV RAKYAT SAYA — unggah video ke SOSMED PRIBADI anggota via upload-post
// (rombakan 31 Agu 2026). Cermin fitur unggah TV Rakyat Official, tapi
// per anggota (profil upload-post masing-masing, kuota 225).
//
// POST {aksi:"siapkan", nama, ukuran}  → URL unggah TERTANDATANGAN ke bucket
//   "tvrku" — berkas video BESAR naik langsung peramban→storage, tidak
//   melewati fungsi server (batas body Vercel ~4,5 MB).
// POST {aksi:"post", path, judul, caption, platforms[], jadwal?} → validasi
//   → serahkan URL publik video ke upload-post (schedule_date bila jadwal)
//   → simpan riwayat tvrku_post + hapus_media_pada = tayang + 2 jam.
// GET  → riwayat post saya (+ status berkas).
//
// Berkas video DIHAPUS otomatis 2 jam setelah post/jadwal (postingan di
// sosmed TETAP) — penyapu tanpa-cron ala bersihkanMediaKedaluwarsa.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { maksUploadMb } from "@/lib/pengaturan-tv";
import { unggahVideoUp, uploadPostSiap } from "@/lib/upload-post";
import { PLATFORM_KPI } from "@/lib/kpi-video";

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
      .select("id, video_path")
      .not("hapus_media_pada", "is", null)
      .lt("hapus_media_pada", new Date().toISOString())
      .limit(20);
    if (!data || data.length === 0) return;
    const jalur = data.map((b) => String(b.video_path)).filter(Boolean);
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
      const { data, error } = await db.storage
        .from("tvrku")
        .createSignedUploadUrl(path);
      if (error || !data) {
        console.error("[tvrku/unggah] siapkan:", error?.message);
        throw new Error("Gagal menyiapkan unggahan. Coba lagi.");
      }
      return { sukses: true, path, url: data.signedUrl, token: data.token };
    }

    // ---- Langkah 2: post ke sosmed via upload-post ----
    if (body.aksi === "post") {
      const path = String(body.path ?? "");
      // Jalur harus milik user ini (anti memposting berkas orang lain).
      if (!path.startsWith(`${user.id}/`)) {
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
        if (t > Date.now() + 30 * 86_400_000) {
          throw Object.assign(new Error("Jadwal maksimal 30 hari ke depan."), { status: 400 });
        }
        jadwal = new Date(t).toISOString();
      }

      const videoUrl = db.storage.from("tvrku").getPublicUrl(path).data.publicUrl;
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
          video_path: path,
          video_url: videoUrl,
          jadwal: jadwal ?? null,
          hasil: hasil.mentah,
          request_id: hasil.request_id,
          hapus_media_pada: hapusPada,
        })
        .select("id")
        .single();
      if (error) console.error("[tvrku/unggah] simpan riwayat:", error.message);

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
