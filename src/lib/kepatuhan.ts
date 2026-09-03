// ============================================================
// Kepatuhan komen — kapan komentar TERAKHIR diambil (3 Sep 2026).
//
// Sumber kebenaran (diverifikasi 3 Sep 2026 di DB): yang paling sering
// diperbarui adalah `postingan.komentar_diperiksa_pada` — dicap tiap kali
// komentar satu postingan selesai ditarik dari sosmed. Cadangan:
// `qc_analisis_riwayat.dijalankan_pada` (tiap analisis QC), lalu
// `rekap.updated_at`. Dipakai label "Komentar terakhir diambil …" di
// Beranda, leaderboard Kepatuhan Komen, dan kartu ringkasan dashboard.
// ============================================================
import { supabase } from "@/lib/supabase";

/** ISO waktu pengambilan komentar terakhir untuk periode; null bila belum pernah. */
export async function waktuAmbilKomentarTerakhir(periode?: string): Promise<string | null> {
  try {
    const db = supabase();
    let p = db
      .from("postingan")
      .select("komentar_diperiksa_pada")
      .not("komentar_diperiksa_pada", "is", null)
      .order("komentar_diperiksa_pada", { ascending: false })
      .limit(1);
    if (periode) p = p.eq("periode", periode);
    const { data: ps } = await p.maybeSingle();
    if (ps?.komentar_diperiksa_pada) return String(ps.komentar_diperiksa_pada);

    let q = db
      .from("qc_analisis_riwayat")
      .select("dijalankan_pada")
      .order("dijalankan_pada", { ascending: false })
      .limit(1);
    if (periode) q = q.eq("periode", periode);
    const { data } = await q.maybeSingle();
    if (data?.dijalankan_pada) return String(data.dijalankan_pada);

    let r = db.from("rekap").select("updated_at").order("updated_at", { ascending: false }).limit(1);
    if (periode) r = r.eq("periode", periode);
    const { data: rk } = await r.maybeSingle();
    return rk?.updated_at ? String(rk.updated_at) : null;
  } catch {
    return null;
  }
}
