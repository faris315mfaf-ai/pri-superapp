// Uji gerbang PEMBARUAN 2.1 (lib/rilis): siapa & kapan wajib verifikasi + tutorial.
// Jalankan: npx tsx tests/uji-rilis-21.mts
import { RILIS_21_PADA, rilis21Untuk, wajibPembaruan21 } from "@/lib/rilis";
import { desainBaru, latarBawaan } from "@/lib/desain-apple";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean) => {
  if (ok) {
    lulus++;
    console.log(`  ✔ ${n}`);
  } else {
    gagal++;
    console.log(`  ✘ ${n}`);
  }
};

const SEBELUM = RILIS_21_PADA - 60_000;
const SESUDAH = RILIS_21_PADA + 60_000;
const anggota = { id: "500", role: "anggota" };
const faris = { id: "176", role: "anggota" };
const selesai = { ...anggota, verifikasi_21_pada: "2026-10-07T08:00:00Z", tutorial_21_pada: "2026-10-07T08:05:00Z" };

cek("rilis jam 15.00 WIB", new Date(RILIS_21_PADA).toISOString() === "2026-10-07T08:00:00.000Z");
cek("anggota belum dapat sebelum rilis", !rilis21Untuk(anggota, SEBELUM) && !wajibPembaruan21(anggota, SEBELUM));
cek("faris (#176) dapat lebih dulu", rilis21Untuk(faris, SEBELUM) && wajibPembaruan21(faris, SEBELUM));
cek("anggota wajib setelah rilis", wajibPembaruan21(anggota, SESUDAH));
cek("verifikasi saja belum cukup (tutorial wajib)", wajibPembaruan21({ ...anggota, verifikasi_21_pada: "x" }, SESUDAH));
cek("selesai keduanya → tidak wajib lagi", !wajibPembaruan21(selesai, SESUDAH));
cek("master bebas", !wajibPembaruan21({ id: "4", role: "master" }, SESUDAH));
cek("superadmin (sesi: master+superadmin) bebas", !wajibPembaruan21({ id: "9", role: "master", superadmin: true }, SESUDAH));
cek("superadmin (peran DB) bebas", !wajibPembaruan21({ id: "9", role: "superadmin" }, SESUDAH));
cek("tanpa pengguna tidak wajib", !wajibPembaruan21(null, SESUDAH));
cek("desain baru untuk faris sebelum rilis", desainBaru(faris));
cek("latar bawaan faris Pagi", latarBawaan(faris) === "pagi");

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
