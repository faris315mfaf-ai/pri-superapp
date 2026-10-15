// Uji SIARAN KOORDINATOR KE AKUN ANGGOTA (15 Okt 2026). Murni — tanpa jaringan/database.
// Jalankan: npx tsx tests/uji-siaran-koordinator.mts
import {
  KEBIJAKAN_SIARAN,
  PESAN_TERPUTUS,
  acak,
  bolehDiulang,
  diJamTenang,
  jadwalKirim,
  jamWib,
  jedaSah,
  keluarJamTenang,
  konfirmasiSah,
  perluKonfirmasi,
  pilihVarian,
  rapikanVariasi,
  ringkasItem,
  statusPenerima,
  uraiVariasi,
  variasiAman,
} from "@/lib/siaran-koordinator-murni";
import { duniaUmum } from "@/lib/ruang-umum-murni";
import type { StatusDunia } from "@/lib/dunia-murni";

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
const wib = (s: string) => Date.parse(`${s}+07:00`);

console.log("Konfirmasi & jeda");
cek("50 akun tanpa konfirmasi", !perluKonfirmasi(50));
cek("51 akun wajib konfirmasi", perluKonfirmasi(51));
cek("konfirmasi huruf kecil & spasi sah", konfirmasiSah("  siarkan "));
cek("konfirmasi salah ditolak", !konfirmasiSah("SIARKAN!") && !konfirmasiSah("") && !konfirmasiSah(null));
cek("jeda dijepit bawah", jedaSah(1) === KEBIJAKAN_SIARAN.JEDA_MIN);
cek("jeda dijepit atas", jedaSah(99999) === KEBIJAKAN_SIARAN.JEDA_MAKS);
cek("jeda rusak = bawaan", jedaSah("abc") === KEBIJAKAN_SIARAN.JEDA_BAWAAN);

console.log("Status penerima");
cek("siap: platform minus perlu ulang", JSON.stringify(statusPenerima({ platform: ["tiktok", "instagram"], perluUlang: ["instagram"], siaranHariIni: 0 })) === JSON.stringify({ status: "siap", platformSiap: ["tiktok"] }));
cek("semua perlu ulang = login_ulang", statusPenerima({ platform: ["tiktok"], perluUlang: ["tiktok"], siaranHariIni: 0 }).status === "login_ulang");
cek("tanpa platform = tanpa_akun", statusPenerima({ platform: [], perluUlang: [], siaranHariIni: 0 }).status === "tanpa_akun");
cek("batas harian", statusPenerima({ platform: ["tiktok"], perluUlang: [], siaranHariIni: 3 }).status === "batas_harian");
cek("di bawah batas harian tetap siap", statusPenerima({ platform: ["tiktok"], perluUlang: [], siaranHariIni: 2 }).status === "siap");

console.log("Jam tenang");
cek("jam WIB", jamWib(wib("2026-10-16T08:30:00")) === 8);
cek("22.00 tenang", diJamTenang(wib("2026-10-16T22:00:00")));
cek("05.59 tenang", diJamTenang(wib("2026-10-17T05:59:00")));
cek("06.00 tidak tenang", !diJamTenang(wib("2026-10-17T06:00:00")));
cek("21.59 tidak tenang", !diJamTenang(wib("2026-10-16T21:59:00")));
cek("23.10 → 06.00 besok", keluarJamTenang(wib("2026-10-16T23:10:00")) === wib("2026-10-17T06:00:00"));
cek("02.00 → 06.00 hari yang sama", keluarJamTenang(wib("2026-10-17T02:00:00")) === wib("2026-10-17T06:00:00"));
cek("siang tidak digeser", keluarJamTenang(wib("2026-10-16T13:00:00")) === wib("2026-10-16T13:00:00"));

console.log("Jadwal kirim");
const mulai = wib("2026-10-16T08:00:00");
const j = jadwalKirim({ jumlah: 134, mode: "bertahap", mulaiMs: mulai, jedaDetik: 45, benih: 42 });
cek("jumlah sesuai", j.length === 134);
cek("pertama = mulai", j[0] === mulai);
cek("urut naik, jarak ≥5 dtk", j.every((t, i) => i === 0 || t - j[i - 1]! >= 5000));
const selisih = j.slice(1).map((t, i) => (t - j[i]!) / 1000);
cek("jarak 30..60 dtk (45 ± 15)", selisih.every((d) => d >= 30 && d <= 60), [Math.min(...selisih), Math.max(...selisih)]);
const rata = selisih.reduce((a, b) => a + b, 0) / selisih.length;
cek("rata-rata dekat 45 dtk", Math.abs(rata - 45) < 3, rata);
cek("deterministik untuk benih sama", JSON.stringify(j) === JSON.stringify(jadwalKirim({ jumlah: 134, mode: "bertahap", mulaiMs: mulai, jedaDetik: 45, benih: 42 })));
cek("benih lain = jadwal lain", JSON.stringify(j) !== JSON.stringify(jadwalKirim({ jumlah: 134, mode: "bertahap", mulaiMs: mulai, jedaDetik: 45, benih: 7 })));
const malam = jadwalKirim({ jumlah: 10, mode: "bertahap", mulaiMs: wib("2026-10-16T21:56:00"), jedaDetik: 60, benih: 1 });
cek("tidak ada kiriman di jam tenang", malam.every((t) => !diJamTenang(t)), malam.map((t) => new Date(t).toISOString()));
cek("sisa digeser ke 06.00 besok", malam.some((t) => t >= wib("2026-10-17T06:00:00")));
const ser = jadwalKirim({ jumlah: 5, mode: "serentak", mulaiMs: mulai, jedaDetik: 45, benih: 1 });
cek("serentak semua sama", ser.length === 5 && ser.every((t) => t === mulai));
cek("serentak tidak digeser jam tenang (pilihan master)", jadwalKirim({ jumlah: 1, mode: "serentak", mulaiMs: wib("2026-10-16T23:00:00"), jedaDetik: 45, benih: 1 })[0] === wib("2026-10-16T23:00:00"));
cek("terjadwal di jam tenang digeser", jadwalKirim({ jumlah: 1, mode: "terjadwal", mulaiMs: wib("2026-10-16T23:00:00"), jedaDetik: 45, benih: 1 })[0] === wib("2026-10-17T06:00:00"));
cek("nol akun = kosong", jadwalKirim({ jumlah: 0, mode: "bertahap", mulaiMs: mulai, jedaDetik: 45, benih: 1 }).length === 0);
const r = acak(9);
const nilai = Array.from({ length: 1000 }, () => r());
cek("acak di [0,1)", nilai.every((v) => v >= 0 && v < 1));

console.log("Ulang");
cek("gagal pasti boleh diulang", bolehDiulang({ status: "gagal", pesan: "x", hasil: { galat: "pasti" } }));
cek("gagal ambigu tidak", !bolehDiulang({ status: "gagal", pesan: "timeout", hasil: { galat: "ambigu" } }));
cek("terputus tidak pernah", !bolehDiulang({ status: "gagal", pesan: `${PESAN_TERPUTUS} — periksa`, hasil: { galat: "pasti" } }));
cek("gagal di semua sosmed (data lama) boleh", bolehDiulang({ status: "gagal", pesan: "Gagal di semua sosmed: TikTok", hasil: null }));
cek("galat tak dikenal (data lama) tidak", !bolehDiulang({ status: "gagal", pesan: "socket hang up", hasil: null }));
cek("terkirim tidak", !bolehDiulang({ status: "terkirim", pesan: "", hasil: { galat: "pasti" } }));

console.log("Variasi");
cek("varian berputar (utama ikut)", [0, 1, 2, 3, 4, 5].map((i) => String(pilihVarian(i, 3))).join() === "null,0,1,2,null,0");
cek("1 varian = 2 susunan", [0, 1, 2].map((i) => String(pilihVarian(i, 1))).join() === "null,0,null");
cek("tanpa varian = null", pilihVarian(5, 0) === null);
cek("rapikan: unik, maks 3, buang kosong", JSON.stringify(rapikanVariasi(["a", " a ", "", "b", "c", "d"])) === JSON.stringify(["a", "b", "c"]));
cek("rapikan: bukan larik = []", rapikanVariasi("x").length === 0);
cek("urai JSON berbungkus", uraiVariasi('```json\n{"variasi":["satu","dua"]}\n```').join("|") === "satu|dua");
cek("urai rusak = []", uraiVariasi("tidak ada json").length === 0 && uraiVariasi("{rusak").length === 0);
const asli = "PLN: tarif April–Juni 2026 tidak naik. Cek PLN Mobile. Sumber: ANTARA.";
cek("variasi aman diterima", variasiAman(asli, "Tarif listrik April–Juni 2026 tetap, kata PLN. Cek di PLN Mobile. Sumber: ANTARA."));
cek("variasi yang mengubah angka ditolak", !variasiAman(asli, "Tarif April–Juni 2025 tidak naik. Sumber: ANTARA."));
cek("variasi tanpa sumber ditolak", !variasiAman(asli, "Tarif April–Juni 2026 tidak naik kata PLN."));
cek("variasi terlalu panjang ditolak", !variasiAman(asli, `${asli} ${"x".repeat(200)}`));
cek("singkatan hilang ditolak", !variasiAman(asli, "Perusahaan listrik: tarif April–Juni 2026 tidak naik. Sumber: ANTARA."));
cek("hashtag baru ditolak", !variasiAman(asli, "PLN: tarif April–Juni 2026 tetap. #viral Sumber: ANTARA."));
cek("mention asli wajib tetap", !variasiAman("Kata @tvrakyat tarif 2026 tetap.", "Tarif 2026 tetap, kata TV Rakyat."));
cek("angka sebagai potongan angka lain tidak lolos", !variasiAman("Naik 5 persen.", "Naik 15 persen."));

console.log("Ringkas");
const rk = ringkasItem([{ status: "terkirim" }, { status: "gagal" }, { status: "menunggu" }, { status: "diproses" }, { status: "dibatalkan" }]);
cek("ringkas item", rk.total === 5 && rk.terkirim === 1 && rk.gagal === 1 && rk.menunggu === 2 && rk.dibatalkan === 1, rk);

console.log("Ruang umum");
const dunia: StatusDunia = {
  waktu: 1,
  jumlah: 1,
  terpotong: false,
  online: [
    { id: 1, nama: "A", username: "a", divisi: "", role: "anggota", avatar_url: "", layar: "", layar_label: "", karakter: 0, aktivitas: null },
    { id: 2, nama: "B", username: "b", divisi: "", role: "anggota", avatar_url: "", layar: "", layar_label: "Dipanggil", karakter: 1, aktivitas: null, dipanggil: true },
  ],
};
const umum = duniaUmum(dunia);
cek("yang dipanggil tidak tampil online di ruang umum", umum.online.length === 1 && umum.online[0]!.id === 1 && umum.jumlah === 1, umum);

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
