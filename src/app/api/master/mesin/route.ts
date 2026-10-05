// GET /api/master/mesin — kondisi VPS MESIN Auto Edit (72.61.143.158) untuk
// kartu di Beranda master (5 Okt 2026): disk media video, antrean & beban
// render, dan pemakaian penyimpanan per akun teratas (dengan nama).
// Data dari mesin lewat socket/jembatan WireGuard (lib/autoedit).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { ID_TIM, mintaJsonMesin } from "@/lib/autoedit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusMesin = {
  waktu: number;
  disk: { total_mb: number; dipakai_mb: number; sisa_mb: number };
  isi: Record<string, number>;
  render: { slot: number; slot_maks: number; berjalan: number; antre: number; worker_aktif: boolean };
  beban: { cpu: number; load1: number; ram_total_mb: number; ram_sisa_mb: number };
  pemakaian: { pemilik: string; mb: number; batas_mb: number }[];
  jumlah_pemilik: number;
};

const NAMA_TIM: Record<string, string> = Object.fromEntries(
  Object.entries(ID_TIM).map(([tim, id]) => [`pri-${id}`, tim === "tv" ? "Tim TV Rakyat Official" : `Tim ${tim}`]),
);

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (user.role !== "master") throw Object.assign(new Error("Khusus master."), { status: 403 });
    const st = await mintaJsonMesin<StatusMesin>("/api/video/mesin", String(user.id));

    // pri-<id> → nama anggota (sekali kueri).
    const ids = st.pemakaian
      .map((p) => /^pri-(\d{1,12})$/.exec(p.pemilik)?.[1])
      .filter((x): x is string => Boolean(x) && !NAMA_TIM[`pri-${x}`])
      .map(Number);
    const nama = new Map<string, string>();
    if (ids.length > 0) {
      const { data } = await supabase().from("app_user").select("id, nama, username").in("id", ids);
      for (const u of data ?? []) nama.set(`pri-${u.id}`, String(u.nama || u.username || `#${u.id}`));
    }
    return {
      ...st,
      pemakaian: st.pemakaian.map((p) => ({
        ...p,
        nama: NAMA_TIM[p.pemilik] ?? nama.get(p.pemilik) ?? (p.pemilik === "?" ? "Tanpa catatan" : p.pemilik),
      })),
    };
  });
}
