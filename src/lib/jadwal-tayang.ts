// ============================================================
// PENCOCOK JADWAL TAYANG TV RAKYAT (15 Sep 2026)
//
// Ayrshare menerbitkan postingan terjadwal SENDIRI pada waktunya, dan
// tidak memberi tahu siapa pun. Tanpa berkas ini, video yang dijadwalkan
// tayang di sosmed tetapi di aplikasi selamanya berstatus "Siap Ditinjau":
// tidak masuk kanal Konten, tidak jadi kewajiban komentar, tidak tercatat
// sebagai tayang. Di sinilah lingkarannya ditutup.
//
// Yang PENTING soal tanggal: seluruh catatan memakai **waktu jadwal**,
// bukan waktu pencocokan. Video yang dijadwalkan pukul 13.00 besok akan
// tercatat tayang pukul 13.00 besok, walau pencocoknya baru berjalan
// pukul 13.05 — kalau memakai waktu pencocokan, laporannya akan meleset
// mengikuti irama cron, bukan mengikuti jadwal yang ditentukan orang.
// ============================================================
import { supabase } from "@/lib/supabase";
import { statusPostingan, type HasilUnggahPlatform } from "@/lib/ayrshare";
import { daftarkanVideoUnggahan } from "@/lib/sinkron-konten-tv";
import { retensiJamTv } from "@/lib/pengaturan-tv";
import { kirimKabar } from "@/lib/notifikasi";

/** Berapa banyak jadwal diperiksa dalam satu sapuan. */
const MAKS_PER_SAPUAN = 12;

/**
 * Jeda sebelum sebuah jadwal diperiksa. Ayrshare butuh waktu menerbitkan
 * (unggah ke 6 platform tidak seketika); menanyakannya persis pada detik
 * jadwalnya hampir pasti menjawab "belum".
 */
const TENGGANG_MENIT = 3;

/** Postingan dianggap tayang bila ada id/URL — sama dengan jalur unggah langsung. */
function tayang(h: HasilUnggahPlatform): boolean {
  return h.status !== "error" && Boolean(h.id || h.postUrl);
}

export type HasilRekonsiliasi = {
  diperiksa: number;
  selesai: number;
  gagal: number;
  belum: number;
};

type BarisJadwal = {
  id: number;
  ayrshare_id: string | null;
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
    .select("id, ayrshare_id, jadwal_pada, video_kode, platforms, caption, dibuat_oleh_id")
    .eq("status", "terjadwal")
    .lte("jadwal_pada", batas)
    .order("jadwal_pada")
    .limit(MAKS_PER_SAPUAN);
  if (error) {
    // Kolom video_kode baru ada sejak sql/56; tanpa migrasi, lewati diam
    // alih-alih membanjiri log tiap 5 menit.
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

async function selesaikanSatu(baris: BarisJadwal, hasil: HasilRekonsiliasi): Promise<void> {
  const db = supabase();

  if (!baris.ayrshare_id) {
    await db
      .from("jadwal_posting")
      .update({ status: "gagal", error: "Tidak punya id Ayrshare — jadwal tidak pernah terkirim.", diperbarui_pada: new Date().toISOString() })
      .eq("id", baris.id);
    hasil.gagal += 1;
    return;
  }

  const keadaan = await statusPostingan(baris.ayrshare_id);
  if (keadaan === null) {
    await db
      .from("jadwal_posting")
      .update({ status: "gagal", error: "Jadwal tidak dikenali lagi oleh Ayrshare (mungkin sudah dihapus).", diperbarui_pada: new Date().toISOString() })
      .eq("id", baris.id);
    hasil.gagal += 1;
    return;
  }

  const terbit = keadaan.hasil.filter(tayang);
  const galat = keadaan.hasil.filter((h) => h.status === "error");

  // Belum ada kabar apa pun: biarkan "terjadwal" dan coba lagi nanti.
  // Ayrshare kadang lambat; menandainya gagal terlalu dini akan membuat
  // video yang sebenarnya tayang tercatat sebagai kegagalan.
  if (terbit.length === 0 && galat.length === 0) {
    hasil.belum += 1;
    return;
  }

  const waktuJadwal = baris.jadwal_pada; // ← acuan SEMUA catatan di bawah
  await db
    .from("jadwal_posting")
    .update({
      status: terbit.length > 0 ? "terkirim" : "gagal",
      hasil: keadaan.hasil,
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
    .select("kode, judul, judul_overlay, caption_asli, thumbnail_url, platform_terunggah, ayrshare_hasil")
    .eq("kode", baris.video_kode)
    .maybeSingle();
  if (!video) return;

  const hasilLama = (Array.isArray(video.ayrshare_hasil) ? video.ayrshare_hasil : []) as HasilUnggahPlatform[];
  const platformBaru = new Set(keadaan.hasil.map((h) => h.platform.toLowerCase()));
  const hasilGabung = [
    ...hasilLama.filter((h) => !platformBaru.has(String(h.platform ?? "").toLowerCase())),
    ...keadaan.hasil,
  ];

  const perubahan: Record<string, unknown> = {
    ayrshare_hasil: hasilGabung,
    // Waktu JADWAL, bukan waktu pencocokan — lihat catatan di kepala berkas.
    diunggah_pada: waktuJadwal,
    jadwal_pada: null,
  };

  if (terbit.length > 0) {
    const sebelumnya = (video.platform_terunggah ?? []) as string[];
    perubahan.platform_terunggah = Array.from(new Set([...sebelumnya, ...terbit.map((h) => h.platform)]));
    perubahan.status = "SUDAH DIPROSES";
    const tautanUtama =
      terbit.find((h) => h.platform === "instagram")?.postUrl ?? terbit.find((h) => h.postUrl)?.postUrl ?? "";
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
