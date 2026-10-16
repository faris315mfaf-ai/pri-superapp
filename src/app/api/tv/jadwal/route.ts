// /api/tv/jadwal — Jadwal Posting TV Rakyat Official (fitur 1.22.x/3)
//
// POST   { caption, media_url, media_public_id?, is_video?, platforms[],
//          judul_youtube?, jadwal_pada (ISO), kode? } → jadwalkan posting
//          lewat profil upload-post Official (`scheduled_date`) & simpan
//          catatannya (up_request_id / up_job_id). Video yang DITOLAK
//          ditolak mentah; yang belum disetujui hanya lolos lewat hak ACC
//          (jadwalnya sekaligus dicatat sebagai persetujuan tersirat).
//          → { sukses, id, up_request_id, up_job_id, status, hasil }
// GET    → daftar jadwal AKTIF (status terjadwal, paling dekat tayang dulu)
//          + nama pembuatnya + `bisa_dibatalkan`. Riwayat (tayang/gagal/
//          batal) ada di Riwayat Video.
// DELETE { id } → hanya untuk jadwal yang BELUM pernah dikirim ke
//          upload-post (jadwal lama). upload-post tidak menyediakan
//          pembatalan lewat API (DELETE /uploadposts/schedule → 405), jadi
//          jadwal yang sudah dikirim ditolak 409 dengan penjelasan.
//
// upload-post sendiri yang menerbitkan pada waktunya; cron jadwal-tayang
// (lib/jadwal-tayang) menutup catatannya. Memposting atas nama akun partai
// bersifat publik & tak bisa ditarik: dijaga di server (bolehUploadVideo),
// bukan sekadar UI.
import { createHash } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { ambilKunciUnggah, unggahVideoUp } from "@/lib/upload-post";
import { hasilPerPlatformUp } from "@/lib/jadwal-tayang";
import { PESAN_OFFICIAL_BELUM_TERTAUT, pastikanOfficialUp } from "@/lib/official-up";
import type { HasilUnggahPlatform } from "@/lib/unggah-hasil";
import { adalahPimred } from "@/lib/jabatan";
import { bolehAccVideo, bolehUploadVideo } from "@/lib/tv-tim";
import { pastikanFiturAktif } from "@/lib/fitur-server";

export const dynamic = "force-dynamic";
// unggahVideoUp menunggu paling lama 180 dtk (biasanya jadwal dijawab
// dalam hitungan detik dengan job_id) — jangan diputus sebelum itu.
export const maxDuration = 300;

const PLATFORM_DIKENAL = new Set(["instagram", "tiktok", "youtube", "facebook", "twitter", "threads"]);
const BATAS_CAPTION: Record<string, number> = {
  instagram: 2200,
  tiktok: 2200,
  youtube: 5000,
  facebook: 63206,
  twitter: 25000,
  threads: 500,
};

/** Galat ambigu (timeout/jaringan/5xx): jadwal mungkin sudah diterima — tahan kunci selama ini. */
const TAHAN_AMBIGU_DETIK = 3 * 60;

const PESAN_TAK_BISA_BATAL = "Jadwal yang sudah dikirim ke upload-post tidak bisa dibatalkan dari aplikasi.";
const PESAN_JADWAL_DOBEL = "Jadwal yang sama sedang/baru saja dikirim. Periksa daftar Menunggu Jadwal Tayang.";

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

/** Sudah dikirim ke upload-post = punya request_id atau job_id. */
function sudahDikirim(j: { up_request_id?: string | null; up_job_id?: string | null }): boolean {
  return Boolean(String(j.up_request_id ?? "").trim() || String(j.up_job_id ?? "").trim());
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanBolehUpload(request);
    const db = supabase();
    const { data, error } = await db
      .from("jadwal_posting")
      .select(
        "id, caption, media_url, is_video, platforms, judul_youtube, jadwal_pada, status, up_request_id, up_job_id, error, dibuat_pada, dibuat_oleh_id",
      )
      // Hanya yang AKTIF. Tanpa saringan ini, setelah 100 baris riwayat
      // (tayang/gagal/dibatalkan) menumpuk di depan, jadwal BARU yang
      // tanggalnya lebih jauh terpotong limit dan tak pernah tampil.
      // Satu-satunya konsumen (panel-jadwal-tayang) memang hanya
      // menampilkan status "terjadwal".
      .eq("status", "terjadwal")
      // Menaik: yang paling dekat tayang tampil paling atas — daftar ini
      // dibaca sebagai "apa yang tayang berikutnya", bukan arsip.
      .order("jadwal_pada", { ascending: true })
      .limit(200);
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
        // upload-post tak bisa membatalkan jadwal (405): hanya jadwal yang
        // belum pernah dikirim ke sana yang boleh dibatalkan dari aplikasi.
        bisa_dibatalkan: !sudahDikirim(j),
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const pengguna = await pastikanBolehUpload(request);
    await pastikanFiturAktif(pengguna, "tv.upload", "Fitur posting sedang dimatikan untuk peran Anda.");

    const body = (await request.json().catch(() => ({}))) as {
      caption?: string;
      media_url?: string;
      media_public_id?: string;
      is_video?: boolean;
      platforms?: string[];
      judul_youtube?: string;
      jadwal_pada?: string;
      /** Kode video di antrian produksi — menjahit jadwal ke catatannya. */
      kode?: string;
    };

    const caption = (body.caption ?? "").trim();
    const mediaUrl = (body.media_url ?? "").trim();
    // Platform video (IG/TikTok/YouTube) menolak posting tanpa media.
    if (!/^https?:\/\/\S+$/i.test(mediaUrl)) {
      throw Object.assign(new Error("Media (foto/video) wajib diunggah dulu."), { status: 400 });
    }
    // Jalur upload-post Official (unggahVideoUp) hanya untuk video.
    if (body.is_video === false) {
      throw Object.assign(new Error("Penjadwalan foto belum didukung — hanya video yang bisa dijadwalkan."), {
        status: 400,
      });
    }

    const diminta = (body.platforms ?? [])
      .map((p) => String(p).toLowerCase())
      .filter((p) => PLATFORM_DIKENAL.has(p));
    if (diminta.length === 0) {
      throw Object.assign(new Error("Pilih minimal satu platform tujuan."), { status: 400 });
    }

    // Platform: hanya yang dikenal DAN benar-benar tertaut (izinnya sehat)
    // di profil upload-post Official — menjadwalkan ke akun yang tak
    // tertaut hanya melahirkan galat nanti. 503/409 dilempar apa adanya.
    const official = await pastikanOfficialUp();
    const tertaut = new Set(official.platform);
    const platforms = diminta.filter((p) => tertaut.has(p));
    if (platforms.length === 0) {
      throw Object.assign(
        new Error(`Tak ada platform terpilih yang tertaut. ${PESAN_OFFICIAL_BELUM_TERTAUT}`),
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
    // upload-post (`scheduled_date`) dalam format UTC "YYYY-MM-DDThh:mm:ssZ".
    const t = new Date(body.jadwal_pada ?? "");
    if (Number.isNaN(t.getTime())) {
      throw Object.assign(new Error("Waktu jadwal tidak sah."), { status: 400 });
    }
    if (t.getTime() < Date.now() + 5 * 60 * 1000) {
      throw Object.assign(new Error("Jadwal minimal 5 menit dari sekarang."), { status: 400 });
    }
    const scheduleDate = t.toISOString().replace(/\.\d{3}Z$/, "Z");

    const kodeVideo = (body.kode ?? "").trim().slice(0, 100);

    // Hirarki TV Rakyat — DISAMAKAN dengan /api/tv/unggah: video yang
    // DITOLAK tidak boleh dijadwalkan siapa pun, dan video yang belum
    // disetujui hanya boleh dijadwalkan Pimred/pemegang hak ACC.
    let accTersirat = false;
    if (kodeVideo) {
      const { data: video, error: eVideo } = await supabase()
        .from("video_antrian")
        .select("kode, persetujuan")
        .eq("kode", kodeVideo)
        .maybeSingle();
      if (eVideo) {
        console.error("[tv/jadwal] baca video:", eVideo.message);
        throw new Error("Gagal membaca data video.");
      }
      if (video && video.persetujuan !== "disetujui") {
        if (video.persetujuan === "ditolak") {
          throw Object.assign(
            new Error("Video ini DITOLAK Pimpinan Redaksi dan tidak boleh dijadwalkan."),
            { status: 403 },
          );
        }
        const bolehMemutus = adalahPimred(pengguna) || (await bolehAccVideo(pengguna));
        if (!bolehMemutus) {
          throw Object.assign(
            new Error(
              "Video ini belum disetujui Pimpinan Redaksi. Minta persetujuan dulu sebelum menjadwalkan.",
            ),
            { status: 403 },
          );
        }
        accTersirat = true;
      }
    }

    // Sidik jadwal: pengguna + waktu + platform + media/kode. Dipakai sebagai
    // Idempotency-Key upload-post DAN kunci proses — sidik media+kode WAJIB
    // ikut supaya dua video BERBEDA pada menit & platform yang sama tidak
    // dianggap kembar (video kedua diam-diam tak pernah terbit).
    const platformUrut = [...platforms].sort().join(",");
    const sidikMedia = createHash("sha1").update(`${mediaUrl}|${kodeVideo}`).digest("hex").slice(0, 12);
    const idemp = `jadwal-${pengguna.id}-${t.getTime()}-${platformUrut}-${sidikMedia}`;

    // PAGAR DOBEL lapis 1: kunci proses (klik ganda / permintaan diulang).
    const kunciProses = await ambilKunciUnggah(`tv-jadwal:${idemp}`, 6 * 60);
    if (!kunciProses) throw Object.assign(new Error(PESAN_JADWAL_DOBEL), { status: 409 });

    // PAGAR DOBEL lapis 2: catatan. Jadwal identik yang sudah terkirim
    // dikembalikan apa adanya — upload-post tak bisa membatalkan jadwal,
    // jadi kiriman kedua berarti video tayang DUA kali. Gagal baca = lanjut
    // (kunci proses tetap melindungi).
    try {
      let q = supabase()
        .from("jadwal_posting")
        .select("id, platforms, up_request_id, up_job_id, hasil")
        .eq("status", "terjadwal")
        .eq("media_url", mediaUrl)
        .eq("jadwal_pada", t.toISOString());
      q = kodeVideo ? q.eq("video_kode", kodeVideo) : q.is("video_kode", null);
      const { data: ada } = await q.limit(10);
      const kembar = (ada ?? []).find(
        (b) =>
          sudahDikirim(b) &&
          (Array.isArray(b.platforms) ? (b.platforms as unknown[]).map(String).sort().join(",") : "") === platformUrut,
      );
      if (kembar) {
        await kunciProses.lepas();
        return {
          sukses: true,
          id: String(kembar.id),
          up_request_id: kembar.up_request_id ?? null,
          up_job_id: kembar.up_job_id ?? null,
          status: "terjadwal",
          hasil: (Array.isArray(kembar.hasil) ? kembar.hasil : []) as HasilUnggahPlatform[],
        };
      }
    } catch (e) {
      console.error("[tv/jadwal] cek dobel:", e instanceof Error ? e.message : e);
    }

    // Persetujuan tersirat dicatat SETELAH semua pemeriksaan murah lolos
    // (pola yang sama dengan unggah langsung, lihat /api/tv/unggah). Tanpa
    // ini Riwayat selamanya menampilkan "menunggu" untuk video yang
    // jadwalnya sudah pasti.
    if (accTersirat) {
      const { error: eAcc } = await supabase()
        .from("video_antrian")
        .update({
          persetujuan: "disetujui",
          persetujuan_oleh: pengguna.nama,
          persetujuan_pada: new Date().toISOString(),
        })
        .eq("kode", kodeVideo);
      if (eAcc) console.error("[tv/jadwal] acc tersirat:", eAcc.message);
    }

    // Caption apa adanya di semua platform (lewat captionPer, supaya
    // TikTok/IG/Threads/X tidak mendapat judul di depan caption); judul
    // YouTube/Facebook = judul_youtube (cadangan: baris pertama caption).
    const judul = (body.judul_youtube ?? "").trim() || caption.split("\n")[0]?.trim() || "TV Rakyat";
    let balasan: Awaited<ReturnType<typeof unggahVideoUp>>;
    try {
      balasan = await unggahVideoUp({
        profil: official.profil,
        videoUrl: mediaUrl,
        judul,
        caption,
        platforms,
        scheduleDate,
        captionPer: caption ? Object.fromEntries(platforms.map((p) => [p, caption])) : undefined,
        kunciIdempotensi: idemp,
      });
    } catch (e) {
      // Galat AMBIGU (timeout/jaringan/5xx): jadwal mungkin sudah diterima —
      // tahan kunci supaya "Coba lagi" langsung tidak menjadwalkan dobel.
      const st = Number((e as { status?: number })?.status);
      const ambigu = !Number.isFinite(st) || st >= 500;
      await kunciProses.lepas(ambigu ? TAHAN_AMBIGU_DETIK : 0);
      throw e;
    }

    // Jadwal dibalas job_id (HTTP 202); request_id disimpan bila ada.
    const mentah = balasan.mentah as { request_id?: unknown; job_id?: unknown; message?: unknown; error?: unknown };
    const upRequestId = String(mentah.request_id ?? "").trim() || null;
    const upJobId = String(mentah.job_id ?? "").trim() || null;
    const peta = hasilPerPlatformUp(balasan.mentah);
    const pesanTolak = String(mentah.message ?? mentah.error ?? "").slice(0, 300);
    const hasil: HasilUnggahPlatform[] = platforms.map((p) => {
      const r = peta.get(p);
      if (r?.sukses === false || (!r && !balasan.sukses)) {
        return { platform: p, status: "error", id: "", postUrl: "", pesan: r?.pesan || pesanTolak || "Ditolak upload-post." };
      }
      return { platform: p, status: "scheduled", id: "", postUrl: "", pesan: "" };
    });
    const galat = hasil.filter((h) => h.status === "error");
    const diterima = Boolean(upRequestId || upJobId) && galat.length < hasil.length;

    const { data: baris, error } = await supabase()
      .from("jadwal_posting")
      .insert({
        dibuat_oleh_id: Number(pengguna.id),
        caption,
        media_url: mediaUrl,
        media_public_id: (body.media_public_id ?? "").trim() || null,
        is_video: true,
        platforms,
        judul_youtube: (body.judul_youtube ?? "").trim() || null,
        jadwal_pada: t.toISOString(),
        // Tanpa ini, video yang dijadwalkan tayang tidak pernah kembali
        // menyentuh catatannya sendiri (lihat lib/jadwal-tayang).
        video_kode: kodeVideo || null,
        status: diterima ? "terjadwal" : "gagal",
        up_request_id: upRequestId,
        up_job_id: upJobId,
        hasil,
        error:
          galat.length > 0
            ? galat.map((h) => `${h.platform}: ${h.pesan}`).join("; ").slice(0, 500)
            : diterima
              ? null
              : "upload-post tidak memberi id jadwal.",
      })
      .select("id")
      .single();
    if (error) {
      console.error("[tv/jadwal] simpan:", error.message);
      // Catatan tak tersimpan = lapis 2 buta terhadap jadwal ini: tahan kunci.
      await kunciProses.lepas(diterima ? TAHAN_AMBIGU_DETIK : 0);
      throw new Error(
        diterima
          ? "Terjadwal di upload-post, tetapi catatannya gagal disimpan. Jangan jadwalkan ulang."
          : "Jadwal ditolak upload-post dan catatannya gagal disimpan.",
      );
    }
    // Tahan sebentar sampai baris catatan pasti terbaca proses lain.
    await kunciProses.lepas(diterima ? 90 : 0);

    if (!diterima) {
      throw Object.assign(
        new Error(
          `Jadwal ditolak upload-post${galat.length > 0 ? `: ${galat.map((h) => `${h.platform} (${h.pesan})`).join("; ")}` : "."}`.slice(0, 600),
        ),
        { status: 502 },
      );
    }

    // Tandai videonya "menunggu jadwal" supaya Riwayat Video menampilkan
    // kapan ia akan tayang. Gagal menandai bukan alasan menggagalkan
    // jadwal yang sudah diterima upload-post.
    if (kodeVideo) {
      const { error: eTandai } = await supabase()
        .from("video_antrian")
        .update({ jadwal_pada: t.toISOString() })
        .eq("kode", kodeVideo);
      if (eTandai) console.error("[tv/jadwal] tandai video:", eTandai.message);
    }

    return {
      sukses: true,
      id: String(baris.id),
      up_request_id: upRequestId,
      up_job_id: upJobId,
      status: "terjadwal",
      hasil,
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
      .select("id, status, up_request_id, up_job_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw Object.assign(new Error("Jadwal tidak ditemukan."), { status: 404 });
    if (row.status !== "terjadwal") {
      throw Object.assign(new Error("Hanya jadwal yang belum tayang bisa dibatalkan."), {
        status: 409,
      });
    }
    // upload-post tidak menyediakan pembatalan lewat API (DELETE ditolak
    // 405). Menandai "dibatalkan" secara lokal justru menyesatkan: postingan
    // tetap tayang pada waktunya.
    if (sudahDikirim(row)) {
      throw Object.assign(new Error(PESAN_TAK_BISA_BATAL), { status: 409 });
    }

    // Jadwal yang tak pernah dikirim ke upload-post (jadwal lama) cukup
    // ditutup di aplikasi — tidak ada yang akan menerbitkannya.
    const { error } = await db
      .from("jadwal_posting")
      .update({ status: "dibatalkan", diperbarui_pada: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error("Status jadwal gagal diperbarui.");
    return { sukses: true };
  });
}
