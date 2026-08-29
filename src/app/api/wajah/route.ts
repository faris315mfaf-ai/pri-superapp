// GET    /api/wajah — status verifikasi wajah untuk pengguna ini
// DELETE /api/wajah — hapus pendaftaran wajah saya
//
// Fitur 1.22/3. Status memberi tahu klien apakah fitur AKTIF (penyedia
// tersambung), apakah pengguna SUDAH mendaftar, dan apakah absen
// diwajibkan berwajah.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { hapusWajahPenyedia, penyediaWajah, wajahSiap } from "@/lib/wajah";

export const dynamic = "force-dynamic";

async function absenWajibWajah(): Promise<boolean> {
  const { data } = await supabase()
    .from("pengaturan_sistem")
    .select("nilai")
    .eq("kunci", "wajah_absen_wajib")
    .maybeSingle();
  return data?.nilai === "true";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const { data } = await supabase()
      .from("wajah_template")
      .select("didaftarkan_pada")
      .eq("user_id", Number(user.id))
      .maybeSingle();
    return {
      siap: wajahSiap(),
      provider: penyediaWajah(),
      terdaftar: Boolean(data),
      didaftarkan_pada: data?.didaftarkan_pada ?? null,
      absen_wajib_wajah: await absenWajibWajah(),
    };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const db = supabase();
    // Ambil referensi dulu supaya subjek di penyedia ikut dibersihkan —
    // jangan sampai wajah tertinggal di layanan setelah dihapus di sini.
    const { data } = await db
      .from("wajah_template")
      .select("face_id")
      .eq("user_id", Number(user.id))
      .maybeSingle();
    const { error } = await db.from("wajah_template").delete().eq("user_id", Number(user.id));
    if (error) throw new Error("Gagal menghapus data wajah.");
    if (data?.face_id) await hapusWajahPenyedia(String(data.face_id)).catch(() => {});
    return { sukses: true };
  });
}
