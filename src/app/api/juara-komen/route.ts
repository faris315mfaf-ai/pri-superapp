// /api/juara-komen — JUARA KOMENTAR periode yang BARU SAJA selesai (3 Sep 2026).
// Dipakai running text beranda (sepanjang periode berjalan 19.00 → 18.59)
// dan animasi kembang api saat periode direset. Sumber: view
// v_app_juara_komen (sql/30) = total komentar per anggota per periode.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { periodeSaatIni } from "@/lib/periode-qc";

export const dynamic = "force-dynamic";

type Juara = { peringkat: number; nama: string; avatar_url: string; total_komentar: number; postingan: number };
type Hasil = { periode: string | null; tanggal: string | null; periode_kini: string; juara: Juara[] };

let cache: { isi: Hasil; pada: number } | null = null;
const TTL_MS = 60_000;

async function hitung(): Promise<Hasil> {
  const db = supabase();
  const kini = periodeSaatIni();
  // Periode selesai terakhir = label terbesar yang lebih kecil dari periode berjalan.
  const { data: daftar } = await db
    .from("v_app_juara_komen")
    .select("periode")
    .lt("periode", kini)
    .order("periode", { ascending: false })
    .limit(1);
  const periode = daftar && daftar.length > 0 ? String(daftar[0].periode) : null;
  if (!periode) return { periode: null, tanggal: null, periode_kini: kini, juara: [] };
  const { data: baris } = await db
    .from("v_app_juara_komen")
    .select("nama_kader, total_komentar, postingan_dikomentari")
    .eq("periode", periode)
    .gt("total_komentar", 0)
    .order("total_komentar", { ascending: false })
    .order("postingan_dikomentari", { ascending: false })
    .order("nama_kader", { ascending: true })
    .limit(3);
  const nama = (baris ?? []).map((b) => String(b.nama_kader));
  const { data: orang } = nama.length
    ? await db.from("app_user").select("nama, avatar_url").in("nama", nama)
    : { data: [] as { nama: unknown; avatar_url: unknown }[] };
  const avatarPer = new Map((orang ?? []).map((o) => [String(o.nama), String(o.avatar_url ?? "")]));
  return {
    periode,
    tanggal: periode.slice(0, 10),
    periode_kini: kini,
    juara: (baris ?? []).map((b, i) => ({
      peringkat: i + 1,
      nama: String(b.nama_kader),
      avatar_url: avatarPer.get(String(b.nama_kader)) ?? "",
      total_komentar: Number(b.total_komentar ?? 0),
      postingan: Number(b.postingan_dikomentari ?? 0),
    })),
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    if (cache && Date.now() - cache.pada < TTL_MS) return cache.isi;
    const isi = await hitung();
    cache = { isi, pada: Date.now() };
    return isi;
  });
}
