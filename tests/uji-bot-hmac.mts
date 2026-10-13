// Uji tanda tangan runner → aplikasi (13 Okt 2026). Murni, tanpa jaringan.
// Jalankan: npx tsx tests/uji-bot-hmac.mts
import { hitungTandaBot, verifikasiTandaBot, JENDELA_BOT_DETIK } from "@/lib/bot-hmac";

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

const RAHASIA = "rahasia-uji-yang-cukup-panjang-123";
const SEKARANG = 1_760_000_000;
const NONCE = "abcdef0123456789abcdef";
const BADAN = JSON.stringify({ aksi: "denyut", versi: "1.0" });
const tanda = hitungTandaBot(RAHASIA, SEKARANG, NONCE, BADAN);
const dasar = { rahasia: RAHASIA, waktu: String(SEKARANG), nonce: NONCE, tanda, badan: BADAN, sekarangDetik: SEKARANG };

console.log("\n[A] Permintaan sah");
cek("tanda benar diterima", verifikasiTandaBot(dasar).sah === true);
cek("selisih waktu di dalam jendela diterima", verifikasiTandaBot({ ...dasar, sekarangDetik: SEKARANG + JENDELA_BOT_DETIK }).sah === true);

console.log("\n[B] Penolakan");
const alasan = (o: Parameters<typeof verifikasiTandaBot>[0]) => {
  const h = verifikasiTandaBot(o);
  return h.sah ? "SAH" : h.alasan;
};
cek("badan diubah ditolak", alasan({ ...dasar, badan: BADAN + " " }) === "tanda_salah");
cek("nonce diubah ditolak", alasan({ ...dasar, nonce: "zzzzzzzzzzzzzzzzzzzz" }) === "tanda_salah");
cek("waktu diubah ditolak", alasan({ ...dasar, waktu: String(SEKARANG + 1) }) === "tanda_salah");
cek("rahasia lain ditolak", alasan({ ...dasar, rahasia: "rahasia-lain-yang-juga-panjang-9" }) === "tanda_salah");
cek("terlalu lama (kedaluwarsa) ditolak", alasan({ ...dasar, sekarangDetik: SEKARANG + JENDELA_BOT_DETIK + 1 }) === "kedaluwarsa");
cek("dari masa depan ditolak", alasan({ ...dasar, sekarangDetik: SEKARANG - JENDELA_BOT_DETIK - 1 }) === "kedaluwarsa");
cek("tanpa header ditolak", alasan({ ...dasar, tanda: null }) === "header_kurang" && alasan({ ...dasar, nonce: null }) === "header_kurang" && alasan({ ...dasar, waktu: null }) === "header_kurang");
cek("tanda bukan hex 64 ditolak", alasan({ ...dasar, tanda: "xyz" }) === "tanda_tak_sah" && alasan({ ...dasar, tanda: "a".repeat(63) }) === "tanda_tak_sah");
cek("waktu bukan angka ditolak", alasan({ ...dasar, waktu: "kemarin" }) === "waktu_tak_sah");
cek("nonce pendek ditolak", alasan({ ...dasar, nonce: "abc" }) === "nonce_tak_sah");
cek("nonce berkarakter aneh ditolak", alasan({ ...dasar, nonce: "abc def ghi jkl mno pqr" }) === "nonce_tak_sah");

console.log("\n[C] Gagal tertutup bila rahasia tidak ada/lemah");
cek("rahasia undefined → belum_dikonfigurasi", alasan({ ...dasar, rahasia: undefined }) === "belum_dikonfigurasi");
cek("rahasia kosong → belum_dikonfigurasi", alasan({ ...dasar, rahasia: "" }) === "belum_dikonfigurasi");
cek("rahasia pendek → belum_dikonfigurasi", alasan({ ...dasar, rahasia: "pendek" }) === "belum_dikonfigurasi");
cek("tanda dari rahasia kosong tidak lolos", alasan({ ...dasar, rahasia: "", tanda: hitungTandaBot("", SEKARANG, NONCE, BADAN) }) === "belum_dikonfigurasi");

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
