// Uji penjaga Supabase, pembatas per proses, dan rencana sinkron akun tertaut (28 Sep 2026).
// Jalankan: npx tsx tests/uji-penjaga-supabase.mts
// Bagian integrasi memakai server PostgREST TIRUAN di 127.0.0.1 — tidak menyentuh Supabase asli.
import "./_als-next.mts";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import {
  AMBANG_LAMBAT_MS,
  AMBANG_MACET_MS,
  Pencatat,
  Penjaga,
  buatFetchTerjaga,
  jalankanLatar,
  lajurSaatIni,
  bentukKueri,
  sasaranRest,
  adalahPenulisan,
  melayaniPenggunaUji,
  type OpsiPenjaga,
} from "@/lib/penjaga-supabase";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { bolehSekarang, kosongkanJedaInstans } from "@/lib/jeda-instans";
import { akunUnik, rencanaSinkronAkun } from "@/lib/sinkron-akun-tertaut";
import { bolehUlangJaringan, jenisGalatJaringan, kodeGalat } from "@/lib/jaringan-keluar";

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
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));
const opsi = (o: Partial<OpsiPenjaga> = {}): OpsiPenjaga => ({
  maksTotal: 2,
  maksLatar: 1,
  maksAntre: { pengguna: 3, latar: 2 },
  batasMs: { pengguna: 800, latar: 800 },
  ...o,
});

console.log("sasaranRest");
cek("tabel", sasaranRest("https://x.supabase.co/rest/v1/app_user?select=id") === "app_user");
cek("rpc", sasaranRest("https://x.supabase.co/rest/v1/rpc/fungsi_saya") === "rpc/fungsi_saya");
cek("storage bukan REST", sasaranRest("https://x.supabase.co/storage/v1/object/a/b.mp4") === null);
cek("akar", sasaranRest("https://x.supabase.co/rest/v1/") === "(akar)");
cek(
  "bentuk kueri tanpa nilai",
  bentukKueri("https://x/rest/v1/app_user?select=id%2Cnama&id=in.%281%2C2%29&aktif=eq.true&limit=5", "GET", "app_user") ===
    "GET app_user?select=id,nama&id=in&aktif=eq&limit",
  bentukKueri("https://x/rest/v1/app_user?select=id%2Cnama&id=in.%281%2C2%29&aktif=eq.true&limit=5", "GET", "app_user"),
);
cek("bentuk tanpa query", bentukKueri("https://x/rest/v1/tabel", "POST", "tabel") === "POST tabel");

console.log("antrean & jatah");
{
  const p = new Penjaga(opsi());
  const tenggat = () => Date.now() + 800;
  const l1 = await p.ambil("pengguna", tenggat());
  const l2 = await p.ambil("pengguna", tenggat());
  let ketiga = false;
  const janji = p.ambil("pengguna", tenggat()).then((l) => {
    ketiga = true;
    return l;
  });
  await tidur(20);
  cek("slot penuh → permintaan ketiga menunggu", !ketiga);
  l1();
  const l3 = await janji;
  cek("slot dilepas → yang menunggu jalan", ketiga);
  l2();
  l3();
  cek("semua dilepas → aktif 0", p.kondisi().aktif === 0, p.kondisi());
  l1();
  cek("lepas dua kali tidak membuat aktif negatif", p.kondisi().aktif === 0, p.kondisi());
}
{
  const p = new Penjaga(opsi());
  const tenggat = () => Date.now() + 800;
  const a = await p.ambil("latar", tenggat());
  let latarKedua = false;
  const jl = p.ambil("latar", tenggat()).then((l) => {
    latarKedua = true;
    return l;
  });
  const b = await p.ambil("pengguna", tenggat());
  cek("jatah latar 1: latar kedua menunggu walau total masih ada slot", !latarKedua);
  let pengguna2 = false;
  const jp = p.ambil("pengguna", tenggat()).then((l) => {
    pengguna2 = true;
    return l;
  });
  await tidur(10);
  a();
  await tidur(10);
  cek("slot kosong diberikan ke PENGGUNA lebih dulu", pengguna2 && !latarKedua, { pengguna2, latarKedua });
  b();
  const l = await jl;
  cek("latar menyusul setelah pengguna", latarKedua);
  l();
  (await jp)();
}
{
  const p = new Penjaga(opsi({ maksTotal: 1, maksAntre: { pengguna: 1, latar: 1 } }));
  const l = await p.ambil("pengguna", Date.now() + 500);
  const antre = p.ambil("pengguna", Date.now() + 500).catch((e: Error) => e);
  let galat: unknown = null;
  try {
    await p.ambil("pengguna", Date.now() + 500);
  } catch (e) {
    galat = e;
  }
  cek("antrean penuh → langsung ditolak", galat instanceof Error && galat.name === "AbortError", String(galat));
  const e2 = await antre;
  cek("tenggat antre lewat → ditolak (AbortError, 'waktu tunggu')", e2 instanceof Error && e2.name === "AbortError" && e2.message.includes("waktu tunggu"), String(e2));
  l();
  cek("waktu habis & penolakan membuat kondisi 'lambat'", p.kondisi().tingkat === "lambat", p.kondisi());
}

console.log("kondisi & rem latar");
{
  let t = 1_000_000;
  const p = new Penjaga(opsi({ maksLatar: 8, kini: () => t }));
  cek("tanpa sampel = normal, jatah latar penuh", p.kondisi().tingkat === "normal" && p.kondisi().jatahLatar === 8);
  for (let i = 0; i < 4; i++) p.catatJawaban(AMBANG_MACET_MS + 100);
  cek("sampel < 5 belum dinilai", p.kondisi().p50 === null && p.kondisi().tingkat === "normal");
  p.catatJawaban(AMBANG_MACET_MS + 100);
  cek("p50 ≥ 4 dtk → macet, jatah latar 1", p.kondisi().tingkat === "macet" && p.kondisi().jatahLatar === 1, p.kondisi());
  t += 61_000;
  cek("sampel lewat 60 dtk dilupakan → normal lagi", p.kondisi().tingkat === "normal", p.kondisi());
  for (let i = 0; i < 9; i++) p.catatJawaban(AMBANG_LAMBAT_MS + 10);
  for (let i = 0; i < 2; i++) p.catatJawaban(100);
  cek("p50 ≥ 1,5 dtk → lambat, jatah latar 3", p.kondisi().tingkat === "lambat" && p.kondisi().jatahLatar === 3, p.kondisi());
  t += 61_000;
  for (let i = 0; i < 20; i++) p.catatJawaban(150);
  p.catatJawaban(90_000); // satu kueri berat tidak mengubah median
  cek("satu kueri berat di antara yang cepat → tetap normal", p.kondisi().tingkat === "normal", p.kondisi());
  for (let i = 0; i < 5; i++) p.catatWaktuHabis();
  cek("5 waktu habis dalam semenit → macet", p.kondisi().tingkat === "macet");
}

console.log("pencatat per menit");
{
  let t = 0;
  const c = new Pencatat(() => t);
  const k = { tingkat: "normal" as const, p50: 100, waktuHabis60: 0, aktif: 0, antre: 0, jatahLatar: 8 };
  cek("tanpa lalu lintas → null", c.tutup(k) === null);
  for (let i = 0; i < 30; i++) c.catat("pengguna GET app_user", 100, false);
  for (let i = 0; i < 10; i++) c.catat("latar:metrik-video POST tvr_video_metrik", 300, i === 0);
  c.catatTolak(true);
  c.catatAntre(7);
  t = 60_000;
  const r = c.tutup(k) as { n: number; per_dtk: number; atas: [string, number, number, number][]; waktu_habis: number; antre_maks: number };
  cek("jumlah & laju", r.n === 40 && r.per_dtk === 0.7, r);
  cek("urutan teratas & rata-rata ms", r.atas[0][0] === "pengguna GET app_user" && r.atas[0][1] === 30 && r.atas[1][2] === 300 && r.atas[1][3] === 1, r.atas);
  cek("waktu habis & antre maks tercatat", r.waktu_habis === 1 && r.antre_maks === 7, r);
  t = 120_000;
  cek("jendela direset setelah ditutup", c.tutup(k) === null);

  // Per rute: panggilan API + kueri Supabase, dinormalkan per orang online.
  for (let i = 0; i < 5; i++) c.catatApi("/api/tvr/laporan");
  for (let i = 0; i < 60; i++) {
    c.catatRute("/api/tvr/laporan");
    c.catat("pengguna GET laporan_video", 100, false);
  }
  c.catatApi("/api/ping");
  for (let i = 0; i < 20; i++) {
    c.catatRute("latar:metrik-video");
    c.catat("latar:metrik-video GET tvr_video_metrik", 100, false);
  }
  t = 180_000;
  const rr = c.tutup(k, 10) as { api_n: number; online: number; db_per_orang_menit: number; rute_atas: [string, number, number][] };
  cek("panggilan API dihitung", rr.api_n === 6, rr);
  cek("rute teratas menurut kueri, lengkap dengan jumlah API", rr.rute_atas[0][0] === "/api/tvr/laporan" && rr.rute_atas[0][1] === 5 && rr.rute_atas[0][2] === 60, rr.rute_atas);
  cek("rute tanpa kueri tetap tercatat", rr.rute_atas.some(([r, api, db]) => r === "/api/ping" && api === 1 && db === 0), rr.rute_atas);
  cek("beban per orang = 80 kueri / 10 online / 1 menit = 8", rr.online === 10 && rr.db_per_orang_menit === 8, rr);
  t = 240_000;
  c.catatApi("/api/ping");
  const hanyaApi = c.tutup(k, null) as { n: number; api_n: number; db_per_orang_menit: null } | null;
  cek("menit tanpa kueri tapi ada API tetap dilaporkan; online tak diketahui → null", hanyaApi !== null && hanyaApi.n === 0 && hanyaApi.api_n === 1 && hanyaApi.db_per_orang_menit === null, hanyaApi);
}

console.log("pembatas per proses");
{
  kosongkanJedaInstans();
  cek("pertama boleh", bolehSekarang("x", 1000, 0));
  cek("dalam jeda ditolak", !bolehSekarang("x", 1000, 500));
  cek("kunci lain tidak terpengaruh", bolehSekarang("y", 1000, 500));
  cek("lewat jeda boleh lagi", bolehSekarang("x", 1000, 1000));
}

console.log("rencana sinkron akun tertaut");
{
  const A = (id: number, user_id: number, platform: string, username: string, terhubung: boolean | null = true) => ({ id, user_id, platform, username, terhubung });
  const r = rencanaSinkronAkun(
    7,
    [
      { platform: "tiktok", username: "@Baru" },
      { platform: "instagram", username: "punyaku" },
      { platform: "youtube", username: "punyaku_yt" },
      { platform: "facebook", username: "orang.lain" },
      { platform: "threads", username: "a_b" },
      { platform: "tiktok", username: "baru" },
      { platform: "twitter", username: "  " },
    ],
    [
      A(1, 7, "instagram", "PunyaKu", false),
      A(2, 7, "youtube", "punyaku_yt", true),
      A(3, 9, "facebook", "orang.lain"),
      A(4, 9, "threads", "axb"), // cocok ilike "a_b" tapi BUKAN orang yang sama
    ],
  );
  cek("akun baru disisipkan (sekali, huruf kecil, tanpa @)", r.sisipkan.length === 2 && r.sisipkan.some((a) => a.platform === "tiktok" && a.username === "baru"), r.sisipkan);
  cek("wildcard ilike yang kebablasan tidak dianggap sama", r.sisipkan.some((a) => a.platform === "threads" && a.username === "a_b"));
  cek("milik sendiri belum terhubung → ditandai", r.tandai.length === 1 && r.tandai[0] === 1, r.tandai);
  cek("milik sendiri sudah terhubung → tidak ditulis ulang", !r.tandai.includes(2));
  cek("milik orang lain → konflik", r.konflik.length === 1 && r.konflik[0].includes("@orang.lain (facebook)"), r.konflik);
  const g = rencanaSinkronAkun(7, [{ platform: "tiktok", username: "ganda" }], [A(5, 9, "tiktok", "GANDA"), A(6, 7, "tiktok", "ganda", false)]);
  cek("baris ganda beda huruf: milik sendiri didahulukan", g.tandai[0] === 6 && g.konflik.length === 0, g);
  cek("akunUnik membuang kosong & ganda", akunUnik([{ platform: "x", username: "@A" }, { platform: "X", username: "a" }, { platform: "", username: "b" }]).length === 1);
}

console.log("integrasi: klien supabase-js + server tiruan");
{
  let permintaan = 0;
  const jalanPerJalur = { latar: 0, maksLatar: 0 };
  const server = http.createServer((req, res) => {
    permintaan++;
    const u = req.url ?? "";
    const tunda = Number(new URL(u, "http://x").searchParams.get("tunda") ?? 0);
    const latar = req.headers["x-uji-lajur"] === "latar";
    const tundaLambat = u.includes("lambat") ? 1500 : u.includes("sedang") ? 250 : tunda;
    if (latar) {
      jalanPerJalur.latar++;
      jalanPerJalur.maksLatar = Math.max(jalanPerJalur.maksLatar, jalanPerJalur.latar);
    }
    setTimeout(() => {
      if (latar) jalanPerJalur.latar--;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ id: 1 }]));
    }, tundaLambat);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const penjaga = new Penjaga({ maksTotal: 4, maksLatar: 1, maksAntre: { pengguna: 50, latar: 50 }, batasMs: { pengguna: 700, latar: 3000 } });
  const pencatat = new Pencatat();
  const f = buatFetchTerjaga(penjaga, pencatat);
  // Tandai lajur di header supaya server tiruan bisa menghitung kebersamaan latar.
  const fBertanda: typeof fetch = (m, i) =>
    f(m, { ...i, headers: { ...(i?.headers as Record<string, string>), "x-uji-lajur": lajurSaatIni().lajur } });
  const db = createClient(`http://127.0.0.1:${port}`, "kunci-uji", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fBertanda },
  });

  const biasa = await db.from("cepat").select("id");
  cek("kueri biasa berhasil", !biasa.error && Array.isArray(biasa.data) && biasa.data.length === 1, biasa.error);

  permintaan = 0;
  const t0 = Date.now();
  const lambat = await db.from("lambat").select("id");
  const lama = Date.now() - t0;
  cek("jawaban lambat diputus pada batas waktu (±0,7 dtk)", Boolean(lambat.error) && lama < 1400, { lama, e: lambat.error?.message });
  cek("galatnya AbortError → postgrest-js TIDAK mengulang (1 permintaan)", (lambat.error?.message ?? "").startsWith("AbortError") && permintaan === 1, { permintaan, m: lambat.error?.message });

  const ac = new AbortController();
  setTimeout(() => ac.abort(), 100);
  const batal = await db.from("lambat").select("id").abortSignal(ac.signal);
  cek(".abortSignal() pemanggil tetap berfungsi", Boolean(batal.error));

  const tanpaJaga = await fetch(`http://127.0.0.1:${port}/storage/v1/object/lambat`);
  cek("non-REST (storage) tidak diputus batas waktu REST", tanpaJaga.ok);

  // Lajur latar dibatasi 1 bersamaan; pengguna tetap jalan paralel.
  jalanPerJalur.maksLatar = 0;
  const tugas = jalankanLatar("uji", () =>
    Promise.all(Array.from({ length: 4 }, (_, i) => db.from("sedang").select("id").eq("i", i))),
  );
  const pengguna = Promise.all(Array.from({ length: 3 }, (_, i) => db.from("sedang").select("id").eq("u", i)));
  const [hl, hp] = await Promise.all([tugas, pengguna]);
  cek("lajur latar: maksimal 1 permintaan bersamaan", jalanPerJalur.maksLatar === 1, jalanPerJalur);
  cek("semua permintaan latar & pengguna tetap selesai", hl.every((r) => !r.error) && hp.every((r) => !r.error));
  const r = pencatat.tutup(penjaga.kondisi()) as { atas: [string][]; waktu_habis: number };
  cek("ringkasan memisahkan lajur (latar:uji GET sedang)", r.atas.some((a) => a[0] === "latar:uji GET sedang") && r.atas.some((a) => a[0] === "pengguna GET sedang"), r.atas);
  cek("waktu habis tercatat di ringkasan", r.waktu_habis >= 1, r);
  const rb = r as unknown as { bentuk_atas: [string, number][] };
  cek("bentuk kueri teratas ikut dilaporkan", rb.bentuk_atas.some(([b]) => b.startsWith("GET sedang?select=id&")), rb.bentuk_atas);
  server.close();
}

console.log("rem penulisan uji beban");
{
  const masuk: string[] = [];
  const server = http.createServer((req, res) => {
    masuk.push(`${req.method} ${new URL(req.url ?? "/", "http://x").pathname}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify([{ id: 1 }]));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const asal = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const f = buatFetchTerjaga(new Penjaga(), new Pencatat());
  const db = createClient(asal, "kunci-uji", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: f } });
  // Tiruan penyimpan permintaan Next: sama bentuknya dengan RequestStore.
  const dalamPermintaan = <T,>(auth: string, kerja: () => Promise<T>) =>
    workUnitAsyncStorage.run({ type: "request", headers: new Headers({ authorization: auth }) } as never, kerja);

  cek("adalahPenulisan: GET/HEAD bukan", !adalahPenulisan(`${asal}/rest/v1/x`, "GET") && !adalahPenulisan(`${asal}/rest/v1/x`, "HEAD"));
  cek("adalahPenulisan: POST/PATCH/DELETE REST ya, RPC tidak", adalahPenulisan(`${asal}/rest/v1/x`, "POST") && adalahPenulisan(`${asal}/rest/v1/x`, "PATCH") && adalahPenulisan(`${asal}/rest/v1/x`, "DELETE") && !adalahPenulisan(`${asal}/rest/v1/rpc/zona_cakupan`, "POST"));
  cek("adalahPenulisan: storage hapus/unggah ya, tanda-tangan & daftar tidak", adalahPenulisan(`${asal}/storage/v1/object/chat`, "DELETE") && adalahPenulisan(`${asal}/storage/v1/object/b/a.mp4`, "POST") && !adalahPenulisan(`${asal}/storage/v1/object/sign/b/a.mp4`, "POST") && !adalahPenulisan(`${asal}/storage/v1/object/list/b`, "POST"));
  cek("di luar permintaan Next → bukan pengguna uji", !melayaniPenggunaUji());

  await dalamPermintaan("Bearer ujibeban.abc123.7.9.sig", async () => {
    cek("header ujibeban terbaca dari penyimpan permintaan", melayaniPenggunaUji());
    masuk.length = 0;
    const baca = await db.from("absensi").select("id");
    cek("pengguna uji: BACA tetap sampai ke database", !baca.error && baca.data?.length === 1 && masuk.includes("GET /rest/v1/absensi"));
    const hapus = await db.from("absensi").delete().lt("tanggal", "2026-01-01");
    const ubah = await db.from("app_user").update({ nama: "x" }).eq("id", 7).select("id").maybeSingle();
    const sisip = await db.from("koin_riwayat").insert({ user_id: 7, jumlah: 5 });
    const berkas = await db.storage.from("chat").remove(["a.png"]);
    cek("pengguna uji: DELETE/PATCH/POST/hapus berkas TIDAK sampai ke database", !masuk.some((m) => !m.startsWith("GET ") && !m.startsWith("POST /rest/v1/rpc/")), masuk);
    cek("…dan kode pemanggil menerima 'berhasil tanpa baris' (tanpa galat)", !hapus.error && !ubah.error && ubah.data === null && !sisip.error && !berkas.error, { hapus: hapus.error, ubah, sisip: sisip.error, berkas: berkas.error });
    const rpc = await db.rpc("zona_cakupan");
    cek("pengguna uji: RPC bacaan tetap jalan", !rpc.error && masuk.includes("POST /rest/v1/rpc/zona_cakupan"));
    // Tugas after() Next berjalan dengan salinan konteks yang sama.
    await new Promise<void>((r) => setTimeout(r, 5));
    masuk.length = 0;
    await db.from("chat_pesan").delete().lt("dibuat_pada", "2026-01-01");
    cek("penulisan dari tugas susulan dalam konteks yang sama juga diblokir", masuk.length === 0, masuk);
  });

  await dalamPermintaan("Bearer token-asli-pengguna", async () => {
    masuk.length = 0;
    const hapus = await db.from("absensi").delete().lt("tanggal", "2026-01-01");
    cek("pengguna ASLI: penulisan tetap berjalan normal", !hapus.error && masuk.includes("DELETE /rest/v1/absensi"), masuk);
  });
  masuk.length = 0;
  await db.from("absensi").delete().lt("tanggal", "2026-01-01");
  cek("tugas berkala (di luar permintaan): penulisan tetap berjalan", masuk.includes("DELETE /rest/v1/absensi"), masuk);
  server.close();
}

console.log("jaringan keluar — sambungan gagal dicoba lagi (insiden IPv4 VPS 29 Sep)");
{
  const galat = (kode: string) => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(kode), { code: kode }) });
  cek("kode galat dibaca dari cause bertingkat", kodeGalat(Object.assign(new TypeError("x"), { cause: { cause: { code: "ECONNRESET" } } })) === "ECONNRESET");
  cek("gagal tersambung (timeout/refused/unreach) = 'sambung'", ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"].every((k) => jenisGalatJaringan(galat(k)) === "sambung"));
  cek("putus di tengah = 'putus'; galat lain = null", jenisGalatJaringan(galat("ECONNRESET")) === "putus" && jenisGalatJaringan(new Error("lain")) === null);
  cek("gagal tersambung boleh diulang untuk POST/PATCH (belum terkirim)", bolehUlangJaringan("POST", "sambung") && bolehUlangJaringan("PATCH", "sambung"));
  cek("putus di tengah: GET boleh, POST TIDAK (bisa dobel tulis)", bolehUlangJaringan("GET", "putus") && !bolehUlangJaringan("POST", "putus"));

  const jalankan = async (urutan: (string | "ok")[], metode = "GET", body?: string, signal?: AbortSignal) => {
    let panggil = 0;
    const tiruan: typeof fetch = async () => {
      const x = urutan[Math.min(panggil, urutan.length - 1)];
      panggil++;
      if (x === "ok") return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      throw galat(x);
    };
    const pc = new Pencatat();
    const f = buatFetchTerjaga(new Penjaga(), pc, undefined, tiruan);
    try {
      const r = await f("http://127.0.0.1:1/rest/v1/uji?select=id", { method: metode, body, signal });
      return { ok: r.ok, panggil, ringkas: pc.tutup({ tingkat: "normal", p50: 0, antre: 0, jatahLatar: 8 } as never) as Record<string, number> | null };
    } catch (e) {
      return { ok: false, panggil, galat: kodeGalat(e), ringkas: pc.tutup({ tingkat: "normal", p50: 0, antre: 0, jatahLatar: 8 } as never) as Record<string, number> | null };
    }
  };
  const a = await jalankan(["UND_ERR_CONNECT_TIMEOUT", "ok"]);
  cek("GET: gagal tersambung sekali → dicoba lagi → berhasil", a.ok && a.panggil === 2, a);
  cek("…dan tercatat di log per menit (ulang_jaringan)", a.ringkas?.ulang_jaringan === 1, a.ringkas);
  const b = await jalankan(["ECONNREFUSED", "ok"], "POST", '{"a":1}');
  cek("POST: gagal tersambung → aman diulang → berhasil", b.ok && b.panggil === 2, b);
  const c = await jalankan(["ECONNRESET", "ok"], "POST", '{"a":1}');
  cek("POST: putus di tengah → TIDAK diulang (cegah tulis dobel)", !c.ok && c.panggil === 1 && c.galat === "ECONNRESET", c);
  const d = await jalankan(["ECONNRESET", "ok"], "GET");
  cek("GET: putus di tengah → diulang", d.ok && d.panggil === 2, d);
  const e = await jalankan(["UND_ERR_CONNECT_TIMEOUT"]);
  cek("gagal terus → berhenti setelah 3 percobaan, galat asli diteruskan", !e.ok && e.panggil === 3 && e.galat === "UND_ERR_CONNECT_TIMEOUT", e);
  const g = await jalankan(["EBUKANJARINGAN", "ok"]);
  cek("galat bukan jaringan → tidak diulang", !g.ok && g.panggil === 1, g);
  const ac = new AbortController();
  ac.abort();
  const h = await jalankan(["UND_ERR_CONNECT_TIMEOUT", "ok"], "GET", undefined, ac.signal);
  cek("dibatalkan pemanggil → tidak diulang", !h.ok && h.panggil === 1, h);
}


console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
process.exit(0);
