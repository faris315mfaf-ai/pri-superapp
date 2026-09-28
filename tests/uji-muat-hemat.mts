// Uji rencana "200 orang tanpa lag": penjaga tab (#1), penggabung GET (#4), sinyal pribadi (#3).
// Jalankan: npx tsx tests/uji-muat-hemat.mts
import { buatPenjagaTab } from "@/hooks/use-tab-aktif";
import { buatPenggabungGet } from "@/lib/gabung-get";
import { idSinyalUnik } from "@/lib/sinyal-pribadi";

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
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log("#1 penjaga tab");
{
  const p = buatPenjagaTab(true);
  cek("tab aktif: boleh jalan", p.minta() === true);
  cek("tetap aktif: tidak ada susulan", p.ubahAktif(true) === false);
  p.ubahAktif(false);
  cek("tab disembunyikan: tidak boleh jalan", p.minta() === false);
  cek("dibuka lagi setelah ada yang terlewat: susul SEKALI", p.ubahAktif(true) === true);
  cek("susulan tidak berulang", p.ubahAktif(true) === false);
  p.ubahAktif(false);
  cek("disembunyikan tanpa ada yang terlewat → dibuka lagi tanpa susulan", p.ubahAktif(true) === false);
  const q = buatPenjagaTab(false);
  q.minta();
  q.minta();
  q.minta();
  cek("banyak detak terlewat → tetap satu susulan", q.ubahAktif(true) === true && q.ubahAktif(true) === false);
}

console.log("#4 penggabung GET kembar");
{
  const g = buatPenggabungGet();
  let dipanggil = 0;
  const kerja = async () => {
    dipanggil++;
    await tidur(30);
    return { angka: [1, 2, 3], nama: "x" };
  };
  const [a, b, c] = await Promise.all([g.jalankan("k1", kerja), g.jalankan("k1", kerja), g.jalankan("k1", kerja)]);
  cek("tiga permintaan bersamaan → satu pekerjaan", dipanggil === 1, dipanggil);
  cek("semua mendapat hasil yang sama", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c));
  a.angka.push(99);
  cek("tiap penumpang mendapat SALINAN (ubah satu tidak menular)", b.angka.length === 3 && c.angka.length === 3);
  cek("selesai → tidak ada yang tertinggal", g.ukuran === 0);
  await g.jalankan("k1", kerja);
  cek("permintaan sesudahnya berangkat baru", dipanggil === 2);
  await Promise.all([g.jalankan("k1", kerja), g.jalankan("k2", kerja)]);
  cek("kunci berbeda tidak digabung", dipanggil === 4);

  // Permintaan pengubah data di tengah jalan: GET sesudahnya tidak boleh menumpang yang lama.
  const lama = g.jalankan("k3", kerja);
  g.lupakan();
  const baru = g.jalankan("k3", kerja);
  await Promise.all([lama, baru]);
  cek("sesudah lupakan(): GET berikutnya berangkat baru", dipanggil === 6, dipanggil);
  cek("entri lama yang selesai belakangan tidak menghapus entri baru", g.ukuran === 0);

  let nGagal = 0;
  const rusak = async () => {
    nGagal++;
    await tidur(10);
    throw new Error("server rusak");
  };
  const hasil = await Promise.allSettled([g.jalankan("k4", rusak), g.jalankan("k4", rusak)]);
  cek("galat diteruskan ke semua penumpang, satu pekerjaan", nGagal === 1 && hasil.every((h) => h.status === "rejected"));
  await g.jalankan("k4", rusak).catch(() => {});
  cek("sesudah galat, percobaan berikutnya berangkat baru", nGagal === 2);
  const nilaiPrimitif = await g.jalankan("k5", async () => 42);
  cek("nilai bukan objek dikembalikan apa adanya", nilaiPrimitif === 42);
}

console.log("#3 id sinyal");
cek("hanya bilangan bulat positif, unik, sebagai teks", JSON.stringify(idSinyalUnik([2, "2", 0, -1, null, undefined, "x", 3.5, "7"])) === JSON.stringify(["2", "7"]));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
