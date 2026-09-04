// /api/juara-komen — JUARA KOMENTAR periode yang BARU SAJA selesai (3 Sep 2026).
// Dipakai running text beranda (sepanjang periode berjalan 19.00 → 18.59)
// dan animasi kembang api saat periode direset.
//
// PERBAIKAN 4 Sep 2026 (bug: "juara tidak sama dengan peringkat Kepatuhan
// Komen"): dulu juara diurutkan dari TOTAL komentar (v_app_juara_komen),
// sedangkan leaderboard Kepatuhan Komen mengurutkan dari PERSENTASE kepatuhan
// (postingan wajib yang sudah dikomentari ÷ total postingan wajib), seri →
// jumlah postingan yang dikomentari, lalu nama. Dua urutan itu bisa berbeda
// (orang yang komen 10× di 2 postingan kalah persen dari yang komen 1× di
// semua postingan). Sekarang juara memakai RUMUS YANG SAMA PERSIS dengan
// leaderboard (/api/peringkat-tvr?komen=1), hanya untuk periode yang sudah
// selesai; total komentar tetap ditampilkan sebagai info.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { periodeSaatIni } from "@/lib/periode-qc";

export const dynamic = "force-dynamic";

type Juara = {
  peringkat: number;
  nama: string;
  avatar_url: string;
  total_komentar: number;
  postingan: number;
  /** Persentase kepatuhan (dasar urutan, sama dengan leaderboard). */
  persen: number;
  total_wajib: number;
};
type Hasil = {
  periode: string | null;
  tanggal: string | null;
  periode_kini: string;
  juara: Juara[];
};

let cache: { isi: Hasil; pada: number } | null = null;
const TTL_MS = 60_000;

async function hitung(): Promise<Hasil> {
  const db = supabase();
  const kini = periodeSaatIni();
  // Periode selesai terakhir = label terbesar yang lebih kecil dari periode berjalan.
  const { data: daftar } = await db
    .from("v_app_kepatuhan_kader")
    .select("periode")
    .lt("periode", kini)
    .order("periode", { ascending: false })
    .limit(1);
  const periode =
    daftar && daftar.length > 0 ? String(daftar[0].periode) : null;
  if (!periode)
    return { periode: null, tanggal: null, periode_kini: kini, juara: [] };

  // Sumber & urutan SAMA dengan leaderboard Kepatuhan Komen.
  const [{ data: kepatuhan }, { data: komentar }] = await Promise.all([
    db
      .from("v_app_kepatuhan_kader")
      .select("nama_kader, total, sudah")
      .eq("periode", periode)
      .limit(2000),
    db
      .from("v_app_juara_komen")
      .select("nama_kader, total_komentar")
      .eq("periode", periode)
      .limit(2000),
  ]);
  const komenPer = new Map(
    (komentar ?? []).map((k) => [
      String(k.nama_kader),
      Number(k.total_komentar ?? 0),
    ]),
  );
  const peringkat = (kepatuhan ?? [])
    .map((b) => {
      const total = Number(b.total ?? 0);
      const sudah = Number(b.sudah ?? 0);
      return {
        nama: String(b.nama_kader ?? ""),
        total,
        sudah,
        persen: total > 0 ? Math.round((sudah / total) * 100) : 0,
        komentar: komenPer.get(String(b.nama_kader ?? "")) ?? 0,
      };
    })
    // Juara = yang benar-benar berkomentar; persen tertinggi dulu, seri →
    // paling banyak postingan dikomentari, lalu nama (persis leaderboard).
    .filter((x) => x.sudah > 0)
    .sort(
      (x, y) =>
        y.persen - x.persen ||
        y.sudah - x.sudah ||
        x.nama.localeCompare(y.nama),
    )
    .slice(0, 3);

  const nama = peringkat.map((b) => b.nama);
  const { data: orang } = nama.length
    ? await db.from("app_user").select("nama, avatar_url").in("nama", nama)
    : { data: [] as { nama: unknown; avatar_url: unknown }[] };
  const avatarPer = new Map(
    (orang ?? []).map((o) => [String(o.nama), String(o.avatar_url ?? "")]),
  );
  return {
    periode,
    tanggal: periode.slice(0, 10),
    periode_kini: kini,
    juara: peringkat.map((b, i) => ({
      peringkat: i + 1,
      nama: b.nama,
      avatar_url: avatarPer.get(b.nama) ?? "",
      total_komentar: b.komentar,
      postingan: b.sudah,
      persen: b.persen,
      total_wajib: b.total,
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
