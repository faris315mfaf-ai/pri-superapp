// Uji mesin keputusan bot (13 Okt 2026). Murni, tanpa jaringan.
// Jalankan: npx tsx tests/uji-bot-mesin.mts
import { KEBIJAKAN, dalamJamAktif, klaimBasi, menitDariJam, putuskan, tahapSetelah, type KeadaanBot, type KeadaanGlobal, type TugasAktif } from "@/lib/bot-mesin";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean, i?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n, i !== undefined ? JSON.stringify(i) : "");
  }
};

const NOW = 1_760_000_000_000;
const bot: KeadaanBot = { aktif: true, jeda: false, kuotaHarian: 2, jamMulai: "08:00", jamSelesai: "20:00", gagalBeruntun: 0, dibuatHariIni: 0 };
const glob: KeadaanGlobal = { jedaGlobal: false, menitWib: 10 * 60 };
const tugas = (o: Partial<TugasAktif> = {}): TugasAktif => ({ id: 5, tahap: "edit", dikunciSampaiMs: null, percobaan: 0, diubahPadaMs: NOW - 60_000, ...o });
const alasan = (p: ReturnType<typeof putuskan>) => (p.aksi === "diam" ? p.alasan : p.aksi);

console.log("\n[A] menitDariJam & dalamJamAktif");
cek("08:30 = 510", menitDariJam("08:30") === 510);
cek("jam rusak = -1", menitDariJam("8:30") === -1 && menitDariJam("25:00") === -1 && menitDariJam("12:60") === -1 && menitDariJam("") === -1);
cek("di dalam rentang", dalamJamAktif("08:00", "20:00", 12 * 60));
cek("tepat jam mulai = aktif, tepat jam selesai = tidak", dalamJamAktif("08:00", "20:00", 8 * 60) && !dalamJamAktif("08:00", "20:00", 20 * 60));
cek("di luar rentang", !dalamJamAktif("08:00", "20:00", 7 * 60 + 59) && !dalamJamAktif("08:00", "20:00", 23 * 60));
cek("rentang lewat tengah malam", dalamJamAktif("22:00", "02:00", 23 * 60) && dalamJamAktif("22:00", "02:00", 60) && !dalamJamAktif("22:00", "02:00", 12 * 60));
cek("mulai = selesai → tidak aktif (gagal tertutup)", !dalamJamAktif("08:00", "08:00", 8 * 60));
cek("jam rusak → tidak aktif", !dalamJamAktif("pagi", "20:00", 600) && !dalamJamAktif("08:00", "malam", 600));

console.log("\n[B] Pagar absolut (urutan prioritas)");
cek("bot nonaktif → diam", alasan(putuskan({ ...bot, aktif: false }, glob, null, NOW)) === "nonaktif");
cek("jeda global → diam", alasan(putuskan(bot, { ...glob, jedaGlobal: true }, null, NOW)) === "jeda_global");
cek("jeda bot → diam", alasan(putuskan({ ...bot, jeda: true }, glob, null, NOW)) === "jeda_bot");
cek("gagal beruntun = batas → diam", alasan(putuskan({ ...bot, gagalBeruntun: KEBIJAKAN.MAKS_GAGAL_BERUNTUN }, glob, null, NOW)) === "gagal_beruntun");
cek("gagal beruntun di bawah batas → jalan", alasan(putuskan({ ...bot, gagalBeruntun: KEBIJAKAN.MAKS_GAGAL_BERUNTUN - 1 }, glob, null, NOW)) === "mulai_tugas");
cek("jeda global menang atas tugas aktif (tidak lanjut)", alasan(putuskan(bot, { ...glob, jedaGlobal: true }, tugas(), NOW)) === "jeda_global");
cek("jeda bot menang atas tugas aktif", alasan(putuskan({ ...bot, jeda: true }, glob, tugas(), NOW)) === "jeda_bot");
cek("nonaktif menang atas jeda global", alasan(putuskan({ ...bot, aktif: false }, { ...glob, jedaGlobal: true }, null, NOW)) === "nonaktif");

console.log("\n[C] Tanpa tugas: jam & kuota");
cek("dalam jam + kuota ada → mulai_tugas", putuskan(bot, glob, null, NOW).aksi === "mulai_tugas");
cek("di luar jam → diam", alasan(putuskan(bot, { ...glob, menitWib: 5 * 60 }, null, NOW)) === "di_luar_jam");
cek("kuota habis → diam", alasan(putuskan({ ...bot, dibuatHariIni: 2 }, glob, null, NOW)) === "kuota_habis");
cek("kuota lebih dari batas → tetap diam", alasan(putuskan({ ...bot, dibuatHariIni: 9 }, glob, null, NOW)) === "kuota_habis");
cek("kuota tersisa 1 → masih mulai", putuskan({ ...bot, dibuatHariIni: 1 }, glob, null, NOW).aksi === "mulai_tugas");
cek("jam rusak → tidak pernah memulai tugas baru", alasan(putuskan({ ...bot, jamMulai: "x" }, glob, null, NOW)) === "di_luar_jam");

console.log("\n[D] Tugas aktif");
cek("tugas edit → lanjut", (() => { const p = putuskan(bot, glob, tugas(), NOW); return p.aksi === "lanjut" && p.tugasId === 5 && p.tahap === "edit"; })());
cek("tugas boleh dilanjutkan di luar jam (hanya memantau render)", putuskan(bot, { ...glob, menitWib: 3 * 60 }, tugas(), NOW).aksi === "lanjut");
cek("kuota habis tidak menghentikan tugas yang sedang jalan", putuskan({ ...bot, dibuatHariIni: 2 }, glob, tugas(), NOW).aksi === "lanjut");
cek("terkunci proses lain → diam", alasan(putuskan(bot, glob, tugas({ dikunciSampaiMs: NOW + 5000 }), NOW)) === "terkunci");
cek("kunci kedaluwarsa → lanjut", putuskan(bot, glob, tugas({ dikunciSampaiMs: NOW - 1 }), NOW).aksi === "lanjut");
cek("percobaan habis → gagalkan", (() => { const p = putuskan(bot, glob, tugas({ percobaan: KEBIJAKAN.MAKS_PERCOBAAN }), NOW); return p.aksi === "gagalkan" && p.alasan === "percobaan_habis"; })());
cek("macet melewati batas → gagalkan", (() => { const p = putuskan(bot, glob, tugas({ diubahPadaMs: NOW - (KEBIJAKAN.JOB_MACET_MENIT + 1) * 60_000 }), NOW); return p.aksi === "gagalkan" && p.alasan === "macet"; })());
cek("belum macet → lanjut", putuskan(bot, glob, tugas({ diubahPadaMs: NOW - (KEBIJAKAN.JOB_MACET_MENIT - 1) * 60_000 }), NOW).aksi === "lanjut");
cek("siap_ditinjau → menunggu manusia (tidak membuat tugas baru)", alasan(putuskan(bot, glob, tugas({ tahap: "siap_ditinjau" }), NOW)) === "menunggu_manusia");
cek("menunggu_acc → menunggu manusia", alasan(putuskan(bot, glob, tugas({ tahap: "menunggu_acc" }), NOW)) === "menunggu_manusia");
cek("tahap di luar otomatis (posting) tidak diproses di sini", alasan(putuskan(bot, glob, tugas({ tahap: "posting" }), NOW)) === "menunggu_manusia");

console.log("\n[E] tahapSetelah & klaimBasi");
cek("cari→pilih→unduh→edit→siap_ditinjau", tahapSetelah("cari") === "pilih" && tahapSetelah("pilih") === "unduh" && tahapSetelah("unduh") === "edit" && tahapSetelah("edit") === "siap_ditinjau");
cek("siap_ditinjau dan seterusnya: tidak ada otomatis", tahapSetelah("siap_ditinjau") === null && tahapSetelah("posting") === null && tahapSetelah("selesai") === null);
cek("klaim basi setelah batas", klaimBasi(NOW - (KEBIJAKAN.KLAIM_BASI_MENIT + 1) * 60_000, NOW) && !klaimBasi(NOW - 60_000, NOW) && !klaimBasi(null, NOW));

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
