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
// videonya). Item diproses dalam KELOMPOK paralel (12 Okt 2026, 3 item
// serentak); kelompok baru hanya dimulai bila sisa waktu masih cukup untuk
// satu panggilan terlama + margin, sehingga fungsi tak pernah melewati
// maxDuration. Sisanya diselesaikan sapuan berikutnya (layar memantau tiap
// 10 dtk). Bila upload-post membalas 429 (kuota laju), sapuan dihentikan
// lebih awal dan sisa item menunggu sapuan berikut.
// ============================================================
import { supabase } from "@/lib/supabase";
import { gagalDariBalasan, unggahVideoUp, uploadPostSiap } from "@/lib/upload-post";
import { kirimKabar } from "@/lib/notifikasi";
import { LABEL_SOSMED, solusiGagal } from "@/lib/batas-caption";
import { PLATFORM_KPI } from "@/lib/kpi-video";
import { dariR2, hapusVideoR2 } from "@/lib/r2";
import { sisipkanLonggar } from "@/lib/kolom-struktur";

/** Timeout terlama satu panggilan upload-post (lihat unggahVideoUp). */
const PANGGILAN_TERLAMA_MS = 180_000;
/** Item 'diproses' lebih lama dari ini dianggap terputus (fungsi mati). */
const BASI_DIPROSES_MENIT = 15;
/** Margin pengaman di atas timeout satu unggahan sebelum kelompok baru dimulai. */
const MARGIN_KELOMPOK_MS = 10_000;
/** Item yang dikirim serentak dalam satu kelompok. */
const KONKURENSI_KELOMPOK = 3;
/** Maks item per sapuan (kelipatan konkurensi) — pagar tambahan di luar anggaran waktu. */
const MAKS_ITEM_PER_SAPUAN = 9;

/** Galat 429 dari upload-post (kuota laju) — lihat panggilDenganBatas di upload-post.ts. */
function adalahBatasLaju(e: unknown): boolean {
  const g = e as { status?: number; retryAfterDetik?: unknown } | null;
  return g?.status === 429 || (g !== null && typeof g === "object" && "retryAfterDetik" in g);
}

/**
 * Ubah `hasil` mentah upload-post menjadi versi yang memuat jejak platform
 * yang gagal (kpi_gagal + kpi_gagal_alasan) — kunci yang sama dengan
 * tvr/unggah, sehingga rekonsiliasi KPI & layar anggota ikut membacanya.
 */
export function hasilDenganKegagalan(
  mentah: Record<string, unknown>,
  gagal: { platform: string; pesan: string }[],
): Record<string, unknown> {
  if (gagal.length === 0) return mentah;
  return {
    ...mentah,
    kpi_gagal: gagal.map((g) => g.platform),
    kpi_gagal_alasan: Object.fromEntries(gagal.map((g) => [g.platform, g.pesan])),
  };
}

/** Kabari anggota bahwa sebagian/seluruh platform gagal terbit (pola sama dengan tvr/unggah). */
export async function kabariGagalSebagian(
  userId: number,
  judul: string,
  gagal: { platform: string; pesan: string }[],
): Promise<void> {
  if (gagal.length === 0) return;
  await kirimKabar({
    judul: `⚠️ Video gagal terbit di ${gagal.map((g) => LABEL_SOSMED[g.platform] ?? g.platform).join(", ")}`,
    isi: `"${judul}" tidak terbit di ${gagal.length} sosmed:\n${gagal
      .map((g) => {
        const { ringkas, solusi } = solusiGagal(g.platform, g.pesan);
        return `• ${LABEL_SOSMED[g.platform] ?? g.platform}: ${ringkas}${g.pesan ? ` (${g.pesan.slice(0, 120)})` : ""}\n  Solusi: ${solusi}`;
      })
      .join("\n")}`,
    kategori: "peringatan",
    jenis_peristiwa: "unggah_gagal",
    target: "tvrku",
    untukUserIds: [userId],
  });
}

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
      .select("id, siaran_id, profil, user_id, platforms, video_url, judul, caption")
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

    // Memproses SATU item. Pencegah posting dobel: item DIKLAIM atomik
    // (menunggu→diproses, hanya satu pemenang) SEBELUM memanggil upload-post,
    // dan tiap item hanya masuk satu kelompok — jadi paralel tidak mengubah
    // jaminan itu. Mengembalikan "batas" bila upload-post membalas 429.
    let kuotaPenuh = false;
    const prosesItem = async (item: (typeof kandidat)[number]): Promise<"ok" | "batas"> => {
      if (kuotaPenuh) return "ok"; // biarkan 'menunggu' untuk sapuan berikut
      const s = induk.get(Number(item.siaran_id));
      if (!s) return "ok";
      if (s.status === "dibatalkan") {
        await db
          .from("tvr_siaran_item")
          .update({ status: "dibatalkan", selesai_pada: new Date().toISOString() })
          .eq("id", item.id)
          .eq("status", "menunggu");
        return "ok";
      }

      // KLAIM atomik — hanya pemenang yang boleh memposting item ini.
      const { data: terkunci } = await db
        .from("tvr_siaran_item")
        .update({ status: "diproses", diproses_pada: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", "menunggu")
        .select("id");
      if (!terkunci || terkunci.length === 0) return "ok";

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

        // Studio PALUGODAM: item bisa membawa video/judul/caption SENDIRI
        // (hasil render per profil) — menimpa nilai induk.
        const videoUrl = String(item.video_url || s.video_url);
        const judulItem = String(item.judul || s.judul);
        const captionItem = String(item.caption ?? "") || s.caption;
        const hasil = await unggahVideoUp({
          profil: String(item.profil),
          videoUrl,
          judul: judulItem,
          caption: captionItem,
          platforms,
          scheduleDate: jadwal,
        });
        if (!hasil.sukses) {
          const galat = (hasil.mentah as { message?: string; error?: string })?.message ??
            (hasil.mentah as { error?: string })?.error;
          throw new Error(String(galat ?? "upload-post menolak kiriman ini."));
        }

        // Balasan 200 bisa memuat platform yang langsung dinyatakan gagal
        // (success=false per platform) — jangan dicatat "terkirim" mentah.
        const gagalAwal = gagalDariBalasan(hasil.mentah);
        const hasilSimpan = hasilDenganKegagalan(hasil.mentah, gagalAwal);
        const nama = (pf: string) => LABEL_SOSMED[pf] ?? pf;
        const semuaGagal = gagalAwal.length > 0 && platforms.every((pf) => gagalAwal.some((g) => g.platform === pf));
        const kabari = async () => {
          if (gagalAwal.length === 0 || !item.user_id) return;
          try {
            await kabariGagalSebagian(Number(item.user_id), judulItem, gagalAwal);
          } catch (e) {
            console.error("[siaran] kabar gagal:", e);
          }
        };

        if (semuaGagal) {
          // Tidak ada yang terbit: item gagal (bukan 'terkirim'), tanpa riwayat TVR Saya.
          await db
            .from("tvr_siaran_item")
            .update({
              status: "gagal",
              request_id: hasil.request_id,
              hasil: hasilSimpan,
              pesan: `Gagal di semua sosmed: ${gagalAwal.map((g) => nama(g.platform)).join(", ")}`.slice(0, 300),
              selesai_pada: new Date().toISOString(),
            })
            .eq("id", item.id);
          await kabari();
          return "ok";
        }

        // Sebagian gagal tetap berstatus 'terkirim' (skema tidak punya status
        // 'sebagian' dan layar pemantau hanya menghitung terkirim/gagal);
        // rinciannya ada di `pesan` + hasil.kpi_gagal / kpi_gagal_alasan.
        await db
          .from("tvr_siaran_item")
          .update({
            status: "terkirim",
            request_id: hasil.request_id,
            hasil: hasilSimpan,
            pesan: (gagalAwal.length > 0
              ? `Terkirim sebagian — gagal di: ${gagalAwal.map((g) => nama(g.platform)).join(", ")}`
              : jadwal ? "Terjadwal" : "Terkirim"
            ).slice(0, 300),
            selesai_pada: new Date().toISOString(),
          })
          .eq("id", item.id);

        // Riwayat TVR Saya milik pemilik profil + KPI otomatis.
        if (item.user_id) {
          const { error } = await sisipkanLonggar("tvrku_post", {
            user_id: Number(item.user_id),
            judul: judulItem.slice(0, 100),
            caption: captionItem.slice(0, 2200),
            platforms,
            video_path: "",
            video_url: videoUrl,
            jadwal: jadwal ?? null,
            hasil: hasilSimpan,
            request_id: hasil.request_id,
            hapus_media_pada: null,
          });
          if (error) console.error("[siaran] simpan riwayat:", error.message);
        }
        await kabari();
        return "ok";
      } catch (e) {
        // 429 = ditolak SEBELUM diproses upload-post, aman dikembalikan ke
        // antrean (bukan 'gagal'); sapuan dihentikan, sisa item menunggu.
        if (adalahBatasLaju(e)) {
          kuotaPenuh = true;
          await db
            .from("tvr_siaran_item")
            .update({ status: "menunggu", diproses_pada: null })
            .eq("id", item.id)
            .eq("status", "diproses");
          return "batas";
        }
        await db
          .from("tvr_siaran_item")
          .update({
            status: "gagal",
            pesan: (e instanceof Error ? e.message : "Gagal memposting").slice(0, 300),
            selesai_pada: new Date().toISOString(),
          })
          .eq("id", item.id);
        return "ok";
      }
    };

    // Kelompok paralel: pagar anggaran dihitung per kelompok.
    for (let i = 0; i < kandidat.length; i += KONKURENSI_KELOMPOK) {
      if (kuotaPenuh) break;
      if (Date.now() - mulai + PANGGILAN_TERLAMA_MS + MARGIN_KELOMPOK_MS > anggaranMs) break;
      const kelompok = kandidat.slice(i, i + KONKURENSI_KELOMPOK);
      const hasilKelompok = await Promise.allSettled(kelompok.map((it) => prosesItem(it)));
      for (const h of hasilKelompok) {
        if (h.status === "rejected") console.error("[siaran] item:", h.reason);
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
