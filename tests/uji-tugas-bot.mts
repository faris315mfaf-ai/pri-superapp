// Uji fungsi murni panel Tugas Bot (2F, 13 Okt 2026). Tanpa jaringan/DOM.
// Jalankan: npx tsx tests/uji-tugas-bot.mts
import type { KandidatBotRingkas, PermintaanWajibRingkas, TugasBotRingkas } from "@/lib/bot-tipe";
import {
  MAKS_KANDIDAT_TAMPIL,
  MAKS_TUGAS_TAMPIL,
  bisaAmbilPermintaan,
  formatAngkaRingkas,
  formatDurasi,
  formatTenggat,
  hariIniWib,
  judulTampil,
  labelAlasanTutup,
  labelJeda,
  labelMode,
  labelStatusKandidat,
  labelStatusPermintaan,
  labelTahap,
  persenKuota,
  platformDariUrl,
  platformPunyaIkon,
  platformTampil,
  potongUrl,
  ringkasGalat,
  selisihHari,
  teksKuota,
  tenggatMendesak,
  tugasTerbaru,
  urlAman,
  urutkanKandidat,
  urutkanPermintaan,
  warnaStatusKandidat,
  warnaTahap,
} from "@/features/tvr-ku/tugas-bot-murni";

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
const sama = (n: string, a: unknown, b: unknown) => cek(n, JSON.stringify(a) === JSON.stringify(b), { a, b });

console.log("\n[A] labelTahap & warnaTahap");
const TAHAP: [string, string][] = [
  ["cari", "Mencari"],
  ["pilih", "Memilih"],
  ["unduh", "Mengunduh"],
  ["edit", "Membuat video"],
  ["siap_ditinjau", "Siap ditinjau"],
  ["menunggu_acc", "Menunggu ACC"],
  ["disetujui", "Disetujui"],
  ["posting", "Memposting"],
  ["selesai", "Selesai"],
  ["gagal", "Gagal"],
];
for (const [k, v] of TAHAP) sama(`tahap ${k} -> ${v}`, labelTahap(k), v);
sama("tahap tak dikenal -> Diproses", labelTahap("aneh"), "Diproses");
sama("tahap kosong -> Diproses", labelTahap(""), "Diproses");
sama("tahap null -> Diproses", labelTahap(null), "Diproses");
sama("tahap undefined -> Diproses", labelTahap(undefined), "Diproses");
sama("tahap 'constructor' tidak bocor prototipe", labelTahap("constructor"), "Diproses");
sama("tahap '__proto__' tidak bocor", labelTahap("__proto__"), "Diproses");
sama("tahap beda huruf besar tidak dikenal", labelTahap("GAGAL"), "Diproses");
sama("warna gagal merah", warnaTahap("gagal"), "merah");
sama("warna selesai hijau", warnaTahap("selesai"), "hijau");
sama("warna disetujui hijau", warnaTahap("disetujui"), "hijau");
sama("warna siap_ditinjau kuning", warnaTahap("siap_ditinjau"), "kuning");
sama("warna menunggu_acc kuning", warnaTahap("menunggu_acc"), "kuning");
sama("warna edit biru", warnaTahap("edit"), "biru");
sama("warna tak dikenal netral", warnaTahap("xyz"), "netral");
sama("warna null netral", warnaTahap(null), "netral");

console.log("\n[B] labelAlasanTutup");
for (const kode of ["nonaktif", "jeda_global", "jeda_bot", "gagal_beruntun", "di_luar_jam", "kuota_habis", "terkunci", "menunggu_manusia"]) {
  const t = labelAlasanTutup(kode);
  cek(`kode ${kode} berteks Indonesia tanpa kode mentah`, t.length > 10 && !t.includes("_"), t);
}
sama("kode null -> kosong", labelAlasanTutup(null), "");
sama("kode undefined -> kosong", labelAlasanTutup(undefined), "");
sama("kode '' -> kosong", labelAlasanTutup(""), "");
cek("kode tak dikenal -> teks umum", labelAlasanTutup("kode_baru_server") === "Bot belum bisa memulai tugas baru saat ini.");
cek("kode tak dikenal tidak membocorkan kode", !labelAlasanTutup("kode_baru_server").includes("kode_baru"));
cek("di_luar_jam dengan jam sah memuat rentang", labelAlasanTutup("di_luar_jam", { mulai: "08:00", selesai: "22:00" }).includes("08:00–22:00 WIB"));
cek("di_luar_jam dengan jam rusak tanpa rentang", !labelAlasanTutup("di_luar_jam", { mulai: "8", selesai: "x" }).includes("WIB"));
cek("di_luar_jam tanpa jam tanpa rentang", !labelAlasanTutup("di_luar_jam").includes("WIB"));
cek("di_luar_jam jam null aman", !labelAlasanTutup("di_luar_jam", null).includes("WIB"));
cek("jeda_global dan jeda_bot berbeda teks", labelAlasanTutup("jeda_global") !== labelAlasanTutup("jeda_bot"));
cek("kode 'constructor' dianggap tak dikenal", labelAlasanTutup("constructor") === "Bot belum bisa memulai tugas baru saat ini.");

console.log("\n[C] mode, kuota, jeda");
sama("mode otomatis", labelMode("otomatis"), "Otomatis");
sama("mode acc", labelMode("acc"), "Perlu ACC");
sama("mode aneh", labelMode("lain"), "Tidak diketahui");
sama("mode null", labelMode(null), "Tidak diketahui");
sama("kuota 2/3", teksKuota(2, 3), "2/3 hari ini");
sama("kuota 0/0", teksKuota(0, 0), "0/0 hari ini");
sama("kuota negatif -> 0", teksKuota(-4, -1), "0/0 hari ini");
sama("kuota NaN -> 0", teksKuota(Number.NaN, 3), "0/3 hari ini");
sama("kuota pecahan dibulatkan ke bawah", teksKuota(1.9, 3.7), "1/3 hari ini");
sama("kuota Infinity -> 0", teksKuota(Number.POSITIVE_INFINITY, 3), "0/3 hari ini");
sama("persen 1/4 = 25", persenKuota(1, 4), 25);
sama("persen melebihi kuota dibatasi 100", persenKuota(9, 3), 100);
sama("persen kuota 0 = 0 (tanpa bagi nol)", persenKuota(3, 0), 0);
sama("persen negatif = 0", persenKuota(-2, 5), 0);
sama("persen NaN = 0", persenKuota(Number.NaN, 5), 0);
sama("persen 1/3 = 33", persenKuota(1, 3), 33);
sama("jeda global menang atas jeda bot", labelJeda(true, true), { jeda: true, label: "Dijeda (semua bot)" });
sama("jeda hanya global", labelJeda(false, true), { jeda: true, label: "Dijeda (semua bot)" });
sama("jeda hanya bot", labelJeda(true, false), { jeda: true, label: "Dijeda (bot ini)" });
sama("tanpa jeda", labelJeda(false, false), { jeda: false, label: "Berjalan" });

console.log("\n[D] status kandidat");
sama("bebas", labelStatusKandidat("bebas"), "Bebas");
sama("diklaim_saya", labelStatusKandidat("diklaim_saya"), "Diklaim bot ini");
sama("diklaim_lain", labelStatusKandidat("diklaim_lain"), "Diklaim bot lain");
sama("bentrok", labelStatusKandidat("bentrok"), "Bentrok dengan video yang sudah dipakai");
sama("status aneh", labelStatusKandidat("zzz"), "Tidak diketahui");
sama("status prototipe tidak bocor", labelStatusKandidat("toString"), "Tidak diketahui");
sama("status null", labelStatusKandidat(null), "Tidak diketahui");
sama("warna bebas hijau", warnaStatusKandidat("bebas"), "hijau");
sama("warna bentrok merah", warnaStatusKandidat("bentrok"), "merah");
sama("warna diklaim_saya biru", warnaStatusKandidat("diklaim_saya"), "biru");
sama("warna diklaim_lain netral", warnaStatusKandidat("diklaim_lain"), "netral");
sama("warna aneh netral", warnaStatusKandidat("zzz"), "netral");

console.log("\n[E] tenggat & tanggal");
sama("17 Okt", formatTenggat("2026-10-17"), "Tenggat 17 Okt");
sama("1 Jan", formatTenggat("2027-01-01"), "Tenggat 1 Jan");
sama("31 Des", formatTenggat("2026-12-31"), "Tenggat 31 Des");
sama("hari bernol di depan dibuang", formatTenggat("2026-05-03"), "Tenggat 3 Mei");
sama("29 Feb kabisat sah", formatTenggat("2028-02-29"), "Tenggat 29 Feb");
sama("29 Feb non-kabisat -> tanpa tenggat", formatTenggat("2026-02-29"), "Tanpa tenggat");
sama("31 April tak sah", formatTenggat("2026-04-31"), "Tanpa tenggat");
sama("bulan 13 tak sah", formatTenggat("2026-13-01"), "Tanpa tenggat");
sama("hari 00 tak sah", formatTenggat("2026-10-00"), "Tanpa tenggat");
sama("null -> tanpa tenggat", formatTenggat(null), "Tanpa tenggat");
sama("undefined -> tanpa tenggat", formatTenggat(undefined), "Tanpa tenggat");
sama("'' -> tanpa tenggat", formatTenggat(""), "Tanpa tenggat");
sama("teks bebas -> tanpa tenggat", formatTenggat("besok"), "Tanpa tenggat");
sama("ISO lengkap tidak diterima (hanya YYYY-MM-DD)", formatTenggat("2026-10-17T10:00:00Z"), "Tanpa tenggat");
sama("selisih 0", selisihHari("2026-10-13", "2026-10-13"), 0);
sama("selisih +4", selisihHari("2026-10-17", "2026-10-13"), 4);
sama("selisih negatif (lewat)", selisihHari("2026-10-10", "2026-10-13"), -3);
sama("selisih lintas bulan", selisihHari("2026-11-02", "2026-10-30"), 3);
sama("selisih lintas tahun", selisihHari("2027-01-01", "2026-12-31"), 1);
sama("selisih tanggal rusak -> null", selisihHari("x", "2026-10-13"), null);
sama("selisih hari ini rusak -> null", selisihHari("2026-10-13", "x"), null);
sama("selisih batas null -> null", selisihHari(null, "2026-10-13"), null);
cek("mendesak: hari ini", tenggatMendesak("2026-10-13", "2026-10-13"));
cek("mendesak: besok", tenggatMendesak("2026-10-14", "2026-10-13"));
cek("mendesak: sudah lewat", tenggatMendesak("2026-10-01", "2026-10-13"));
cek("tidak mendesak: lusa", !tenggatMendesak("2026-10-15", "2026-10-13"));
cek("tidak mendesak: tanpa tenggat", !tenggatMendesak(null, "2026-10-13"));
cek("tidak mendesak: tanggal rusak", !tenggatMendesak("rusak", "2026-10-13"));
sama("hariIniWib: 17:30 UTC sudah esok di WIB", hariIniWib(Date.UTC(2026, 9, 13, 17, 30)), "2026-10-14");
sama("hariIniWib: 16:59 UTC masih hari yang sama", hariIniWib(Date.UTC(2026, 9, 13, 16, 59)), "2026-10-13");
sama("hariIniWib: tutup tahun", hariIniWib(Date.UTC(2026, 11, 31, 18, 0)), "2027-01-01");
cek("hariIniWib bawaan berformat YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(hariIniWib()));
sama("status permintaan terbuka", labelStatusPermintaan("terbuka"), "Terbuka");
sama("status permintaan diambil_saya", labelStatusPermintaan("diambil_saya"), "Diambil bot ini");

console.log("\n[F] urutkanPermintaan & bisaAmbilPermintaan");
const P = (id: number, status: PermintaanWajibRingkas["status"], batas: string | null): PermintaanWajibRingkas => ({
  id,
  judul: `P${id}`,
  keterangan: "",
  kategori: "NEWS",
  batas_waktu: batas,
  status,
});
const daftarP = [P(1, "terbuka", null), P(2, "terbuka", "2026-10-20"), P(3, "diambil_saya", "2026-10-30"), P(4, "terbuka", "2026-10-15"), P(5, "terbuka", "2026-10-15"), P(6, "terbuka", "rusak")];
const salinanP = JSON.stringify(daftarP);
sama("urut: diambil dulu, tenggat terdekat, tanpa/rusak di akhir, id naik", urutkanPermintaan(daftarP).map((p) => p.id), [3, 4, 5, 2, 1, 6]);
cek("urutkanPermintaan tidak mengubah masukan", JSON.stringify(daftarP) === salinanP);
sama("urut kosong", urutkanPermintaan([]), []);
sama("urut satu elemen", urutkanPermintaan([P(9, "terbuka", null)]).map((p) => p.id), [9]);
cek("bisa ambil: terbuka & bot boleh mulai", bisaAmbilPermintaan(P(1, "terbuka", null), true));
cek("tak bisa ambil: bot tak boleh mulai", !bisaAmbilPermintaan(P(1, "terbuka", null), false));
cek("tak bisa ambil: sudah diambil bot ini", !bisaAmbilPermintaan(P(1, "diambil_saya", null), true));

console.log("\n[G] URL & platform");
sama("IG", platformDariUrl("https://www.instagram.com/reel/abc/"), "Instagram");
sama("IG instagr.am", platformDariUrl("https://instagr.am/p/abc"), "Instagram");
sama("TikTok", platformDariUrl("https://www.tiktok.com/@ntv/video/123"), "TikTok");
sama("TikTok vm.", platformDariUrl("https://vm.tiktok.com/ZS123/"), "TikTok");
sama("YouTube", platformDariUrl("https://www.youtube.com/watch?v=abc"), "YouTube");
sama("YouTube m.", platformDariUrl("https://m.youtube.com/shorts/abc"), "YouTube");
sama("youtu.be", platformDariUrl("https://youtu.be/abc"), "YouTube");
sama("huruf besar host", platformDariUrl("HTTPS://WWW.INSTAGRAM.COM/reel/x"), "Instagram");
sama("domain mirip tidak cocok", platformDariUrl("https://notinstagram.com/x"), null);
sama("domain palsu berakhiran", platformDariUrl("https://instagram.com.evil.example/x"), null);
sama("domain lain", platformDariUrl("https://example.com/x"), null);
sama("bukan URL", platformDariUrl("bukan url"), null);
sama("ftp ditolak", platformDariUrl("ftp://instagram.com/x"), null);
sama("null", platformDariUrl(null), null);
sama("platformTampil memakai data server", platformTampil("TikTok", "https://youtube.com/x"), "TikTok");
sama("platformTampil cadangan dari URL", platformTampil("", "https://youtu.be/abc"), "YouTube");
sama("platformTampil spasi saja -> cadangan URL", platformTampil("   ", "https://youtu.be/abc"), "YouTube");
sama("platformTampil terakhir 'Sosmed'", platformTampil(null, "https://example.com"), "Sosmed");
cek("platformPunyaIkon IG", platformPunyaIkon("Instagram"));
cek("platformPunyaIkon spasi+huruf besar", platformPunyaIkon("  YOUTUBE "));
cek("platformPunyaIkon Sosmed tidak", !platformPunyaIkon("Sosmed"));
sama("urlAman https", urlAman("https://instagram.com/reel/x"), "https://instagram.com/reel/x");
sama("urlAman javascript: ditolak", urlAman("javascript:alert(1)"), null);
sama("urlAman data: ditolak", urlAman("data:text/html,<script>1</script>"), null);
sama("urlAman bukan URL", urlAman("instagram.com/x"), null);
sama("urlAman null", urlAman(null), null);
sama("urlAman dengan spasi tepi", urlAman("  https://youtu.be/a  "), "https://youtu.be/a");
sama("potongUrl: skema, www, dan '/' penutup dibuang", potongUrl("https://www.instagram.com/reel/abc/"), "instagram.com/reel/abc");
sama("potongUrl pendek apa adanya", potongUrl("http://a.id/x"), "a.id/x");
const panjang = `https://www.youtube.com/watch?v=${"a".repeat(200)}`;
const dipotong = potongUrl(panjang);
cek("potongUrl panjang berakhir …", dipotong.endsWith("…"), dipotong);
cek("potongUrl panjang <= batas", dipotong.length <= 46, dipotong.length);
sama("potongUrl batas khusus", potongUrl("https://example.com/abcdefghij", 12), "example.com…");
cek("potongUrl batas terlalu kecil tetap aman", potongUrl("https://example.com/abcdefghij", 0).length <= 4);
sama("potongUrl null -> ''", potongUrl(null), "");
sama("potongUrl kosong -> ''", potongUrl(""), "");
sama("potongUrl bukan URL dipotong apa adanya", potongUrl("teks sangat panjang sekali tanpa skema apapun juga di sini ya", 20), "teks sangat panjang…");
sama("potongUrl banyak '/' penutup", potongUrl("https://x.id/a///"), "x.id/a");
sama("potongUrl skema huruf besar", potongUrl("HTTPS://WWW.X.ID/a"), "X.ID/a");

console.log("\n[H] durasi & angka");
sama("0 detik", formatDurasi(0), "0:00");
sama("45 detik", formatDurasi(45), "0:45");
sama("65 detik", formatDurasi(65), "1:05");
sama("3599 detik", formatDurasi(3599), "59:59");
sama("3600 detik", formatDurasi(3600), "1:00:00");
sama("3723 detik", formatDurasi(3723), "1:02:03");
sama("pecahan dibulatkan", formatDurasi(59.6), "1:00");
sama("null", formatDurasi(null), "—");
sama("undefined", formatDurasi(undefined), "—");
sama("negatif", formatDurasi(-1), "—");
sama("NaN", formatDurasi(Number.NaN), "—");
sama("Infinity", formatDurasi(Number.POSITIVE_INFINITY), "—");
sama("angka 0", formatAngkaRingkas(0), "0");
sama("angka 950", formatAngkaRingkas(950), "950");
sama("angka 999", formatAngkaRingkas(999), "999");
sama("angka 1000", formatAngkaRingkas(1000), "1 rb");
sama("angka 1234", formatAngkaRingkas(1234), "1,2 rb");
sama("angka 15600", formatAngkaRingkas(15_600), "15,6 rb");
sama("angka 3_400_000", formatAngkaRingkas(3_400_000), "3,4 jt");
sama("angka 1 miliar", formatAngkaRingkas(1_000_000_000), "1 M");
sama("angka 2,5 miliar", formatAngkaRingkas(2_500_000_000), "2,5 M");
sama("angka null", formatAngkaRingkas(null), "—");
sama("angka negatif", formatAngkaRingkas(-5), "—");
sama("angka NaN", formatAngkaRingkas(Number.NaN), "—");
sama("angka desimal kecil dibulatkan ke bawah", formatAngkaRingkas(12.9), "12");

console.log("\n[I] urutkanKandidat");
const K = (id: number, status: KandidatBotRingkas["status"], terbit: string | null): KandidatBotRingkas => ({
  id,
  url: `https://youtu.be/${id}`,
  judul: `K${id}`,
  platform: "YouTube",
  durasi_detik: 30,
  tayangan: 100,
  waktu_terbit: terbit,
  status,
  dibuat_pada: "2026-10-13T00:00:00Z",
});
const daftarK = [
  K(1, "bentrok", "2026-10-13T10:00:00Z"),
  K(2, "bebas", "2026-10-10T10:00:00Z"),
  K(3, "diklaim_lain", "2026-10-13T11:00:00Z"),
  K(4, "bebas", "2026-10-12T10:00:00Z"),
  K(5, "diklaim_saya", "2026-10-01T10:00:00Z"),
  K(6, "bebas", null),
  K(7, "bebas", "rusak"),
  K(8, "bebas", "2026-10-12T10:00:00Z"),
];
const salinanK = JSON.stringify(daftarK);
sama("urut kandidat: saya, bebas (terbit terbaru, tanpa waktu akhir, id besar dulu), lain, bentrok", urutkanKandidat(daftarK).map((k) => k.id), [5, 8, 4, 2, 7, 6, 3, 1]);
cek("urutkanKandidat tidak mengubah masukan", JSON.stringify(daftarK) === salinanK);
const banyak = Array.from({ length: 35 }, (_, i) => K(i + 1, "bebas", `2026-10-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z`));
sama("dibatasi 20", urutkanKandidat(banyak).length, MAKS_KANDIDAT_TAMPIL);
sama("batas khusus 3", urutkanKandidat(banyak, 3).length, 3);
sama("batas 0 -> kosong", urutkanKandidat(banyak, 0).length, 0);
sama("batas negatif -> kosong", urutkanKandidat(banyak, -4).length, 0);
sama("kosong", urutkanKandidat([]), []);
cek("status tak dikenal ditaruh paling akhir", urutkanKandidat([{ ...K(1, "bebas", null), status: "aneh" as never }, K(2, "bentrok", null)]).map((k) => k.id).join() === "2,1");

console.log("\n[J] tugasTerbaru, galat, judul");
const T = (id: number, dibuat: string, tahap = "edit", galat = ""): TugasBotRingkas => ({
  id,
  tahap,
  judul: `T${id}`,
  kategori: "NEWS",
  galat,
  dibuat_pada: dibuat,
  selesai_pada: null,
  dari_video_wajib: false,
});
const tugas = Array.from({ length: 14 }, (_, i) => T(i + 1, `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
const sepuluh = tugasTerbaru(tugas);
sama("tugas dibatasi 10", sepuluh.length, MAKS_TUGAS_TAMPIL);
sama("tugas terbaru dulu", sepuluh.map((t) => t.id), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
sama("waktu sama -> id besar dulu", tugasTerbaru([T(1, "2026-10-01T00:00:00Z"), T(2, "2026-10-01T00:00:00Z")]).map((t) => t.id), [2, 1]);
sama("waktu rusak di akhir", tugasTerbaru([T(1, "rusak"), T(2, "2026-10-01T00:00:00Z")]).map((t) => t.id), [2, 1]);
sama("tugas kosong", tugasTerbaru([]), []);
cek("tugasTerbaru tidak mengubah masukan", tugas[0].id === 1 && tugas.length === 14);
sama("galat dirapikan", ringkasGalat("  Gagal\n\n unduh\t video  "), "Gagal unduh video");
const galatPanjang = ringkasGalat("x".repeat(500));
cek("galat panjang dipotong dengan …", galatPanjang.endsWith("…") && galatPanjang.length <= 140, galatPanjang.length);
sama("galat pas batas tidak dipotong", ringkasGalat("abcde", 5), "abcde");
sama("galat melewati batas dipotong", ringkasGalat("abcdef", 5), "abcd…");
sama("galat null -> ''", ringkasGalat(null), "");
sama("galat kosong -> ''", ringkasGalat("   "), "");
sama("judul dirapikan", judulTampil("  Banjir\n  Jakarta "), "Banjir Jakarta");
sama("judul kosong -> cadangan", judulTampil("   "), "(tanpa judul)");
sama("judul null -> cadangan", judulTampil(null), "(tanpa judul)");
sama("judul cadangan khusus", judulTampil("", "instagram.com/x"), "instagram.com/x");

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
