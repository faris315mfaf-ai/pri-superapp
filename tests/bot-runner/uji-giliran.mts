// Uji mesin giliran runner (13 Okt 2026). Murni: aplikasi, mesin, pemanen, dan
// waktu semuanya PALSU — tanpa jaringan, tanpa yt-dlp.
// Jalankan: npx tsx tests/bot-runner/uji-giliran.mts
import type { JawabanDenyut, LaporanRunner, PerintahRunner, SumberPanen } from "../../src/lib/bot-protokol";
import { GalatApp, GalatMesin } from "../../src/bot-runner/galat";
import { Penjadwal, jalankanPerintah, langkahBot, selangDenyutBerikut, type DepGiliran, type KeadaanGiliran } from "../../src/bot-runner/giliran";
import { validasiDenyut, validasiPerintah, type KlienApp } from "../../src/bot-runner/klien-app";
import type { KeadaanMesin, KlienMesin } from "../../src/bot-runner/klien-mesin";
import type { HasilPanen } from "../../src/bot-runner/pemanen";

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
const giliranLoop = () => new Promise<void>((r) => setImmediate(r));
async function tunggu(syarat: () => boolean, maks = 500): Promise<boolean> {
  for (let i = 0; i < maks; i++) {
    if (syarat()) return true;
    await giliranLoop();
  }
  return syarat();
}

// ---- Fabrik palsu ----

type Lapor = { botId: number; laporan: LaporanRunner };

type Palsu = {
  dep: DepGiliran;
  laporan: Lapor[];
  log: string[];
  waktu: { t: number };
  /** Atur keadaan mesin berikutnya yang akan dibaca. */
  mesinAtur: {
    hook: () => Promise<string>;
    keadaan: () => Promise<KeadaanMesin>;
    job: (badan: unknown) => Promise<KeadaanMesin>;
  };
  panenDipanggil: SumberPanen[];
  panen: { fungsi: (s: SumberPanen) => Promise<HasilPanen> };
  appAtur: { denyut: () => Promise<JawabanDenyut>; ambilKerja: (botId: number) => Promise<PerintahRunner> };
  hitung: { ambilKerja: Map<number, number>; denyut: number };
};

function buatPalsu(): Palsu {
  const waktu = { t: 0 };
  const laporan: Lapor[] = [];
  const log: string[] = [];
  const panenDipanggil: SumberPanen[] = [];
  const hitung = { ambilKerja: new Map<number, number>(), denyut: 0 };
  const mesinAtur = {
    hook: async () => "Hook palsu",
    keadaan: async (): Promise<KeadaanMesin> => ({ jobs: [], stok: [] }),
    job: async (_b: unknown): Promise<KeadaanMesin> => ({ jobs: [], stok: [] }),
  };
  const panen = { fungsi: async (_s: SumberPanen): Promise<HasilPanen> => ({ kandidat: [], jenis: "ok" }) };
  const appAtur = {
    denyut: async (): Promise<JawabanDenyut> => ({ sukses: true, jeda_global: false, menit_wib: 600, bots: [] }),
    ambilKerja: async (_b: number): Promise<PerintahRunner> => ({ perintah: "diam", alasan: "uji" }),
  };
  const app: KlienApp = {
    denyut: () => {
      hitung.denyut++;
      return appAtur.denyut();
    },
    ambilKerja: (b) => {
      hitung.ambilKerja.set(b, (hitung.ambilKerja.get(b) ?? 0) + 1);
      return appAtur.ambilKerja(b);
    },
    lapor: async (botId, l) => {
      laporan.push({ botId, laporan: l });
    },
  };
  const mesin: KlienMesin = {
    buatHook: () => mesinAtur.hook(),
    ambilKeadaan: () => mesinAtur.keadaan(),
    buatJob: (_i, badan) => mesinAtur.job(badan),
  };
  const dep: DepGiliran = {
    app,
    mesin,
    pemanen: {
      panen: async (s) => {
        panenDipanggil.push(s);
        return panen.fungsi(s);
      },
    },
    tidur: async (ms) => {
      waktu.t += ms;
      await giliranLoop();
    },
    sekarang: () => waktu.t,
    log: (t) => log.push(t),
  };
  return { dep, laporan, log, waktu, mesinAtur, panenDipanggil, panen, appAtur, hitung };
}

const ker = (berhenti = false): KeadaanGiliran => ({ hilang: new Map(), harusBerhenti: () => berhenti });
const j = (id: string, hook: string, status = "queued", e: Record<string, unknown> = {}) => ({
  job_id: id,
  status,
  progress: null,
  message: null,
  error: null,
  durasi: null,
  size: null,
  sumber_url: null,
  hook,
  ...e,
});
const BUAT: Extract<PerintahRunner, { perintah: "buat_video" }> = {
  perintah: "buat_video",
  tugas_id: 11,
  url: "https://www.instagram.com/reel/abcde/",
  naskah: "naskah berita yang cukup panjang",
  kategori: "NEWS",
  sumber_label: "NTV",
  id_pengguna_mesin: 77,
};
const jenisLaporan = (p: Palsu) => p.laporan.map((l) => l.laporan.jenis);

// ---- A. Validasi bentuk dari aplikasi ----
console.log("\n[A] Validasi perintah & denyut dari aplikasi");
cek("diam sah", validasiPerintah({ perintah: "diam", alasan: "x" })?.perintah === "diam");
cek("perintah asing ditolak", validasiPerintah({ perintah: "hapus_semua" }) === null);
cek("bukan objek ditolak", validasiPerintah("diam") === null && validasiPerintah(null) === null && validasiPerintah([1]) === null);
cek("panen sah", validasiPerintah({ perintah: "panen", sumber: [{ id: 1, platform: "tiktok", handle: "@a" }] })?.perintah === "panen");
cek("panen dengan sumber cacat ditolak", validasiPerintah({ perintah: "panen", sumber: [{ id: "1", platform: "tiktok", handle: "a" }] }) === null);
cek("panen > 10 sumber dipotong 10", (validasiPerintah({ perintah: "panen", sumber: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, platform: "tiktok", handle: "ab" })) }) as { sumber: unknown[] }).sumber.length === 10);
cek("buat_video sah", validasiPerintah(BUAT)?.perintah === "buat_video");
cek("buat_video tanpa id_pengguna_mesin ditolak", validasiPerintah({ ...BUAT, id_pengguna_mesin: undefined }) === null);
cek("buat_video id pengguna 0 / negatif ditolak", validasiPerintah({ ...BUAT, id_pengguna_mesin: 0 }) === null && validasiPerintah({ ...BUAT, id_pengguna_mesin: -3 }) === null);
cek("pantau_job dengan id null & hook null sah", validasiPerintah({ perintah: "pantau_job", tugas_id: 1, id_job_mesin: null, hook: null, id_pengguna_mesin: 2 })?.perintah === "pantau_job");
cek("pantau_job id bukan string ditolak", validasiPerintah({ perintah: "pantau_job", tugas_id: 1, id_job_mesin: 5, hook: null, id_pengguna_mesin: 2 }) === null);
cek("denyut sah", validasiDenyut({ sukses: true, jeda_global: false, menit_wib: 5, bots: [{ bot_id: 1, user_id: 9, aktif: true, jeda: false, mode: "acc" }] })?.bots.length === 1);
cek("denyut tanpa bot_id (aplikasi lama) dilewati", validasiDenyut({ sukses: true, jeda_global: false, bots: [{ user_id: 9, aktif: true, jeda: false, mode: "acc" }] })?.bots.length === 0);
cek("denyut sukses:false ditolak", validasiDenyut({ sukses: false, jeda_global: false, bots: [] }) === null);
cek("denyut jeda_global bukan boolean ditolak", validasiDenyut({ sukses: true, jeda_global: "ya", bots: [] }) === null);

// ---- B. selang denyut ----
console.log("\n[B] Backoff denyut");
cek("sehat -> selang dasar", selangDenyutBerikut(0, 15_000) === 15_000);
cek("gagal 1x -> 2x", selangDenyutBerikut(1, 15_000) === 30_000);
cek("gagal 3x -> 8x lalu dibatasi 2 menit", selangDenyutBerikut(3, 15_000) === 120_000);
cek("tidak melewati 2 menit", selangDenyutBerikut(20, 15_000) === 120_000);

// ---- C. diam & panen ----
console.log("\n[C] Perintah diam dan panen");
{
  const p = buatPalsu();
  p.appAtur.ambilKerja = async () => ({ perintah: "diam", alasan: "luar jam kerja" });
  cek("diam -> HasilPerintah diam, tanpa laporan", (await langkahBot(5, p.dep, ker())) === "diam" && p.laporan.length === 0);
}
{
  const p = buatPalsu();
  p.panen.fungsi = async (s) => (s.platform === "youtube" ? { kandidat: [{ url: "https://www.youtube.com/watch?v=abcdefghijk", judul: "t", caption: "", durasi_detik: 1, tayangan: 1, waktu_terbit: null }], jenis: "ok" } : { kandidat: [], jenis: "gagal", galat: "boom" });
  const sumber: SumberPanen[] = [
    { id: 1, platform: "youtube", handle: "@a1" },
    { id: 2, platform: "tiktok", handle: "@b2" },
  ];
  const h = await jalankanPerintah(3, { perintah: "panen", sumber }, p.dep, ker());
  cek("panen -> kerja", h === "kerja");
  cek("satu laporan kandidat per sumber", p.laporan.length === 2 && p.laporan.every((l) => l.laporan.jenis === "kandidat" && l.botId === 3));
  const l0 = p.laporan[0].laporan;
  const l1 = p.laporan[1].laporan;
  cek("laporan 1 membawa kandidat, sumber_id benar", l0.jenis === "kandidat" && l0.sumber_id === 1 && l0.kandidat.length === 1);
  cek("laporan 2 membawa galat", l1.jenis === "kandidat" && l1.sumber_id === 2 && l1.kandidat.length === 0 && l1.galat === "boom");
  cek("ada jeda antar-sumber (waktu maju)", p.waktu.t >= 2000);
}
{
  // Dibatasi di satu sumber -> sumber lain di platform sama dilewati TANPA spawn.
  const p = buatPalsu();
  p.panen.fungsi = async (s) => (s.id === 1 ? { kandidat: [], jenis: "dibatasi", galat: "429" } : { kandidat: [], jenis: "ok" });
  const sumber: SumberPanen[] = [
    { id: 1, platform: "instagram", handle: "ig1" },
    { id: 2, platform: "instagram", handle: "ig2" },
    { id: 3, platform: "tiktok", handle: "tt3" },
  ];
  await jalankanPerintah(3, { perintah: "panen", sumber }, p.dep, ker());
  cek("sumber IG kedua tidak dipanen setelah 429", p.panenDipanggil.map((s) => s.id).join() === "1,3", p.panenDipanggil);
  const l2 = p.laporan[1].laporan;
  cek("sumber IG kedua dilaporkan dilewati", l2.jenis === "kandidat" && l2.sumber_id === 2 && Boolean(l2.galat));
  cek("tiktok tetap dipanen", p.laporan.length === 3);
}
{
  const p = buatPalsu();
  const sumber: SumberPanen[] = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, platform: "youtube", handle: `@k${i}` }));
  await jalankanPerintah(3, { perintah: "panen", sumber }, p.dep, ker());
  cek("maksimal 10 sumber per panen", p.panenDipanggil.length === 10);
}
{
  const p = buatPalsu();
  let n = 0;
  const k = { hilang: new Map<number, number>(), harusBerhenti: () => n++ >= 1 };
  const sumber: SumberPanen[] = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, platform: "youtube", handle: `@k${i}` }));
  await jalankanPerintah(3, { perintah: "panen", sumber }, p.dep, k);
  cek("diminta berhenti: panen berhenti di batas sumber", p.panenDipanggil.length === 1, p.panenDipanggil.length);
}

// ---- D. buat_video ----
console.log("\n[D] Perintah buat_video");
{
  const p = buatPalsu();
  let sudahPost = false;
  p.mesinAtur.keadaan = async () => ({ jobs: [j("LAMA", "lama", "rendering")], stok: [] });
  p.mesinAtur.job = async (b) => {
    sudahPost = true;
    return { jobs: [j("LAMA", "lama", "rendering"), j("BARU-1", (b as { hook: string }).hook)], stok: [] };
  };
  await jalankanPerintah(1, BUAT, p.dep, ker());
  const l = p.laporan[0]?.laporan;
  cek("sukses -> job_dibuat dengan id dari selisih", sudahPost && l?.jenis === "job_dibuat" && l.id_job_mesin === "BARU-1" && l.tugas_id === 11 && l.hook === "Hook palsu", p.laporan);
}
{
  const p = buatPalsu();
  p.mesinAtur.hook = async () => {
    throw new GalatMesin(400, "Naskahnya terlalu pendek untuk dijadikan tulisan.");
  };
  await jalankanPerintah(1, BUAT, p.dep, ker());
  const l = p.laporan[0].laporan;
  cek("hook gagal -> job_gagal lainnya (bukan sumber_ditolak)", l.jenis === "job_gagal" && l.kode === "lainnya" && /hook/.test(l.pesan), l);
}
const kasusJob: [number, string, string][] = [
  [409, "Buat dan tetapkan template dulu.", "template_belum_ada"],
  [413, "Penyimpanan penuh", "kuota_penuh"],
  [429, "Antrean penuh", "antrean_penuh"],
  [409, "Stok video hampir penuh: 150 di stok", "stok_penuh"],
  [400, "Link tidak didukung", "sumber_ditolak"],
  [500, "boom", "lainnya"],
];
for (const [status, detail, kode] of kasusJob) {
  const p = buatPalsu();
  p.mesinAtur.job = async () => {
    throw new GalatMesin(status, detail);
  };
  await jalankanPerintah(1, BUAT, p.dep, ker());
  const l = p.laporan[0]?.laporan;
  cek(`${status} "${detail.slice(0, 25)}" -> job_gagal ${kode}`, l?.jenis === "job_gagal" && l.kode === kode && l.tugas_id === 11, l);
}
{
  const p = buatPalsu();
  p.mesinAtur.job = async () => ({ jobs: [], stok: [] });
  await jalankanPerintah(1, BUAT, p.dep, ker());
  const l = p.laporan[0].laporan;
  cek("job tak terdeteksi -> job_gagal hilang", l.jenis === "job_gagal" && l.kode === "hilang", l);
}
{
  // Waktu habis menunggu POST (status 0) tetapi job ternyata terbentuk.
  const p = buatPalsu();
  let panggilan = 0;
  p.mesinAtur.keadaan = async () => (panggilan++ === 0 ? { jobs: [], stok: [] } : { jobs: [j("DIAM-DIAM", "Hook palsu")], stok: [] });
  p.mesinAtur.job = async () => {
    throw new GalatMesin(0, "waktu habis menunggu mesin");
  };
  await jalankanPerintah(1, BUAT, p.dep, ker());
  const l = p.laporan[0].laporan;
  cek("POST kehabisan waktu, job ternyata ada -> job_dibuat", l.jenis === "job_dibuat" && l.id_job_mesin === "DIAM-DIAM", l);
}
{
  const p = buatPalsu();
  p.mesinAtur.job = async () => {
    throw new GalatMesin(0, "soket mati");
  };
  await jalankanPerintah(1, BUAT, p.dep, ker());
  const l = p.laporan[0].laporan;
  cek("POST status 0 & job tak ada -> job_gagal hilang", l.jenis === "job_gagal", l);
}
{
  const p = buatPalsu();
  p.mesinAtur.keadaan = async () => {
    throw new GalatMesin(0, "soket mati");
  };
  await jalankanPerintah(1, BUAT, p.dep, ker());
  cek("mesin tak terbaca -> job_gagal, tidak membuat job", p.laporan[0].laporan.jenis === "job_gagal");
}
{
  const p = buatPalsu();
  let badan: any = null;
  p.mesinAtur.job = async (b) => {
    badan = b;
    return { jobs: [j("X", (b as any).hook)], stok: [] };
  };
  await jalankanPerintah(1, { ...BUAT, naskah: "n".repeat(9000) }, p.dep, ker());
  cek("badan job membawa url, hook, sumber, kategori", badan?.url === BUAT.url && badan?.sumber === "NTV" && badan?.kategori === "NEWS");
}

// ---- E. pantau_job ----
console.log("\n[E] Perintah pantau_job");
const PANTAU = { perintah: "pantau_job" as const, tugas_id: 21, id_job_mesin: "J1", hook: "Hook J1", id_pengguna_mesin: 77 };
{
  const p = buatPalsu();
  let n = 0;
  p.mesinAtur.keadaan = async () => (++n < 3 ? { jobs: [j("J1", "Hook J1", "rendering")], stok: [] } : { jobs: [], stok: [{ id: "J1", judul: "x", durasi: 30.4, size: 1234567 }] });
  await jalankanPerintah(1, PANTAU, p.dep, ker());
  const l = p.laporan[0]?.laporan;
  cek("berjalan lalu pindah ke stok -> job_selesai (id stok = job id)", p.laporan.length === 1 && l?.jenis === "job_selesai" && l.id_stok_mesin === "J1" && l.durasi_detik === 30 && l.ukuran_byte === 1234567, p.laporan);
}
{
  const p = buatPalsu();
  p.mesinAtur.keadaan = async () => ({ jobs: [j("J1", "Hook J1", "error", { error: "ffmpeg: sumber rusak" })], stok: [] });
  await jalankanPerintah(1, PANTAU, p.dep, ker());
  const l = p.laporan[0].laporan;
  cek("status error di jobs[] -> job_gagal job_error", l.jenis === "job_gagal" && l.kode === "job_error" && /sumber rusak/.test(l.pesan), l);
}
{
  const p = buatPalsu();
  let n = 0;
  p.mesinAtur.keadaan = async () => (++n === 1 ? { jobs: [j("J1", "Hook J1", "downloading")], stok: [] } : { jobs: [], stok: [] });
  const k = ker();
  await jalankanPerintah(1, PANTAU, p.dep, k);
  const l = p.laporan[0]?.laporan;
  cek("hilang 2 polling berturut-turut -> job_gagal hilang", l?.jenis === "job_gagal" && l.kode === "hilang" && n === 3, { n, l });
  cek("penghitung dibersihkan setelah lapor", k.hilang.size === 0);
}
{
  // Hilang SEKALI lalu muncul di stok: bukan kegagalan.
  const p = buatPalsu();
  let n = 0;
  p.mesinAtur.keadaan = async () => (++n === 1 ? { jobs: [], stok: [] } : { jobs: [], stok: [{ id: "J1", judul: "", durasi: 5, size: 5 }] });
  await jalankanPerintah(1, PANTAU, p.dep, ker());
  cek("hilang sekali lalu ada di stok -> job_selesai", p.laporan[0]?.laporan.jenis === "job_selesai");
}
{
  // Penghitung bertahan antar-langkah: hilang 1x di langkah ini, 1x di langkah berikut -> gagal.
  const p = buatPalsu();
  p.mesinAtur.keadaan = async () => ({ jobs: [], stok: [] });
  const k = ker();
  let n = 0;
  const batas: KeadaanGiliran = { hilang: k.hilang, harusBerhenti: () => n++ >= 1 };
  await jalankanPerintah(1, PANTAU, p.dep, batas);
  cek("satu polling hilang belum gagal", p.laporan.length === 0 && k.hilang.get(21) === 1);
  await jalankanPerintah(1, PANTAU, p.dep, { hilang: k.hilang, harusBerhenti: () => false });
  cek("langkah berikut: hilang kedua -> job_gagal", p.laporan[0]?.laporan.jenis === "job_gagal");
}
{
  // Masih berjalan sampai batas waktu: kembali ke aplikasi tanpa lapor.
  const p = buatPalsu();
  p.mesinAtur.keadaan = async () => ({ jobs: [j("J1", "Hook J1", "rendering")], stok: [] });
  await jalankanPerintah(1, PANTAU, p.dep, ker());
  cek("berjalan terus -> kembali setelah ±60 dtk tanpa lapor", p.laporan.length === 0 && p.waktu.t >= 60_000 && p.waktu.t < 70_000, p.waktu.t);
}
{
  // id null: ditemukan lewat hook -> lapor job_dibuat dulu, lalu selesai.
  const p = buatPalsu();
  let n = 0;
  p.mesinAtur.keadaan = async () => (++n === 1 ? { jobs: [j("JBARU", "Hook J1", "queued")], stok: [] } : { jobs: [], stok: [{ id: "JBARU", judul: "", durasi: 9, size: 9 }] });
  await jalankanPerintah(1, { ...PANTAU, id_job_mesin: null }, p.dep, ker());
  cek("id null ditemukan via hook -> job_dibuat lalu job_selesai", jenisLaporan(p).join() === "job_dibuat,job_selesai" && (p.laporan[0].laporan as any).id_job_mesin === "JBARU", p.laporan);
}
{
  const p = buatPalsu();
  await jalankanPerintah(1, { ...PANTAU, id_job_mesin: null, hook: null }, p.dep, ker());
  const l = p.laporan[0].laporan;
  cek("tanpa id & hook -> job_gagal hilang", l.jenis === "job_gagal" && l.kode === "hilang");
}
{
  // Mesin tak terbaca terus -> kembali ke aplikasi tanpa menandai job gagal.
  const p = buatPalsu();
  p.mesinAtur.keadaan = async () => {
    throw new GalatMesin(0, "soket mati");
  };
  await jalankanPerintah(1, PANTAU, p.dep, ker());
  cek("mesin tak terbaca 3x -> kembali, tanpa job_gagal", p.laporan.length === 0);
}

// ---- F. Penjadwal: gagal tertutup, jeda, independensi ----
console.log("\n[F] Penjadwal");
const botAktif = (id: number, ekstra: Partial<JawabanDenyut["bots"][number]> = {}) => ({ bot_id: id, user_id: id * 10, aktif: true, jeda: false, mode: "acc" as const, ...ekstra });
{
  const p = buatPalsu();
  p.appAtur.denyut = async () => ({ sukses: true, jeda_global: false, menit_wib: 600, bots: [botAktif(1), botAktif(2, { jeda: true }), botAktif(3, { aktif: false })] });
  const pj = new Penjadwal(p.dep);
  cek("awal: belum bekerja", pj.bekerja === false);
  await pj.denyut();
  cek("denyut sukses -> bekerja", pj.bekerja === true);
  cek("hanya bot aktif & tidak dijeda yang mulai", await tunggu(() => (p.hitung.ambilKerja.get(1) ?? 0) > 0) && !p.hitung.ambilKerja.has(2) && !p.hitung.ambilKerja.has(3), [...p.hitung.ambilKerja]);
  await pj.hentikan(1000);
}
{
  // Gagal tertutup: 3 denyut gagal berturut-turut.
  const p = buatPalsu();
  p.appAtur.denyut = async () => ({ sukses: true, jeda_global: false, menit_wib: 1, bots: [botAktif(1)] });
  const pj = new Penjadwal(p.dep);
  await pj.denyut();
  await tunggu(() => (p.hitung.ambilKerja.get(1) ?? 0) > 2);
  p.appAtur.denyut = async () => {
    throw new GalatApp(0, "tak tersambung");
  };
  await pj.denyut();
  await pj.denyut();
  cek("2 kegagalan: masih bekerja", pj.bekerja === true && pj.gagalDenyut === 2);
  await pj.denyut();
  cek("3 kegagalan beruntun: berhenti bekerja", pj.bekerja === false && pj.gagalDenyut === 3);
  await pj.tungguTugas();
  const setelah = p.hitung.ambilKerja.get(1) ?? 0;
  for (let i = 0; i < 20; i++) await giliranLoop();
  cek("tugas bot berhenti (tidak ada ambil_kerja baru)", (p.hitung.ambilKerja.get(1) ?? 0) === setelah && pj.jumlahBotBerjalan === 0);
  cek("alasan tercatat di log", p.log.some((x) => /berhenti bekerja/.test(x)));
  // Pulih bila denyut berhasil lagi.
  p.appAtur.denyut = async () => ({ sukses: true, jeda_global: false, menit_wib: 1, bots: [botAktif(1)] });
  await pj.denyut();
  cek("denyut pulih -> bekerja lagi & gagalDenyut nol", pj.bekerja === true && pj.gagalDenyut === 0);
  cek("bot mulai lagi setelah pulih", await tunggu(() => (p.hitung.ambilKerja.get(1) ?? 0) > setelah));
  await pj.hentikan(1000);
}
{
  // Jeda global.
  const p = buatPalsu();
  p.appAtur.denyut = async () => ({ sukses: true, jeda_global: true, menit_wib: 1, bots: [botAktif(1)] });
  const pj = new Penjadwal(p.dep);
  await pj.denyut();
  for (let i = 0; i < 20; i++) await giliranLoop();
  cek("jeda_global -> tidak ada yang bekerja, tidak ada ambil_kerja", pj.bekerja === false && p.hitung.ambilKerja.size === 0);
}
{
  // Jeda global muncul saat sedang bekerja -> berhenti.
  const p = buatPalsu();
  let jeda = false;
  p.appAtur.denyut = async () => ({ sukses: true, jeda_global: jeda, menit_wib: 1, bots: [botAktif(1)] });
  const pj = new Penjadwal(p.dep);
  await pj.denyut();
  await tunggu(() => (p.hitung.ambilKerja.get(1) ?? 0) > 1);
  jeda = true;
  await pj.denyut();
  await pj.tungguTugas();
  cek("jeda_global saat bekerja -> tugas berhenti", pj.bekerja === false && pj.jumlahBotBerjalan === 0);
}
{
  // Bot dinonaktifkan di tengah jalan -> tugasnya berhenti; bot lain terus.
  const p = buatPalsu();
  let daftar = [botAktif(1), botAktif(2)];
  p.appAtur.denyut = async () => ({ sukses: true, jeda_global: false, menit_wib: 1, bots: daftar });
  const pj = new Penjadwal(p.dep);
  await pj.denyut();
  await tunggu(() => p.hitung.ambilKerja.has(1) && p.hitung.ambilKerja.has(2));
  daftar = [botAktif(1), botAktif(2, { aktif: false })];
  await pj.denyut();
  await tunggu(() => pj.jumlahBotBerjalan === 1);
  const n2 = p.hitung.ambilKerja.get(2) ?? 0;
  const n1 = p.hitung.ambilKerja.get(1) ?? 0;
  for (let i = 0; i < 30; i++) await giliranLoop();
  cek("bot 2 berhenti, bot 1 terus", (p.hitung.ambilKerja.get(2) ?? 0) === n2 && (p.hitung.ambilKerja.get(1) ?? 0) > n1);
  await pj.hentikan(1000);
}
{
  // Independensi: bot 1 macet menunggu aplikasi, bot 2 tetap berjalan.
  const p = buatPalsu();
  p.appAtur.denyut = async () => ({ sukses: true, jeda_global: false, menit_wib: 1, bots: [botAktif(1), botAktif(2)] });
  p.appAtur.ambilKerja = (b) => (b === 1 ? new Promise<PerintahRunner>(() => undefined) : Promise.resolve({ perintah: "diam", alasan: "x" }));
  const pj = new Penjadwal(p.dep);
  await pj.denyut();
  const maju = await tunggu(() => (p.hitung.ambilKerja.get(2) ?? 0) >= 5);
  cek("bot 1 macet tidak memblokir bot 2", maju && (p.hitung.ambilKerja.get(1) ?? 0) === 1, [...p.hitung.ambilKerja]);
  await pj.hentikan(50);
}
{
  // Galat ambil_kerja pada satu bot tidak mematikan loop.
  const p = buatPalsu();
  let n = 0;
  p.appAtur.denyut = async () => ({ sukses: true, jeda_global: false, menit_wib: 1, bots: [botAktif(1)] });
  p.appAtur.ambilKerja = async () => {
    if (++n < 3) throw new GalatApp(500, "server error");
    return { perintah: "diam", alasan: "x" };
  };
  const pj = new Penjadwal(p.dep);
  await pj.denyut();
  cek("galat ambil_kerja dicatat lalu berlanjut", await tunggu(() => n >= 5) && p.log.some((x) => /server error/.test(x)));
  await pj.hentikan(1000);
}
{
  // SIGTERM: hentikan() menunggu langkah dan mencegah langkah baru.
  const p = buatPalsu();
  p.appAtur.denyut = async () => ({ sukses: true, jeda_global: false, menit_wib: 1, bots: [botAktif(1)] });
  const pj = new Penjadwal(p.dep);
  await pj.denyut();
  await tunggu(() => (p.hitung.ambilKerja.get(1) ?? 0) > 0);
  await pj.hentikan(1000);
  const n = p.hitung.ambilKerja.get(1) ?? 0;
  for (let i = 0; i < 20; i++) await giliranLoop();
  cek("hentikan: tugas selesai bersih, tidak ada langkah baru", pj.jumlahBotBerjalan === 0 && (p.hitung.ambilKerja.get(1) ?? 0) === n);
  await pj.denyut();
  cek("setelah hentikan, denyut tidak memulai bot lagi", pj.jumlahBotBerjalan === 0);
}
{
  // Perintah bot_id: panen lewat Penjadwal sampai lapor.
  const p = buatPalsu();
  let sekali = true;
  p.appAtur.denyut = async () => ({ sukses: true, jeda_global: false, menit_wib: 1, bots: [botAktif(4)] });
  p.appAtur.ambilKerja = async () => {
    if (sekali) {
      sekali = false;
      return { perintah: "panen", sumber: [{ id: 8, platform: "tiktok", handle: "@abc" }] };
    }
    return { perintah: "diam", alasan: "x" };
  };
  const pj = new Penjadwal(p.dep);
  await pj.denyut();
  cek("panen via penjadwal -> laporan kandidat atas nama bot", await tunggu(() => p.laporan.length === 1) && p.laporan[0].botId === 4 && p.laporan[0].laporan.jenis === "kandidat");
  await pj.hentikan(1000);
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
