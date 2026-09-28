// Uji kirim koin lewat chat — format pesan, anti-pemalsuan, batas jumlah (28 Sep 2026).
// Jalankan: npx tsx tests/uji-koin-chat.mts
import {
  MAKS_CATATAN_KOIN,
  MAKS_KIRIM_KOIN,
  PENANDA_KOIN,
  buangPenandaKoin,
  cuplikanPesanChat,
  isiPesanKoin,
  kunciKirimanSah,
  periksaJumlahKoin,
  rapikanCatatanKoin,
  teksAngkaKoin,
  uraiPesanKoin,
} from "@/lib/koin-chat";

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
const jumlahDari = (v: unknown) => {
  const r = periksaJumlahKoin(v);
  return "jumlah" in r ? r.jumlah : null;
};

console.log("angka & jumlah");
cek("pemisah ribuan", teksAngkaKoin(1234567) === "1.234.567" && teksAngkaKoin(5) === "5" && teksAngkaKoin(1000) === "1.000");
cek("100 sah", jumlahDari(100) === 100 && jumlahDari("100") === 100);
cek("'1.000' dibaca 1000", jumlahDari("1.000") === 1000);
cek("batas atas sah", jumlahDari(MAKS_KIRIM_KOIN) === MAKS_KIRIM_KOIN);
cek("0, negatif, pecahan, teks, lewat batas ditolak", [0, -5, 1.5, "abc", "", MAKS_KIRIM_KOIN + 1, NaN, null].every((v) => jumlahDari(v) === null));

console.log("catatan");
cek("jadi satu baris & dirapikan", rapikanCatatanKoin("  halo\n\n  dunia  ") === "halo dunia");
cek("penanda dibuang dari catatan", !rapikanCatatanKoin(`${PENANDA_KOIN}hai`).includes(PENANDA_KOIN));
const panjang = "🎉".repeat(MAKS_CATATAN_KOIN + 10);
const rapi = rapikanCatatanKoin(panjang);
cek("dipotong per karakter utuh (emoji tidak terbelah)", Array.from(rapi).length === MAKS_CATATAN_KOIN && !/[\uD800-\uDBFF]$/.test(rapi));

console.log("pesan koin bolak-balik");
const isi = isiPesanKoin(1500, "Terima kasih 🙏");
cek("diawali penanda tak terlihat", isi.startsWith(PENANDA_KOIN));
cek("terbaca wajar tanpa kartu", isi.includes("🪙 Kiriman 1.500 koin") && isi.includes("Terima kasih 🙏"));
const u = uraiPesanKoin(isi);
cek("urai jumlah & catatan", u?.jumlah === 1500 && u?.catatan === "Terima kasih 🙏", u);
const tanpaCatatan = uraiPesanKoin(isiPesanKoin(10, ""));
cek("tanpa catatan", tanpaCatatan?.jumlah === 10 && tanpaCatatan?.catatan === "", tanpaCatatan);
cek("jumlah besar", uraiPesanKoin(isiPesanKoin(100000, "x"))?.jumlah === 100000);

console.log("anti-pemalsuan");
cek("teks sama TANPA penanda = pesan biasa", uraiPesanKoin("🪙 Kiriman 100 koin") === null);
const palsu = `${PENANDA_KOIN}🪙 Kiriman 999 koin`;
cek("pesan pengguna yang menyisipkan penanda → penanda dibuang → pesan biasa", uraiPesanKoin(buangPenandaKoin(palsu)) === null);
cek("penanda di tengah teks juga dibuang", !buangPenandaKoin(`a${PENANDA_KOIN}b`).includes(PENANDA_KOIN));
cek("format angka rusak ditolak", ["1.00", "01", "1,000", "0"].every((a) => uraiPesanKoin(`${PENANDA_KOIN}🪙 Kiriman ${a} koin`) === null));
cek("teks tambahan di baris pertama ditolak", uraiPesanKoin(`${PENANDA_KOIN}🪙 Kiriman 5 koin gratis`) === null);
cek("kosong/null aman", uraiPesanKoin("") === null && uraiPesanKoin(null) === null && uraiPesanKoin(undefined) === null);

console.log("cuplikan daftar chat");
cek("pesan koin diringkas tanpa catatan", cuplikanPesanChat(isi) === "🪙 Kiriman 1.500 koin");
cek("pesan biasa apa adanya", cuplikanPesanChat("halo") === "halo");

console.log("kunci anti-dobel");
cek("UUID sah", kunciKirimanSah("3f1c2a9e-4b7d-4c1e-9a2b-8d6f0e5c1a23") !== null);
cek("cadangan Date+random sah", kunciKirimanSah(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`) !== null);
cek("terlalu pendek / simbol / kosong ditolak", [undefined, "", "abc", "a b c d e f g h", "x;drop table", "é".repeat(10)].every((k) => kunciKirimanSah(k) === null));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
