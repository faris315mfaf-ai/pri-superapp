// Uji penjelasan galat unggah ke X dan sosmed lain lewat upload-post (14 Okt 2026): pesan NYATA dari produksi harus menghasilkan
// penyebab yang benar, saran yang benar, dan keputusan "boleh diulang" yang benar. Murni.
// Jalankan: npx tsx tests/uji-galat-x.mts
import { bacaGalat, jenisGalat, layakDiulang } from "@/lib/galat-unggah";
import { solusiGagal } from "@/lib/batas-caption";
import { gagalDariBalasan } from "@/lib/upload-post";

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

// Pesan apa adanya dari GET /uploadposts/status (results[].error_message), Sep–Okt 2026.
const PESAN = {
  spendCap: "Your monthly spend cap has been reached. If this issue persists, please contact support at info@upload-post.com. Learn more: https://docs.upload-post.com/resources/common-errors.",
  spendCap403: "Tweet creation failed (403): Your monthly spend cap has been reached. If this issue persists, please contact support at info@upload-post.com.",
  tidakDiizinkan: "Tweet creation failed (403): You are not permitted to perform this action. If this issue persists, please contact support at info@upload-post.com. Learn more: https://docs.upload-post.com/resources/common-errors",
  token401: "X API request failed during video upload: 401 Client Error: Unauthorized for url: https://api.x.com/2/media/upload?media_id=1977. If this issue persists, please contact support",
  reconnect: "Unauthorized. Please reconnect your X account at https://app.upload-post.com/manage-users. Learn more: https://docs.upload-post.com/resources/common-errors#session-expired",
  sesiHabis: "Your X session has expired and could not be refreshed.",
  terkunci: "Your account is temporarily locked.",
  unduhPutus: "Failed to download the video after 2 attempts (('Connection broken: IncompleteRead(57344971 bytes read, 1203 more expected)', IncompleteRead(57344971 bytes read, 1203 more expected)))",
  layanan: "Service Unavailable. Please wait and try again later.. Learn more: https://docs.upload-post.com/resources/common-errors#rate-limits.",
  koneksiReset: "X API request failed during video upload: ('Connection aborted.', ConnectionResetError(104, 'Connection reset by peer')). If this issue persists, please contact support",
  timeout: "X API request failed during video upload: _TrackHSP(host='api.x.com', port=443): Read timed out. (read timeout=30). If this issue persists, please contact support",
  tanpaId: "An unexpected error occurred after video upload: Tweet creation failed for part 1: No tweet ID in response: {'data': {'edit_history_tweet_ids': [], 'id': '', 'text': ''}}",
  tidakSelesai: "Upload partially completed: 5 of 6 platforms finished (threads, youtube, facebook, instagram, tiktok). The remaining platform(s) did not finish within the expected time and will not post. You can safely retry just the missing platform(s) without duplicating the ones that already posted.",
  panjang: "Video longer than 2 minutes",
};

const r = (k: keyof typeof PESAN) => solusiGagal("twitter", PESAN[k]);
const j = (k: keyof typeof PESAN) => jenisGalat(PESAN[k]);

console.log("\n[A] Kuota biaya X di upload-post (penyebab utama 14 Okt)");
cek("spend cap → kuota layanan, bukan akun", /Kuota posting X di layanan upload-post habis/.test(r("spendCap").ringkas) && /tidak perlu ditautkan ulang/.test(r("spendCap").solusi), r("spendCap"));
cek("spend cap (bentuk 403) tidak dianggap token kedaluwarsa", /Kuota posting X/.test(r("spendCap403").ringkas), r("spendCap403"));
cek("spend cap → jenis kuota, tombol Ulangi dimatikan", j("spendCap") === "kuota" && j("spendCap403") === "kuota" && bacaGalat("twitter", PESAN.spendCap).bolehUlang === false);

console.log("\n[B] Akun X dibatasi / terkunci");
cek("403 not permitted → akun dibatasi X, tautkan ulang tidak membantu", /dibatasi oleh X/.test(r("tidakDiizinkan").ringkas) && /TIDAK membantu/.test(r("tidakDiizinkan").solusi), r("tidakDiizinkan"));
cek("terkunci → buka kunci di aplikasi X lalu tautkan ulang", /dikunci/.test(r("terkunci").ringkas) && /tautkan ulang/.test(r("terkunci").solusi));
cek("dibatasi/terkunci → perbaiki dulu (tidak diulang)", j("tidakDiizinkan") === "perbaiki-dulu" && j("terkunci") === "perbaiki-dulu");

console.log("\n[C] Token kedaluwarsa → tautkan ulang upload-post");
for (const k of ["token401", "reconnect", "sesiHabis"] as const) {
  cek(`${k} → sambungan kedaluwarsa + tautkan ulang`, /kedaluwarsa/.test(r(k).ringkas) && /tautkan ulang/.test(r(k).solusi), r(k));
  cek(`${k} → perbaiki dulu`, j(k) === "perbaiki-dulu", j(k));
}

console.log("\n[D] Jaringan putus & gangguan sesaat → boleh diulang");
cek("unduhan video terputus → jaringan, akun aman, ulangi", /jaringan terputus/.test(r("unduhPutus").ringkas) && /Ulangi/.test(r("unduhPutus").solusi), r("unduhPutus"));
for (const k of ["layanan", "koneksiReset", "timeout"] as const) {
  cek(`${k} → gangguan sesaat`, /Gangguan sesaat/.test(r(k).ringkas), r(k));
}
cek("tidak selesai tepat waktu → sesaat, ulangi X saja (bukan 'video dobel')", /tidak selesai diproses/.test(r("tidakSelesai").ringkas) && !/dua kali/.test(r("tidakSelesai").ringkas), r("tidakSelesai"));
for (const k of ["unduhPutus", "layanan", "koneksiReset", "timeout", "tidakSelesai"] as const) {
  cek(`${k} → jenis sementara (boleh Ulangi)`, j(k) === "sementara" && bacaGalat("twitter", PESAN[k]).bolehUlang, j(k));
}

console.log("\n[E] Lainnya");
cek("tanpa ID tweet → cek akun dulu supaya tidak dobel", /tidak mengonfirmasi/.test(r("tanpaId").ringkas) && /tidak dobel/.test(r("tanpaId").solusi) && j("tanpaId") === "perbaiki-dulu");
cek("video > 2 menit → potong video", /terlalu panjang/.test(r("panjang").ringkas) && /2 menit 20 detik/.test(r("panjang").solusi));
cek("status polos 'completed' → penyebab tidak dilaporkan", /penyebab tidak dilaporkan/.test(solusiGagal("twitter", "completed").ringkas));
cek("aturan lama tetap: caption kepanjangan", /Caption terlalu panjang/.test(solusiGagal("twitter", "Text too long: 312 characters").ringkas));
cek("aturan lama tetap: jatah harian dengan angka", /Jatah unggah X habis \(10\/10/.test(solusiGagal("twitter", "Daily limit reached 10/10 posts").ringkas));
cek("platform lain memakai nama platformnya", /Kuota posting Instagram/.test(solusiGagal("instagram", PESAN.spendCap).ringkas));

console.log("\n[F] Kumpulan & pembacaan balasan");
cek("campuran spend cap + gangguan sesaat → Ulangi tetap ditawarkan", layakDiulang([{ platform: "twitter", pesan: PESAN.spendCap }, { platform: "threads", pesan: PESAN.layanan }]).bolehUlang);
cek("hanya spend cap → Ulangi ditolak dengan alasan batas platform", (() => { const x = layakDiulang([{ platform: "twitter", pesan: PESAN.spendCap }]); return !x.bolehUlang && /batas platform/.test(x.alasan); })());
const g = gagalDariBalasan({ results: [{ platform: "x", success: false, error_message: PESAN.spendCap }, { platform: "tiktok", success: true }] });
cek("gagalDariBalasan membaca error_message (x → twitter)", g.length === 1 && g[0].platform === "twitter" && /spend cap/.test(g[0].pesan), g);

console.log("\n[G] Sosmed lain — pesan nyata produksi (Sep–Okt 2026)");
const kasus: { platform: string; pesan: string; ringkas: RegExp; solusi?: RegExp; jenis: string }[] = [
  // Facebook
  { platform: "facebook", pesan: "No Facebook Pages found for your account. Posting to personal profiles is not supported by the Facebook API. Please connect or select a Facebook Page. Please check your Facebook account.", ringkas: /Halaman Facebook belum dipilih/, solusi: /profil pribadi/, jenis: "perbaiki-dulu" },
  { platform: "facebook", pesan: "Karena alasan keamanan, akun Anda mempunyai akses terbatas ke situs selama beberapa hari. Jika ada pertanyaan, hubungi Pusat Bantuan kami. If this issue persists, please contact support", ringkas: /dibatasi sementara oleh Facebook \(alasan keamanan\)/, solusi: /tidak membantu/, jenis: "perbaiki-dulu" },
  { platform: "facebook", pesan: "An unknown error occurred with Facebook. If this issue persists, please contact support at info@upload-post.com.", ringkas: /Gangguan sesaat/, jenis: "sementara" },
  { platform: "facebook", pesan: "Your Facebook session has expired or is invalid. Please reconnect your Facebook account at https://app.upload-post.com Details: Error validating access token: The session has been invalidated", ringkas: /kedaluwarsa — perlu ditautkan ulang/, jenis: "perbaiki-dulu" },
  // YouTube
  { platform: "youtube", pesan: "This YouTube channel has reached the number of videos it may upload today. The limit is set by YouTube per channel and resets around midnight Pacific Time. Reduce how many videos you upload.", ringkas: /Jatah unggah harian kanal YouTube sudah habis/, solusi: /14\.00–15\.00 WIB/, jenis: "kuota" },
  { platform: "youtube", pesan: "YouTube reports that @tvgalakzi has reached the number of videos it may upload today (a per-channel limit set by YouTube, usually reset around midnight Pacific Time).", ringkas: /Jatah unggah harian kanal YouTube/, jenis: "kuota" },
  { platform: "youtube", pesan: "The YouTube account of the authenticated user is suspended. In case the authenticated user is acting on behalf of another Google account, then this error refers to the latter.", ringkas: /dibatasi oleh YouTube/, jenis: "perbaiki-dulu" },
  // Threads
  { platform: "threads", pesan: "Threads token expired and refresh failed. Please reconnect at https://app.upload-post.com Learn more: https://docs Reconnect it in one click: https://x", ringkas: /Sambungan Threads kedaluwarsa/, jenis: "perbaiki-dulu" },
  { platform: "threads", pesan: "Threads media processing timed out. If this issue persists, please contact support at info@upload-post.com.", ringkas: /Gangguan sesaat/, jenis: "sementara" },
  { platform: "threads", pesan: "The upload to threads was interrupted after the media had already been handed to the platform, so it may or may not have been published. Check the account before retrying.", ringkas: /belum pasti tayang/, solusi: /tidak dobel/, jenis: "perbaiki-dulu" },
  // Instagram
  { platform: "instagram", pesan: "Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons. Please reconnect.", ringkas: /Sambungan Instagram kedaluwarsa/, solusi: /kata sandi akun diganti/, jenis: "perbaiki-dulu" },
  { platform: "instagram", pesan: "Your Instagram session has expired. Please reconnect your Instagram account at https://app.upload-post.com", ringkas: /Sambungan Instagram kedaluwarsa/, jenis: "perbaiki-dulu" },
  { platform: "instagram", pesan: "The Instagram account is restricted or inactive. Log into Instagram and resolve any prompts. Please log in to Instagram directly and resolve any account issues.", ringkas: /dibatasi oleh Instagram/, jenis: "perbaiki-dulu" },
  // TikTok
  { platform: "tiktok", pesan: "TikTok is experiencing a temporary internal issue. This is retryable and usually resolves on its own. We will retry automatically. If this issue persists, please contact support", ringkas: /Gangguan sesaat/, jenis: "sementara" },
  { platform: "tiktok", pesan: "You have reached the daily posting cap on tiktok (15 posts per 24 hours). The post was not sent. Spread your posts across more time or connect an additional account.", ringkas: /Jatah posting harian TikTok untuk akun ini habis \(15 posting per 24 jam\)/, jenis: "kuota" },
  { platform: "tiktok", pesan: "Your video is 2.7s long but TikTok requires at least 3 seconds. Extend it and try again.", ringkas: /Video terlalu pendek untuk TikTok/, solusi: /2\.7 detik.*minimal 3 detik/, jenis: "perbaiki-dulu" },
  { platform: "tiktok", pesan: "Something went wrong. Please try again later. If this issue persists, please contact support at info@upload-post.com.", ringkas: /Gangguan sesaat/, jenis: "sementara" },
  { platform: "tiktok", pesan: "Unsupported image size. Use a supported resolution/aspect ratio and try again. Please check that your media meets the platform's requirements (size, format).", ringkas: /Format\/durasi video tidak diterima TikTok/, jenis: "perbaiki-dulu" },
  { platform: "tiktok", pesan: "The authentication failed. Please check and retry. If this issue persists, please contact support at info@upload-post.com.", ringkas: /Sambungan TikTok kedaluwarsa/, jenis: "perbaiki-dulu" },
  { platform: "tiktok", pesan: "Failed to download the video after 2 attempts (('Connection broken: IncompleteRead(1 bytes read, 2 more expected)'", ringkas: /jaringan terputus/, jenis: "sementara" },
];
for (const k of kasus) {
  const s = solusiGagal(k.platform, k.pesan);
  const jn = jenisGalat(k.pesan);
  cek(`${k.platform}: ${k.pesan.slice(0, 60)}… → ${k.ringkas.source.slice(0, 40)}`, k.ringkas.test(s.ringkas) && (!k.solusi || k.solusi.test(s.solusi)), s);
  cek(`  jenis ${k.jenis}`, jn === k.jenis, jn);
}
cek("TikTok 'daily posting cap' TIDAK lagi dibaca sebagai 'menahan video di Kotak Masuk'", !/Kotak Masuk/.test(solusiGagal("tiktok", kasus.find((k) => /posting cap/.test(k.pesan))!.pesan).ringkas));
cek("aturan lama tetap: TikTok inbox", /Kotak Masuk/.test(solusiGagal("tiktok", "Video is pending review in the creator inbox").ringkas));

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
