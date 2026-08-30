// /api/tv/jadwal — Jadwal Posting TV Rakyat Official (fitur 1.22.x/3)
//
// POST   { caption, media_url, media_public_id?, is_video?, platforms[],
//          judul_youtube?, jadwal_pada (ISO) } → jadwalkan posting lewat
//          Ayrshare (scheduleDate) & simpan catatannya.
// GET    → daftar jadwal (terbaru dulu) + nama pembuatnya.
// DELETE { id } → batalkan jadwal yang BELUM tayang (hapus di Ayrshare).
//
// Ayrshare sendiri yang menerbitkan pada waktunya — TIDAK ada cron di
// aplikasi. Memposting atas nama akun partai bersifat publik & tak bisa
// ditarik: dijaga di server (bolehUploadVideo), bukan sekadar UI.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { ambilAkunTertaut, hapusPostingan, unggahVideo, ayrshareSiap } from "@/lib/ayrshare";
import { bolehUploadVideo } from "@/lib/tv-tim";
import { pastikanFiturAktif } from "@/lib/fitur-server";

export const dynamic = "force-dynamic";
// Panggilan Ayrshare bisa lambat — jangan diputus Vercel di 10 detik.
export const maxDuration = 60;

const PLATFORM_DIKENAL = new Set(["instagram", "tiktok", "youtube", "facebook", "twitter", "threads"]);
const BATAS_CAPTION: Record<string, number> = {
  instagram: 2200,
  tiktok: 2200,
  youtube: 5000,
  facebook: 63206,
  twitter: 25000,
  threads: 500,
};

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanBolehUpload(request: Request) {
  const pengguna = await userDariToken(tokenDari(request));
  if (!pengguna) throw Object.assign(new Error("Sesi tidak berlaku. Masuk lagi."), { status: 401 });
  if (!(await bolehUploadVideo(pengguna))) {
    throw Object.assign(
      new Error("Anda belum ditunjuk Pimpinan Redaksi untuk memposting."),
      { status: 403 },
    );
  }
  return pengguna;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanBolehUpload(request);
    const db = supabase();
    const { data, error } = await db
      .from("jadwal_posting")
      .select(
        "id, caption, media_url, is_video, platforms, judul_youtube, jadwal_pada, status, ayrshare_id, error, dibuat_pada, dibuat_oleh_id",
      )
      .order("jadwal_pada", { ascending: false })
      .limit(100);
    if (error) {
      console.error("[tv/jadwal] baca:", error.message);
      throw new Error("Gagal memuat jadwal.");
    }
    const baris = data ?? [];

    // Nama pembuat diambil terpisah (hindari kerapuhan embed FK).
    const ids = [...new Set(baris.map((j) => Number(j.dibuat_oleh_id)).filter(Boolean))];
    const peta = new Map<number, string>();
    if (ids.length > 0) {
      const { data: orang } = await db
        .from("app_user")
        .select("id, nama, nama_panggilan")
        .in("id", ids);
      for (const o of orang ?? []) {
        peta.set(Number(o.id), (o.nama_panggilan || o.nama || "") as string);
      }
    }

    return {
      data: baris.map((j) => ({
        id: String(j.id),
        caption: j.caption ?? "",
        media_url: j.media_url ?? "",
        is_video: j.is_video === true,
        platforms: (j.platforms ?? []) as string[],
        judul_youtube: j.judul_youtube ?? "",
        jadwal_pada: j.jadwal_pada,
        status: j.status,
        error: j.error ?? null,
        oleh: peta.get(Number(j.dibuat_oleh_id)) ?? "",
        dibuat_pada: j.dibuat_pada,
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const pengguna = await pastikanBolehUpload(request);
    await pastikanFiturAktif(pengguna, "tv.upload", "Fitur posting sedang dimatikan untuk peran Anda.");
    if (!ayrshareSiap()) {
      throw Object.assign(new Error("Ayrshare belum diatur (AYRSHARE_API_KEY kosong)."), {
        status: 503,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      caption?: string;
      media_url?: string;
      media_public_id?: string;
      is_video?: boolean;
      platforms?: string[];
      judul_youtube?: string;
      jadwal_pada?: string;
    };

    const caption = (body.caption ?? "").trim();
    const mediaUrl = (body.media_url ?? "").trim();
    // Ayrshare butuh media (IG/TikTok/YouTube menolak posting tanpa media).
    if (!/^https?:\/\/\S+$/i.test(mediaUrl)) {
      throw Object.assign(new Error("Media (foto/video) wajib diunggah dulu."), { status: 400 });
    }
    const isVideo = body.is_video !== false;

    // Platform: hanya yang dikenal DAN benar-benar tertaut di Ayrshare —
    // menjadwalkan ke akun yang tak tertaut hanya melahirkan galat nanti.
    const diminta = (body.platforms ?? [])
      .map((p) => String(p).toLowerCase())
      .filter((p) => PLATFORM_DIKENAL.has(p));
    if (diminta.length === 0) {
      throw Object.assign(new Error("Pilih minimal satu platform tujuan."), { status: 400 });
    }
    const { platformAktif } = await ambilAkunTertaut();
    const tertaut = new Set(platformAktif.map((p) => p.toLowerCase()));
    const platforms = diminta.filter((p) => tertaut.has(p));
    if (platforms.length === 0) {
      throw Object.assign(
        new Error("Tak ada platform terpilih yang tertaut di Ayrshare. Tautkan akun resminya dulu."),
        { status: 409 },
      );
    }

    // Caption tak boleh melebihi batas platform TERKETAT yang dipilih.
    const batas = Math.min(...platforms.map((p) => BATAS_CAPTION[p] ?? 2200));
    if (caption.length > batas) {
      throw Object.assign(
        new Error(`Caption melebihi ${batas} karakter untuk platform terpilih.`),
        { status: 400 },
      );
    }

    // Jadwal wajib ISO valid & minimal 5 menit ke depan. Dikirim ke
    // Ayrshare dalam format Zulu/UTC "YYYY-MM-DDThh:mm:ssZ".
    const t = new Date(body.jadwal_pada ?? "");
    if (Number.isNaN(t.getTime())) {
      throw Object.assign(new Error("Waktu jadwal tidak sah."), { status: 400 });
    }
    if (t.getTime() < Date.now() + 5 * 60 * 1000) {
      throw Object.assign(new Error("Jadwal minimal 5 menit dari sekarang."), { status: 400 });
    }
    const scheduleDate = t.toISOString().replace(/\.\d{3}Z$/, "Z");

    // idempotencyKey mencegah dobel jadwal bila permintaan diulang.
    const idemp = `jadwal-${pengguna.id}-${t.getTime()}-${[...platforms].sort().join(",")}`;
    const hasil = await unggahVideo({
      videoUrl: mediaUrl,
      caption: caption || " ", // Ayrshare menolak post kosong.
      platforms,
      isVideo,
      scheduleDate,
      judulYoutube: body.judul_youtube,
      idempotencyKey: idemp,
    });

    const galat = hasil.hasil.filter((h) => h.status === "error");
    const { data: baris, error } = await supabase()
      .from("jadwal_posting")
      .insert({
        dibuat_oleh_id: Number(pengguna.id),
        caption,
        media_url: mediaUrl,
        media_public_id: (body.media_public_id ?? "").trim() || null,
        is_video: isVideo,
        platforms,
        judul_youtube: (body.judul_youtube ?? "").trim() || null,
        jadwal_pada: t.toISOString(),
        status: hasil.idAyrshare ? "terjadwal" : "gagal",
        ayrshare_id: hasil.idAyrshare || null,
        hasil: hasil.hasil,
        error:
          galat.length > 0
            ? galat.map((h) => `${h.platform}: ${h.pesan}`).join("; ").slice(0, 500)
            : null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[tv/jadwal] simpan:", error.message);
      throw new Error("Terjadwal di Ayrshare, tetapi catatannya gagal disimpan.");
    }

    return {
      sukses: true,
      id: String(baris.id),
      ayrshare_id: hasil.idAyrshare,
      status: hasil.idAyrshare ? "terjadwal" : "gagal",
      hasil: hasil.hasil,
    };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    await pastikanBolehUpload(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string | number };
    const id = Number(body.id ?? 0);
    if (!id) throw Object.assign(new Error("Jadwal tidak disebutkan."), { status: 400 });

    const db = supabase();
    const { data: row } = await db
      .from("jadwal_posting")
      .select("id, status, ayrshare_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw Object.assign(new Error("Jadwal tidak ditemukan."), { status: 404 });
    if (row.status !== "terjadwal") {
      throw Object.assign(new Error("Hanya jadwal yang belum tayang bisa dibatalkan."), {
        status: 409,
      });
    }

    // Batalkan di Ayrshare DULU. Bila gagal, JANGAN tandai dibatalkan —
    // postingannya masih akan tayang, dan menandai "dibatalkan" secara
    // lokal justru menyesatkan.
    if (row.ayrshare_id) {
      try {
        await hapusPostingan(String(row.ayrshare_id));
      } catch (e) {
        throw Object.assign(
          new Error(
            `Gagal membatalkan di Ayrshare — jadwal masih aktif. ${
              e instanceof Error ? e.message : ""
            }`.trim(),
          ),
          { status: 502 },
        );
      }
    }

    const { error } = await db
      .from("jadwal_posting")
      .update({ status: "dibatalkan", diperbarui_pada: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error("Dibatalkan di Ayrshare, tetapi status gagal diperbarui.");
    return { sukses: true };
  });
}
