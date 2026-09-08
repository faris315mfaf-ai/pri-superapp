// =====================================================================
// LANGKAH 6 — Memeriksa hasil migrasi SEBELUM aplikasi dipindahkan.
//
// Yang diperiksa:
//   1. Jumlah baris SETIAP tabel & view: Cloud vs VPS harus sama.
//   2. Jumlah berkas & ukuran tiap bucket Storage.
//   3. Fungsi database (RPC) bisa dipanggil di VPS.
//   4. Realtime (siaran) di VPS benar-benar sampai ke pendengar.
//
// Keluar dengan kode 1 kalau ada satu saja yang berbeda, supaya tidak
// ada migrasi setengah jalan yang lolos.
//
// Dijalankan lewat: bash 00-node.sh 06-uji-migrasi.mjs
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const wajib = (k) => {
  const v = (process.env[k] ?? "").trim();
  if (!v) {
    console.error(`Env ${k} belum diisi.`);
    process.exit(1);
  }
  return v;
};
const SUMBER_URL = wajib("SUMBER_URL"), SUMBER_KEY = wajib("SUMBER_KEY");
const TUJUAN_URL = wajib("TUJUAN_URL"), TUJUAN_KEY = wajib("TUJUAN_KEY");

let beda = 0;
const cek = (nama, ok, info = "") => {
  console.log(`  ${ok ? "OK  " : "BEDA"} ${nama}${info ? " — " + info : ""}`);
  if (!ok) beda++;
};

/** Daftar tabel & view yang dilayani REST, dibaca dari dokumen OpenAPI. */
async function daftarTabel(url, kunci) {
  const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: kunci, Authorization: `Bearer ${kunci}` } });
  if (!r.ok) throw new Error(`OpenAPI ${url}: HTTP ${r.status}`);
  const j = await r.json();
  const nama = new Set();
  for (const k of Object.keys(j.definitions ?? {})) nama.add(k);
  for (const k of Object.keys(j.components?.schemas ?? {})) nama.add(k);
  for (const k of Object.keys(j.paths ?? {})) {
    if (k.startsWith("/") && k.length > 1 && !k.startsWith("/rpc/")) nama.add(k.slice(1));
  }
  return [...nama].filter((n) => n && !n.includes("{")).sort();
}

async function jumlahBaris(url, kunci, tabel) {
  const r = await fetch(`${url}/rest/v1/${encodeURIComponent(tabel)}?select=*`, {
    method: "HEAD",
    headers: { apikey: kunci, Authorization: `Bearer ${kunci}`, Prefer: "count=exact", Range: "0-0" },
  });
  if (!r.ok && r.status !== 206) return null;
  const cr = r.headers.get("content-range") ?? "";
  const n = Number(cr.split("/")[1]);
  return Number.isFinite(n) ? n : null;
}

console.log("== 1. Jumlah baris tiap tabel/view ==");
const tabel = await daftarTabel(SUMBER_URL, SUMBER_KEY);
console.log(`  memeriksa ${tabel.length} tabel/view…`);
const bedaTabel = [];
for (const t of tabel) {
  const [a, b] = await Promise.all([
    jumlahBaris(SUMBER_URL, SUMBER_KEY, t),
    jumlahBaris(TUJUAN_URL, TUJUAN_KEY, t),
  ]);
  if (a === null && b === null) continue;
  if (a !== b) bedaTabel.push({ tabel: t, cloud: a, vps: b });
}
if (bedaTabel.length === 0) cek("semua tabel & view sama", true, `${tabel.length} diperiksa`);
else {
  cek("jumlah baris", false, `${bedaTabel.length} tabel berbeda`);
  for (const d of bedaTabel.slice(0, 20)) console.log(`       ${d.tabel}: cloud=${d.cloud} vps=${d.vps}`);
}

console.log("\n== 2. Berkas Storage ==");
const opsi = { auth: { persistSession: false, autoRefreshToken: false } };
const sumber = createClient(SUMBER_URL, SUMBER_KEY, opsi);
const tujuan = createClient(TUJUAN_URL, TUJUAN_KEY, opsi);

async function isiBucket(klien, bucket, awalan = "") {
  const hasil = [];
  for (let mulai = 0; ; ) {
    const { data, error } = await klien.storage
      .from(bucket)
      .list(awalan, { limit: 100, offset: mulai, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${bucket}/${awalan}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const e of data) {
      const jalur = awalan ? `${awalan}/${e.name}` : e.name;
      if (e.id === null || e.id === undefined) hasil.push(...(await isiBucket(klien, bucket, jalur)));
      else hasil.push({ jalur, ukuran: Number(e.metadata?.size ?? 0) });
    }
    mulai += data.length;
    if (data.length < 100) break;
  }
  return hasil;
}

const { data: bucketSumber } = await sumber.storage.listBuckets();
for (const b of bucketSumber ?? []) {
  const [a, c] = await Promise.all([isiBucket(sumber, b.name), isiBucket(tujuan, b.name).catch(() => [])]);
  const byteA = a.reduce((s, f) => s + f.ukuran, 0);
  const byteC = c.reduce((s, f) => s + f.ukuran, 0);
  cek(
    `bucket ${b.name}`,
    a.length === c.length && byteA === byteC,
    `cloud ${a.length} berkas/${(byteA / 1048576).toFixed(1)} MB — vps ${c.length}/${(byteC / 1048576).toFixed(1)} MB`,
  );
}

console.log("\n== 3. Fungsi database (RPC) di VPS ==");
{
  const { error } = await tujuan.rpc("kuota_penyimpanan");
  cek("kuota_penyimpanan()", !error, error?.message ?? "");
}
{
  const { error } = await tujuan.rpc("zona_cakupan", { akar: 1 });
  cek("zona_cakupan(akar)", !error, error?.message ?? "");
}

console.log("\n== 4. Realtime (siaran) di VPS ==");
{
  const kunciPublik = (process.env.TUJUAN_ANON_KEY ?? "").trim();
  if (!kunciPublik) {
    console.log("  LEWATI — isi TUJUAN_ANON_KEY di env-migrasi.txt untuk menguji realtime.");
  } else {
    const klien = createClient(TUJUAN_URL, kunciPublik, opsi);
    const kanal = klien.channel("uji-migrasi", { config: { broadcast: { self: true, ack: false } } });
    const sampai = await new Promise((selesai) => {
      const waktu = setTimeout(() => selesai(false), 20000);
      kanal
        .on("broadcast", { event: "halo" }, () => {
          clearTimeout(waktu);
          selesai(true);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") kanal.send({ type: "broadcast", event: "halo", payload: { uji: 1 } });
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(waktu);
            selesai(false);
          }
        });
    });
    await klien.removeAllChannels();
    cek("siaran realtime diterima", sampai, sampai ? "" : "kanal tidak menyambung dalam 20 detik");
  }
}

console.log(`\n=== HASIL: ${beda === 0 ? "SEMUA COCOK — aman dilanjutkan" : beda + " pemeriksaan BERBEDA — jangan pindah dulu"} ===`);
process.exit(beda === 0 ? 0 : 1);
