// Uji KARAKTER SAYA (16 Okt 2026). Murni — tanpa jaringan.
// Jalankan: npx tsx tests/uji-karakter.mts
import fs from "node:fs";
import {
  GAYA_RAMBUT,
  JUMLAH_ATASAN,
  JUMLAH_RAMBUT,
  KULIT,
  MODEL_ATASAN,
  PRESET,
  WARNA_ATASAN,
  WARNA_CELANA,
  WARNA_RAMBUT,
  WARNA_SEPATU,
  bacaKonfig,
  bolehKarakterSaya,
  idRupaDariQuery,
  keKonfigKit,
  konfigBawaan,
  samaKonfig,
  validasiKonfig,
  type KonfigKarakter,
} from "@/lib/karakter-murni";
import { buatPenahanGagal } from "@/features/ruang-bot/karakter-sprite";

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

const contoh: KonfigKarakter = PRESET[0]!.konfig;

console.log("Gerbang (semua akun sejak 16 Okt malam)");
cek("akun #4 boleh", bolehKarakterSaya({ id: 4 }));
cek("akun #176 boleh (string)", bolehKarakterSaya({ id: "176" }));
cek("akun lain juga boleh", bolehKarakterSaya({ id: 5 }) && bolehKarakterSaya({ id: "981" }));
cek("tanpa akun tidak boleh", !bolehKarakterSaya(null) && !bolehKarakterSaya({}) && !bolehKarakterSaya({ id: " " }));

console.log("Daftar id rupa");
cek("id sah, unik, urutan dijaga", JSON.stringify(idRupaDariQuery("5, 3,5,10")) === "[5,3,10]");
cek("kosong / bukan angka / nol / negatif ditolak", [null, "", "a", "0", "-3", "1.5", "1,,x"].every((q) => idRupaDariQuery(q as string | null) === null));
cek("maks 60 id", idRupaDariQuery(Array.from({ length: 60 }, (_, i) => i + 1).join(","))?.length === 60 && idRupaDariQuery(Array.from({ length: 61 }, (_, i) => i + 1).join(",")) === null);

console.log("Validasi");
cek("preset valid", PRESET.every((p) => validasiKonfig(p.konfig).ok));
cek("id preset unik", new Set(PRESET.map((p) => p.id)).size === PRESET.length);
cek("bukan objek ditolak", !validasiKonfig(null).ok && !validasiKonfig("x").ok);
cek("kulit asing ditolak", !validasiKonfig({ ...contoh, kulit: "#123456" }).ok);
cek("rambut di luar batas ditolak", !validasiKonfig({ ...contoh, rambut: JUMLAH_RAMBUT + 1 }).ok && !validasiKonfig({ ...contoh, rambut: -1 }).ok);
cek("rambut pecahan ditolak", !validasiKonfig({ ...contoh, rambut: 1.5 }).ok);
cek("rambut 0 (tanpa rambut) boleh", validasiKonfig({ ...contoh, rambut: 0 }).ok);
cek("atasan di luar batas ditolak", !validasiKonfig({ ...contoh, atasan: JUMLAH_ATASAN + 1 }).ok);
cek("warna celana asing ditolak", !validasiKonfig({ ...contoh, warnaCelana: "#ffffff" }).ok);
cek("warna sepatu bukan string ditolak", !validasiKonfig({ ...contoh, warnaSepatu: 7 }).ok);
const kecil = validasiKonfig({ ...contoh, kulit: contoh.kulit.toLowerCase() });
cek("hex huruf kecil diterima & dikanonikkan", kecil.ok && kecil.konfig.kulit === contoh.kulit);
const lebih = validasiKonfig({ ...contoh, nakal: "<script>", v: 99 });
cek("kunci tambahan dibuang, versi dipaksa 1", lebih.ok && !("nakal" in lebih.konfig) && lebih.konfig.v === 1);
cek("bacaKonfig rusak → null", bacaKonfig({ kulit: "x" }) === null && bacaKonfig(undefined) === null);

console.log("Rupa bawaan");
cek("bawaan stabil per akun", samaKonfig(konfigBawaan(176), konfigBawaan("176")));
cek("bawaan valid untuk banyak akun", Array.from({ length: 300 }, (_, i) => validasiKonfig(konfigBawaan(i + 1)).ok).every(Boolean));
const ragam = new Set(Array.from({ length: 300 }, (_, i) => JSON.stringify(konfigBawaan(i + 1))));
cek("bawaan beragam", ragam.size > 250, ragam.size);
cek("bawaan memakai kaus dasar", konfigBawaan(42).atasan === 0);

console.log("Katalog vs aset");
const manifest = JSON.parse(fs.readFileSync("public/karakter/v1/manifest.json", "utf8"));
cek("jumlah rambut = manifest", manifest.layers.rambut.jumlah === JUMLAH_RAMBUT, manifest.layers.rambut.jumlah);
cek("jumlah atasan = manifest", manifest.layers.atasan.jumlah === JUMLAH_ATASAN, manifest.layers.atasan.jumlah);
cek("nama rambut lengkap", GAYA_RAMBUT.length === JUMLAH_RAMBUT + 1 && MODEL_ATASAN.length === JUMLAH_ATASAN + 1);
const ada = (f: string) => fs.existsSync(`public/karakter/v1/${f}`);
cek("berkas rambut ada", Array.from({ length: JUMLAH_RAMBUT }, (_, i) => ada(`rambut_${String(i + 1).padStart(2, "0")}.png`)).every(Boolean));
cek("berkas atasan + masker ada", Array.from({ length: JUMLAH_ATASAN }, (_, i) => String(i + 1).padStart(2, "0")).every((n) => ada(`atasan_${n}_idle.png`) && ada(`atasan_${n}_idle_kulit.png`)));
cek("berkas badan + 4 masker per pose", ["idle", "walk", "sit", "work"].every((a) => ["", "_kulit", "_baju", "_celana", "_sepatu"].every((m) => ada(`badan_${a}${m}.png`) && ada(`badan_${a}${m}@2x.png`))));
cek("warna dasar zona tercatat", ["terangRambut", "terangBaju", "terangCelana", "terangSepatu", "terangAtasan"].every((k) => manifest.warnaDasar[k] > 0));
cek("palet tanpa duplikat", [KULIT, WARNA_RAMBUT, WARNA_ATASAN, WARNA_CELANA, WARNA_SEPATU].every((d) => new Set(d.map(([h]) => h)).size === d.length));

console.log("Bentuk kit");
const kit = keKonfigKit({ ...contoh, kulit: KULIT[3]![0], rambut: 7, warnaRambut: WARNA_RAMBUT[11]![0], atasan: 9 }, 176);
cek("skinTone & rambut ber-ID kit", kit.skinTone === "skin_04" && kit.hairStyle === "hair_07" && kit.hairColor === "hair_color_12" && kit.top === "top_09");
cek("tanpa rambut → hairStyle null", keKonfigKit({ ...contoh, rambut: 0 }, 1).hairStyle === null);

console.log("Jeda coba ulang gagal muat (sprite)");
{
  const p = buatPenahanGagal(10_000, 60_000);
  cek("belum pernah gagal → tidak ditahan", !p.tahan("a", 0));
  p.gagal("a", 0);
  cek("baru gagal → ditahan 10 dtk", p.tahan("a", 9_999) && !p.tahan("a", 10_000));
  p.gagal("a", 5_000);
  cek("gagal serentak dalam jeda tidak melipatgandakan", !p.tahan("a", 10_000));
  p.gagal("a", 10_000);
  cek("gagal lagi → jeda 20 dtk", p.tahan("a", 29_999) && !p.tahan("a", 30_000));
  p.gagal("a", 30_000);
  p.gagal("a", 70_000);
  p.gagal("a", 150_000);
  cek("jeda dibatasi 60 dtk", p.tahan("a", 209_999) && !p.tahan("a", 210_000));
  cek("kunci lain tidak ikut ditahan", !p.tahan("b", 150_000));
  p.berhasil("a");
  cek("berhasil → catatan gagal dihapus", !p.tahan("a", 150_001));
  p.gagal("a", 300_000);
  cek("gagal sesudah berhasil mulai lagi dari 10 dtk", !p.tahan("a", 310_000));
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
