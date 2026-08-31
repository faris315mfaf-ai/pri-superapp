// ============================================================
// Akses modul Dashboard per jabatan (fitur 1.19/3.3) — SISI SERVER.
//
// Berbeda dengan fitur_izin (baris = pengecualian MATI), tabel
// dashboard_access menyimpan baris = akses NYALA. Konsekuensinya
// disengaja: dashboard berisi data lintas anggota (absensi, KPI,
// kepatuhan), jadi jabatan baru TIDAK otomatis kebagian — master
// harus menyalakannya secara sadar per jabatan.
//
// Katalog kunci/label ada di lib/dashboard-katalog (aman klien).
// ============================================================
import { supabase } from "@/lib/supabase";
import {
  KATALOG_DASHBOARD,
  KUNCI_DASHBOARD_SAH,
  type KunciDashboard,
} from "@/lib/dashboard-katalog";

export { KATALOG_DASHBOARD, KUNCI_DASHBOARD_SAH };
export type { KunciDashboard };

/** Daftar kunci dashboard yang menyala untuk sebuah jabatan. */
export async function aksesDashboardRole(role: string): Promise<string[]> {
  // Master selalu penuh — pemegang kendali tidak boleh bisa terkunci
  // dari halaman pengaturannya sendiri. Super admin (= Ketua Umum pada
  // model peran baru) juga selalu penuh — "buka seluruh mode untuk
  // ketua umum" (permintaan user 31 Agu 2026).
  if (role === "master" || role === "super_admin") {
    return KATALOG_DASHBOARD.map((d) => d.kunci);
  }
  const { data } = await supabase()
    .from("dashboard_access")
    .select("dashboard_key")
    .eq("role", role)
    .eq("aktif", true);
  return (data ?? [])
    .map((b) => String(b.dashboard_key))
    .filter((k) => KUNCI_DASHBOARD_SAH.has(k));
}

/** Apakah jabatan ini boleh membuka satu sub-dashboard? */
export async function bolehDashboard(role: string, kunci: KunciDashboard): Promise<boolean> {
  // Master & super admin (Ketua Umum) selalu boleh — lihat catatan di atas.
  if (role === "master" || role === "super_admin") return true;
  const { data } = await supabase()
    .from("dashboard_access")
    .select("aktif")
    .eq("role", role)
    .eq("dashboard_key", kunci)
    .maybeSingle();
  return data?.aktif === true;
}
