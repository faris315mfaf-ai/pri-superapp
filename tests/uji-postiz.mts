// Uji bagian MURNI klien Postiz — tanpa jaringan sama sekali.
//
// Yang diuji di sini adalah tempat-tempat yang, kalau salah, GAGAL
// DIAM-DIAM: nama platform yang tidak terpetakan (akun hilang dari
// daftar tanpa pesan galat), waktu yang tidak terbaca (laporan tidak
// pernah cocok, persis bug TikTok unix-detik di upload-post), dan id
// postingan yang tidak terambil (jadwal tidak bisa dibatalkan).
import {
  bacaDaftarPost,
  bacaIdBerkas,
  bacaIdPost,
  bacaIntegrasi,
  akunMilik,
  bangunMuatanPostiz,
  gagalDariPost,
  headerAuthPostiz,
  keAppPlatform,
} from "@/lib/postiz";

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

console.log("\n[A] Peta nama platform");
cek("x → twitter (nama kita)", keAppPlatform("x") === "twitter");
cek("tiktok tetap tiktok", keAppPlatform("tiktok") === "tiktok");
cek("INSTAGRAM huruf besar tetap terbaca", keAppPlatform("INSTAGRAM") === "instagram");
cek("instagram-standalone → instagram", keAppPlatform("instagram-standalone") === "instagram");
cek("facebook-page → facebook", keAppPlatform("facebook-page") === "facebook");
cek("platform asing tidak bikin macet", keAppPlatform("mastodon") === "mastodon");
cek("kosong tidak melempar", keAppPlatform("") === "");

console.log("\n[B] Membaca daftar akun tertaut");
const INTEG = [
  { id: "int-1", identifier: "x", name: "@tvrakyat", picture: "https://x/p.jpg", disabled: false, customer: { id: "cus-9", name: "Budi" } },
  { id: "int-2", identifier: "tiktok", name: "tvrakyat", disabled: true },
  { id: "int-3", providerIdentifier: "instagram", username: "tvr.ig", refreshNeeded: true },
  { tidakAdaId: true },
];
const akun = bacaIntegrasi(INTEG);
cek("baris tanpa id dibuang", akun.length === 3, akun.length);
cek("x dipetakan ke twitter", akun[0].platform === "twitter", akun[0]);
cek("id pelanggan terbaca dari objek", akun[0].pelanggan === "cus-9", akun[0].pelanggan);
cek("akun tanpa pelanggan → null", akun[1].pelanggan === null);
cek("disabled → mati", akun[1].mati === true);
cek("refreshNeeded juga dihitung mati", akun[2].mati === true);
cek("providerIdentifier dibaca bila identifier tak ada", akun[2].platform === "instagram", akun[2]);
cek("dibungkus {integrations:[…]} juga terbaca", bacaIntegrasi({ integrations: INTEG }).length === 3);
cek("dibungkus {data:[…]} juga terbaca", bacaIntegrasi({ data: INTEG }).length === 3);
cek("null tidak melempar", bacaIntegrasi(null).length === 0);
cek("bukan daftar tidak melempar", bacaIntegrasi({ aneh: 1 }).length === 0);

console.log("\n[C] Menyusun muatan kiriman");
const tujuan = [
  { id: "int-1", platform: "twitter" },
  { id: "int-9", platform: "youtube" },
];
const m = bangunMuatanPostiz({
  tujuan,
  judul: "Rapat Kader",
  caption: "Dokumentasi kegiatan",
  jadwalIso: "2026-09-20T03:00:00.000Z",
  terjadwal: true,
  berkasId: "berkas-7",
});
cek("tipe schedule saat terjadwal", m.type === "schedule");
cek("satu entri per integrasi", m.posts.length === 2);
cek("judul + caption digabung", m.posts[0].value[0].content === "Rapat Kader\n\nDokumentasi kegiatan", m.posts[0].value[0].content);
cek("berkas ikut tiap entri", m.posts[1].value[0].image?.[0]?.id === "berkas-7");
cek("YouTube dapat judul terpisah", m.posts[1].settings.title === "Rapat Kader", m.posts[1].settings);
cek("platform lain tidak diberi judul", Object.keys(m.posts[0].settings).length === 0);

const mSekarang = bangunMuatanPostiz({ tujuan, judul: "Tanpa caption", jadwalIso: "2026-09-20T03:00:00.000Z", terjadwal: false });
cek("tipe now saat tidak terjadwal", mSekarang.type === "now");
cek("tanpa caption → isi = judul saja", mSekarang.posts[0].value[0].content === "Tanpa caption");
cek("tanpa berkas → tidak ada field image", mSekarang.posts[0].value[0].image === undefined);

const mKhusus = bangunMuatanPostiz({
  tujuan,
  judul: "Judul",
  caption: "Umum",
  captionPer: { twitter: "Versi pendek X" },
  jadwalIso: "2026-09-20T03:00:00.000Z",
  terjadwal: false,
});
cek("caption khusus menang di platformnya", mKhusus.posts[0].value[0].content === "Versi pendek X");
cek("platform lain tetap caption umum", mKhusus.posts[1].value[0].content === "Judul\n\nUmum");

const mKosong = bangunMuatanPostiz({ tujuan: [{ id: "i", platform: "tiktok" }], judul: "   ", jadwalIso: "x", terjadwal: false });
cek("judul kosong tidak menghasilkan konten kosong", mKosong.posts[0].value[0].content === "TV Rakyat", mKosong.posts[0].value[0].content);

console.log("\n[D] Membaca id postingan (tanpa ini jadwal tak bisa dibatalkan)");
cek("bentuk {group}", bacaIdPost({ group: "grp-1" }) === "grp-1");
cek("bentuk {id}", bacaIdPost({ id: "p-2" }) === "p-2");
cek("id berupa angka", bacaIdPost({ id: 33 }) === "33");
cek("daftar → ambil yang pertama", bacaIdPost([{ id: "p-3" }, { id: "p-4" }]) === "p-3");
cek("dibungkus {posts:[…]}", bacaIdPost({ posts: [{ id: "p-5" }] }) === "p-5");
cek("kosong → null", bacaIdPost(null) === null);
cek("tanpa id → null", bacaIdPost({ apa: 1 }) === null);

console.log("\n[E] Membaca riwayat postingan");
const POSTS = [
  { id: "p1", state: "PUBLISHED", releaseURL: "https://x.com/a/1", content: "<p>Halo <b>dunia</b></p>", publishDate: "2026-09-14T10:00:00Z", integration: { id: "int-1", providerIdentifier: "x" } },
  { id: "p2", state: "ERROR", error: "Token expired", content: "Gagal", publishDate: 1789000000, integration: { id: "int-2", providerIdentifier: "tiktok" } },
  { id: "p3", state: "QUEUE", content: "Menunggu", publishDate: "2026-09-25T10:00:00Z", integration: { id: "int-3", providerIdentifier: "youtube" } },
];
const dp = bacaDaftarPost(POSTS);
cek("tiga postingan terbaca", dp.length === 3);
cek("x → twitter", dp[0].platform === "twitter");
cek("URL terbit terbaca", dp[0].url === "https://x.com/a/1");
cek("HTML dibersihkan dari isi", dp[0].isi === "Halo dunia", dp[0].isi);
cek("waktu ISO terbaca", dp[0].waktu === "2026-09-14T10:00:00.000Z", dp[0].waktu);
cek("waktu unix DETIK ikut terbaca (bug lama upload-post)", dp[1].waktu === new Date(1789000000000).toISOString(), dp[1].waktu);
cek("status huruf besar konsisten", dp[2].status === "QUEUE");
cek("belum terbit → url kosong, bukan undefined", dp[2].url === "");
cek("dibungkus {posts:[…]}", bacaDaftarPost({ posts: POSTS }).length === 3);
cek("null aman", bacaDaftarPost(null).length === 0);

console.log("\n[F] Menyaring yang gagal");
const g = gagalDariPost(dp);
cek("hanya satu yang gagal", g.length === 1, g);
cek("platformnya tiktok", g[0].platform === "tiktok");
cek("pesannya ikut", g[0].pesan === "Token expired");
cek("yang sudah terbit tidak dianggap gagal", !g.some((x) => x.platform === "twitter"));
cek("yang masih antre tidak dianggap gagal", !g.some((x) => x.platform === "youtube"));

console.log("\n[G] Id berkas & header auth");
cek("id berkas dari {id}", bacaIdBerkas({ id: "f-1" }) === "f-1");
cek("id berkas dari {path} bila tak ada id", bacaIdBerkas({ path: "/u/a.mp4" }) === "/u/a.mp4");
cek("kosong → null", bacaIdBerkas(null) === null);
cek("bawaan: kunci mentah tanpa Bearer", headerAuthPostiz("KUNCI", undefined) === "KUNCI");
cek("bisa dipaksa Bearer lewat env", headerAuthPostiz("KUNCI", "bearer") === "Bearer KUNCI");
cek("BEARER huruf besar juga", headerAuthPostiz("KUNCI", "BEARER") === "Bearer KUNCI");


console.log("\n[H] Mencocokkan akun ke anggota (label customer diketik manusia)");
const a0 = bacaIntegrasi(INTEG)[0]; // pelanggan id "cus-9", nama "Budi"
cek("cocok lewat id pelanggan", akunMilik(a0, "cus-9"));
cek("cocok lewat nama pelanggan", akunMilik(a0, "Budi"));
cek("beda huruf besar/kecil tetap cocok", akunMilik(a0, "budi"));
const aSpasi = bacaIntegrasi([{ id: "i", identifier: "x", customer: { id: "c", name: "Budi Santoso" } }])[0];
cek("tanda hubung diabaikan", akunMilik(aSpasi, "budi-santoso"));
const aStrip = bacaIntegrasi([{ id: "i", identifier: "x", customer: { id: "c", name: "budi-santoso" } }])[0];
cek("spasi diabaikan", akunMilik(aStrip, "Budi Santoso"));
cek("orang lain TIDAK ikut tercomot", !akunMilik(a0, "Siti"));
cek("kunci kosong tidak mencocokkan apa pun", !akunMilik(a0, ""));
cek("akun tanpa pelanggan tidak cocok ke siapa pun", !akunMilik(akun[1], "budi"));

console.log(`\nHASIL: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
