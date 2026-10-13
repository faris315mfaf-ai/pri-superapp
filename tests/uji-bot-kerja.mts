// Uji logika murni pekerjaan bot (13 Okt 2026): validasi badan runner, pemetaan kode
// gagal, penyaringan kandidat/permintaan, sumber yang perlu dipanen. Tanpa jaringan/DB.
// Jalankan: npx tsx tests/uji-bot-kerja.mts
import {
  GalatLaporan,
  KERJA,
  adaTabrakan,
  hariIniWib,
  kategoriMesin,
  menitWibDari,
  petaKodeGagal,
  pilihKlaimBasi,
  pilihSumberPanen,
  polaCariId,
  saringKandidatMasuk,
  saringPermintaanWajib,
  sumberPerluPanen,
  teksPenghalang,
  validasiPermintaanRunner,
  type BarisVideoWajib,
  type SumberAktif,
} from "@/lib/bot-kerja-murni";
import { BATAS_PROTOKOL, type KandidatMasuk, type KodeGagal } from "@/lib/bot-protokol";
import { KEBIJAKAN } from "@/lib/bot-mesin";

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

const NOW = Date.parse("2026-10-13T05:00:00.000Z"); // 12:00 WIB

console.log("\n[A] Waktu WIB");
cek("05:00 UTC = 12:00 WIB = 720 menit", menitWibDari(NOW) === 720);
cek("tengah malam UTC = 07:00 WIB", menitWibDari(Date.parse("2026-10-13T00:00:00Z")) === 7 * 60);
cek("17:00 UTC = tengah malam WIB (menit 0)", menitWibDari(Date.parse("2026-10-13T17:00:00Z")) === 0);
cek("16:59 UTC = 23:59 WIB", menitWibDari(Date.parse("2026-10-13T16:59:00Z")) === 23 * 60 + 59);
cek("hariIniWib siang", hariIniWib(NOW) === "2026-10-13");
cek("hariIniWib lewat tengah malam WIB (UTC masih kemarin)", hariIniWib(Date.parse("2026-10-13T18:00:00Z")) === "2026-10-14");
cek("hariIniWib sebelum tengah malam WIB", hariIniWib(Date.parse("2026-10-13T16:59:59Z")) === "2026-10-13");
cek("pergantian tahun", hariIniWib(Date.parse("2026-12-31T20:00:00Z")) === "2027-01-01");

console.log("\n[B] Kode gagal → tindakan");
const penghalang: KodeGagal[] = ["template_belum_ada", "kuota_penuh", "antrean_penuh", "stok_penuh"];
const terbakar: KodeGagal[] = ["sumber_ditolak", "job_error", "hilang", "lainnya"];
for (const k of penghalang) {
  const t = petaKodeGagal(k);
  cek(`${k}: penghalang, TIDAK menambah hitungan, klaim dilepas`, t.penghalang && !t.tambahGagalBeruntun && t.lepasKlaim, t);
  cek(`${k}: teks penghalang berbahasa Indonesia & tidak kosong`, teksPenghalang(k).length > 10 && teksPenghalang(k) !== teksPenghalang("lainnya"));
}
for (const k of terbakar) {
  const t = petaKodeGagal(k);
  cek(`${k}: menambah hitungan, klaim DIPERTAHANKAN (video terbakar)`, !t.penghalang && t.tambahGagalBeruntun && !t.lepasKlaim, t);
}
cek("semua 8 kode terpetakan tanpa tumpang tindih", new Set([...penghalang, ...terbakar]).size === 8);
cek("hitungan gagal beruntun yang naik cukup memicu pagar bot-mesin", KEBIJAKAN.MAKS_GAGAL_BERUNTUN >= 1);

console.log("\n[C] validasiPermintaanRunner — aksi dasar");
const sah = (isi: unknown) => validasiPermintaanRunner(isi).ok;
cek("denyut tanpa versi sah", sah({ aksi: "denyut" }));
cek("denyut dengan versi sah, versi dipotong 40", (() => {
  const h = validasiPermintaanRunner({ aksi: "denyut", versi: "v".repeat(100) });
  return h.ok && h.permintaan.aksi === "denyut" && (h.permintaan.versi ?? "").length === 40;
})());
cek("denyut versi bukan teks ditolak", !sah({ aksi: "denyut", versi: 5 }));
cek("bukan objek ditolak (null, larik, teks, angka)", !sah(null) && !sah([]) && !sah("denyut") && !sah(7) && !sah(undefined));
cek("aksi tak dikenal ditolak", !sah({ aksi: "hapus_semua" }) && !sah({}) && !sah({ aksi: 1 }));
cek("ambil_kerja sah", sah({ aksi: "ambil_kerja", bot_id: 3 }));
for (const buruk of [0, -1, 1.5, "3", null, undefined, Number.NaN, Infinity, 2 ** 60, true, [3], {}]) {
  cek(`ambil_kerja bot_id=${JSON.stringify(buruk) ?? "undefined"} ditolak`, !sah({ aksi: "ambil_kerja", bot_id: buruk }));
}
cek("ambil_kerja tanpa bot_id ditolak", !sah({ aksi: "ambil_kerja" }));
cek("lapor tanpa laporan ditolak", !sah({ aksi: "lapor", bot_id: 1 }));
cek("lapor laporan bukan objek ditolak", !sah({ aksi: "lapor", bot_id: 1, laporan: "log" }) && !sah({ aksi: "lapor", bot_id: 1, laporan: null }));
cek("lapor jenis tak dikenal ditolak", !sah({ aksi: "lapor", bot_id: 1, laporan: { jenis: "bom" } }));
cek("lapor bot_id buruk ditolak", !sah({ aksi: "lapor", bot_id: "1", laporan: { jenis: "log", tahap: "cari", teks: "x" } }));
cek("kunci tak dikenal dibuang dari hasil", (() => {
  const h = validasiPermintaanRunner({ aksi: "ambil_kerja", bot_id: 2, penyusup: "x", __proto__: { a: 1 } });
  return h.ok && Object.keys(h.permintaan).sort().join() === "aksi,bot_id";
})());

console.log("\n[D] validasiPermintaanRunner — laporan");
const lapor = (laporan: unknown) => ({ aksi: "lapor", bot_id: 1, laporan });
const kand = (o: Record<string, unknown> = {}) => ({ url: "https://www.instagram.com/reel/ABCDE12345/", judul: "J", caption: "C", durasi_detik: 30, tayangan: 100, waktu_terbit: "2026-10-13T01:00:00Z", ...o });
cek("kandidat kosong sah", sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [] })));
cek("kandidat sah dengan galat", sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand()], galat: "yt-dlp 429" })));
cek("kandidat: nilai null untuk durasi/tayangan/waktu sah", sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand({ durasi_detik: null, tayangan: null, waktu_terbit: null })] })));
cek("kandidat sumber_id buruk ditolak", !sah(lapor({ jenis: "kandidat", sumber_id: 0, kandidat: [] })) && !sah(lapor({ jenis: "kandidat", kandidat: [] })));
cek("kandidat bukan larik ditolak", !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: "x" })) && !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: {} })));
cek(`tepat ${BATAS_PROTOKOL.MAKS_KANDIDAT_PER_LAPORAN} kandidat sah`, sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: Array.from({ length: BATAS_PROTOKOL.MAKS_KANDIDAT_PER_LAPORAN }, () => kand()) })));
cek(`${BATAS_PROTOKOL.MAKS_KANDIDAT_PER_LAPORAN + 1} kandidat ditolak`, !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: Array.from({ length: BATAS_PROTOKOL.MAKS_KANDIDAT_PER_LAPORAN + 1 }, () => kand()) })));
cek("kandidat tanpa url ditolak", !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand({ url: "" })] })) && !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand({ url: 5 })] })));
cek("kandidat url > 2048 ditolak", !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand({ url: "https://x.com/" + "a".repeat(2100) })] })));
cek("kandidat judul/caption bukan teks ditolak", !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand({ judul: null })] })) && !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand({ caption: 1 })] })));
cek("kandidat durasi negatif/NaN/teks ditolak", !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand({ durasi_detik: -1 })] })) && !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand({ durasi_detik: "30" })] })));
cek("kandidat tayangan negatif ditolak", !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand({ tayangan: -3 })] })));
cek("kandidat waktu_terbit bukan teks ditolak", !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [kand({ waktu_terbit: 1760000000 })] })));
cek("kandidat berisi elemen bukan objek ditolak", !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [null] })) && !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: ["https://x"] })));
cek("kandidat galat bukan teks ditolak", !sah(lapor({ jenis: "kandidat", sumber_id: 4, kandidat: [], galat: 5 })));

cek("job_dibuat sah", sah(lapor({ jenis: "job_dibuat", tugas_id: 9, id_job_mesin: "job-123", hook: "hook-abc" })));
cek("job_dibuat tanpa hook/id_job ditolak", !sah(lapor({ jenis: "job_dibuat", tugas_id: 9, id_job_mesin: "j" })) && !sah(lapor({ jenis: "job_dibuat", tugas_id: 9, hook: "h" })));
cek("job_dibuat id kosong ditolak", !sah(lapor({ jenis: "job_dibuat", tugas_id: 9, id_job_mesin: "", hook: "h" })));
cek("job_dibuat id_job > 200 ditolak", !sah(lapor({ jenis: "job_dibuat", tugas_id: 9, id_job_mesin: "j".repeat(201), hook: "h" })));
cek("job_dibuat tugas_id buruk ditolak", !sah(lapor({ jenis: "job_dibuat", tugas_id: "9", id_job_mesin: "j", hook: "h" })) && !sah(lapor({ jenis: "job_dibuat", tugas_id: -9, id_job_mesin: "j", hook: "h" })));

cek("job_selesai sah (angka)", sah(lapor({ jenis: "job_selesai", tugas_id: 9, id_stok_mesin: "stok-1", durasi_detik: 30.5, ukuran_byte: 1234 })));
cek("job_selesai sah (null)", sah(lapor({ jenis: "job_selesai", tugas_id: 9, id_stok_mesin: "stok-1", durasi_detik: null, ukuran_byte: null })));
cek("job_selesai tanpa durasi/ukuran ditolak (kontrak: wajib ada, boleh null)", !sah(lapor({ jenis: "job_selesai", tugas_id: 9, id_stok_mesin: "stok-1" })));
cek("job_selesai id_stok kosong/buruk ditolak", !sah(lapor({ jenis: "job_selesai", tugas_id: 9, id_stok_mesin: "", durasi_detik: null, ukuran_byte: null })) && !sah(lapor({ jenis: "job_selesai", tugas_id: 9, id_stok_mesin: 5, durasi_detik: null, ukuran_byte: null })));
cek("job_selesai ukuran negatif ditolak", !sah(lapor({ jenis: "job_selesai", tugas_id: 9, id_stok_mesin: "s", durasi_detik: null, ukuran_byte: -1 })));

for (const k of [...penghalang, ...terbakar]) {
  cek(`job_gagal kode ${k} sah`, sah(lapor({ jenis: "job_gagal", tugas_id: 9, kode: k, pesan: "alasan" })));
}
cek("job_gagal kode tak dikenal ditolak", !sah(lapor({ jenis: "job_gagal", tugas_id: 9, kode: "meledak", pesan: "x" })) && !sah(lapor({ jenis: "job_gagal", tugas_id: 9, pesan: "x" })));
cek("job_gagal pesan bukan teks ditolak, kosong sah", !sah(lapor({ jenis: "job_gagal", tugas_id: 9, kode: "lainnya", pesan: 1 })) && sah(lapor({ jenis: "job_gagal", tugas_id: 9, kode: "lainnya", pesan: "" })));
cek("job_gagal pesan dipotong 1000", (() => {
  const h = validasiPermintaanRunner(lapor({ jenis: "job_gagal", tugas_id: 9, kode: "lainnya", pesan: "p".repeat(3000) }));
  return h.ok && h.permintaan.aksi === "lapor" && h.permintaan.laporan.jenis === "job_gagal" && h.permintaan.laporan.pesan.length === 1000;
})());
cek("job_gagal pesan > 4000 ditolak", !sah(lapor({ jenis: "job_gagal", tugas_id: 9, kode: "lainnya", pesan: "p".repeat(4001) })));

const HASH = "0123456789abcdef";
const sidikOk = Array.from({ length: 8 }, () => HASH);
cek("sidik ok sah", sah(lapor({ jenis: "sidik", kandidat_id: 3, status: "ok", sidik: sidikOk })));
cek("sidik tak_informatif sah", sah(lapor({ jenis: "sidik", kandidat_id: 3, status: "tak_informatif", sidik: sidikOk })));
cek("sidik gagal sah tanpa sidik, dengan galat", sah(lapor({ jenis: "sidik", kandidat_id: 3, status: "gagal", sidik: null, galat: "dibatasi" })));
cek("sidik ok TANPA sidik ditolak", !sah(lapor({ jenis: "sidik", kandidat_id: 3, status: "ok", sidik: null })) && !sah(lapor({ jenis: "sidik", kandidat_id: 3, status: "ok" })));
cek("sidik terlalu pendek / hash buruk / terlalu banyak ditolak", !sah(lapor({ jenis: "sidik", kandidat_id: 3, status: "ok", sidik: sidikOk.slice(0, 5) })) && !sah(lapor({ jenis: "sidik", kandidat_id: 3, status: "ok", sidik: [...sidikOk, "zz"] })) && !sah(lapor({ jenis: "sidik", kandidat_id: 3, status: "ok", sidik: Array.from({ length: 30 }, () => HASH) })));
cek("sidik status asing / kandidat_id buruk / galat bukan teks ditolak", !sah(lapor({ jenis: "sidik", kandidat_id: 3, status: "menunggu", sidik: sidikOk })) && !sah(lapor({ jenis: "sidik", kandidat_id: "3", status: "ok", sidik: sidikOk })) && !sah(lapor({ jenis: "sidik", kandidat_id: 3, status: "gagal", sidik: null, galat: 5 })));
cek("sidik galat dipotong 500", (() => { const h = validasiPermintaanRunner(lapor({ jenis: "sidik", kandidat_id: 3, status: "gagal", sidik: null, galat: "g".repeat(900) })); return h.ok && h.permintaan.aksi === "lapor" && h.permintaan.laporan.jenis === "sidik" && (h.permintaan.laporan.galat ?? "").length === 500; })());

for (const t of ["cari", "edit", "posting", "istirahat"]) cek(`log tahap ${t} sah`, sah(lapor({ jenis: "log", tahap: t, teks: "halo" })));
cek("log tahap tak dikenal (mis. 'gagal','unduh') ditolak", !sah(lapor({ jenis: "log", tahap: "gagal", teks: "x" })) && !sah(lapor({ jenis: "log", tahap: "unduh", teks: "x" })));
cek("log teks kosong/spasi/bukan teks ditolak", !sah(lapor({ jenis: "log", tahap: "cari", teks: "" })) && !sah(lapor({ jenis: "log", tahap: "cari", teks: "   " })) && !sah(lapor({ jenis: "log", tahap: "cari", teks: 1 })));
cek("log teks dipotong 1000, > 4000 ditolak", (() => {
  const h = validasiPermintaanRunner(lapor({ jenis: "log", tahap: "cari", teks: "z".repeat(2000) }));
  return h.ok && h.permintaan.aksi === "lapor" && h.permintaan.laporan.jenis === "log" && h.permintaan.laporan.teks.length === 1000 && !sah(lapor({ jenis: "log", tahap: "cari", teks: "z".repeat(4001) }));
})());
cek("hasil validasi laporan bot_id tersalin", (() => {
  const h = validasiPermintaanRunner({ aksi: "lapor", bot_id: 7, laporan: { jenis: "log", tahap: "cari", teks: "a" } });
  return h.ok && h.permintaan.aksi === "lapor" && h.permintaan.bot_id === 7;
})());
cek("pesan galat validasi tidak membocorkan masukan", (() => {
  const h = validasiPermintaanRunner({ aksi: "ambil_kerja", bot_id: "RAHASIA-XYZ" });
  return !h.ok && !h.pesan.includes("RAHASIA");
})());

console.log("\n[E] saringKandidatMasuk");
const km = (url: string, o: Partial<KandidatMasuk> = {}): KandidatMasuk => ({ url, judul: " Judul ", caption: " Caption ", durasi_detik: 30.6, tayangan: 1234.9, waktu_terbit: "2026-10-13T01:00:00Z", ...o });
{
  const { baris, dibuang } = saringKandidatMasuk(
    [
      km("https://www.instagram.com/reel/ABCDE12345/?igsh=track"),
      km("https://instagram.com/p/ABCDE12345/"), // sama (reel vs p) → duplikat
      km("https://vm.tiktok.com/ZSabc/"), // URL pendek → dibuang
      km("https://example.com/video/1"), // platform tak dikenal → dibuang
      km("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { waktu_terbit: "bukan tanggal", durasi_detik: null, tayangan: null }),
      km("not a url"),
    ],
    4,
  );
  cek("hanya 2 baris layak dari 6 masukan", baris.length === 2 && dibuang === 4, { n: baris.length, dibuang });
  cek("kunci kanonik terbentuk (instagram:…, youtube:…)", baris[0].kunci_kanonik === "instagram:ABCDE12345" && baris[1].kunci_kanonik === "youtube:dQw4w9WgXcQ");
  cek("duplikat dalam satu laporan dibuang", baris.filter((b) => b.kunci_kanonik === "instagram:ABCDE12345").length === 1);
  cek("sumber_id disematkan", baris.every((b) => b.sumber_id === 4));
  cek("teks dipangkas, durasi dibulatkan, tayangan dilantai", baris[0].judul === "Judul" && baris[0].caption === "Caption" && baris[0].durasi_detik === 31 && baris[0].tayangan === 1234);
  cek("waktu_terbit valid dinormalkan ke ISO; rusak → null", baris[0].waktu_terbit === "2026-10-13T01:00:00.000Z" && baris[1].waktu_terbit === null);
  cek("durasi/tayangan null dipertahankan", baris[1].durasi_detik === null && baris[1].tayangan === null);
}
{
  const { baris } = saringKandidatMasuk([km("https://www.instagram.com/reel/ABCDE12345/", { judul: "j".repeat(2000), caption: "c".repeat(9000) })], 1);
  cek("judul dipotong 500, caption 5000", baris[0].judul.length === 500 && baris[0].caption.length === 5000);
}
cek("masukan kosong → kosong", saringKandidatMasuk([], 1).baris.length === 0);

console.log("\n[F] Panen");
const jamLalu = (m: number) => new Date(NOW - m * 60_000).toISOString();
cek("null → perlu panen", sumberPerluPanen(null, NOW));
cek("tanggal rusak → perlu panen", sumberPerluPanen("kemarin", NOW));
cek("baru 5 menit lalu → tidak", !sumberPerluPanen(jamLalu(5), NOW));
cek("tepat 30 menit → belum (harus LEBIH tua)", !sumberPerluPanen(jamLalu(KERJA.PANEN_ULANG_MENIT), NOW));
cek("31 menit → perlu panen", sumberPerluPanen(jamLalu(KERJA.PANEN_ULANG_MENIT + 1), NOW));
{
  const s = (id: number, t: string | null): SumberAktif => ({ id, platform: "Instagram", handle: `akun${id}`, terakhir_ambil: t });
  const p = pilihSumberPanen([s(1, jamLalu(120)), s(2, null), s(3, jamLalu(5)), s(4, jamLalu(600)), s(5, null)], NOW);
  cek("sumber segar tidak ikut; yang belum pernah dulu, lalu paling lama", p.map((x) => x.id).join() === "2,5,4,1", p);
  cek("bentuk SumberPanen {id, platform, handle}", Object.keys(p[0]).sort().join() === "handle,id,platform");
  const banyak = Array.from({ length: 25 }, (_, i) => s(i + 1, null));
  cek(`dibatasi MAKS_SUMBER_PER_PANEN (${BATAS_PROTOKOL.MAKS_SUMBER_PER_PANEN})`, pilihSumberPanen(banyak, NOW).length === BATAS_PROTOKOL.MAKS_SUMBER_PER_PANEN);
  cek("semua segar → daftar kosong (tidak panen)", pilihSumberPanen([s(1, jamLalu(1)), s(2, jamLalu(10))], NOW).length === 0);
  cek("tanpa sumber → kosong", pilihSumberPanen([], NOW).length === 0);
  cek("urutan masukan tidak berpengaruh", pilihSumberPanen([s(5, null), s(2, null)], NOW).map((x) => x.id).join() === "2,5");
}

console.log("\n[G] Tabrakan lintas sistem");
cek("polaCariId mengapit % dan meng-escape _", polaCariId("AB_cd-12") === "%AB\\_cd-12%");
cek("polaCariId meng-escape % dan \\", polaCariId("a%b\\c") === "%a\\%b\\\\c%");
cek("tabrakan: URL berbeda bentuk, id sama", adaTabrakan(["https://www.instagram.com/p/ABCDE12345/"], "instagram:ABCDE12345"));
cek("tabrakan: parameter pelacak diabaikan", adaTabrakan(["https://instagram.com/reel/ABCDE12345/?igsh=zzz"], "instagram:ABCDE12345"));
cek("bukan tabrakan: id hanya muncul sebagai potongan teks lain", !adaTabrakan(["https://example.com/ABCDE12345"], "instagram:ABCDE12345"));
cek("bukan tabrakan: id lain", !adaTabrakan(["https://www.instagram.com/reel/ZZZZZ99999/"], "instagram:ABCDE12345"));
cek("bukan tabrakan: platform lain dengan id sama", !adaTabrakan(["https://www.youtube.com/watch?v=ABCDE12345x"], "instagram:ABCDE12345"));
cek("null/kosong/rusak diabaikan", !adaTabrakan([null, undefined, "", "bukan url"], "instagram:ABCDE12345"));
cek("salah satu dari banyak cocok", adaTabrakan(["https://a.com/x", "https://www.tiktok.com/@u/video/7123456789012345678"], "tiktok:7123456789012345678"));
cek("daftar kosong → bersih", !adaTabrakan([], "instagram:ABCDE12345"));

console.log("\n[H] Video Wajib");
const bw = (o: Partial<BarisVideoWajib> = {}): BarisVideoWajib => ({
  id: 1,
  judul: "Banjir Jakarta",
  keterangan: "Liput segera",
  link_doksli: "https://www.instagram.com/reel/ABCDE12345/",
  kategori: "news",
  batas_waktu: null,
  dibuat_pada: "2026-10-13T00:00:00Z",
  sumber_video: "Doksli DPP",
  ...o,
});
const HARI = "2026-10-13";
{
  const r = saringPermintaanWajib([bw()], new Set(), HARI);
  cek("permintaan sah lolos dengan kunci & naskah", r.length === 1 && r[0].kunci === "instagram:ABCDE12345" && r[0].naskah === "Banjir Jakarta. Liput segera");
  cek("kategori dinormalkan huruf besar", r[0].kategori === "NEWS");
  cek("sumber_video terbawa", r[0].sumber_video === "Doksli DPP");
}
cek("sudah diambil bot lain → dilewati", saringPermintaanWajib([bw({ id: 5 })], new Set([5]), HARI).length === 0);
cek("batas_waktu kemarin → dilewati", saringPermintaanWajib([bw({ batas_waktu: "2026-10-12" })], new Set(), HARI).length === 0);
cek("batas_waktu hari ini → masih boleh (>= hari ini)", saringPermintaanWajib([bw({ batas_waktu: "2026-10-13" })], new Set(), HARI).length === 1);
cek("batas_waktu esok → boleh", saringPermintaanWajib([bw({ batas_waktu: "2026-10-14" })], new Set(), HARI).length === 1);
cek("batas_waktu berformat timestamp tetap dibaca", saringPermintaanWajib([bw({ batas_waktu: "2026-10-12T00:00:00+00:00" })], new Set(), HARI).length === 0);
cek("link_doksli kosong → dilewati", saringPermintaanWajib([bw({ link_doksli: "" }), bw({ id: 2, link_doksli: null })], new Set(), HARI).length === 0);
cek("link Google Drive (tak lolos kunciKanonik) → dilewati", saringPermintaanWajib([bw({ link_doksli: "https://drive.google.com/file/d/abc/view" })], new Set(), HARI).length === 0);
cek("URL pendek → dilewati", saringPermintaanWajib([bw({ link_doksli: "https://vm.tiktok.com/ZSabc/" })], new Set(), HARI).length === 0);
cek("judul & keterangan kosong → dilewati (naskah wajib)", saringPermintaanWajib([bw({ judul: "", keterangan: "" })], new Set(), HARI).length === 0);
cek("hanya keterangan terisi → lolos", saringPermintaanWajib([bw({ judul: "", keterangan: "Isi saja" })], new Set(), HARI).length === 1);
cek("kategori kosong → NEWS", saringPermintaanWajib([bw({ kategori: null })], new Set(), HARI)[0].kategori === "NEWS");
{
  const r = saringPermintaanWajib(
    [
      bw({ id: 1, batas_waktu: null, dibuat_pada: "2026-10-01T00:00:00Z", link_doksli: "https://www.instagram.com/reel/AAAAA00001/" }),
      bw({ id: 2, batas_waktu: "2026-10-20", dibuat_pada: "2026-10-05T00:00:00Z", link_doksli: "https://www.instagram.com/reel/AAAAA00002/" }),
      bw({ id: 3, batas_waktu: "2026-10-14", dibuat_pada: "2026-10-09T00:00:00Z", link_doksli: "https://www.instagram.com/reel/AAAAA00003/" }),
      bw({ id: 4, batas_waktu: "2026-10-14", dibuat_pada: "2026-10-02T00:00:00Z", link_doksli: "https://www.instagram.com/reel/AAAAA00004/" }),
      bw({ id: 5, batas_waktu: "2026-10-14", dibuat_pada: "2026-10-02T00:00:00Z", link_doksli: "https://www.instagram.com/reel/AAAAA00005/" }),
    ],
    new Set(),
    HARI,
  );
  cek("urut: batas_waktu naik (kosong terakhir), lalu dibuat_pada naik, lalu id naik", r.map((x) => x.id).join() === "4,5,3,2,1", r.map((x) => x.id));
}
cek("tidak mengubah masukan", (() => {
  const m = [bw({ id: 2 }), bw({ id: 1 })];
  const salinan = JSON.stringify(m);
  saringPermintaanWajib(m, new Set(), HARI);
  return JSON.stringify(m) === salinan;
})());
cek("kategoriMesin: rapikan spasi + huruf besar + potong 30", kategoriMesin("  show   biz ") === "SHOW BIZ" && kategoriMesin("x".repeat(80)).length === 30);
cek("kategoriMesin: kosong/null/spasi → NEWS", kategoriMesin("") === "NEWS" && kategoriMesin(null) === "NEWS" && kategoriMesin("   ") === "NEWS");

console.log("\n[I] Klaim basi");
{
  const lama = jamLalu(KEBIJAKAN.KLAIM_BASI_MENIT + 5);
  const baru = jamLalu(5);
  const klaim = [
    { id: 1, diklaim_pada: lama },
    { id: 2, diklaim_pada: baru },
    { id: 3, diklaim_pada: lama }, // sudah punya tugas → tidak boleh dilepas
    { id: 4, diklaim_pada: null }, // tanpa waktu → basi
    { id: 5, diklaim_pada: "rusak" },
  ];
  const lepas = pilihKlaimBasi(klaim, new Set([3]), NOW);
  cek("hanya klaim basi TANPA tugas yang dilepas", lepas.join() === "1,4,5", lepas);
  cek("klaim segar tidak dilepas", !lepas.includes(2));
  cek("klaim yang sudah jadi tugas tidak pernah dilepas (terbakar/aktif)", !lepas.includes(3));
  cek("tidak ada klaim → kosong", pilihKlaimBasi([], new Set(), NOW).length === 0);
}

console.log("\n[J] GalatLaporan");
{
  const g = new GalatLaporan("Tugas tidak ditemukan.", 404);
  cek("membawa status dan pesan, turunan Error", g instanceof Error && g.status === 404 && g.message === "Tugas tidak ditemukan.");
}
cek("konstanta KERJA masuk akal (kunci 90 dtk, 5 percobaan)", KERJA.KUNCI_DETIK === 90 && KERJA.MAKS_PERCOBAAN_PILIH === 5 && KERJA.PANEN_ULANG_MENIT === 30);

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
