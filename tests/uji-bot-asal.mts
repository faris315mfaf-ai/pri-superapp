// Uji analisis asal video dari kredit takarir (3F tahap A) — 13 Okt 2026. Murni.
// Jalankan: npx tsx tests/uji-bot-asal.mts
import { analisaAsal, kolomAsal, labelAkunAsal, labelKreditTakarir, normalAkun, tandaAsal, type AsalVideo, type MasukanAsal } from "@/lib/bot-asal";

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
const NTV = { sumberHandle: "@ntvnews", sumberPlatform: "instagram" };
const a = (caption: string, extra: Partial<MasukanAsal> = {}): AsalVideo => analisaAsal({ caption, judul: "", ...NTV, ...extra });

console.log("\n[A] normalAkun");
cek("handle, URL profil, nama berspasi", normalAkun("@NTVNews") === "ntvnews" && normalAkun("https://www.instagram.com/ntvnews/") === "ntvnews" && normalAkun("NTV News") === "ntvnews" && normalAkun("https://www.tiktok.com/@warga.jkt/video/123") === "wargajkt");
cek("kosong/null aman", normalAkun("") === "" && normalAkun(null) === "" && normalAkun(undefined) === "");

console.log("\n[B] Tanpa kredit");
cek("takarir biasa → tanpa_kredit", a("Banjir bandang terjang tiga desa, warga mengungsi #banjir #berita").status === "tanpa_kredit");
cek("kosong / null → tanpa_kredit", a("").status === "tanpa_kredit" && analisaAsal({ caption: null, judul: null }).status === "tanpa_kredit");
cek("kata 'sumber' tanpa titik dua bukan kredit", a("Menurut sumber di lapangan, korban bertambah").status === "tanpa_kredit");
cek("'video' tanpa titik dua bukan kredit", a("Video viral ini beredar luas").status === "tanpa_kredit");

console.log("\n[C] Kredit dengan tautan video");
let r = a("Detik-detik kebakaran pasar.\n\nSumber: https://www.tiktok.com/@warga.jkt/video/7301234567890123456");
cek("tautan TikTok → kredit_url, kunci & akun terbaca", r.status === "kredit_url" && r.kunci === "tiktok:7301234567890123456" && r.platform === "tiktok" && r.akun === "wargajkt" && r.keyakinan >= 0.8, r);
r = a("Video: https://youtu.be/dQw4w9WgXcQ?si=abc");
cek("tautan YouTube → kunci youtube", r.status === "kredit_url" && r.kunci === "youtube:dQw4w9WgXcQ", r);
r = a("📹 https://www.instagram.com/reel/Cabc123XYZ/");
cek("emoji kamera + tautan IG", r.status === "kredit_url" && r.kunci === "instagram:Cabc123XYZ", r);
r = a("Sumber: https://www.instagram.com/ntvnews/reel/Cabc123XYZ/");
cek("tautan ke akun sumber sendiri → milik_penerbit", r.status === "milik_penerbit" && r.kunci === "instagram:Cabc123XYZ", r);
r = a("Sumber: https://www.instagram.com/reel/Cself1234567/", { urlSendiri: "https://www.instagram.com/reel/Cself1234567/" });
cek("tautan ke video ini sendiri diabaikan", r.status === "tanpa_kredit", r);
cek("tautan tak dikenal (bukan platform video) → bukan kredit_url", a("Sumber: https://berita.example.com/artikel/123").status !== "kredit_url");

console.log("\n[D] Kredit akun / nama");
r = a("Kebakaran di Tanah Abang. Credit: @budi_santoso (TikTok)");
cek("handle + platform", r.status === "kredit_akun" && r.akun === "budi_santoso" && r.platform === "tiktok" && r.kunci === null, r);
r = a("cr: @warga.bekasi");
cek("'cr:' dikenali", r.status === "kredit_akun" && r.akun === "warga.bekasi", r);
r = a("Via: Polda Metro Jaya");
cek("nama tanpa handle → kredit_akun", r.status === "kredit_akun" && /poldametrojaya/.test(r.akun), r);
r = a("Dok. Humas Pemkot Surabaya #berita");
cek("'Dok.' tanpa titik dua tidak dikenali, dengan titik dua ya", r.status === "tanpa_kredit" && a("Dok: Humas Pemkot Surabaya #berita").status === "kredit_akun");
r = a("© @fotografer_lepas");
cek("© dikenali", r.status === "kredit_akun" && r.akun === "fotografer_lepas", r);
r = a("Source: @ig_user via Instagram");
cek("platform dari teks", r.platform === "instagram", r);
cek("hashtag memotong kredit", a("Sumber: Pemprov DKI #jakarta #berita").akun === "pemprovdki");
cek("beberapa baris: kredit di baris tengah", a("Judul panjang\nSumber: @saksi_mata\n#viral").akun === "saksi_mata");

console.log("\n[E] Kredit ke diri sendiri / generik");
cek("kredit nama akun sumber → milik_penerbit", a("Sumber: NTV News").status === "milik_penerbit" && a("Video: @ntvnews").status === "milik_penerbit" && a("Dok: NTV").status === "milik_penerbit");
cek("kredit pihak lain tidak dianggap milik penerbit", a("Sumber: Polri").status === "kredit_akun");
cek("nama pendek akun sumber (<3) tidak memicu salah cocok", analisaAsal({ caption: "Sumber: @abc_news", sumberHandle: "@a", sumberPlatform: "tiktok" }).status === "kredit_akun");
cek("kredit generik", a("Sumber: Istimewa").status === "kredit_generik" && a("Credit: netizen").status === "kredit_generik" && a("cr: Dok. Pribadi").status === "kredit_generik" && a("Video: warganet").status === "kredit_generik");
cek("generik: tidak menyebut platform sebagai akun", a("Via: Instagram").status === "kredit_generik");

console.log("\n[F] Pemilihan kredit terbaik");
r = a("Sumber: Istimewa\nVideo: https://www.tiktok.com/@saksi/video/7300000000000000001");
cek("tautan mengalahkan generik", r.status === "kredit_url", r);
r = a("Sumber: NTV\nCredit: @warga_asli");
cek("pihak lain mengalahkan kredit-ke-diri", r.status === "kredit_akun" && r.akun === "warga_asli", r);

console.log("\n[G] Tampilan & kolom");
cek("labelAkunAsal", labelAkunAsal({ ...a("Credit: @budi (TikTok)") }) === "@budi (TikTok)" && labelAkunAsal(a("")) === "");
cek("labelKreditTakarir: asal diketahui → '@akun (TikTok) via NTV'", labelKreditTakarir(a("Credit: @budi (TikTok)"), "NTV") === "@budi (TikTok) via NTV");
cek("labelKreditTakarir: tanpa asal → label sumber", labelKreditTakarir(a("Banjir"), "NTV") === "NTV" && labelKreditTakarir(a("Sumber: Istimewa"), "NTV") === "NTV" && labelKreditTakarir(a("Sumber: NTV"), "NTV") === "NTV");
cek("tandaAsal: ok untuk kredit_url/akun, warn lainnya", tandaAsal(a("Credit: @budi")).jenis === "ok" && tandaAsal(a("Sumber: https://www.tiktok.com/@x/video/7300000000000000002")).jenis === "ok" && tandaAsal(a("")).jenis === "warn" && tandaAsal(a("Sumber: NTV")).jenis === "warn" && tandaAsal(a("Sumber: Istimewa")).jenis === "warn");
const k = kolomAsal(a("Sumber: https://www.tiktok.com/@warga.jkt/video/7301234567890123456"));
cek("kolomAsal", k.asal_status === "kredit_url" && k.asal_kunci === "tiktok:7301234567890123456" && k.asal_akun === "wargajkt");
cek("kutipan dibatasi", a("Sumber: " + "x".repeat(400)).kutipan.length <= 160);

console.log("\n[H] Ketahanan");
cek("masukan aneh tidak melempar", (() => { try { analisaAsal({ caption: "\u0000\u0001 Sumber: :::: @ @@ http:// ", judul: "💥".repeat(1000), sumberHandle: "" }); analisaAsal({}); return true; } catch { return false; } })());
cek("takarir sangat panjang tidak lambat (<200 ms)", (() => { const t0 = Date.now(); analisaAsal({ caption: ("Sumber: " + "a ".repeat(50) + "\n").repeat(500) + "x".repeat(200000), sumberHandle: "@ntv" }); return Date.now() - t0 < 200; })());

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
