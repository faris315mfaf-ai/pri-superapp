// Uji penyegar angka per video dari upload-post (lib/metrik-video-up, 25 Sep 2026).
// Jalankan: npx tsx tests/uji-metrik-video-up.mts
import {
  angkaSimpan,
  aturSiklus,
  bacaBatasUp,
  bacaSiklus,
  bagiKuota,
  barisMetrikVideo,
  batasUtama,
  idPlatformDariUrl,
  JARAK_SIKLUS_MS,
  kuotaMenipis,
  majukanSegar,
  majukanUtama,
  perluDaftarMedia,
  platformApp,
  platformDidukung,
  platformUp,
  siklusBaru,
  uraiJawabanLive,
  waktuUp,
} from "@/lib/metrik-video-up";
import { kodeMetrik, susunInsightKategori } from "@/lib/insight-kategori";
import { uraiMetrikPost } from "@/lib/metrik-post-up";
import { akunDariTautan, idVideo, kanonikTautan } from "@/lib/tautan-video";
import { adalahTautanPendek, alamatDariPengalihan, kodeTautanPendek } from "@/lib/tautan-pendek";

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

// ---------------------------------------------------------------
console.log("waktuUp");
cek("format upload-post (UTC tanpa zona)", waktuUp("2026-09-24 11:21:36.503000") === "2026-09-24T11:21:36.503Z", waktuUp("2026-09-24 11:21:36.503000"));
cek("tanpa pecahan detik", waktuUp("2026-02-10 14:30:00") === "2026-02-10T14:30:00.000Z");
cek("ISO ber-zona tetap", waktuUp("2026-08-30T16:19:31+0000") !== null);
cek("unix detik", waktuUp(1788123600) === new Date(1788123600 * 1000).toISOString());
cek("unix detik (teks)", waktuUp("1788123600") === new Date(1788123600 * 1000).toISOString());
cek("unix milidetik", waktuUp(1788123600123) === new Date(1788123600123).toISOString());
cek("kosong → null", waktuUp("") === null && waktuUp(null) === null && waktuUp(undefined) === null);
cek("sampah → null", waktuUp("kemarin sore") === null);
cek("nol → null (bukan 1970)", waktuUp(0) === null);

// ---------------------------------------------------------------
console.log("uraiJawabanLive — bentuk nyata dari upload-post (25 Sep 2026)");
const nyata = {
  success: true,
  post: {
    request_id: "2ad18a42aaaaaaaaaaaaaaaaaaaaaaaa",
    profile_username: "ryurikkun-pri-197",
    post_title: "Massa buruh sampaikan aspirasi",
    upload_timestamp: "2026-09-24 11:21:36.503000",
  },
  platforms: {
    youtube: { success: true, platform_post_id: "abcDEF12345", post_url: "https://www.youtube.com/watch?v=abcDEF12345", post_metrics: { views: 0, likes: 0, comments: 0, favorites: 0 }, post_metrics_source: "platform_api" },
    facebook: { success: true, platform_post_id: "1234567890", post_url: "https://www.facebook.com/reel/1234567890", post_metrics: { likes: 1, comments: 0, views: 2 } },
    x: { success: true, platform_post_id: "1971234567890123456", post_url: "https://x.com/akun/status/1971234567890123456", post_metrics_error: "X API error (HTTP 401). The tweet may have been deleted or the token expired." },
    instagram: { success: true, platform_post_id: "18330983293218037", post_url: "https://www.instagram.com/reel/DPabc123xyz/", post_metrics: { likes: 10, comments: 2, media_product_type: "REELS", views: 134, impressions: 150, reach: 120, saves: 3, shares: 4 } },
    threads: { success: true, platform_post_id: "1799", post_url: "https://www.threads.com/@akun/post/DPthr123", post_metrics: { views: 925, likes: 7, replies: 3, reposts: 1, quotes: 0, shares: 2 } },
    tiktok: { success: true, platform_post_id: "7551234567890123456", post_url: "https://www.tiktok.com/@akun/video/7551234567890123456", post_metrics: { views: 225, likes: 43, comments: 1, shares: 0, reach: 200, favorites: 5, new_followers: 2, profile_views: 9, retention: [{ second: "1", percentage: 0.7 }] } },
    linkedin: { success: false, error: "Not published" },
  },
};
const j = uraiJawabanLive(nyata);
const blok = (p: string) => j.blok.find((b) => b.platform === p);
cek("profil & judul terbaca", j.profil === "ryurikkun-pri-197" && j.judul === "Massa buruh sampaikan aspirasi");
cek("waktu unggah → ISO UTC", j.waktu_unggah === "2026-09-24T11:21:36.503Z", j.waktu_unggah);
cek("x → twitter", Boolean(blok("twitter")) && !blok("x"));
cek("X dengan post_metrics_error = galat", blok("twitter")?.status === "galat" && /401/.test(blok("twitter")?.galat ?? ""));
cek("galat tetap membawa post_url", blok("twitter")?.post_url.startsWith("https://x.com/") === true);
cek("success:false = tidak_terbit", blok("linkedin")?.status === "tidak_terbit");
cek("YouTube angka nol tetap 'ok' (nol ≠ tidak diketahui)", blok("youtube")?.status === "ok" && blok("youtube")?.metrik?.tayangan === 0);
cek("Instagram tayangan/suka/komentar/bagikan/simpan", (() => {
  const m = blok("instagram")?.metrik;
  return m?.tayangan === 134 && m.suka === 10 && m.komentar === 2 && m.bagikan === 4 && m.simpan === 3 && m.jangkauan === 120 && m.impresi === 150;
})(), blok("instagram")?.metrik);
cek("Threads: replies dihitung komentar", blok("threads")?.metrik?.komentar === 3, blok("threads")?.metrik);
cek("Threads: shares didahulukan dari reposts", blok("threads")?.metrik?.bagikan === 2);
cek("TikTok favorites = simpan", blok("tiktok")?.metrik?.simpan === 5);
cek("TikTok angka lain tetap dibawa", blok("tiktok")?.lain.new_followers === 2 && blok("tiktok")?.lain.profile_views === 9);
cek("TikTok mentah dibawa utuh (retention)", Array.isArray((blok("tiktok")?.mentah as { retention?: unknown })?.retention));
cek("Facebook likes/views", blok("facebook")?.metrik?.suka === 1 && blok("facebook")?.metrik?.tayangan === 2);

const kosongAngka = uraiJawabanLive({ platforms: { tiktok: { success: true, post_metrics: {} } } });
cek("post_metrics kosong = galat, bukan nol", kosongAngka.blok[0]?.status === "galat");
const tanpaMetrics = uraiJawabanLive({ platforms: { youtube: { success: true, post_url: "https://youtu.be/x" } } });
cek("tanpa post_metrics = galat", tanpaMetrics.blok[0]?.status === "galat");
cek("jawaban sampah → tanpa blok", uraiJawabanLive(null).blok.length === 0 && uraiJawabanLive("x").blok.length === 0 && uraiJawabanLive([1, 2]).blok.length === 0);
cek("platforms bukan objek → tanpa blok", uraiJawabanLive({ platforms: [{ platform: "tiktok" }] }).blok.length === 0);
const organik = uraiJawabanLive({ post: { platform_post_id: "123", platform: "instagram", profile_username: "p", source: "organic" }, platforms: { instagram: { success: true, platform_post_id: "123", post_metrics: { likes: 340, comments: 12, views: 8500 } } } });
cek("jawaban platform_post_id (organik) terbaca", organik.asal === "organic" && organik.blok[0]?.status === "ok" && organik.blok[0]?.metrik?.tayangan === 8500);
cek("organik tanpa post_url → post_url kosong (kode dari laporan)", organik.blok[0]?.post_url === "");

// ---------------------------------------------------------------
console.log("angkaSimpan");
const mX = uraiMetrikPost({ impressions: 480, likes: 5, replies: 2, reposts: 1, bookmarks: 4, quotes: 0 });
cek("X: tayangan = impressions", angkaSimpan("twitter", mX).tayangan === 480 && angkaSimpan("x", mX).tayangan === 480);
cek("X: komentar = replies, bagikan = reposts, favorit = bookmarks", (() => {
  const a = angkaSimpan("twitter", mX);
  return a.komentar === 2 && a.bagikan === 1 && a.favorit === 4 && a.suka === 5;
})(), angkaSimpan("twitter", mX));
const mIg = uraiMetrikPost({ impressions: 480, likes: 5 });
cek("platform lain TIDAK memakai impressions sebagai tayangan", angkaSimpan("instagram", mIg).tayangan === 0);
cek("null → 0, pecahan dibulatkan, negatif → 0", (() => {
  const a = angkaSimpan("tiktok", { suka: null, komentar: 2.6, bagikan: -3, tayangan: 10.4, impresi: null, jangkauan: null, simpan: null, post_url: "" });
  return a.suka === 0 && a.komentar === 3 && a.bagikan === 0 && a.tayangan === 10 && a.favorit === 0;
})());

// ---------------------------------------------------------------
console.log("barisMetrikVideo");
const kolomDasar = { favorit: false, sumber: false, mentah: false };
const dasar = {
  kode: "tt_7551234567890123456",
  platform: "tiktok",
  url: "https://www.tiktok.com/@akun/video/7551234567890123456",
  metrik: blok("tiktok")!.metrik!,
  mentah: blok("tiktok")!.mentah,
  akun_username: "@akun",
  user_id: 42,
  judul: "Judul unggahan",
  waktu_posting: "2026-09-24T11:21:36.503Z",
  kini: "2026-09-25T00:00:00.000Z",
  kolom: kolomDasar,
};
const b1 = barisMetrikVideo(dasar);
const KUNCI_DASAR = ["kode", "platform", "akun_username", "user_id", "nama_akun", "judul", "url", "waktu_posting", "tayangan", "suka", "komentar", "bagikan", "diperbarui_pada"].sort().join(",");
cek("kunci baris selalu sama (tanpa kolom sql/50)", Object.keys(b1).sort().join(",") === KUNCI_DASAR, Object.keys(b1));
cek("baris baru tanpa isi lama tetap lengkap", b1.akun_username === "akun" && b1.judul === "Judul unggahan" && b1.url === dasar.url && b1.tayangan === 225 && b1.user_id === 42);
cek("NOT NULL: nama_akun string kosong, bukan null", b1.nama_akun === "");
const b2 = barisMetrikVideo({
  ...dasar,
  judul: "",
  akun_username: "",
  lama: { url: "https://www.tiktok.com/t/7551234567890123456", judul: "Judul dari TikHub", nama_akun: "Akun Keren", akun_username: "akun_lama", waktu_posting: "2026-09-24T11:00:00Z", user_id: null },
});
cek("isi lama dipertahankan bila yang baru kosong", b2.judul === "Judul dari TikHub" && b2.akun_username === "akun_lama" && b2.nama_akun === "Akun Keren");
cek("URL lama dipertahankan", b2.url === "https://www.tiktok.com/t/7551234567890123456");
cek("waktu_posting lama dipertahankan", b2.waktu_posting === "2026-09-24T11:00:00Z");
cek("angka SELALU dari tarikan baru", b2.tayangan === 225 && b2.suka === 43 && b2.diperbarui_pada === "2026-09-25T00:00:00.000Z");
cek("user_id baru menggantikan null lama", b2.user_id === 42);
const b3 = barisMetrikVideo({ ...dasar, kolom: { favorit: true, sumber: true, mentah: true } });
cek("kolom sql/50 ikut bila ada", b3.favorit === 5 && b3.sumber === "upload-post" && typeof b3.mentah === "object");
const b4 = barisMetrikVideo({ ...dasar, user_id: null, lama: { user_id: "77" } });
cek("user_id lama dipakai bila pemilik tak diketahui", b4.user_id === 77);

// ---------------------------------------------------------------
console.log("batas kuota");
const hdr = (h: Record<string, string>) => (n: string) => h[n] ?? null;
const bt = bacaBatasUp(hdr({ "x-ratelimit-limit": "872", "x-ratelimit-remaining": "837", "x-ratelimit-reset": "1790350320" }));
cek("header terbaca", bt.batas === 872 && bt.sisa === 837 && bt.reset_ms === 1790350320000);
cek("reset milidetik tidak dikali lagi", bacaBatasUp(hdr({ "x-ratelimit-reset": "1790350320000" })).reset_ms === 1790350320000);
cek("tanpa header → null semua", (() => {
  const b = bacaBatasUp(hdr({}));
  return b.batas === null && b.sisa === null && b.reset_ms === null;
})());
cek("sisa banyak → tidak menipis", !kuotaMenipis(bt));
cek("sisa ≤ seperempat → menipis", kuotaMenipis({ batas: 872, sisa: 200, reset_ms: null }));
cek("batas kecil: cadangan minimal 20", kuotaMenipis({ batas: 40, sisa: 20, reset_ms: null }) && !kuotaMenipis({ batas: 40, sisa: 21, reset_ms: null }));
cek("sisa tak diketahui → jalan terus", !kuotaMenipis({ batas: null, sisa: null, reset_ms: null }));

// ---------------------------------------------------------------
console.log("siklus harian");
const t0 = Date.parse("2026-09-25T00:00:00Z");
const a = aturSiklus(null, t0, 4802, 30409);
cek("tanpa status → siklus 1 baru", a.baru && a.siklus.nomor === 1 && a.siklus.unggahan.batas_atas === 4802 && a.siklus.laporan.batas_atas === 30409);
cek("jalur baru belum mulai", a.siklus.unggahan.kursor === null && !a.siklus.unggahan.habis && a.siklus.unggahan.kursor_segar === 4802);
cek("batas utama awal = batas_atas", batasUtama(a.siklus.unggahan) === 4802);
let ju = majukanUtama(a.siklus.unggahan, 4703, false);
cek("kursor maju ke id terkecil yang dikerjakan", ju.kursor === 4703 && batasUtama(ju) === 4702 && !ju.habis);
ju = majukanUtama(ju, null, false);
cek("tanpa kemajuan kursor tetap", ju.kursor === 4703);
ju = majukanUtama(ju, 4800, false);
cek("kursor tidak pernah mundur", ju.kursor === 4703);
ju = majukanUtama(ju, 12, true);
cek("sampai dasar → habis", ju.habis);
cek("kursor ≤ 1 → habis", majukanUtama(a.siklus.laporan, 1, false).habis);
cek("jalur segar maju naik", majukanSegar(a.siklus.unggahan, 4810).kursor_segar === 4810 && majukanSegar(majukanSegar(a.siklus.unggahan, 4810), 4805).kursor_segar === 4810);
cek("jalur segar tanpa kemajuan tetap", majukanSegar(a.siklus.unggahan, null).kursor_segar === 4802);
cek("tabel kosong → jalur langsung habis", siklusBaru(1, t0, 0, 0).unggahan.habis && siklusBaru(1, t0, 0, 0).laporan.habis);

const tersimpan = JSON.stringify({ ...a.siklus, unggahan: ju, terakhir: new Date(t0 + 3600_000).toISOString() });
const b = aturSiklus(tersimpan, t0 + 2 * 3600_000, 4900, 30500);
cek("siklus berjalan dilanjutkan (bukan diulang)", !b.baru && b.siklus.nomor === 1 && b.siklus.unggahan.habis && b.siklus.unggahan.batas_atas === 4802);
const habisSemua = JSON.stringify({ ...a.siklus, unggahan: { ...ju, habis: true }, laporan: { ...a.siklus.laporan, habis: true } });
const c = aturSiklus(habisSemua, t0 + 5 * 3600_000, 4900, 30500);
cek("siklus habis < 20 jam → tunggu, ditandai selesai", !c.baru && c.siklus.selesai !== null && c.siklus.nomor === 1);
const jedaLama = new Date(t0 + JARAK_SIKLUS_MS + 60_000).toISOString();
const d = aturSiklus(JSON.stringify({ ...JSON.parse(habisSemua), jeda_sampai: jedaLama }), t0 + JARAK_SIKLUS_MS, 4900, 30500);
cek("siklus habis ≥ 20 jam → siklus baru", d.baru && d.siklus.nomor === 2 && d.siklus.unggahan.batas_atas === 4900 && d.siklus.laporan.batas_atas === 30500);
cek("siklus baru membawa jeda kuota", d.siklus.jeda_sampai === jedaLama);
cek("siklus baru: hitungan nol lagi", d.siklus.hitung.diminta === 0 && d.siklus.selesai === null);
const belumHabis = aturSiklus(tersimpan, t0 + 3 * JARAK_SIKLUS_MS, 5000, 31000);
cek("siklus belum habis tidak pernah dipotong walau > 20 jam", !belumHabis.baru && belumHabis.siklus.nomor === 1);
cek("status rusak → mulai ulang", aturSiklus("{bukan json", t0, 10, 10).baru && aturSiklus({ v: 2 }, t0, 10, 10).baru && aturSiklus({ v: 1, mulai: "x" }, t0, 10, 10).baru);
cek("bacaSiklus bolak-balik JSON", JSON.stringify(bacaSiklus(JSON.stringify(a.siklus))) === JSON.stringify(a.siklus));
cek("bacaSiklus menolak kursor bukan angka", bacaSiklus({ ...a.siklus, unggahan: { ...a.siklus.unggahan, kursor: "abc" } }) === null);

// ---------------------------------------------------------------
console.log("pembagian kuota");
cek("40 → segar 12, laporan 14", (() => {
  const k = bagiKuota(40);
  return k.segar === 12 && k.utamaLaporan === 14;
})(), bagiKuota(40));
cek("kuota 1 tetap bisa jalan", bagiKuota(1).segar === 1 && bagiKuota(1).utamaLaporan === 0);
cek("kuota 0 / negatif aman", bagiKuota(0).segar === 0 && bagiKuota(-5).segar === 0);

// ---------------------------------------------------------------
console.log("ID platform & kode video");
cek("TikTok: ID di alamat = ID platform", idPlatformDariUrl("tiktok", idVideo("tiktok", "https://www.tiktok.com/@a/video/7551234567890123456")) === "7551234567890123456");
cek("TikTok /t/<angka>", idPlatformDariUrl("tiktok", idVideo("tiktok", "https://www.tiktok.com/t/7551234567890123456")) === "7551234567890123456");
cek("YouTube shorts", idPlatformDariUrl("youtube", idVideo("youtube", "https://youtube.com/shorts/abcDEF12345")) === "abcDEF12345");
cek("X status", idPlatformDariUrl("twitter", idVideo("twitter", "https://x.com/a/status/1971234567890123456")) === "1971234567890123456");
cek("Instagram butuh daftar media", idPlatformDariUrl("instagram", "DPabc123xyz") === null && perluDaftarMedia("instagram"));
cek("Threads & Facebook butuh daftar media", perluDaftarMedia("threads") && perluDaftarMedia("facebook") && !perluDaftarMedia("tiktok"));
cek("TikTok ID pendek bukan ID video", idPlatformDariUrl("tiktok", "ZSabc") === null);
cek("platform didukung", platformDidukung("x") && platformDidukung("threads") && !platformDidukung("bilibili") && !platformDidukung("website"));
cek("nama platform bolak-balik", platformApp("X") === "twitter" && platformUp("twitter") === "x" && platformUp("tiktok") === "tiktok");
cek("kode post_url upload-post = kode laporan kanonik", kodeMetrik("tiktok", "https://www.tiktok.com/@akun/video/7551234567890123456") === kodeMetrik("tiktok", "https://www.tiktok.com/t/7551234567890123456"));
cek("kode IG reel = kode IG /p/", kodeMetrik("instagram", "https://www.instagram.com/reel/DPabc123xyz/") === kodeMetrik("instagram", "https://www.instagram.com/p/DPabc123xyz/?igsh=zz"));
cek("kode X dari 'x'", kodeMetrik("x", "https://x.com/a/status/1971234567890123456") === "x_1971234567890123456");
cek("akun dari tautan", akunDariTautan("tiktok", "https://www.tiktok.com/@Akun.Ku/video/7551234567890123456") === "Akun.Ku" && akunDariTautan("instagram", "https://www.instagram.com/reel/x/") === null);
cek("akun X 'i' bukan akun", akunDariTautan("twitter", "https://x.com/i/status/1971234567890123456") === null);
cek("akun Instagram dari alamat profil", akunDariTautan("instagram", "https://www.instagram.com/tvindependenindonesia/reel/DdsjDjxqJKY/") === "tvindependenindonesia");
cek("alamat Instagram biasa tanpa akun", akunDariTautan("instagram", "https://www.instagram.com/reel/DdsjDjxqJKY/?igsh=a") === null && akunDariTautan("instagram", "https://www.instagram.com/p/DdsjDjxqJKY/") === null);
cek("kanonik Instagram tetap tanpa akun", kanonikTautan("instagram", "https://www.instagram.com/tvindependenindonesia/reel/DdsjDjxqJKY/?utm_source=x") === "https://www.instagram.com/reel/DdsjDjxqJKY/");
cek("kanonik membuang pelacak", kanonikTautan("instagram", "https://www.instagram.com/reel/Dds6yKJJKxV/?utm_source=ig_web_copy_link&stkn=abc") === "https://www.instagram.com/reel/Dds6yKJJKxV/");
cek("kanonik TikTok /t/ + akun → bentuk lengkap", kanonikTautan("tiktok", "https://www.tiktok.com/t/7689494343802998036", "tvjendeladunia") === "https://www.tiktok.com/@tvjendeladunia/video/7689494343802998036");
cek("link bagikan Facebook bukan ID video angka", !/^fb_\d{6,}$/.test(kodeMetrik("facebook", "https://www.facebook.com/share/r/1DhSK4qJ8h/") ?? "") && /^fb_\d{6,}$/.test(kodeMetrik("facebook", "https://www.facebook.com/reel/1794514335072991/?s=fb") ?? ""));

// ---------------------------------------------------------------
console.log("susunInsightKategori — unggahan didahulukan, tanpa dobel");
const kodeTt = "tt_7551234567890123456";
const peta = new Map([[kodeTt, { kode: kodeTt, platform: "tiktok", judul: "J", url: "https://www.tiktok.com/@akun/video/7551234567890123456", thumbnail_url: "", nama_akun: "", akun_username: "akun", waktu_posting: null, tayangan: 225, suka: 43, komentar: 1, bagikan: 0, favorit: 0, durasi_detik: null, sumber: "", diperbarui_pada: "2026-09-25T00:00:00Z" }]]);
const s = susunInsightKategori(
  [
    { id: "u1", user_id: "42", platform: "tiktok", url_video: "https://www.tiktok.com/@akun/video/7551234567890123456", tanggal_wib: "2026-09-24", asal: "unggahan" },
    { id: "9", user_id: "7", platform: "tiktok", url_video: "https://www.tiktok.com/t/7551234567890123456?utm=1", tanggal_wib: "2026-09-24", asal: "laporan" },
    { id: "10", user_id: "7", platform: "youtube", url_video: "https://youtu.be/abcDEF12345", tanggal_wib: "2026-09-24", asal: "laporan" },
  ],
  peta,
  new Map([["42", "Pengunggah"], ["7", "Pelapor"]]),
);
cek("video sama dari dua sumber dihitung sekali", s.ringkasan.jumlah_video === 2, s.ringkasan);
cek("atribusi ke unggahan (sumber pertama)", s.video.find((v) => v.platform === "tiktok")?.asal === "unggahan" && s.video.find((v) => v.platform === "tiktok")?.pelapor === "Pengunggah");
cek("total hanya dari video terukur", s.ringkasan.total.tayangan === 225 && s.ringkasan.jumlah_terukur === 1);
cek("video tanpa angka tetap tampil", s.video.some((v) => v.platform === "youtube" && v.metrik === null));

// ---------------------------------------------------------------
console.log("link pendek (share FB/Threads, vt.tiktok)");
cek("vt.tiktok dikenali", kodeTautanPendek("tiktok", "https://vt.tiktok.com/ZSb1GF5MW/") === "ZSb1GF5MW" && adalahTautanPendek("tiktok", "https://vm.tiktok.com/ZMabc123/"));
cek("tiktok.com/t/<huruf> pendek, /t/<angka> BUKAN", adalahTautanPendek("tiktok", "https://www.tiktok.com/t/ZTabc123/") && !adalahTautanPendek("tiktok", "https://www.tiktok.com/t/7689494343802998036"));
cek("share Facebook r/v & fb.watch", adalahTautanPendek("facebook", "https://www.facebook.com/share/r/1JtEzXALhn/") && adalahTautanPendek("facebook", "https://m.facebook.com/share/v/19MpKvY5Wg/") && adalahTautanPendek("facebook", "https://fb.watch/v/1BbJMBxhVD/"));
cek("share Threads", kodeTautanPendek("threads", "https://www.threads.com/share/HNQZ9C51L/") === "HNQZ9C51L");
cek("link lengkap bukan link pendek", !adalahTautanPendek("facebook", "https://www.facebook.com/reel/946158698557752/") && !adalahTautanPendek("tiktok", "https://www.tiktok.com/@a/video/7551234567890123456") && !adalahTautanPendek("threads", "https://www.threads.com/@a/post/DdsjhEDmq7z"));
cek("platform salah → bukan", !adalahTautanPendek("instagram", "https://vt.tiktok.com/ZSb1GF5MW/"));
cek("kode alias link pendek TikTok/Threads", kodeMetrik("tiktok", "https://vt.tiktok.com/ZSb1GF5MW/") === "tt_s_ZSb1GF5MW" && kodeMetrik("threads", "https://www.threads.com/share/HNQZ9C51L/") === "th_s_HNQZ9C51L");
cek("kode share FB tetap seperti dulu", kodeMetrik("facebook", "https://www.facebook.com/share/r/1JtEzXALhn/") === "fb_1JtEzXALhn");
cek("pengalihan FB reel diterima", alamatDariPengalihan("facebook", "https://www.facebook.com/reel/28533999269595951/?rdid=Y940&share_url=x") !== null);
cek("pengalihan FB /videos/ diterima", alamatDariPengalihan("facebook", "https://www.facebook.com/61589337332504/videos/viral-judul/1234567890123/") !== null);
cek("pengalihan ke halaman masuk ditolak", alamatDariPengalihan("facebook", "https://www.facebook.com/login/?next=x") === null && alamatDariPengalihan("facebook", "/share/r/x") === null);
cek("pengalihan Threads & TikTok diterima", alamatDariPengalihan("threads", "https://www.threads.com/@tvindependenid/post/DdsjhEDmq7z?xmt=AQG") !== null && alamatDariPengalihan("tiktok", "https://www.tiktok.com/@tvrakyat.berandalive/video/7688364863449517320?_r=1") !== null);
cek("pengalihan postingan FB (story.php) → kode story_fbid", kodeMetrik("facebook", alamatDariPengalihan("facebook", "https://www.facebook.com/story.php?story_fbid=122112724167461305&id=61593839156737&rdid=x") ?? "") === "fb_122112724167461305");
cek("hasil urai → kode video asli", kodeMetrik("facebook", alamatDariPengalihan("facebook", "https://www.facebook.com/reel/946158698557752/?rdid=e") ?? "") === "fb_946158698557752");

console.log("susunInsightKategori — alias link pendek tidak dobel");
const kodeFb = "fb_946158698557752";
const angkaFb = { kode: kodeFb, platform: "facebook", judul: "", url: "https://www.facebook.com/reel/946158698557752", thumbnail_url: "", nama_akun: "", akun_username: "", waktu_posting: null, tayangan: 90, suka: 5, komentar: 1, bagikan: 0, favorit: 0, durasi_detik: null, sumber: "", diperbarui_pada: "2026-09-25T00:00:00Z" };
const s2 = susunInsightKategori(
  [
    { id: "1", user_id: "7", platform: "facebook", url_video: "https://www.facebook.com/share/r/19MpKvY5Wg/", tanggal_wib: "2026-09-23", asal: "laporan" },
    { id: "2", user_id: "8", platform: "facebook", url_video: "https://www.facebook.com/reel/946158698557752/", tanggal_wib: "2026-09-23", asal: "laporan" },
  ],
  new Map([
    ["fb_19MpKvY5Wg", { ...angkaFb, kode: "fb_19MpKvY5Wg" }],
    [kodeFb, angkaFb],
  ]),
  new Map(),
);
cek("link bagikan + link lengkap video sama = 1 video", s2.ringkasan.jumlah_video === 1 && s2.ringkasan.total.tayangan === 90, s2.ringkasan);
cek("kartu link bagikan berangka & beralamat asli", s2.video[0]?.metrik?.tayangan === 90 && s2.video[0]?.url === "https://www.facebook.com/reel/946158698557752");

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
