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
    versi: "1.20.0",
    tanggal: "28 Agustus 2026",
    judul: "Atur tampilanmu sendiri + Asisten AI",
    poin: [
      "ATUR TATA LETAK di Beranda: geser urutan seksi, sembunyikan yang tak dipakai — semua seksi kini bisa dilipat/dibuka",
      "Atur Menu Bawah: pilih sendiri modul yang tampil di footer (Konten & Profil selalu ada)",
      "Modul KONTEN kini untuk semua: video TV Rakyat terbaru tampil sebagai EMBED dengan jam upload presisi + tugas komen & share",
      "ASISTEN AI baru (khusus jabatan terpilih): tanya data partai lewat teks ATAU suara 2 arah realtime",
      "Pimred kini mengatur ukuran video maksimal (1–200 MB) & umur tayang video di aplikasi (1–24 jam)",
      "Riwayat video menunjukkan persis platform mana yang gagal + tombol ULANGI — video dijamin tidak terunggah dua kali",
      "Notifikasi otomatis saat sebagian platform gagal menerima video",
    ],
  },
  {
    versi: "1.19.1",
    tanggal: "28 Agustus 2026",
    judul: "Daftar lewat Google + halaman tunggu pintar",
    poin: [
      "Daftar dengan Google — tanpa isi formulir & OTP; akun langsung dibuat, tinggal menunggu persetujuan pengurus",
      "HALAMAN TUNGGU baru: setelah mendaftar, biarkan terbuka — begitu pengurus menyetujui, halaman berpindah SENDIRI ke Beranda",
      "Buka ulang aplikasi saat masih menunggu? Langsung diantar kembali ke halaman tunggu, bukan halaman masuk",
      "FIX: status pendaftar tidak lagi bisa salah tampil \"ditolak\" saat pengurus menyetujui di waktu bersamaan",
    ],
  },
  {
    versi: "1.19.0",
    tanggal: "28 Agustus 2026",
    judul: "Masuk dengan Google & modul Dashboard baru",
    poin: [
      "Masuk dengan Google — sekali klik, tanpa mengetik sandi; belum terdaftar pun akunmu dibuat otomatis",
      "Profil: hubungkan akun Google-mu dari menu Keamanan",
      "Profil: nama lengkap kini bisa diedit sendiri (ikon pensil di samping nama)",
      "Modul DASHBOARD baru — pantauan absensi, KPI anggota (2 tab + 4 grafik + detail per orang), kepatuhan komen, analitik TV Rakyat (video populer 🏆 + aktivitas live), & kelengkapan data anggota",
      "Master mengatur siapa boleh melihat dashboard apa (Kelola Akses Dashboard)",
      "Profil tampil baru: hero merah dengan lonceng notifikasi dropdown di tempat",
      "Konten, Pengumuman, Kerja Hari Ini & Wajib Komentar kini rapi di Beranda sebagai seksi lipat",
      "Tampilan desktop modul TV Rakyat diperlebar & dirapikan",
    ],
  },
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
