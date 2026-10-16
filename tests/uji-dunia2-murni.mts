// Uji PENGGAMBAR DUNIA v2 RUANG BOT (16 Okt 2026) — logika murni dunia2-murni.ts
// + rupa bot/Nara (karakter-murni). Tanpa DOM / jaringan.
// Jalankan: npx tsx tests/uji-dunia2-murni.mts
import fs from "node:fs";
import {
  BATAS2,
  DALAM_DUNIA,
  KASUR2,
  KURSI_NARA_RAPAT2,
  KURSI_RAPAT2,
  LEBAR_DUNIA,
  MEJA_KOORDINATOR2,
  PERABOT2,
  PINTU2,
  RUANG2,
  STASIUN2,
  STASIUN_PENGHUNI2,
  ruangDi,
} from "@/features/ruang-bot/denah2";
import {
  KUSEN2,
  LEBAR_LATAR,
  RUAS_SEKAT2,
  SEMUA_DUDUK,
  TINGGI_LATAR,
  arahDariBadan,
  cariDuduk,
  dariLayar,
  dindingUtuh,
  frameKeadaan,
  keLayar,
  poseKarakter,
  TINGGI_DINDING_RENDAH,
  TINGGI_PINTU,
  URUT_RUANG2,
  diCelahPintu,
  kunciLapis,
  lapisDi,
  pemilikPintu,
  pikselDindingDalam,
  dekatiKamera,
  jepitKamera,
  latarKeWadah,
  petaRupaAnggota,
  poseTidur,
  pusatRuang,
  skalaPas,
  skalaRuang,
  terlihatDiKamera,
  zoomDiJangkar,
  ZOOM_MAKS2,
  rupaAnggota,
  type StatusPerabot,
} from "@/features/ruang-bot/dunia2-murni";
import { karakterDariId, type PenghuniDunia } from "@/lib/dunia-murni";
import { duniaUmum, penghuniUmum } from "@/lib/ruang-umum-murni";
import { BOT_CONTOH } from "@/features/ruang-bot/data-contoh";
import { KONFIG_NARA, KULIT, PRESET, WARNA_ATASAN, konfigBawaan, konfigDariRupaBot, samaKonfig, validasiKonfig, warnaTerdekat } from "@/lib/karakter-murni";

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
const dekat = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;

const mRuang = JSON.parse(fs.readFileSync("public/ruang/v1/manifest.json", "utf8"));
const mPerabot = JSON.parse(fs.readFileSync("public/perabot/v1/manifest.json", "utf8"));

console.log("Proyeksi");
{
  const titik: [number, number][] = [[0, 0], [LEBAR_DUNIA, 0], [0, DALAM_DUNIA], [LEBAR_DUNIA, DALAM_DUNIA], [13.37, 7.25], [38.8, 0.8]];
  cek("keLayar ↔ dariLayar bolak-balik", titik.every(([x, y]) => {
    const p = keLayar(x, y);
    const [x2, y2] = dariLayar(p.x, p.y);
    return dekat(x, x2) && dekat(y, y2);
  }));
  cek("tile 64×32: +x = (+32, +16), +y = (−32, +16)", (() => {
    const o = keLayar(5, 5), a = keLayar(6, 5), b = keLayar(5, 6);
    return a.x - o.x === 32 && a.y - o.y === 16 && b.x - o.x === -32 && b.y - o.y === 16;
  })());
  cek("z menaikkan titik layar", keLayar(3, 3, 40).y === keLayar(3, 3).y - 40 && keLayar(3, 3, 40).x === keLayar(3, 3).x);
  const sudut = [keLayar(0, 0), keLayar(LEBAR_DUNIA, 0), keLayar(0, DALAM_DUNIA), keLayar(LEBAR_DUNIA, DALAM_DUNIA)];
  cek("lantai gedung di dalam latar (pinggir ≥ 60 px kiri/kanan)", sudut.every((p) => p.x >= 60 && p.x <= LEBAR_LATAR - 60 && p.y >= 0 && p.y <= TINGGI_LATAR - 60), sudut);
  cek("ruang atas cukup untuk dinding belakang (≥ 200 px)", keLayar(0, 0).y >= 200);
  cek("ukuran latar bulat & wajar", Number.isInteger(LEBAR_LATAR) && Number.isInteger(TINGGI_LATAR) && LEBAR_LATAR === 60 * 32 + 120, { LEBAR_LATAR, TINGGI_LATAR });
  cek("modul ruang muat di latar (sudutBelakang dalam batas)", RUANG2.every((r) => {
    const m = mRuang.ruang[r.modul];
    const s = keLayar(r.x, r.y);
    const kiri = s.x - m.sudutBelakang.x, atas = s.y - m.sudutBelakang.y;
    return kiri >= 0 && atas >= 0 && kiri + m.kanvas.width <= LEBAR_LATAR && atas + m.kanvas.height <= TINGGI_LATAR;
  }));
}

console.log("Arah & pose");
cek("arahDariBadan: depan kanan SE, depan kiri SW, belakang kanan NE, belakang kiri NW",
  arahDariBadan(1, false) === "SE" && arahDariBadan(-1, false) === "SW" && arahDariBadan(1, true) === "NE" && arahDariBadan(-1, true) === "NW");
cek("SEMUA_DUDUK memuat semua stasiun bot & anggota", [...Object.values(STASIUN2).flat(), ...KURSI_RAPAT2, KURSI_NARA_RAPAT2, MEJA_KOORDINATOR2.kursi, ...Object.values(STASIUN_PENGHUNI2).flat()].every((d) => SEMUA_DUDUK.includes(d)));
cek("SEMUA_DUDUK: tidak ada dua dudukan bertumpuk (cariDuduk tak ambigu)", SEMUA_DUDUK.every((a, i) => SEMUA_DUDUK.every((b, j) => i === j || Math.hypot(a.titik[0] - b.titik[0], a.titik[1] - b.titik[1]) >= 0.1)));
cek("cariDuduk menemukan kursi Nara rapat", cariDuduk(KURSI_NARA_RAPAT2.titik[0], KURSI_NARA_RAPAT2.titik[1]) === KURSI_NARA_RAPAT2);
cek("cariDuduk toleran 0.04, tidak 0.2", cariDuduk(KURSI_NARA_RAPAT2.titik[0] + 0.04, KURSI_NARA_RAPAT2.titik[1]) === KURSI_NARA_RAPAT2 && cariDuduk(KURSI_NARA_RAPAT2.titik[0] + 0.2, KURSI_NARA_RAPAT2.titik[1]) === null);
cek("cariDuduk null di lorong", cariDuduk(5.5, 6.5) === null);
{
  const meja = STASIUN2.cari[0]!;
  const p = poseKarakter({ x: meja.titik[0], y: meja.titik[1], arah: -1, belakang: false }, false);
  cek("di meja bot: work menghadap arah meja", p.anim === "work" && p.arah === meja.arah && p.duduk === meja, p);
  const pj = poseKarakter({ x: meja.titik[0], y: meja.titik[1], arah: 1, belakang: true }, true);
  cek("berjalan menimpa dudukan: walk NE", pj.anim === "walk" && pj.arah === "NE" && pj.duduk === null, pj);
  const pk = poseKarakter({ x: MEJA_KOORDINATOR2.kursi.titik[0], y: MEJA_KOORDINATOR2.kursi.titik[1], arah: 1, belakang: false }, false);
  cek("kursi koordinator: sit di depan perabot", pk.anim === (MEJA_KOORDINATOR2.kursi.pose === "kerja" ? "work" : "sit") && pk.duduk?.depanPerabot === true, pk);
  const pr = poseKarakter({ x: KURSI_RAPAT2[0]!.titik[0], y: KURSI_RAPAT2[0]!.titik[1], arah: -1, belakang: false }, false);
  cek("kursi rapat: sit SE", pr.anim === "sit" && pr.arah === "SE", pr);
  const pd = poseKarakter({ x: 5.5, y: 6.5, arah: -1, belakang: true }, false);
  cek("diam di lorong: idle arah terakhir", pd.anim === "idle" && pd.arah === "NW" && pd.duduk === null, pd);
  const sofa = STASIUN2.istirahat?.[0];
  if (sofa) {
    const ps = poseKarakter({ x: sofa.titik[0], y: sofa.titik[1], arah: 1, belakang: false }, false);
    cek("sofa istirahat: sit", ps.anim === "sit" && ps.arah === sofa.arah, ps);
  }
}
cek("poseTidur: tiap kasur → titik baring, sit SE di depan", KASUR2.every((k, i) => {
  const t = poseTidur(i);
  return t.titik === k.baring && t.pose.anim === "sit" && t.pose.arah === "SE" && t.pose.duduk?.depanPerabot === true;
}));
cek("poseTidur indeks liar → kasur 0", poseTidur(99).titik === KASUR2[0]!.baring);

console.log("Perabot beranimasi");
{
  const diam: StatusPerabot = { mejaSibuk: () => false, stasiunSibuk: () => false };
  const sibuk: StatusPerabot = { mejaSibuk: () => true, stasiunSibuk: () => true };
  const keadaan = (sprite: string): string[] => mPerabot.benda[sprite]?.keadaan ?? [];
  const berKunci = PERABOT2.filter((p) => p.kunci);
  const beranimasi = /^(meja:(cari|edit|posting|pos)|(rak|autoedit|blur|kompres|kotak_post):\d+)$/;
  const animasi = berKunci.filter((p) => beranimasi.test(p.kunci!));
  cek("perabot beranimasi lengkap: 3 meja bot + meja pos, 6 rak, 2 autoedit/blur/kompres, 3 kotak post", animasi.length === 4 + 6 + 2 + 2 + 2 + 3, animasi.map((p) => p.kunci));
  cek("perabot beranimasi punya 4 keadaan di manifest", animasi.every((p) => keadaan(p.sprite).length === 4), animasi.filter((p) => keadaan(p.sprite).length !== 4).map((p) => p.kunci));
  cek("perabot berkunci statis (koordinator, kasur, layar) selalu frame 0", berKunci.filter((p) => !beranimasi.test(p.kunci!)).every((p) => frameKeadaan(p.kunci!, sibuk, 777) === 0));
  const dalamBatas = berKunci.every((p) => {
    for (let t = 0; t < 4000; t += 37) {
      for (const s of [diam, sibuk]) {
        const f = frameKeadaan(p.kunci!, s, t);
        const n = keadaan(p.sprite).length || 1;
        if (!Number.isInteger(f) || f < 0 || f >= n) return false;
      }
    }
    return true;
  });
  cek("indeks frame selalu dalam jumlah keadaan", dalamBatas);
  cek("meja diam = mati(0)", ["meja:cari", "meja:edit", "meja:posting", "meja:pos"].every((k) => frameKeadaan(k, diam, 1234) === 0));
  cek("meja sibuk = cari/edit/unggah", frameKeadaan("meja:cari", sibuk, 0) === 1 && frameKeadaan("meja:edit", sibuk, 0) === 2 && frameKeadaan("meja:posting", sibuk, 0) === 3);
  cek("meja hanya menyala bila tahapnya sendiri sibuk", frameKeadaan("meja:edit", { ...diam, mejaSibuk: (t) => t === "cari" }, 0) === 0 && frameKeadaan("meja:cari", { ...diam, mejaSibuk: (t) => t === "cari" }, 0) === 1);
  cek("meja pos unggah bila salah satu kotak post dipakai", frameKeadaan("meja:pos", { ...diam, stasiunSibuk: (j, i) => j === "kotak_post" && i === 2 }, 0) === 3);
  cek("rak diam = separuh(1); sibuk penuh ↔ kedip", frameKeadaan("rak:0", diam, 0) === 1 && frameKeadaan("rak:0", sibuk, 0) === 2 && frameKeadaan("rak:0", sibuk, 420) === 3 && frameKeadaan("rak:0", sibuk, 840) === 2);
  cek("rak per indeks", frameKeadaan("rak:3", { ...diam, stasiunSibuk: (j, i) => j === "rak" && i === 3 }, 0) === 2 && frameKeadaan("rak:2", { ...diam, stasiunSibuk: (j, i) => j === "rak" && i === 3 }, 0) === 1);
  cek("mesin autoedit/kompres berputar 1→2→3", [0, 260, 520, 780].map((t) => frameKeadaan("autoedit:1", sibuk, t)).join() === "1,2,3,1" && frameKeadaan("kompres:0", sibuk, 260) === 2);
  cek("mesin diam = mati(0)", frameKeadaan("autoedit:0", diam, 999) === 0 && frameKeadaan("blur:1", diam, 999) === 0 && frameKeadaan("kompres:1", diam, 999) === 0);
  cek("blur berputar jalan_1 ↔ jalan_2 (tanpa selesai)", [0, 300, 600].map((t) => frameKeadaan("blur:0", sibuk, t)).join() === "1,2,1");
  cek("kotak post buka → masuk → terkirim", [0, 500, 1000, 1500].map((t) => frameKeadaan("kotak_post:1", sibuk, t)).join() === "1,2,3,1");
  cek("kunci asing / layar = 0", frameKeadaan("layar:rapat", sibuk, 0) === 0 && frameKeadaan("pot:x", sibuk, 0) === 0 && frameKeadaan("tanpa", sibuk, 0) === 0);
  cek("manifest: urutan keadaan sesuai tafsiran", keadaan("rak_server").join() === "kosong,separuh,penuh,penuh_kedip" && keadaan("meja_monitor").join() === "mati,cari,edit,unggah" && keadaan("kotak_post").join() === "tutup,buka,masuk,terkirim" && keadaan("mesin_blur")[3] === "selesai");
}

console.log("Dinding & sekat");
{
  const r = (k: string) => RUANG2.find((x) => x.kunci === k)!;
  cek("kerja: dinding kiri & kanan luar utuh", [0.5, 5, 9.5].every((t) => dindingUtuh(r("kerja"), "kiri", t) && dindingUtuh(r("kerja"), "kanan", t)));
  cek("meeting: dinding kiri y<3 utuh (di balik = lorong luar koordinator)", [0.2, 1.5, 2.9].every((t) => dindingUtuh(r("meeting"), "kiri", t)));
  cek("meeting: dinding kiri y≥3 diturunkan (berbatasan koordinator)", [3.1, 6, 9.9].every((t) => !dindingUtuh(r("meeting"), "kiri", t)));
  cek("koordinator: dinding kiri diturunkan (berbatasan kerja)", [3.5, 9.5].every((t) => !dindingUtuh(r("koordinator"), "kiri", t)));
  cek("koordinator: dinding kanan (y=3) utuh — di belakangnya halaman", [10.5, 19.5].every((t) => dindingUtuh(r("koordinator"), "kanan", t)));
  cek("aula: dinding kanan luar utuh, kiri diturunkan", dindingUtuh(r("aula"), "kanan", 35) && !dindingUtuh(r("aula"), "kiri", 5));
  cek("baris depan: dinding kanan diturunkan, istirahat kiri utuh", ["database", "alat", "pos", "istirahat"].every((k) => !dindingUtuh(r(k), "kanan", r(k).x + 5)) && dindingUtuh(r("istirahat"), "kiri", 15));
  cek("flag potong sesuai dindingUtuh (ada sisi yang diturunkan ⇔ potong)", RUANG2.every((x) => {
    const adaKiri = Array.from({ length: x.d * 4 }, (_, i) => !dindingUtuh(x, "kiri", x.y + (i + 0.5) / 4)).some(Boolean);
    const adaKanan = Array.from({ length: x.w * 4 }, (_, i) => !dindingUtuh(x, "kanan", x.x + (i + 0.5) / 4)).some(Boolean);
    return adaKiri === x.potongKiri && adaKanan === x.potongKanan;
  }), RUANG2.map((x) => x.kunci));
  cek("ruas sekat: semua di dalam gedung, antar dua ruang berbeda", RUAS_SEKAT2.length > 0 && RUAS_SEKAT2.every((s) => {
    const t = (s.dari + s.sampai) / 2;
    const [a, b] = s.sumbu === "x" ? [ruangDi(s.pada - 0.5, t), ruangDi(s.pada + 0.5, t)] : [ruangDi(t, s.pada - 0.5), ruangDi(t, s.pada + 0.5)];
    return !!a && !!b && a !== b;
  }));
  cek("ruas sekat: kunci = jumlah tengah ruas", RUAS_SEKAT2.every((s) => dekat(s.kunci, s.sumbu === "x" ? s.pada + (s.dari + s.sampai) / 2 : s.pada + (s.dari + s.sampai) / 2)));
  cek("ruas sekat tidak menutup celah pintu", RUAS_SEKAT2.every((s) => !PINTU2.some((p) => p.sumbu === s.sumbu && p.pada === s.pada && (s.dari + s.sampai) / 2 > p.dari && (s.dari + s.sampai) / 2 < p.sampai)));
  cek("kusen: 2 tiang per pintu, di ujung celah", KUSEN2.length === PINTU2.length * 2 && PINTU2.every((p, i) => {
    const [a, b] = [KUSEN2[i * 2]!, KUSEN2[i * 2 + 1]!];
    const sumbu = p.sumbu === "x" ? 0 : 1;
    return a.titik[sumbu] === p.pada && b.titik[sumbu] === p.pada && a.titik[1 - sumbu] === p.dari && b.titik[1 - sumbu] === p.sampai;
  }));
  cek("kusen: kunci = x+y+0.02 (di depan sekat di titik yang sama)", KUSEN2.every((k) => dekat(k.kunci, k.titik[0] + k.titik[1] + 0.02)));
}

console.log("Rupa bot & Nara");
cek("KONFIG_NARA valid katalog", validasiKonfig(KONFIG_NARA).ok, validasiKonfig(KONFIG_NARA));
cek("rupa semua bot contoh → konfig valid", BOT_CONTOH.every((b) => validasiKonfig(konfigDariRupaBot(b.rupa)).ok), BOT_CONTOH.map((b) => validasiKonfig(konfigDariRupaBot(b.rupa))));
cek("warnaTerdekat: warna katalog → dirinya sendiri", KULIT.every(([h]) => warnaTerdekat(KULIT, h) === h) && WARNA_ATASAN.every(([h]) => warnaTerdekat(WARNA_ATASAN, h) === h));
cek("warnaTerdekat: hasil selalu dari katalog", ["#000000", "#ffffff", "#ff00ff", "#123456"].every((h) => WARNA_ATASAN.some(([w]) => w === warnaTerdekat(WARNA_ATASAN, h))));
{
  const dasar = { kaus: "#3b82f6", celana: "#1f2937", kulit: "#c68642", rambut: "#2b1d14" };
  cek("gaya rambut bot → rambut berbeda", new Set((["pendek", "panjang", "topi"] as const).map((g) => konfigDariRupaBot({ ...dasar, gayaRambut: g }).rambut)).size === 3);
  cek("bot berhud → atasan hoodie(4)", konfigDariRupaBot({ ...dasar, gayaRambut: "pendek", berhud: true }).atasan === 4 && konfigDariRupaBot({ ...dasar, gayaRambut: "pendek" }).atasan === 1);
  cek("kaus biru → warna atasan kebiruan", (() => {
    const h = konfigDariRupaBot({ ...dasar, gayaRambut: "pendek" }).warnaAtasan;
    const n = parseInt(h.slice(1), 16);
    return (n & 255) > ((n >> 16) & 255);
  })());
}

console.log("Rupa anggota (Karakter Saya di status dunia)");
{
  const rA = PRESET[0]!.konfig, rB = PRESET[1]!.konfig, rC = PRESET[2]!.konfig;
  const orang = (id: number, rupa?: typeof rA): PenghuniDunia => ({
    id, nama: `Orang ${id}`, username: `u${id}`, divisi: "Divisi TV", role: "anggota", avatar_url: "x.png", layar: "tvrku", layar_label: "TVR Saya",
    karakter: karakterDariId(id), aktivitas: null, ...(rupa ? { rupa } : {}),
  });
  const peta = petaRupaAnggota([orang(4, rA), orang(7), orang(9, rB)]);
  cek("peta: hanya yang punya rupa tersimpan", peta.size === 2 && peta.get(4) === rA && peta.get(9) === rB && !peta.has(7));
  cek("rupaAnggota: tersimpan, atau bawaan stabil", rupaAnggota(peta, 4) === rA && samaKonfig(rupaAnggota(peta, 7), konfigBawaan(7)));
  const petaSaya = petaRupaAnggota([orang(4, rA), orang(7)], 4, rC);
  cek("rupa sendiri yang baru disimpan menimpa status lama", petaSaya.get(4) === rC);
  cek("rupa sendiri tampil walau status belum membawa rupa", petaRupaAnggota([orang(7)], 7, rC).get(7) === rC);
  cek("tanpa sayaId: rupaSaya diabaikan", !petaRupaAnggota([orang(7)], undefined, rC).has(7));

  const u = penghuniUmum(orang(4, rA));
  cek("umum: rupa sah dipertahankan (sama isi)", !!u.rupa && samaKonfig(u.rupa, rA));
  cek("umum: sanitasi lain tetap (username/divisi/role/avatar kosong)", u.username === "" && u.divisi === "" && u.role === "" && u.avatar_url === "");
  const palsu = { ...rA, warnaAtasan: "#123457" };
  cek("umum: rupa di luar katalog dibuang", !("rupa" in penghuniUmum({ ...orang(5), rupa: palsu })));
  const ekstra = penghuniUmum({ ...orang(6), rupa: { ...rA, bocor: "rahasia" } as unknown as typeof rA });
  cek("umum: kolom asing di rupa tidak ikut", !!ekstra.rupa && !("bocor" in ekstra.rupa));
  cek("umum: tanpa rupa → tanpa kunci rupa", !("rupa" in penghuniUmum(orang(8))));
  const d = duniaUmum({ waktu: 1, jumlah: 2, terpotong: false, online: [orang(4, rA), orang(7)] });
  cek("duniaUmum meneruskan rupa", samaKonfig(d.online.find((p) => p.id === 4)!.rupa!, rA) && !("rupa" in d.online.find((p) => p.id === 7)!));
}

console.log("Kamera");
{
  const W = 1248, H = 640;
  const pas = skalaPas(W, H);
  cek("Pas: seluruh latar muat", LEBAR_LATAR * pas <= W && TINGGI_LATAR * pas <= H && pas > 0.3, pas);
  cek("Pas wadah 0×0 tidak nol/NaN", skalaPas(0, 0) === 0.15);
  cek("skala ruang desktop bulat (1×), ponsel < 1 tapi ≥ Pas", skalaRuang(W, H) === 1 && skalaRuang(360, 420) < 1 && skalaRuang(360, 420) >= skalaPas(360, 420), [skalaRuang(W, H), skalaRuang(360, 420)]);
  cek("skala ruang wadah besar dijepit 3×", skalaRuang(5000, 4000) === ZOOM_MAKS2);
  const j = jepitKamera({ cx: -500, cy: 99999, s: 9 }, W, H);
  cek("jepit: skala ≤ 3, latar menutupi layar", j.s === ZOOM_MAKS2 && j.cx === W / 2 / j.s && j.cy === TINGGI_LATAR - H / 2 / j.s, j);
  const jp = jepitKamera({ cx: 0, cy: 0, s: 0.01 }, W, H);
  cek("jepit: skala ≥ Pas, latar lebih kecil → di tengah", jp.s === pas && jp.cx === LEBAR_LATAR / 2 && jp.cy === TINGGI_LATAR / 2, jp);
  const k0 = { cx: 900, cy: 600, s: 1 };
  const z = zoomDiJangkar(k0, 2, 300, 200, W, H);
  const a0 = latarKeWadah(k0, (300 - W / 2) / 1 + 900, (200 - H / 2) / 1 + 600, W, H);
  const a1 = latarKeWadah(z, (300 - W / 2) / 1 + 900, (200 - H / 2) / 1 + 600, W, H);
  cek("zoom di jangkar: titik di bawah kursor tetap", dekat(a0.x, a1.x, 1e-6) && dekat(a0.y, a1.y, 1e-6) && z.s === 2);
  let k = { cx: 100, cy: 100, s: 0.4 };
  const tujuan = { cx: 1500, cy: 700, s: 2 };
  let n = 0, selesai = false;
  while (!selesai && n < 600) { const l = dekatiKamera(k, tujuan, 1 / 60); k = l.kamera; selesai = l.selesai; n++; }
  cek("animasi kamera menempel tujuan ±0,4–1 dtk", selesai && k.cx === tujuan.cx && k.s === tujuan.s && n > 15 && n < 70, n);
  const satu = dekatiKamera({ cx: 0, cy: 0, s: 1 }, { cx: 100, cy: 0, s: 4 }, 1 / 60);
  cek("animasi monoton & skala log (bukan linear)", satu.kamera.cx > 0 && satu.kamera.cx < 100 && satu.kamera.s > 1 && satu.kamera.s < 1 + (4 - 1) * (satu.kamera.cx / 100));
  cek("dt 0 tidak bergerak", dekatiKamera({ cx: 5, cy: 5, s: 1 }, { cx: 50, cy: 50, s: 2 }, 0).kamera.cx === 5);
  const kv = { cx: 1000, cy: 600, s: 1 };
  cek("terlihat: pusat ya, jauh tidak", terlihatDiKamera(kv, 1000, 600, W, H) && !terlihatDiKamera(kv, 1000 + W, 600, W, H) && !terlihatDiKamera(kv, 1000 + W / 2 - 10, 600, W, H, 0.1));
  cek("pusat ruang di dalam latar & di atas lantai tengah", RUANG2.every((r) => {
    const c = pusatRuang(r);
    const t = keLayar(r.x + r.w / 2, r.y + r.d / 2);
    return c.x === t.x && c.y === t.y - 60 && c.x > 0 && c.x < LEBAR_LATAR && c.y > 0 && c.y < TINGGI_LATAR;
  }));
}

console.log("Dinding dalam & lapisan ruang");
{
  const r = (k: string) => RUANG2.find((x) => x.kunci === k)!;
  cek("celah pintu: koordinator kiri y 6..8, bukan 5", diCelahPintu(r("koordinator"), "kiri", 7) && !diCelahPintu(r("koordinator"), "kiri", 5.5) && !diCelahPintu(r("koordinator"), "kanan", 7));
  cek("celah pintu: istirahat kanan x 3..5", diCelahPintu(r("istirahat"), "kanan", 4) && !diCelahPintu(r("istirahat"), "kanan", 6));
  cek("tiap pintu punya pemilik = ruang sisi depan (salah satu ruang 'antara')", PINTU2.every((p) => {
    const o = pemilikPintu(p);
    return !!o && p.antara.includes(o.kunci) && (p.sumbu === "x" ? o.x === p.pada : o.y === p.pada) && (o.potongKiri || o.potongKanan);
  }));
  const k = r("database");
  cek("rendah: piksel di bawah batas simpan, di atas buang", pikselDindingDalam(k, "kiri", 15, 10, "rendah") === "simpan" && pikselDindingDalam(k, "kiri", 15, TINGGI_DINDING_RENDAH + 1, "rendah") === "buang");
  cek("rendah: tutup kayu 3 px + garis atas 1 px", pikselDindingDalam(k, "kiri", 15, TINGGI_DINDING_RENDAH - 2, "rendah") === "tutup" && pikselDindingDalam(k, "kiri", 15, TINGGI_DINDING_RENDAH - 0.5, "rendah") === "garis");
  cek("penuh: setinggi apa pun disimpan", pikselDindingDalam(k, "kiri", 15, 160, "penuh") === "simpan");
  const alat = r("alat");
  cek("pintu dinding penuh: celah di bawah 84 px, ambang di atasnya", pikselDindingDalam(alat, "kiri", 13, 20, "penuh") === "buang" && pikselDindingDalam(alat, "kiri", 13, TINGGI_PINTU + 2, "penuh") === "simpan");
  cek("pintu dinding rendah: celah setinggi dinding", pikselDindingDalam(alat, "kiri", 13, 20, "rendah") === "buang" && pikselDindingDalam(alat, "kiri", 13, TINGGI_DINDING_RENDAH - 2, "rendah") === "buang");
  cek("urutan ruang: 8, unik", URUT_RUANG2.length === 8 && new Set(URUT_RUANG2).size === 8);
  // Setiap batas dalam: ruang pemilik dinding (sisi depan) datang SETELAH ruang di belakangnya.
  cek("tiap dinding dalam: pemilik digambar setelah ruang di baliknya", BATAS2.filter((b) => b.dalam).every((b) => {
    const t = (b.dari + b.sampai) / 2;
    const [belakang, depan] = b.sumbu === "x" ? [ruangDi(b.pada - 0.5, t), ruangDi(b.pada + 0.5, t)] : [ruangDi(t, b.pada - 0.5), ruangDi(t, b.pada + 0.5)];
    return !!belakang && !!depan && URUT_RUANG2.indexOf(belakang) < URUT_RUANG2.indexOf(depan);
  }));
  cek("lapisDi: titik di ruang → indeks ruangnya; halaman kosong → −1; di luar dijepit", lapisDi(5, 5) === URUT_RUANG2.indexOf(r("kerja")) && lapisDi(15, 1) === -1 && lapisDi(-3, 15) === URUT_RUANG2.indexOf(r("istirahat")));
  cek("kunciLapis: lapisan menang atas kedalaman", kunciLapis(1, -900) > kunciLapis(0, 60) && kunciLapis(2, -1) < kunciLapis(2, 0.5));
  cek("semua perabot di dalam ruang (punya lapisan)", PERABOT2.every((p) => lapisDi(p.x + p.tapak[0] / 2, p.y + p.tapak[1] / 2) >= 0));
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
