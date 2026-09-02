// ============================================================
// SIARAN SERENTAK (3 Sep 2026) — satu video, sekali klik, terkirim ke
// banyak profil upload-post. KHUSUS SISI SERVER.
//
// Cara kerja:
//   1. /api/tvr/siaran POST menyimpan 1 baris induk (tvr_siaran: video,
//      judul, caption, platform, jadwal) + 1 baris per profil tujuan
//      (tvr_siaran_item, status 'menunggu').
//   2. prosesSiaranSerentak() (dipanggil lewat after() saat siaran dibuat
//      dan tiap kali layar memantau) mengklaim item satu per satu secara
//      ATOMIK (update status menunggu→diproses) lalu memanggil upload-post
//      untuk profil itu. Dua permintaan berbarengan tidak pernah memposting
//      item yang sama dua kali.
//   3. Tiap item yang terkirim juga dicatat ke tvrku_post milik anggota
//      pemilik profil (video_path kosong = bukan berkas miliknya), supaya
//      muncul di TVR Saya-nya dan ikut KPI otomatis.
//
// Anggaran waktu: upload-post bisa 30–180 dtk per profil (mereka mengunduh
// videonya). Item baru hanya dimulai bila sisa waktu masih cukup untuk
// satu panggilan terlama, sehingga fungsi tak pernah melewati maxDuration.
// Sisanya diselesaikan sapuan berikutnya (layar memantau tiap 10 dtk).
// ============================================================
import { supabase } from "@/lib/supabase";
import { unggahVideoUp, uploadPostSiap } from "@/lib/upload-post";
import { PLATFORM_KPI } from "@/lib/kpi-video";
import { dariR2, hapusVideoR2 } from "@/lib/r2";

/** Timeout terlama satu panggilan upload-post (lihat unggahVideoUp). */
const PANGGILAN_TERLAMA_MS = 180_000;
/** Item 'diproses' lebih lama dari ini dianggap terputus (fungsi mati). */
const BASI_DIPROSES_MENIT = 15;
/** Maks item per sapuan — pagar tambahan di luar anggaran waktu. */
const MAKS_ITEM_PER_SAPUAN = 6;

type Induk = {
  id: number;
  judul: string;
  caption: string;
  video_url: string;
  jadwal: string | null;
  status: string;
};

/**
 * Proses item siaran yang masih menunggu. `anggaranMs` = total waktu yang
 * boleh dipakai sapuan ini (pemanggil menyesuaikan dengan maxDuration-nya).
 */
export async function prosesSiaranSerentak(anggaranMs = 240_000): Promise<void> {
  try {
    if (!uploadPostSiap()) return;
    const mulai = Date.now();
    const db = supabase();

    // Item yang terputus (fungsi mati saat memanggil upload-post) → gagal,
    // JANGAN diulang otomatis: mungkin sudah terposting di sana.
    const basi = new Date(Date.now() - BASI_DIPROSES_MENIT * 60_000).toISOString();
    await db
      .from("tvr_siaran_item")
      .update({
        status: "gagal",
        pesan: "Terputus saat mengirim — periksa di upload-post sebelum mengirim ulang.",
        selesai_pada: new Date().toISOString(),
      })
      .eq("status", "diproses")
      .lt("diproses_pada", basi);

    const { data: kandidat } = await db
      .from("tvr_siaran_item")
      .select("id, siaran_id, profil, user_id, platforms")
      .eq("status", "menunggu")
      .order("id", { ascending: true })
      .limit(MAKS_ITEM_PER_SAPUAN);
    if (!kandidat || kandidat.length === 0) return;

    const indukIds = [...new Set(kandidat.map((k) => Number(k.siaran_id)))];
    const { data: indukRows } = await db
      .from("tvr_siaran")
      .select("id, judul, caption, video_url, jadwal, status")
      .in("id", indukIds);
    const induk = new Map<number, Induk>(
      (indukRows ?? []).map((r) => [
        Number(r.id),
        {
          id: Number(r.id),
          judul: String(r.judul ?? ""),
          caption: String(r.caption ?? ""),
          video_url: String(r.video_url ?? ""),
          jadwal: r.jadwal ? String(r.jadwal) : null,
          status: String(r.status ?? ""),
        },
      ]),
    );

    for (const item of kandidat) {
      // Sisa waktu harus cukup untuk satu panggilan terlama.
      if (Date.now() - mulai + PANGGILAN_TERLAMA_MS > anggaranMs) break;
      const s = induk.get(Number(item.siaran_id));
      if (!s) continue;
      if (s.status === "dibatalkan") {
        await db
          .from("tvr_siaran_item")
          .update({ status: "dibatalkan", selesai_pada: new Date().toISOString() })
          .eq("id", item.id)
          .eq("status", "menunggu");
        continue;
      }

      // KLAIM atomik — hanya pemenang yang boleh memposting item ini.
      const { data: terkunci } = await db
        .from("tvr_siaran_item")
        .update({ status: "diproses", diproses_pada: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", "menunggu")
        .select("id");
      if (!terkunci || terkunci.length === 0) continue;

      if (s.status === "menunggu") {
        await db.from("tvr_siaran").update({ status: "berjalan" }).eq("id", s.id);
        s.status = "berjalan";
      }

      try {
        const platforms = (item.platforms ?? []).filter((x: string) =>
          (PLATFORM_KPI as readonly string[]).includes(x),
        );
        if (platforms.length === 0) throw new Error("Tidak ada platform tertaut yang cocok.");

        // Jadwal yang sudah lewat = kirim sekarang (antrean bisa lebih lama
        // dari perkiraan).
        const jadwalMs = s.jadwal ? Date.parse(s.jadwal) : NaN;
        const jadwal =
          Number.isFinite(jadwalMs) && jadwalMs > Date.now() + 60_000
            ? new Date(jadwalMs).toISOString()
            : undefined;

        const hasil = await unggahVideoUp({
          profil: String(item.profil),
          videoUrl: s.video_url,
          judul: s.judul,
          caption: s.caption,
          platforms,
          scheduleDate: jadwal,
        });
        if (!hasil.sukses) {
          const galat = (hasil.mentah as { message?: string; error?: string })?.message ??
            (hasil.mentah as { error?: string })?.error;
          throw new Error(String(galat ?? "upload-post menolak kiriman ini."));
        }

        await db
          .from("tvr_siaran_item")
          .update({
            status: "terkirim",
            request_id: hasil.request_id,
            hasil: hasil.mentah,
            pesan: jadwal ? "Terjadwal" : "Terkirim",
            selesai_pada: new Date().toISOString(),
          })
          .eq("id", item.id);

        // Riwayat TVR Saya milik pemilik profil + KPI otomatis.
        if (item.user_id) {
          await db.from("tvrku_post").insert({
            user_id: Number(item.user_id),
            judul: s.judul.slice(0, 100),
            caption: s.caption.slice(0, 2200),
            platforms,
            video_path: "",
            video_url: s.video_url,
            jadwal: jadwal ?? null,
            hasil: hasil.mentah,
            request_id: hasil.request_id,
            hapus_media_pada: null,
          });
        }
      } catch (e) {
        await db
          .from("tvr_siaran_item")
          .update({
            status: "gagal",
            pesan: (e instanceof Error ? e.message : "Gagal memposting").slice(0, 300),
            selesai_pada: new Date().toISOString(),
          })
          .eq("id", item.id);
      }
    }

    // Induk yang semua itemnya sudah beres → 'selesai'.
    for (const id of indukIds) {
      const { count } = await db
        .from("tvr_siaran_item")
        .select("id", { count: "exact", head: true })
        .eq("siaran_id", id)
        .in("status", ["menunggu", "diproses"]);
      if ((count ?? 0) === 0) {
        await db
          .from("tvr_siaran")
          .update({ status: "selesai" })
          .eq("id", id)
          .neq("status", "dibatalkan");
      }
    }
  } catch (e) {
    console.error("[siaran] pemroses:", e);
  }
}

/**
 * Hapus berkas video siaran yang lewat umur (2 jam setelah tayang) —
 * dipanggil dari penyapu media TVR Saya. Postingan di sosmed TIDAK disentuh.
 */
export async function bersihkanMediaSiaran(): Promise<void> {
  try {
    const db = supabase();
    const { data } = await db
      .from("tvr_siaran")
      .select("id, video_path, video_url")
      .not("hapus_media_pada", "is", null)
      .lt("hapus_media_pada", new Date().toISOString())
      .neq("video_path", "")
      .limit(10);
    if (!data || data.length === 0) return;
    const jalurStorage: string[] = [];
    for (const b of data) {
      const path = String(b.video_path ?? "");
      if (!path) continue;
      if (dariR2(String(b.video_url ?? ""))) await hapusVideoR2(path);
      else jalurStorage.push(path);
    }
    if (jalurStorage.length > 0) await db.storage.from("tvrku").remove(jalurStorage);
    await db
      .from("tvr_siaran")
      .update({ hapus_media_pada: null, video_path: "" })
      .in("id", data.map((b) => b.id));
  } catch (e) {
    console.error("[siaran] penyapu media:", e);
  }
}
