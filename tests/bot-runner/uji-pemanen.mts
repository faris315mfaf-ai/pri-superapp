// Uji pemanen yt-dlp (13 Okt 2026). Murni: proses yt-dlp DIPALSUKAN, tanpa jaringan.
// Jalankan: npx tsx tests/bot-runner/uji-pemanen.mts
import {
  Pemanen,
  bangunUrlProfil,
  bentukLaporanKandidat,
  deteksiPembatasan,
  handleSah,
  jalankanProsesNyata,
  parseKeluaranYtdlp,
  waktuTerbit,
  type HasilProses,
  type JalankanProses,
} from "../../src/bot-runner/pemanen";

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

console.log("\n[A] Validasi handle (cegah injeksi opsi/shell)");
for (const h of ["ntv", "@ntv", "ntv.news", "ntv_news-1", "AB", "UCabcdefghijklmnopqrstuv"]) cek(`sah: ${h}`, handleSah(h));
const jahat = [
  "--exec=rm -rf /",
  "-o",
  "--config-locations",
  "a",
  "",
  "x".repeat(65),
  "a b",
  "a;b",
  "a|b",
  "a&b",
  "`id`",
  "$(id)",
  "a\nb",
  "../etc/passwd",
  "a..b",
  "a/b",
  "a\\b",
  "ntv@x",
  "@@ntv",
  "ntv?x=1",
  "ntv#x",
  "ntv%20x",
  "é",
  "--",
  "-@ntv",
];
for (const h of jahat) cek(`ditolak: ${JSON.stringify(h)}`, !handleSah(h) && bangunUrlProfil("instagram", h) === null);
cek("bukan string ditolak", !handleSah(undefined as unknown as string) && !handleSah(123 as unknown as string));

console.log("\n[B] URL profil per platform");
cek("instagram", bangunUrlProfil("instagram", "@ntv.news") === "https://www.instagram.com/ntv.news/");
cek("instagram alias ig", bangunUrlProfil("IG", "ntv") === "https://www.instagram.com/ntv/");
cek("tiktok", bangunUrlProfil("tiktok", "ntvnews") === "https://www.tiktok.com/@ntvnews");
cek("tiktok dengan @", bangunUrlProfil("tiktok", "@ntvnews") === "https://www.tiktok.com/@ntvnews");
cek("youtube @handle", bangunUrlProfil("youtube", "@NTVNews") === "https://www.youtube.com/@NTVNews/videos");
cek("youtube id kanal UC", bangunUrlProfil("youtube", "UC1234567890abcdefghij_-") === "https://www.youtube.com/channel/UC1234567890abcdefghij_-/videos");
cek("platform tak dikenal -> null", bangunUrlProfil("facebook", "ntv") === null);
cek("handle jahat -> null", bangunUrlProfil("tiktok", "--exec=x") === null);
cek("URL selalu https dan tanpa spasi", ["instagram", "tiktok", "youtube"].every((p) => /^https:\/\/\S+$/.test(bangunUrlProfil(p, "@ntv") ?? "")));

console.log("\n[C] Parse keluaran yt-dlp");
const contohYt = [
  JSON.stringify({ id: "dQw4w9WgXcQ", title: "Judul YT", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", duration: 123.4, view_count: 1000, description: "Deskripsi\nbaris dua", timestamp: 1_760_000_000 }),
  JSON.stringify({ id: "abcdefghijk", title: "Hanya id", duration: 30, view_count: null, upload_date: "20260930" }),
  "bukan json",
  JSON.stringify({ _type: "playlist", id: "tab", title: "Shorts", url: "https://www.youtube.com/@x/shorts" }),
  JSON.stringify({ id: "dQw4w9WgXcQ", title: "Duplikat", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
  JSON.stringify([1, 2]),
  "",
].join("\n");
const hy = parseKeluaranYtdlp(contohYt, "youtube", "@x", 10);
cek("dua kandidat (rusak, playlist, duplikat dilewati)", hy.kandidat.length === 2, hy.kandidat);
cek("barisRusak dihitung", hy.barisRusak === 2, hy.barisRusak);
cek("url dari url", hy.kandidat[0].url === "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
cek("durasi dibulatkan", hy.kandidat[0].durasi_detik === 123);
cek("tayangan dari view_count", hy.kandidat[0].tayangan === 1000);
cek("caption dirapikan", hy.kandidat[0].caption === "Deskripsi baris dua");
cek("timestamp -> ISO", hy.kandidat[0].waktu_terbit === new Date(1_760_000_000 * 1000).toISOString());
cek("hanya id -> URL penuh YouTube", hy.kandidat[1].url === "https://www.youtube.com/watch?v=abcdefghijk", hy.kandidat[1].url);
cek("upload_date -> ISO", hy.kandidat[1].waktu_terbit === "2026-09-30T00:00:00.000Z", hy.kandidat[1].waktu_terbit);
cek("tayangan null tetap null", hy.kandidat[1].tayangan === null);

const contohTt = JSON.stringify({ id: "7300000000000000001", title: "tt", uploader_id: "ntvnews", view_count: 5 });
const ht = parseKeluaranYtdlp(contohTt, "tiktok", "@fallback");
cek("tiktok hanya id -> URL penuh dengan uploader", ht.kandidat[0]?.url === "https://www.tiktok.com/@ntvnews/video/7300000000000000001", ht.kandidat[0]?.url);
const hu = parseKeluaranYtdlp(JSON.stringify({ id: "7300000000000000002" }), "tiktok", "@fallback");
cek("tiktok tanpa uploader -> pakai handle sumber", hu.kandidat[0]?.url === "https://www.tiktok.com/@fallback/video/7300000000000000002");
const hi = parseKeluaranYtdlp(JSON.stringify({ id: "CxYz123_ab", description: "cap", webpage_url: "https://www.instagram.com/reel/CxYz123_ab/" }), "instagram", "ntv");
cek("instagram webpage_url dipakai", hi.kandidat[0]?.url === "https://www.instagram.com/reel/CxYz123_ab/");
cek("judul jatuh ke caption bila kosong", hi.kandidat[0]?.judul === "cap");
const hx = parseKeluaranYtdlp(JSON.stringify({ id: "x", url: "javascript:alert(1)" }), "instagram", "ntv");
cek("skema bukan http(s) ditolak (id tak wajar)", hx.kandidat.length === 0, hx.kandidat);
const banyak = Array.from({ length: 30 }, (_, i) => JSON.stringify({ id: `abcdefghi${String(i).padStart(2, "0")}`, title: `t${i}` })).join("\n");
cek("jumlah dibatasi maks", parseKeluaranYtdlp(banyak, "youtube", "@x", 10).kandidat.length === 10);
const panjang = parseKeluaranYtdlp(JSON.stringify({ id: "abcdefghijk", title: "J".repeat(500), description: "C".repeat(5000) }), "youtube", "@x");
cek("judul & caption dipotong", panjang.kandidat[0].judul.length <= 120 && panjang.kandidat[0].caption.length <= 300);
const kendali = parseKeluaranYtdlp(JSON.stringify({ id: "abcdefghijk", title: "a\u0000b\u001b[31mc" }), "youtube", "@x");
cek("karakter kendali dibuang", !/[\u0000-\u001f]/.test(kendali.kandidat[0].judul), kendali.kandidat[0].judul);
cek("waktuTerbit tak sah -> null", waktuTerbit(12, "bukan") === null && waktuTerbit(null, undefined) === null);

console.log("\n[D] Deteksi pembatasan");
cek("429", deteksiPembatasan("ERROR: [instagram] x: HTTP Error 429: Too Many Requests") === "dibatasi");
cek("rate-limit", deteksiPembatasan("ERROR: Requested content is not available, rate-limit reached") === "dibatasi");
cek("Sign in", deteksiPembatasan("ERROR: [youtube] Sign in to confirm you’re not a bot") === "login");
cek("login required", deteksiPembatasan("ERROR: [Instagram] login required to view this profile") === "login");
cek("cookies diperlukan", deteksiPembatasan("ERROR: use --cookies-from-browser or --cookies for the authentication") === "login");
cek("galat biasa -> null", deteksiPembatasan("ERROR: Unable to download webpage: <urlopen error timed out>") === null);

console.log("\n[E] Pemanen dengan proses palsu");
const ok = (stdout: string): HasilProses => ({ kode: 0, stdout, stderr: "", waktuHabis: false, terpotong: false });
type Panggilan = { bin: string; args: string[] };
function buatPemanen(jawab: (n: number) => HasilProses, opsi: { cookies?: string | null; waktu?: { t: number } } = {}) {
  const panggilan: Panggilan[] = [];
  let serentak = 0;
  let puncak = 0;
  const jalankan: JalankanProses = async (bin, args) => {
    panggilan.push({ bin, args });
    serentak++;
    puncak = Math.max(puncak, serentak);
    await new Promise((r) => setTimeout(r, 5));
    serentak--;
    return jawab(panggilan.length);
  };
  const w = opsi.waktu ?? { t: 1_000_000 };
  const p = new Pemanen({ ytdlpBin: "/usr/local/bin/yt-dlp", cookiesFile: opsi.cookies ?? null, jalankan, sekarang: () => w.t });
  return { p, panggilan, puncak: () => puncak, w };
}
const S = { id: 1, platform: "tiktok", handle: "@ntv" };

{
  const { p, panggilan } = buatPemanen(() => ok(contohYt));
  const r = await p.panen({ id: 1, platform: "youtube", handle: "@x" });
  cek("sukses -> ok & kandidat", r.jenis === "ok" && r.kandidat.length === 2);
  const a = panggilan[0].args;
  cek("argumen persis spesifikasi", JSON.stringify(a) === JSON.stringify(["--flat-playlist", "--dump-json", "--playlist-end", "10", "--no-warnings", "--socket-timeout", "20", "--ignore-no-formats-error", "https://www.youtube.com/@x/videos"]), a);
  cek("tanpa cookies bila tak diset", !a.includes("--cookies"));
  cek("tanpa proxy", !a.some((x) => /proxy/i.test(x)));
  cek("biner sesuai konfigurasi", panggilan[0].bin === "/usr/local/bin/yt-dlp");
}
{
  const { p, panggilan } = buatPemanen(() => ok(contohYt), { cookies: "/run/bot-cookies/c.txt" });
  await p.panen({ id: 1, platform: "youtube", handle: "@x" });
  const a = panggilan[0].args;
  const i = a.indexOf("--cookies");
  cek("cookies diteruskan sebelum URL", i >= 0 && a[i + 1] === "/run/bot-cookies/c.txt" && a[a.length - 1].startsWith("https://"));
}
{
  const { p, panggilan } = buatPemanen(() => ok(""));
  const r = await p.panen({ id: 1, platform: "tiktok", handle: "--exec=evil" });
  cek("handle jahat tidak men-spawn", panggilan.length === 0 && r.jenis === "handle_tak_sah");
  const r2 = await p.panen({ id: 1, platform: "facebook", handle: "ntv" });
  cek("platform tak dikenal tidak men-spawn", panggilan.length === 0 && r2.jenis === "handle_tak_sah");
}
{
  const { p } = buatPemanen(() => ({ kode: 1, stdout: "", stderr: "ERROR: HTTP Error 429: Too Many Requests", waktuHabis: false, terpotong: false }));
  const r = await p.panen(S);
  cek("429 -> jenis dibatasi + galat", r.jenis === "dibatasi" && r.kandidat.length === 0 && Boolean(r.galat), r);
}
{
  const { p } = buatPemanen(() => ({ kode: 1, stdout: "", stderr: "ERROR: [instagram] login required", waktuHabis: false, terpotong: false }));
  const r = await p.panen({ id: 2, platform: "instagram", handle: "ntv" });
  cek("login -> jenis login", r.jenis === "login");
}
{
  const { p } = buatPemanen(() => ({ kode: null, stdout: JSON.stringify({ id: "abcdefghijk" }) + "\n{\"id\":\"setengah", stderr: "", waktuHabis: true, terpotong: false }));
  const r = await p.panen({ id: 3, platform: "youtube", handle: "@x" });
  cek("waktu habis dengan hasil sebagian: baris setengah jadi dibuang", r.kandidat.length === 1, r);
  const { p: p2 } = buatPemanen(() => ({ kode: null, stdout: "", stderr: "", waktuHabis: true, terpotong: false }));
  cek("waktu habis tanpa hasil -> waktu_habis", (await p2.panen({ id: 3, platform: "youtube", handle: "@x" })).jenis === "waktu_habis");
}
{
  const { p } = buatPemanen(() => ({ kode: 0, stdout: "", stderr: "", waktuHabis: false, terpotong: false }));
  const r = await p.panen({ id: 4, platform: "youtube", handle: "@kosong" });
  cek("sukses tanpa item = ok (bukan kegagalan)", r.jenis === "ok" && r.kandidat.length === 0);
}
{
  // 3 kegagalan beruntun -> dilewati 1 jam -> boleh lagi.
  const w = { t: 5_000_000 };
  const { p, panggilan } = buatPemanen(() => ({ kode: 1, stdout: "", stderr: "ERROR: boom", waktuHabis: false, terpotong: false }), { waktu: w });
  const sumber = { id: 5, platform: "youtube", handle: "@gagal" };
  for (let i = 0; i < 3; i++) await p.panen(sumber);
  cek("3 kegagalan men-spawn 3 kali", panggilan.length === 3);
  const r4 = await p.panen(sumber);
  cek("kegagalan ke-4 dilewati tanpa spawn", panggilan.length === 3 && r4.jenis === "dilewati", r4);
  w.t += 59 * 60_000;
  cek("masih dilewati sebelum 1 jam", (await p.panen(sumber)).jenis === "dilewati" && panggilan.length === 3);
  w.t += 2 * 60_000;
  await p.panen(sumber);
  cek("setelah 1 jam dicoba lagi", panggilan.length === 4);
  // sumber lain tidak terpengaruh
  await p.panen({ id: 6, platform: "youtube", handle: "@lain" });
  cek("sumber lain tetap dijalankan", panggilan.length === 5);
}
{
  // Keberhasilan mereset hitungan.
  let n = 0;
  const { p, panggilan } = buatPemanen(() => (++n === 3 ? ok(contohYt) : { kode: 1, stdout: "", stderr: "ERROR: x", waktuHabis: false, terpotong: false }));
  const s = { id: 7, platform: "youtube", handle: "@selangseling" };
  await p.panen(s);
  await p.panen(s);
  await p.panen(s); // sukses -> reset
  await p.panen(s);
  await p.panen(s);
  cek("sukses mereset hitungan kegagalan", panggilan.length === 5);
}
{
  // Tidak pernah lebih dari satu yt-dlp serentak.
  const { p, panggilan, puncak } = buatPemanen(() => ok(contohYt));
  await Promise.all([1, 2, 3, 4, 5].map((i) => p.panen({ id: i, platform: "youtube", handle: `@sumber${i}` })));
  cek("lima panen serentak -> puncak proses 1", panggilan.length === 5 && puncak() === 1, puncak());
}

console.log("\n[F] Proses nyata (tanpa jaringan): tanpa shell, env minimal, batas");
{
  process.env.BOT_RUNNER_SECRET = "rahasia-yang-tidak-boleh-bocor";
  const r = await jalankanProsesNyata(process.execPath, ["-e", "process.stdout.write(JSON.stringify({s: process.env.BOT_RUNNER_SECRET ?? null}))"], { batasMs: 10_000, maksByte: 1000 });
  cek("env runner tidak diwarisi proses anak", r.kode === 0 && r.stdout === '{"s":null}', r);
  const sh = await jalankanProsesNyata(process.execPath, ["-e", "process.stdout.write(process.argv.slice(1).join('|'))", "a;echo PWNED", "$(id)"], { batasMs: 10_000, maksByte: 1000 });
  cek("metakarakter shell tidak ditafsirkan (tanpa shell)", sh.stdout === "a;echo PWNED|$(id)", sh.stdout);
  const lama = await jalankanProsesNyata(process.execPath, ["-e", "setTimeout(()=>{}, 30000)"], { batasMs: 300, maksByte: 1000 });
  cek("proses lama dibunuh saat waktu habis", lama.waktuHabis === true);
  const besar = await jalankanProsesNyata(process.execPath, ["-e", "setInterval(()=>process.stdout.write('x'.repeat(500)),1)"], { batasMs: 10_000, maksByte: 2000 });
  cek("keluaran dibatasi lalu proses dibunuh", besar.terpotong === true && besar.stdout.length <= 2000, besar.stdout.length);
  const tak = await jalankanProsesNyata("/tidak/ada/yt-dlp", [], { batasMs: 2000, maksByte: 1000 });
  cek("biner tidak ada -> kode null (tidak melempar)", tak.kode === null);
  delete process.env.BOT_RUNNER_SECRET;
}

console.log("\n[G] Laporan muat batas badan");
{
  const kandidat = Array.from({ length: 10 }, (_, i) => ({
    url: `https://www.youtube.com/watch?v=abcdefghi${String(i).padStart(2, "0")}`,
    judul: "J".repeat(120),
    caption: "C".repeat(300),
    durasi_detik: 30,
    tayangan: 100,
    waktu_terbit: "2026-10-01T00:00:00.000Z",
  }));
  const lap = bentukLaporanKandidat(9, kandidat);
  const ukuran = JSON.stringify({ aksi: "lapor", bot_id: 12, laporan: lap }).length;
  cek("laporan penuh < 8 KB", ukuran < 8 * 1024, ukuran);
  cek("jenis & sumber_id benar", lap.jenis === "kandidat" && lap.sumber_id === 9);
  const kecil = bentukLaporanKandidat(9, kandidat.slice(0, 2), "galat kecil");
  cek("laporan kecil utuh (caption tidak dipotong)", kecil.jenis === "kandidat" && kecil.kandidat.length === 2 && kecil.kandidat[0].caption.length === 300 && kecil.galat === "galat kecil");
  const sempit = bentukLaporanKandidat(9, kandidat, undefined, 1500);
  cek("batas sempit membuang kandidat, tetap valid", sempit.jenis === "kandidat" && sempit.kandidat.length < 10);
  const kosong = bentukLaporanKandidat(9, [], "dibatasi");
  cek("laporan galat tanpa kandidat", kosong.jenis === "kandidat" && kosong.kandidat.length === 0 && kosong.galat === "dibatasi");
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
