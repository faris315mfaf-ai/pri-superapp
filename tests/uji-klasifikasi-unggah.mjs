// Uji klasifikasi hasil unggah per platform (bug 1.22/2; upload-post 16 Okt 2026).
// Menguji LANGSUNG src/lib/unggah-hasil.ts (tanpa salinan): unggahan
// async/terjadwal (pending/processing/scheduled) TIDAK dianggap gagal,
// penolakan nyata (error) tetap gagal, dan kolom unggah_hasil dibaca aman.
//
// Jalankan: node tests/uji-klasifikasi-unggah.mjs
// (Node >= 22.18 membaca .ts langsung; unggah-hasil.ts sengaja murni tanpa impor.
//  Node lebih lama: npx tsx tests/uji-klasifikasi-unggah.mjs)

import { STATUS_DIPROSES, bacaHasilUnggah, tayangAtauDiproses } from "../src/lib/unggah-hasil.ts";

let lolos = 0;
let gagal = 0;
function cek(nama, aktual, harap) {
  const sama = JSON.stringify(aktual) === JSON.stringify(harap);
  if (sama) {
    lolos++;
  } else {
    gagal++;
    console.error(`  ✗ ${nama}: dapat ${JSON.stringify(aktual)}, harusnya ${JSON.stringify(harap)}`);
  }
}

// --- Kasus TAYANG PASTI (id/postUrl ada) ---
cek("IG sukses (id+url)", tayangAtauDiproses("success", "17900", "https://instagram.com/p/x"), true);
cek("TikTok sukses tanpa status field", tayangAtauDiproses(undefined, "tt123", "https://tiktok.com/x"), true);
cek("postUrl saja tanpa id", tayangAtauDiproses("success", "", "https://fb.com/x"), true);

// --- Kasus INTI BUG 2: async/terjadwal TANPA id/url ---
cek("IG pending (async, belum ada id)", tayangAtauDiproses("pending", "", ""), true);
cek("YouTube processing", tayangAtauDiproses("processing", "", ""), true);
cek("scheduled (jadwal upload-post)", tayangAtauDiproses("scheduled", "", ""), true);
cek("queued", tayangAtauDiproses("queued", undefined, undefined), true);
cek("in_progress (status upload-post)", tayangAtauDiproses("in_progress", "", ""), true);
cek("huruf besar tetap dikenali", tayangAtauDiproses("PROCESSING", "", ""), true);
cek("in_progress termasuk STATUS_DIPROSES", STATUS_DIPROSES.has("in_progress"), true);

// --- Kasus GAGAL NYATA harus tetap gagal ---
cek("error eksplisit", tayangAtauDiproses("error", "", ""), false);
cek("error walau ada id nyasar", tayangAtauDiproses("error", "abc", ""), false);
cek("ERROR huruf besar", tayangAtauDiproses("ERROR", "", "https://x.com/a"), false);
cek("status kosong tanpa id/url (tak dikenal)", tayangAtauDiproses("", "", ""), false);
cek("success tanpa id/url (tak terbukti)", tayangAtauDiproses("success", "", ""), false);
cek("status aneh tanpa id/url", tayangAtauDiproses("rejected", "", ""), false);

// --- bacaHasilUnggah: kolom unggah_hasil dibaca aman ---
cek("null -> []", bacaHasilUnggah(null), []);
cek("objek bukan array -> []", bacaHasilUnggah({ platform: "instagram" }), []);
cek(
  "entri dinormalkan ke string, entri tanpa platform dibuang",
  bacaHasilUnggah([
    { platform: "instagram", status: "success", id: 17, postUrl: "https://instagram.com/p/x" },
    { status: "error" },
    null,
    "teks",
    { platform: "tiktok", status: "error", pesan: "Ditolak" },
  ]),
  [
    { platform: "instagram", status: "success", id: "17", postUrl: "https://instagram.com/p/x", pesan: "" },
    { platform: "tiktok", status: "error", id: "", postUrl: "", pesan: "Ditolak" },
  ],
);

console.log(`\nKlasifikasi unggah: ${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) process.exit(1);
