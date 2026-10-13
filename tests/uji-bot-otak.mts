// Uji "otak" per bot — enkripsi kunci + bagian murni (13 Okt 2026).
// Jalankan: npx tsx tests/uji-bot-otak.mts
import { dekripsiKunci, enkripsiKunci, KunciIndukHilang, kunciIndukSiap } from "@/lib/bot-rahasia";
import {
  adalahPenyedia,
  akhirKunci,
  kodeDariStatusHttp,
  labelHasilUji,
  normalkanKunciApi,
  samarkanKunci,
} from "@/lib/bot-otak-murni";

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

const INDUK = "induk-uji-yang-panjangnya-lebih-dari-32-karakter";
const KUNCI = "sk-uji-1234567890abcdefWXYZ";

console.log("\n[A] Enkripsi AES-256-GCM");
const s1 = enkripsiKunci(KUNCI, 7, INDUK);
cek("bolak-balik sama", dekripsiKunci(s1, 7, INDUK) === KUNCI);
cek("format v1.iv.tag.sandi", /^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/.test(s1), s1);
cek("sandi tidak memuat kunci polos", !s1.includes(KUNCI) && !s1.includes("1234567890"));
cek("IV acak: dua enkripsi beda", enkripsiKunci(KUNCI, 7, INDUK) !== s1);
cek("bot lain tidak bisa membuka (AAD)", dekripsiKunci(s1, 8, INDUK) === null);
cek("kunci induk lain tidak bisa membuka", dekripsiKunci(s1, 7, INDUK + "x") === null);
const rusak = s1.slice(0, -2) + (s1.endsWith("AA") ? "BB" : "AA");
cek("sandi diubah satu bit → gagal (autentikasi)", dekripsiKunci(rusak, 7, INDUK) === null);
const bag = s1.split(".");
cek("tag dipalsukan → gagal", dekripsiKunci([bag[0], bag[1], "A".repeat(22), bag[3]].join("."), 7, INDUK) === null);
cek("format salah → null, tidak melempar", dekripsiKunci("sembarang", 7, INDUK) === null && dekripsiKunci("", 7, INDUK) === null && dekripsiKunci("v2.a.b.c", 7, INDUK) === null);
let melempar = false;
try { enkripsiKunci(KUNCI, 7, "pendek"); } catch (e) { melempar = e instanceof KunciIndukHilang; }
cek("tanpa kunci induk (atau pendek) → menolak menyimpan", melempar);
melempar = false;
try { enkripsiKunci(KUNCI, 7, undefined); } catch (e) { melempar = e instanceof KunciIndukHilang; }
cek("kunci induk undefined → menolak", melempar);
cek("dekripsi tanpa kunci induk → null", dekripsiKunci(s1, 7, "") === null);
cek("kunciIndukSiap", kunciIndukSiap(INDUK) && !kunciIndukSiap("pendek") && !kunciIndukSiap(undefined) && !kunciIndukSiap("   "));
cek("kunci Unicode/panjang utuh", dekripsiKunci(enkripsiKunci("x".repeat(200), 1, INDUK), 1, INDUK) === "x".repeat(200));

console.log("\n[B] Validasi kunci API");
cek("kunci wajar diterima, ujung dipangkas", normalkanKunciApi(`  ${KUNCI}\n`).ok === true && (normalkanKunciApi(` ${KUNCI} `) as { kunci: string }).kunci === KUNCI);
cek("terlalu pendek ditolak", normalkanKunciApi("abc").ok === false);
cek("terlalu panjang ditolak", normalkanKunciApi("a".repeat(201)).ok === false);
cek("spasi di tengah ditolak", normalkanKunciApi("sk-uji 1234567890abcdef").ok === false);
cek("karakter kontrol ditolak", normalkanKunciApi("sk-uji\u00001234567890abcdef").ok === false);
cek("non-ASCII ditolak", normalkanKunciApi("sk-ujiéééé1234567890abcdef").ok === false);
cek("bukan string ditolak", normalkanKunciApi(null).ok === false && normalkanKunciApi(123).ok === false);
cek("penyamaran: 4 karakter terakhir saja", samarkanKunci(akhirKunci(KUNCI)) === "••••WXYZ" && samarkanKunci("") === "");
cek("penyamaran tidak memuat bagian lain", !samarkanKunci(akhirKunci(KUNCI)).includes("sk-uji"));

console.log("\n[C] Penyedia, kode galat, label");
cek("penyedia dikenal", adalahPenyedia("deepseek") && adalahPenyedia("gemini") && !adalahPenyedia("openai") && !adalahPenyedia(null));
cek("status HTTP → kode", kodeDariStatusHttp(401) === "kunci_ditolak" && kodeDariStatusHttp(403) === "kunci_ditolak" && kodeDariStatusHttp(429) === "kuota" && kodeDariStatusHttp(402) === "kuota" && kodeDariStatusHttp(500) === "gagal");
cek("label hasil uji", labelHasilUji(null).nada === "tak_tahu" && labelHasilUji("ok").nada === "ok" && labelHasilUji("kuota").nada === "kurang" && labelHasilUji("aneh").teks === "uji gagal");

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
