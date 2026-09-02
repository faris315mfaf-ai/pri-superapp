// Menguji hitungJendela() HARIAN langsung dari n8n_kode/1-hasil1.js —
// aturan: scraping hanya postingan pada SATU tanggal (00:00–23:59:59 WIB),
// tanggal bisa dipilih; batas efektif = min(tutup hari, jam sekarang).
import { readFileSync } from 'node:fs';
const src = readFileSync('n8n_kode/1-hasil1.js', 'utf8');
const off = src.match(/const OFFSET_WIB_DETIK[^\n]*/)[0];
const fn  = src.match(/function hitungJendela\(tanggalStr, sekarangMs\) \{[\s\S]*?\n\}/)[0];
const hitungJendela = new Function(`${off}\n${fn}\nreturn hitungJendela;`)();

const WIB = (s) => new Date(s).getTime();
const jam = (u) => new Date(u * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' });

let gagal = 0;
const cek = (nama, dapat, harap) => {
  const ok = String(dapat) === String(harap);
  if (!ok) gagal++;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}: ${dapat}${ok ? '' : `  (harap ${harap})`}`);
};

// 1. Tanpa tanggal (default hari ini), analisis jam 15.00
let j = hitungJendela(null, WIB('2026-08-24T15:00:00+07:00'));
console.log('--- default hari ini, jam 15.00 ---');
cek('awal', jam(j.awalUnix), '2026-08-24 00:00:00');
cek('tutup', jam(j.akhirUnix), '2026-08-24 23:59:59');
cek('efektif = jam sekarang', jam(j.akhirEfektifUnix), '2026-08-24 15:00:00');
cek('periode', j.periode, '2026-08-24 00:00-23:59');
cek('tanggal', j.tanggal, '2026-08-24');

// 2. Tanggal KEMARIN dipilih → jendela penuh sehari kemarin
j = hitungJendela('2026-08-23', WIB('2026-08-24T15:00:00+07:00'));
console.log('--- pilih kemarin (23 Agu) ---');
cek('awal', jam(j.awalUnix), '2026-08-23 00:00:00');
cek('efektif = tutup hari itu', jam(j.akhirEfektifUnix), '2026-08-23 23:59:59');
cek('periode', j.periode, '2026-08-23 00:00-23:59');

// 3. Hari ini dipilih eksplisit → efektif tetap jam sekarang
j = hitungJendela('2026-08-24', WIB('2026-08-24T09:30:00+07:00'));
console.log('--- pilih hari ini, jam 09.30 ---');
cek('efektif', jam(j.akhirEfektifUnix), '2026-08-24 09:30:00');

// 4. Tanggal MASA DEPAN → harus terdeteksi (efektif < awal)
j = hitungJendela('2026-08-25', WIB('2026-08-24T15:00:00+07:00'));
console.log('--- pilih besok (masa depan) ---');
cek('terdeteksi masa depan', j.akhirEfektifUnix < j.awalUnix, true);

// 5. Lewat tengah malam WIB 00.05 tanpa tanggal → hari BARU
j = hitungJendela(null, WIB('2026-08-25T00:05:00+07:00'));
console.log('--- default, 00.05 dini hari ---');
cek('awal', jam(j.awalUnix), '2026-08-25 00:00:00');
cek('efektif', jam(j.akhirEfektifUnix), '2026-08-25 00:05:00');

// 6. Batas bulan: scrape 31 Agu dari tanggal 1 Sep
j = hitungJendela('2026-08-31', WIB('2026-09-01T10:00:00+07:00'));
console.log('--- 31 Agu di-scrape 1 Sep ---');
cek('awal', jam(j.awalUnix), '2026-08-31 00:00:00');
cek('tutup', jam(j.akhirUnix), '2026-08-31 23:59:59');
cek('periode', j.periode, '2026-08-31 00:00-23:59');

// 7. Panjang jendela persis 1 hari kurang 1 detik
cek('panjang jendela (detik)', j.akhirUnix - j.awalUnix, 24 * 3600 - 1);

console.log(`\n===== ${gagal === 0 ? 'SEMUA LULUS' : gagal + ' GAGAL'} =====`);
process.exit(gagal ? 1 : 0);
