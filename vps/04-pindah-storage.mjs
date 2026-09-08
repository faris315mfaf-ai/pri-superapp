// =====================================================================
// LANGKAH 4 — Menyalin BERKAS Storage dari Supabase Cloud ke VPS.
// 8 bucket, 520 berkas, ±3,8 GB (terbesar: tvrku 3,7 GB).
//
// Cara kerjanya: bucket dibuat ulang dengan pengaturan yang sama
// (publik/privat, batas ukuran, tipe yang diizinkan), lalu tiap berkas
// diunduh dari Cloud dan diunggah ke VPS pada JALUR YANG SAMA. Jalur
// sama itu penting: URL publik lama dan baru cuma beda nama domain,
// sehingga langkah 5 tinggal mengganti domainnya di database.
//
// Aman diulang (resume): berkas yang sudah ada di VPS dengan ukuran
// sama akan dilewati, jadi kalau putus di tengah tinggal jalankan lagi.
//
// Dijalankan lewat: bash 00-node.sh 04-pindah-storage.mjs
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const wajib = (k) => {
  const v = (process.env[k] ?? "").trim();
  if (!v) {
    console.error(`Env ${k} belum diisi (lihat env-migrasi.contoh.txt).`);
    process.exit(1);
  }
  return v;
};
const opsi = { auth: { persistSession: false, autoRefreshToken: false } };
const sumber = createClient(wajib("SUMBER_URL"), wajib("SUMBER_KEY"), opsi);
const tujuan = createClient(wajib("TUJUAN_URL"), wajib("TUJUAN_KEY"), opsi);
const BATAS_PARALEL = 4;

const mb = (b) => (b / 1024 / 1024).toFixed(1) + " MB";

/** Semua berkas dalam satu bucket, termasuk yang ada di dalam folder. */
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
      // Entri tanpa id = folder, bukan berkas.
      if (e.id === null || e.id === undefined) hasil.push(...(await isiBucket(klien, bucket, jalur)));
      else hasil.push({ jalur, ukuran: Number(e.metadata?.size ?? 0), tipe: e.metadata?.mimetype || undefined });
    }
    mulai += data.length;
    if (data.length < 100) break;
  }
  return hasil;
}

/** Jalankan tugas dengan batas paralel supaya RAM dan jaringan aman. */
async function antre(daftar, batas, kerja) {
  let indeks = 0;
  const pekerja = Array.from({ length: Math.min(batas, daftar.length) }, async () => {
    for (;;) {
      const i = indeks++;
      if (i >= daftar.length) return;
      await kerja(daftar[i], i);
    }
  });
  await Promise.all(pekerja);
}

async function salinBerkas(bucket, berkas) {
  let galatTerakhir = null;
  for (let coba = 1; coba <= 3; coba++) {
    try {
      const { data, error } = await sumber.storage.from(bucket).download(berkas.jalur);
      if (error) throw new Error(`unduh: ${error.message}`);
      const isi = Buffer.from(await data.arrayBuffer());
      const { error: e2 } = await tujuan.storage.from(bucket).upload(berkas.jalur, isi, {
        contentType: berkas.tipe || data.type || "application/octet-stream",
        upsert: true,
      });
      if (e2) throw new Error(`unggah: ${e2.message}`);
      return true;
    } catch (e) {
      galatTerakhir = e;
      await new Promise((r) => setTimeout(r, coba * 2000));
    }
  }
  console.error(`  GAGAL ${bucket}/${berkas.jalur}: ${galatTerakhir?.message ?? galatTerakhir}`);
  return false;
}

const t0 = Date.now();
const { data: bucketSumber, error: eb } = await sumber.storage.listBuckets();
if (eb) throw new Error(`listBuckets sumber: ${eb.message}`);
const { data: bucketTujuan, error: eb2 } = await tujuan.storage.listBuckets();
if (eb2) throw new Error(`listBuckets tujuan: ${eb2.message}`);
const adaDiTujuan = new Set((bucketTujuan ?? []).map((b) => b.name));

let totalSalin = 0, totalLewat = 0, totalGagal = 0, totalByte = 0;
const ringkas = [];

for (const b of bucketSumber ?? []) {
  const pengaturan = {
    public: b.public,
    fileSizeLimit: b.file_size_limit ?? undefined,
    allowedMimeTypes: b.allowed_mime_types ?? undefined,
  };
  if (!adaDiTujuan.has(b.name)) {
    const { error } = await tujuan.storage.createBucket(b.name, pengaturan);
    if (error) throw new Error(`buat bucket ${b.name}: ${error.message}`);
    console.log(`bucket dibuat: ${b.name} (${b.public ? "publik" : "privat"})`);
  } else {
    await tujuan.storage.updateBucket(b.name, pengaturan);
  }

  const daftarSumber = await isiBucket(sumber, b.name);
  const daftarTujuan = await isiBucket(tujuan, b.name);
  const sudah = new Map(daftarTujuan.map((f) => [f.jalur, f.ukuran]));
  const perlu = daftarSumber.filter((f) => sudah.get(f.jalur) !== f.ukuran);
  const byteBucket = daftarSumber.reduce((a, f) => a + f.ukuran, 0);
  console.log(`\n[${b.name}] ${daftarSumber.length} berkas (${mb(byteBucket)}) — perlu disalin: ${perlu.length}`);

  let selesai = 0, gagal = 0;
  await antre(perlu, BATAS_PARALEL, async (f) => {
    const ok = await salinBerkas(b.name, f);
    if (ok) selesai++;
    else gagal++;
    if ((selesai + gagal) % 20 === 0 || selesai + gagal === perlu.length) {
      console.log(`  ${selesai + gagal}/${perlu.length} (gagal ${gagal})`);
    }
  });

  totalSalin += selesai;
  totalGagal += gagal;
  totalLewat += daftarSumber.length - perlu.length;
  totalByte += byteBucket;
  ringkas.push({ bucket: b.name, sumber: daftarSumber.length, disalin: selesai, gagal });
}

console.log("\n=== RINGKASAN ===");
for (const r of ringkas) console.log(`${r.bucket}: ${r.sumber} berkas, disalin ${r.disalin}, gagal ${r.gagal}`);
console.log(`Total: salin ${totalSalin}, lewati ${totalLewat}, gagal ${totalGagal}, ${mb(totalByte)}, ${Math.round((Date.now() - t0) / 1000)} dtk`);
process.exit(totalGagal > 0 ? 1 : 0);
