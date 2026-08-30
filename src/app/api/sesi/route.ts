// GET    /api/sesi — tukar token perangkat dengan data akun (otomatis login)
// DELETE /api/sesi — keluar (?semua=1 untuk keluar dari semua perangkat)
//
// Inilah yang membuat pengguna tidak perlu mengetik apa pun saat membuka
// aplikasi: token yang tersimpan di ponsel ditukar dengan profil terbaru
// dari server. Data selalu segar — peran yang baru diubah super admin
// langsung berlaku di pembukaan berikutnya.
import { bungkus } from "@/lib/api-helper";
import {
  cabutSemuaSesi,
  cabutSesi,
  userDariToken,
  userDariTokenLonggar,
} from "@/lib/sesi";
import { pastikanBukanPerbaikan } from "@/lib/perbaikan";
import { siaranUltahHarian } from "@/lib/ultah";
import { siaranVerifikasiBerkala } from "@/lib/verifikasi-ingatkan";
import { sinkronKontenTvTerjadwal } from "@/lib/sinkron-konten-tv";
import { after } from "next/server";

export const dynamic = "force-dynamic";
// Respons /api/sesi tetap kembali seketika; nilai ini hanya memberi
// ruang bagi pekerjaan after() (sinkron konten TV Rakyat, anggaran ~40 dtk)
// agar tuntas tanpa dipotong. Hanya SATU pembukaan aplikasi per jendela
// 30 menit yang benar-benar menjalankan sinkron (klaim atomik).
export const maxDuration = 60;

/** Ambil token dari header Authorization: Bearer <token> */
function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const token = tokenDari(request);
    if (!token) {
      throw Object.assign(new Error("Belum masuk"), { status: 401 });
    }

    const user = await userDariToken(token);
    if (!user) {
      // Jalur ketat menolak akun "menunggu" — tapi bagi halaman tunggu
      // (fitur 1.19.1) itu BUKAN sesi tidak sah: pendaftar Google/biasa
      // memoles status di sini tiap 5 detik sampai pengurus menyetujui.
      // Kembalikan profilnya apa adanya (status "menunggu"); klien yang
      // menahannya di halaman tunggu, dan endpoint data lain tetap
      // menolaknya lewat userDariToken masing-masing.
      const longgar = await userDariTokenLonggar(token);
      if (longgar) {
        // Bisa "menunggu" (kasus normal halaman tunggu), tapi bisa juga
        // "aktif": statusnya BERUBAH di antara dua pembacaan — pengurus
        // menekan Setujui persis saat permintaan ini berjalan. Keduanya
        // dikembalikan apa adanya; 401 di sini membuat klien membuang
        // token dan salah menampilkan "ditolak" (race nyata yang
        // tertangkap saat pengujian 1.19.1). Akun nonaktif/ditolak
        // tetap tersaring: userDariTokenLonggar mengembalikan null.
        return { user: longgar };
      }
      // Token tidak dikenal, akun dinonaktifkan, atau persetujuannya
      // dicabut. Semuanya berarti hal yang sama bagi aplikasi: kembali
      // ke halaman masuk.
      throw Object.assign(new Error("Sesi tidak berlaku lagi"), { status: 401 });
    }

    // Mode perbaikan: semua orang selain master tertahan di sini.
    await pastikanBukanPerbaikan(user.role);

    // Ucapan ulang tahun global — sekali sehari, menumpang pembukaan
    // aplikasi siapa pun (tanpa cron).
    after(siaranUltahHarian);
    // Ajakan verifikasi berkala (fitur 1.22.x/1) — sekali per jendela
    // (bawaan 60 menit) ke anggota yang WA/Google/Wajah-nya belum lengkap.
    after(siaranVerifikasiBerkala);
    // Sinkron konten TV Rakyat dari Ayrshare — sekali per jendela (bawaan
    // 30 menit): isi kanal konten + daftar postingan wajib-komen + cek
    // komentar. Tanpa cron; menumpang pembukaan aplikasi.
    after(sinkronKontenTvTerjadwal);

    return { user };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const token = tokenDari(request);
    if (!token) return { sukses: true };

    const semua = new URL(request.url).searchParams.get("semua") === "1";
    if (semua) {
      const user = await userDariToken(token);
      if (user) await cabutSemuaSesi(user.id);
    } else {
      await cabutSesi(token);
    }
    return { sukses: true };
  });
}
