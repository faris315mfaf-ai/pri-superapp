// ============================================================
// Mode perbaikan (KHUSUS SISI SERVER).
//
// Saat master menyalakannya, hanya akun master yang bisa masuk /
// bertahan di aplikasi — semua orang lain melihat layar "sedang
// dalam perbaikan". Dipakai /api/login dan /api/sesi.
// ============================================================
import { supabase } from "@/lib/supabase";

export const KUNCI_PERBAIKAN = "mode_perbaikan";

export const PESAN_PERBAIKAN =
  "Aplikasi sedang dalam masa perbaikan. Silakan coba lagi nanti.";

/** true bila mode perbaikan sedang menyala. Gagal baca = dianggap MATI —
 *  gangguan database tidak boleh ikut mengunci seluruh aplikasi. */
export async function modePerbaikanAktif(): Promise<boolean> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", KUNCI_PERBAIKAN)
      .maybeSingle();
    return data?.nilai === "true";
  } catch {
    return false;
  }
}

/** Lempar 503 bila mode perbaikan menyala dan pemanggil bukan master. */
export async function pastikanBukanPerbaikan(role: string): Promise<void> {
  if (role === "master") return;
  if (await modePerbaikanAktif()) {
    throw Object.assign(new Error(PESAN_PERBAIKAN), { status: 503 });
  }
}
