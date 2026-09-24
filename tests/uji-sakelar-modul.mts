// Uji katalog sakelar modul (lib/sakelar-modul) — murni, tanpa jaringan.
// Jalankan: npx tsx tests/uji-sakelar-modul.mts
import { adalahKunciModul, bawaanModul, DAFTAR_MODUL, modulAktif, nilaiModul } from "@/lib/sakelar-modul";

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

console.log("\n[A] Nilai bawaan");
cek("kepatuhan_komen bawaannya MATI", bawaanModul("kepatuhan_komen") === false);
cek("ganti_akun_profil bawaannya NYALA", bawaanModul("ganti_akun_profil") === true);
cek("kunci unik", new Set(DAFTAR_MODUL.map((m) => m.kunci)).size === DAFTAR_MODUL.length);

console.log("\n[B] Nilai tersimpan menang atas bawaan");
cek("'true' menyalakan modul bawaan mati", nilaiModul("true", "kepatuhan_komen") === true);
cek("'false' mematikan modul bawaan nyala", nilaiModul("false", "ganti_akun_profil") === false);
cek("kosong = bawaan", nilaiModul("", "kepatuhan_komen") === false && nilaiModul(undefined, "ganti_akun_profil") === true);
cek("nilai asing = bawaan", nilaiModul("ya", "kepatuhan_komen") === false);

console.log("\n[C] Peta klien");
cek("peta belum termuat = bawaan", modulAktif(undefined, "kepatuhan_komen") === false && modulAktif(null, "ganti_akun_profil") === true);
cek("peta berisi true dipakai", modulAktif({ kepatuhan_komen: true }, "kepatuhan_komen") === true);
cek("peta berisi false dipakai", modulAktif({ ganti_akun_profil: false }, "ganti_akun_profil") === false);
cek("kunci lain di peta tak berpengaruh", modulAktif({ lain: true }, "kepatuhan_komen") === false);

console.log("\n[D] Validasi kunci (dipakai /api/master)");
cek("kunci sah diterima", adalahKunciModul("kepatuhan_komen") && adalahKunciModul("ganti_akun_profil"));
cek("kunci asing ditolak", !adalahKunciModul("ludo") && !adalahKunciModul(""));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
