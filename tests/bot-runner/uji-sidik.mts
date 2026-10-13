// Uji penyidik sidik visual runner (3F-B), 13 Okt 2026. Murni: yt-dlp, ffmpeg, dan berkas DIPALSUKAN.
// Jalankan: npx tsx tests/bot-runner/uji-sidik.mts
import { BYTE_PER_BINGKAI } from "../../src/bot-runner/sidik-murni";
import { PenyidikVideo, urlSidikSah, type SistemBerkas } from "../../src/bot-runner/sidik";
import type { HasilProses, JalankanProses } from "../../src/bot-runner/pemanen";
import { validasiPerintah } from "../../src/bot-runner/klien-app";
import { Penjadwal, jalankanPerintah, type DepGiliran, type KeadaanGiliran } from "../../src/bot-runner/giliran";
import type { LaporanRunner, PerintahRunner } from "../../src/lib/bot-protokol";
import { bacaKonfig } from "../../src/bot-runner/konfig";

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

console.log("\n[A] Validasi URL (cegah injeksi & SSRF)");
for (const u of ["https://www.instagram.com/reel/Cabc123XYZ/", "https://www.tiktok.com/@a/video/7300000000000000001", "https://youtu.be/dQw4w9WgXcQ", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://x.com/a/status/1"]) cek(`sah: ${u.slice(0, 40)}`, urlSidikSah(u));
for (const u of ["http://www.instagram.com/reel/x/", "https://evilinstagram.com/x", "https://instagram.com.evil.com/x", "https://localhost/x", "https://10.0.0.1/x", "https://user:pw@www.instagram.com/x", "--exec=id", "-o /etc/passwd", "https://www.instagram.com/reel/x/ --exec id", "file:///etc/passwd", "", "https://www.instagram.com/" + "a".repeat(600)]) cek(`ditolak: ${u.slice(0, 40)}`, !urlSidikSah(u));

console.log("\n[B] Argumen proses");
const penyidik0 = new PenyidikVideo({ ytdlpBin: "yt-dlp", ffmpegBin: "ffmpeg", cookiesFile: null });
const a = penyidik0.argumenUnduh("https://www.instagram.com/reel/x/", "/tmp/s");
cek("URL didahului '--' dan menjadi argumen TERAKHIR", a[a.length - 2] === "--" && a[a.length - 1] === "https://www.instagram.com/reel/x/");
cek("hanya pratinjau: --download-sections *0-22, --no-playlist, batas ukuran", a.includes("--no-playlist") && a.includes("--download-sections") && a[a.indexOf("--download-sections") + 1] === "*0-22" && a.includes("--max-filesize"));
cek("tanpa cookies: tidak ada --cookies", !a.includes("--cookies"));
cek("dengan cookies: --cookies <berkas>", new PenyidikVideo({ ytdlpBin: "y", ffmpegBin: "f", cookiesFile: "/c.txt" }).argumenUnduh("https://youtu.be/dQw4w9WgXcQ", "/t").join(" ").includes("--cookies /c.txt"));
const f = penyidik0.argumenFfmpeg("/tmp/s/v.mp4", "/tmp/s/b.raw");
cek("ffmpeg: 1 fps, potong tepi, 9x8 abu-abu, rawvideo, tanpa audio", f.includes("-an") && f.join(" ").includes("fps=1,crop=iw*0.7:ih*0.7,scale=9:8:flags=area,format=gray") && f.includes("rawvideo"));
cek("ffmpeg: -nostdin dan keluaran terakhir", f.includes("-nostdin") && f[f.length - 1] === "/tmp/s/b.raw");

console.log("\n[C] Alur periksa()");
function raw(nBingkai: number, seed = 1): Uint8Array {
  const o = new Uint8Array(nBingkai * BYTE_PER_BINGKAI);
  let s = seed >>> 0;
  for (let i = 0; i < o.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    o[i] = s >>> 24;
  }
  return o;
}
type Palsu = { dipanggil: { bin: string; args: string[] }[]; dihapus: string[]; penyidik: PenyidikVideo };
function buat(opsi: { unduh?: Partial<HasilProses>; ff?: Partial<HasilProses>; berkasVideo?: boolean; mentah?: Uint8Array | null; ffmpegBin?: string } = {}): Palsu {
  const dipanggil: { bin: string; args: string[] }[] = [];
  const dihapus: string[] = [];
  const dasar: HasilProses = { kode: 0, stdout: "", stderr: "", waktuHabis: false, terpotong: false };
  const jalankan: JalankanProses = async (bin, args) => {
    dipanggil.push({ bin, args });
    return bin === "yt-dlp" ? { ...dasar, ...(opsi.unduh ?? {}) } : { ...dasar, ...(opsi.ff ?? {}) };
  };
  const berkas: SistemBerkas = {
    buatDir: () => "/tmp/sidik-uji",
    daftar: () => (opsi.berkasVideo === false ? [] : ["v.mp4"]),
    baca: () => (opsi.mentah === undefined ? raw(20) : opsi.mentah),
    hapusDir: (d) => void dihapus.push(d),
  };
  return { dipanggil, dihapus, penyidik: new PenyidikVideo({ ytdlpBin: "yt-dlp", ffmpegBin: "ffmpeg", cookiesFile: null, jalankan, berkas }) };
}
const URL_OK = "https://www.tiktok.com/@a/video/7300000000000000001";
let p = buat();
let r = await p.penyidik.periksa(URL_OK);
cek("sukses: 20 hash heks 16 karakter", r.jenis === "ok" && r.sidik?.length === 20 && r.sidik.every((h) => /^[0-9a-f]{16}$/.test(h)), r);
cek("yt-dlp lalu ffmpeg dipanggil berurutan", p.dipanggil.length === 2 && p.dipanggil[0].bin === "yt-dlp" && p.dipanggil[1].bin === "ffmpeg");
cek("folder sementara SELALU dihapus", p.dihapus.length === 1 && p.dihapus[0] === "/tmp/sidik-uji");
p = buat();
r = await p.penyidik.periksa("--exec=id");
cek("URL buruk: tidak ada proses dijalankan, tidak ada folder dibuat", r.jenis === "url_tak_sah" && p.dipanggil.length === 0 && p.dihapus.length === 0);
p = buat({ berkasVideo: false, unduh: { kode: 1, stderr: "ERROR: HTTP Error 429: Too Many Requests" } });
r = await p.penyidik.periksa(URL_OK);
cek("429 → dibatasi, ffmpeg tidak dijalankan, folder dihapus", r.jenis === "dibatasi" && p.dipanggil.length === 1 && p.dihapus.length === 1, r);
p = buat({ berkasVideo: false, unduh: { kode: 1, stderr: "ERROR: Sign in to confirm you're not a bot" } });
cek("butuh login → login", (await p.penyidik.periksa(URL_OK)).jenis === "login");
p = buat({ berkasVideo: false, unduh: { kode: null, waktuHabis: true } });
cek("unduh kehabisan waktu → waktu_habis", (await p.penyidik.periksa(URL_OK)).jenis === "waktu_habis");
p = buat({ berkasVideo: false, unduh: { kode: 1, stderr: "ERROR: Unsupported URL" } });
r = await p.penyidik.periksa(URL_OK);
cek("unduh gagal biasa → gagal dengan alasan", r.jenis === "gagal" && /Unsupported URL/.test(r.galat ?? ""), r);
p = buat({ ff: { kode: 1, stderr: "Invalid data found" } });
r = await p.penyidik.periksa(URL_OK);
cek("ffmpeg gagal → gagal", r.jenis === "gagal" && /Invalid data/.test(r.galat ?? ""), r);
p = buat({ ff: { waktuHabis: true, kode: null } });
cek("ffmpeg kehabisan waktu → waktu_habis", (await p.penyidik.periksa(URL_OK)).jenis === "waktu_habis");
p = buat({ mentah: null });
cek("keluaran ffmpeg tak terbaca → gagal", (await p.penyidik.periksa(URL_OK)).jenis === "gagal");
p = buat({ mentah: raw(3) });
r = await p.penyidik.periksa(URL_OK);
cek("terlalu pendek (<6 bingkai) → gagal", r.jenis === "gagal" && /pendek/.test(r.galat ?? ""), r);
p = buat({ mentah: new Uint8Array(20 * BYTE_PER_BINGKAI) });
r = await p.penyidik.periksa(URL_OK);
cek("layar hitam → tak_informatif (sidik tetap dikirim)", r.jenis === "tak_informatif" && r.sidik?.length === 20, r);

console.log("\n[D] Satu pemeriksaan pada satu waktu");
{
  let aktif = 0;
  let puncak = 0;
  const jalankan: JalankanProses = async (bin) => {
    aktif++;
    puncak = Math.max(puncak, aktif);
    await new Promise((r2) => setTimeout(r2, 5));
    aktif--;
    return { kode: 0, stdout: "", stderr: "", waktuHabis: false, terpotong: false };
  };
  const berkas: SistemBerkas = { buatDir: () => "/t", daftar: () => ["v.mp4"], baca: () => raw(20), hapusDir: () => {} };
  const pk = new PenyidikVideo({ ytdlpBin: "yt-dlp", ffmpegBin: "ffmpeg", cookiesFile: null, jalankan, berkas });
  await Promise.all([pk.periksa(URL_OK), pk.periksa(URL_OK), pk.periksa(URL_OK)]);
  cek("tiga permintaan serentak tidak pernah menjalankan >1 proses", puncak === 1, puncak);
}

console.log("\n[E] Perintah dari aplikasi & giliran");
cek("validasiPerintah menerima periksa_sidik", validasiPerintah({ perintah: "periksa_sidik", kandidat_id: 5, url: URL_OK })?.perintah === "periksa_sidik");
cek("validasiPerintah menolak bentuk salah", validasiPerintah({ perintah: "periksa_sidik", kandidat_id: 0, url: URL_OK }) === null && validasiPerintah({ perintah: "periksa_sidik", kandidat_id: 5, url: "" }) === null && validasiPerintah({ perintah: "periksa_sidik", kandidat_id: 5 }) === null && validasiPerintah({ perintah: "periksa_sidik", kandidat_id: "5", url: URL_OK }) === null);
const ker: KeadaanGiliran = { hilang: new Map(), harusBerhenti: () => false };
function depPalsu(penyidik?: DepGiliran["penyidik"]) {
  const laporan: LaporanRunner[] = [];
  const dep = {
    app: { denyut: async () => ({ sukses: true as const, jeda_global: false, menit_wib: 0, bots: [] }), ambilKerja: async () => ({ perintah: "diam" as const, alasan: "x" }), lapor: async (_b: number, l: LaporanRunner) => void laporan.push(l) },
    mesin: { buatHook: async () => "h", ambilKeadaan: async () => ({ jobs: [], stok: [] }), buatJob: async () => ({ jobs: [], stok: [] }) },
    pemanen: { panen: async () => ({ kandidat: [], jenis: "ok" as const }) },
    penyidik,
    tidur: async () => {},
    sekarang: () => 0,
    log: () => {},
  } as DepGiliran;
  return { dep, laporan };
}
const PERINTAH: PerintahRunner = { perintah: "periksa_sidik", kandidat_id: 9, url: URL_OK };
let d = depPalsu({ periksa: async () => ({ jenis: "ok", sidik: raw(20).length ? Array.from({ length: 8 }, (_, i) => `00000000000000${i}${i}`) : null }) });
let hasil = await jalankanPerintah(1, PERINTAH, d.dep, ker);
cek("sukses → lapor sidik ok dengan kandidat_id", hasil === "kerja" && d.laporan.length === 1 && d.laporan[0].jenis === "sidik" && d.laporan[0].status === "ok" && d.laporan[0].kandidat_id === 9 && d.laporan[0].sidik?.length === 8, d.laporan);
d = depPalsu({ periksa: async () => ({ jenis: "dibatasi", sidik: null, galat: "dibatasi platform (429)" }) });
await jalankanPerintah(1, PERINTAH, d.dep, ker);
cek("galat → lapor status gagal + alasan", d.laporan[0].jenis === "sidik" && d.laporan[0].status === "gagal" && d.laporan[0].sidik === null && /dibatasi/.test(d.laporan[0].galat ?? ""), d.laporan);
d = depPalsu({ periksa: async () => { throw new Error("meledak"); } });
await jalankanPerintah(1, PERINTAH, d.dep, ker);
cek("penyidik melempar → tetap melapor gagal (aplikasi tidak menunggu selamanya)", d.laporan[0].jenis === "sidik" && d.laporan[0].status === "gagal" && /meledak/.test(d.laporan[0].galat ?? ""));
d = depPalsu(undefined);
await jalankanPerintah(1, PERINTAH, d.dep, ker);
cek("tanpa penyidik → lapor gagal", d.laporan[0].jenis === "sidik" && d.laporan[0].status === "gagal");
void Penjadwal;

console.log("\n[F] Konfigurasi");
const env = { APP_URL: "https://pri-superapp.com", BOT_RUNNER_SECRET: "x".repeat(20) };
cek("ffmpegBin bawaan 'ffmpeg', bisa diganti", bacaKonfig(env).ffmpegBin === "ffmpeg" && bacaKonfig({ ...env, FFMPEG_BIN: "/opt/f" }).ffmpegBin === "/opt/f");

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
