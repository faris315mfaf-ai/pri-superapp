// Menguji fungsi murni pengelompokan berita LANGSUNG dari berkas TSX yang
// benar-benar dipakai aplikasi, terhadap data PRODUKSI nyata (bukan karangan).
//
// Anotasi tipe dibuang memakai transpiler TypeScript ASLI milik proyek, bukan
// regex buatan tangan -- regex mudah meleset pada tipe bersarang.
import { readFileSync } from 'node:fs';

const tsx = readFileSync('src/features/tv-rakyat/berita-panel.tsx', 'utf8');

const ambil = (re, nama) => {
  const m = tsx.match(re);
  if (!m) throw new Error('tidak ketemu di TSX: ' + nama);
  return m[0];
};

const potonganTs =
  'type Berita = any;\n\n' +
  [
    ambil(/type DefinisiKelompok = \{[\s\S]*?\n\};/, 'DefinisiKelompok'),
    ambil(/const KELOMPOK_SUMBER[\s\S]*?\n\];/, 'KELOMPOK_SUMBER'),
    ambil(/const KELOMPOK_LAINNYA[\s\S]*?\n\};/, 'KELOMPOK_LAINNYA'),
    ambil(/const PETA_AKUN[\s\S]*?\n\);/, 'PETA_AKUN'),
    ambil(/function kunciSumber[\s\S]*?\n\}/, 'kunciSumber'),
    ambil(/function idKelompokBerita[\s\S]*?\n\}/, 'idKelompokBerita'),
    ambil(/function normalkanJudul[\s\S]*?\n\}/, 'normalkanJudul'),
    ambil(/function buangKembaran[\s\S]*?\n\}\n/, 'buangKembaran'),
    ambil(/function susunSeksi[\s\S]*?\n\}\n/, 'susunSeksi'),
  ].join('\n\n');

const ts = (await import('typescript')).default;
const js = ts.transpileModule(potonganTs, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const { susunSeksi } = new Function(js + '\nreturn { susunSeksi };')();

const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(`Data produksi: ${data.length} berita\n`);

let gagal = 0;
const cek = (nama, dapat, harap) => {
  const ok = String(dapat) === String(harap);
  if (!ok) gagal++;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}: ${dapat}${ok ? '' : `  (harap ${harap})`}`);
};

const seksi = susunSeksi(data, null);
console.log('--- Seksi yang dirender ---');
for (const s of seksi) console.log(`  ${String(s.label).padEnd(14)} ${s.daftar.length} berita`);

const per = Object.fromEntries(seksi.map((s) => [s.id, s.daftar.length]));
console.log('\n--- Pemeriksaan ---');
cek('Nusantara TV terisi (official.ntv + officialnusantaratv + news.nusantaratv)', per['nusantara-tv'] > 0, true);
cek('Indozone terisi', per['indozone'] > 0, true);
cek('Lambe Turah terisi', per['lambe-turah'] > 0, true);
cek('TIDAK ada berita jatuh ke "Lainnya"', per['lainnya'] ?? 0, 0);
cek('Ketiga seksi resmi selalu dirender', seksi.filter((s) => s.id !== 'lainnya').length, 3);

// Dua unggahan berjudul sama dari AKUN YANG SAMA bukan kembaran lintas
// platform, jadi keduanya harus tetap tampil.
const garudaDb = data.filter((b) => b.judul.startsWith('Garuda Calling')).length;
const garudaTampil = seksi.flatMap((s) => s.daftar).filter((b) => b.judul.startsWith('Garuda Calling')).length;
cek(`Dua unggahan "Garuda Calling" dari akun sama (${garudaDb} di DB) tidak disembunyikan`, garudaTampil, garudaDb);

const semuaId = seksi.flatMap((s) => s.daftar.map((b) => b.id));
cek('Tidak ada berita muncul ganda antar seksi', new Set(semuaId).size, semuaId.length);

let masalahTerpilih = 0;
for (const b of data) {
  const s2 = susunSeksi(data, b.id);
  const n = s2.flatMap((x) => x.daftar).filter((x) => x.id === b.id).length;
  if (n !== 1) masalahTerpilih++;
}
cek(`Video terpilih selalu muncul tepat 1x (${data.length} id diuji)`, masalahTerpilih, 0);

cek('Daftar kosong tetap merender 3 seksi resmi', susunSeksi([], null).length, 3);

console.log(`\n===== ${gagal === 0 ? 'SEMUA LULUS' : gagal + ' GAGAL'} =====`);
process.exit(gagal ? 1 : 0);
