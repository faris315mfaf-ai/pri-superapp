// Uji SIMULASI di DENAH v2 (16 Okt 2026). Murni — tanpa jaringan.
// Jalankan: npx tsx tests/uji-simulasi2.mts
import { segmenMenembus } from "@/features/ruang-bot/denah";
import { DENAH_SIM_V2 } from "@/features/ruang-bot/denah2-sim";
import {
  KASUR2,
  KURSI_NARA_RAPAT2,
  KURSI_RAPAT2,
  LEBAR_DUNIA,
  MEJA_KOORDINATOR2,
  PAPAN_TUGAS2,
  PINTU_MASUK2,
  SEKAT2,
  SLOT_AULA2,
  STASIUN2,
  STASIUN_PENGHUNI2,
  TERHALANG2,
  TITIK_TENGAH2,
  ruangDi,
  zonaDari2,
  type Titik,
} from "@/features/ruang-bot/denah2";
import { BOT_CONTOH } from "@/features/ruang-bot/data-contoh";
import { SimulasiBot } from "@/features/ruang-bot/simulasi-bot";
import { SimulasiPenghuni } from "@/features/ruang-bot/simulasi-penghuni";
import type { BotContoh } from "@/features/ruang-bot/tipe";
import { karakterDariId, type AktivitasDunia, type PenghuniDunia } from "@/lib/dunia-murni";

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
const dekat = (a: Titik, b: Titik, e = 1e-6) => Math.abs(a[0] - b[0]) < e && Math.abs(a[1] - b[1]) < e;

// Tile terhalang yang boleh diinjak: dudukan sofa (titik akhir yang memang di atas perabot).
const BOLEH = new Set(STASIUN2.istirahat.map((d) => Math.floor(d.titik[1]) * LEBAR_DUNIA + Math.floor(d.titik[0])));

type Jejak = { menembus: number; keluar: number; salahSisi: number; terhalang: number; terakhir: Map<string, Titik> };
const jejakBaru = (): Jejak => ({ menembus: 0, keluar: 0, salahSisi: 0, terhalang: 0, terakhir: new Map() });

function periksa(j: Jejak, id: string, p: Titik, sisi: "bot" | "anggota") {
  const lama = j.terakhir.get(id);
  if (lama && segmenMenembus(lama, p, SEKAT2)) j.menembus++;
  const r = ruangDi(p[0], p[1]);
  if (!r) j.keluar++;
  else if (r.sisi !== sisi) j.salahSisi++;
  const t = Math.floor(p[1]) * LEBAR_DUNIA + Math.floor(p[0]);
  if (TERHALANG2.has(t) && !BOLEH.has(t)) j.terhalang++;
  j.terakhir.set(id, p);
}
const bersih = (j: Jejak) => j.menembus === 0 && j.keluar === 0 && j.salahSisi === 0 && j.terhalang === 0;

function jalankanBot(sim: SimulasiBot, detik: number, j: Jejak, tiap?: () => void, langkah = 0.05) {
  for (let i = 0; i < Math.round(detik / langkah); i++) {
    sim.maju(langkah, langkah);
    for (const b of sim.bots) periksa(j, b.id, [b.x, b.y], "bot");
    periksa(j, "nara", [sim.nara.x, sim.nara.y], "bot");
    tiap?.();
  }
}
const buatBots = (punya: boolean[]): BotContoh[] => BOT_CONTOH.map((b, i) => ({ ...b, punyaOtak: punya[i] ?? true }));
const bot = (sim: SimulasiBot, id: string) => sim.bots.find((b) => b.id === id)!;
const acak = () => 0.1;

// ============================================================
console.log("\n[A] Kontrak DENAH_SIM_V2");
{
  const d = DENAH_SIM_V2.bot;
  for (const t of ["cari", "edit", "posting", "istirahat", "rapat", "tidur"] as const) {
    const n = t === "rapat" || t === "tidur" ? d.kapasitas[t] : d.kursiPerTahap[t];
    for (let i = 0; i < n; i++) {
      const masuk = d.jalanMasuk(t, i);
      const kursi = d.titikKursi(t, i);
      cek(`jalanMasuk ${t}#${i} berakhir tepat di kursi`, dekat(masuk[masuk.length - 1]!, kursi));
      const keluar = [...d.jalanKeluar(t, i), d.titikTengah];
      let a = kursi, sah = true;
      for (const p of keluar) { if (segmenMenembus(a, p, SEKAT2)) sah = false; a = p; }
      cek(`jalanKeluar ${t}#${i} + titik tengah sah`, sah);
    }
  }
  cek("kapasitas & kursi", d.kapasitas.rapat === 3 && d.kapasitas.tidur === 3 && d.kursiPerTahap.istirahat === 2 && d.kursiPerTahap.cari === 1);
  cek("nama tempat v2", d.namaTempat("tidur") === "ruang istirahat" && d.namaTempat("cari") === "meja pencarian");
  const n = DENAH_SIM_V2.nara;
  cek("Nara: meja→papan berakhir di papan", dekat(n.mejaKePapan().at(-1)!, PAPAN_TUGAS2.titik));
  cek("Nara: meja→rapat berakhir di kursinya", dekat(n.mejaKeRapat().at(-1)!, KURSI_NARA_RAPAT2.titik));
  cek("Nara: rapat→meja berakhir di kursi meja", dekat(n.rapatKeMeja().at(-1)!, MEJA_KOORDINATOR2.kursi.titik));
  for (const [nama, posisi] of [["meja cari", STASIUN2.cari[0]!.titik], ["sofa", STASIUN2.istirahat[1]!.titik], ["rapat", KURSI_RAPAT2[2]!.titik], ["kasur", KASUR2[1]!.berdiri]] as [string, Titik][]) {
    const j = n.papanKeBot({ x: posisi[0], y: posisi[1] });
    const serah = j.at(-1)!;
    cek(`Nara: titik serah dekat bot di ${nama} (≤ 1,9 tile) & satu sisi`, Math.hypot(serah[0] - posisi[0], serah[1] - posisi[1]) <= 1.9 && ruangDi(serah[0], serah[1])?.sisi === "bot", serah);
  }
  const p = DENAH_SIM_V2.penghuni;
  cek("penghuni: pintu & slot", dekat(p.pintuMasuk, PINTU_MASUK2) && p.slotAula.length === SLOT_AULA2.length);
  cek("penghuni: jalan ke stasiun berakhir di titiknya", Object.values(p.stasiun).flat().every((s) => dekat(p.jalanKeStasiun(SLOT_AULA2[3]!, s).at(-1)!, s.titik)));
  cek("hasil jalan berupa salinan (mutasi tidak merusak cache)", (() => { const a = d.jalanMasuk("cari", 0); a.length = 0; return d.jalanMasuk("cari", 0).length > 0; })());
}

// ============================================================
console.log("\n[B] Bot mode contoh di denah v2");
{
  const sim = new SimulasiBot(buatBots([true, true, false]), { kuotaAwal: {}, maksKuota: 3, acak, denah: DENAH_SIM_V2 });
  const j = jejakBaru();
  const pernahKerja = new Set<string>();
  jalankanBot(sim, 45, j, () => {
    for (const b of sim.bots) if (b.keadaan === "bekerja" && ["cari", "edit", "posting"].includes(b.tempat)) pernahKerja.add(b.id);
  });
  const dimas = bot(sim, "bot3");
  cek("bot tanpa key tidur di kasur ke-3", sim.tidurDi(2)?.id === "bot3" && dimas.tempat === "tidur");
  cek("bot tanpa key berdiri tepat di sisi kasurnya", dekat([dimas.x, dimas.y], KASUR2[2]!.berdiri));
  cek("bot berkunci bekerja di meja", pernahKerja.has("bot1") && pernahKerja.has("bot2") && !pernahKerja.has("bot3"));
  cek("45 dtk: tak menembus sekat / keluar / salah sisi / menabrak perabot", bersih(j), j);

  sim.setRapat(true);
  jalankanBot(sim, 60, j);
  const rapat = sim.bots.filter((b) => b.tempat === "rapat" && b.keadaan === "bekerja");
  cek("rapat: bot berkunci duduk di kursi rapat", rapat.length === 2 && rapat.every((b) => KURSI_RAPAT2.some((k) => dekat([b.x, b.y], k.titik))), rapat.map((b) => [b.x, b.y]));
  cek("rapat: Nara duduk di kursinya di ruang meeting", sim.nara.keadaan === "rapat" && dekat([sim.nara.x, sim.nara.y], KURSI_NARA_RAPAT2.titik));
  cek("rapat: perjalanan bersih", bersih(j), j);
  sim.setRapat(false);
  jalankanBot(sim, 60, j);
  cek("rapat bubar: Nara kembali tepat di kursi mejanya", sim.nara.keadaan === "meja" && dekat([sim.nara.x, sim.nara.y], MEJA_KOORDINATOR2.kursi.titik));
  cek("rapat bubar: tak ada bot di ruang meeting", sim.bots.every((b) => zonaDari2(b.x, b.y) !== "meeting"));
  cek("rapat bubar: perjalanan bersih", bersih(j), j);

  sim.setPunyaOtak("bot3", true);
  let bangunKerja = false;
  jalankanBot(sim, 60, j, () => { const d = bot(sim, "bot3"); if (d.keadaan === "bekerja" && ["cari", "edit", "posting"].includes(d.tempat)) bangunKerja = true; });
  cek("key terpasang: bot bangun lalu bekerja di meja", bangunKerja && sim.tidurDi(2) === null);
  sim.setPunyaOtak("bot1", false);
  jalankanBot(sim, 40, j);
  cek("key dicabut: bot ke kasur nomornya", sim.tidurDi(0)?.id === "bot1");
  cek("keseluruhan 265 dtk tetap bersih", bersih(j), j);
}

// ============================================================
console.log("\n[C] Bot mode data nyata (diam) di denah v2");
{
  const sim = new SimulasiBot(buatBots([true, true, true]), {
    kuotaAwal: {}, maksKuota: 3, diam: true, denah: DENAH_SIM_V2,
    sasaranAwal: { bot1: { tempat: "edit", teks: "Mengedit: Banjir" } },
  });
  const j = jejakBaru();
  cek("letak awal: bot1 tepat di kursi meja edit", dekat([bot(sim, "bot1").x, bot(sim, "bot1").y], STASIUN2.edit[0]!.titik) && bot(sim, "bot1").keadaan === "bekerja");
  cek("letak awal: dua bot lain di sofa", ["bot2", "bot3"].every((id) => STASIUN2.istirahat.some((s) => dekat([bot(sim, id).x, bot(sim, id).y], s.titik))));
  sim.setSasaran({ bot1: { tempat: "posting", teks: "Memposting" }, bot2: { tempat: "cari", teks: "Mencari" } });
  jalankanBot(sim, 25, j);
  cek("sasaran berubah: bot1 tiba di meja posting", dekat([bot(sim, "bot1").x, bot(sim, "bot1").y], STASIUN2.posting[0]!.titik) && bot(sim, "bot1").keadaan === "bekerja");
  cek("sasaran berubah: bot2 tiba di meja cari", dekat([bot(sim, "bot2").x, bot(sim, "bot2").y], STASIUN2.cari[0]!.titik));
  cek("perpindahan mode nyata bersih", bersih(j), j);

  // Nara mengantar surat tugas ke bot1 (di meja posting)
  sim.nara.antar({ id: 7, botId: "bot1", judul: "Banjir Pantura" });
  let diPapan = false, adaKertas = false, kabar = "";
  jalankanBot(sim, 40, j, () => {
    if (sim.nara.keadaan === "tempel" && dekat([sim.nara.x, sim.nara.y], PAPAN_TUGAS2.titik)) diPapan = true;
    if (sim.nara.kertas) adaKertas = true;
    const t = sim.teksTampil(bot(sim, "bot1"));
    if (t.startsWith("Tugas baru")) kabar = t;
  });
  cek("Nara menempel di papan tugas (tepat di titiknya)", diPapan);
  cek("Nara menyerahkan surat (kertas melayang) & bot menerima kabar", adaKertas && kabar.includes("Banjir Pantura"), kabar);
  cek("Nara pulang tepat ke kursi mejanya", sim.nara.keadaan === "meja" && dekat([sim.nara.x, sim.nara.y], MEJA_KOORDINATOR2.kursi.titik));
  cek("perjalanan Nara bersih", bersih(j), j);
}

// ============================================================
console.log("\n[D] Penghuni (anggota online) di denah v2");
{
  const T0 = Date.parse("2026-10-16T03:00:00Z");
  let jam = T0;
  const akt = (o: Partial<AktivitasDunia> = {}): AktivitasDunia => ({
    id: "abc", jenis: "stok_tambah", anim: "rak", label: "Tambah ke Stok", ringkasan: "", judul: "", akun: "", platform: "", mulai: jam, berjalan: true, akhir: null, ...o,
  });
  const orang = (id: number, a: AktivitasDunia | null = null): PenghuniDunia => ({
    id, nama: `Orang ${id}`, username: `u${id}`, divisi: "Divisi TV", role: "anggota", avatar_url: "", layar: "tvrku", layar_label: "TVR Saya", karakter: karakterDariId(id), aktivitas: a,
  });
  const sim = new SimulasiPenghuni({ sekarangMs: () => jam, denah: DENAH_SIM_V2.penghuni });
  const j = jejakBaru();
  const jalan = (detik: number, tiap?: () => void) => {
    for (let i = 0; i < Math.round(detik / 0.05); i++) {
      jam += 50;
      sim.maju(0.05);
      for (const p of sim.penghuni) periksa(j, `p${p.id}`, [p.x, p.y], "anggota");
      tiap?.();
    }
  };
  const p = (id: number) => sim.penghuni.find((x) => x.id === id);

  sim.setDaftar([orang(1), orang(2), orang(3)], jam, jam);
  cek("orang baru muncul di pintu masuk", sim.penghuni.every((x) => dekat([x.x, x.y], PINTU_MASUK2, 1e-6)));
  jalan(15);
  cek("semua tiba di slot aula masing-masing", sim.penghuni.every((x) => x.keadaan === "diam" && dekat([x.x, x.y], SLOT_AULA2[x.slot]!)));

  const jenisUji: [number, AktivitasDunia["anim"], keyof typeof STASIUN_PENGHUNI2][] = [[1, "rak", "rak"], [2, "autoedit", "autoedit"], [3, "kotak_post", "kotak_post"]];
  sim.setDaftar(jenisUji.map(([id, anim]) => orang(id, akt({ anim, mulai: jam }))), jam, jam);
  jalan(30);
  for (const [id, , jenis] of jenisUji) {
    const x = p(id)!;
    cek(`orang ${id} bekerja tepat di stasiun ${jenis}`, x.keadaan === "kerja" && x.stasiun?.jenis === jenis && STASIUN_PENGHUNI2[jenis].some((s) => dekat([x.x, x.y], s.titik)), [x.keadaan, x.x, x.y]);
  }
  cek("stasiun menyala (penghuniDi & adaYangBekerja)", sim.adaYangBekerja("rak") && sim.adaYangBekerja("autoedit") && !sim.adaYangBekerja("blur"));

  sim.setDaftar([orang(1), orang(2), orang(3)], jam, jam);
  jalan(35);
  cek("aksi selesai: semua kembali ke slot aulanya", sim.penghuni.every((x) => x.keadaan === "diam" && dekat([x.x, x.y], SLOT_AULA2[x.slot]!)));

  for (const [anim, jenis] of [["kompres", "kompres"], ["blur", "blur"]] as const) {
    sim.setDaftar([orang(1, akt({ anim, mulai: jam })), orang(2), orang(3)], jam, jam);
    jalan(30);
    cek(`orang 1 tiba di mesin ${jenis}`, p(1)!.keadaan === "kerja" && STASIUN_PENGHUNI2[jenis].some((s) => dekat([p(1)!.x, p(1)!.y], s.titik)));
  }

  // Ramai di kotak post: hanya 3 tempat; sisanya antre di aula
  const ramai = [10, 11, 12, 13, 14].map((id) => orang(id, akt({ anim: "kotak_post", mulai: jam })));
  sim.setDaftar([orang(1), orang(2), orang(3), ...ramai], jam, jam);
  jalan(40);
  const diKotak = sim.penghuni.filter((x) => x.keadaan === "kerja" && x.stasiun?.jenis === "kotak_post");
  cek("kotak post penuh: tepat 3 yang memakai, lainnya antre", diKotak.length === 3 && sim.penghuni.filter((x) => x.teks.startsWith("Antre")).length === 2);

  // Pergi: tidak lagi online → berjalan ke pintu lalu hilang
  sim.setDaftar([orang(1)], jam, jam);
  jalan(70);
  cek("yang tidak online lagi pergi lewat pintu masuk & hilang", sim.penghuni.length === 1 && sim.penghuni[0]!.id === 1);
  cek("semua gerak penghuni bersih (sekat / sisi / perabot)", bersih(j), j);
  cek("titik tengah bot tidak pernah dilewati penghuni", j.salahSisi === 0 && TITIK_TENGAH2[0] < 10);
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
