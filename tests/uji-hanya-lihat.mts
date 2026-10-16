// Uji SUPERUSER mode lihat (16 Okt 2026). Murni. Jalankan: npx tsx tests/uji-hanya-lihat.mts
import fs from "node:fs";
import { bolehTulisSuperuser } from "@/lib/hanya-lihat";
import { adalahSuperuser, peranTersembunyi } from "@/lib/peran";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n);
  }
};

console.log("Membaca selalu boleh");
cek("GET/HEAD/OPTIONS", ["GET", "HEAD", "OPTIONS", "get"].every((m) => bolehTulisSuperuser(m, "/api/pengguna")));

console.log("Perubahan data ditolak");
for (const [m, p] of [
  ["POST", "/api/pengguna"],
  ["PATCH", "/api/pengguna"],
  ["DELETE", "/api/video-antrian/abc"],
  ["POST", "/api/tv/unggah"],
  ["POST", "/api/tv/jadwal"],
  ["POST", "/api/master"],
  ["POST", "/api/tvr/kendali"],
  ["POST", "/api/chat"],
  ["PUT", "/api/ruang/karakter"],
  ["PATCH", "/api/profil"],
  ["POST", "/api/sesi"],
  ["POST", "/api/notifikasi"],
  ["POST", "/api/autoedit"],
  ["POST", "/api/loginx"],
  ["POST", "/api/preferensi/lain"],
] as const) {
  cek(`${m} ${p} ditolak`, !bolehTulisSuperuser(m, p));
}

console.log("Kebutuhan pemirsa tetap jalan");
for (const [m, p] of [
  ["DELETE", "/api/sesi"],
  ["PATCH", "/api/notifikasi"],
  ["POST", "/api/push/langganan"],
  ["DELETE", "/api/push/langganan"],
  ["POST", "/api/preferensi"],
  ["POST", "/api/log-klien"],
  ["PUT", "/api/pembaruan-21"],
  ["POST", "/api/verifikasi/wa-nomor"],
  ["PUT", "/api/sandi"],
  ["POST", "/api/webauthn/daftar/mulai"],
  ["POST", "/api/login"],
  ["POST", "/api/otp/kirim"],
] as const) {
  cek(`${m} ${p} boleh`, bolehTulisSuperuser(m, p));
}
cek("query diabaikan", !bolehTulisSuperuser("POST", "/api/pengguna?x=/api/sesi") && bolehTulisSuperuser("DELETE", "/api/sesi?semua=1"));

console.log("Peran");
cek("adalahSuperuser dari penanda & peran DB", adalahSuperuser({ superuser: true }) && adalahSuperuser({ role: "superuser" }) && !adalahSuperuser({ role: "master" }));
cek("superuser tersembunyi dari daftar anggota", peranTersembunyi("superuser"));
const sql = fs.readFileSync("sql/81_role_superuser.sql", "utf8");
cek("CHECK DB memuat superuser", /'superuser'/.test(sql));
const proxy = fs.readFileSync("src/proxy.ts", "utf8");
cek("proxy memakai penjaga mode lihat", /bolehTulisSuperuser/.test(proxy) && /superuser/.test(proxy));
const ae = fs.readFileSync("src/app/api/autoedit/[...jalur]/route.ts", "utf8");
cek("gateway autoedit (di luar proxy) ikut menjaga", /user\.superuser/.test(ae));

console.log("Peran biasa bermenu terbatas");
const sesi = fs.readFileSync("src/lib/sesi.ts", "utf8");
cek("sesi TIDAK memetakan superuser ke master/superadmin", /const superadmin = b\.role === "superadmin";/.test(sesi) && /superuser \? \{ superuser: true \}/.test(sesi));
cek("superuser tidak dipromosikan jadi super_admin oleh jabatan Ketua Umum (2 jalur)", (sesi.match(/u\.role !== "superuser"/g) ?? []).length === 2);
const halaman = fs.readFileSync("src/app/page.tsx", "utf8");
cek("menu superuser tetap: beranda, konten, tvnas, ruangbot, profil", /adalahSuperuser\(user\)\) \{\s*const menu: KunciTab\[\] = \["beranda", "konten", "tvnas", "ruangbot", "profil"\]/.test(halaman));
cek("beranda hanya sapaan, TV Nasional ringkas, Ruang Bot hanya ruang", /hanyaSapaan/.test(halaman) && /TvNasionalRingkasSuperuser/.test(halaman) && /hanyaRuang=\{adalahSuperuser\(user\)\}/.test(halaman));

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
