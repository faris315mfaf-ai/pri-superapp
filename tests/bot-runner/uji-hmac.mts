// Uji tanda tangan runner (13 Okt 2026). Murni, tanpa jaringan.
// Runner HARUS menghasilkan tanda yang diterima verifikasiTandaBot milik server.
// Jalankan: npx tsx tests/bot-runner/uji-hmac.mts
import { hitungTandaBot as tandaServer, verifikasiTandaBot, HEADER_BOT_NONCE as NONCE_S, HEADER_BOT_TANDA as TANDA_S, HEADER_BOT_WAKTU as WAKTU_S } from "@/lib/bot-hmac";
import { buatNonce, headerTertanda, hitungTandaBot as tandaRunner, HEADER_BOT_NONCE, HEADER_BOT_TANDA, HEADER_BOT_WAKTU } from "../../src/bot-runner/hmac";
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

const RAHASIA = "rahasia-uji-yang-cukup-panjang-123";
const SEKARANG = 1_760_000_000;

console.log("\n[A] Kesetaraan dengan lib/bot-hmac (server)");
const badanUji = [
  JSON.stringify({ aksi: "denyut", versi: "1.0" }),
  JSON.stringify({ aksi: "ambil_kerja", bot_id: 7 }),
  JSON.stringify({ aksi: "lapor", bot_id: 7, laporan: { jenis: "log", tahap: "cari", teks: "halo é 日本 \u0000 \"kutip\"" } }),
  "",
];
for (const b of badanUji) {
  cek(`tanda identik untuk badan ${JSON.stringify(b).slice(0, 30)}…`, tandaRunner(RAHASIA, SEKARANG, "abcdef0123456789abcdef", b) === tandaServer(RAHASIA, SEKARANG, "abcdef0123456789abcdef", b));
}
cek("nama header sama", HEADER_BOT_NONCE === NONCE_S && HEADER_BOT_TANDA === TANDA_S && HEADER_BOT_WAKTU === WAKTU_S);

console.log("\n[B] Header tertanda diterima verifikasi server");
const badan = JSON.stringify({ aksi: "denyut", versi: "1.0" });
const h = headerTertanda(RAHASIA, badan, SEKARANG, "nonce0123456789abcdef");
const hasil = verifikasiTandaBot({ rahasia: RAHASIA, waktu: h[HEADER_BOT_WAKTU], nonce: h[HEADER_BOT_NONCE], tanda: h[HEADER_BOT_TANDA], badan, sekarangDetik: SEKARANG });
cek("diterima server", hasil.sah === true, hasil);
const ubah = verifikasiTandaBot({ rahasia: RAHASIA, waktu: h[HEADER_BOT_WAKTU], nonce: h[HEADER_BOT_NONCE], tanda: h[HEADER_BOT_TANDA], badan: badan + " ", sekarangDetik: SEKARANG });
cek("badan diubah ditolak", ubah.sah === false);
const salah = verifikasiTandaBot({ rahasia: RAHASIA + "x", waktu: h[HEADER_BOT_WAKTU], nonce: h[HEADER_BOT_NONCE], tanda: h[HEADER_BOT_TANDA], badan, sekarangDetik: SEKARANG });
cek("rahasia lain ditolak", salah.sah === false);

console.log("\n[C] Nonce");
const a = buatNonce();
const b2 = buatNonce();
cek("nonce 32 heksadesimal", /^[0-9a-f]{32}$/.test(a), a);
cek("nonce lolos pola server (16..64 [A-Za-z0-9_-])", /^[A-Za-z0-9_-]{16,64}$/.test(a));
cek("nonce acak (tidak sama)", a !== b2);
const h2 = headerTertanda(RAHASIA, badan);
cek("header otomatis memakai waktu sekarang", Math.abs(Number(h2[HEADER_BOT_WAKTU]) - Date.now() / 1000) < 5);
cek("dua header otomatis memakai nonce berbeda", h2[HEADER_BOT_NONCE] !== headerTertanda(RAHASIA, badan)[HEADER_BOT_NONCE]);
const sah2 = verifikasiTandaBot({ rahasia: RAHASIA, waktu: h2[HEADER_BOT_WAKTU], nonce: h2[HEADER_BOT_NONCE], tanda: h2[HEADER_BOT_TANDA], badan, sekarangDetik: Math.floor(Date.now() / 1000) });
cek("header otomatis diterima server", sah2.sah === true, sah2);

console.log("\n[D] Konfigurasi");
const dasar = { APP_URL: "https://pri-superapp.com/", BOT_RUNNER_SECRET: RAHASIA };
const k = bacaKonfig(dasar);
cek("garis miring akhir dibuang", k.appUrl === "https://pri-superapp.com");
cek("bawaan soket & yt-dlp", k.soketMesin === "/run/autoedit/api.sock" && k.ytdlpBin === "/usr/local/bin/yt-dlp" && k.cookiesFile === null);
cek("cookies dari env", bacaKonfig({ ...dasar, BOT_COOKIES_FILE: "/run/bot-cookies/c.txt" }).cookiesFile === "/run/bot-cookies/c.txt");
const lempar = (env: Record<string, string | undefined>) => {
  try {
    bacaKonfig(env);
    return false;
  } catch {
    return true;
  }
};
cek("tanpa APP_URL ditolak", lempar({ BOT_RUNNER_SECRET: RAHASIA }));
cek("APP_URL http (bukan localhost) ditolak", lempar({ ...dasar, APP_URL: "http://pri-superapp.com" }));
cek("APP_URL http localhost diterima (uji lokal)", !lempar({ ...dasar, APP_URL: "http://localhost:3000" }));
cek("tanpa rahasia ditolak", lempar({ APP_URL: "https://pri-superapp.com" }));
cek("rahasia pendek ditolak", lempar({ ...dasar, BOT_RUNNER_SECRET: "pendek" }));
cek("selang denyut dibatasi", bacaKonfig({ ...dasar, BOT_DENYUT_MS: "1" }).selangDenyutMs === 5000);

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
