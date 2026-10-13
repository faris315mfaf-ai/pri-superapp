// Uji aturan posting bot & Antrean ACC — bagian murni (13 Okt 2026).
// Jalankan: npx tsx tests/uji-bot-posting.mts
import {
  CAPTION_MAKS_KARAKTER,
  JADWAL_BOT_MAKS_MENIT,
  JADWAL_BOT_MENIT,
  POSTING_MACET_MENIT,
  adaKredit,
  alasanTolakSetuju,
  batasCaption,
  bolehBatalkanJadwal,
  captionBawaan,
  jadwalPostingIso,
  klasifikasiGalatUnggah,
  kunciPlatform,
  postingAktif,
  postingMacet,
  tandaPemeriksaan,
  tandaSidik,
  validasiAksiAcc,
} from "@/lib/bot-posting-murni";
import { periksaJadwal } from "@/lib/jadwal-unggah";

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
const NOW = Date.parse("2026-10-13T05:00:30.000Z");

console.log("\n[A] Bendera posting (gagal tertutup)");
cek("mati bila env kosong / tak ada / aneh", !postingAktif("") && !postingAktif(undefined) && !postingAktif("0") && !postingAktif("false") && !postingAktif("nanti") && !postingAktif("  "));
cek("hidup hanya 1/true/ya (huruf besar & spasi diabaikan)", postingAktif("1") && postingAktif("true") && postingAktif(" YA ") && postingAktif("True"));

console.log("\n[B] Platform");
cek("nama tampilan → kunci", kunciPlatform("Instagram") === "instagram" && kunciPlatform("TikTok") === "tiktok" && kunciPlatform("YouTube") === "youtube" && kunciPlatform(" facebook ") === "facebook");
cek("X dan Twitter → twitter", kunciPlatform("X") === "twitter" && kunciPlatform("Twitter") === "twitter");
cek("tak dikenal → null", kunciPlatform("Friendster") === null && kunciPlatform("") === null && kunciPlatform(null) === null && kunciPlatform(undefined) === null);

console.log("\n[C] Kredit & caption bawaan");
cek("adaKredit mengenali pola umum", adaKredit("Judul\n\nSumber: @ntv") && adaKredit("Source: x") && adaKredit("cr: akun") && adaKredit("Video: @warga") && adaKredit("via: @a") && adaKredit("SUMBER : x"));
cek("adaKredit menolak tanpa penanda", !adaKredit("Judul saja") && !adaKredit("sumbernya katanya begini") && !adaKredit(""));
const cb = captionBawaan({ judul: "Banjir  di   Jakarta", sumberLabel: "NTV", platform: "instagram" });
cek("caption bawaan: judul dirapikan + kredit", cb === "Banjir di Jakarta\n\nSumber: NTV", cb);
cek("caption bawaan lolos adaKredit", adaKredit(cb));
const panjang = captionBawaan({ judul: "x".repeat(600), sumberLabel: "NTV News", platform: "twitter" });
cek("batas X 280: kredit dipertahankan, judul dipotong", panjang.length <= 280 && panjang.endsWith("Sumber: NTV News") && panjang.includes("…"), panjang.length);
cek("sumber kosong → tidak disebutkan", captionBawaan({ judul: "J", sumberLabel: "  ", platform: "tiktok" }).endsWith("tidak disebutkan"));
cek("batas per platform", batasCaption("twitter") === 280 && batasCaption("youtube") === 5000 && batasCaption("tak-ada") === 2200);

console.log("\n[D] Jadwal");
const j = Date.parse(jadwalPostingIso(NOW));
cek(`bawaan ${JADWAL_BOT_MENIT} menit ke depan, dibulatkan ke atas ke menit penuh`, j >= NOW + JADWAL_BOT_MENIT * 60_000 && j < NOW + (JADWAL_BOT_MENIT + 1) * 60_000 && j % 60_000 === 0, new Date(j).toISOString());
cek("tidak pernah lewat batas 30 menit / kurang 5 menit", Date.parse(jadwalPostingIso(NOW, 999)) <= NOW + (JADWAL_BOT_MAKS_MENIT + 1) * 60_000 && Date.parse(jadwalPostingIso(NOW, 0)) >= NOW + 5 * 60_000);
cek("jadwal bawaan lolos periksaJadwal pengunggah (tautan bertanda tangan)", periksaJadwal(jadwalPostingIso(NOW), true, NOW).sah);
cek("bisa dibatalkan bila > 2 menit lagi", bolehBatalkanJadwal(new Date(NOW + 5 * 60_000).toISOString(), NOW) && !bolehBatalkanJadwal(new Date(NOW + 60_000).toISOString(), NOW) && !bolehBatalkanJadwal(new Date(NOW - 1000).toISOString(), NOW) && !bolehBatalkanJadwal(null, NOW) && !bolehBatalkanJadwal("rusak", NOW));
cek("posting macet setelah batas; tanggal rusak = macet", postingMacet(new Date(NOW - (POSTING_MACET_MENIT + 1) * 60_000).toISOString(), NOW) && !postingMacet(new Date(NOW - 60_000).toISOString(), NOW) && postingMacet(null, NOW) && postingMacet("rusak", NOW));

console.log("\n[E] Galat unggah: pasti vs ambigu");
cek("4xx pasti (aman diulang)", klasifikasiGalatUnggah(400) === "pasti" && klasifikasiGalatUnggah(401) === "pasti" && klasifikasiGalatUnggah(409) === "pasti" && klasifikasiGalatUnggah(429) === "pasti");
cek("5xx / tanpa status ambigu (mungkin sudah terkirim)", klasifikasiGalatUnggah(500) === "ambigu" && klasifikasiGalatUnggah(504) === "ambigu" && klasifikasiGalatUnggah(undefined) === "ambigu" && klasifikasiGalatUnggah(null) === "ambigu" && klasifikasiGalatUnggah(NaN) === "ambigu");

console.log("\n[F] Validasi aksi ACC");
const v = (x: unknown) => validasiAksiAcc(x);
cek("setuju sah, caption dirapikan", (() => { const h = v({ aksi: "setuju", tugas_id: 5, caption: "  Halo\r\ndunia \n" }); return h.ok && h.aksi.aksi === "setuju" && h.aksi.caption === "Halo\ndunia"; })());
cek("setuju tanpa/kosong caption ditolak", !v({ aksi: "setuju", tugas_id: 5 }).ok && !v({ aksi: "setuju", tugas_id: 5, caption: "   " }).ok && !v({ aksi: "setuju", tugas_id: 5, caption: 7 }).ok);
cek("caption terlalu panjang ditolak", !v({ aksi: "setuju", tugas_id: 5, caption: "a".repeat(CAPTION_MAKS_KARAKTER + 1) }).ok && v({ aksi: "setuju", tugas_id: 5, caption: "a".repeat(CAPTION_MAKS_KARAKTER) }).ok);
cek("ulang / tolak / batalkan_jadwal sah tanpa caption", v({ aksi: "ulang", tugas_id: 1 }).ok && v({ aksi: "tolak", tugas_id: 1 }).ok && v({ aksi: "batalkan_jadwal", tugas_id: 1 }).ok);
for (const buruk of [0, -1, 1.5, "3", null, undefined, NaN, Infinity, true, [1]]) {
  cek(`tugas_id=${JSON.stringify(buruk) ?? "undefined"} ditolak`, !v({ aksi: "tolak", tugas_id: buruk }).ok);
}
cek("aksi asing / bukan objek ditolak", !v({ aksi: "hapus_semua", tugas_id: 1 }).ok && !v(null).ok && !v([]).ok && !v("setuju").ok && !v({}).ok);
cek("hasil tidak membawa kunci liar", (() => { const h = v({ aksi: "tolak", tugas_id: 2, penyusup: "x" }); return h.ok && Object.keys(h.aksi).sort().join() === "aksi,tugas_id"; })());

console.log("\n[G] Alasan menolak setuju (urutan prioritas)");
const siap = { postingAktif: true, botAktif: true, botJeda: false, jedaGlobal: false, platform: "instagram" as string | null, profilAda: true, akunTertaut: true as boolean | null, perluLoginUlang: false, stokAda: true, caption: "Judul\n\nSumber: NTV" };
const t = (o: Partial<typeof siap>) => alasanTolakSetuju({ ...siap, ...o });
cek("semua siap → boleh (null)", t({}) === null);
cek("posting mati → ditolak, paling dulu", /BOT_POSTING_AKTIF/.test(t({ postingAktif: false, botJeda: true }) ?? ""));
cek("jeda global / nonaktif / jeda bot", /dijeda/.test(t({ jedaGlobal: true }) ?? "") && /nonaktif/.test(t({ botAktif: false }) ?? "") && /dijeda/.test(t({ botJeda: true }) ?? ""));
cek("stok tak ada", /stok/.test(t({ stokAda: false }) ?? ""));
cek("platform tak dikenal", /Platform tujuan/.test(t({ platform: null }) ?? ""));
cek("profil belum ada → arahkan ke tautan profil", /Tautkan Profil/.test(t({ profilAda: false }) ?? ""));
cek("akun tak tertaut / perlu login ulang", /belum tertaut/.test(t({ akunTertaut: false }) ?? "") && /login ulang/.test(t({ perluLoginUlang: true }) ?? ""));
cek("akun tidak bisa diperiksa (null) TIDAK memblokir", t({ akunTertaut: null }) === null);
cek("caption kosong & kepanjangan", /wajib/.test(t({ caption: "  " }) ?? "") && /melebihi batas/.test(t({ platform: "twitter", caption: "x".repeat(281) }) ?? ""));

console.log("\n[H] Tanda pemeriksaan");
const tp = (o: Partial<Parameters<typeof tandaPemeriksaan>[0]> = {}) =>
  tandaPemeriksaan({ caption: "J\n\nSumber: NTV", platform: "instagram", akunTertaut: true, perluLoginUlang: false, stokAda: true, durasiDetik: 30, postingAktif: true, ...o });
cek("semua baik → tanpa warn/bad", tp().every((x) => x.jenis === "ok"), tp());
cek("tanpa kredit → bad", tp({ caption: "Judul saja" }).some((x) => x.jenis === "bad" && /kredit/.test(x.teks)));
cek("durasi pendek bad, panjang warn, null tak ada tanda durasi", tp({ durasiDetik: 1 }).some((x) => x.jenis === "bad" && /pendek/.test(x.teks)) && tp({ durasiDetik: 400 }).some((x) => x.jenis === "warn") && !tp({ durasiDetik: null }).some((x) => /Durasi/.test(x.teks)));
cek("akun belum tertaut / login ulang / tak bisa diperiksa", tp({ akunTertaut: false }).some((x) => x.jenis === "bad") && tp({ perluLoginUlang: true }).some((x) => x.jenis === "bad" && /login/.test(x.teks)) && tp({ akunTertaut: null }).some((x) => x.jenis === "warn"));
cek("posting mati → warn", tp({ postingAktif: false }).some((x) => x.jenis === "warn" && /belum diaktifkan/.test(x.teks)));
cek("platform tak dikenal & caption kepanjangan", tp({ platform: null }).some((x) => x.jenis === "bad") && tp({ platform: "twitter", caption: "x".repeat(300) + "\nSumber: a" }).some((x) => x.jenis === "bad" && /terlalu panjang/.test(x.teks)));

console.log("\n[I] Tanda sidik visual");
cek("tanpa informasi / menunggu → null", tandaSidik(null) === null && tandaSidik({ status: "menunggu", kembaran: null }) === null);
cek("ok tanpa kembaran → hijau", tandaSidik({ status: "ok", kembaran: null })?.jenis === "ok");
cek("kembaran 'sama' → merah, memuat persen", tandaSidik({ status: "ok", kembaran: { id: 7, skor: 0.93, putusan: "sama" } })?.jenis === "bad" && /93%/.test(tandaSidik({ status: "ok", kembaran: { id: 7, skor: 0.93, putusan: "sama" } })?.teks ?? ""));
cek("kembaran 'mungkin' → kuning", tandaSidik({ status: "ok", kembaran: { id: 7, skor: 0.6, putusan: "mungkin" } })?.jenis === "warn");
cek("gagal & tak informatif → kuning", tandaSidik({ status: "gagal", kembaran: null })?.jenis === "warn" && tandaSidik({ status: "tak_informatif", kembaran: null })?.jenis === "warn");

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
