// =====================================================================
// GET /api/master/pembaruan-21 — LAPORAN AKUN AKTIF vs TIDAK AKTIF sejak
// pembaruan 2.1 (7 Okt 2026). Master & superadmin.
//
// AKTIF = sudah verifikasi WhatsApp + konfirmasi data diri (sql/66
// verifikasi_21_pada). TIDAK AKTIF = belum. Tidak ada akun yang
// dinonaktifkan otomatis — ini laporan saja (keputusan pemilik).
// =====================================================================
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { PERAN_TERSEMBUNYI_IN } from "@/lib/peran";
import { RILIS_21_PADA } from "@/lib/rilis";

export const dynamic = "force-dynamic";

/** "6281234567890" → "0812••••890" */
function samarkan(nomor: string | null): string {
  if (!nomor) return "";
  const lokal = nomor.startsWith("62") ? `0${nomor.slice(2)}` : nomor;
  return lokal.length > 7 ? `${lokal.slice(0, 4)}••••${lokal.slice(-3)}` : lokal;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (user.role !== "master") throw Object.assign(new Error("Hanya master & superadmin."), { status: 403 });
    const { data, error } = await supabase()
      .from("app_user")
      .select("id, nama, username, jabatan, divisi, nomor_wa, wa_terverifikasi, last_login_at, verifikasi_21_pada, tutorial_21_pada")
      .eq("aktif", true)
      .not("role", "in", PERAN_TERSEMBUNYI_IN)
      .order("nama");
    if (error) {
      console.error("[master/pembaruan-21]", error.message);
      throw new Error("Laporan gagal dimuat.");
    }
    const baris = (data ?? []).map((u) => ({
      id: String(u.id),
      nama: u.nama,
      username: u.username ?? "",
      jabatan: u.jabatan ?? "",
      divisi: u.divisi ?? "",
      nomor: samarkan(u.nomor_wa),
      aktif: Boolean(u.verifikasi_21_pada),
      tutorial: Boolean(u.tutorial_21_pada),
      verifikasi_pada: u.verifikasi_21_pada ?? null,
      terakhir_masuk: u.last_login_at ?? null,
    }));
    const aktif = baris.filter((b) => b.aktif).length;
    return {
      rilis_pada: new Date(RILIS_21_PADA).toISOString(),
      total: baris.length,
      aktif,
      tidak_aktif: baris.length - aktif,
      tutorial_selesai: baris.filter((b) => b.tutorial).length,
      pengguna: baris,
    };
  });
}
