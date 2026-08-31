// ============================================================
// KPI OTOMATIS (31 Agu 2026) — KHUSUS SISI SERVER.
//
// Tujuan (permintaan user): "video yang diupload otomatis menambah KPI
// mereka, tidak perlu lapor-lapor video lagi."
//
// CARA KERJA — kenapa butuh rekonsiliasi, bukan sekadar baca balasan:
// saat aplikasi menyerahkan video ke upload-post, platform (IG/TikTok/
// YouTube/…) BELUM tentu selesai menerbitkan; URL postingan baru ada
// beberapa saat kemudian — dan untuk post TERJADWAL, baru ada nanti.
// Maka: setiap unggahan lewat aplikasi dicatat di `tvrku_post`, lalu
// DIREKONSILIASI — kita tanya upload-post "postingan terbaru profil ini
// di platform X" (endpoint media, memberi `permalink`), ambil yang
// terbit SETELAH unggahan kita, dan catat sebagai laporan_video
// (sumber='otomatis'). KPI 5x6 langsung ikut naik.
//
// Penjaga kejujuran:
// - Hanya postingan dengan waktu terbit >= waktu unggah (dikurangi
//   toleransi jam) yang diakui — tidak menyerobot postingan lama.
// - Kolom `kpi_tercatat` menyimpan platform yang SUDAH dicatat, jadi
//   satu unggahan tidak dihitung dua kali walau layar dibuka berkali-kali.
// - laporan_video UNIK per (user_id, url_video) → dobel tetap ditolak DB.
// - Anggota TIDAK bisa memicu pencatatan link yang bukan miliknya:
//   semuanya berasal dari profil upload-post miliknya sendiri.
// ============================================================
import { supabase } from "@/lib/supabase";
import { postinganTerbaruUp, uploadPostSiap } from "@/lib/upload-post";

/** Toleransi mundur saat mencocokkan waktu terbit (jam beda server). */
const TOLERANSI_MENIT = 10;
/** Unggahan lebih tua dari ini tidak direkonsiliasi lagi (sudah final). */
const BATAS_UMUR_JAM = 72;

function tanggalWibDari(iso: string | null): string {
  const t = iso ? Date.parse(iso) : Date.now();
  return new Date((Number.isFinite(t) ? t : Date.now()) + 7 * 3600_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Rekonsiliasi unggahan seorang anggota → laporan_video otomatis.
 * TIDAK melempar (dipanggil lewat after()); mengembalikan jumlah
 * laporan baru yang tercatat.
 */
export async function rekonsiliasiKpiOtomatis(userId: number): Promise<number> {
  if (!uploadPostSiap()) return 0;
  try {
    const db = supabase();

    const { data: profilBaris } = await db
      .from("sosmed_profile")
      .select("profile_key")
      .eq("jenis", "pengguna")
      .eq("penyedia", "upload-post")
      .eq("user_id", userId)
      .maybeSingle();
    const profil = (profilBaris?.profile_key as string) ?? "";
    if (!profil) return 0;

    // Unggahan yang masih mungkin menghasilkan URL baru: <= 72 jam, dan
    // belum semua platformnya tercatat. Post terjadwal ikut (jadwalnya
    // bisa saja baru lewat).
    const batas = new Date(Date.now() - BATAS_UMUR_JAM * 3600_000).toISOString();
    const { data: posts } = await db
      .from("tvrku_post")
      .select("id, platforms, kpi_tercatat, jadwal, dibuat_pada")
      .eq("user_id", userId)
      .gte("dibuat_pada", batas)
      .order("id", { ascending: false })
      .limit(10);
    if (!posts || posts.length === 0) return 0;

    let baru = 0;
    for (const p of posts) {
      const diminta = (p.platforms ?? []) as string[];
      const sudah = new Set((p.kpi_tercatat ?? []) as string[]);
      const sisa = diminta.filter((x) => !sudah.has(x));
      if (sisa.length === 0) continue;

      // Patokan waktu: post terjadwal dihitung dari jadwalnya.
      const acuanMs =
        (p.jadwal ? Date.parse(String(p.jadwal)) : Date.parse(String(p.dibuat_pada))) -
        TOLERANSI_MENIT * 60_000;
      // Jadwal belum tiba → belum ada apa pun untuk dicatat.
      if (p.jadwal && Date.parse(String(p.jadwal)) > Date.now()) continue;

      const tercatatBaru: string[] = [];
      for (const platform of sisa) {
        try {
          const daftar = await postinganTerbaruUp(profil, platform, 5);
          // Ambil postingan TERBARU yang terbit setelah unggahan kita.
          const cocok = daftar
            .filter((m) => m.permalink && m.waktu && Date.parse(m.waktu) >= acuanMs)
            .sort((a, b) => Date.parse(b.waktu!) - Date.parse(a.waktu!))[0];
          if (!cocok) continue;

          const { error } = await db.from("laporan_video").insert({
            user_id: userId,
            platform,
            url_video: cocok.permalink.slice(0, 500),
            keyword: null,
            tanggal_wib: tanggalWibDari(cocok.waktu),
            sumber: "otomatis",
            tvrku_post_id: p.id,
          });
          // 23505 = URL itu sudah pernah tercatat → tetap dianggap beres
          // supaya platform ini tidak ditanyakan lagi selamanya.
          if (!error || error.code === "23505") {
            tercatatBaru.push(platform);
            if (!error) baru += 1;
          }
        } catch (e) {
          // Satu platform gagal dibaca tidak boleh menggagalkan sisanya;
          // percobaan berikutnya menyusul saat layar dibuka lagi.
          console.error(`[kpi-otomatis] ${platform}:`, e instanceof Error ? e.message : e);
        }
      }

      if (tercatatBaru.length > 0) {
        await db
          .from("tvrku_post")
          .update({
            kpi_tercatat: [...sudah, ...tercatatBaru],
            rekonsiliasi_pada: new Date().toISOString(),
          })
          .eq("id", p.id);
      }
    }
    return baru;
  } catch (e) {
    console.error("[kpi-otomatis] rekonsiliasi:", e);
    return 0;
  }
}
