// ============================================================
// PALUGODAM (2 Sep 2026) — "edit otomatis + upload otomatis".
//
// Anggota Divisi PALUGODAM mengisi SATU pop-up:
//   bagian EDIT   : link video sumber + HIGHLIGHT + judul overlay + sumber
//   bagian UPLOAD : caption umum + caption per sosmed + platform + jadwal
//
// Bagian EDIT diserahkan ke workflow n8n "TV Rakyat - Proses Video"
// yang sudah berjalan (unduh → judul/caption → Cloudinary → render
// Creatomate) dan menulis hasilnya ke `video_antrian.hasil_render_url`.
// Bagian UPLOAD disimpan di `palugodam_pesanan`, lalu DIJALANKAN di sini
// begitu rendernya selesai: video hasil render diposting ke sosmed
// PRIBADI anggota lewat upload-post (bukan akun Official/Ayrshare).
//
// TANPA CRON: pemrosesan menumpang permintaan biasa lewat after(),
// pola yang sama dengan penyapu media & rekonsiliasi KPI.
// ============================================================
import { supabase } from "@/lib/supabase";
import { unggahVideoUp, uploadPostSiap } from "@/lib/upload-post";
import { PLATFORM_KPI } from "@/lib/kpi-video";

/** Maks pesanan yang diproses dalam satu sapuan (jaga waktu fungsi). */
const MAKS_PER_SAPUAN = 3;

type BarisPesanan = {
  id: number;
  user_id: number;
  kode_antrian: string;
  platforms: string[];
  caption_umum: string;
  caption_platform: Record<string, string> | null;
  jadwal: string | null;
};

/** Profil upload-post milik user. */
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
 * Proses pesanan PALUGODAM yang rendernya SUDAH selesai tapi videonya
 * belum diposting. Aman dipanggil berkali-kali: setiap baris ditandai
 * lebih dulu (status → 'diproses') sehingga dua permintaan berbarengan
 * tidak memposting dua kali.
 */
export async function prosesPesananPalugodam(userId?: number): Promise<void> {
  try {
    if (!uploadPostSiap()) return;
    const db = supabase();

    let q = db
      .from("palugodam_pesanan")
      .select("id, user_id, kode_antrian, platforms, caption_umum, caption_platform, jadwal")
      .eq("status", "menunggu")
      .order("dibuat_pada", { ascending: true })
      .limit(MAKS_PER_SAPUAN);
    if (userId) q = q.eq("user_id", userId);
    const { data: pesanan } = await q;
    if (!pesanan || pesanan.length === 0) return;

    const kode = pesanan.map((p) => String(p.kode_antrian));
    const { data: antrian } = await db
      .from("video_antrian")
      .select("kode, hasil_render_url, status, pesan_error")
      .in("kode", kode);
    const petaAntrian = new Map(
      (antrian ?? []).map((a) => [
        String(a.kode),
        {
          url: String(a.hasil_render_url ?? ""),
          status: String(a.status ?? ""),
          galat: String(a.pesan_error ?? ""),
        },
      ]),
    );

    for (const p of pesanan as BarisPesanan[]) {
      const info = petaAntrian.get(String(p.kode_antrian));
      if (!info) continue; // n8n belum membuat barisnya — tunggu sapuan berikutnya

      // Render gagal → tandai gagal, jangan menggantung selamanya.
      if (!info.url && info.galat) {
        await db
          .from("palugodam_pesanan")
          .update({ status: "gagal", pesan: info.galat.slice(0, 300) })
          .eq("id", p.id);
        continue;
      }
      if (!info.url) continue; // masih dirender

      // KUNCI baris ini dulu (anti posting dobel bila dua permintaan
      // masuk bersamaan) — hanya yang berhasil mengubah status yang jalan.
      const { data: terkunci } = await db
        .from("palugodam_pesanan")
        .update({ status: "diproses", diproses_pada: new Date().toISOString() })
        .eq("id", p.id)
        .eq("status", "menunggu")
        .select("id");
      if (!terkunci || terkunci.length === 0) continue;

      try {
        const profil = await profilUp(Number(p.user_id));
        if (!profil) throw new Error("Akun TV Rakyat pribadi belum ditautkan.");

        const platforms = (p.platforms ?? []).filter((x) =>
          (PLATFORM_KPI as readonly string[]).includes(x),
        );
        if (platforms.length === 0) throw new Error("Tidak ada platform tujuan.");

        // Jadwal yang sudah lewat diperlakukan sebagai posting langsung
        // (render bisa memakan waktu lebih lama dari perkiraan anggota).
        const jadwalMs = p.jadwal ? Date.parse(p.jadwal) : NaN;
        const jadwal =
          Number.isFinite(jadwalMs) && jadwalMs > Date.now() + 60_000
            ? new Date(jadwalMs).toISOString()
            : undefined;

        const hasil = await unggahVideoUp({
          profil,
          videoUrl: info.url,
          judul: p.caption_umum.slice(0, 100) || "TV Rakyat",
          caption: p.caption_umum,
          platforms,
          scheduleDate: jadwal,
          captionPer: p.caption_platform ?? undefined,
        });

        await db
          .from("palugodam_pesanan")
          .update({
            status: "terkirim",
            request_id: hasil.request_id,
            pesan: jadwal ? "Terjadwal" : "Terkirim",
          })
          .eq("id", p.id);

        // Catat juga di riwayat TVR Saya supaya muncul di layar anggota
        // dan ikut terhitung KPI otomatis seperti unggahan biasa.
        await db.from("tvrku_post").insert({
          user_id: Number(p.user_id),
          judul: p.caption_umum.slice(0, 100) || "Video PALUGODAM",
          caption: p.caption_umum.slice(0, 2200),
          platforms,
          video_path: "",
          video_url: info.url,
          jadwal: jadwal ?? null,
          hasil: hasil.mentah,
          request_id: hasil.request_id,
          hapus_media_pada: null,
        });
      } catch (e) {
        await db
          .from("palugodam_pesanan")
          .update({
            status: "gagal",
            pesan: (e instanceof Error ? e.message : "Gagal memposting").slice(0, 300),
          })
          .eq("id", p.id);
      }
    }
  } catch (e) {
    console.error("[palugodam] proses pesanan:", e);
  }
}
