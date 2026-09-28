// Uji alur PUTARAN angka video (29 Sep 2026): kata kunci dulu, lalu lainnya,
// terlama → terbaru, berulang; jalur cepat berjatah; rem kuota yang menunggu.
// Jalankan: npx tsx tests/uji-siklus-metrik.mts
// Bagian rencana memakai PostgREST TIRUAN di 127.0.0.1 — tidak menyentuh Supabase asli.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { kataKunciCocok, normalKata, sidikKataKunci, siapkanKataKunci } from "@/lib/kata-kunci-video";
import { MAKS_TERTUNDA, gabungTertunda, jalankanSiklus, persenSiklus, susunUrutan } from "@/lib/siklus-metrik";
import { Pengendali, bangunRencana, kodeBerkategori } from "@/lib/segar-metrik-video";
import { kodeMetrik } from "@/lib/insight-kategori";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean, i?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n, i !== undefined ? JSON.stringify(i).slice(0, 400) : "");
  }
};

// Daftar kata kunci ASLI produksi (29 Sep 2026).
const KUNCI = siapkanKataKunci([
  "JUMAT BERBAGI", "PERI", "BPJS", "REFORMA AGRARIA", "SURVEI PRABOWO", "BAGI BAGI MASKER",
  "KETUA OKK", "KSP", "FUN WALK", "PODCAST", "ASIAN GAMES", "PRABOWO", "PT.BIKE",
]);
const cocok = (t: string) => kataKunciCocok(t, KUNCI)?.asli ?? null;

console.log("kata kunci — per kata utuh / hashtag (bukan potongan huruf)");
cek("normalisasi: huruf kecil, tanda baca jadi spasi", normalKata("PT.BIKE — Fun-Walk!") === "pt bike fun walk");
cek("'periode', 'perintah', 'periksa' TIDAK cocok PERI", !cocok("Periode baru, perintah presiden, periksa data") );
cek("kata 'PERI' utuh cocok", cocok("Kegiatan PERI hari ini") === "PERI");
cek("hashtag #peri persis cocok", cocok("mantap #PERI") === "PERI");
cek("hashtag #perikanan TIDAK cocok PERI (kata kunci pendek)", !cocok("#perikanan maju"));
cek("#prabowosubianto cocok PRABOWO (≥ 5 huruf, di awal)", cocok("keren #PrabowoSubianto") === "PRABOWO");
cek("#timprabowo cocok PRABOWO (≥ 7 huruf, di mana saja)", cocok("#timprabowo") === "PRABOWO");
cek("#reformaagraria cocok REFORMA AGRARIA", cocok("isu #reformaagraria") === "REFORMA AGRARIA");
cek("'pt bike' & 'PT.BIKE' & #ptbike cocok", cocok("event pt bike") === "PT.BIKE" && cocok("PT.BIKE seru") === "PT.BIKE" && cocok("#ptbike") === "PT.BIKE");
cek("'BPJS Kesehatan' cocok BPJS, 'bpjsku' tidak", cocok("BPJS Kesehatan gratis") === "BPJS" && !cocok("aplikasi bpjsku"));
cek("aksen & huruf besar diabaikan", cocok("PODCÁST terbaru") === "PODCAST");
cek("teks kosong / null → null", kataKunciCocok(null, KUNCI) === null && kataKunciCocok("", KUNCI) === null);
cek("tanpa kata kunci → null", kataKunciCocok("PRABOWO", []) === null);
cek("sidik tak bergantung urutan & huruf besar", sidikKataKunci(siapkanKataKunci(["b", "Ab", "A B"])) === sidikKataKunci(siapkanKataKunci(["a b", "ab", "B"])));
cek("kata kunci kembar / terlalu pendek dibuang", siapkanKataKunci(["PERI", "peri", "x", "  "]).length === 1);

console.log("susunUrutan — kata kunci dulu, terlama → terbaru");
{
  const u = susunUrutan([
    { kode: "b", waktuMs: 300, prioritas: false },
    { kode: "a", waktuMs: 100, prioritas: false },
    { kode: "p2", waktuMs: 500, prioritas: true },
    { kode: "p1", waktuMs: 50, prioritas: true },
    { kode: "tanpa", waktuMs: null, prioritas: false },
    { kode: "a", waktuMs: 100, prioritas: true }, // kembar: prioritas menang
  ]);
  cek("urutan: prioritas (terlama dulu) lalu lainnya; tanpa tanggal = paling lama", u.kode.join(",") === "p1,a,p2,tanpa,b", u.kode);
  cek("jumlah prioritas terhitung (kode kembar sekali)", u.prioritas === 3 && u.kode.length === 5);
  const sama = susunUrutan([
    { kode: "z", waktuMs: 1, prioritas: false },
    { kode: "y", waktuMs: 1, prioritas: false },
  ]);
  cek("waktu sama → urut kode (stabil)", sama.kode.join(",") === "y,z");
}

console.log("jalankanSiklus — maju per potongan, sisa jadi tertunda");
{
  const kode = Array.from({ length: 1000 }, (_, i) => `k${String(i).padStart(4, "0")}`);
  const ambil = async (k: string[]) => k.filter((x) => x !== "k0005").map((x) => ({ kode: x })); // k0005 sudah dihapus
  let jatah = 250;
  const dilihat: string[] = [];
  const h1 = await jalankanSiklus({
    kode,
    i: 0,
    potongan: 100,
    boleh: () => jatah > 0,
    ambil,
    kerjakan: async (b) => {
      const tunda: string[] = [];
      for (const r of b) {
        if (jatah > 0) {
          jatah--;
          dilihat.push(r.kode);
        } else tunda.push(r.kode);
      }
      return tunda;
    },
  });
  cek("waktu habis di potongan ke-3 → posisi maju 300, sisa potongan jadi tertunda", h1.i === 300 && !h1.selesai && h1.tunda.length === 49 && dilihat.length === 250, { i: h1.i, tunda: h1.tunda.length });
  cek("baris yang hilang dari database dilewati tanpa galat", !dilihat.includes("k0005"));
  const h2 = await jalankanSiklus({ kode, i: h1.i, potongan: 100, boleh: () => true, ambil, kerjakan: async () => [] });
  cek("putaran berikutnya lanjut dari 300 sampai tuntas", h2.i === 1000 && h2.selesai);
  const h3 = await jalankanSiklus({ kode, i: 5000, potongan: 100, boleh: () => true, ambil, kerjakan: async () => [] });
  cek("posisi di luar batas → dianggap tuntas", h3.i === 1000 && h3.selesai);
  cek("gabungTertunda: lama dulu, tanpa kembar, dibatasi", gabungTertunda(["a", "b"], ["b", "c"]).join(",") === "a,b,c" && gabungTertunda([], Array.from({ length: MAKS_TERTUNDA + 50 }, (_, i) => `t${i}`)).length === MAKS_TERTUNDA);
  cek("persen kemajuan", persenSiklus(0, 0) === 100 && persenSiklus(1, 3) === 33.3 && persenSiklus(9, 3) === 100);
}

console.log("simulasi banyak putaran robot — semua video tersentuh, kata kunci duluan, lalu berulang");
{
  // 3.000 video kata kunci + 7.000 lainnya; tiap putaran robot ±800
  // permintaan dan maks 40 per akun (batas sungguhan). Tertunda dikerjakan
  // lebih dulu tiap putaran robot (seperti segarkanSiklus).
  const simulasi = async (nAkun: number) => {
    const calon = Array.from({ length: 10_000 }, (_, i) => ({ kode: `v${String(i).padStart(5, "0")}`, waktuMs: (i * 7919) % 10_000, prioritas: i % 10 < 3 }));
    const rencana = susunUrutan(calon);
    const urutanSegar: string[] = [];
    const putaranSegar = new Map<string, number>();
    let posisi = 0;
    let tertunda: string[] = [];
    let selesaiDi = -1;
    for (let r = 0; r < 40 && selesaiDi < 0; r++) {
      let jatah = 800;
      const perAkun = new Map<number, number>();
      const kerjakan = async (b: { kode: string }[]) => {
        const tunda: string[] = [];
        for (const x of b) {
          if (putaranSegar.has(x.kode)) continue; // sudah di putaran ini
          const akun = Number(x.kode.slice(1)) % nAkun;
          if (jatah <= 0 || (perAkun.get(akun) ?? 0) >= 40) {
            tunda.push(x.kode);
            continue;
          }
          perAkun.set(akun, (perAkun.get(akun) ?? 0) + 1);
          jatah--;
          putaranSegar.set(x.kode, r);
          urutanSegar.push(x.kode);
        }
        return tunda;
      };
      tertunda = gabungTertunda(await kerjakan(tertunda.map((k) => ({ kode: k }))), []);
      const h = await jalankanSiklus({ kode: rencana.kode, i: posisi, potongan: 300, boleh: () => jatah > 0, ambil: async (k) => k.map((x) => ({ kode: x })), kerjakan });
      posisi = h.i;
      tertunda = gabungTertunda(tertunda, h.tunda);
      if (h.selesai && tertunda.length === 0) selesaiDi = r;
    }
    const prio = (k: string) => calon[Number(k.slice(1))].prioritas;
    const pertamaLainnya = urutanSegar.findIndex((k) => !prio(k));
    const putaranPrioritasTerakhir = Math.max(...urutanSegar.filter(prio).map((k) => putaranSegar.get(k) ?? 99));
    const urutPrioritas = rencana.kode.slice(0, rencana.prioritas).map((k) => calon[Number(k.slice(1))].waktuMs ?? 0);
    return { tersentuh: putaranSegar.size, pertamaLainnya, putaranPrioritasTerakhir, selesaiDi, urutOk: urutPrioritas.every((w, i) => i === 0 || w >= urutPrioritas[i - 1]) };
  };
  const wajar = await simulasi(97); // kata kunci tersebar di banyak akun
  cek("tersebar wajar: seluruh 10.000 video tersentuh tepat sekali", wajar.tersentuh === 10_000, wajar);
  cek("tersebar wajar: SEMUA video kata kunci lebih dulu dari video lain", wajar.pertamaLainnya === 3000, wajar.pertamaLainnya);
  cek("tersebar wajar: putaran tuntas ≈ 10.000 / 800 putaran robot", wajar.selesaiDi >= 0 && wajar.selesaiDi <= 13, wajar.selesaiDi);
  cek("di dalam kelompok kata kunci: terlama → terbaru", wajar.urutOk);
  const numpuk = await simulasi(20); // video kata kunci menumpuk di 6 akun (40/akun/putaran)
  cek("menumpuk di sedikit akun: tetap tuntas semua, tenaga tidak menganggur", numpuk.tersentuh === 10_000 && numpuk.selesaiDi >= 0 && numpuk.selesaiDi <= 15, numpuk);
  cek("menumpuk: video kata kunci selesai secepat batas akunnya (3.000 / (6×40) ≈ 13 putaran)", numpuk.putaranPrioritasTerakhir <= 13, numpuk.putaranPrioritasTerakhir);
}

console.log("Pengendali — jatah jalur cepat & rem kuota yang menunggu");
{
  const c = new Pengendali(100, 60_000);
  let n = 0;
  await c.denganJatah(3, async () => {
    while (await c.izin(1000)) n++;
  });
  cek("jalur cepat berhenti tepat di jatahnya (3)", n === 3 && c.diminta === 3, { n });
  cek("selepas jalur cepat, jatah biasa kembali", (await c.izin(1000)) && c.diminta === 4);
  const reset = Date.now() + 1500;
  c.catatBatas({ batas: 876, sisa: 100, reset_ms: reset });
  cek("kuota menipis & pulih ≤ 65 dtk → TIDAK berhenti", !c.berhenti && c.kaliDitahan === 1);
  const t0 = Date.now();
  const boleh = await c.izin(1000);
  cek("izin berikutnya menunggu sampai kuota pulih, lalu lanjut", boleh && Date.now() >= reset && Date.now() - t0 < 4000, Date.now() - t0);
  const d = new Pengendali(100, 60_000);
  d.catatBatas({ batas: 876, sisa: 100, reset_ms: Date.now() + 5 * 60_000 });
  cek("kuota pulih lama (5 mnt) → berhenti & jeda", d.berhenti && (d.jedaSampai ?? 0) > Date.now());
  const e = new Pengendali(100, 60_000);
  cek("429 dengan reset dekat → ditahan, bukan berhenti", e.tanganiGalat({ status: 429, batas: { batas: 876, sisa: 0, reset_ms: Date.now() + 2000 } }) && !e.berhenti && e.kaliDitahan === 1);
  const f = new Pengendali(100, 60_000);
  cek("429 tanpa reset → berhenti & jeda 5 mnt", f.tanganiGalat({ status: 429 }) && f.berhenti);
  const g = new Pengendali(100, 25_000);
  g.catatBatas({ batas: 876, sisa: 10, reset_ms: Date.now() + 15_000 });
  cek("sisa waktu putaran tak cukup untuk menunggu → berhenti", g.berhenti);
}

console.log("bangunRencana — katalog + kategori dari PostgREST tiruan");
{
  const url = (i: number) => `https://www.tiktok.com/@akun/video/74${String(i).padStart(17, "0")}`;
  const kodeVideo = (i: number) => kodeMetrik("tiktok", url(i)) as string;
  const katalog = Array.from({ length: 2600 }, (_, i) => ({
    kode: kodeVideo(i),
    judul: i === 10 ? "Rapat #PrabowoSubianto" : i === 11 ? "periode baru" : i === 12 ? null : `video ${i}`,
    waktu_posting: i === 13 ? null : new Date(Date.UTC(2026, 0, 1) + ((i * 37) % 2600) * 3600e3).toISOString(),
    user_id: 5,
  })).sort((a, b) => (a.kode < b.kode ? -1 : 1));
  const laporan = [
    { id: 1, platform: "tiktok", url_video: url(20), keyword: "BPJS", tvrku_post_id: null },
    { id: 2, platform: "tiktok", url_video: url(21), keyword: "HUT RI", tvrku_post_id: null },
    { id: 3, platform: "tiktok", url_video: url(22), keyword: null, tvrku_post_id: 900 },
  ];
  const minta: string[] = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const t = u.pathname.replace(/^\/rest\/v1\//, "");
    minta.push(`${t}?${u.searchParams.toString()}`);
    const kirim = (b: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(b));
    };
    if (t === "tvr_video_metrik") {
      const gt = (u.searchParams.get("kode") ?? "").replace(/^gt\./, "");
      return kirim(katalog.filter((r) => !gt || r.kode > gt).slice(0, 1000).map(({ kode, judul, waktu_posting }) => ({ kode, judul, waktu_posting })));
    }
    if (t === "laporan_video") {
      const di = u.searchParams.get("tvrku_post_id");
      if (di?.startsWith("in.")) {
        const id = di.slice(4, -1).split(",").map(Number);
        return kirim(laporan.filter((l) => l.tvrku_post_id && id.includes(l.tvrku_post_id)).map(({ platform, url_video }) => ({ platform, url_video })));
      }
      const gt = Number((u.searchParams.get("id") ?? "gt.0").replace(/^gt\./, ""));
      return kirim(laporan.filter((l) => l.keyword && l.id > gt));
    }
    if (t === "tvrku_post") return kirim([{ id: 900, kategori: "Podcast Rakyat" }, { id: 901, kategori: "Lainnya" }]);
    if (t === "tvr_kategori_link") return kirim({ code: "42P01", message: 'relation "tvr_kategori_link" does not exist' }, 404);
    return kirim([]);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const db = createClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, "kunci-uji", { auth: { persistSession: false } });
  const kat = await kodeBerkategori(db as never, KUNCI);
  cek("kategori laporan 'BPJS' masuk, 'HUT RI' tidak", kat.has(kodeVideo(20)) && !kat.has(kodeVideo(21)));
  cek("kategori unggahan 'Podcast Rakyat' → tautan per platformnya masuk", kat.has(kodeVideo(22)));
  cek("tabel link kategori belum ada → diabaikan tanpa galat", kat.size === 2, [...kat]);
  const r = await bangunRencana(db as never, 3, "2026-09-29T00:00:00.000Z", KUNCI);
  cek("seluruh 2.600 video masuk rencana (keyset 3 halaman)", r.kode.length === 2600 && minta.filter((m) => m.startsWith("tvr_video_metrik")).length === 3);
  cek("prioritas = caption #PrabowoSubianto + kategori BPJS + kategori Podcast (bukan 'periode')", r.prioritas === 3 && new Set(r.kode.slice(0, 3)).size === 3 && [10, 20, 22].every((i) => r.kode.slice(0, 3).includes(kodeVideo(i))), r.kode.slice(0, 4));
  cek("video tanpa tanggal di depan kelompok lainnya", r.kode[3] === kodeVideo(13));
  cek("nomor putaran, waktu mulai & sidik kata kunci tersimpan", r.ke === 3 && r.mulai === "2026-09-29T00:00:00.000Z" && r.sidik === sidikKataKunci(KUNCI));
  server.closeAllConnections();
  await new Promise<void>((res) => server.close(() => res()));
}

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exitCode = gagal > 0 ? 1 : 0;
