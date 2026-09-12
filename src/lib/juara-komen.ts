// ============================================================
// JUARA KOMENTAR — perhitungan bersama (dipindah dari rute 12 Sep 2026).
//
// Dipakai dua pihak: rute /api/juara-komen (running text & kembang api)
// dan penjadwal harian yang memberi koin "reward top komen harian" ke
// juara 1 periode yang baru selesai. Satu perhitungan, supaya juara yang
// diberi koin selalu orang yang sama dengan yang diumumkan di layar.
// ============================================================
import { supabase } from "@/lib/supabase";
import { periodeSaatIni } from "@/lib/periode-qc";
import { beriKoin } from "@/lib/koin";

export type JuaraKomen = {
  peringkat: number;
  nama: string;
  avatar_url: string;
  total_komentar: number;
  postingan: number;
  /** Persentase kepatuhan (dasar urutan, sama dengan leaderboard). */
  persen: number;
  total_wajib: number;
};
export type HasilJuaraKomen = {
  periode: string | null;
  tanggal: string | null;
  periode_kini: string;
  juara: JuaraKomen[];
};


export async function hitungJuaraKomen(): Promise<HasilJuaraKomen> {
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


/**
 * Koin untuk juara 1 komentar periode yang BARU SAJA selesai.
 *
 * Aman dipanggil berulang: referensi koin memuat label periodenya, dan
 * beriKoin() mengabaikan duplikat — juara tidak pernah dibayar dua kali
 * untuk periode yang sama. Besarnya mengikuti pengaturan master
 * (koin_bonus_juara_komen_harian); 0 = dimatikan.
 */
export async function beriKoinJuaraKomenHarian(): Promise<{
  periode: string | null;
  juara: string | null;
  diberi: boolean;
}> {
  const hasil = await hitungJuaraKomen();
  const satu = hasil.juara[0];
  if (!hasil.periode || !satu) return { periode: hasil.periode, juara: null, diberi: false };
  // Juara dikenali lewat nama kader (sumber QC) → akun aplikasi bernama sama.
  const { data: orang } = await supabase()
    .from("app_user")
    .select("id")
    .eq("nama", satu.nama)
    .eq("aktif", true)
    .limit(1)
    .maybeSingle();
  if (!orang) return { periode: hasil.periode, juara: satu.nama, diberi: false };
  await beriKoin(Number(orang.id), "juara_komen_harian", `juara-komen-${hasil.periode}`);
  return { periode: hasil.periode, juara: satu.nama, diberi: true };
}
