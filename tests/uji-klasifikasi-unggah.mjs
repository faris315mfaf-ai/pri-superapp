// Uji klasifikasi status unggahan Ayrshare (bug 1.22/2).
// Menjalankan logika tayangAtauDiproses terhadap balasan Ayrshare
// yang representatif — memastikan unggahan async (pending) TIDAK lagi
// dianggap gagal, tapi penolakan nyata (error) tetap gagal.
//
// Jalankan: node tests/uji-klasifikasi-unggah.mjs

// Replika 1:1 dari src/lib/ayrshare-status.ts (ESM murni tanpa TS).
const STATUS_DIPROSES = new Set(["pending", "scheduled", "processing", "queued", "awaiting"]);
function tayangAtauDiproses(status, id, postUrl) {
  const s = String(status ?? "").toLowerCase();
  if (s === "error") return false;
  if (id || postUrl) return true;
  return STATUS_DIPROSES.has(s);
}

let lolos = 0;
let gagal = 0;
function cek(nama, aktual, harap) {
  if (aktual === harap) {
    lolos++;
  } else {
    gagal++;
    console.error(`  ✗ ${nama}: dapat ${aktual}, harusnya ${harap}`);
  }
}

// --- Kasus TAYANG PASTI (id/postUrl ada) ---
cek("IG sukses (id+url)", tayangAtauDiproses("success", "17900", "https://instagram.com/p/x"), true);
cek("TikTok sukses tanpa status field", tayangAtauDiproses(undefined, "tt123", "https://tiktok.com/x"), true);
cek("postUrl saja tanpa id", tayangAtauDiproses("success", "", "https://fb.com/x"), true);

// --- Kasus INTI BUG 2: async pending TANPA id/url ---
cek("IG pending (async, belum ada id)", tayangAtauDiproses("pending", "", ""), true);
cek("YouTube processing", tayangAtauDiproses("processing", "", ""), true);
cek("scheduled", tayangAtauDiproses("scheduled", "", ""), true);
cek("queued", tayangAtauDiproses("queued", undefined, undefined), true);

// --- Kasus GAGAL NYATA harus tetap gagal ---
cek("error eksplisit", tayangAtauDiproses("error", "", ""), false);
cek("error walau ada id nyasar", tayangAtauDiproses("error", "abc", ""), false);
cek("status kosong tanpa id/url (tak dikenal)", tayangAtauDiproses("", "", ""), false);
cek("status aneh tanpa id/url", tayangAtauDiproses("rejected", "", ""), false);

console.log(`\nKlasifikasi unggah: ${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) process.exit(1);
