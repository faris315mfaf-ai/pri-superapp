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
import { gagalDariBalasan, unggahVideoUp, uploadPostSiap } from "@/lib/upload-post";
import { LABEL_SOSMED } from "@/lib/batas-caption";
import { hasilDenganKegagalan, kabariGagalSebagian } from "@/lib/siaran";
import { PLATFORM_KPI } from "@/lib/kpi-video";
import { PENYEDIA_ANGGOTA } from "@/lib/sosmed-penyedia";
import { sisipkanLonggar } from "@/lib/kolom-struktur";

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
    .in("penyedia", PENYEDIA_ANGGOTA)
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

        // Balasan 200 bisa memuat platform yang langsung dinyatakan gagal —
        // jangan dicatat "terkirim" mentah (pola sama dengan tvr/unggah).
        const gagalAwal = gagalDariBalasan(hasil.mentah);
        const hasilSimpan = hasilDenganKegagalan(hasil.mentah, gagalAwal);
        const namaGagal = gagalAwal.map((g) => LABEL_SOSMED[g.platform] ?? g.platform).join(", ");
        const judulPost = p.caption_umum.slice(0, 100) || "Video PALUGODAM";
        const kabari = async () => {
          if (gagalAwal.length === 0) return;
          try {
            await kabariGagalSebagian(Number(p.user_id), judulPost, gagalAwal);
          } catch (e) {
            console.error("[palugodam] kabar gagal:", e);
          }
        };

        // Semua platform gagal → pesanan gagal, tanpa riwayat TVR Saya.
        // (Tabel tidak punya kolom hasil; rincian ada di `pesan` + kabar ke anggota.)
        if (gagalAwal.length > 0 && platforms.every((pf) => gagalAwal.some((g) => g.platform === pf))) {
          await db
            .from("palugodam_pesanan")
            .update({
              status: "gagal",
              request_id: hasil.request_id,
              pesan: `Gagal di semua sosmed: ${namaGagal}`.slice(0, 300),
            })
            .eq("id", p.id);
          await kabari();
          continue;
        }

        // Sebagian gagal tetap 'terkirim' (tidak ada status 'sebagian' di skema);
        // rincian di `pesan` dan hasil.kpi_gagal pada riwayat TVR Saya.
        await db
          .from("palugodam_pesanan")
          .update({
            status: "terkirim",
            request_id: hasil.request_id,
            pesan: (gagalAwal.length > 0
              ? `Terkirim sebagian — gagal di: ${namaGagal}`
              : jadwal ? "Terjadwal" : "Terkirim"
            ).slice(0, 300),
          })
          .eq("id", p.id);

        // Catat juga di riwayat TVR Saya supaya muncul di layar anggota
        // dan ikut terhitung KPI otomatis seperti unggahan biasa.
        const { error } = await sisipkanLonggar("tvrku_post", {
          user_id: Number(p.user_id),
          judul: judulPost,
          caption: p.caption_umum.slice(0, 2200),
          platforms,
          video_path: "",
          video_url: info.url,
          jadwal: jadwal ?? null,
          hasil: hasilSimpan,
          request_id: hasil.request_id,
          hapus_media_pada: null,
        });
        if (error) console.error("[palugodam] simpan riwayat:", error.message);
        await kabari();
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
