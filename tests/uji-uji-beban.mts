// Uji fitur uji beban (29 Sep 2026): skenario, token, pagar proxy, dan mesin.
// Jalankan: npx tsx tests/uji-uji-beban.mts
// Mesin diuji melawan server aplikasi TIRUAN di 127.0.0.1 — tanpa database.
import http from "node:http";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import {
  RUTE_UJI,
  adalahTokenUji,
  alasanHenti,
  kesimpulanAman,
  langkahBerat,
  langkahBuka,
  langkahNormal,
  persentil,
  pilihBerbobot,
  ruteUjiBoleh,
  tahapBertahap,
  type RingkasTahap,
} from "@/lib/uji-beban-skenario";

process.env.CRON_SECRET = "rahasia-uji-otomatis";
const { akhiriPutaranUji, buatTokenUji, daftarkanPutaranUji, periksaTokenUji, rahasiaUji } = await import("@/lib/uji-beban-token");
const { jalankanUji, hentikanUjiBeban, statusUjiBeban } = await import("@/lib/uji-beban");
const { proxy } = await import("@/proxy");

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
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log("aturan rute & skenario");
cek("token uji dikenali (Bearer / mentah)", adalahTokenUji("Bearer ujibeban.x") && adalahTokenUji("ujibeban.y") && !adalahTokenUji("Bearer abc") && !adalahTokenUji(null));
cek("GET rute uji boleh; POST tidak", ruteUjiBoleh("GET", "/api/tvr/laporan") && ruteUjiBoleh("head", "/api/detak") && !ruteUjiBoleh("POST", "/api/tvr/laporan"));
cek("rute di luar daftar ditolak (termasuk master & layanan luar)", !ruteUjiBoleh("GET", "/api/master/uji-beban") && !ruteUjiBoleh("GET", "/api/tvr/hubungkan") && !ruteUjiBoleh("GET", "/api/konten/galeri"));
cek("garis miring di akhir tidak jadi celah", ruteUjiBoleh("GET", "/api/detak/") && !ruteUjiBoleh("GET", "/api/detak/../master"));
const konteks = { tanggal: "2026-09-29", kategori: ["Kategori A", "B & C"] };
const semuaLangkah = [...langkahBuka(konteks), ...langkahBerat(konteks).map((l) => l.path), ...langkahNormal(konteks).map((l) => l.path), "/api/detak", "/api/notifikasi"];
const tidakBoleh = semuaLangkah.filter((p) => !ruteUjiBoleh("GET", new URL(p, "http://x").pathname));
cek("SEMUA langkah skenario lolos pagar proxy", tidakBoleh.length === 0, tidakBoleh);
const hilang = RUTE_UJI.filter((r) => !existsSync(`src/app${r}/route.ts`));
cek("setiap rute uji benar-benar ada di kode", hilang.length === 0, hilang);
cek("kategori ikut dengan kode URL aman", langkahBerat(konteks).some((l) => l.path.endsWith("kategori=B%20%26%20C")));
cek("tahap 200 orang = 50/100/150/200", JSON.stringify(tahapBertahap(200)) === "[50,100,150,200]");
cek("tahap kecil tanpa duplikat", JSON.stringify(tahapBertahap(3)) === "[1,2,3]" && JSON.stringify(tahapBertahap(1)) === "[1]");
const daftar = [{ path: "a", bobot: 1 }, { path: "b", bobot: 3 }];
cek("pilihan berbobot", pilihBerbobot(daftar, () => 0.1).path === "a" && pilihBerbobot(daftar, () => 0.5).path === "b" && pilihBerbobot(daftar, () => 0.999).path === "b");
cek("persentil", persentil([5, 1, 3, 2, 4], 0.5) === 3 && persentil([], 0.95) === 0 && persentil([1, 2, 3, 4, 100], 0.95) === 100);
cek("henti: database macet", alasanHenti({ p95: 100, galat: 0, sampel: 100, cpuTinggiBeruntun: 0, tingkatDb: "macet" }) !== null);
cek("henti: p95 > 5 dtk (dengan sampel cukup)", alasanHenti({ p95: 6000, galat: 0, sampel: 50, cpuTinggiBeruntun: 0, tingkatDb: "normal" }) !== null);
cek("tidak henti bila sampel masih sedikit", alasanHenti({ p95: 9000, galat: 0.5, sampel: 10, cpuTinggiBeruntun: 0, tingkatDb: "normal" }) === null);
cek("henti: galat > 10%", alasanHenti({ p95: 100, galat: 0.2, sampel: 50, cpuTinggiBeruntun: 0, tingkatDb: "normal" }) !== null);
cek("henti: CPU tinggi 2x beruntun", alasanHenti({ p95: 100, galat: 0, sampel: 50, cpuTinggiBeruntun: 2, tingkatDb: "normal" }) !== null);
const t = (orang: number, aman: boolean) => ({ orang, aman }) as RingkasTahap;
cek("kesimpulan: tahap aman terakhir sebelum yang berat", kesimpulanAman([t(50, true), t(100, true), t(150, false), t(200, true)]) === 100 && kesimpulanAman([t(50, false)]) === 0);

console.log("token uji");
{
  const r = rahasiaUji();
  const sampai = Date.now() + 60_000;
  const tok = buatTokenUji("putaranuji1", 42, sampai, r);
  cek("tanpa putaran terdaftar → ditolak", periksaTokenUji(tok, Date.now(), r) === null);
  daftarkanPutaranUji("putaranuji1", sampai);
  const sah = periksaTokenUji(tok, Date.now(), r);
  cek("putaran terdaftar → sah, id akun benar", sah?.userId === 42 && sah?.idPutaran === "putaranuji1", sah);
  cek("tanda diubah → ditolak", periksaTokenUji(tok.slice(0, -1) + (tok.endsWith("0") ? "1" : "0"), Date.now(), r) === null);
  cek("id akun diganti → ditolak", periksaTokenUji(tok.replace(".42.", ".43."), Date.now(), r) === null);
  cek("rahasia lain → ditolak", periksaTokenUji(tok, Date.now(), "rahasia-lain") === null);
  cek("kedaluwarsa → ditolak", periksaTokenUji(tok, sampai + 1, r) === null);
  cek("bentuk rusak → ditolak", ["ujibeban.", "ujibeban.a.b.c", "ujibeban.putaranuji1.42.123.x", "abc"].every((x) => periksaTokenUji(x, Date.now(), r) === null));
  akhiriPutaranUji("putaranuji1");
  cek("putaran diakhiri → token mati seketika", periksaTokenUji(tok, Date.now(), r) === null);
  let galatTanpaRahasia = false;
  try {
    buatTokenUji("putaranuji2", 1, sampai, "");
  } catch {
    galatTanpaRahasia = true;
  }
  cek("tanpa CRON_SECRET token tidak bisa dibuat", galatTanpaRahasia);
}

console.log("pagar proxy");
{
  const req = (metode: string, path: string, token: string) =>
    new NextRequest(`http://app.test${path}`, { method: metode, headers: { authorization: `Bearer ${token}` } });
  const r1 = proxy(req("POST", "/api/tvr/laporan", "ujibeban.abc"));
  cek("token uji + POST → 403", r1.status === 403);
  const r2 = proxy(req("GET", "/api/master/uji-beban", "ujibeban.abc"));
  cek("token uji + GET rute terlarang → 403", r2.status === 403);
  const r3 = proxy(req("GET", "/api/tvr/laporan?tanggal=2026-09-29", "ujibeban.abc"));
  cek("token uji + GET rute uji → diteruskan", r3.status === 200 && r3.headers.get("x-middleware-next") === "1", r3.status);
  const r4 = proxy(req("POST", "/api/tvr/laporan", "token-biasa"));
  cek("token biasa tidak terpengaruh", r4.status === 200 && r4.headers.get("x-middleware-next") === "1");
  // Alih database 30 Sep 2026: alamat database baru selalu ada di connect-src.
  const hubung = /connect-src ([^;]*)/.exec(r4.headers.get("content-security-policy") ?? "")?.[1] ?? "";
  cek("CSP connect-src memuat https://db.pri-superapp.com", hubung.split(" ").includes("https://db.pri-superapp.com"), hubung);
  cek("CSP connect-src memuat wss://db.pri-superapp.com", hubung.split(" ").includes("wss://db.pri-superapp.com"), hubung);
}

console.log("mesin uji melawan server tiruan");
type Catat = { path: string; metode: string; sah: boolean; t: number };
const catatan: Catat[] = [];
let mode: "baik" | "rusak" = "baik";
const server = http.createServer((req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  const auth = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
  catatan.push({ path: u.pathname, metode: req.method ?? "", sah: periksaTokenUji(auth) !== null, t: Date.now() });
  setTimeout(() => {
    if (mode === "rusak") {
      res.writeHead(500);
      return res.end("{}");
    }
    // /api/asisten selalu dipanggil saat "login" → pasti ada jawaban 403 (akun tanpa akses).
    res.writeHead(u.pathname === "/api/asisten" ? 403 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  }, 5 + Math.random() * 15);
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const asal = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
let tersimpan = 0;
const dep = (tingkat: () => string = () => "normal") => ({
  asal,
  ambilAkun: async (maks: number) => Array.from({ length: Math.min(maks, 5) }, (_, i) => 100 + i),
  ambilKonteks: async () => konteks,
  cuplikanCpu: async () => null,
  tingkatDb: tingkat,
  simpanHasil: async () => {
    tersimpan++;
  },
  catat: () => {},
  skalaWaktu: 0.2,
});

{
  const s = await jalankanUji({ jumlah: 8, skenario: "berat", durasiTahapDetik: 5 }, "Penguji", dep());
  cek("empat tahap 2/4/6/8 orang", JSON.stringify(s.hasil.map((h) => h.orang)) === "[2,4,6,8]", s.hasil.map((h) => h.orang));
  const sesi = catatan.filter((c) => c.path === "/api/sesi").length;
  cek("serbuan login: /api/sesi tepat sekali per orang (8)", sesi === 8, sesi);
  cek("semua permintaan GET", catatan.every((c) => c.metode === "GET"));
  cek("semua permintaan membawa token uji yang sah selama uji", catatan.every((c) => c.sah), catatan.filter((c) => !c.sah).slice(0, 3));
  const pathBuka = new Set(langkahBuka(konteks).map((p) => new URL(p, "http://x").pathname));
  const aksiBerat = catatan.filter((c) => c.path !== "/api/detak" && !pathBuka.has(c.path)).length;
  cek("ada detak & aksi berat di luar serbuan login", catatan.some((c) => c.path === "/api/detak") && aksiBerat > 0, aksiBerat);
  cek("403 dihitung 'ditolak', bukan galat → semua tahap aman", s.hasil.every((h) => h.aman && h.galat === 0) && s.hasil.some((h) => h.ditolak > 0), s.hasil);
  cek("kesimpulan aman sampai 8 orang", s.aman_sampai === 8 && !s.berjalan && s.alasan_berhenti === null, s);
  cek("hasil disimpan sekali", tersimpan === 1);
  // Permintaan yang sudah terkirim tepat sebelum dibatalkan boleh tiba sesaat
  // kemudian; yang diuji: tidak ada permintaan BARU sesudah uji selesai.
  await tidur(300);
  const n = catatan.length;
  await tidur(1000);
  cek("sesudah selesai tidak ada permintaan baru", catatan.length === n, { sebelum: n, sesudah: catatan.length });
  const tok = buatTokenUji(s.id, 100, Date.now() + 60_000);
  cek("token putaran yang selesai sudah mati", periksaTokenUji(tok) === null);
}

{
  catatan.length = 0;
  mode = "rusak";
  const s = await jalankanUji({ jumlah: 8, skenario: "berat", durasiTahapDetik: 20 }, "Penguji", dep());
  mode = "baik";
  cek("server rusak → berhenti otomatis karena galat", !s.berjalan && (s.alasan_berhenti ?? "").includes("Galat") && s.aman_sampai === 0, s.alasan_berhenti);
  cek("berhenti di tahap pertama", s.hasil.length === 1, s.hasil.length);
}

{
  let macet = false;
  const janji = jalankanUji({ jumlah: 8, skenario: "normal", durasiTahapDetik: 20 }, "Penguji", dep(() => (macet ? "macet" : "normal")));
  await tidur(600);
  macet = true;
  const s = await janji;
  cek("database macet → berhenti otomatis", (s.alasan_berhenti ?? "").includes("macet"), s.alasan_berhenti);
}

{
  const janji = jalankanUji({ jumlah: 8, skenario: "normal", durasiTahapDetik: 20 }, "Penguji", dep());
  await tidur(500);
  cek("selagi berjalan status terbaca", statusUjiBeban()?.berjalan === true);
  cek("hentikan manual", hentikanUjiBeban("Dihentikan penguji.") === true);
  const s = await janji;
  cek("alasan berhenti tercatat, status selesai", s.alasan_berhenti === "Dihentikan penguji." && !s.berjalan && statusUjiBeban()?.berjalan === false);
  cek("hentikan saat tidak berjalan → false", hentikanUjiBeban() === false);
}
server.close();

// Database dipasang sendiri (30 Sep 2026): CPU database dibaca dari /proc/stat mesin.
{
  const { cuplikanCpuMesin, databaseDiSupabaseCloud } = await import("@/lib/metrik-server");
  cek("alamat *.supabase.co → Cloud", databaseDiSupabaseCloud("https://pichnkyjepsirpclofhs.supabase.co") === true);
  cek("alamat dipasang sendiri → bukan Cloud", databaseDiSupabaseCloud("https://db.pri-superapp.com") === false);
  cek("alamat menyamar → bukan Cloud", databaseDiSupabaseCloud("https://supabase.co.jahat.com") === false);
  cek("alamat kosong/rusak → bukan Cloud", databaseDiSupabaseCloud("") === false && databaseDiSupabaseCloud("bukan url") === false);
  const a = cuplikanCpuMesin("cpu  100 0 50 800 50 0 0 0 0 0\ncpu0 1 2 3 4\n");
  cek("cuplikan /proc/stat: idle = idle + iowait", a?.idle === 850 && a?.total === 1000, a);
  const b = cuplikanCpuMesin("cpu  400 0 150 1300 150 0 0 0 0 0\n");
  const persen = a && b ? Math.round((1 - (b.idle - a.idle) / (b.total - a.total)) * 100) : null;
  cek("dua cuplikan → CPU 40%", persen === 40, persen);
  cek("teks rusak → null", cuplikanCpuMesin("bukan stat") === null && cuplikanCpuMesin("") === null);
}

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
