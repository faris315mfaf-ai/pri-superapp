// Uji VIDEO WAJIB BERNOMOR PERINTAH (15 Okt 2026). Murni — tanpa jaringan/database.
// Jalankan: npx tsx tests/uji-video-wajib.mts
import {
  bersihkanBatasJam,
  bersihkanPola,
  berlakuPada,
  geserTanggal,
  kemajuanSaya,
  kunciPerintahAktif,
  menitDariJam,
  menitWib,
  persenBulat,
  statusKepatuhan,
  susunKepatuhan,
  tanggalSah,
  tanggalWibWajib,
  teksPola,
  uraiPerintahAktif,
  wilayahAnggota,
  type AkunKepatuhan,
} from "@/lib/video-wajib-perintah";
import { susunTrenHarian, type VideoKategori } from "@/lib/insight-kategori";
import { hitungKepatuhan, sudahPada, tujuhHari, type AnggotaRoster, type CatatanPosting } from "@/lib/video-wajib-pantau";
import { saatnyaMengingatkan } from "@/lib/video-wajib-pengingat";

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

console.log("Pengaturan");
cek("pola tak dikenal → harian", bersihkanPola("apa saja") === "harian");
cek("pola sekali", bersihkanPola("sekali") === "sekali");
cek("jam sah dirapikan", bersihkanBatasJam("7:05") === "07:05");
cek("jam rusak → 18:00", bersihkanBatasJam("25:99") === "18:00" && bersihkanBatasJam("") === "18:00");
cek("teks pola", teksPola({ pola: "harian", batas_jam: "18:00" }) === "setiap hari · sebelum 18.00");
cek("teks pola sekali", teksPola({ pola: "sekali", batas_jam: "09:30" }) === "sekali · sebelum 09.30");

console.log("Tanggal WIB");
// 14 Okt 2026 17:30 UTC = 15 Okt 00:30 WIB
cek("lewat tengah malam WIB", tanggalWibWajib(Date.parse("2026-10-14T17:30:00Z")) === "2026-10-15");
cek("sebelum tengah malam WIB", tanggalWibWajib("2026-10-14T16:59:00Z") === "2026-10-14");
cek("tanggal rusak → kosong", tanggalWibWajib("bukan tanggal") === "");
cek("geser maju", geserTanggal("2026-10-31", 1) === "2026-11-01");
cek("geser mundur lintas tahun", geserTanggal("2027-01-01", -1) === "2026-12-31");
cek("tanggalSah", tanggalSah("2026-10-15") === "2026-10-15" && tanggalSah("15-10-2026") === null && tanggalSah("2026-13-40") === null);
cek("menitWib 17:00 WIB", menitWib(Date.parse("2026-10-15T10:00:00Z")) === 17 * 60);
cek("menitDariJam", menitDariJam("18:30") === 18 * 60 + 30);

console.log("Berlaku");
const dasar = { aktif: true, batas_waktu: "", dibuat_tanggal: "2026-10-15", wajib_posting: true, pola: "harian" as const };
cek("sebelum terbit tidak berlaku", !berlakuPada(dasar, "2026-10-14"));
cek("hari terbit berlaku", berlakuPada(dasar, "2026-10-15"));
cek("tanpa batas berlaku terus", berlakuPada(dasar, "2027-01-01"));
cek("lewat batas waktu tidak berlaku", !berlakuPada({ ...dasar, batas_waktu: "2026-10-20" }, "2026-10-21"));
cek("hari batas masih berlaku", berlakuPada({ ...dasar, batas_waktu: "2026-10-20" }, "2026-10-20"));
cek("bukan wajib posting tidak berlaku", !berlakuPada({ ...dasar, wajib_posting: false }, "2026-10-15"));

console.log("Status & kepatuhan");
cek("semua platform = selesai", statusKepatuhan(["tiktok", "instagram"], ["instagram", "tiktok"]) === "selesai");
cek("sebagian", statusKepatuhan(["tiktok", "instagram"], ["tiktok"]) === "sebagian");
cek("belum", statusKepatuhan(["tiktok"], []) === "belum");
cek("tanpa platform = belum (bukan selesai)", statusKepatuhan([], []) === "belum");
cek("persen bulat", persenBulat(97, 212) === 46 && persenBulat(0, 0) === 0);

const akun: AkunKepatuhan[] = [
  { user_id: "1", nama: "Budi", wilayah: "Aceh", platform: ["tiktok", "instagram"], sudah: ["tiktok", "instagram"] },
  { user_id: "2", nama: "Ani", wilayah: "Aceh", platform: ["tiktok"], sudah: [] },
  { user_id: "3", nama: "Citra", wilayah: "Bali", platform: ["youtube", "tiktok", "facebook"], sudah: ["tiktok"] },
  { user_id: "4", nama: "Tanpa Akun", wilayah: "Bali", platform: [], sudah: [] },
  { user_id: "5", nama: "Dedi", wilayah: "Bali", platform: ["tiktok"], sudah: ["tiktok"] },
];
const { daftar, ringkas } = susunKepatuhan(akun);
cek("akun tanpa platform tidak dihitung", ringkas.akun === 4 && !daftar.some((d) => d.user_id === "4"), ringkas.akun);
cek("hitungan selesai/sebagian/belum", ringkas.selesai === 2 && ringkas.sebagian === 1 && ringkas.belum === 1, ringkas);
cek("persen total 50", ringkas.persen === 50);
cek("urut: belum dulu, selesai terakhir", daftar[0]!.status === "belum" && daftar[daftar.length - 1]!.status === "selesai");
cek("rinci urut platform baku", daftar.find((d) => d.user_id === "3")!.rinci.map((r) => r.platform).join() === "tiktok,youtube,facebook");
cek("per wilayah: yang tertinggal dulu", ringkas.per_wilayah[0]!.nama === "Aceh" || ringkas.per_wilayah[0]!.persen <= ringkas.per_wilayah[1]!.persen, ringkas.per_wilayah);
const aceh = ringkas.per_wilayah.find((w) => w.nama === "Aceh")!;
cek("wilayah Aceh 1/2 = 50%", aceh.selesai === 1 && aceh.akun === 2 && aceh.persen === 50);
const tt = ringkas.per_platform.find((p) => p.platform === "tiktok")!;
cek("per platform TikTok 3/4", tt.sudah === 3 && tt.wajib === 4, tt);
cek("urutan platform: tiktok pertama", ringkas.per_platform[0]!.platform === "tiktok");

console.log("Wilayah");
cek("zona dipakai bila ada", wilayahAnggota({ zona: "Jawa Barat", divisi: "DPD", sub_divisi: "X" }) === "Jawa Barat");
cek("DPD memakai nama daerah", wilayahAnggota({ divisi: "DPD", sub_divisi: "Jawa Barat" }) === "DPD Jawa Barat");
cek("sayap memakai nama sayap", wilayahAnggota({ divisi: "Divisi Sayap Partai", sub_divisi: "PATRIOT" }) === "Sayap PATRIOT");
cek("lainnya = Pusat", wilayahAnggota({ divisi: "Divisi IT" }) === "Pusat");

console.log("Kemajuan saya");
const k = kemajuanSaya(["youtube", "tiktok"], ["tiktok"]);
cek("kemajuan sebagian", !k.selesai && k.sudah.join() === "tiktok" && k.platform_wajib.join() === "tiktok,youtube");
cek("kemajuan selesai", kemajuanSaya(["tiktok"], ["tiktok"]).selesai);
cek("tanpa akun", kemajuanSaya([], []).tanpa_akun && !kemajuanSaya([], []).selesai);

console.log("Catatan posting → kepatuhan");
const roster: AnggotaRoster[] = [
  { user_id: "1", nama: "Budi", wilayah: "Aceh", platform: ["tiktok", "instagram"] },
  { user_id: "2", nama: "Ani", wilayah: "Bali", platform: ["tiktok"] },
];
const catatan: CatatanPosting[] = [
  { user_id: "1", platform: "tiktok", tanggal: "2026-10-15" },
  { user_id: "1", platform: "instagram", tanggal: "2026-10-15" },
  { user_id: "2", platform: "tiktok", tanggal: "2026-10-14" },
];
cek("harian: hanya tanggal itu", sudahPada(catatan, "2", "2026-10-15", "harian", "2026-10-14").length === 0);
cek("harian: tanggal kemarin terhitung kemarin", sudahPada(catatan, "2", "2026-10-14", "harian", "2026-10-14").join() === "tiktok");
cek("sekali: posting kapan pun sejak terbit terhitung", sudahPada(catatan, "2", "2026-10-15", "sekali", "2026-10-14").join() === "tiktok");
cek("sekali: sebelum terbit tidak terhitung", sudahPada(catatan, "2", "2026-10-15", "sekali", "2026-10-15").length === 0);
const p = { pola: "harian" as const, dibuat_pada: "2026-10-14T20:00:00Z", batas_waktu: "" }; // terbit 15 Okt 03:00 WIB
const h15 = hitungKepatuhan(p, "2026-10-15", roster, catatan);
cek("15 Okt: Budi selesai, Ani belum", h15.ringkas.selesai === 1 && h15.ringkas.belum === 1, h15.ringkas);
const tujuh = tujuhHari({ ...p, dibuat_pada: "2026-10-13T00:00:00Z" }, "2026-10-15", roster, catatan);
cek("grafik tujuh hari mulai dari hari terbit", tujuh.length === 3 && tujuh[0]!.tanggal === "2026-10-13", tujuh.map((t) => t.tanggal));
cek("grafik: 13 Okt 0%, 14 Okt (Ani) 50%, 15 Okt (Budi) 50%", tujuh[0]!.persen === 0 && tujuh[1]!.persen === 50 && tujuh[2]!.persen === 50, tujuh);

console.log("Pengingat");
const perintah = {
  id: "9", judul: "x", kategori: "PLN", aktif: true, batas_waktu: "", dibuat_pada: "2026-10-14T00:00:00Z",
  wajib_posting: true, pola: "harian" as const, batas_jam: "18:00", pengingat: true,
};
const wib = (t: string) => Date.parse(`2026-10-15T${t}:00+07:00`);
cek("sebelum jendela: belum", !saatnyaMengingatkan(perintah, wib("15:59")));
cek("jendela dibuka 16:00", saatnyaMengingatkan(perintah, wib("16:00")));
cek("tepat sebelum batas masih", saatnyaMengingatkan(perintah, wib("17:59")));
cek("lewat batas: tidak", !saatnyaMengingatkan(perintah, wib("18:00")));
cek("pengingat dimatikan", !saatnyaMengingatkan({ ...perintah, pengingat: false }, wib("17:00")));
cek("perintah dimatikan", !saatnyaMengingatkan({ ...perintah, aktif: false }, wib("17:00")));
cek("bukan wajib posting", !saatnyaMengingatkan({ ...perintah, wajib_posting: false }, wib("17:00")));
cek("lewat batas waktu perintah", !saatnyaMengingatkan({ ...perintah, batas_waktu: "2026-10-14" }, wib("17:00")));
cek("batas jam dini hari: jendela dijepit ke 00:00", saatnyaMengingatkan({ ...perintah, batas_jam: "01:00" }, wib("00:10")));

console.log("Perintah aktif (penyimpanan lokal)");
cek("kunci per pengguna", kunciPerintahAktif("7") !== kunciPerintahAktif("8"));
cek("urai sah", uraiPerintahAktif(JSON.stringify({ id: "12", judul: "PLN", kategori: "PLN" }))?.kategori === "PLN");
cek("urai: id bukan angka ditolak", uraiPerintahAktif(JSON.stringify({ id: "abc", kategori: "PLN" })) === null);
cek("urai: tanpa kategori ditolak", uraiPerintahAktif(JSON.stringify({ id: "1", kategori: "" })) === null);
cek("urai: rusak/null", uraiPerintahAktif("{bukan json") === null && uraiPerintahAktif(null) === null);

console.log("Tren harian");
const v = (tanggal: string, tayangan: number | null): VideoKategori =>
  ({ tanggal_wib: tanggal, metrik: tayangan === null ? null : { tayangan } }) as unknown as VideoKategori;
const tren = susunTrenHarian([v("2026-10-15", 100), v("2026-10-15", 50), v("2026-10-14", null), v("", 5)]);
cek("tren: dikelompokkan per tanggal & urut", tren.length === 2 && tren[0]!.tanggal === "2026-10-14" && tren[1]!.video === 2 && tren[1]!.tayangan === 150, tren);
cek("tren: dipotong ke N hari terakhir", susunTrenHarian(Array.from({ length: 20 }, (_, i) => v(`2026-10-${String(i + 1).padStart(2, "0")}`, 1)), 14).length === 14);

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
