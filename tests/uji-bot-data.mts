// Uji fungsi murni data Bot Redaksi (13 Okt 2026): rupa, rakit, runner, hari WIB.
// Jalankan: npx tsx tests/uji-bot-data.mts
import { awalHariWibIso, hitungRunner, rakitBot, rupaAman, statusKosong, RUNNER_ONLINE_DETIK, type BarisBot } from "@/lib/bot-data";

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

console.log("\n[A] awalHariWibIso");
cek("pukul 10:00 WIB (03:00 UTC) → 00:00 WIB hari itu", awalHariWibIso(new Date("2026-10-13T03:00:00Z")) === "2026-10-12T17:00:00.000Z");
cek("pukul 00:30 WIB (17:30 UTC kemarin) → 00:00 WIB hari itu", awalHariWibIso(new Date("2026-10-12T17:30:00Z")) === "2026-10-12T17:00:00.000Z");
cek("pukul 23:59 WIB (16:59 UTC) → hari yang sama", awalHariWibIso(new Date("2026-10-13T16:59:00Z")) === "2026-10-12T17:00:00.000Z");
cek("tepat 00:00 WIB (17:00 UTC) → mulai hari baru", awalHariWibIso(new Date("2026-10-13T17:00:00Z")) === "2026-10-13T17:00:00.000Z");

console.log("\n[B] hitungRunner");
const T = Date.parse("2026-10-13T05:00:00Z");
cek("detak 10 dtk lalu → online", hitungRunner(new Date(T - 10_000).toISOString(), "1", T).online === true);
cek("detak tepat di batas → online", hitungRunner(new Date(T - RUNNER_ONLINE_DETIK * 1000).toISOString(), null, T).online === true);
cek("detak 1 dtk lewat batas → mati", hitungRunner(new Date(T - RUNNER_ONLINE_DETIK * 1000 - 1000).toISOString(), null, T).online === false);
cek("belum pernah detak → mati", hitungRunner(null, null, T).online === false);
cek("tanggal rusak → mati", hitungRunner("bukan-tanggal", null, T).online === false);
cek("detak dari masa depan jauh → mati", hitungRunner(new Date(T + 3600_000).toISOString(), null, T).online === false);

console.log("\n[C] rupaAman");
cek("null → bawaan lengkap", (() => { const r = rupaAman(null); return !!r.kaus && !!r.kulit && r.gayaRambut === "pendek"; })());
cek("warna rusak diganti bawaan", rupaAman({ kaus: "merah" }).kaus === "#5b8def");
cek("warna sah dipertahankan", rupaAman({ kaus: "#aabbcc" }).kaus === "#aabbcc");
cek("gaya rambut tak dikenal → pendek", rupaAman({ gayaRambut: "botak" }).gayaRambut === "pendek");
cek("topi + warnaTopi sah dibawa", (() => { const r = rupaAman({ gayaRambut: "topi", warnaTopi: "#112233" }); return r.gayaRambut === "topi" && r.warnaTopi === "#112233"; })());
cek("warnaTopi rusak dibuang", rupaAman({ warnaTopi: "<script>" }).warnaTopi === undefined);
cek("kacamata hanya bila true persis", rupaAman({ kacamata: "ya" }).kacamata === undefined && rupaAman({ kacamata: true }).kacamata === true);
cek("array bukan objek → bawaan", rupaAman([1, 2]).gayaRambut === "pendek");

console.log("\n[D] rakitBot");
const baris: BarisBot = { id: 1, user_id: 77, nama: "Raka", peran: "Pencari", persona: "p", warna: "#f08a3c", handle: "@tvr.raka", platform: "Instagram", rupa: {}, mode: "otomatis", kuota_harian: 3, jam_mulai: "08:00", jam_selesai: "20:00", aktif: true, jeda: false, gagal_beruntun: 0 };
const r = rakitBot(baris, "bot1", 2, 1);
cek("username, post hari ini, akun tertaut terisi", r.username === "bot1" && r.post_hari_ini === 2 && r.akun_tertaut === 1);
cek("mode otomatis dipertahankan", r.mode === "otomatis");
cek("mode aneh → acc (aman)", rakitBot({ ...baris, mode: "bebas" }, "x", 0, 0).mode === "acc");
cek("kuota di luar batas dijepit 1..6", rakitBot({ ...baris, kuota_harian: 99 }, "x", 0, 0).kuota_harian === 6 && rakitBot({ ...baris, kuota_harian: 0 }, "x", 0, 0).kuota_harian === 1);
cek("jam rusak → bawaan", rakitBot({ ...baris, jam_mulai: "pagi", jam_selesai: null }, "x", 0, 0).jam_mulai === "08:00");
cek("aktif null dianggap aktif, jeda null dianggap tidak", (() => { const x = rakitBot({ ...baris, aktif: null, jeda: null }, "x", 0, 0); return x.aktif === true && x.jeda === false; })());
cek("angka negatif dijepit 0", rakitBot({ ...baris, gagal_beruntun: -4 }, "x", -3, -2).gagal_beruntun === 0 && rakitBot(baris, "x", -3, -2).post_hari_ini === 0);

console.log("\n[E] statusKosong");
const k = statusKosong(false);
cek("tabel_ada=false, tanpa bot, runner mati", k.tabel_ada === false && k.bots.length === 0 && k.runner.online === false);

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
