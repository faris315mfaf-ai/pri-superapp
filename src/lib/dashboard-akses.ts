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

import { modulDibuka } from "@/lib/peran";
import { adalahPengurusSayap } from "@/lib/struktur";
import { denganCache } from "@/lib/cache-bersama";
export { KATALOG_DASHBOARD, KUNCI_DASHBOARD_SAH };
export type { KunciDashboard };

/** Pemakai yang dinilai: cukup peran + jabatannya. */
type PemakaiDashboard = {
  role: string;
  jabatan?: string | null;
  modul_izin?: unknown;
  divisi?: string | null;
  jabatan_sayap?: string | null;
};

/** Kompat: pemanggil lama mengirim string role saja. */
function urai(pemakai: PemakaiDashboard | string): PemakaiDashboard {
  return typeof pemakai === "string" ? { role: pemakai } : pemakai;
}

/**
 * ATURAN BARU (permintaan user 1 Sep 2026): SEMUA pemegang JABATAN
 * struktur (Ketua Umum s.d. Pimred, termasuk Bendahara Umum & wakil)
 * otomatis mendapat dashboard SELENGKAP-LENGKAPNYA — tanpa perlu
 * dinyalakan satu-satu oleh master. Tabel dashboard_access tetap
 * dipakai untuk pemberian akses per-peran bagi yang TANPA jabatan.
 */
function aksesPenuh(p: PemakaiDashboard): boolean {
  // superadmin (10 Sep 2026): akun pusat dengan Dashboard SELENGKAPNYA.
  if (p.role === "master" || p.role === "super_admin" || p.role === "superadmin") return true;
  // Modul Dashboard dibuka master per akun (10 Sep 2026) → penuh.
  if (modulDibuka(p, "dashboard") === true) return true;
  // Pengurus SAYAP (10 Sep 2026): jabatannya tidak berpengaruh apa pun di
  // DPP, tetapi Dashboard tetap dibuka — permintaan user.
  if (adalahPengurusSayap(p)) return true;
  return (p.jabatan ?? "").trim() !== "";
}

/** Daftar kunci dashboard yang menyala untuk seorang pemakai. */
export async function aksesDashboardRole(
  pemakai: PemakaiDashboard | string,
): Promise<string[]> {
  const p = urai(pemakai);
  // Master selalu penuh — pemegang kendali tidak boleh bisa terkunci
  // dari halaman pengaturannya sendiri. Super admin (= Ketua Umum) dan
  // kini SEMUA pemegang jabatan juga penuh (1 Sep 2026).
  if (aksesPenuh(p)) {
    return KATALOG_DASHBOARD.map((d) => d.kunci);
  }
  return kunciDashboardAktifPeran(p.role);
}

/** Kunci cache dashboard aktif satu peran — dibuang /api/dashboard/akses saat diubah. */
export function kunciCacheAksesDashboard(role: string): string {
  return `akses-dashboard:${role}`;
}

/**
 * Dashboard yang menyala untuk satu peran, disimpan 60 dtk (28 Sep 2026,
 * rencana "200 orang tanpa lag" #5). Dulu dibaca ulang dari database di
 * setiap pemeriksaan akses dashboard.
 */
async function kunciDashboardAktifPeran(role: string): Promise<string[]> {
  try {
    return await denganCache(kunciCacheAksesDashboard(role), 60, async () => {
      const { data, error } = await supabase()
        .from("dashboard_access")
        .select("dashboard_key")
        .eq("role", role)
        .eq("aktif", true);
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((b) => String(b.dashboard_key))
        .filter((k) => KUNCI_DASHBOARD_SAH.has(k));
    });
  } catch {
    return [];
  }
}

/** Apakah pemakai ini boleh membuka satu sub-dashboard? */
export async function bolehDashboard(
  pemakai: PemakaiDashboard | string,
  kunci: KunciDashboard,
): Promise<boolean> {
  const p = urai(pemakai);
  if (aksesPenuh(p)) return true;
  return (await kunciDashboardAktifPeran(p.role)).includes(kunci);
}
