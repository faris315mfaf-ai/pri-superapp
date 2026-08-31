// ============================================================
// Sampul video (KHUSUS SISI SERVER) — fitur sampul kustom 31 Agu 2026.
//
// Simpan gambar sampul (base64) ke storage publik dan kembalikan
// URL-nya untuk diteruskan ke Ayrshare (`thumbNail`) pada platform yang
// MENDUKUNG: YouTube, Instagram Reels, TikTok, Facebook. Threads & X
// tidak punya opsi sampul (per docs Ayrshare) — dilewati.
//
// Syarat mengikuti platform TERKETAT (YouTube): jpg/png, < 2 MB, dan
// URL berakhiran .jpg/.png — jalur berkas diberi ekstensi sehingga URL
// publik Supabase memenuhinya. Catatan YouTube: sampul kustom butuh
// channel TERVERIFIKASI; bila belum, video tetap tayang tanpa sampul.
// ============================================================
import { supabase } from "@/lib/supabase";

export async function simpanSampul(
  awalan: string,
  dataUrl: string | undefined,
): Promise<string | null> {
  const mentah = (dataUrl ?? "").trim();
  if (!mentah) return null;
  const cocok = /^data:(image\/jpeg|image\/png);base64,/.exec(mentah);
  if (!cocok) {
    throw Object.assign(new Error("Sampul harus gambar JPG/PNG."), { status: 400 });
  }
  const isi = Buffer.from(mentah.slice(mentah.indexOf(",") + 1), "base64");
  if (isi.length < 1024 || isi.length > 2 * 1024 * 1024) {
    throw Object.assign(
      new Error("Ukuran sampul harus di bawah 2 MB (syarat YouTube)."),
      { status: 400 },
    );
  }
  const db = supabase();
  const ext = cocok[1] === "image/png" ? "png" : "jpg";
  const jalur = `sampul-official/${awalan}-${Date.now()}.${ext}`;
  const { error } = await db.storage
    .from("tvrku")
    .upload(jalur, isi, { contentType: cocok[1], upsert: false });
  if (error) {
    console.error("[sampul] simpan:", error.message);
    throw new Error("Gagal menyimpan gambar sampul. Coba lagi.");
  }
  return db.storage.from("tvrku").getPublicUrl(jalur).data.publicUrl;
}
