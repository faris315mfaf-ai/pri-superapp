// Uji DENAH v2 RUANG BOT (16 Okt 2026). Murni — tanpa jaringan.
// Jalankan: npx tsx tests/uji-denah2.mts
import fs from "node:fs";
import { segmenMenembus } from "@/features/ruang-bot/denah";
import {
  BATAS2,
  DALAM_DUNIA,
  KASUR2,
  KURSI_NARA_RAPAT2,
  KURSI_RAPAT2,
  KURSI_TAMU_RAPAT2,
  LABEL_RUANG2,
  LEBAR_DUNIA,
  MEJA_KOORDINATOR2,
  PAPAN_TUGAS2,
  PERABOT2,
  PINTU2,
  PINTU_MASUK2,
  RUANG2,
  SEKAT2,
  SLOT_AULA2,
  STASIUN2,
  STASIUN_PENGHUNI2,
  TEMPAT_ANTRE2,
  TERHALANG2,
  TITIK_TENGAH2,
  arahDariGerak,
  cariJalan,
  garisLewat,
  kedalamanKarakter,
  kedalamanPerabot,
  perabotDudukan,
  ruangDi,
  zonaDari2,
  type Titik,
} from "@/features/ruang-bot/denah2";

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

const mRuang = JSON.parse(fs.readFileSync("public/ruang/v1/manifest.json", "utf8"));
const mPerabot = JSON.parse(fs.readFileSync("public/perabot/v1/manifest.json", "utf8"));
const tile = (p: Titik) => Math.floor(p[1]) * LEBAR_DUNIA + Math.floor(p[0]);

console.log("Ruang");
cek("8 ruang, kunci unik", RUANG2.length === 8 && new Set(RUANG2.map((r) => r.kunci)).size === 8);
cek("ukuran ruang = ukuran modul (manifest ruang)", RUANG2.every((r) => mRuang.ruang[r.modul]?.ukuran.w === r.w && mRuang.ruang[r.modul]?.ukuran.d === r.d),
  RUANG2.map((r) => [r.kunci, r.w, r.d, mRuang.ruang[r.modul]?.ukuran]));
cek("ruang di dalam dunia", RUANG2.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= LEBAR_DUNIA && r.y + r.d <= DALAM_DUNIA));
let tumpang = 0;
for (let j = 0; j < DALAM_DUNIA; j++) for (let i = 0; i < LEBAR_DUNIA; i++) if (RUANG2.filter((r) => i >= r.x && i < r.x + r.w && j >= r.y && j < r.y + r.d).length > 1) tumpang++;
cek("ruang tidak bertumpuk", tumpang === 0, tumpang);
cek("dinding luar utuh tidak dipotong (baris belakang)", RUANG2.filter((r) => r.y === 0 || (r.kunci === "koordinator")).every((r) => !r.potongKanan));
cek("dinding dipotong hanya bila bertetangga ruang lain", RUANG2.every((r) => {
  const kiriTetangga = r.x > 0 && Array.from({ length: r.d }, (_, k) => ruangDi(r.x - 0.5, r.y + k + 0.5)).some(Boolean);
  const kananTetangga = r.y > 0 && Array.from({ length: r.w }, (_, k) => ruangDi(r.x + k + 0.5, r.y - 0.5)).some(Boolean);
  return r.potongKiri === kiriTetangga && r.potongKanan === kananTetangga;
}));
cek("zona pusat ruang benar", RUANG2.every((r) => zonaDari2(r.x + r.w / 2, r.y + r.d / 2) === r.kunci));
cek("area kosong di belakang koordinator bukan ruang", zonaDari2(15, 1) === null);
cek("label di dalam ruangnya", LABEL_RUANG2.every((l) => zonaDari2(l.titik[0], l.titik[1]) === l.kunci));

console.log("Pintu & batas");
cek("tiap pintu tepat di garis antara dua ruangnya", PINTU2.every((p) => {
  const t = (p.dari + p.sampai) / 2;
  const a = p.sumbu === "x" ? zonaDari2(p.pada - 0.5, t) : zonaDari2(t, p.pada - 0.5);
  const b = p.sumbu === "x" ? zonaDari2(p.pada + 0.5, t) : zonaDari2(t, p.pada + 0.5);
  return new Set([a, b]).size === 2 && p.antara.includes(a!) && p.antara.includes(b!);
}));
cek("lebar pintu 2 tile", PINTU2.every((p) => p.sampai - p.dari === 2));
cek("menembus pintu sah", PINTU2.every((p) => {
  const t = (p.dari + p.sampai) / 2;
  const a: Titik = p.sumbu === "x" ? [p.pada - 0.6, t] : [t, p.pada - 0.6];
  const b: Titik = p.sumbu === "x" ? [p.pada + 0.6, t] : [t, p.pada + 0.6];
  return !segmenMenembus(a, b, SEKAT2);
}));
cek("menembus sekat di luar pintu terlarang (juga tepat di sambungan)", !garisLewat([7, 9.5], [7, 10.5]) && !garisLewat([6.5, 9.5], [6.5, 10.5]) && !garisLewat([9.5, 1], [10.5, 1]) && !garisLewat([29.5, 5], [30.5, 5]) && !garisLewat([30, 9.5], [30, 10.5]));
cek("batas luar gedung lengkap (tidak bisa keluar)", !garisLewat([0.5, 5], [-0.5, 5]) && !garisLewat([15, 3.5], [15, 2.5]) && !garisLewat([35, 0.5], [35, -0.5]));
cek("batas dalam ditandai", BATAS2.some((b) => b.dalam) && BATAS2.some((b) => !b.dalam));

console.log("Perabot");
cek("semua sprite ada di manifest perabot", PERABOT2.every((p) => mPerabot.benda[p.sprite]), PERABOT2.filter((p) => !mPerabot.benda[p.sprite]).map((p) => p.sprite));
cek("jejak = manifest", PERABOT2.every((p) => mPerabot.benda[p.sprite]?.tapak.join() === p.tapak.join()), PERABOT2.filter((p) => mPerabot.benda[p.sprite]?.tapak.join() !== p.tapak.join()).map((p) => p.sprite));
cek("jejak di dalam satu ruang", PERABOT2.every((p) => {
  const r = ruangDi(p.x + 0.01, p.y + 0.01);
  return !!r && p.x + p.tapak[0] <= r.x + r.w + 1e-9 && p.y + p.tapak[1] <= r.y + r.d + 1e-9;
}), PERABOT2.filter((p) => { const r = ruangDi(p.x + 0.01, p.y + 0.01); return !r || p.x + p.tapak[0] > r.x + r.w + 1e-9 || p.y + p.tapak[1] > r.y + r.d + 1e-9; }).map((p) => [p.sprite, p.x, p.y]));
const padat = PERABOT2.filter((p) => !p.lewat && !p.datar);
const bertabrak: string[] = [];
for (let a = 0; a < padat.length; a++) for (let b = a + 1; b < padat.length; b++) {
  const p = padat[a]!, q = padat[b]!;
  const lx = Math.min(p.x + p.tapak[0], q.x + q.tapak[0]) - Math.max(p.x, q.x);
  const ly = Math.min(p.y + p.tapak[1], q.y + q.tapak[1]) - Math.max(p.y, q.y);
  if (lx > 1e-9 && ly > 1e-9) bertabrak.push(`${p.sprite}@${p.x},${p.y}×${q.sprite}@${q.x},${q.y}`);
}
cek("perabot padat tidak bertabrakan", bertabrak.length === 0, bertabrak);
const depanPintu: number[] = [];
for (const p of PINTU2) for (let t = p.dari; t < p.sampai; t++) for (const s of [-1, 0]) depanPintu.push(p.sumbu === "x" ? (t * LEBAR_DUNIA + p.pada + s) : ((p.pada + s) * LEBAR_DUNIA + t));
cek("tile di kedua sisi pintu tidak terhalang", depanPintu.every((t) => !TERHALANG2.has(t)));
cek("kunci keadaan unik", new Set(PERABOT2.filter((p) => p.kunci).map((p) => p.kunci)).size === PERABOT2.filter((p) => p.kunci).length);
cek("perabot beranimasi memakai sprite ber-keadaan", PERABOT2.filter((p) => /^(rak|autoedit|kompres|blur|kotak_post):/.test(p.kunci ?? "")).every((p) => mPerabot.benda[p.sprite]?.keadaan?.length === 4));

console.log("Stasiun");
const semuaDuduk = [
  ...Object.values(STASIUN2).flat(), ...KURSI_RAPAT2, KURSI_NARA_RAPAT2, ...KURSI_TAMU_RAPAT2, MEJA_KOORDINATOR2.kursi, PAPAN_TUGAS2,
  ...Object.values(STASIUN_PENGHUNI2).flat(),
];
cek("semua titik duduk/berdiri di dalam ruang", semuaDuduk.every((d) => ruangDi(d.titik[0], d.titik[1])));
cek("arah hadap sah", semuaDuduk.every((d) => ["NW", "NE", "SE", "SW"].includes(d.arah)));
const kursiDiTerhalang = semuaDuduk.filter((d) => TERHALANG2.has(tile(d.titik)) && !STASIUN2.istirahat.includes(d));
cek("titik berdiri tidak di tile terhalang (kecuali dudukan sofa)", kursiDiTerhalang.length === 0, kursiDiTerhalang.map((d) => d.titik));
cek("stasiun bot di sisi bot", [...Object.values(STASIUN2).flat(), ...KURSI_RAPAT2, KURSI_NARA_RAPAT2, MEJA_KOORDINATOR2.kursi, PAPAN_TUGAS2].every((d) => ruangDi(d.titik[0], d.titik[1])!.sisi === "bot"));
cek("stasiun anggota di ruang yang benar", Object.values(STASIUN_PENGHUNI2).flat().every((s) => ({ rak: "database", autoedit: "alat", kompres: "alat", blur: "alat", kotak_post: "pos" } as const)[s.jenis] === zonaDari2(s.titik[0], s.titik[1])));
cek("2 operator tiap mesin, 6 rak, 3 kotak post", STASIUN_PENGHUNI2.autoedit.length === 2 && STASIUN_PENGHUNI2.kompres.length === 2 && STASIUN_PENGHUNI2.blur.length === 2 && STASIUN_PENGHUNI2.rak.length === 6 && STASIUN_PENGHUNI2.kotak_post.length === 3);
cek("kunci perabot stasiun anggota ada", Object.values(STASIUN_PENGHUNI2).flat().every((s) => PERABOT2.some((p) => p.kunci === s.kunciPerabot)));
cek("3 kursi rapat, 3 kasur", KURSI_RAPAT2.length === 3 && KASUR2.length === 3);

console.log("Jalan");
const periksaJalan = (nama: string, a: Titik, b: Titik) => {
  const j = cariJalan(a, b);
  if (!j) return cek(`${nama}: tersambung`, false, { a, b });
  let p = a;
  let sah = true;
  for (const q of j) {
    if (segmenMenembus(p, q, SEKAT2)) sah = false;
    if (!ruangDi(q[0], q[1])) sah = false;
    p = q;
  }
  const akhir = j[j.length - 1]!;
  cek(`${nama}: sah & berakhir tepat`, sah && Math.abs(akhir[0] - b[0]) < 1e-6 && Math.abs(akhir[1] - b[1]) < 1e-6, j);
};
for (const [k, daftar] of Object.entries(STASIUN2)) daftar.forEach((d, i) => { periksaJalan(`tengah→${k}${i}`, TITIK_TENGAH2, d.titik); periksaJalan(`${k}${i}→tengah`, d.titik, TITIK_TENGAH2); });
KURSI_RAPAT2.forEach((d, i) => periksaJalan(`tengah→rapat${i}`, TITIK_TENGAH2, d.titik));
KURSI_TAMU_RAPAT2.forEach((d, i) => periksaJalan(`tengah→tamu${i}`, TITIK_TENGAH2, d.titik));
KASUR2.forEach((k, i) => periksaJalan(`tengah→kasur${i}`, TITIK_TENGAH2, k.berdiri));
periksaJalan("meja Nara→papan", MEJA_KOORDINATOR2.kursi.titik, PAPAN_TUGAS2.titik);
periksaJalan("meja Nara→kerja", MEJA_KOORDINATOR2.kursi.titik, TITIK_TENGAH2);
periksaJalan("meja Nara→rapat", MEJA_KOORDINATOR2.kursi.titik, KURSI_NARA_RAPAT2.titik);
TEMPAT_ANTRE2.forEach((t, i) => periksaJalan(`tengah→antre${i}`, TITIK_TENGAH2, t));
for (const daftar of Object.values(STASIUN_PENGHUNI2)) for (const s of daftar) {
  periksaJalan(`pintu→${s.kunciPerabot}`, PINTU_MASUK2, s.titik);
  periksaJalan(`${s.kunciPerabot}→aula`, s.titik, SLOT_AULA2[0]!);
}
cek("sisi bot & sayap anggota terpisah", cariJalan(TITIK_TENGAH2, PINTU_MASUK2) === null && cariJalan(PINTU_MASUK2, KASUR2[0]!.berdiri) === null);
cek("semua slot aula terjangkau dari pintu masuk", SLOT_AULA2.every((s) => cariJalan(PINTU_MASUK2, s) !== null));
const t0 = performance.now();
let n = 0;
for (const s of Object.values(STASIUN_PENGHUNI2).flat()) for (const a of SLOT_AULA2.slice(0, 10)) { cariJalan(a, s.titik); n++; }
const rata = (performance.now() - t0) / n;
cek(`pencarian jalan cepat (rata-rata ${rata.toFixed(2)} ms)`, rata < 5);

console.log("Aula");
cek(`slot aula ≥ 40 (${SLOT_AULA2.length})`, SLOT_AULA2.length >= 40);
cek("slot aula di aula & tidak terhalang & unik", SLOT_AULA2.every((s) => zonaDari2(s[0], s[1]) === "aula" && !TERHALANG2.has(tile(s))) && new Set(SLOT_AULA2.map((s) => s.join())).size === SLOT_AULA2.length);
cek("pintu masuk di aula, tidak terhalang", zonaDari2(PINTU_MASUK2[0], PINTU_MASUK2[1]) === "aula" && !TERHALANG2.has(tile(PINTU_MASUK2)));

console.log("Urutan gambar");
const sofa = PERABOT2.find((p) => p.sprite === "sofa_sw")!;
const dudukSofa = STASIUN2.istirahat[0]!;
cek("duduk di sofa digambar di depan sofa", kedalamanKarakter(dudukSofa.titik[0], dudukSofa.titik[1], dudukSofa) > kedalamanPerabot(sofa));
const operator = STASIUN2.cari[0]!;
const kursiOperator = perabotDudukan(operator.titik)!;
cek("operator meja di belakang sandaran kursinya", kursiOperator.sprite === "kursi_nw" && kedalamanKarakter(operator.titik[0], operator.titik[1], operator) < kedalamanPerabot(kursiOperator));
const mejaCari = PERABOT2.find((p) => p.kunci === "meja:cari")!;
cek("operator meja di depan mejanya", kedalamanKarakter(operator.titik[0], operator.titik[1], operator) > kedalamanPerabot(mejaCari));
const mejaRapat = PERABOT2.find((p) => p.sprite === "meja_rapat_panjang")!;
const botRapat = KURSI_RAPAT2[1]!;
cek("bot rapat di depan kursinya & di belakang meja rapat", kedalamanKarakter(botRapat.titik[0], botRapat.titik[1], botRapat) > kedalamanPerabot(perabotDudukan(botRapat.titik)!) && kedalamanKarakter(botRapat.titik[0], botRapat.titik[1], botRapat) < kedalamanPerabot(mejaRapat));
cek("Nara rapat di depan meja rapat, di belakang sandaran kursinya", (() => {
  const k = kedalamanKarakter(KURSI_NARA_RAPAT2.titik[0], KURSI_NARA_RAPAT2.titik[1], KURSI_NARA_RAPAT2);
  return k > kedalamanPerabot(mejaRapat) && k < kedalamanPerabot(perabotDudukan(KURSI_NARA_RAPAT2.titik)!);
})());
const mejaNara = PERABOT2.find((p) => p.kunci === "meja:koordinator")!;
const nara = MEJA_KOORDINATOR2.kursi;
cek("Nara di balik meja eksekutif", kedalamanKarakter(nara.titik[0], nara.titik[1], nara) < kedalamanPerabot(mejaNara));
cek("karpet paling belakang", kedalamanPerabot(PERABOT2.find((p) => p.datar)!) < 0);

console.log("Arah");
cek("arah dari gerak", arahDariGerak(1, 0) === "SE" && arahDariGerak(-1, 0) === "NW" && arahDariGerak(0, 1) === "SW" && arahDariGerak(0, -1) === "NE" && arahDariGerak(0, 0, "NE") === "NE");

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
