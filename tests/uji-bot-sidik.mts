// Uji sidik visual (3F tahap B) — murni, bingkai sintetis. 13 Okt 2026.
// Jalankan: npx tsx tests/uji-bot-sidik.mts
import {
  AMBANG_SAMA,
  BYTE_PER_BINGKAI,
  MAKS_BINGKAI,
  bandingkanSidik,
  cariKembaran,
  cerminkan,
  dHashBingkai,
  hashSah,
  jarak,
  keragaman,
  putusanSidik,
  sidikDariRaw,
  sidikInformatif,
  validasiSidik,
} from "@/bot-runner/sidik-murni";

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

// PRNG deterministik.
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** Bingkai 9x8 acak (nilai berbeda-beda supaya tak ada seri). */
function bingkai(seed: number): Uint8Array {
  const r = prng(seed);
  const b = new Uint8Array(BYTE_PER_BINGKAI);
  for (let i = 0; i < b.length; i++) b[i] = Math.floor(r() * 256);
  return b;
}
const gabung = (daftar: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(daftar.length * BYTE_PER_BINGKAI);
  daftar.forEach((b, i) => out.set(b, i * BYTE_PER_BINGKAI));
  return out;
};
/** Video sintetis: deretan bingkai dari benih dasar. */
const video = (dasar: number, n = 20): Uint8Array[] => Array.from({ length: n }, (_, i) => bingkai(dasar * 1000 + i));
/** Derau kecil (kompresi) pada tiap piksel. */
function derau(b: Uint8Array, kuat: number, seed: number): Uint8Array {
  const r = prng(seed);
  return b.map((v) => Math.min(255, Math.max(0, v + Math.round((r() - 0.5) * 2 * kuat))));
}
function cerminPiksel(b: Uint8Array): Uint8Array {
  const o = new Uint8Array(b.length);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) o[y * 9 + x] = b[y * 9 + (8 - x)];
  return o;
}
const sidik = (v: Uint8Array[]) => sidikDariRaw(gabung(v));

console.log("\n[A] dHash & mentah");
const f = bingkai(1);
cek("hash 16 heks, deterministik", /^[0-9a-f]{16}$/.test(dHashBingkai(f)) && dHashBingkai(f) === dHashBingkai(f));
cek("gradien menurun → semua bit 1; menaik → 0", dHashBingkai(Uint8Array.from({ length: 72 }, (_, i) => 255 - (i % 9) * 20)) === "ffffffffffffffff" && dHashBingkai(Uint8Array.from({ length: 72 }, (_, i) => (i % 9) * 20)) === "0000000000000000");
cek("sidikDariRaw memecah per 72 byte, sisa dibuang", sidikDariRaw(gabung(video(1, 5))).length === 5 && sidikDariRaw(new Uint8Array(72 * 3 + 40)).length === 3);
cek("dibatasi MAKS_BINGKAI", sidikDariRaw(gabung(video(1, 60))).length === MAKS_BINGKAI);
cek("raw kosong → []", sidikDariRaw(new Uint8Array(0)).length === 0);
cek("jarak: sama 0, beda jauh > 0, simetris", jarak([1, 2], [1, 2]) === 0 && jarak([0xffffffff, 0xffffffff], [0, 0]) === 64 && jarak([5, 9], [3, 1]) === jarak([3, 1], [5, 9]));

console.log("\n[B] Cermin");
const g = Uint8Array.from({ length: 72 }, (_, i) => (i * 37 + 11) % 251 + (i % 9)); // tanpa seri antar-tetangga
const hAsli = dHashBingkai(g);
const hCermin = dHashBingkai(cerminPiksel(g));
cek("cerminkan(hash) = hash bingkai yang dicerminkan (tanpa seri)", cerminkan(hAsli) === hCermin, { hAsli, hCermin, c: cerminkan(hAsli) });
cek("cerminkan dua kali = semula", cerminkan(cerminkan(hAsli)) === hAsli);

console.log("\n[C] Perbandingan");
const A = video(1);
const sA = sidik(A);
cek("video identik → skor 1, putusan sama", bandingkanSidik(sA, sA).skor === 1 && putusanSidik(bandingkanSidik(sA, sA).skor) === "sama");
const sADerau = sidik(A.map((b, i) => derau(b, 6, 100 + i)));
cek("versi terkompresi (derau kecil) tetap sama", bandingkanSidik(sA, sADerau).skor >= AMBANG_SAMA, bandingkanSidik(sA, sADerau));
const sBeda = sidik(video(2));
cek("video lain → beda", putusanSidik(bandingkanSidik(sA, sBeda).skor) === "beda", bandingkanSidik(sA, sBeda));
const potong = sidik(A.slice(3, 17));
const hs = bandingkanSidik(sA, potong);
cek("dipotong mulai detik ke-3 (geseran) tetap sama", putusanSidik(hs.skor) === "sama" && hs.geser === -3, hs);
const mirror = sidik(A.map(cerminPiksel));
const hm = bandingkanSidik(sA, mirror);
cek("versi cermin terdeteksi", putusanSidik(hm.skor) === "sama" && hm.cermin === true, hm);
const sebagian = sidik([...A.slice(0, 10), ...video(9, 10)]);
const hp = bandingkanSidik(sA, sebagian);
cek("separuh sama separuh beda → 'mungkin' (bukan sama)", putusanSidik(hp.skor) === "mungkin" || putusanSidik(hp.skor) === "beda", hp);
cek("simetris: skor(a,b) ≈ skor(b,a) untuk geseran", Math.abs(bandingkanSidik(sA, potong).skor - bandingkanSidik(potong, sA).skor) < 0.2);

console.log("\n[D] Penjaga salah-cocok");
const hitam = sidik(Array.from({ length: 20 }, () => new Uint8Array(72)));
cek("layar hitam tidak informatif", !sidikInformatif(hitam) && keragaman(hitam) < 0.3, keragaman(hitam));
cek("dua layar hitam TIDAK dianggap sama", bandingkanSidik(hitam, hitam).skor === 0);
cek("video normal informatif", sidikInformatif(sA) && keragaman(sA) > 0.9);
cek("terlalu pendek (<6 bingkai) tidak dibandingkan", bandingkanSidik(sA.slice(0, 4), sA.slice(0, 4)).skor === 0);
cek("tumpang-tindih terlalu kecil tidak dihitung", bandingkanSidik(sA.slice(0, 7), sA.slice(7 - 1, 7 + 6)).tumpang === 0 || bandingkanSidik(sA.slice(0, 7), sA.slice(6, 13)).skor < 1);
const intro = sidik([...Array.from({ length: 6 }, () => new Uint8Array(72)), ...video(3, 14)]);
const intro2 = sidik([...Array.from({ length: 6 }, () => new Uint8Array(72)), ...video(4, 14)]);
cek("dua video beda dengan intro hitam yang sama tetap beda", putusanSidik(bandingkanSidik(intro, intro2).skor) !== "sama", bandingkanSidik(intro, intro2));

console.log("\n[E] Validasi & pencarian");
cek("validasiSidik menerima 6..24 hash heks", validasiSidik(sA) !== null && validasiSidik(sA.slice(0, 6)) !== null && validasiSidik(sA.slice(0, 5)) === null);
cek("validasiSidik menolak isi buruk", validasiSidik([...sA.slice(0, 7), "xyz"]) === null && validasiSidik("abc") === null && validasiSidik(null) === null && validasiSidik(Array.from({ length: 30 }, () => "0123456789abcdef")) === null && validasiSidik(sA.slice(0, 6).map((h) => h.toUpperCase())) === null);
cek("hashSah", hashSah("0123456789abcdef") && !hashSah("0123456789abcdeg") && !hashSah("0123") && !hashSah(5));
const kumpulan = [
  { id: 1, sidik: sBeda },
  { id: 2, sidik: potong },
  { id: 3, sidik: sidik(video(5)) },
];
const k = cariKembaran(sA, kumpulan);
cek("cariKembaran menemukan yang sama", k?.id === 2 && k.putusan === "sama", k);
cek("cariKembaran mengecualikan diri sendiri", cariKembaran(sA, [{ id: 7, sidik: sA }], 7) === null);
cek("cariKembaran: tak ada yang mirip → null", cariKembaran(sA, [{ id: 1, sidik: sBeda }, { id: 3, sidik: sidik(video(5)) }]) === null);
cek("kinerja: 500 pembanding < 1500 ms", (() => { const besar = Array.from({ length: 500 }, (_, i) => ({ id: i, sidik: sidik(video(100 + i)) })); const t0 = Date.now(); cariKembaran(sA, besar); return Date.now() - t0 < 1500; })());

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
