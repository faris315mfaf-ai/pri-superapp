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
    versi: "1.18.0",
    tanggal: "28 Agustus 2026",
    judul: "HR Center lengkap & TV Rakyat makin rapi",
    poin: [
      "Ketua Divisi TV Rakyat otomatis bisa ACC & upload (tanpa penunjukan)",
      "Seksi TV Rakyat bisa diperkecil/diperbesar — preferensimu diingat",
      "Riwayat video: Bagikan ke WA semua tautan + siaran otomatis ke grup chat",
      "Analisis HR dikelompokkan 8 seksi rapi yang bisa dilipat",
      "Database Anggota: tabel lengkap + ganti password + chat WA langsung",
      "Halaman Absensi Hari Ini: filter lengkap + grafik pie & bar",
      "Setel KPI: rencana kerja divisi dengan prioritas, progress, & deadline",
      "Grup chat divisi kini mengikuti cakupan ZONA ketua divisi",
    ],
  },
  {
    versi: "1.17.0",
    tanggal: "28 Agustus 2026",
    judul: "Tambah sosmed dianalisis & tautkan akunmu sendiri",
    poin: [
      "HR Center: tombol tambah profil untuk menganalisis sosmed lain (mis. dpp.pri) — tautkan akunnya langsung dari aplikasi",
      "Analisis otomatis membaca SEMUA profil sekaligus",
      "TVR Saya: Hubungkan Sosmed (Login) — tautkan akun sungguhanmu, akun tertaut berlencana Terhubung",
      "Fondasi migrasi penyedia: siap beralih ke upload-post tanpa rombak",
    ],
  },
  {
    versi: "1.16.0",
    tanggal: "28 Agustus 2026",
    judul: "Koin hadir! Plus analisis komentar yang selalu segar",
    poin: [
      "KOIN 🪙 — kumpulkan dari absen, chat teman baru, laporan video, & tambah akun sosmed; saldo tampil di profilmu",
      "FIX: komentar yang dikirim setelah analisis kini ikut terhitung saat analisis berikutnya",
      "Analisis menampilkan batas jam data: \"Komentar terbaca hingga pukul …\"",
      "Rekap PDF: bila WhatsApp gagal, tautan unduhan tetap terkirim/tersedia",
      "Username akun TV Rakyat di profil bisa diklik menuju akunnya",
      "Master bisa mematikan fitur per DIVISI (bukan hanya per peran) & mengatur bonus koin",
    ],
  },
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
