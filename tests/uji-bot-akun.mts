// Uji Kelola Bot (14 Okt 2026): validasi profil bot, username berikutnya, rupa. Murni.
// Jalankan: npx tsx tests/uji-bot-akun.mts
import { MAKS_BOT, NAMA_BOT_MAKS, PERAN_MAKS, PERSONA_MAKS, WAJAH_BOT, WARNA_BOT_PILIHAN, emailAkunBot, normalkanProfilBot, rupaBot, usernameBerikut } from "@/lib/bot-akun-murni";
import { DIVISI_BOT, adalahBot } from "@/lib/struktur";
import { PRIORITAS_PLATFORM, pilihPlatformBot } from "@/lib/bot-posting-murni";

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

const sah = { nama: "Raka", peran: "Redaktur Pencari", persona: "Teliti.", warna: "#F08A3C", handle: "@tvr.raka", platform: "instagram" };

console.log("\n[A] normalkanProfilBot");
const r = normalkanProfilBot(sah);
cek("masukan sah lolos, warna huruf kecil, platform kanonik", r.ok && r.nilai.warna === "#f08a3c" && r.nilai.platform === "Instagram" && r.nilai.nama === "Raka", r);
cek("nama kosong ditolak", !normalkanProfilBot({ ...sah, nama: "  " }).ok);
cek("nama terlalu panjang ditolak", !normalkanProfilBot({ ...sah, nama: "x".repeat(NAMA_BOT_MAKS + 1) }).ok);
cek("peran kosong ditolak", !normalkanProfilBot({ ...sah, peran: "" }).ok);
cek("peran terlalu panjang ditolak", !normalkanProfilBot({ ...sah, peran: "x".repeat(PERAN_MAKS + 1) }).ok);
cek("watak boleh pendek, terlalu panjang ditolak", normalkanProfilBot({ ...sah, persona: "" }).ok && !normalkanProfilBot({ ...sah, persona: "x".repeat(PERSONA_MAKS + 1) }).ok);
cek("watak bukan teks ditolak", !normalkanProfilBot({ ...sah, persona: 5 }).ok);
cek("warna bukan #rrggbb ditolak", !normalkanProfilBot({ ...sah, warna: "merah" }).ok && !normalkanProfilBot({ ...sah, warna: "#fff" }).ok && !normalkanProfilBot({ ...sah, warna: "<script>" }).ok);
cek("platform tak dikenal ditolak", !normalkanProfilBot({ ...sah, platform: "Facebook" }).ok);
cek("tanpa platform lolos: platform kosong = mengikuti profil upload-post", (() => { const { platform: _p, ...tanpa } = sah; void _p; const x = normalkanProfilBot(tanpa); return x.ok && x.nilai.platform === ""; })());
cek("platform kosong/spasi dianggap tidak diisi", (() => { const x = normalkanProfilBot({ ...sah, platform: "  " }); return x.ok && x.nilai.platform === ""; })());
cek("handle kosong boleh, handle aneh ditolak", normalkanProfilBot({ ...sah, handle: "" }).ok && !normalkanProfilBot({ ...sah, handle: "a b<c>" }).ok);
cek("karakter kontrol dibuang dari nama", (() => { const x = normalkanProfilBot({ ...sah, nama: "Ra\u0000ka\n" }); return x.ok && x.nilai.nama === "Ra ka"; })());
cek("bukan objek/field hilang ditolak", !normalkanProfilBot({}).ok);

console.log("\n[B] usernameBerikut");
cek("kosong -> bot1", usernameBerikut([]) === "bot1");
cek("lanjut nomor berikutnya", usernameBerikut(["bot1", "bot2"]) === "bot3");
cek("mengisi lubang pertama", usernameBerikut(["bot1", "bot3"]) === "bot2");
cek("tak peka huruf besar-kecil & spasi", usernameBerikut([" BOT1 ", "Bot2"]) === "bot3");
cek("akun manusia bernama bot-ish tidak mengganggu", usernameBerikut(["botak", "robot1", "bot1"]) === "bot2");
cek("email internal", emailAkunBot("bot7") === "bot7@pri.local");

console.log("\n[C] rupa");
const rp = rupaBot(2, "#4cae6b");
cek("kaus mengikuti warna, bayangan lebih gelap", rp.kaus === "#4cae6b" && rp.bayangan !== rp.kaus && /^#[0-9a-f]{6}$/.test(rp.bayangan));
cek("nomor di luar daftar dibungkus tanpa melempar", rupaBot(-1, "#4cae6b").kulit === WAJAH_BOT[WAJAH_BOT.length - 1].kulit && rupaBot(WAJAH_BOT.length, "#4cae6b").kulit === WAJAH_BOT[0].kulit);
cek("warna rusak -> kaus bawaan (tidak memasukkan teks liar)", rupaBot(0, "<x>").kaus === "#5b8def");
cek("topi membawa warnaTopi, kacamata/hud hanya bila true", rupaBot(0, "#f08a3c").warnaTopi === "#2d6a4f" && rupaBot(0, "#f08a3c").berhud === true && rupaBot(1, "#f08a3c").kacamata === undefined);
cek("10 rupa dan 8 warna pilihan", WAJAH_BOT.length === 10 && WARNA_BOT_PILIHAN.length === 8);
cek("semua warna pilihan sah", WARNA_BOT_PILIHAN.every((w) => normalkanProfilBot({ ...sah, warna: w }).ok));

console.log("\n[E] pilihPlatformBot: platform mengikuti akun tertaut");
cek("platform tersimpan yang dikenal dipakai (bot lama dari skrip)", pilihPlatformBot("TikTok", ["instagram"]) === "tiktok");
cek("kosong -> akun tertaut pertama menurut prioritas", pilihPlatformBot("", ["youtube", "tiktok"]) === "tiktok" && pilihPlatformBot(null, ["youtube"]) === "youtube");
cek("instagram menang atas yang lain", pilihPlatformBot("", ["tiktok", "instagram", "youtube"]) === "instagram");
cek("tak ada akun tertaut -> null", pilihPlatformBot("", []) === null && pilihPlatformBot(undefined, []) === null);
cek("platform tak dikenal di daftar tertaut diabaikan", pilihPlatformBot("", ["bilibili", null, "", "threads"]) === "threads");
cek("nama 'x' dipetakan ke twitter", pilihPlatformBot("", ["X"]) === "twitter");
cek("prioritas memuat enam platform tanpa duplikat", PRIORITAS_PLATFORM.length === 6 && new Set(PRIORITAS_PLATFORM).size === 6);

console.log("\n[D] konstanta & pagar");
cek("batas jumlah bot masuk akal", MAKS_BOT >= 3 && MAKS_BOT <= 50);
cek("Divisi BOT dikenali sebagai bot (tidak bisa login)", adalahBot({ divisi: DIVISI_BOT }) === true);

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
