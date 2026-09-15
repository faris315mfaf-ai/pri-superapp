// ============================================================
// ATURAN USERNAME (15 Sep 2026)
//
// Username adalah SALAH SATU identitas login — di /api/login, identitas
// yang diketik ditebak jenisnya: tanpa huruf sama sekali dianggap NOMOR
// WHATSAPP, mengandung "@" dianggap EMAIL, sisanya dianggap username.
//
// Akibatnya username yang seluruhnya angka (mis. "123456") tidak akan
// pernah bisa dipakai masuk: yang dicari nomor WhatsApp, bukan username.
// Dulu pendaftaran mengizinkannya — jebakan yang tak bersuara. Aturan di
// sini dipakai pendaftaran MAUPUN penggantian, supaya keduanya sepakat.
//
// Murni: tidak menyentuh jaringan maupun database.
// ============================================================

export const USERNAME_MIN = 3;
export const USERNAME_MAKS = 20;

/**
 * Nama yang tidak boleh diambil siapa pun. Bukan soal teknis, melainkan
 * supaya tidak ada anggota yang bisa menyamar sebagai akun resmi atau
 * pengurus di daftar, chat, dan notifikasi.
 */
const DILARANG = new Set([
  "admin",
  "administrator",
  "master",
  "superadmin",
  "super_admin",
  "developer",
  "dev",
  "root",
  "sistem",
  "system",
  "official",
  "pri",
  "pri_official",
  "tvrakyat",
]);

export type PeriksaUsername =
  | { sah: true; bersih: string }
  | { sah: false; pesan: string };

/**
 * Periksa & rapikan username. Mengembalikan bentuk BERSIH (huruf kecil,
 * tanpa spasi tepi) supaya pemanggil menyimpan yang sudah dinormalkan —
 * kolomnya unik tanpa peduli huruf besar/kecil.
 */
export function periksaUsername(masukan: string): PeriksaUsername {
  const bersih = (masukan ?? "").trim().toLowerCase();

  if (!bersih) return { sah: false, pesan: "Username belum diisi." };
  if (bersih.length < USERNAME_MIN) {
    return { sah: false, pesan: `Username minimal ${USERNAME_MIN} karakter.` };
  }
  if (bersih.length > USERNAME_MAKS) {
    return { sah: false, pesan: `Username maksimal ${USERNAME_MAKS} karakter.` };
  }
  if (!/^[a-z0-9._]+$/.test(bersih)) {
    return {
      sah: false,
      pesan: "Username hanya boleh berisi huruf, angka, titik, dan garis bawah.",
    };
  }
  // Penjaga terpenting — lihat penjelasan di kepala berkas.
  if (!/[a-z]/.test(bersih)) {
    return {
      sah: false,
      pesan:
        "Username harus memuat minimal satu huruf. Username yang seluruhnya angka akan dikira nomor WhatsApp saat login.",
    };
  }
  if (DILARANG.has(bersih)) {
    return { sah: false, pesan: `Username "${bersih}" dipakai sistem dan tidak bisa diambil.` };
  }

  return { sah: true, bersih };
}
