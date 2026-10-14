// Uji aturan murni "pilih bagian video" (14 Okt 2026). Jalankan: npx tsx tests/uji-potong-video.mts
import {
  adalahLandscape,
  bidangJob,
  bolehPotongVideo,
  formatDurasi,
  formatWaktu,
  geserUjung,
  nilaiRentang,
  rentangAwal,
} from "@/lib/potong-video";

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
const sama = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("\n[A] Gerbang: seluruh pengguna yang login");
cek("akun #4 boleh", bolehPotongVideo({ id: 4 }));
cek("akun #176 boleh (string)", bolehPotongVideo({ id: "176" }));
cek("akun lain juga boleh", bolehPotongVideo({ id: 5 }) && bolehPotongVideo({ id: "999" }));
cek("tanpa akun tidak", !bolehPotongVideo(null) && !bolehPotongVideo({}));

console.log("\n[B] Rentang");
cek("awal: video pendek penuh", sama(rentangAwal(40, 180), { mulai: 0, akhir: 40 }));
cek("awal: video panjang dipangkas ke batas", sama(rentangAwal(258, 180), { mulai: 0, akhir: 180 }));
const r = { mulai: 42, akhir: 117.5 };
cek("geser awal", sama(geserUjung(r, "mulai", 50.04, 258), { mulai: 50, akhir: 117.5 }));
cek("awal tidak melewati akhir", geserUjung(r, "mulai", 200, 258).mulai === 116.5);
cek("awal tidak di bawah 0", geserUjung(r, "mulai", -5, 258).mulai === 0);
cek("akhir tidak melewati durasi", geserUjung(r, "akhir", 999, 258).akhir === 258);
cek("akhir tidak sebelum awal + 1", geserUjung(r, "akhir", 10, 258).akhir === 43);
cek("NaN diabaikan", sama(geserUjung(r, "akhir", Number.NaN, 258), r));

console.log("\n[C] Penilaian");
cek("sah", nilaiRentang(r, 258, 180).sah && nilaiRentang(r, 258, 180).durasi === 75.5);
const lewat = nilaiRentang({ mulai: 0, akhir: 200 }, 258, 180);
cek("lebih dari batas = tidak sah + pesan", !lewat.sah && lewat.pesan.includes("3:00.0"), lewat);
cek("di luar durasi = tidak sah", !nilaiRentang({ mulai: 0, akhir: 300 }, 258, 180).sah);

console.log("\n[D] Format & body job");
cek("formatWaktu", formatWaktu(65.34) === "01:05.3" && formatWaktu(0) === "00:00.0", formatWaktu(65.34));
cek("formatDurasi", formatDurasi(75.5) === "1:15.5" && formatDurasi(180) === "3:00.0");
cek("landscape: 16:9 & 1:1 ya, potret tidak", adalahLandscape(1920, 1080) && adalahLandscape(1080, 1080) && !adalahLandscape(1080, 1920) && !adalahLandscape(0, 0));
cek("body: potongan dikirim", sama(bidangJob(r, 258), { mulai: 42, akhir: 117.5, bingkai: "hitam" }));
cek("body: penuh tidak dikirim sebagai potongan", sama(bidangJob({ mulai: 0, akhir: 40 }, 40), { bingkai: "hitam" }));
cek("body: durasi tak diketahui = bingkai saja", sama(bidangJob(null, null), { bingkai: "hitam" }));

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
