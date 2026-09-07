// ============================================================
// /api/tvr/video-saya — VIDEO SIAP UNGGAH (7 Sep 2026).
//
// Studio PALUGODAM merender SATU versi per anggota (satu baris
// `studio_proyek_item` per profil, lengkap dengan judul, highlight, dan
// caption khusus akun itu). Selama ini hasilnya hanya bisa dipakai lewat
// Siaran Serentak — server yang mengunggahkannya ke sosmed anggota.
//
// Endpoint ini membuka jalur KEDUA: anggota melihat sendiri versi miliknya,
// mengunduh berkasnya, lalu mengunggah manual dari HP-nya. Dipakai kalau
// unggah otomatis gagal, akunnya belum tertaut, atau anggota memang ingin
// memilih waktu tayangnya sendiri.
//
// GET → daftar versi milik pengguna efektif yang rendernya sudah sukses.
// Berkasnya sendiri diambil lewat /api/tvr/video-saya/unduh?item=<id>.
// ============================================================
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userEfektifTvr } from "@/lib/sebagai";

export const dynamic = "force-dynamic";

/** Batas daftar: cukup untuk beberapa minggu terakhir tanpa membebani layar. */
const MAKS_BARIS = 60;

export async function GET(request: Request) {
  return bungkus(async () => {
    // Admin PALUGODAM boleh melihat lewat kendali akun (header X-Sebagai),
    // sama seperti endpoint TVR Saya lainnya.
    const user = await userEfektifTvr(request);
    const db = supabase();

    const { data: baris } = await db
      .from("studio_proyek_item")
      .select(
        "id, proyek_id, profil, judul, highlight, caption, render_url, diperbarui_pada",
      )
      .eq("user_id", Number(user.id))
      .eq("render_status", "sukses")
      .neq("render_url", "")
      .order("id", { ascending: false })
      .limit(MAKS_BARIS);

    if (!baris || baris.length === 0) return { data: [] };

    // Konteks proyek diambil terpisah — lebih tahan terhadap perbedaan nama
    // relasi PostgREST daripada select bersarang.
    const proyekId = [...new Set(baris.map((b) => Number(b.proyek_id)))];
    const { data: proyek } = await db
      .from("studio_proyek")
      .select("id, sumber_link, sumber_platform, caption_inti, dibuat_pada")
      .in("id", proyekId);
    const petaProyek = new Map(
      (proyek ?? []).map((p) => [String(p.id), p as Record<string, unknown>]),
    );

    return {
      data: baris.map((b) => {
        const p = petaProyek.get(String(b.proyek_id));
        return {
          id: String(b.id),
          proyek_id: String(b.proyek_id),
          profil: String(b.profil ?? ""),
          judul: String(b.judul ?? ""),
          highlight: String(b.highlight ?? ""),
          // Caption khusus akun ini; kalau kosong pakai caption inti proyek.
          caption: String(b.caption ?? "") || String(p?.caption_inti ?? ""),
          sumber_link: String(p?.sumber_link ?? ""),
          sumber_platform: String(p?.sumber_platform ?? ""),
          /** Tautan Creatomate — untuk menonton pratinjau, bukan mengunduh. */
          render_url: String(b.render_url ?? ""),
          siap_pada: String(b.diperbarui_pada ?? p?.dibuat_pada ?? ""),
        };
      }),
    };
  });
}
