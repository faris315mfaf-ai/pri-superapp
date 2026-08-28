// Uji kontrak & aturan keamanan verifikasi wajah (fitur 1.22/3).
// Mereplika logika src/lib/wajah.ts: parsing balasan penyedia + aturan
// LOLOS hanya bila cocok===true DAN live===true (anti-foto).
//
// Jalankan: node tests/uji-verifikasi-wajah.mjs

function klasifikasiVerif(d) {
  const cocok = d.cocok === true;
  const live = d.live === true;
  return { lolos: cocok && live, cocok, live, skor: Number(d.skor ?? 0) };
}
function ambilFaceId(d) {
  return String(d.face_id ?? d.faceId ?? "");
}

let ok = 0;
let bad = 0;
function cek(nama, aktual, harap) {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++;
  else {
    bad++;
    console.error(`  ✗ ${nama}: ${JSON.stringify(aktual)} != ${JSON.stringify(harap)}`);
  }
}

// --- Pendaftaran: ambil face_id (dua ejaan) ---
cek("face_id snake", ambilFaceId({ face_id: "f1" }), "f1");
cek("faceId camel", ambilFaceId({ faceId: "f2" }), "f2");
cek("tanpa id → kosong (ditolak pemanggil)", ambilFaceId({}), "");

// --- Verifikasi: HANYA cocok && live yang lolos ---
cek("cocok+live → LOLOS", klasifikasiVerif({ cocok: true, live: true }).lolos, true);
cek("cocok tapi foto (live=false) → GAGAL", klasifikasiVerif({ cocok: true, live: false }).lolos, false);
cek("live tapi orang lain (cocok=false) → GAGAL", klasifikasiVerif({ cocok: false, live: true }).lolos, false);
cek("keduanya salah → GAGAL", klasifikasiVerif({ cocok: false, live: false }).lolos, false);
cek("balasan kosong → GAGAL (fail-safe)", klasifikasiVerif({}).lolos, false);
cek("skor terbawa untuk telemetri", klasifikasiVerif({ cocok: true, live: true, skor: 0.93 }).skor, 0.93);

console.log(`\nVerifikasi wajah: ${ok} lolos, ${bad} gagal.`);
if (bad > 0) process.exit(1);
