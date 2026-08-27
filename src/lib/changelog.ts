// ============================================================
// Changelog in-app (spek 1.14 bagian 1.4) — "Apa yang Baru".
//
// SATU sumber daftar perubahan per versi. Ditampilkan otomatis SEKALI
// begitu pengguna pertama membuka aplikasi setelah update (penanda
// versi terakhir yang dilihat disimpan di localStorage), dan bisa
// dibuka lagi kapan saja dari Pengaturan.
//
// Menambah rilis baru: tambahkan entri PALING ATAS di daftar ini.
// ============================================================

export type EntriChangelog = {
  versi: string;
  tanggal: string; // "27 Agustus 2026"
  judul: string;
  poin: string[];
};

export const CHANGELOG: EntriChangelog[] = [
  {
    versi: "1.15.0",
    tanggal: "28 Agustus 2026",
    judul: "Update besar: HR Center, embed sosmed, & kamera baru",
    poin: [
      "FIX: pesan chat tidak lagi terkirim dobel",
      "Cari nama di daftar chat + api streak lebih besar ala TikTok",
      "Grup divisi bisa ganti nama & foto, plus daftar anggota",
      "HR Center: lihat siapa sudah & belum komen + rincian per kader",
      "Absensi: filter status, foto bukti, dan penanda Tepat Waktu/Telat",
      "Rekap absensi jadi PDF dan bisa dikirim langsung ke WhatsApp",
      "Galeri 30 konten terbaru seluruh sosmed dengan angka & embed",
      "Profil baru: foto lebih besar, akun & video TV Rakyat-mu tampil",
      "Kamera absensi kini mirror + pilihan filter ala B612",
      "Jam digital berjalan di Beranda",
      "Master: reset sandi anggota & jelajah database foto",
    ],
  },
  {
    versi: "1.14.0",
    tanggal: "27 Agustus 2026",
    judul: "Update besar: chat, streak, & grup divisi",
    poin: [
      "Chat terbuka — mulai chat siapa saja tanpa menunggu persetujuan",
      "Ceklis biru ala WhatsApp: tahu kapan pesanmu sudah dibaca",
      "Kirim gambar di chat (terkompresi otomatis, hemat kuota)",
      "Tarik pesan — hapus pesan dari kedua sisi percakapan",
      "Grup chat otomatis per divisi untuk koordinasi internal",
      "Streak harian 🔥 — chat berpasangan & absensi berturut-turut",
      "Notifikasi ulang tahun bisa diklik → kirim ucapan otomatis",
      "Setujui semua pendaftar sekaligus (untuk pengurus)",
      "Mode perbaikan dengan hitung mundur & maskot Gembul",
      "Pimpinan Redaksi bisa mengatur tim & wewenang TV Rakyat",
      "Analisis QC kini lewat Ayrshare — angka insight lebih akurat",
    ],
  },
  {
    versi: "1.13.0",
    tanggal: "26 Agustus 2026",
    judul: "Performa & keamanan",
    poin: [
      "Aplikasi lebih cepat: bundle lebih ramping & gambar lebih ringan",
      "Perlindungan berlapis: rate limit & firewall",
      "Perbaikan angka dashboard yang tidak akurat",
    ],
  },
  {
    versi: "1.12.0",
    tanggal: "25 Agustus 2026",
    judul: "Struktur organisasi & absensi",
    poin: [
      "Struktur divisi & jabatan partai lengkap",
      "Absensi harian dengan swafoto & GPS",
      "Laporan kerja harian per anggota",
    ],
  },
];

/** Kunci localStorage: versi changelog terakhir yang sudah dilihat. */
export const KUNCI_CHANGELOG_DILIHAT = "pri-changelog-dilihat";
