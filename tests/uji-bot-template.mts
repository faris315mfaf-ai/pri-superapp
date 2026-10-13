// Uji pustaka template bot — bagian murni (13 Okt 2026).
// Jalankan: npx tsx tests/uji-bot-template.mts
import {
  buatKodePustaka,
  formatUkuran,
  labelKeadaan,
  normalkanNamaTemplate,
  pesanDariMesin,
  POLA_KODE_PUSTAKA,
} from "@/lib/bot-template-murni";

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

console.log("\n[A] Nama template");
const n = (x: unknown) => normalkanNamaTemplate(x);
cek("nama biasa diterima", n("Berita Pagi").ok === true && (n("Berita Pagi") as { nama: string }).nama === "Berita Pagi");
cek("spasi dirapatkan dan dipangkas", (n("  Berita   Pagi  ") as { nama: string }).nama === "Berita Pagi");
cek("karakter kontrol diganti spasi", (n("Berita\nPagi\u0000X") as { nama: string }).nama === "Berita Pagi X");
cek("terlalu pendek ditolak", n("ab").ok === false);
cek("kosong/spasi saja ditolak", n("   ").ok === false);
cek("60 karakter diterima, 61 ditolak", n("a".repeat(60)).ok === true && n("a".repeat(61)).ok === false);
cek("bukan string ditolak", n(123).ok === false && n(null).ok === false && n(undefined).ok === false);

console.log("\n[B] Kode pustaka");
const kode = Array.from({ length: 200 }, () => buatKodePustaka());
cek("selalu cocok pola mesin", kode.every((k) => POLA_KODE_PUSTAKA.test(k) && k.length === 12));
cek("tidak berulang", new Set(kode).size === kode.length);
cek("pola menolak path traversal / huruf besar / pendek",
  !POLA_KODE_PUSTAKA.test("../x") && !POLA_KODE_PUSTAKA.test("ABCDEF123") && !POLA_KODE_PUSTAKA.test("abc") && !POLA_KODE_PUSTAKA.test("a/b/c/d/e/f"));

console.log("\n[C] Pesan mesin");
cek("detail string", pesanDariMesin({ detail: "Masih ada 1 video di antrean." }, "x") === "Masih ada 1 video di antrean.");
cek("detail daftar (422)", pesanDariMesin({ detail: [{ msg: "String should match" }] }, "x") === "String should match");
cek("tanpa detail → cadangan", pesanDariMesin(null, "cadangan") === "cadangan" && pesanDariMesin({}, "cadangan") === "cadangan");
cek("detail dipotong 300", pesanDariMesin({ detail: "z".repeat(500) }, "x").length === 300);

console.log("\n[D] Label & ukuran");
cek("mesin tak terjangkau", labelKeadaan(null).nada === "tak_tahu");
cek("belum ada", labelKeadaan({ ada: false, siap: false }).nada === "kurang");
cek("ada tapi belum siap", labelKeadaan({ ada: true, siap: false }).teks === "template belum ditetapkan");
cek("siap", labelKeadaan({ ada: true, siap: true }).nada === "ok");
cek("ukuran", formatUkuran(0) === "0 MB" && formatUkuran(5 * 1_048_576) === "5.0 MB" && formatUkuran(120 * 1_048_576) === "120 MB" && formatUkuran(NaN) === "0 MB");

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
