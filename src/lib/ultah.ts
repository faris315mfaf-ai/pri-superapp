// ============================================================
// Ulang tahun (KHUSUS SISI SERVER).
//
// Dua tugas:
// 1. daftarUltahHariIni() — siapa saja yang berulang tahun hari ini
//    menurut WIB (dipakai /api/ultah untuk banner & confetti).
// 2. siaranUltahHarian() — sekali per hari mengirim notifikasi global
//    "Hari ini ulang tahun …". Menumpang after() di /api/sesi (yang
//    dipanggil setiap orang membuka aplikasi), jadi TANPA cron.
// ============================================================
import { supabase } from "@/lib/supabase";
import { kirimKabar } from "@/lib/notifikasi";

export type OrangUltah = {
  id: string;
  nama: string;
  nama_panggilan: string;
  avatar_url: string;
};

function tanggalWib(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function daftarUltahHariIni(): Promise<OrangUltah[]> {
  const db = supabase();
  // Jumlah anggota ~ratusan; menyaring bulan-tanggal di JS lebih
  // sederhana daripada RPC khusus, dan tetap satu query ringan.
  const { data } = await db
    .from("app_user")
    .select("id, nama, nama_panggilan, avatar_url, tanggal_lahir")
    .eq("aktif", true)
    .eq("status", "aktif")
    .not("tanggal_lahir", "is", null);

  const hariIni = tanggalWib().slice(5); // "MM-DD"
  return (data ?? [])
    .filter((u) => String(u.tanggal_lahir ?? "").slice(5, 10) === hariIni)
    .map((u) => ({
      id: String(u.id),
      nama: u.nama,
      nama_panggilan: u.nama_panggilan || u.nama.split(" ")[0],
      avatar_url: u.avatar_url ?? "",
    }));
}

const KUNCI_TERKIRIM = "ultah_terkirim";

/**
 * Kirim ucapan global maksimal SEKALI per hari. Kunci klaim di
 * pengaturan_sistem: hanya request yang berhasil mengubah nilainya ke
 * tanggal hari ini yang boleh mengirim — dua pembukaan aplikasi yang
 * berbarengan tidak akan menghasilkan ucapan dobel.
 */
export async function siaranUltahHarian(): Promise<void> {
  try {
    const hariIni = tanggalWib();
    const db = supabase();

    const { data: klaim } = await db
      .from("pengaturan_sistem")
      .update({ nilai: hariIni })
      .eq("kunci", KUNCI_TERKIRIM)
      .neq("nilai", hariIni)
      .select("kunci");
    if (!klaim || klaim.length === 0) return; // sudah dikirim hari ini

    const orang = await daftarUltahHariIni();
    if (orang.length === 0) return;

    const nama = orang.map((o) => o.nama_panggilan).join(", ");
    await kirimKabar({
      judul: "🎂 Ada yang ulang tahun hari ini!",
      isi:
        orang.length === 1
          ? `Hari ini adalah ulang tahun ${nama}. Jangan lupa beri ucapan!`
          : `Hari ini adalah ulang tahun ${nama}. Jangan lupa beri ucapan!`,
      kategori: "info",
      jenis_peristiwa: "ultah",
    });
  } catch (e) {
    // Gagal mengucapkan tidak boleh mengganggu pembukaan aplikasi.
    console.error("[ultah] siaran:", e);
  }
}
