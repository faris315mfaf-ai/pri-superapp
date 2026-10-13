// Uji caption dari otak bot — bagian murni (13 Okt 2026).
// Jalankan: npx tsx tests/uji-bot-caption.mts
import { MAKS_TAGAR, SISTEM_CAPTION, bangunPromptCaption, rapikanCaption } from "@/lib/bot-caption-murni";
import { adaKredit, batasCaption } from "@/lib/bot-posting-murni";

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
const R = (caption: unknown, p = { kredit: "@warga (TikTok) via NTV", platform: "instagram" }) => rapikanCaption(JSON.stringify({ caption }), p);
const ISI = "Kebakaran melanda pasar di Jakarta Barat pagi ini. Petugas masih berjuang memadamkan api. #kebakaran #jakarta";

console.log("\n[A] Prompt");
const pr = bangunPromptCaption({ judul: "Kebakaran pasar", hook: "HEBOH! Pasar terbakar", bahan: "Api membesar sejak subuh. ".repeat(100), kredit: "NTV", platform: "twitter" });
cek("memuat platform, judul, hook, bahan, format JSON", /PLATFORM: X/.test(pr) && /JUDUL: Kebakaran pasar/.test(pr) && /TEKS DI VIDEO: HEBOH/.test(pr) && /BAHAN: Api membesar/.test(pr) && /\{"caption"/.test(pr));
cek("bahan dipotong (tidak membanjiri prompt)", pr.length < 1200, pr.length);
cek("batas isi mengikuti platform (X lebih kecil dari IG)", Number(/BATAS ISI CAPTION: (\d+)/.exec(pr)?.[1]) < Number(/BATAS ISI CAPTION: (\d+)/.exec(bangunPromptCaption({ judul: "J", hook: "", bahan: "b", kredit: "NTV", platform: "instagram" }))?.[1]));
cek("hook kosong → baris hook tidak ada", !/TEKS DI VIDEO/.test(bangunPromptCaption({ judul: "J", hook: "  ", bahan: "b", kredit: "NTV", platform: "tiktok" })));
cek("sistem melarang fakta baru, tautan, dan baris Sumber", /HANYA fakta/.test(SISTEM_CAPTION) && /tautan/.test(SISTEM_CAPTION) && /Sumber/.test(SISTEM_CAPTION));

console.log("\n[B] Perapian jawaban");
let c = R(ISI);
cek("caption sah + kredit ditempel sistem di akhir", c !== null && c.endsWith("\n\nSumber: @warga (TikTok) via NTV") && adaKredit(c), c);
cek("batas platform dihormati", (R("x".repeat(3000)) ?? "").length <= batasCaption("instagram") && (R("x".repeat(3000), { kredit: "NTV", platform: "twitter" }) ?? "").length <= 280);
const panjang = R("kata ".repeat(300), { kredit: "NTV News", platform: "twitter" }) ?? "";
cek("dipotong dengan … dan kredit tetap utuh", panjang.includes("…") && panjang.endsWith("Sumber: NTV News"), panjang.slice(-60));
cek("baris 'Sumber:' buatan model dibuang (kredit hanya dari sistem)", (() => { const h = R(`${ISI}\nSumber: akun palsu`); return h !== null && !/akun palsu/.test(h) && (h.match(/Sumber:/g) ?? []).length === 1; })());
cek("variasi 'Credit:' / 'cr:' buatan model juga dibuang", (() => { const h = R(`${ISI}\nCredit: palsu\ncr: palsu2`); return h !== null && !/palsu/.test(h); })());
cek("tautan dibuang", (() => { const h = R("Lihat https://evil.example/x dan http://a.b/c untuk berita. Pasar terbakar hebat sekali."); return h !== null && !/https?:/.test(h); })());
cek(`tagar dibatasi ${MAKS_TAGAR}`, (() => { const h = R("Pasar terbakar hebat sekali pagi ini. #a #b #c #d #e #f"); return h !== null && (h.match(/#\w+/g) ?? []).length === MAKS_TAGAR; })());
cek("markdown dibersihkan", (() => { const h = R("**Pasar** terbakar hebat sekali pagi ini `kode`"); return h !== null && !/\*|`/.test(h); })());
cek("baris kosong beruntun dirapatkan", (() => { const h = R("Pasar terbakar hebat sekali pagi ini.\n\n\n\n\nTetap waspada."); return h !== null && !/\n{3,}(?!Sumber)/.test(h.split("Sumber:")[0].trimEnd() + "\n"); })());
cek("karakter kontrol dibuang", (() => { const h = R("Pasar terbakar\u0000 hebat sekali\u0007 pagi ini."); return h !== null && !/[\u0000-\u0008]/.test(h); })());

console.log("\n[C] Penolakan");
cek("terlalu pendek / hanya tagar → null", R("Halo") === null && R("#a #b #c #d") === null && R("   ") === null);
cek("bukan JSON → null", rapikanCaption("bukan json sama sekali", { kredit: "NTV", platform: "instagram" }) === null);
cek("JSON tanpa caption / caption bukan teks → null", rapikanCaption('{"x":1}', { kredit: "NTV", platform: "instagram" }) === null && R(123) === null && R(null) === null && rapikanCaption("[1,2]", { kredit: "NTV", platform: "instagram" }) === null);
cek("JSON dibungkus teks (```json ... ```) tetap terbaca", rapikanCaption('```json\n{"caption":"Pasar terbakar hebat sekali pagi ini, petugas bergerak cepat."}\n```', { kredit: "NTV", platform: "tiktok" }) !== null);
cek("kredit kosong → 'tidak disebutkan'", (R(ISI, { kredit: "  ", platform: "instagram" }) ?? "").endsWith("Sumber: tidak disebutkan"));
cek("kredit terlalu panjang sampai tak ada ruang → null", rapikanCaption(JSON.stringify({ caption: ISI }), { kredit: "k".repeat(300), platform: "twitter" }) === null);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
