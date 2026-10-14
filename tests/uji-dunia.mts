// Uji dunia penghuni Ruang Bot (14 Okt 2026): klasifikasi aksi, umur animasi, karakter unik,
// jalur sayap (aula/database/alat/pos), dan simulasi pengguna online. Murni — tanpa jaringan/DOM.
// Jalankan: npx tsx tests/uji-dunia.mts
import {
  EKOR_ANIMASI_MS,
  MAKS_AKTIVITAS_PER_PENGGUNA,
  UKURAN_KOLAM_KARAKTER,
  SEWA_KLIEN_MS,
  UMUR_MAKS_BERJALAN_MS,
  aktivitasMasihHidup,
  animasiDariJenis,
  ekstrakInfo,
  karakterDariId,
  layarSah,
  pilihAktivitas,
  rapikanAktivitas,
  tetapkanKarakter,
  type AktivitasDunia,
  type PenghuniDunia,
} from "@/lib/dunia-murni";
import {
  PINTU_MASUK,
  PINTU_SAYAP,
  SLOT_AULA,
  STASIUN_PENGHUNI,
  jalanKeluarPenghuni,
  jalanMasukPenghuni,
  jalurTerlarang,
  segmenMenembus,
  titikDiSekat,
  zonaDari,
  type Titik,
} from "@/features/ruang-bot/denah";
import { JUMLAH_KARAKTER, WAJAH, WARNA_KAUS, rupaKarakter } from "@/features/ruang-bot/karakter-pengguna";
import { SimulasiPenghuni, jamWibDetik, stasiunUntuk, teksAktivitas, waktuTag } from "@/features/ruang-bot/simulasi-penghuni";
import { potongSekat } from "@/features/ruang-bot/dunia-gambar";

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

const T0 = Date.parse("2026-10-14T03:00:00Z"); // 10:00 WIB

const akt = (o: Partial<AktivitasDunia> = {}): AktivitasDunia => ({
  id: "abc123abc123",
  jenis: "stok_tambah",
  anim: "rak",
  label: "Tambah ke Stok",
  ringkasan: "Menambah video ke Stok",
  judul: "",
  akun: "",
  platform: "",
  mulai: T0,
  berjalan: true,
  akhir: null,
  ...o,
});

// ============================================================
console.log("\n[A] Klasifikasi aksi");
cek("stok_tambah/stok_hapus/stok_tim/upload_video -> rak", ["stok_tambah", "stok_hapus", "stok_tim", "upload_video"].every((j) => animasiDariJenis(j) === "rak"));
cek("edit_otomatis/auto_edit/hapus_latar/template -> autoedit", ["edit_otomatis", "auto_edit", "hapus_latar", "template"].every((j) => animasiDariJenis(j) === "autoedit"));
cek("kompres -> kompres, blur_watermark -> blur", animasiDariJenis("kompres") === "kompres" && animasiDariJenis("blur_watermark") === "blur");
cek("unggah_sosmed/unggah_official/siaran/tv_riwayat -> kotak_post", ["unggah_sosmed", "unggah_official", "siaran", "tv_riwayat"].every((j) => animasiDariJenis(j) === "kotak_post"));
cek("login, kendali, bot_* tidak ditampilkan", ["login", "daftar", "kendali", "bot_jeda", "bot_otak", "profil_tertaut", "tv_official_up", "ngawur"].every((j) => animasiDariJenis(j) === null));
cek("stasiunUntuk: layar -> tetap di aula, lainnya -> stasiun sama", stasiunUntuk("layar") === null && stasiunUntuk("rak") === "rak" && stasiunUntuk("kotak_post") === "kotak_post");

console.log("\n[B] Umur animasi");
cek("berjalan: hidup sampai batas atas", aktivitasMasihHidup(akt(), T0 + 60_000) && aktivitasMasihHidup(akt(), T0 + UMUR_MAKS_BERJALAN_MS));
cek("berjalan terlalu lama tanpa kabar selesai -> dianggap usai", !aktivitasMasihHidup(akt(), T0 + UMUR_MAKS_BERJALAN_MS + 1000));
cek("selesai: berekor sesuai jenis", aktivitasMasihHidup(akt({ berjalan: false, akhir: T0 }), T0 + EKOR_ANIMASI_MS.rak) && !aktivitasMasihHidup(akt({ berjalan: false, akhir: T0 }), T0 + EKOR_ANIMASI_MS.rak + 1));
cek("aksi peramban bersewa: hidup selama ada denyut", aktivitasMasihHidup(akt({ diperbarui: T0 }), T0 + SEWA_KLIEN_MS) && aktivitasMasihHidup(akt({ diperbarui: T0 + 100_000 }), T0 + 100_000 + SEWA_KLIEN_MS));
cek("aksi peramban tanpa denyut (tab ditutup) dianggap usai setelah sewa habis", !aktivitasMasihHidup(akt({ diperbarui: T0 }), T0 + SEWA_KLIEN_MS + 1));
cek("aksi server (tanpa sewa) tidak terpengaruh", aktivitasMasihHidup(akt(), T0 + SEWA_KLIEN_MS + 60_000));
cek("ekor kotak post lebih panjang dari rak", EKOR_ANIMASI_MS.kotak_post > EKOR_ANIMASI_MS.rak);
cek("selesai tanpa waktu akhir -> usai", !aktivitasMasihHidup(akt({ berjalan: false, akhir: null }), T0));
cek("dari masa depan jauh -> bukan aktivitas", !aktivitasMasihHidup(akt({ mulai: T0 + 3600_000 }), T0));
const daftar = [
  akt({ id: "a", berjalan: false, akhir: T0 - 1000, mulai: T0 - 5000 }),
  akt({ id: "b", mulai: T0 - 20_000 }),
  akt({ id: "c", mulai: T0 - 3000 }),
  akt({ id: "d", berjalan: false, akhir: T0 - 100_000, mulai: T0 - 110_000 }),
];
cek("pilihAktivitas: yang berjalan terbaru menang atas yang berekor", pilihAktivitas(daftar, T0)?.id === "c");
cek("pilihAktivitas: hanya yang berekor -> yang terbaru", pilihAktivitas([daftar[0]], T0)?.id === "a");
cek("pilihAktivitas: kosong/usang -> null", pilihAktivitas([], T0) === null && pilihAktivitas([daftar[3]], T0) === null);
const banyak = Array.from({ length: 9 }, (_, i) => akt({ id: `x${i}`, mulai: T0 - i * 1000 }));
cek("rapikanAktivitas: dibatasi dan membuang yang usang", rapikanAktivitas([...banyak, daftar[3]], T0).length === MAKS_AKTIVITAS_PER_PENGGUNA);

console.log("\n[C] Ekstrak info dari audit");
const e1 = ekstrakInfo('Mengunggah "Banjir Pantura"', { platforms: ["instagram", "tiktok"], tulisan: "tidak dipakai" });
cek("judul dari detail (tulisan) diutamakan atas kutipan", e1.judul === "tidak dipakai", e1.judul);
cek("judul dari kutipan ringkasan bila detail kosong", ekstrakInfo('Mengunggah "Banjir Pantura"', {}).judul === "Banjir Pantura");
cek("detail.judul diutamakan", ekstrakInfo("x", { judul: "Judul Detail" }).judul === "Judul Detail");
cek("platforms array digabung", ekstrakInfo("x", { platforms: ["instagram", "tiktok"] }).platform === "instagram, tiktok");
cek("akun dari detail.akun", ekstrakInfo("x", { akun: "TV Rakyat Official" }).akun === "TV Rakyat Official");
cek("karakter kontrol dibuang & dipotong", ekstrakInfo("x", { judul: "a\u0000b\n\nc".padEnd(500, "z") }).judul.length <= 160 && !/[\u0000\n]/.test(ekstrakInfo("x", { judul: "a\u0000b\nc" }).judul));
cek("tanpa detail -> kosong", JSON.stringify(ekstrakInfo("tanpa kutip", undefined)) === JSON.stringify({ judul: "", akun: "", platform: "" }));
cek("layarSah: kunci wajar lolos, aneh ditolak", layarSah("tvrku") === "tvrku" && layarSah("Chat ") === "chat" && layarSah("<x>") === "" && layarSah(null) === "");

console.log("\n[D] Karakter: kolam >100 rupa, tidak ada yang kembar");
cek("kolam 288 (>100) dan sinkron server-klien", UKURAN_KOLAM_KARAKTER === 288 && JUMLAH_KARAKTER === UKURAN_KOLAM_KARAKTER && WARNA_KAUS.length * WAJAH.length === 288);
const kunciRupa = new Set<string>();
for (let i = 0; i < JUMLAH_KARAKTER; i++) {
  const r = rupaKarakter(i);
  kunciRupa.add(JSON.stringify([r.kaus, r.kulit, r.rambut, r.gayaRambut, r.celana, r.kacamata ?? false, r.berhud ?? false, r.warnaTopi ?? ""]));
}
cek("288 nomor menghasilkan 288 rupa berbeda", kunciRupa.size === 288, kunciRupa.size);
cek("nomor di luar kolam dibungkus, tidak melempar", rupaKarakter(-1).kaus === rupaKarakter(287).kaus && rupaKarakter(288).kaus === rupaKarakter(0).kaus);
const semua = new Set<number>();
for (let id = 1; id <= UKURAN_KOLAM_KARAKTER; id++) semua.add(karakterDariId(id));
cek("id 1..288 -> 288 nomor berbeda (permutasi)", semua.size === UKURAN_KOLAM_KARAKTER);
cek("karakterDariId tetap untuk id yang sama", karakterDariId(42) === karakterDariId(42));
const bentrok = tetapkanKarakter([5, 5 + UKURAN_KOLAM_KARAKTER, 5 + 2 * UKURAN_KOLAM_KARAKTER]);
cek("bentrokan id (selisih kelipatan kolam) diselesaikan: semua berbeda", new Set(bentrok.values()).size === 3, [...bentrok]);
cek("id terkecil mendapat pilihan pertamanya", bentrok.get(5) === karakterDariId(5));
const acak = Array.from({ length: 200 }, (_, i) => 1000 + i * 7);
cek("200 pengguna online: tidak ada yang kembar", new Set(tetapkanKarakter(acak).values()).size === 200);
cek("urutan masukan tidak mengubah hasil", JSON.stringify([...tetapkanKarakter([9, 3, 7])].sort()) === JSON.stringify([...tetapkanKarakter([7, 9, 3])].sort()));

// ============================================================
console.log("\n[E] Sayap penghuni: jalur & geometri");
cek("zonaDari sayap", zonaDari(20, 3) === "aula" && zonaDari(17, 10) === "database" && zonaDari(22, 10) === "alat" && zonaDari(26, 10) === "pos");
cek("zona gedung bot tidak berubah", zonaDari(3, 3) === "kerja" && zonaDari(13, 3) === "meeting" && zonaDari(3, 13) === "koordinator" && zonaDari(13, 13) === "tidur");
cek("pintu depan di aula & tidak di dalam sekat", zonaDari(PINTU_MASUK[0], PINTU_MASUK[1]) === "aula" && !titikDiSekat(PINTU_MASUK));
cek("slot aula banyak (>= 40), semuanya di aula, bukan di sekat", SLOT_AULA.length >= 40 && SLOT_AULA.every((s) => zonaDari(s[0], s[1]) === "aula" && !titikDiSekat(s)), SLOT_AULA.length);
cek("slot aula tidak menumpuk", new Set(SLOT_AULA.map((s) => s.join(","))).size === SLOT_AULA.length);
cek("sekat memisahkan aula dan ruang (garis y=6 di luar pintu ditolak)", segmenMenembus([17, 5], [17, 7]) && segmenMenembus([20, 5], [20, 7]));
cek("lewat pintu database/alat/pos lolos", !segmenMenembus([PINTU_SAYAP.database, 5], [PINTU_SAYAP.database, 7]) && !segmenMenembus([PINTU_SAYAP.alat, 5], [PINTU_SAYAP.alat, 7]) && !segmenMenembus([PINTU_SAYAP.pos, 5], [PINTU_SAYAP.pos, 7]));
cek("gedung bot dan sayap dipisah sekat (x=16)", segmenMenembus([15, 3], [17, 3]));
cek("sekat antar-ruang sayap (x=20, x=24) menolak", segmenMenembus([19, 10], [21, 10]) && segmenMenembus([23, 10], [25, 10]));
for (const [jenis, daftarS] of Object.entries(STASIUN_PENGHUNI)) {
  daftarS.forEach((s, i) => {
    cek(`stasiun ${jenis}#${i} ada di ruang yang benar`, zonaDari(s.titik[0], s.titik[1]) === (jenis === "rak" ? "database" : jenis === "kotak_post" ? "pos" : "alat"));
    for (const slot of [SLOT_AULA[0], SLOT_AULA[SLOT_AULA.length - 1], SLOT_AULA[17]]) {
      const masuk = jalanMasukPenghuni(s);
      cek(`  masuk ${jenis}#${i} dari slot ${slot.join(",")} sah`, !jalurTerlarang(slot, masuk));
      cek(`  keluar ${jenis}#${i} ke slot ${slot.join(",")} sah`, !jalurTerlarang(s.titik, [...jalanKeluarPenghuni(s), slot]));
    }
  });
}
cek("pintu depan -> slot mana pun sah", SLOT_AULA.every((s) => !jalurTerlarang(PINTU_MASUK, [s])));
cek("pindah stasiun (keluar lalu masuk) sah untuk semua pasangan jenis", (() => {
  const semuaS = Object.values(STASIUN_PENGHUNI).flat();
  return semuaS.every((a) => semuaS.every((b) => !jalurTerlarang(a.titik, [...jalanKeluarPenghuni(a), ...jalanMasukPenghuni(b)])));
})());
cek("potongSekat: panjang <= 1 grid & utuh untuk sekat sayap", (() => {
  const sekatSayap = [{ x: 19.94, y: 6, w: 0.12, d: 10, buram: false }, { x: 18.7, y: 5.94, w: 2.6, d: 0.12, buram: false }];
  return sekatSayap.every((s) => {
    const p = potongSekat(s);
    const total = p.reduce((a, q) => a + (s.w < s.d ? q.d : q.w), 0);
    return Math.abs(total - (s.w < s.d ? s.d : s.w)) < 1e-9 && p.every((q) => (s.w < s.d ? q.d : q.w) <= 1 + 1e-9);
  });
})());

// ============================================================
console.log("\n[F] Simulasi penghuni");

const orang = (id: number, a: AktivitasDunia | null = null, o: Partial<PenghuniDunia> = {}): PenghuniDunia => ({
  id,
  nama: `Orang ${id}`,
  username: `user${id}`,
  divisi: "Divisi TV",
  role: "anggota",
  avatar_url: "",
  layar: "tvrku",
  layar_label: "TVR Saya",
  karakter: karakterDariId(id),
  aktivitas: a,
  ...o,
});

type Jejak = { menembus: number; terakhir: Map<number, Titik> };
let jamServer = T0;
function jalankan(sim: SimulasiPenghuni, detik: number, j: Jejak, langkah = 0.05, tiap?: (t: number) => void): void {
  const n = Math.round(detik / langkah);
  for (let i = 0; i < n; i++) {
    jamServer += langkah * 1000;
    sim.maju(langkah);
    for (const p of sim.penghuni) {
      const lama = j.terakhir.get(p.id);
      if (lama && segmenMenembus(lama, [p.x, p.y])) j.menembus++;
      j.terakhir.set(p.id, [p.x, p.y]);
    }
    tiap?.(i * langkah);
  }
}
const baru = (): { sim: SimulasiPenghuni; j: Jejak } => {
  jamServer = T0;
  return { sim: new SimulasiPenghuni({ sekarangMs: () => jamServer }), j: { menembus: 0, terakhir: new Map() } };
};
const cari = (sim: SimulasiPenghuni, id: number) => sim.penghuni.find((p) => p.id === id);

{
  const { sim, j } = baru();
  sim.setDaftar([orang(1), orang(2), orang(3)], T0, T0);
  cek("muncul di pintu depan, belum terlihat (pudar)", sim.penghuni.length === 3 && sim.penghuni.every((p) => p.alfa === 0 && p.keadaan === "masuk"));
  jalankan(sim, 15, j);
  cek("semuanya sampai di slot aula dan diam", sim.penghuni.every((p) => p.keadaan === "diam" && p.alfa === 1));
  cek("tiap orang punya slot sendiri", new Set(sim.penghuni.map((p) => p.slot)).size === 3);
  cek("rupa karakter sesuai nomor dari server", cari(sim, 2)?.rupa.kaus === rupaKarakter(karakterDariId(2)).kaus);
  cek("tidak ada yang menembus sekat saat masuk", j.menembus === 0, j.menembus);
  cek("gelembung kosong bila tidak ada aksi, layar muncul bila dipilih", sim.teksTampil(cari(sim, 1)!, null) === "" && sim.teksTampil(cari(sim, 1)!, 1) === "Membuka TVR Saya");

  // Orang 1 mengunggah stok (berjalan) -> rak.
  sim.setDaftar([orang(1, akt({ mulai: jamServer, judul: "Banjir Pantura" })), orang(2), orang(3)], jamServer, jamServer);
  let adaDiPintu = false;
  jalankan(sim, 12, j, 0.05, () => {
    const p = cari(sim, 1)!;
    if (zonaDari(p.x, p.y) === "database") adaDiPintu = true;
  });
  const p1 = cari(sim, 1)!;
  cek("unggah stok: berjalan ke ruang database dan berdiri di rak", adaDiPintu && p1.keadaan === "kerja" && p1.stasiun?.jenis === "rak" && zonaDari(p1.x, p1.y) === "database");
  cek("rak itu tercatat terisi oleh orang 1", sim.penghuniDi("rak", p1.stasiun!.idx)?.id === 1 && sim.adaYangBekerja("rak"));
  cek("gelembung memuat label + judul", p1.teks === "Tambah ke Stok: Banjir Pantura", p1.teks);
  cek("menghadap rak (bagian depan -x)", p1.arah === -1 && p1.belakang === true);
  cek("yang lain tetap di aula", cari(sim, 2)!.keadaan === "diam" && cari(sim, 3)!.keadaan === "diam");
  cek("jalan masuk tidak menembus sekat", j.menembus === 0, j.menembus);

  // Selesai: berekor 12 dtk lalu pulang.
  sim.setDaftar([orang(1, akt({ mulai: T0, berjalan: false, akhir: jamServer, judul: "Banjir Pantura" })), orang(2), orang(3)], jamServer, jamServer);
  jalankan(sim, 5, j);
  cek("aksi baru selesai: masih beranimasi di rak (ekor)", cari(sim, 1)!.keadaan === "kerja");
  jalankan(sim, 20, j);
  cek("ekor habis: kembali ke aula dan rak dilepas", cari(sim, 1)!.keadaan === "diam" && zonaDari(cari(sim, 1)!.x, cari(sim, 1)!.y) === "aula" && !sim.adaYangBekerja("rak"));
  cek("pulang tidak menembus sekat", j.menembus === 0, j.menembus);
}

{
  // Semua jenis stasiun + berebut stasiun + pindah antar-ruang.
  const { sim, j } = baru();
  const ids = [11, 12, 13, 14, 15];
  const jenisAksi: [string, AktivitasDunia["anim"], string][] = [
    ["edit_otomatis", "autoedit", "Edit Otomatis"],
    ["kompres", "kompres", "Kompres Video"],
    ["blur_watermark", "blur", "Blur Watermark"],
    ["unggah_sosmed", "kotak_post", "Unggah ke sosmed"],
  ];
  const daftarO = ids.map((id, i) => {
    const t = jenisAksi[i];
    return t ? orang(id, akt({ jenis: t[0], anim: t[1], label: t[2], ringkasan: t[2], mulai: T0, akun: t[1] === "kotak_post" ? "instagram @tvr" : "" })) : orang(id);
  });
  sim.setDaftar(daftarO, T0, T0);
  jalankan(sim, 30, j);
  const di = (id: number) => cari(sim, id)!;
  cek("Auto Edit -> ruang alat, mesin autoedit", di(11).keadaan === "kerja" && di(11).stasiun?.jenis === "autoedit" && zonaDari(di(11).x, di(11).y) === "alat");
  cek("Kompres -> mesin kompres", di(12).stasiun?.jenis === "kompres" && di(12).keadaan === "kerja");
  cek("Blur -> mesin blur", di(13).stasiun?.jenis === "blur" && di(13).keadaan === "kerja");
  cek("Unggah sosmed -> ruang pos, kotak post", di(14).stasiun?.jenis === "kotak_post" && zonaDari(di(14).x, di(14).y) === "pos");
  cek("gelembung unggah menyebut akun sosmed", di(14).teks.includes("instagram @tvr"), di(14).teks);
  cek("yang tanpa aksi tetap di aula", di(15).keadaan === "diam");
  cek("tiga mesin menyala, semua stasiun berbeda", sim.adaYangBekerja("autoedit") && sim.adaYangBekerja("kompres") && sim.adaYangBekerja("blur") && sim.adaYangBekerja("kotak_post"));
  cek("perjalanan ke semua ruang tidak menembus sekat", j.menembus === 0, j.menembus);

  // Orang 11 pindah dari Auto Edit ke Kompres (mesin kompres sudah dipakai 12 -> ambil tempat operator ke-2).
  sim.setDaftar(
    daftarO.map((o) => (o.id === 11 ? orang(11, akt({ jenis: "kompres", anim: "kompres", label: "Kompres Video", mulai: jamServer })) : o)),
    jamServer,
    jamServer,
  );
  jalankan(sim, 30, j);
  cek("pindah alat: keluar dari satu mesin masuk ke mesin lain lewat aula", di(11).stasiun?.jenis === "kompres" && di(11).keadaan === "kerja" && di(11).stasiun?.idx !== di(12).stasiun?.idx);
  cek("pindah antar-ruang tidak menembus sekat", j.menembus === 0, j.menembus);
}

{
  // Stasiun penuh: yang lain antre di aula.
  const { sim, j } = baru();
  const banyakPost = [21, 22, 23, 24].map((id) => orang(id, akt({ jenis: "unggah_sosmed", anim: "kotak_post", label: "Unggah", ringkasan: "Unggah", mulai: T0 })));
  sim.setDaftar(banyakPost, T0, T0);
  jalankan(sim, 30, j);
  const kerja = sim.penghuni.filter((p) => p.keadaan === "kerja");
  const antre = sim.penghuni.filter((p) => p.keadaan === "diam");
  cek("kotak post hanya menampung 3 orang, satu antre di aula", kerja.length === 3 && antre.length === 1 && antre[0].teks.startsWith("Antre"), { kerja: kerja.length, antre: antre.length });
  // Satu selesai -> yang antre mendapat giliran.
  sim.setDaftar(banyakPost.map((o, i) => (i === 0 ? { ...o, aktivitas: null } : o)), T0, T0);
  jalankan(sim, 30, j);
  cek("setelah ada yang pulang, yang antre mendapat giliran", sim.penghuni.filter((p) => p.keadaan === "kerja").length === 3 && sim.penghuni.every((p) => p.teks !== "Antre: Unggah"));
  cek("antre & giliran tidak menembus sekat", j.menembus === 0, j.menembus);
}

{
  // Pergi: tenggang presence berkedip, lalu pulang lewat pintu depan.
  const { sim, j } = baru();
  sim.setDaftar([orang(31), orang(32, akt({ mulai: T0, judul: "x" }))], T0, T0);
  jalankan(sim, 20, j);
  cek("(prasyarat) orang 32 sedang di ruang database", cari(sim, 32)?.keadaan === "kerja");
  sim.setDaftar([orang(31)], jamServer, jamServer); // 32 tak terlihat lagi
  jalankan(sim, 10, j);
  cek("hilang sebentar (< tenggang): belum dihapus", !!cari(sim, 32));
  sim.setDaftar([orang(31), orang(32, akt({ mulai: T0, judul: "x" }))], jamServer, jamServer); // muncul lagi
  jalankan(sim, 5, j);
  cek("muncul lagi dalam tenggang: tetap ada", !!cari(sim, 32) && cari(sim, 32)!.keadaan !== "keluar");
  sim.setDaftar([orang(31)], jamServer, jamServer);
  jalankan(sim, 90, j);
  cek("benar-benar pergi: dihapus dari dunia setelah berjalan ke pintu", !cari(sim, 32) && !!cari(sim, 31));
  cek("kursi/slot yang ditinggalkan dilepas", !sim.adaYangBekerja("rak"));
  cek("pergi dari dalam ruang database lewat pintunya (tidak menembus sekat)", j.menembus === 0, j.menembus);
}

{
  // Aula penuh: yang melebihi kapasitas dihitung, tidak digambar.
  const { sim } = baru();
  const banyak = Array.from({ length: SLOT_AULA.length + 7 }, (_, i) => orang(1000 + i));
  sim.setDaftar(banyak, T0, T0);
  cek("melebihi kapasitas aula: sisanya dicatat di `diluar`", sim.penghuni.length === SLOT_AULA.length && sim.diluar === 7, { n: sim.penghuni.length, diluar: sim.diluar });
}

{
  // Gerak dikurangi: pindah seketika.
  jamServer = T0;
  const j: Jejak = { menembus: 0, terakhir: new Map() };
  const sim = new SimulasiPenghuni({ sekarangMs: () => jamServer, gerakKurang: () => true });
  sim.setDaftar([orang(41, akt({ mulai: T0 }))], T0, T0);
  jalankan(sim, 3, j);
  cek("gerak dikurangi: langsung berdiri di rak", cari(sim, 41)?.keadaan === "kerja");
}

console.log("\n[G] Teks & waktu di atas nama");
cek("teksAktivitas: label + judul + akun", teksAktivitas(akt({ judul: "Judul", akun: "instagram @a" })) === "Tambah ke Stok: Judul → instagram @a");
cek("teksAktivitas: tanpa judul memakai ringkasan", teksAktivitas(akt()) === "Menambah video ke Stok");
cek("teksAktivitas: dipotong", teksAktivitas(akt({ judul: "x".repeat(400) })).length <= 110);
cek("jamWibDetik: 03:00 UTC = 10:00:00 WIB", jamWibDetik(T0) === "10:00:00");
cek("waktuTag: aksi berjalan = lama (m:ss)", waktuTag({ data: orang(1, akt({ mulai: T0 - 65_000 })) }, T0) === "1:05");
cek("waktuTag: aksi baru selesai = jam selesai WIB", waktuTag({ data: orang(1, akt({ berjalan: false, akhir: T0 - 4000 })) }, T0) === "09:59:56");
cek("waktuTag: tanpa aksi = jam WIB sekarang", waktuTag({ data: orang(1) }, T0) === "10:00:00");

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
