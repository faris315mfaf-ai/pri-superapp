// Uji hak Kelola Koin (5 Okt 2026): siapa boleh memberi & me-reset koin.
// Jalankan: npx tsx tests/uji-kelola-koin.mts
import { bolehKelolaKoin } from "@/lib/peran";

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

cek("master boleh", bolehKelolaKoin({ role: "master", jabatan: "" }));
// Superadmin di sesi dipetakan ke peran master + superadmin:true; peran DB-nya juga diterima.
cek("superadmin (sesi) boleh", bolehKelolaKoin({ role: "master", superadmin: true, jabatan: "" }));
cek("superadmin (peran DB) boleh", bolehKelolaKoin({ role: "superadmin", jabatan: "" }));
cek("Pimpinan Redaksi boleh", bolehKelolaKoin({ role: "anggota", jabatan: "Pimpinan Redaksi TV Rakyat" }));
cek("anggota biasa tidak", !bolehKelolaKoin({ role: "anggota", jabatan: "Anggota" }));
cek("Ketua Umum (super_admin) tidak", !bolehKelolaKoin({ role: "super_admin", jabatan: "Ketua Umum" }));
cek("admin TV tidak", !bolehKelolaKoin({ role: "admin_tv", jabatan: "" }));
cek("tanpa pengguna tidak", !bolehKelolaKoin(null));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
