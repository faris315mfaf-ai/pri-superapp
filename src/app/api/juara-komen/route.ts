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
import { hitungJuaraKomen } from "@/lib/juara-komen";
import { denganCache } from "@/lib/cache-bersama";
import { fiturBeratAktif } from "@/lib/sakelar";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { periodeSaatIni } from "@/lib/periode-qc";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    // Sakelar fitur berat (4 Sep 2026): efek juara dimatikan → tidak ada juara
    // yang dikirim, jadi running text & kembang api tidak tampil.
    if (!(await fiturBeratAktif("juara_efek"))) {
      return { periode: null, tanggal: null, periode_kini: periodeSaatIni(), juara: [], nonaktif: true };
    }
    // 7 Sep 2026: cache bersama 120 dtk (sama untuk semua pengguna).
    return denganCache(`juara-komen:${periodeSaatIni()}`, 120, hitungJuaraKomen);
  });
}
