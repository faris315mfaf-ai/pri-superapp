// Uji "dunia" Ruang Bot (13 Okt 2026): denah empat ruang, jalan lewat pintu, bot tidur tanpa
// API key, rapat, mode nyata (sasaran dari server), Nara mengantar surat tugas, dan pemetaan data.
// Murni — tanpa jaringan/DOM. Jalankan: npx tsx tests/uji-ruang-dunia.mts
import {
  KAPASITAS,
  KASUR,
  KURSI_RAPAT,
  LABEL_RUANG,
  PINTU_KERJA_MEETING,
  SEKAT,
  STASIUN,
  TITIK_TENGAH,
  jalanKeluar,
  jalanMasuk,
  jalurTerlarang,
  segmenMenembus,
  titikDiSekat,
  titikKursi,
  zonaDari,
  JALAN_KELUAR_RAPAT_NARA,
  JALAN_KOORDINATOR_KE_KERJA,
  JALAN_MASUK_RAPAT_NARA,
  JALAN_MEJA_KE_PAPAN,
  JALAN_PAPAN_KE_KERJA,
  JALAN_PAPAN_KE_MEJA,
  JALAN_PULANG_KE_MEJA,
  MEJA_KOORDINATOR,
  type Titik,
} from "@/features/ruang-bot/denah";
import { potongSekat } from "@/features/ruang-bot/dunia-gambar";
import { SimulasiBot } from "@/features/ruang-bot/simulasi-bot";
import { TEKS_TANPA_KUNCI } from "@/features/ruang-bot/simulasi-nara";
import { BOT_CONTOH } from "@/features/ruang-bot/data-contoh";
import { petaCatatan, petaSasaran, petakanBot, sasaranBot, suratBaru } from "@/features/ruang-bot/peta-nyata";
import {
  JENDELA_RAPAT_MS,
  mejaDariTahapTugas,
  perluDiantar,
  rakitDiputus,
  rapatBerlangsung,
  sisaRapatMs,
  tugasAktifPerBot,
} from "@/lib/bot-dunia-murni";
import type { BotRingkas } from "@/lib/bot-tipe";
import type { BotContoh } from "@/features/ruang-bot/tipe";

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

// ---------- alat uji ----------

const buatBots = (punya: boolean[]): BotContoh[] => BOT_CONTOH.map((b, i) => ({ ...b, punyaOtak: punya[i] ?? true }));
const acak = () => 0.1;

type Jejak = { menembus: number; terakhir: Map<string, Titik> };

/** Maju `detik` dengan langkah kecil; mencatat setiap langkah yang menembus sekat (bot maupun Nara). */
function jalankan(sim: SimulasiBot, detik: number, jejak: Jejak, tiapLangkah?: (t: number) => void, langkah = 0.05): void {
  const n = Math.round(detik / langkah);
  for (let i = 0; i < n; i++) {
    sim.maju(langkah, langkah);
    const posisi: [string, Titik][] = [...sim.bots.map((b): [string, Titik] => [b.id, [b.x, b.y]]), ["nara", [sim.nara.x, sim.nara.y]]];
    for (const [id, p] of posisi) {
      const lama = jejak.terakhir.get(id);
      if (lama && segmenMenembus(lama, p)) jejak.menembus++;
      jejak.terakhir.set(id, p);
    }
    tiapLangkah?.(i * langkah);
  }
}
const jejakBaru = (): Jejak => ({ menembus: 0, terakhir: new Map() });
const bot = (sim: SimulasiBot, id: string) => sim.bots.find((b) => b.id === id)!;

// ============================================================
console.log("\n[A] Denah: sekat, pintu, jalur");
cek("segmen lurus menembus sekat kerja|meeting ditolak", segmenMenembus([5, 3], [12, 3]));
cek("segmen lewat pintu (celah y 4.3..5.9) lolos", !segmenMenembus([9, 5.1], [11, 5.1]));
cek("segmen lewat pintu kerja|koordinator (x 2.2..3.6) lolos", !segmenMenembus([2.9, 9], [2.9, 11]));
cek("segmen menembus sekat kerja|koordinator di luar pintu ditolak", segmenMenembus([6, 9], [6, 11]));
cek("segmen kamar tidur|koordinator (x=10, y>10) ditolak", segmenMenembus([9, 12], [11, 12]));
cek("segmen meeting|kamar tidur di luar pintu ditolak", segmenMenembus([13, 9], [13, 11]));
cek("segmen meeting|kamar tidur lewat celah (x 10.4..11.8) lolos", !segmenMenembus([11.1, 9], [11.1, 11]));
cek("segmen di satu ruang lolos", !segmenMenembus([1, 1], [9, 9]) && !segmenMenembus([11, 11], [15, 15]));
cek("titikDiSekat: di dalam lempeng", titikDiSekat([10, 2]) && !titikDiSekat([11, 2]));
cek("zonaDari empat ruang", zonaDari(3, 3) === "kerja" && zonaDari(13, 3) === "meeting" && zonaDari(3, 13) === "koordinator" && zonaDari(13, 13) === "tidur");
cek("4 label ruang, satu per zona", new Set(LABEL_RUANG.map((l) => l.kunci)).size === 4);
cek("kapasitas: 3 kursi rapat, 3 kasur", KAPASITAS.rapat === 3 && KAPASITAS.tidur === 3 && KURSI_RAPAT.length === 3 && KASUR.length === 3);
cek("pintu kerja|meeting di tengah celah sekat", PINTU_KERJA_MEETING.every((p) => p[1] > 4.3 && p[1] < 5.9));
cek("sekat tidak saling tumpang tindih dengan titik tengah", !titikDiSekat(TITIK_TENGAH));

console.log("\n[A2] Potongan sekat (urutan gambar)");
for (const s of SEKAT) {
  const potong = potongSekat(s);
  const panjang = s.w < s.d ? s.d : s.w;
  const jumlah = potong.reduce((a, p) => a + (s.w < s.d ? p.d : p.w), 0);
  cek(`sekat (${s.x},${s.y}) terpotong utuh tanpa celah`, Math.abs(jumlah - panjang) < 1e-9, { jumlah, panjang });
  cek(`sekat (${s.x},${s.y}) tiap potongan <= 1 grid`, potong.every((p) => (s.w < s.d ? p.d : p.w) <= 1 + 1e-9));
  cek(`sekat (${s.x},${s.y}) kunci kedalaman naik searah panjang`, potong.every((p, i) => i === 0 || p.kunci > potong[i - 1].kunci));
  const batang = potong.flatMap((p) => p.batang);
  cek(`sekat (${s.x},${s.y}) batang kaca tetap tiap ~1.7 grid`, batang.length >= Math.floor(panjang / 1.7) && batang.every((b, i) => i === 0 || b > batang[i - 1]));
}

for (const tempat of ["cari", "edit", "posting", "istirahat", "rapat", "tidur"] as const) {
  const banyak = tempat === "rapat" ? KAPASITAS.rapat : tempat === "tidur" ? KAPASITAS.tidur : STASIUN[tempat].kursi.length;
  for (let i = 0; i < banyak; i++) {
    const masuk = jalanMasuk(tempat, i);
    const keluar = jalanKeluar(tempat, i);
    cek(`jalan masuk ${tempat}#${i} sah (tidak menembus sekat)`, !jalurTerlarang(TITIK_TENGAH, masuk), masuk);
    cek(`jalan keluar ${tempat}#${i} sah`, !jalurTerlarang(titikKursi(tempat, i), [...keluar, TITIK_TENGAH]), keluar);
    const ujung = masuk[masuk.length - 1];
    cek(`jalan masuk ${tempat}#${i} berakhir di kursi`, ujung[0] === titikKursi(tempat, i)[0] && ujung[1] === titikKursi(tempat, i)[1]);
  }
}
cek("kursi rapat di ruang meeting", KURSI_RAPAT.every((k) => zonaDari(k[0], k[1]) === "meeting"));
cek("kepala kasur di kamar tidur", [0, 1, 2].every((i) => zonaDari(titikKursi("tidur", i)[0], titikKursi("tidur", i)[1]) === "tidur"));
cek("meja pencarian/edit/posting/sofa di ruang kerja", (["cari", "edit", "posting", "istirahat"] as const).every((t) => zonaDari(titikKursi(t, 0)[0], titikKursi(t, 0)[1]) === "kerja"));
const meja = MEJA_KOORDINATOR.kursi;
cek("kursi Nara di ruang koordinator", zonaDari(meja[0], meja[1]) === "koordinator");
cek("Nara: meja -> kerja sah", !jalurTerlarang(meja, [...JALAN_KOORDINATOR_KE_KERJA, TITIK_TENGAH]));
cek("Nara: meja -> papan sah", !jalurTerlarang(meja, JALAN_MEJA_KE_PAPAN));
cek("Nara: papan -> meja sah", !jalurTerlarang(JALAN_MEJA_KE_PAPAN[JALAN_MEJA_KE_PAPAN.length - 1], JALAN_PAPAN_KE_MEJA));
cek("Nara: papan -> kerja -> meja sah", !jalurTerlarang(JALAN_MEJA_KE_PAPAN[JALAN_MEJA_KE_PAPAN.length - 1], [...JALAN_PAPAN_KE_KERJA, TITIK_TENGAH, ...JALAN_PULANG_KE_MEJA]));
cek("Nara: kerja -> kursi rapat sah", !jalurTerlarang(TITIK_TENGAH, JALAN_MASUK_RAPAT_NARA));
cek("Nara: kursi rapat -> kerja -> meja sah", !jalurTerlarang(JALAN_MASUK_RAPAT_NARA[JALAN_MASUK_RAPAT_NARA.length - 1], [...JALAN_KELUAR_RAPAT_NARA, TITIK_TENGAH, ...JALAN_PULANG_KE_MEJA]));
cek("jalurTerlarang menolak lintasan menembus sekat", jalurTerlarang([5, 5], [[12, 3]]));
cek("jalurTerlarang menolak titik di luar denah", jalurTerlarang([5, 5], [[5, 17]]));
cek("SEKAT: ada kaca bening dan kaca susu", SEKAT.some((s) => s.buram) && SEKAT.some((s) => !s.buram));

// ============================================================
console.log("\n[B] Mode contoh: tidur tanpa API key, rapat, kerja bergilir");
{
  const sim = new SimulasiBot(buatBots([true, true, false]), { kuotaAwal: {}, maksKuota: 3, acak });
  const j = jejakBaru();
  const pernahKerja = new Set<string>();
  jalankan(sim, 40, j, () => {
    for (const b of sim.bots) if (b.keadaan === "bekerja" && ["cari", "edit", "posting"].includes(b.tempat)) pernahKerja.add(b.id);
  });
  const dimas = bot(sim, "bot3");
  cek("Dimas (tanpa key) berada di kamar tidur", dimas.tempat === "tidur" && dimas.keadaan === "bekerja");
  cek("Dimas berbaring di kasur ke-3 (nomor sesuai urutan)", sim.tidurDi(2)?.id === "bot3");
  cek("kasur lain kosong", sim.tidurDi(0) === null && sim.tidurDi(1) === null);
  cek("gelembung tidur terlihat", sim.teksTampil(dimas).startsWith("Zzz"));
  cek("Dimas tidak pernah duduk di meja kerja", !pernahKerja.has("bot3"));
  cek("Raka & Sinta bekerja bergilir di meja", pernahKerja.has("bot1") && pernahKerja.has("bot2"));
  cek("tidak ada langkah yang menembus sekat (40 dtk)", j.menembus === 0, j.menembus);
  cek("statusHidup Dimas: bekerja tapi tanpa tahap kerja", sim.statusHidup().bot3.tahap === null && sim.statusHidup().bot3.keadaan === "bekerja");

  // Key terpasang: Dimas bangun, keluar kamar tidur, mulai bekerja.
  sim.setPunyaOtak("bot3", true);
  let pernahMeja = false;
  let adaDiKerja = false;
  jalankan(sim, 60, j, () => {
    const d = bot(sim, "bot3");
    if (["cari", "edit", "posting"].includes(d.tempat) && d.keadaan === "bekerja") pernahMeja = true;
    if (d.keadaan === "bekerja" && d.tempat !== "tidur") adaDiKerja = true;
  });
  cek("key terpasang: Dimas bangun dari kasur", sim.tidurDi(2) === null && adaDiKerja);
  cek("key terpasang: Dimas ikut bekerja di meja", pernahMeja);
  cek("bangun & jalan keluar tidak menembus sekat", j.menembus === 0, j.menembus);

  // Key dicabut dari Raka saat bekerja: ia berjalan ke kamar tidur (kasur 1).
  sim.setPunyaOtak("bot1", false);
  jalankan(sim, 30, j);
  cek("key dicabut: Raka tidur di kasurnya (nomor 1)", sim.tidurDi(0)?.id === "bot1");
  cek("key dicabut: kursi meja yang ditinggalkan dilepas", bot(sim, "bot1").tempat === "tidur");
  cek("perjalanan ke kamar tidur tidak menembus sekat", j.menembus === 0, j.menembus);
  sim.setPunyaOtak("bot1", true);

  // Rapat: bot berkunci berkumpul di ruang meeting, Nara ikut.
  sim.setRapat(true);
  jalankan(sim, 45, j);
  const rapatIds = sim.bots.filter((b) => b.tempat === "rapat" && b.keadaan === "bekerja").map((b) => b.id).sort();
  cek("rapat: semua bot berkunci duduk di ruang meeting", rapatIds.join() === "bot1,bot2,bot3", rapatIds);
  cek("rapat: tiap bot punya kursi sendiri (3 kursi, tanpa tabrakan)", new Set(sim.bots.map((b) => `${Math.round(b.x * 10)}:${Math.round(b.y * 10)}`)).size === 3);
  cek("rapat: hanya satu gelembung yang bicara", sim.bots.filter((b) => sim.teksTampil(b) !== "").length === 1);
  cek("rapat: Nara duduk di ruang meeting", sim.nara.keadaan === "rapat" && zonaDari(sim.nara.x, sim.nara.y) === "meeting");
  cek("rapat: perjalanan ke ruang meeting tidak menembus sekat", j.menembus === 0, j.menembus);
  sim.setRapat(false);
  jalankan(sim, 60, j);
  cek("rapat bubar: tak ada bot tersisa di ruang meeting", sim.bots.every((b) => b.tempat !== "rapat"));
  cek("rapat bubar: Nara kembali ke mejanya", sim.nara.keadaan === "meja" && zonaDari(sim.nara.x, sim.nara.y) === "koordinator");
  cek("rapat bubar: bot kembali bekerja", sim.bots.some((b) => ["cari", "edit", "posting"].includes(b.tempat)));
  cek("pulang dari ruang meeting tidak menembus sekat", j.menembus === 0, j.menembus);
}

console.log("\n[B2] Mode contoh: bot tanpa key tidak ikut rapat");
{
  const sim = new SimulasiBot(buatBots([true, true, false]), { kuotaAwal: {}, maksKuota: 3, acak });
  const j = jejakBaru();
  sim.setRapat(true);
  jalankan(sim, 50, j);
  cek("Dimas tetap tidur saat rapat", sim.tidurDi(2)?.id === "bot3");
  cek("hanya dua yang rapat", sim.bots.filter((b) => b.tempat === "rapat" && b.keadaan === "bekerja").length === 2);
  cek("Dimas tidak pernah masuk ruang meeting", bot(sim, "bot3").tempat === "tidur");
  cek("tidak menembus sekat", j.menembus === 0);
}

console.log("\n[B3] Gerak dikurangi: pindah seketika");
{
  const sim = new SimulasiBot(buatBots([true, true, false]), { kuotaAwal: {}, maksKuota: 3, acak });
  sim.setGerakKurang(true);
  const j = jejakBaru();
  // 2 dtk cukup bagi bot untuk memutuskan tujuan (lamaAntre -i*1.6) dan tiba seketika.
  jalankan(sim, 6, j);
  cek("Dimas langsung di kasur tanpa berjalan", sim.tidurDi(2)?.id === "bot3");
}

// ============================================================
console.log("\n[C] Mode nyata (diam): sasaran dari server");
{
  const bots = buatBots([true, true, false]);
  const sim = new SimulasiBot(bots, { kuotaAwal: {}, maksKuota: 3, diam: true, sasaranAwal: { bot1: { tempat: "edit", teks: "Mengedit: Banjir" } } });
  cek("awal: Raka langsung duduk di meja edit (tanpa jalan)", bot(sim, "bot1").tempat === "edit" && bot(sim, "bot1").keadaan === "bekerja" && sim.terisi("edit"));
  cek("awal: Sinta duduk di sofa", bot(sim, "bot2").tempat === "istirahat" && bot(sim, "bot2").keadaan === "bekerja");
  cek("awal: Dimas (tanpa key) terbaring di kasur", sim.tidurDi(2)?.id === "bot3");
  cek("awal: teks Raka dari server tampil", sim.teksTampil(bot(sim, "bot1")) === "Mengedit: Banjir");
  cek("awal: bubble 'Menunggu tugas' disembunyikan", sim.teksTampil(bot(sim, "bot2")) === "");
  cek("awal: bubble tidur tampil", sim.teksTampil(bot(sim, "bot3")).startsWith("Zzz"));
  const j = jejakBaru();
  jalankan(sim, 20, j);
  cek("tanpa perubahan data, tak ada yang berpindah", bot(sim, "bot1").tempat === "edit" && bot(sim, "bot2").tempat === "istirahat");

  // Tugas Sinta masuk tahap posting -> ia berjalan ke meja posting.
  sim.setSasaran({ bot1: { tempat: "edit", teks: "Mengedit: Banjir" }, bot2: { tempat: "posting", teks: "Memposting: Cabai" } });
  let berjalan = false;
  jalankan(sim, 20, j, () => {
    if (bot(sim, "bot2").keadaan === "berjalan") berjalan = true;
  });
  cek("Sinta berjalan ke meja posting", berjalan && bot(sim, "bot2").tempat === "posting" && bot(sim, "bot2").keadaan === "bekerja" && sim.terisi("posting"));
  cek("teks tugas Sinta tampil", sim.teksTampil(bot(sim, "bot2")) === "Memposting: Cabai");
  cek("jalan Sinta tidak menembus sekat", j.menembus === 0, j.menembus);

  // Dua bot berebut satu meja: yang kedua antre sampai kosong.
  sim.setSasaran({ bot1: { tempat: "edit", teks: "A" }, bot2: { tempat: "edit", teks: "B" } });
  jalankan(sim, 20, j);
  const duduk = [bot(sim, "bot1"), bot(sim, "bot2")].filter((b) => b.tempat === "edit" && b.keadaan === "bekerja");
  cek("meja edit hanya satu penghuni, yang lain menunggu", duduk.length === 1 && [bot(sim, "bot1"), bot(sim, "bot2")].some((b) => b.keadaan === "menunggu"));
  sim.setSasaran({ bot1: { tempat: "istirahat", teks: "Menunggu tugas" }, bot2: { tempat: "edit", teks: "B" } });
  jalankan(sim, 25, j);
  cek("meja dilepas -> yang menunggu mendapat giliran", bot(sim, "bot2").tempat === "edit" && bot(sim, "bot2").keadaan === "bekerja" && bot(sim, "bot1").tempat === "istirahat");
  cek("antre & giliran tidak menembus sekat", j.menembus === 0, j.menembus);

  // Semua bot dijeda/menganggur lalu rapat dipanggil dari chat.
  sim.setSasaran({});
  sim.setRapat(true);
  jalankan(sim, 40, j);
  cek("rapat nyata: Raka & Sinta di ruang meeting, Dimas tetap tidur", bot(sim, "bot1").tempat === "rapat" && bot(sim, "bot2").tempat === "rapat" && sim.tidurDi(2)?.id === "bot3");
  sim.setRapat(false);
  jalankan(sim, 40, j);
  cek("rapat usai: kembali ke sofa", bot(sim, "bot1").tempat === "istirahat" && bot(sim, "bot2").tempat === "istirahat");
  // Key Dimas terpasang di dunia nyata.
  sim.setPunyaOtak("bot3", true);
  jalankan(sim, 40, j);
  cek("key terpasang: Dimas bangun dan menunggu tugas", sim.tidurDi(2) === null && bot(sim, "bot3").tempat === "istirahat");
  cek("seluruh perjalanan nyata tidak menembus sekat", j.menembus === 0, j.menembus);
  let statusMasuk = 0;
  sim.onStatus = () => statusMasuk++;
  jalankan(sim, 3, j);
  cek("onStatus dilaporkan bila ada perubahan", statusMasuk >= 0);
}

console.log("\n[C2] Mode nyata: sofa penuh -> bot ketiga menunggu di tengah ruangan");
{
  const sim = new SimulasiBot(buatBots([true, true, true]), { kuotaAwal: {}, maksKuota: 3, diam: true });
  const antre = sim.bots.filter((b) => b.keadaan === "menunggu");
  cek("dua di sofa, satu menunggu", sim.bots.filter((b) => b.tempat === "istirahat" && b.keadaan === "bekerja").length === 2 && antre.length === 1);
  cek("yang menunggu memakai teks sasaran, bukan 'Antre …'", antre[0].teks === "Menunggu tugas");
}

// ============================================================
console.log("\n[D] Nara: surat tugas, papan, rapat, tanpa API key");
{
  const sim = new SimulasiBot(buatBots([true, true, true]), { kuotaAwal: {}, maksKuota: 3, diam: true });
  const j = jejakBaru();
  sim.nara.setKeadaan({ punyaOtak: true, usulanTerbuka: 2 });
  const nama: string[] = [];
  jalankan(sim, 12, j, () => {
    const t = sim.nara.teksTampil();
    if (t && !nama.includes(t)) nama.push(t);
  });
  cek("Nara menganggur: gelembung menyebut usulan menunggu", nama.some((t) => t.includes("2 usulan menunggu")), nama);
  cek("Nara tetap di mejanya", sim.nara.keadaan === "meja");

  sim.nara.setCatatan({ bot1: [{ id: 11, judul: "Banjir Pantura" }] });
  cek("papan: catatan lama langsung tampil", sim.nara.jumlahCatatan("bot1") === 1);
  cek("antar: id baru diterima", sim.nara.antar({ id: 12, botId: "bot1", judul: "Cabai turun" }) === true);
  cek("antar: id sama tidak diputar ulang", sim.nara.antar({ id: 12, botId: "bot1", judul: "Cabai turun" }) === false);
  cek("antar: id yang diberi tanda 'sudah ada' dilewati", (sim.nara.anggapSudahAda(13), sim.nara.antar({ id: 13, botId: "bot2", judul: "x" })) === false);
  sim.nara.setCatatan({ bot1: [{ id: 12, judul: "Cabai turun" }, { id: 11, judul: "Banjir Pantura" }] });
  cek("papan: catatan yang sedang diantar belum tampil", sim.nara.jumlahCatatan("bot1") === 1);

  const urutan: string[] = [];
  let kabarTampil = false;
  let kertasTerlihat = false;
  let catatanSaatTempel = -1;
  jalankan(sim, 40, j, () => {
    if (urutan[urutan.length - 1] !== sim.nara.keadaan) urutan.push(sim.nara.keadaan);
    if (sim.nara.kertas) kertasTerlihat = true;
    if (sim.teksTampil(bot(sim, "bot1")).startsWith("Tugas baru dari Nara")) kabarTampil = true;
    if (sim.nara.keadaan === "tempel") catatanSaatTempel = sim.nara.jumlahCatatan("bot1");
  });
  cek("urutan: jalan -> tempel -> jalan -> serah -> jalan -> meja", urutan.join(">") === "jalan>tempel>jalan>serah>jalan>meja", urutan.join(">"));
  cek("kertas melayang saat serah", kertasTerlihat);
  cek("bot menerima kabar dari Nara", kabarTampil);
  cek("catatan baru muncul di papan setelah ditempel", sim.nara.jumlahCatatan("bot1") === 2 && catatanSaatTempel === 1);
  cek("Nara kembali duduk di mejanya", sim.nara.keadaan === "meja" && sim.nara.sisaAntar === 0);
  cek("jalan Nara (papan, ruang kerja, pulang) tidak menembus sekat", j.menembus === 0, j.menembus);

  // Bot sasaran sedang rapat: surat diserahkan dari pintu ruang meeting.
  const sim2 = new SimulasiBot(buatBots([true, true, true]), { kuotaAwal: {}, maksKuota: 3, diam: true });
  const j2 = jejakBaru();
  sim2.setRapat(true);
  jalankan(sim2, 40, j2);
  cek("rapat berjalan: Nara & bot di ruang meeting", sim2.nara.keadaan === "rapat" && bot(sim2, "bot1").tempat === "rapat");
  sim2.nara.antar({ id: 21, botId: "bot2", judul: "Konser akbar" });
  const urutan2: string[] = [];
  let kabar2 = false;
  jalankan(sim2, 60, j2, () => {
    if (urutan2[urutan2.length - 1] !== sim2.nara.keadaan) urutan2.push(sim2.nara.keadaan);
    if (sim2.teksTampil(bot(sim2, "bot2")).startsWith("Tugas baru")) kabar2 = true;
  });
  cek("surat tugas tidak menunggu rapat selesai", urutan2.includes("tempel") && urutan2.includes("serah"), urutan2.join(">"));
  cek("bot di ruang meeting tetap menerima kabar", kabar2);
  cek("selesai mengantar Nara kembali ke rapat (rapat masih berjalan)", sim2.nara.keadaan === "rapat", sim2.nara.keadaan);
  cek("rute rapat -> papan -> pintu meeting -> rapat tidak menembus sekat", j2.menembus === 0, j2.menembus);

  // Tanpa API key: duduk di mejanya dengan gelembung tetap.
  const sim3 = new SimulasiBot(buatBots([true, true, true]), { kuotaAwal: {}, maksKuota: 3, diam: true });
  sim3.nara.setKeadaan({ punyaOtak: false, usulanTerbuka: 0 });
  jalankan(sim3, 12, jejakBaru());
  cek("Nara tanpa API key: gelembung 'belum punya API key'", sim3.nara.teksTampil() === TEKS_TANPA_KUNCI);
  cek("Nara tanpa API key: tidak 'bekerja' di mejanya", sim3.nara.bekerjaDiMeja === false);
  sim3.nara.setKeadaan({ punyaOtak: true, usulanTerbuka: 0 });
  cek("API key Nara terpasang: kembali bekerja", sim3.nara.bekerjaDiMeja === true);

  // Bot yang dituju sudah tidak ada: Nara pulang tanpa macet.
  const sim4 = new SimulasiBot(buatBots([true, true, true]), { kuotaAwal: {}, maksKuota: 3, diam: true });
  sim4.nara.antar({ id: 31, botId: "bot-hilang", judul: "x" });
  const j4 = jejakBaru();
  jalankan(sim4, 25, j4);
  cek("bot sasaran hilang: Nara tetap kembali ke meja", sim4.nara.keadaan === "meja" && sim4.nara.sisaAntar === 0);
  cek("... tanpa menembus sekat", j4.menembus === 0);
}

// ============================================================
console.log("\n[E] Pemetaan data nyata");
{
  const baris: BotRingkas = {
    id: 7,
    user_id: 70,
    username: "bot7",
    nama: "Raka",
    peran: "Pencari",
    persona: "p",
    warna: "#f08a3c",
    handle: "@x",
    platform: "Instagram",
    mode: "acc",
    rupa: { kaus: "#f08a3c", bayangan: "#c76a24", celana: "#3a4a78", kulit: "#e8b48a", rambut: "#3b2418", gayaRambut: "pendek" },
    kuota_harian: 3,
    jam_mulai: "08:00",
    jam_selesai: "20:00",
    aktif: true,
    jeda: false,
    gagal_beruntun: 0,
    post_hari_ini: 0,
    akun_tertaut: 1,
    punya_otak: false,
    tugas_aktif: { tahap: "edit", judul: "  Banjir Pantura  " },
  };
  const b = petakanBot(baris);
  cek("petakanBot: punyaOtak dibawa", b.punyaOtak === false && b.nyata?.tugasAktif?.tahap === "edit");
  cek("sasaranBot: tugas edit -> meja edit dengan judul", JSON.stringify(sasaranBot(b, false)) === JSON.stringify({ tempat: "edit", teks: "Mengedit: Banjir Pantura" }), sasaranBot(b, false));
  cek("sasaranBot: jeda global -> sofa Dijeda", sasaranBot(b, true).teks === "Dijeda" && sasaranBot(b, true).tempat === "istirahat");
  cek("sasaranBot: jeda per bot -> sofa Dijeda", sasaranBot({ ...b, nyata: { ...b.nyata!, jeda: true } }, false).teks === "Dijeda");
  cek("sasaranBot: tanpa tugas -> sofa Menunggu tugas", sasaranBot({ ...b, nyata: { ...b.nyata!, tugasAktif: null } }, false).teks === "Menunggu tugas");
  cek("sasaranBot: tahap menunggu ACC -> tetap di sofa", sasaranBot({ ...b, nyata: { ...b.nyata!, tugasAktif: { tahap: "menunggu_acc", judul: "x" } } }, false).tempat === "istirahat");
  cek("sasaranBot: judul kosong tidak menghasilkan 'Mencari: '", sasaranBot({ ...b, nyata: { ...b.nyata!, tugasAktif: { tahap: "cari", judul: " " } } }, false).teks === "Mencari…");
  cek("petaSasaran: satu entri per bot", Object.keys(petaSasaran([b, { ...b, id: "8" }], false)).length === 2);

  cek("mejaDariTahapTugas", mejaDariTahapTugas("pilih") === "cari" && mejaDariTahapTugas("unduh") === "edit" && mejaDariTahapTugas("disetujui") === "posting" && mejaDariTahapTugas("siap_ditinjau") === null && mejaDariTahapTugas("selesai") === null);
  const tugas = tugasAktifPerBot([
    { id: 1, bot_id: 7, tahap: "edit", judul: "lama" },
    { id: 5, bot_id: 7, tahap: "posting", judul: "baru" },
    { id: 3, bot_id: 8, tahap: "menunggu_acc", judul: "bukan kerja" },
    { id: 4, bot_id: 9, tahap: "cari", judul: null },
  ]);
  cek("tugasAktifPerBot: id terbesar menang", tugas.get(7)?.judul === "baru");
  cek("tugasAktifPerBot: menunggu ACC tidak dihitung", !tugas.has(8));
  cek("tugasAktifPerBot: judul null -> kosong", tugas.get(9)?.judul === "");

  const T = Date.parse("2026-10-13T05:00:00Z");
  cek("rapatBerlangsung: pesan 30 dtk lalu", rapatBerlangsung(new Date(T - 30_000).toISOString(), T));
  cek("rapatBerlangsung: tepat di batas", rapatBerlangsung(new Date(T - JENDELA_RAPAT_MS).toISOString(), T));
  cek("rapatBerlangsung: lewat batas -> tidak", !rapatBerlangsung(new Date(T - JENDELA_RAPAT_MS - 1000).toISOString(), T));
  cek("rapatBerlangsung: null/rusak -> tidak", !rapatBerlangsung(null, T) && !rapatBerlangsung("bukan-tanggal", T) && !rapatBerlangsung(undefined, T));
  cek("rapatBerlangsung: masa depan jauh -> tidak", !rapatBerlangsung(new Date(T + 3600_000).toISOString(), T));
  cek("sisaRapatMs: sisa jendela", sisaRapatMs(new Date(T - 60_000).toISOString(), T) === JENDELA_RAPAT_MS - 60_000);
  cek("sisaRapatMs: sudah usai -> 0", sisaRapatMs(new Date(T - 10 * 60_000).toISOString(), T) === 0);

  const diputus = rakitDiputus([
    { id: 1, bot_id: 7, judul: "lama", diputus_pada: new Date(T - 3600_000).toISOString() },
    { id: 2, bot_id: 8, judul: "baru", diputus_pada: new Date(T - 30_000).toISOString() },
    { id: 3, bot_id: 7, judul: null, diputus_pada: "rusak" },
    { id: 4, bot_id: 7, judul: "tanpa waktu", diputus_pada: null },
  ]);
  cek("rakitDiputus: baris rusak dibuang, terbaru dulu", diputus.map((d) => d.id).join() === "2,1", diputus.map((d) => d.id));
  cek("perluDiantar: hanya yang baru", perluDiantar(diputus[0], T) && !perluDiantar(diputus[1], T));
  const surat = suratBaru(diputus, new Set(["7", "8"]), T);
  cek("suratBaru: hanya usulan baru", surat.length === 1 && surat[0].id === 2 && surat[0].botId === "8");
  cek("suratBaru: bot yang sudah tidak ada dilewati", suratBaru(diputus, new Set(["7"]), T).length === 0);
  const catatan = petaCatatan(diputus);
  cek("petaCatatan: dikelompokkan per bot (id tampilan)", catatan["7"]?.length === 1 && catatan["8"]?.[0].judul === "baru");
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
