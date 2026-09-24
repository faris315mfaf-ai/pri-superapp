// ============================================================
// Penerima kabar untuk urusan HR (KHUSUS SISI SERVER).
//
// Peran lama `admin_hr` sudah tidak dipakai — yang berwenang kini anggota
// Divisi HR. Kabar yang dikirim ke peran admin_hr hanya sampai ke master,
// jadi kabar HR dikirim per ORANG: anggota Divisi HR + master yang aktif.
// ============================================================
import { supabase } from "@/lib/supabase";
import { DIVISI_HR } from "@/lib/hr";

/** id anggota Divisi HR + master yang aktif. Kosong bila gagal dibaca. */
export async function penerimaKabarHR(): Promise<number[]> {
  const { data, error } = await supabase()
    .from("app_user")
    .select("id")
    // Nilai berspasi WAJIB dikutip di filter .or() PostgREST.
    .or(`divisi.eq."${DIVISI_HR}",role.eq.master`)
    .eq("aktif", true)
    .eq("status", "aktif")
    .limit(200);
  if (error) {
    console.error("[penerima-hr]", error.message);
    return [];
  }
  return (data ?? []).map((u) => Number(u.id)).filter((n) => n > 0);
}
