// ============================================================
// PENCOCOK JADWAL TAYANG TV RAKYAT (15 Sep 2026; upload-post 16 Okt 2026)
//
// upload-post menerbitkan postingan terjadwal SENDIRI pada waktunya
// (`scheduled_date`), dan tidak memberi tahu siapa pun. Tanpa berkas ini,
// video yang dijadwalkan tayang di sosmed tetapi di aplikasi selamanya
// berstatus "Siap Ditinjau": tidak masuk kanal Konten, tidak jadi
// kewajiban komentar, tidak tercatat sebagai tayang. Di sinilah
// lingkarannya ditutup — lewat GET /uploadposts/status (statusUnggahUp)
// memakai request_id / job_id yang disimpan /api/tv/jadwal.
//
// Yang PENTING soal tanggal: seluruh catatan memakai **waktu jadwal**,
// bukan waktu pencocokan. Video yang dijadwalkan pukul 13.00 besok akan
// tercatat tayang pukul 13.00 besok, walau pencocoknya baru berjalan
// pukul 13.05 — kalau memakai waktu pencocokan, laporannya akan meleset
// mengikuti irama cron, bukan mengikuti jadwal yang ditentukan orang.
// ============================================================
import { supabase } from "@/lib/supabase";
import { analitikPostUp, PETA_PLATFORM_UP, statusUnggahUp } from "@/lib/upload-post";
import { bacaHasilUnggah, tayangAtauDiproses, type HasilUnggahPlatform } from "@/lib/unggah-hasil";
import { daftarkanVideoUnggahan } from "@/lib/sinkron-konten-tv";
import { retensiJamTv } from "@/lib/pengaturan-tv";
import { kirimKabar } from "@/lib/notifikasi";

// ------------------------------------------------------------
// Pembaca hasil per platform dari balasan upload-post — dipakai juga oleh
// /api/tv/unggah (balasan unggah sinkron) supaya dua jalur Official
// memetakan balasan dengan cara yang sama.
// ------------------------------------------------------------

/** Nama platform upload-post → nama aplikasi ("x" → "twitter"). */
const DARI_UP: Record<string, string> = Object.fromEntries(
  Object.entries(PETA_PLATFORM_UP).map(([app, up]) => [up, app]),
);

export type HasilPlatformUp = {
  /** true = terbit, false = ditolak, null = belum ada kepastian. */
  sukses: boolean | null;
  url: string;
  id: string;
  pesan: string;
};

function teksPertama(o: Record<string, unknown>, kunci: string[], polaUrl = false): string {
  for (const k of kunci) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) {
      if (polaUrl && !/^https?:\/\//i.test(v.trim())) continue;
      return v.trim();
    }
    if (!polaUrl && typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

/**
 * Hasil per platform (nama APLIKASI) dari balasan upload-post — balasan
 * unggah sinkron maupun /uploadposts/status. `results` bisa berbentuk
 * daftar `[{platform, success, ...}]` atau objek `{tiktok: {success, ...}}`;
 * keduanya dibaca. Balasan latar ("initiated in background") tidak memuat
 * results → peta kosong.
 */
export function hasilPerPlatformUp(mentah: unknown): Map<string, HasilPlatformUp> {
  const d = (mentah && typeof mentah === "object" ? mentah : {}) as Record<string, unknown>;
  const peta = new Map<string, HasilPlatformUp>();
  const masukkan = (namaUp: string, o: Record<string, unknown>) => {
    const up = namaUp.trim().toLowerCase();
    if (!up) return;
    const app = DARI_UP[up] ?? up;
    const urlLangsung = teksPertama(o, ["post_url", "url", "permalink", "share_url", "link"], true);
    const post = (o.post && typeof o.post === "object" ? o.post : {}) as Record<string, unknown>;
    peta.set(app, {
      sukses: o.success === true ? true : o.success === false ? false : null,
      url: urlLangsung || teksPertama(post, ["post_url", "url", "permalink"], true),
      id: teksPertama(o, ["platform_post_id", "post_id", "publish_id", "video_id", "media_id", "id"]),
      pesan: teksPertama(o, ["error_message", "error", "message"]).slice(0, 300),
    });
  };
  const wadah = d.results;
  if (Array.isArray(wadah)) {
    for (const r of wadah) {
      if (r && typeof r === "object") masukkan(String((r as Record<string, unknown>).platform ?? ""), r as Record<string, unknown>);
    }
  } else if (wadah && typeof wadah === "object") {
    for (const [nama, isi] of Object.entries(wadah as Record<string, unknown>)) {
      if (isi && typeof isi === "object" && !Array.isArray(isi)) masukkan(nama, isi as Record<string, unknown>);
    }
  }
  return peta;
}

/**
 * Satu entri HasilUnggahPlatform dari hasil upload-post. Platform yang
 * terbit tapi tautannya belum ada dicatat "processing" (bukan "success"
 * tanpa id) supaya tayangAtauDiproses tetap menganggapnya tidak gagal.
 */
export function entriHasilUp(platform: string, r: HasilPlatformUp | undefined, pesanTanpaKabar: string): HasilUnggahPlatform {
  if (r?.sukses === false) {
    return { platform, status: "error", id: "", postUrl: "", pesan: r.pesan || "Ditolak platform (tanpa keterangan dari upload-post)." };
  }
  if (r && (r.url || r.id) && r.sukses !== null) {
    return { platform, status: "success", id: r.id, postUrl: r.url, pesan: "" };
  }
  return {
    platform,
    status: "processing",
    id: r?.id ?? "",
    postUrl: r?.url ?? "",
    pesan: r?.sukses === true ? "Terbit menurut upload-post; tautan postingan menyusul." : pesanTanpaKabar,
  };
}

// ------------------------------------------------------------
// Rekonsiliasi jadwal
// ------------------------------------------------------------

/** Berapa banyak jadwal diperiksa dalam satu sapuan. */
const MAKS_PER_SAPUAN = 12;

/**
 * Jeda sebelum sebuah jadwal diperiksa. upload-post butuh waktu menerbitkan
 * (unggah ke 6 platform tidak seketika); menanyakannya persis pada detik
 * jadwalnya hampir pasti menjawab "belum".
 */
const TENGGANG_MENIT = 3;

/**
 * Setelah selama ini lewat dari jadwal tanpa kepastian, jadwal ditutup
 * dengan apa yang ada: platform yang tetap tanpa kabar dicatat gagal.
 * Mencegah jadwal menggantung "menunggu hasil" selamanya.
 */
const BATAS_TANPA_KABAR_JAM = 24;

/** Status upload-post yang berarti pekerjaannya sudah selesai (berhasil/gagal). */
const STATUS_AKHIR = new Set(["completed", "complete", "finished", "done", "failed", "error", "success"]);

/** Postingan dianggap tayang bila ada id/URL atau masih diproses — sama dengan jalur unggah langsung. */
function tayang(h: HasilUnggahPlatform): boolean {
  return tayangAtauDiproses(h.status, h.id, h.postUrl);
}

export type HasilRekonsiliasi = {
  diperiksa: number;
  selesai: number;
  gagal: number;
  belum: number;
};

type BarisJadwal = {
  id: number;
  up_request_id: string | null;
  up_job_id: string | null;
  jadwal_pada: string;
  video_kode: string | null;
  platforms: string[] | null;
  caption: string | null;
  dibuat_oleh_id: number | null;
};

/**
 * Periksa jadwal yang waktunya sudah lewat, lalu selesaikan catatannya.
 * Tidak pernah melempar — dipanggil dari cron; satu jadwal bermasalah
 * tidak boleh menghentikan yang lain.
 */
export async function rekonsiliasiJadwalTayang(): Promise<HasilRekonsiliasi> {
  const hasil: HasilRekonsiliasi = { diperiksa: 0, selesai: 0, gagal: 0, belum: 0 };
  const db = supabase();
  const batas = new Date(Date.now() - TENGGANG_MENIT * 60_000).toISOString();

  const { data, error } = await db
    .from("jadwal_posting")
    .select("id, up_request_id, up_job_id, jadwal_pada, video_kode, platforms, caption, dibuat_oleh_id")
    .eq("status", "terjadwal")
    .lte("jadwal_pada", batas)
    .order("jadwal_pada")
    .limit(MAKS_PER_SAPUAN);
  if (error) {
    // Kolom up_request_id/up_job_id baru ada setelah migrasi upload-post;
    // tanpa migrasi, lewati diam alih-alih membanjiri log tiap 5 menit.
    if (error.code !== "42703") console.error("[jadwal-tayang] baca:", error.message);
    return hasil;
  }

  for (const baris of (data ?? []) as BarisJadwal[]) {
    hasil.diperiksa += 1;
    try {
      await selesaikanSatu(baris, hasil);
    } catch (e) {
      console.error("[jadwal-tayang] jadwal", baris.id, e);
    }
  }
  return hasil;
}

async function tandaiGagal(id: number, pesan: string): Promise<void> {
  await supabase()
    .from("jadwal_posting")
    .update({ status: "gagal", error: pesan, diperbarui_pada: new Date().toISOString() })
    .eq("id", id);
}

async function selesaikanSatu(baris: BarisJadwal, hasil: HasilRekonsiliasi): Promise<void> {
  const db = supabase();
  const requestId = String(baris.up_request_id ?? "").trim();
  const jobId = String(baris.up_job_id ?? "").trim();

  if (!requestId && !jobId) {
    // Jadwal lama (zaman Ayrshare) atau yang tak pernah diterima upload-post.
    await tandaiGagal(baris.id, "Jadwal ini tidak pernah terkirim ke upload-post (jadwal lama) — tidak akan tayang.");
    hasil.gagal += 1;
    return;
  }

  const lewatJam = (Date.now() - Date.parse(baris.jadwal_pada)) / 3_600_000;
  const sudahTerlaluLama = Number.isFinite(lewatJam) && lewatJam > BATAS_TANPA_KABAR_JAM;

  // request_id lebih dulu (jejak unggahan yang sudah berjalan); job_id
  // dipakai bila upload-post hanya memberi id pekerjaan terjadwal.
  let keadaan: Awaited<ReturnType<typeof statusUnggahUp>>;
  try {
    keadaan = requestId ? await statusUnggahUp(requestId, 20000, "request") : await statusUnggahUp(jobId, 20000, "job");
  } catch (e) {
    const st = Number((e as { status?: number })?.status);
    if (st === 404 && sudahTerlaluLama) {
      await tandaiGagal(baris.id, "Jadwal tidak dikenali upload-post (lebih dari 24 jam tanpa kabar).");
      hasil.gagal += 1;
      return;
    }
    // Belum dikenal / gangguan sesaat: coba lagi pada sapuan berikutnya.
    hasil.belum += 1;
    return;
  }

  const statusUp = keadaan.status.toLowerCase();
  const final = STATUS_AKHIR.has(statusUp) || sudahTerlaluLama;
  const peta = hasilPerPlatformUp(keadaan.mentah);
  // Lengkapi dari bacaan per platform statusUnggahUp (alasan gagal di error_message).
  for (const [pf, s] of Object.entries(keadaan.per)) {
    const ada = peta.get(pf);
    if (!ada) peta.set(pf, { sukses: s.sukses ? true : final ? false : null, url: "", id: "", pesan: s.pesan });
    else if (!ada.pesan && s.pesan) ada.pesan = s.pesan;
  }

  const platforms = (baris.platforms ?? []).map((p) => String(p).toLowerCase()).filter(Boolean);
  const daftar = platforms.length > 0 ? platforms : [...peta.keys()];
  const pesanUmum = String((keadaan.mentah as { message?: string } | null)?.message ?? "").slice(0, 300);

  // Platform yang terbit tanpa tautan: tanyakan URL pastinya (post-analytics).
  const ridAnalitik =
    requestId || String((keadaan.mentah as { request_id?: string } | null)?.request_id ?? "").trim();
  if (ridAnalitik && daftar.some((pf) => peta.get(pf)?.sukses === true && !peta.get(pf)?.url)) {
    try {
      const pasti = await analitikPostUp(ridAnalitik);
      for (const pf of daftar) {
        const r = peta.get(pf);
        const p = pasti.get(pf);
        if (r && r.sukses === true && !r.url && p?.post_url) {
          r.url = p.post_url;
          if (!r.id) r.id = p.post_id;
        }
      }
    } catch {
      // URL bisa menyusul; status terbitnya tetap tercatat.
    }
  }

  const hasilBaru: HasilUnggahPlatform[] = daftar.map((pf) => {
    const r = peta.get(pf);
    if (!r || r.sukses === null) {
      if (statusUp === "failed" || statusUp === "error") {
        return { platform: pf, status: "error", id: "", postUrl: "", pesan: r?.pesan || pesanUmum || "upload-post menyatakan jadwal ini gagal." };
      }
      if (final) {
        return { platform: pf, status: "error", id: "", postUrl: "", pesan: r?.pesan || "Tidak ada kabar terbit dari upload-post." };
      }
    }
    return entriHasilUp(pf, r, "Masih diproses upload-post.");
  });

  // Belum final dan masih ada platform tanpa kepastian: biarkan "terjadwal"
  // dan coba lagi nanti — menandainya gagal terlalu dini membuat video
  // yang sebenarnya tayang tercatat sebagai kegagalan.
  const masihMenunggu = daftar.some((pf) => {
    const r = peta.get(pf);
    return !r || r.sukses === null;
  });
  if (!final && masihMenunggu) {
    hasil.belum += 1;
    return;
  }

  const terbit = hasilBaru.filter(tayang);
  const galat = hasilBaru.filter((h) => h.status === "error");

  const waktuJadwal = baris.jadwal_pada; // ← acuan SEMUA catatan di bawah
  await db
    .from("jadwal_posting")
    .update({
      status: terbit.length > 0 ? "terkirim" : "gagal",
      hasil: hasilBaru,
      ...(ridAnalitik && !requestId ? { up_request_id: ridAnalitik } : {}),
      error: galat.length > 0 ? galat.map((h) => `${h.platform}: ${h.pesan}`).join("; ").slice(0, 500) : null,
      diperbarui_pada: new Date().toISOString(),
    })
    .eq("id", baris.id);

  if (terbit.length > 0) hasil.selesai += 1;
  else hasil.gagal += 1;

  // Tanpa video pipeline yang tertaut, tidak ada catatan lain yang perlu
  // diperbarui — jadwal berdiri sendiri (mis. posting foto biasa).
  if (!baris.video_kode) return;

  const { data: video } = await db
    .from("video_antrian")
    .select("kode, judul, judul_overlay, caption_asli, thumbnail_url, platform_terunggah, unggah_hasil")
    .eq("kode", baris.video_kode)
    .maybeSingle();
  if (!video) return;

  const hasilLama = bacaHasilUnggah(video.unggah_hasil);
  const platformBaru = new Set(hasilBaru.map((h) => h.platform.toLowerCase()));
  const hasilGabung = [
    ...hasilLama.filter((h) => !platformBaru.has(h.platform.toLowerCase())),
    ...hasilBaru,
  ];

  const perubahan: Record<string, unknown> = {
    unggah_hasil: hasilGabung,
    // Waktu JADWAL, bukan waktu pencocokan — lihat catatan di kepala berkas.
    diunggah_pada: waktuJadwal,
    jadwal_pada: null,
  };

  if (terbit.length > 0) {
    const sebelumnya = (video.platform_terunggah ?? []) as string[];
    perubahan.platform_terunggah = Array.from(new Set([...sebelumnya, ...terbit.map((h) => h.platform)]));
    perubahan.status = "SUDAH DIPROSES";
    const tautanUtama =
      terbit.find((h) => h.platform === "instagram" && h.postUrl)?.postUrl ?? terbit.find((h) => h.postUrl)?.postUrl ?? "";
    if (tautanUtama) perubahan.link_instagram = tautanUtama;
    // Umur tayang dihitung dari JADWAL, supaya video yang tayang nanti
    // tidak langsung dianggap kedaluwarsa oleh penyapu media.
    perubahan.hapus_media_pada = new Date(
      Date.parse(waktuJadwal) + (await retensiJamTv()) * 3600_000,
    ).toISOString();
  }

  await db.from("video_antrian").update(perubahan).eq("kode", baris.video_kode);

  if (terbit.length > 0) {
    // Daftarkan ke kanal Konten + kewajiban komentar — persis seperti
    // jalur unggah langsung, hanya terjadi belakangan.
    await daftarkanVideoUnggahan({
      posting: terbit.filter((h) => h.postUrl).map((h) => ({ platform: h.platform, id: h.id, postUrl: h.postUrl })),
      caption: video.caption_asli ?? baris.caption ?? "",
      thumbnailUrl: video.thumbnail_url ?? "",
    }).catch((e) => console.error("[jadwal-tayang] daftar konten:", e));
  }

  const judul = video.judul_overlay || video.judul || baris.video_kode;
  const penerima = baris.dibuat_oleh_id ? [Number(baris.dibuat_oleh_id)] : [];
  if (penerima.length > 0) {
    await kirimKabar({
      judul: terbit.length > 0 ? "Video terjadwal sudah tayang ✅" : "⚠ Video terjadwal gagal tayang",
      isi:
        terbit.length > 0
          ? `"${judul}" tayang sesuai jadwal di ${terbit.map((h) => h.platform).join(", ")}.`
          : `"${judul}" tidak berhasil tayang. Buka TV Rakyat → Riwayat Video untuk melihat alasannya.`,
      kategori: terbit.length > 0 ? "sukses" : "peringatan",
      jenis_peristiwa: "tv_jadwal",
      untukUserIds: penerima,
    }).catch(() => undefined);
  }
}
