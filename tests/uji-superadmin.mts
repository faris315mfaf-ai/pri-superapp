// Uji peran SUPERADMIN (24 Sep 2026): dipetakan ke master kecuali Panel
// Master. Murni — keUserPublik tidak menyentuh jaringan.
// Jalankan: npx tsx tests/uji-superadmin.mts
import { keUserPublik, type BarisUser } from "@/lib/sesi";
import { adalahMasterAsli, adalahSuperadmin, peranTersembunyi } from "@/lib/peran";
import { bolehFitur } from "@/lib/fitur";

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

const baris = (role: string) =>
  ({
    id: 7, nama: "Uji", email: "u@x.id", role, jabatan: "", avatar_url: "", status: "aktif",
    profil_lengkap: true, username: "uji", nomor_wa: null, wa_terverifikasi: false, aktif: true,
  }) as unknown as BarisUser;

const sa = keUserPublik(baris("superadmin"));
const ms = keUserPublik(baris("master"));
const ag = keUserPublik(baris("anggota"));

console.log("\n[A] Pemetaan sesi");
cek("superadmin dilihat sebagai master", sa.role === "master", sa.role);
cek("superadmin membawa penanda", sa.superadmin === true);
cek("master tetap master tanpa penanda", ms.role === "master" && ms.superadmin === false);
cek("anggota tak berubah", ag.role === "anggota" && ag.superadmin === false);

console.log("\n[B] Panel Master hanya master asli");
cek("master asli", adalahMasterAsli(ms));
cek("superadmin BUKAN master asli", !adalahMasterAsli(sa));
cek("anggota bukan master", !adalahMasterAsli(ag));

console.log("\n[C] Pengenal superadmin");
cek("dari sesi", adalahSuperadmin(sa));
cek("dari baris DB", adalahSuperadmin({ role: "superadmin" }));
cek("master bukan superadmin", !adalahSuperadmin(ms));
cek("tetap tersembunyi di daftar umum", peranTersembunyi("superadmin"));

console.log("\n[D] Kuasa seperti master");
cek("matriks fitur tak menghalangi", bolehFitur({ "database.detail": false }, "database.detail", sa.role));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
