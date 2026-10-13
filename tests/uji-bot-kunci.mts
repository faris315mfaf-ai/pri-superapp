// Uji kunci kanonik video sumber (13 Okt 2026). Murni, tanpa jaringan.
// Jalankan: npx tsx tests/uji-bot-kunci.mts
import { kunciKanonik } from "@/lib/bot-kunci";

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
const k = (u: string) => kunciKanonik(u)?.kunci ?? null;

console.log("\n[A] Bentuk URL berbeda, video SAMA → kunci sama");
cek("IG: /p/ dan /reel/ dan www/m dan parameter pelacak",
  k("https://www.instagram.com/reel/Cabc123XYZ/?igsh=abc&utm_source=x") === "instagram:Cabc123XYZ"
  && k("https://instagram.com/p/Cabc123XYZ") === "instagram:Cabc123XYZ"
  && k("https://m.instagram.com/ntv/reel/Cabc123XYZ/") === "instagram:Cabc123XYZ");
cek("YouTube: watch, youtu.be, shorts, embed, m.",
  k("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s") === "youtube:dQw4w9WgXcQ"
  && k("https://youtu.be/dQw4w9WgXcQ?si=zzz") === "youtube:dQw4w9WgXcQ"
  && k("https://www.youtube.com/shorts/dQw4w9WgXcQ") === "youtube:dQw4w9WgXcQ"
  && k("https://m.youtube.com/watch?v=dQw4w9WgXcQ") === "youtube:dQw4w9WgXcQ"
  && k("https://www.youtube.com/embed/dQw4w9WgXcQ") === "youtube:dQw4w9WgXcQ");
cek("TikTok: bentuk panjang dengan/tanpa www dan parameter",
  k("https://www.tiktok.com/@ntvnews/video/7301234567890123456?is_from_webapp=1") === "tiktok:7301234567890123456"
  && k("https://tiktok.com/@ntvnews/video/7301234567890123456") === "tiktok:7301234567890123456");
cek("X/Twitter: x.com dan twitter.com", k("https://x.com/ntv/status/1712345678901234567") === "x:1712345678901234567" && k("https://twitter.com/ntv/status/1712345678901234567?s=20") === "x:1712345678901234567");
cek("Facebook: reel, watch, videos", k("https://www.facebook.com/reel/1234567890123") === "facebook:1234567890123" && k("https://www.facebook.com/watch/?v=1234567890123") === "facebook:1234567890123" && k("https://www.facebook.com/ntv/videos/1234567890123/") === "facebook:1234567890123");
cek("host huruf besar & titik akhir dinormalkan", k("https://WWW.Instagram.COM./reel/Cabc123XYZ/") === "instagram:Cabc123XYZ");

console.log("\n[B] Video BERBEDA → kunci berbeda");
cek("IG kode beda huruf besar/kecil = beda video", k("https://instagram.com/reel/Cabc123xyz") !== k("https://instagram.com/reel/Cabc123XYZ"));
cek("platform beda dengan id sama = kunci beda", k("https://x.com/a/status/1234567890123") !== k("https://www.facebook.com/reel/1234567890123"));
cek("kunci memuat platform", kunciKanonik("https://youtu.be/dQw4w9WgXcQ")?.platform === "youtube");

console.log("\n[C] Ditolak (null)");
const tolak = (n: string, u: string) => cek(`tolak: ${n}`, kunciKanonik(u) === null, u);
tolak("URL pendek TikTok vm.", "https://vm.tiktok.com/ZSabc123/");
tolak("URL pendek TikTok vt.", "https://vt.tiktok.com/ZSabc123/");
tolak("fb.watch", "https://fb.watch/abc123/");
tolak("profil IG (bukan video)", "https://www.instagram.com/ntv/");
tolak("profil TikTok", "https://www.tiktok.com/@ntvnews");
tolak("kanal YouTube", "https://www.youtube.com/@ntv");
tolak("id YouTube salah panjang", "https://youtu.be/pendek");
tolak("platform tak dikenal", "https://contoh.com/video/123456");
tolak("skema javascript", "javascript:alert(1)");
tolak("skema file", "file:///etc/passwd");
tolak("data URI", "data:text/html,<script>");
tolak("localhost", "http://localhost/reel/Cabc123XYZ");
tolak("IP langsung", "http://127.0.0.1/reel/Cabc123XYZ");
tolak("IP privat", "http://192.168.1.10/p/Cabc123XYZ");
tolak("host tanpa titik", "http://instagram/reel/Cabc123XYZ");
tolak("kredensial di URL", "https://user:pass@www.instagram.com/reel/Cabc123XYZ");
tolak("domain tiruan (akhiran)", "https://evilinstagram.com/reel/Cabc123XYZ");
tolak("domain tiruan (subdomain palsu)", "https://instagram.com.evil.com/reel/Cabc123XYZ");
tolak("string kosong", "");
tolak("bukan URL", "ini bukan url");
tolak("terlalu panjang", "https://www.instagram.com/reel/" + "a".repeat(3000));

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
